-- ============================================================================
-- 35a_notifiche_server.sql — notifiche chiuse, parte additiva (spec 2026-10-08, Task 1).
-- Compatibile con l'app vecchia: aggiunge colonne, due tabelle private e funzioni nuove,
-- non tocca privilegi né policy di `notifications` (li chiude la 35b, dopo il deploy dell'app).
-- Idempotente: si può rilanciare senza errori. Ritorno: 35a_ritorno.sql.
-- Richiede la 32a (telepatia_verifica_identita, nome_pubblico, telepatia_bloccati).
-- ============================================================================
BEGIN;

-- ════ A. Colonne e tabelle nuove ════════════════════════════════════════════
-- Su notifications solo dati che non sono credenziali: il nome di chi la manda e l'oggetto.
-- I session_id (per un ospite sono l'unica credenziale) NON stanno in notifications, che fino
-- alla 35b resta leggibile da chiunque: stanno in notifiche_instradamento, privata da subito.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_nickname      text,
  ADD COLUMN IF NOT EXISTS oggetto              text;  -- id del rituale/post (serve solo all'anti-raffica di notify_event)

CREATE INDEX IF NOT EXISTS notifications_nickname_non_lette
  ON public.notifications (user_nickname) WHERE read = false;

-- A quale telefono va una notifica e da quale telefono viene: al massimo una riga per notifica;
-- le notifiche vecchie, solo per nickname, non ne hanno. RLS accesa, nessuna policy, nessun
-- privilegio all'app: la leggono e la scrivono solo le funzioni SECURITY DEFINER di questo file.
CREATE TABLE IF NOT EXISTS public.notifiche_instradamento (
  notifica_id          uuid PRIMARY KEY REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_session_id text,
  sender_session_id    text
);
ALTER TABLE public.notifiche_instradamento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifiche_instradamento FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS notifiche_instradamento_destinatario
  ON public.notifiche_instradamento (recipient_session_id);

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
-- Colonne elencate una per una (non notifications.*): nessun session_id esce, nemmeno per errore
-- se un domani la tabella cresce. Il DROP serve perché il tipo di ritorno è cambiato.
DROP FUNCTION IF EXISTS public.get_my_notifications(text, text, text);
CREATE FUNCTION public.get_my_notifications(p_session_id text, p_password_hash text, p_nickname text)
RETURNS TABLE(id uuid, user_nickname text, type text, message text, read boolean, created_at timestamptz, sender_nickname text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_nome text; v_iscritto boolean;
BEGIN
  v_nome := notifica_chi_sono(p_session_id, p_password_hash, p_nickname);
  v_iscritto := EXISTS (SELECT 1 FROM profiles pr WHERE pr.session_id = p_session_id);
  RETURN QUERY
    SELECT n.id, n.user_nickname, n.type, n.message, n.read, n.created_at, n.sender_nickname
      FROM notifications n
      LEFT JOIN notifiche_instradamento r ON r.notifica_id = n.id
     WHERE n.read = false
       AND (r.recipient_session_id = p_session_id
            OR (v_iscritto AND r.recipient_session_id IS NULL AND n.user_nickname = v_nome))
       AND NOT notifica_bloccata(p_session_id, v_nome, r.sender_session_id, n.sender_nickname)
     ORDER BY n.created_at DESC
     LIMIT 100;
END $$;

CREATE OR REPLACE FUNCTION public.mark_my_notification_read(p_id uuid, p_session_id text, p_password_hash text, p_nickname text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nome text; v_iscritto boolean; v_dest text;
BEGIN
  v_nome := notifica_chi_sono(p_session_id, p_password_hash, p_nickname);
  v_iscritto := EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id);
  SELECT r.recipient_session_id INTO v_dest FROM notifiche_instradamento r WHERE r.notifica_id = p_id;
  UPDATE notifications n SET read = true
   WHERE n.id = p_id
     AND (v_dest = p_session_id
          OR (v_iscritto AND v_dest IS NULL AND n.user_nickname = v_nome));
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
  v_nid       uuid;
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
  IF EXISTS (SELECT 1 FROM notifications n JOIN notifiche_instradamento r ON r.notifica_id = n.id
              WHERE n.type = p_tipo AND n.oggetto = v_ogg AND r.recipient_session_id = v_dest_sid
                AND n.created_at > now() - interval '10 minutes'
                AND (n.sender_nickname = v_nome OR r.sender_session_id = p_session_id))
     OR (SELECT count(*) FROM notifications n JOIN notifiche_instradamento r ON r.notifica_id = n.id
          WHERE n.type = p_tipo AND n.oggetto = v_ogg AND r.recipient_session_id = v_dest_sid
            AND n.created_at > now() - interval '10 minutes') >= 3 THEN
    RETURN jsonb_build_object('ok', true, 'inviata', false, 'motivo', 'gia_inviata');
  END IF;

  INSERT INTO notifications (user_nickname, sender_nickname, type, message, oggetto)
  VALUES (v_dest_nick, v_nome, p_tipo, v_msg, v_ogg)
  RETURNING id INTO v_nid;
  INSERT INTO notifiche_instradamento (notifica_id, recipient_session_id, sender_session_id)
  VALUES (v_nid, v_dest_sid, p_session_id);
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

-- ════ D. Scrittori esistenti: riempiono mittente e destinatario ═════════════
-- Ridefinite dalla versione applicata sul DB (docs/superpowers/plans/catalogo-notifiche-35.txt),
-- cambiando solo le righe marcate «NUOVO (35)». Firme e risultati identici. Ritorno: 35a_ritorno.
-- I session_id vanno in notifiche_instradamento, mai in notifications. Per un messaggio privato
-- il telefono del destinatario viene dal suo profilo: se non ce l'ha, recipient_session_id resta
-- null e la notifica si legge solo come riga «per nickname», cioè solo da un profilo registrato
-- con quel nickname.

CREATE OR REPLACE FUNCTION public.send_private_message(p_sender_id text, p_sender_name text, p_receiver_name text, p_content text, p_sender_password_hash text)
 RETURNS private_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_msg private_messages%ROWTYPE;
  v_clean_content text;
  v_mitt_sid text; v_dest_sid text; v_nid uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE nickname = p_sender_name AND password_hash = p_sender_password_hash
  ) THEN
    RAISE EXCEPTION 'Sender auth failed';
  END IF;

  v_clean_content := btrim(p_content);
  IF v_clean_content IS NULL OR v_clean_content = '' THEN RAISE EXCEPTION 'Empty content'; END IF;
  IF p_receiver_name IS NULL OR p_receiver_name = '' THEN RAISE EXCEPTION 'Empty receiver_name'; END IF;
  IF length(v_clean_content) > 2000 THEN RAISE EXCEPTION 'Content too long'; END IF;

  -- SP1: blocco in entrambe le direzioni. Chi e' stato bloccato non raggiunge
  -- chi lo ha bloccato; e chi ha bloccato non scrive a chi ha bloccato.
  IF EXISTS (
    SELECT 1 FROM user_blocks
     WHERE (blocker_nickname = p_receiver_name AND blocked_nickname = p_sender_name)
        OR (blocker_nickname = p_sender_name   AND blocked_nickname = p_receiver_name)
  ) THEN
    RAISE EXCEPTION 'Blocked by recipient';
  END IF;

  -- Rate-limit (B9): max 20 messaggi per sender_name (autenticato) nell'ultimo minuto.
  IF p_sender_name IS NOT NULL AND (
       SELECT count(*) FROM private_messages
        WHERE sender_name = p_sender_name
          AND created_at > now() - interval '1 minute'
     ) >= 20 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO private_messages (sender_id, sender_name, receiver_name, content, is_read)
  VALUES (p_sender_id, p_sender_name, p_receiver_name, v_clean_content, false)
  RETURNING * INTO v_msg;

  -- NUOVO (35): la notifica porta il nome del mittente; i telefoni vanno in notifiche_instradamento.
  -- Il telefono del destinatario viene dal suo profilo (null se non esiste: la notifica la legge
  -- solo un profilo registrato con quel nickname); quello del mittente dal profilo già
  -- autenticato, non dal parametro.
  SELECT session_id INTO v_mitt_sid FROM profiles WHERE nickname = p_sender_name;
  SELECT session_id INTO v_dest_sid FROM profiles WHERE nickname = p_receiver_name;
  INSERT INTO notifications (user_nickname, sender_nickname, type, message)
  VALUES (p_receiver_name, p_sender_name, 'private_message', p_sender_name || ' ti ha inviato un messaggio privato')
  RETURNING id INTO v_nid;
  INSERT INTO notifiche_instradamento (notifica_id, recipient_session_id, sender_session_id)
  VALUES (v_nid, v_dest_sid, v_mitt_sid);

  RETURN v_msg;
END $function$;

CREATE OR REPLACE FUNCTION public.send_telepathy_invite(p_session_id text, p_password_hash text, p_nickname text, p_disponibilita_id uuid DEFAULT NULL::uuid, p_session_online text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me text; v_sid text; v_nome text; v_online boolean;
  v_con_push boolean := false; v_saltata boolean := false;
  v_id uuid; v_creato timestamptz; v_scade timestamptz; v_vincolo text;
  v_nid uuid;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  IF (p_disponibilita_id IS NULL) = (p_session_online IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  SELECT o_sid, o_nome INTO v_sid, v_nome FROM telepatia_risolvi(p_disponibilita_id, p_session_online);
  IF v_sid IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_disponibile'); END IF;
  IF v_sid = p_session_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi'); END IF;
  v_me := nome_pubblico(p_session_id, p_nickname);
  IF telepatia_in_training(p_session_id) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'in_match'); END IF;
  -- Non disponibile, bloccato nei due sensi, già in un training: stesso motivo per tutti e tre,
  -- per non rivelare il blocco.
  IF NOT telepatia_disponibile(v_sid) OR telepatia_bloccati(p_session_id, v_me, v_sid, v_nome) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'non_disponibile');
  END IF;
  -- now() non può stare nel predicato degli indici unici: prima si chiudono gli scaduti delle
  -- due persone, poi si guarda chi ha ancora un invito aperto.
  UPDATE telepathy_invites SET status = 'expired', responded_at = now()
   WHERE status = 'pending' AND expires_at <= now()
     AND (from_id IN (p_session_id, v_sid) OR to_id IN (p_session_id, v_sid));
  IF EXISTS (SELECT 1 FROM telepathy_invites WHERE from_id = p_session_id AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invito_in_corso');
  END IF;
  IF EXISTS (SELECT 1 FROM telepathy_invites WHERE to_id = v_sid AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'gia_invitato');
  END IF;
  IF (SELECT count(*) FROM telepathy_invites
       WHERE from_id = p_session_id AND created_at > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'troppi_inviti');
  END IF;

  v_online := telepatia_online(v_sid);
  v_scade := now() + CASE WHEN v_online THEN interval '45 seconds' ELSE interval '10 minutes' END;
  -- La push solo a chi ha acceso l'interruttore (secondo giro): chi è online senza riga riceve
  -- solo l'avviso dentro l'app, e non conta nel tetto.
  IF EXISTS (SELECT 1 FROM telepathy_availability WHERE session_id = v_sid) THEN
    v_saltata := (SELECT count(*) FROM telepathy_invites
                   WHERE to_id = v_sid AND con_push AND created_at > now() - interval '1 hour') >= 6
              OR EXISTS (SELECT 1 FROM telepathy_invites
                          WHERE from_id = p_session_id AND to_id = v_sid AND con_push
                            AND created_at > now() - interval '15 minutes');
    v_con_push := NOT v_saltata;
  END IF;

  BEGIN
    INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, expires_at, con_push, push_saltata)
    VALUES (p_session_id, v_me, v_sid, v_nome, 'pending', v_scade, v_con_push, v_saltata)
    RETURNING id, created_at INTO v_id, v_creato;
  EXCEPTION WHEN unique_violation THEN
    -- Due invii nello stesso istante: vince il primo. Il motivo dipende dall'indice urtato.
    GET STACKED DIAGNOSTICS v_vincolo = CONSTRAINT_NAME;
    RETURN jsonb_build_object('ok', false, 'motivo',
      CASE WHEN v_vincolo = 'telepathy_invites_un_pending_mittente' THEN 'invito_in_corso' ELSE 'gia_invitato' END);
  END;

  -- NUOVO (35): nome del mittente nella notifica, telefoni in notifiche_instradamento.
  INSERT INTO notifications (user_nickname, sender_nickname, type, message)
  VALUES (v_nome, v_me, 'telepathy_invite', v_me || ' ti ha invitato a un training telepatico')
  RETURNING id INTO v_nid;
  INSERT INTO notifiche_instradamento (notifica_id, recipient_session_id, sender_session_id)
  VALUES (v_nid, v_sid, p_session_id);
  -- Solo adesso, a insert riuscito: la richiesta parte al commit.
  IF v_con_push THEN
    PERFORM telepatia_chiama_motore(jsonb_build_object('invito', v_id, 'tipo', 'invito'));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_scade, 'created_at', v_creato,
                            'push_saltata', v_saltata, 'adesso', now());
END $function$;

CREATE OR REPLACE FUNCTION public.respond_telepathy_invite(p_invite_id uuid, p_session_id text, p_password_hash text, p_accept boolean, p_match_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v telepathy_invites%ROWTYPE; v_stato text; v_nid uuid;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  IF p_invite_id IS NULL OR p_accept IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi'); END IF;
  SELECT * INTO v FROM telepathy_invites WHERE id = p_invite_id AND to_id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato'); END IF;
  IF v.status = 'pending' AND v.expires_at <= now() THEN
    UPDATE telepathy_invites SET status = 'expired', responded_at = now() WHERE id = v.id AND status = 'pending';
    v.status := 'expired';
  END IF;
  IF v.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', telepatia_motivo_stato(v.status));
  END IF;

  IF p_accept THEN
    IF p_match_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM telepathy_matches m
          WHERE m.id = p_match_id AND m.ended_at IS NULL AND m.user1_id = v.from_id AND m.user2_id = v.to_id) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'match_non_valido');
    END IF;
    -- Nessuno si ritrova in due sessioni.
    IF telepatia_in_training(p_session_id, p_match_id) OR telepatia_in_training(v.from_id, p_match_id) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'in_match');
    END IF;
    UPDATE telepathy_invites SET status = 'accepted', match_id = p_match_id, responded_at = now()
     WHERE id = v.id AND status = 'pending' AND expires_at > now();
    IF NOT FOUND THEN
      -- Un altro telefono ha risposto un istante prima, o la scadenza è arrivata adesso.
      SELECT status INTO v_stato FROM telepathy_invites WHERE id = v.id;
      RETURN jsonb_build_object('ok', false, 'motivo', telepatia_motivo_stato(coalesce(v_stato, 'expired')));
    END IF;
    -- Chi sta per giocare non può restare invitante di qualcun altro.
    UPDATE telepathy_invites SET status = 'cancelled', responded_at = now()
     WHERE from_id = p_session_id AND status = 'pending';
    -- Anche per gli inviti da 45 s: chi ha invitato può aver posato il telefono.
    PERFORM telepatia_chiama_motore(jsonb_build_object('invito', v.id, 'tipo', 'accettato'));
    v_stato := 'accepted';
  ELSE
    UPDATE telepathy_invites SET status = 'declined', responded_at = now()
     WHERE id = v.id AND status = 'pending' AND expires_at > now();
    IF NOT FOUND THEN
      SELECT status INTO v_stato FROM telepathy_invites WHERE id = v.id;
      RETURN jsonb_build_object('ok', false, 'motivo', telepatia_motivo_stato(coalesce(v_stato, 'expired')));
    END IF;
    -- NUOVO (35): se fra i due c'è un blocco, in un senso o nell'altro, chi ha invitato non
    -- riceve nulla; il rifiuto va comunque a buon fine.
    IF NOT notifica_bloccata(v.from_id, v.from_name, p_session_id, v.to_name) THEN
      INSERT INTO notifications (user_nickname, sender_nickname, type, message)
      VALUES (v.from_name, v.to_name, 'telepathy_declined',
              v.to_name || ' ha rifiutato il tuo invito al training telepatico')
      RETURNING id INTO v_nid;
      INSERT INTO notifiche_instradamento (notifica_id, recipient_session_id, sender_session_id)
      VALUES (v_nid, v.from_id, p_session_id);
    END IF;
    -- Per un invito da 45 s chi ha invitato è online e lo vede nell'app.
    IF telepatia_era_da_dieci(v.created_at, v.expires_at) THEN
      PERFORM telepatia_chiama_motore(jsonb_build_object('invito', v.id, 'tipo', 'rifiutato'));
    END IF;
    v_stato := 'declined';
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_stato, 'responded_at', now(), 'adesso', now());
END $function$;

CREATE OR REPLACE FUNCTION public.delete_my_account(p_nickname text, p_password_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_sid   text;
BEGIN
  SELECT email, session_id INTO v_email, v_sid
    FROM profiles
   WHERE nickname = p_nickname AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  -- (a) Anonimizza i contenuti pubblici (preserva i thread altrui)
  UPDATE consciousness_posts    SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE consciousness_comments SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE ritual_comments        SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE rituals                SET creator         = 'Utente eliminato' WHERE creator = p_nickname;
  -- chat_messages NON esiste piu' (droppata da 08_drop_dead_tables.sql): vedi 17_.

  -- (b) Cancella i dati personali/privati
  DELETE FROM private_messages WHERE sender_name = p_nickname OR receiver_name = p_nickname;
  DELETE FROM notifications    WHERE user_nickname = p_nickname;
  -- NUOVO (35): anche quelle che HO MANDATO col mio nome, non solo anonimizzate: altrimenti a
  -- chi mi aveva bloccato ricomparirebbero quelle che il blocco nascondeva.
  DELETE FROM notifications    WHERE sender_nickname = p_nickname;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM telepathy_scores WHERE user_id = v_email;
    DELETE FROM magic_links      WHERE email   = v_email;
    DELETE FROM password_resets  WHERE email   = v_email;
  END IF;

  IF v_sid IS NOT NULL AND v_sid <> '' THEN
    DELETE FROM online_users      WHERE id = v_sid;
    DELETE FROM telepathy_queue   WHERE id = v_sid;
    DELETE FROM telepathy_invites WHERE from_id = v_sid OR to_id = v_sid;

    -- NUOVO (22): abbonamenti alle notifiche push. Un endpoint push e' un canale aperto verso
    -- un telefono: lasciarlo vivo dopo la cancellazione significa continuare a scrivere a
    -- qualcuno che ha chiesto di sparire.
    DELETE FROM push_subscriptions WHERE session_id = v_sid;

    -- NUOVO (35): le notifiche destinate al mio telefono (anche quelle con un altro nickname),
    -- quelle mandate dal mio telefono e il registro privato di chi ha scritto quali post.
    -- Le righe di notifiche_instradamento se ne vanno a cascata.
    DELETE FROM notifications
     WHERE id IN (SELECT r.notifica_id FROM notifiche_instradamento r
                   WHERE r.recipient_session_id = v_sid OR r.sender_session_id = v_sid);
    DELETE FROM consciousness_post_autori WHERE session_id = v_sid;

    -- NUOVO (30): le sue candele e il nome accanto, in ogni rituale.
    UPDATE rituals
       SET candles      = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                                     WHERE e <> to_jsonb(v_sid)), '[]'::jsonb),
           candles_nomi = candles_nomi - v_sid
     WHERE candles @> to_jsonb(array[v_sid]) OR candles_nomi ? v_sid;

    -- NUOVO (31): la sua partecipazione (participants, array di session_id come candles) e le
    -- sue presenze nelle stanze. Gli altri partecipanti restano, nello stesso ordine.
    UPDATE rituals
       SET participants = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(participants) e
                                     WHERE e <> to_jsonb(v_sid)), '[]'::jsonb)
     WHERE participants @> to_jsonb(array[v_sid]);
    DELETE FROM ritual_presence WHERE session_id = v_sid;

    -- NUOVO (32): la disponibilità agli inviti e i «Non voglio più inviti» impostati da me.
    -- Quelli subiti restano, come per user_blocks (18_): cancellare l'account non deve diventare
    -- un modo per farsi sbloccare. Gli inviti li cancella già la riga più sopra (dalla 06_), e
    -- con loro, a cascata, telepathy_invite_pushes.
    DELETE FROM telepathy_availability  WHERE session_id = v_sid;
    DELETE FROM telepathy_invite_blocks WHERE blocker_session = v_sid;
  END IF;

  -- (c) SP1: se ne vanno solo i blocchi che ho impostato io. Quelli subiti
  -- restano, altrimenti cancellare l'account diventa un modo per farsi
  -- sbloccare da chi ci ha bloccati.
  DELETE FROM user_blocks WHERE blocker_nickname = p_nickname;
  UPDATE content_reports SET reporter_nickname = 'Utente eliminato' WHERE reporter_nickname = p_nickname;

  -- (d) Cancella l'identita'
  DELETE FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash;
END $function$;

CREATE OR REPLACE FUNCTION public.export_my_account(p_nickname text, p_password_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email  text;
  v_sid    text;
  v_result jsonb;
BEGIN
  SELECT email, session_id INTO v_email, v_sid
    FROM profiles
   WHERE nickname = p_nickname AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'profile', (SELECT to_jsonb(p) - 'password_hash'
                  FROM profiles p WHERE p.nickname = p_nickname),
    'private_messages', coalesce((SELECT jsonb_agg(to_jsonb(m))
                  FROM private_messages m
                 WHERE m.sender_name = p_nickname OR m.receiver_name = p_nickname), '[]'::jsonb),
    'consciousness_posts', coalesce((SELECT jsonb_agg(to_jsonb(c))
                  FROM consciousness_posts c WHERE c.author_nickname = p_nickname), '[]'::jsonb),
    'consciousness_comments', coalesce((SELECT jsonb_agg(to_jsonb(c))
                  FROM consciousness_comments c WHERE c.author_nickname = p_nickname), '[]'::jsonb),
    'ritual_comments', coalesce((SELECT jsonb_agg(to_jsonb(rc))
                  FROM ritual_comments rc WHERE rc.author_nickname = p_nickname), '[]'::jsonb),
    'rituals_created', coalesce((SELECT jsonb_agg(to_jsonb(r))
                  FROM rituals r WHERE r.creator = p_nickname OR r.creator_id = v_sid), '[]'::jsonb),
    'telepathy_scores', coalesce((SELECT jsonb_agg(to_jsonb(ts))
                  FROM telepathy_scores ts WHERE ts.user_id = v_email), '[]'::jsonb),
    'notifications', coalesce((SELECT jsonb_agg(to_jsonb(n))
                  FROM notifications n
                 WHERE n.user_nickname = p_nickname
                    OR n.id IN (SELECT r.notifica_id FROM notifiche_instradamento r
                                 WHERE r.recipient_session_id = v_sid)), '[]'::jsonb),
    -- NUOVO (24): abbonamenti alle notifiche push.
    'push_subscriptions', coalesce((SELECT jsonb_agg(to_jsonb(ps))
                  FROM push_subscriptions ps WHERE ps.session_id = v_sid), '[]'::jsonb),
    -- NUOVO (32): inviti (mandati e ricevuti), disponibilità, blocchi impostati da me.
    'telepathy_invites', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'ruolo', CASE WHEN i.from_id = v_sid THEN 'mittente' ELSE 'destinatario' END,
                    'altra_persona', CASE WHEN i.from_id = v_sid THEN i.to_name ELSE i.from_name END,
                    'status', i.status, 'created_at', i.created_at,
                    'expires_at', i.expires_at, 'responded_at', i.responded_at))
                  FROM telepathy_invites i WHERE i.from_id = v_sid OR i.to_id = v_sid), '[]'::jsonb),
    'telepathy_availability', (SELECT jsonb_build_object('nickname', a.nickname, 'enabled_at', a.enabled_at,
                                                         'rinnovata_il', a.rinnovata_il)
                  FROM telepathy_availability a WHERE a.session_id = v_sid),
    'telepathy_invite_blocks', coalesce((SELECT jsonb_agg(jsonb_build_object('created_at', b.created_at))
                  FROM telepathy_invite_blocks b WHERE b.blocker_session = v_sid), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
