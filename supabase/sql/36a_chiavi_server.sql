-- ============================================================================
-- 36a_chiavi_server.sql — chiavi nascoste, parte additiva (spec 2026-10-09; sezioni A-C Task 1, D-E Task 2).
-- Scopo: il session_id di un ospite è la sua unica credenziale e oggi sta in chiaro in
-- online_users e telepathy_queue, leggibili da chiunque. Qui nasce l'id pubblico `pub_…`
-- (hash col segreto del server) e presenze e coda passano da funzioni che restituiscono
-- solo id pubblici.
-- Compatibile con l'app vecchia: non tocca privilegi né policy delle tabelle (li chiude la 36b,
-- dopo il deploy dell'app); `busy` capisce sia partite con id pubblico sia con session_id grezzo.
-- Idempotente: si può rilanciare senza errori. Ritorno: 36a_ritorno.sql.
-- Richiede la 32a e la 35a (notifica_chi_sono, telepatia_verifica_identita).
-- ============================================================================
BEGIN;

-- ════ A. Segreto e id pubblico ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.app_secrets (nome text PRIMARY KEY, valore bytea NOT NULL);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM PUBLIC, anon, authenticated;
INSERT INTO public.app_secrets (nome, valore)
VALUES ('id_pubblico_salt', decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'))
ON CONFLICT (nome) DO NOTHING;

CREATE OR REPLACE FUNCTION public.id_pubblico(p_sid text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v bytea;
BEGIN
  IF p_sid IS NULL OR p_sid LIKE 'pub\_%' THEN RETURN NULL; END IF;
  SELECT valore INTO v FROM app_secrets WHERE nome = 'id_pubblico_salt';
  IF v IS NULL THEN RAISE EXCEPTION 'id_pubblico_salt mancante'; END IF;
  RETURN 'pub_' || left(encode(sha256(v || convert_to(p_sid, 'UTF8')), 'hex'), 32);
END $$;
REVOKE ALL ON FUNCTION public.id_pubblico(text) FROM PUBLIC, anon, authenticated;
-- Eseguibile dall'app: da un session_id che si conosce già dà solo il suo id pubblico (come
-- mio_id_pubblico); un valore pub_… dà NULL. Serve anche alla vista rituali_pubblici.
GRANT EXECUTE ON FUNCTION public.id_pubblico(text) TO anon, authenticated;

-- Non legge tabelle: SQL puro, senza SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.chiavi_sid_valido(p_sid text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_sid IS NOT NULL AND p_sid <> '' AND length(p_sid) <= 255 AND p_sid NOT LIKE 'pub\_%';
$$;
REVOKE ALL ON FUNCTION public.chiavi_sid_valido(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mio_id_pubblico(p_session_id text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT chiavi_sid_valido(p_session_id) THEN RAISE EXCEPTION 'session_non_valida'; END IF;
  RETURN id_pubblico(p_session_id);
END $$;
REVOKE ALL ON FUNCTION public.mio_id_pubblico(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mio_id_pubblico(text) TO anon, authenticated;

-- Nome verificato, o NULL se l'identità non regge (mai un errore: presenze e coda girano ogni pochi secondi).
CREATE OR REPLACE FUNCTION public.chiavi_chi_sono(p_session_id text, p_password_hash text, p_nickname text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT chiavi_sid_valido(p_session_id) THEN RETURN NULL; END IF;
  RETURN notifica_chi_sono(p_session_id, p_password_hash, p_nickname);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.chiavi_chi_sono(text, text, text) FROM PUBLIC, anon, authenticated;

-- ════ B. Presenze ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.aggiorna_presenza(p_session_id text, p_password_hash text, p_nickname text, p_lat float8, p_lng float8)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nome text := chiavi_chi_sono(p_session_id, p_password_hash, p_nickname);
BEGIN
  IF v_nome IS NOT NULL THEN
    INSERT INTO online_users (id, nickname, lat, lng, last_seen)
    VALUES (p_session_id, v_nome,
            CASE WHEN p_lat BETWEEN -90 AND 90 THEN p_lat END,
            CASE WHEN p_lng BETWEEN -180 AND 180 THEN p_lng END, now())
    ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, lat = EXCLUDED.lat, lng = EXCLUDED.lng, last_seen = now();
  END IF;
  DELETE FROM online_users WHERE last_seen < now() - interval '2 minutes';
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', id_pubblico(u.id), 'nickname', u.nickname, 'lat', u.lat, 'lng', u.lng, 'last_seen', u.last_seen,
             -- 36b: resta solo id_pubblico(u.id), le partite sono convertite.
             'busy', EXISTS (SELECT 1 FROM telepathy_matches m
                              WHERE m.ended_at IS NULL
                                AND (m.user1_id IN (u.id, id_pubblico(u.id)) OR m.user2_id IN (u.id, id_pubblico(u.id)))))
           ORDER BY u.last_seen DESC)
      FROM online_users u WHERE chiavi_sid_valido(u.id)), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.aggiorna_presenza(text, text, text, float8, float8) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggiorna_presenza(text, text, text, float8, float8) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.esci_presenza(p_session_id text, p_password_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF chiavi_chi_sono(p_session_id, p_password_hash, NULL) IS NULL THEN RETURN; END IF;
  DELETE FROM online_users WHERE id = p_session_id;
END $$;
REVOKE ALL ON FUNCTION public.esci_presenza(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esci_presenza(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.presenza_di(p_id_pubblico text) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT max(last_seen) FROM online_users
   WHERE p_id_pubblico LIKE 'pub\_%' AND id_pubblico(id) = p_id_pubblico;
$$;
REVOKE ALL ON FUNCTION public.presenza_di(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.presenza_di(text) TO anon, authenticated;

-- ════ C. Coda della telepatia ════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.coda_entra(p_session_id text, p_password_hash text, p_nickname text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nome text := chiavi_chi_sono(p_session_id, p_password_hash, p_nickname);
        v_ora bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
BEGIN
  IF v_nome IS NULL THEN RETURN false; END IF;
  DELETE FROM telepathy_queue WHERE timestamp < v_ora - 60000;
  INSERT INTO telepathy_queue (id, nickname, timestamp) VALUES (p_session_id, v_nome, v_ora)
  ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, timestamp = EXCLUDED.timestamp;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.coda_entra(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coda_entra(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coda_esci(p_session_id text, p_password_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF chiavi_chi_sono(p_session_id, p_password_hash, NULL) IS NULL THEN RETURN; END IF;
  DELETE FROM telepathy_queue WHERE id = p_session_id;
END $$;
REVOKE ALL ON FUNCTION public.coda_esci(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coda_esci(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coda_leggi(p_session_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ora bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
BEGIN
  DELETE FROM telepathy_queue WHERE timestamp < v_ora - 60000;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', id_pubblico(q.id), 'nickname', q.nickname, 'timestamp', q.timestamp)
                                    ORDER BY q.timestamp)
                     FROM telepathy_queue q
                    WHERE q.id IS DISTINCT FROM p_session_id AND chiavi_sid_valido(q.id)), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.coda_leggi(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coda_leggi(text) TO anon, authenticated;

-- ════ D. Vista pubblica dei rituali ══════════════════════════════════════════
-- Stesse colonne di rituali_correnti, nello stesso ordine; i session_id diventano id pubblici
-- (participants e candles elemento per elemento, nello stesso ordine; candles_nomi sulle chiavi).
-- Gira coi diritti del proprietario (niente security_invoker): dopo la 36b anon non legge
-- rituals né rituali_correnti, solo questa vista.
-- id_pubblico è eseguibile da anon (sezione A): in una vista le funzioni girano coi diritti di chi legge.
CREATE OR REPLACE VIEW public.rituali_pubblici AS
SELECT rc.id, rc.creator, id_pubblico(rc.creator_id) AS creator_id, rc.name, rc.description, rc.type, rc.sacred_number,
       rc.date, rc."time", rc.duration,
       coalesce((SELECT jsonb_agg(id_pubblico(x) ORDER BY o) FROM jsonb_array_elements_text(rc.participants) WITH ORDINALITY AS t(x, o)), '[]'::jsonb) AS participants,
       rc.energy, rc.created_at,
       coalesce((SELECT jsonb_agg(id_pubblico(x) ORDER BY o) FROM jsonb_array_elements_text(rc.candles) WITH ORDINALITY AS t(x, o)), '[]'::jsonb) AS candles,
       rc.ripeti_giorni, rc.ripeti_fino, rc.fuso, rc.ora_locale, rc.data_inizio_locale, rc.fermato_il, rc.candles_occorrenza,
       rc.prima_date, rc.prima_time, rc.occorrenza_numero, rc.occorrenze_totali, rc.presenti_ora,
       coalesce((SELECT jsonb_object_agg(id_pubblico(k), v) FROM jsonb_each(rc.candles_nomi) AS e(k, v) WHERE id_pubblico(k) IS NOT NULL), '{}'::jsonb) AS candles_nomi
  FROM rituali_correnti rc;
REVOKE ALL ON public.rituali_pubblici FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rituali_pubblici TO anon, authenticated;

-- ════ E. Inviti e partite: funzioni ridefinite ═══════════════════════════════
-- Testo copiato dal catalogo live del 09/10 (docs/superpowers/plans/catalogo-chiavi-36.txt);
-- cambiano solo le righe marcate «-- 36a:». REVOKE/GRANT come nella 32a.
-- send_telepathy_invite, block_telepathy_inviter e cancel_telepathy_invite non cambiano: passano
-- da telepatia_risolvi e non restituiscono session_id.

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
  ELSIF p_session_online IS NOT NULL AND length(p_session_online) <= 255 THEN  -- 36a: l'online si controlla sotto, per tutte e due le forme
    SELECT u.id, nome_pubblico(u.id, u.nickname) INTO o_sid, o_nome
      FROM online_users u                                                         -- 36a: stessa tabella, WHERE riscritto
     WHERE (id_pubblico(u.id) = p_session_online                                  -- 36a: l'id pubblico della lista
            OR (p_session_online NOT LIKE 'pub\_%' AND u.id = p_session_online))  -- 36a: il grezzo solo fino alla 36b
       AND u.last_seen::timestamptz > now() - interval '30 seconds'               -- 36a: era telepatia_online(p_session_online)
     ORDER BY u.last_seen::timestamptz DESC LIMIT 1;                              -- 36a: era sulla riga del FROM
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
     WHERE (m.user1_id = id_pubblico(p_session_id) OR (p_session_id NOT LIKE 'pub\_%' AND m.user1_id = p_session_id)     -- 36a: id pubblico, o il grezzo (non pub_) fino alla 36b
         OR m.user2_id = id_pubblico(p_session_id) OR (p_session_id NOT LIKE 'pub\_%' AND m.user2_id = p_session_id))    -- 36a: idem per user2
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
          WHERE m.id = p_match_id AND m.ended_at IS NULL
            AND (m.user1_id = id_pubblico(v.from_id) OR (v.from_id NOT LIKE 'pub\_%' AND m.user1_id = v.from_id))  -- 36a: id pubblico, o il grezzo (non pub_) fino alla 36b
            AND (m.user2_id = id_pubblico(v.to_id) OR (v.to_id NOT LIKE 'pub\_%' AND m.user2_id = v.to_id))) THEN  -- 36a: idem per user2
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
REVOKE ALL ON FUNCTION public.respond_telepathy_invite(uuid, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
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
                            'from_id_pubblico', id_pubblico(i.from_id),  -- 36a: chiave nuova per l'app nuova; from_id resta grezzo fino alla 36b (l'app vecchia ci crea la partita)
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
    'from_id', CASE WHEN v_ruolo = 'destinatario' AND v.status = 'pending' THEN v.from_id END,
    'from_id_pubblico', CASE WHEN v_ruolo = 'destinatario' AND v.status = 'pending' THEN id_pubblico(v.from_id) END));  -- 36a: chiave nuova; from_id resta grezzo fino alla 36b
END $function$;
REVOKE ALL ON FUNCTION public.get_telepathy_invite(uuid, text, text)                    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_telepathy_invite(uuid, text, text)                    TO anon, authenticated;

-- ════ F. Candela: la risposta non porta session_id ═════════════════════════════
-- toggle_ritual_candle (anon, SECURITY DEFINER) restituiva la riga intera di rituals: creator_id,
-- participants, candles e le chiavi di candles_nomi sono session_id. App vecchia e nuova guardano
-- solo che arrivi una riga e poi rileggono la vista: stessa firma e stesso tipo, quei quattro campi
-- vuoti, tutto il resto com'era. Testo copiato dal catalogo live del 09/10 (identico alla 30_);
-- cambiano solo le righe marcate «-- 36a:». I privilegi restano quelli di oggi (CREATE OR REPLACE
-- li conserva); il GRANT è quello della 30_.
CREATE OR REPLACE FUNCTION public.toggle_ritual_candle(p_ritual_id bigint, p_session_id text, p_nickname text DEFAULT NULL::text, p_password_hash text DEFAULT NULL::text)
 RETURNS SETOF rituals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'                                    -- 36a: era solo 'public'
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
  UPDATE rituals                                                              -- 36a: era RETURN QUERY UPDATE
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
     RETURNING * INTO v;                                                     -- 36a: era RETURNING *
  -- 36a: la riga torna senza session_id; l'app guarda solo che arrivi, poi rilegge la vista.
  IF FOUND THEN                                                               -- 36a
    v.creator_id := ''; v.participants := '[]'::jsonb; v.candles := '[]'::jsonb; v.candles_nomi := '{}'::jsonb;  -- 36a
    RETURN NEXT v;                                                            -- 36a
  END IF;                                                                     -- 36a
END;
$function$;
GRANT EXECUTE ON FUNCTION public.toggle_ritual_candle(bigint, text, text, text) TO anon;

-- ════ G. Messaggi privati: il mittente non consegna la sua chiave ════════════════
-- get_my_messages (anon, SECURITY DEFINER) restituiva m.*: sender_id è il session_id grezzo di chi
-- ha scritto, quindi chi riceve un messaggio ne riceveva la credenziale. L'app non legge
-- sender_id da queste righe: diventa l'id pubblico. Stessa firma, stesso tipo, stessi privilegi
-- (CREATE OR REPLACE li conserva; il GRANT è quello della 05_). Testo del catalogo live del 09/10;
-- cambiano solo le righe marcate «-- 36a:». Le colonne sono quelle di private_messages, nell'ordine
-- del DB vero (id, sender_id, sender_name, receiver_name, content, is_read, created_at).
-- send_private_message resta com'è: restituisce solo la riga appena scritta da chi chiama.
CREATE OR REPLACE FUNCTION public.get_my_messages(p_nickname text, p_password_hash text)
 RETURNS SETOF private_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'                                    -- 36a: era solo 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  RETURN QUERY
    SELECT m.id, id_pubblico(m.sender_id), m.sender_name, m.receiver_name,      -- 36a: era m.*; sender_id pubblico
           m.content, m.is_read, m.created_at                                  -- 36a: colonne nell'ordine della tabella
      FROM private_messages m                                                  -- 36a
     WHERE (m.sender_name = p_nickname OR m.receiver_name = p_nickname)
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
          WHERE b.blocker_nickname = p_nickname
            AND b.blocked_nickname IN (m.sender_name, m.receiver_name)
       )
     ORDER BY m.created_at;
END $function$;
GRANT EXECUTE ON FUNCTION public.get_my_messages(text, text) TO anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
