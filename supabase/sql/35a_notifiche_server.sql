-- ============================================================================
-- 35a_notifiche_server.sql — notifiche chiuse, parte additiva (spec 2026-10-08, Task 1).
-- Compatibile con l'app vecchia: aggiunge colonne, una tabella privata e funzioni nuove,
-- non tocca privilegi né policy di `notifications` (li chiude la 35b, dopo il deploy dell'app).
-- Idempotente: si può rilanciare senza errori. Ritorno: 35a_ritorno.sql.
-- Richiede la 32a (telepatia_verifica_identita, nome_pubblico, telepatia_bloccati).
-- ============================================================================
BEGIN;

-- ════ A. Colonne e tabella nuove ═════════════════════════════════════════════
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_session_id text,
  ADD COLUMN IF NOT EXISTS sender_session_id    text,
  ADD COLUMN IF NOT EXISTS sender_nickname      text;

CREATE INDEX IF NOT EXISTS notifications_recipient_non_lette
  ON public.notifications (recipient_session_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS notifications_nickname_non_lette
  ON public.notifications (user_nickname) WHERE read = false;

-- A quale telefono notificare i commenti ai post degli ospiti. Privata: il session_id non deve
-- stare in una tabella leggibile (consciousness_posts lo è).
CREATE TABLE IF NOT EXISTS public.consciousness_post_autori (
  post_id    uuid        PRIMARY KEY REFERENCES public.consciousness_posts(id) ON DELETE CASCADE,
  session_id text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consciousness_post_autori ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consciousness_post_autori FROM PUBLIC, anon, authenticated;

-- ════ B. Funzioni interne ════════════════════════════════════════════════════
-- Il nickname effettivo del chiamante. Registrato (c'è un profilo con quel session_id): serve
-- l'hash giusto e il nome è quello del profilo, mai quello passato. Ospite: il session_id è
-- l'unica prova (rischio accettato, 32a §6) e il nome è nome_pubblico(sid, nick).
CREATE OR REPLACE FUNCTION public.notifica_chi_sono(p_session_id text, p_password_hash text, p_nickname text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  IF EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id)
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND password_hash = p_password_hash) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;
  RETURN nome_pubblico(p_session_id, p_nickname);
END $$;

-- «C'è un blocco fra i due», nei due sensi. Null-safe: un lato sconosciuto non blocca nessuno.
CREATE OR REPLACE FUNCTION public.notifica_bloccata(sid_a text, nick_a text, sid_b text, nick_b text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(telepatia_bloccati(sid_a, nick_a, sid_b, nick_b), false);
$$;

REVOKE ALL ON FUNCTION public.notifica_chi_sono(text, text, text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notifica_bloccata(text, text, text, text)    FROM PUBLIC, anon, authenticated;

-- ════ C. Lettura e «segna letta» ═════════════════════════════════════════════
-- Le non lette del chiamante: quelle per il suo telefono e, solo per i registrati, quelle
-- vecchie per nickname (senza telefono). Quelle di un mittente bloccato (in un senso o
-- nell'altro) sono escluse, non cancellate: uno sblocco le fa ricomparire.
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_session_id text, p_password_hash text, p_nickname text)
RETURNS SETOF public.notifications LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nome text; v_iscritto boolean;
BEGIN
  v_nome := notifica_chi_sono(p_session_id, p_password_hash, p_nickname);
  v_iscritto := EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id);
  RETURN QUERY
    SELECT n.* FROM notifications n
     WHERE n.read = false
       AND (n.recipient_session_id = p_session_id
            OR (v_iscritto AND n.recipient_session_id IS NULL AND n.user_nickname = v_nome))
       AND NOT notifica_bloccata(p_session_id, v_nome, n.sender_session_id, n.sender_nickname)
     ORDER BY n.created_at DESC
     LIMIT 100;
END $$;

CREATE OR REPLACE FUNCTION public.mark_my_notification_read(p_id uuid, p_session_id text, p_password_hash text, p_nickname text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nome text; v_iscritto boolean;
BEGIN
  v_nome := notifica_chi_sono(p_session_id, p_password_hash, p_nickname);
  v_iscritto := EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id);
  UPDATE notifications n SET read = true
   WHERE n.id = p_id
     AND (n.recipient_session_id = p_session_id
          OR (v_iscritto AND n.recipient_session_id IS NULL AND n.user_nickname = v_nome));
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.get_my_notifications(text, text, text)               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_my_notification_read(uuid, text, text, text)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(text, text, text)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_my_notification_read(uuid, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
