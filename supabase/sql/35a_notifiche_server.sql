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
  ADD COLUMN IF NOT EXISTS sender_nickname      text,
  ADD COLUMN IF NOT EXISTS oggetto              text;  -- id del rituale/post (serve solo all'anti-raffica di notify_event)

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
-- Il nickname effettivo del chiamante. Registrato (c'è un profilo con quel session_id): vale la
-- regola di telepatia_verifica_identita (32a) e il nome è quello del profilo, mai quello passato. Ospite: il session_id è
-- l'unica prova (rischio accettato, 32a §6) e il nome è nome_pubblico(sid, nick).
CREATE OR REPLACE FUNCTION public.notifica_chi_sono(p_session_id text, p_password_hash text, p_nickname text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- La regola di identità è quella della 32a, senza varianti: l'hash serve solo ai profili con email.
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
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

-- ════ D. Creazione da fatto verificato ═══════════════════════════════════════
-- Il server trova il destinatario, controlla il fatto e scrive il testo. L'app non decide nulla.
-- p_oggetto è text (non uuid): i rituali hanno id bigint, i post uuid. Un valore che non è un id
-- valido per quel tipo vale «non_trovato».
CREATE OR REPLACE FUNCTION public.notify_event(p_session_id text, p_password_hash text, p_nickname text, p_tipo text, p_oggetto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_nome      text;
  v_dest_sid  text;
  v_dest_nick text;
  v_ogg       text;
  v_ritual    rituals%ROWTYPE;
  v_post      consciousness_posts%ROWTYPE;
  v_fatto     boolean;
  v_msg       text;
BEGIN
  v_nome := notifica_chi_sono(p_session_id, p_password_hash, p_nickname);

  IF p_tipo IS NULL OR p_tipo NOT IN ('ritual_join', 'ritual_comment', 'comment') THEN
    RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'tipo_sconosciuto');
  END IF;

  -- Oggetto e destinatario.
  IF p_tipo IN ('ritual_join', 'ritual_comment') THEN
    BEGIN
      SELECT * INTO v_ritual FROM rituals WHERE id = p_oggetto::bigint;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      v_ritual := NULL;
    END;
    IF v_ritual.id IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'non_trovato');
    END IF;
    v_ogg := v_ritual.id::text;
    v_dest_sid := v_ritual.creator_id;
    v_dest_nick := v_ritual.creator;
  ELSE
    BEGIN
      SELECT * INTO v_post FROM consciousness_posts WHERE id = p_oggetto::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_post := NULL;
    END;
    IF v_post.id IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'non_trovato');
    END IF;
    v_ogg := v_post.id::text;
    v_dest_nick := v_post.author_nickname;
    SELECT a.session_id INTO v_dest_sid FROM consciousness_post_autori a WHERE a.post_id = v_post.id;
    IF v_dest_sid IS NULL THEN
      SELECT p.session_id INTO v_dest_sid FROM profiles p WHERE lower(btrim(p.nickname)) = lower(btrim(v_post.author_nickname));
    END IF;
    IF v_dest_sid IS NULL THEN  -- post di un ospite di cui non sappiamo il telefono
      RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'non_trovato');
    END IF;
  END IF;

  -- Il fatto.
  IF p_tipo = 'ritual_join' THEN
    v_fatto := v_ritual.participants @> jsonb_build_array(p_session_id);
    v_msg := v_nome || ' si è unito/a al tuo rituale "' || v_ritual.name || '"';
  ELSIF p_tipo = 'ritual_comment' THEN
    v_fatto := EXISTS (SELECT 1 FROM ritual_comments c WHERE c.ritual_id = v_ritual.id
                         AND c.author_nickname = v_nome AND c.created_at > now() - interval '10 minutes');
    v_msg := v_nome || ' ha commentato il tuo rituale "' || v_ritual.name || '"';
  ELSE
    v_fatto := EXISTS (SELECT 1 FROM consciousness_comments c WHERE c.post_id = v_post.id
                         AND c.author_nickname = v_nome AND c.created_at > now() - interval '10 minutes');
    v_msg := v_nome || ' ha commentato il tuo post';
  END IF;
  IF NOT coalesce(v_fatto, false) THEN
    RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'fatto_non_verificato');
  END IF;

  IF v_dest_sid = p_session_id OR v_dest_nick = v_nome THEN
    RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'a_me_stesso');
  END IF;
  IF notifica_bloccata(p_session_id, v_nome, v_dest_sid, v_dest_nick) THEN  -- il blocco non si rivela: motivo generico
    RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'non_inviata');
  END IF;

  -- Anti-raffica, sulla chiave tipo + oggetto + destinatario (il lock serializza le chiamate in corsa):
  --  a) identica: stesso mittente (stesso nickname effettivo OPPURE stesso session_id, così cambiare
  --     session_id non aggira il limite) entro 10 minuti;
  --  b) tetto: al massimo 3 notifiche in 10 minuti per destinatario + tipo + oggetto, da chiunque.
  PERFORM pg_advisory_xact_lock(hashtext('notify_event:' || p_tipo || ':' || v_ogg || ':' || v_dest_sid));
  IF EXISTS (SELECT 1 FROM notifications n
              WHERE n.type = p_tipo AND n.oggetto = v_ogg AND n.recipient_session_id = v_dest_sid
                AND n.created_at > now() - interval '10 minutes'
                AND (n.sender_nickname = v_nome OR n.sender_session_id = p_session_id))
     OR (SELECT count(*) FROM notifications n
          WHERE n.type = p_tipo AND n.oggetto = v_ogg AND n.recipient_session_id = v_dest_sid
            AND n.created_at > now() - interval '10 minutes') >= 3 THEN
    RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'gia_inviata');
  END IF;

  INSERT INTO notifications (user_nickname, recipient_session_id, sender_session_id, sender_nickname, type, message, oggetto)
  VALUES (v_dest_nick, v_dest_sid, p_session_id, v_nome, p_tipo, v_msg, v_ogg);
  RETURN jsonb_build_object('ok', true, 'inviata', true, 'motivo', NULL);
END $$;

-- Chi è l'autore di un post: l'app lo dice subito dopo averlo scritto; il server controlla che il
-- post sia davvero del chiamante (nickname effettivo), recente (5 minuti) e senza autore già registrato.
CREATE OR REPLACE FUNCTION public.register_my_post(p_post_id uuid, p_session_id text, p_password_hash text, p_nickname text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nome text; v_righe integer;
BEGIN
  v_nome := notifica_chi_sono(p_session_id, p_password_hash, p_nickname);
  INSERT INTO consciousness_post_autori (post_id, session_id)
  SELECT p.id, p_session_id FROM consciousness_posts p
   WHERE p.id = p_post_id AND p.author_nickname = v_nome AND p.created_at > now() - interval '5 minutes'
  ON CONFLICT (post_id) DO NOTHING;
  GET DIAGNOSTICS v_righe = ROW_COUNT;
  RETURN v_righe > 0;
END $$;

REVOKE ALL ON FUNCTION public.notify_event(text, text, text, text, text)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_my_post(uuid, text, text, text)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_event(text, text, text, text, text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_my_post(uuid, text, text, text)     TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
