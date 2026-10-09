-- ============================================================================
-- 36a_ritorno.sql — ritorno indietro della 36a. SCRITTO E PROVATO IN LOCALE, NON APPLICATO.
-- Va lanciato solo PRIMA della 36b (dopo la 36b serve prima 36b_ritorno).
-- Cosa fa: toglie la vista rituali_pubblici e le funzioni nuove (id pubblico, presenze, coda),
-- rimette le sette funzioni ridefinite com'erano sul DB vero il 09/10 (testo del catalogo
-- docs/superpowers/plans/catalogo-chiavi-36.txt, con i privilegi della 32a; toggle_ritual_candle e
-- get_my_messages con quelli di oggi, che CREATE OR REPLACE conserva) e cancella il sale.
-- ⚠️ Cosa NON torna: le partite (telepathy_matches) scritte nel frattempo dall'app nuova con id
-- pubblici restano come sono; senza la 36a nessuno le riconosce più come proprie (si chiudono da
-- sole dopo 10 minuti senza attività). Rilanciare la 36a dopo il ritorno genera un sale nuovo:
-- gli id pubblici cambiano.
-- Ordine: prima la vista (dipende da id_pubblico), poi il ripristino delle funzioni, poi i drop.
-- Idempotente.
-- ============================================================================
BEGIN;

-- ── 1. Vista ────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.rituali_pubblici;

-- ── 2. Funzioni ridefinite dalla 36a: ripristino (testo del catalogo, così com'è) ──
CREATE OR REPLACE FUNCTION public.telepatia_risolvi(p_disponibilita_id uuid, p_session_online text, OUT o_sid text, OUT o_nome text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_disponibilita_id IS NOT NULL THEN
    SELECT a.session_id, nome_pubblico(a.session_id, a.nickname) INTO o_sid, o_nome
      FROM telepathy_availability a WHERE a.id = p_disponibilita_id;
  ELSIF p_session_online IS NOT NULL AND length(p_session_online) <= 255 AND telepatia_online(p_session_online) THEN
    SELECT u.id, nome_pubblico(u.id, u.nickname) INTO o_sid, o_nome
      FROM online_users u WHERE u.id = p_session_online ORDER BY u.last_seen::timestamptz DESC LIMIT 1;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.telepatia_risolvi(uuid, text)                    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.telepatia_in_training(p_session_id text, p_escludi uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM telepathy_matches m
     WHERE (m.user1_id = p_session_id OR m.user2_id = p_session_id)
       AND m.ended_at IS NULL
       AND m.ultima_attivita > now() - interval '10 minutes'
       AND (p_escludi IS NULL OR m.id <> p_escludi)
       AND (m.giocato OR EXISTS (SELECT 1 FROM telepathy_invites i WHERE i.match_id = m.id AND i.status = 'accepted')));
$function$;
REVOKE ALL ON FUNCTION public.telepatia_in_training(text, uuid)                FROM PUBLIC, anon, authenticated;

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
REVOKE ALL ON FUNCTION public.respond_telepathy_invite(uuid, text, text, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_telepathy_invite(uuid, text, text, boolean, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_telepathy_invites(p_session_id text, p_password_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_in jsonb; v_out jsonb;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  -- La risposta non mente anche se il cron è in ritardo.
  UPDATE telepathy_invites SET status = 'expired', responded_at = now()
   WHERE status = 'pending' AND expires_at <= now() AND (from_id = p_session_id OR to_id = p_session_id);
  SELECT jsonb_build_object('id', i.id, 'nome', i.from_name, 'from_id', i.from_id, 'status', i.status,
                            'expires_at', i.expires_at, 'created_at', i.created_at, 'responded_at', i.responded_at,
                            'match_id', i.match_id, 'push_saltata', i.push_saltata)
    INTO v_in
    FROM telepathy_invites i
   WHERE i.to_id = p_session_id AND i.status = 'pending' AND i.expires_at > now()
     AND NOT telepatia_bloccati(i.from_id, i.from_name, i.to_id, i.to_name)
   ORDER BY i.created_at DESC LIMIT 1;
  SELECT jsonb_build_object('id', o.id, 'nome', o.to_name, 'status', o.status, 'expires_at', o.expires_at,
                            'created_at', o.created_at, 'responded_at', o.responded_at, 'match_id', o.match_id,
                            'push_saltata', o.push_saltata)
    INTO v_out
    FROM telepathy_invites o
   WHERE o.from_id = p_session_id AND o.created_at > now() - interval '24 hours'
   ORDER BY o.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('ok', true, 'adesso', now(), 'in_arrivo', v_in, 'in_uscita', v_out);
END $function$;
REVOKE ALL ON FUNCTION public.get_my_telepathy_invites(text, text)                      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_telepathy_invites(text, text)                      TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_telepathy_invite(p_invite_id uuid, p_session_id text, p_password_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v telepathy_invites%ROWTYPE; v_ruolo text;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  SELECT * INTO v FROM telepathy_invites WHERE id = p_invite_id AND (from_id = p_session_id OR to_id = p_session_id);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato', 'adesso', now()); END IF;
  v_ruolo := CASE WHEN v.to_id = p_session_id THEN 'destinatario' ELSE 'mittente' END;
  IF v_ruolo = 'destinatario' AND telepatia_bloccati(v.from_id, v.from_name, v.to_id, v.to_name) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato', 'adesso', now());
  END IF;
  IF v.status = 'pending' AND v.expires_at <= now() THEN
    UPDATE telepathy_invites SET status = 'expired', responded_at = now() WHERE id = v.id AND status = 'pending';
    v.status := 'expired';
  END IF;
  RETURN jsonb_build_object('ok', true, 'adesso', now(), 'invito', jsonb_build_object(
    'id', v.id, 'ruolo', v_ruolo,
    'nome', CASE WHEN v_ruolo = 'destinatario' THEN v.from_name ELSE v.to_name END,
    'status', v.status, 'expires_at', v.expires_at, 'created_at', v.created_at,
    'responded_at', v.responded_at, 'match_id', v.match_id, 'push_saltata', v.push_saltata,
    'match_attivo', EXISTS (SELECT 1 FROM telepathy_matches m WHERE m.id = v.match_id AND m.ended_at IS NULL),
    'from_id', CASE WHEN v_ruolo = 'destinatario' AND v.status = 'pending' THEN v.from_id END));
END $function$;
REVOKE ALL ON FUNCTION public.get_telepathy_invite(uuid, text, text)                    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_telepathy_invite(uuid, text, text)                    TO anon, authenticated;

-- toggle_ritual_candle: testo del catalogo (identico alla 30_), privilegi conservati.
CREATE OR REPLACE FUNCTION public.toggle_ritual_candle(p_ritual_id bigint, p_session_id text, p_nickname text DEFAULT NULL::text, p_password_hash text DEFAULT NULL::text)
 RETURNS SETOF rituals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v rituals%ROWTYPE; v_occ timestamptz; v_nome text; v_candles jsonb; v_accende boolean;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN RAISE EXCEPTION 'session_required'; END IF;
  IF length(p_session_id) > 255 THEN RAISE EXCEPTION 'session_id_too_long'; END IF;
  -- FOR UPDATE: due accensioni insieme non superano il tetto e non si perdono a vicenda.
  SELECT * INTO v FROM rituals WHERE id = p_ritual_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ritual_not_found'; END IF;
  v_occ := rituale_occorrenza_corrente(v);
  -- Stessa finestra della stanza e delle presenze: condizione identica, carattere per carattere, a
  -- quella di segna_presenza_rituale (28_), anche con duration NULL (lì non scatta not_live).
  IF v_occ IS NULL OR now() < v_occ OR now() >= v_occ + make_interval(mins => v.duration) THEN
    RAISE EXCEPTION 'not_live';
  END IF;
  -- Registrato: stesso cancello di leave_ritual. Senza la sua credenziale nessuno accende o
  -- spegne a suo nome (nemmeno un'app vecchia che non la manda).
  IF EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND email IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND password_hash = p_password_hash) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;
  -- Le candele (e i nomi) di un appuntamento passato si spengono prima di accendere quella nuova.
  -- candles_occorrenza NULL = «quello corrente» (vedi 28_).
  UPDATE rituals SET candles = '[]'::jsonb, candles_nomi = '{}'::jsonb
   WHERE id = p_ritual_id AND candles_occorrenza IS NOT NULL AND candles_occorrenza IS DISTINCT FROM v_occ;
  SELECT candles INTO v_candles FROM rituals WHERE id = p_ritual_id;
  v_accende := NOT (v_candles @> to_jsonb(array[p_session_id]));
  -- Spegnere la propria candela si può sempre; accenderla solo da dentro la stanza. Ma se le
  -- presenze dell'appuntamento hanno già raggiunto il tetto di segna_presenza_rituale (500, 28_),
  -- la presenza di chi arriva non si scrive più: chiederla bloccherebbe tutti gli utenti veri
  -- (bastano 500 presenze finte). In quel caso il cancello si toglie invece di chiudere la porta.
  IF v_accende THEN
    IF (SELECT count(*) FROM ritual_presence WHERE ritual_id = p_ritual_id AND occorrenza = v_occ) < 500
       AND NOT EXISTS (SELECT 1 FROM ritual_presence
                    WHERE ritual_id = p_ritual_id AND occorrenza = v_occ AND session_id = p_session_id
                      AND visto_il > now() - interval '60 seconds') THEN
      RAISE EXCEPTION 'not_present';
    END IF;
    -- Stesso tetto delle presenze (28_).
    IF jsonb_array_length(v_candles) >= 500 THEN RAISE EXCEPTION 'too_many_candles'; END IF;
  END IF;
  -- Il nome. Registrato: quello del profilo, qualunque cosa dica l'app. Ospite: quello mandato,
  -- ripulito perché non si travesta da un altro: prima NFKC (le lettere «larghe» come Ａ diventano
  -- A, molti spazi speciali diventano spazi), poi via caratteri di controllo, a larghezza zero, di
  -- direzione del testo e i riempitivi invisibili (trattino morbido U+00AD, CGJ U+034F, ALM U+061C,
  -- riempitivi hangul U+115F/U+1160/U+3164/U+FFA0, MVS U+180E, U+2060–U+2064, BOM U+FEFF), poi
  -- ogni spazio Unicode rimasto diventa uno spazio normale e gli spazi di fila uno solo; infine al
  -- massimo 50 caratteri. Se non resta niente, o se è il nome di un altro profilo (maiuscole e
  -- spazi attorno a parte), 'Anonymous' come per il creatore in create_ritual.
  SELECT nullif(btrim(nickname), '') INTO v_nome FROM profiles WHERE session_id = p_session_id;
  IF v_nome IS NULL THEN
    v_nome := regexp_replace(normalize(coalesce(p_nickname, ''), NFKC),
                '[[:cntrl:]\u00AD\u034F\u061C\u115F\u1160\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFEFF\uFFA0]',
                '', 'g');
    v_nome := regexp_replace(v_nome, '[[:space:]\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+', ' ', 'g');
    v_nome := nullif(btrim(left(btrim(v_nome), 50)), '');
    IF v_nome IS NOT NULL AND EXISTS (SELECT 1 FROM profiles
                                        WHERE lower(btrim(nickname)) = lower(btrim(v_nome))
                                          AND session_id <> p_session_id) THEN
      v_nome := NULL;
    END IF;
  END IF;
  v_nome := coalesce(v_nome, 'Anonymous');
  RETURN QUERY
    UPDATE rituals
       SET candles = CASE
             WHEN NOT v_accende THEN
               coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                          WHERE e <> to_jsonb(p_session_id)), '[]'::jsonb)
             ELSE candles || to_jsonb(p_session_id) END,
           candles_nomi = CASE
             WHEN NOT v_accende THEN candles_nomi - p_session_id
             ELSE candles_nomi || jsonb_build_object(p_session_id, v_nome) END,
           candles_occorrenza = v_occ
     WHERE id = p_ritual_id
     RETURNING *;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.toggle_ritual_candle(bigint, text, text, text) TO anon;
-- get_my_messages: testo del catalogo, privilegi conservati.
CREATE OR REPLACE FUNCTION public.get_my_messages(p_nickname text, p_password_hash text)
 RETURNS SETOF private_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  RETURN QUERY
    SELECT m.* FROM private_messages m
     WHERE (m.sender_name = p_nickname OR m.receiver_name = p_nickname)
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
          WHERE b.blocker_nickname = p_nickname
            AND b.blocked_nickname IN (m.sender_name, m.receiver_name)
       )
     ORDER BY m.created_at;
END $function$;
GRANT EXECUTE ON FUNCTION public.get_my_messages(text, text) TO anon;

-- ── 3. Funzioni nuove della 36a: tolte ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.mio_id_pubblico(text);
DROP FUNCTION IF EXISTS public.aggiorna_presenza(text, text, text, float8, float8);
DROP FUNCTION IF EXISTS public.esci_presenza(text, text);
DROP FUNCTION IF EXISTS public.presenza_di(text);
DROP FUNCTION IF EXISTS public.coda_entra(text, text, text);
DROP FUNCTION IF EXISTS public.coda_esci(text, text);
DROP FUNCTION IF EXISTS public.coda_leggi(text);
DROP FUNCTION IF EXISTS public.chiavi_chi_sono(text, text, text);
DROP FUNCTION IF EXISTS public.chiavi_sid_valido(text);
DROP FUNCTION IF EXISTS public.id_pubblico(text);

-- ── 4. Il sale (la tabella app_secrets c'era già, dalla 26) ───────────────────
DELETE FROM public.app_secrets WHERE nome = 'id_pubblico_salt';

NOTIFY pgrst, 'reload schema';
COMMIT;
