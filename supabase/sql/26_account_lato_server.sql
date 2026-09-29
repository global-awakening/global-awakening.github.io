-- ============================================================================
-- Account lato server, parte additiva — 28/09/2026
--
-- Aggiunge soltanto funzioni e tabelle private: le tabelle esistenti non cambiano, quindi
-- l'app già pubblicata continua a funzionare mentre quella nuova passa da queste funzioni.
--
-- Perché i rifiuti sono valori e non eccezioni: un RAISE annulla l'intera chiamata, compresa
-- la riga scritta in login_attempts. Il tetto dei tentativi non conterebbe mai niente.
--
-- Idempotente: si può rieseguire.
-- ============================================================================

-- ── Tabelle private ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_secrets (
  nome   text PRIMARY KEY,
  valore bytea NOT NULL
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_secrets FROM PUBLIC, anon, authenticated;
-- Segreto del sale finto: rende la risposta di get_login_params uguale per chi esiste e per
-- chi no. Generato una volta; rieseguire la migration non lo cambia.
INSERT INTO app_secrets (nome, valore)
VALUES ('login_salt', extensions.gen_random_bytes(32))
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS login_attempts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx    ON login_attempts (ip, created_at);
CREATE INDEX IF NOT EXISTS login_attempts_time_idx  ON login_attempts (created_at);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
-- Esplicito: i privilegi di default di Supabase darebbero la tabella ad anon.
REVOKE ALL ON login_attempts FROM PUBLIC, anon, authenticated;

-- ── Helper interni ─────────────────────────────────────────────────────────
-- IP del chiamante. cf-connecting-ip lo scrive Cloudflare e un client non può sceglierlo
-- (verificato il 28/09: la richiesta con quell'header viene rifiutata, errore 1000). Il primo
-- valore di x-forwarded-for invece lo sceglie chi chiama.
CREATE OR REPLACE FUNCTION account_ip_richiesta()
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT nullif(btrim((coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json)
                      ->> 'cf-connecting-ip'), '')
$$;

CREATE OR REPLACE FUNCTION account_hash_valido(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p IS NULL OR p !~ '^pbkdf2\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$' THEN false
    ELSE split_part(p, '$', 2)::int >= 100000
  END
$$;

CREATE OR REPLACE FUNCTION account_profilo_json(p profiles)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'session_id', p.session_id, 'nickname', p.nickname, 'email', p.email,
    'bio', p.bio, 'starseed_type', p.starseed_type, 'avatar', p.avatar,
    'country', p.country, 'interests', p.interests, 'experience_level', p.experience_level,
    'telepathy_score', p.telepathy_score, 'telepathy_best', p.telepathy_best,
    'show_telepathy_score', p.show_telepathy_score)
$$;

-- Il tetto globale (300/15 min) scatta SOLO quando l'IP del chiamante è ignoto (p_ip NULL).
-- Con un cf-connecting-ip affidabile il tetto globale sarebbe un interruttore che chiunque può
-- girare: bastano una decina di IP per esaurirlo e bloccare i login di tutti; il tetto per IP
-- (30) già ferma un singolo IP, e quello per email (10) un singolo bersaglio.
CREATE OR REPLACE FUNCTION account_troppi_tentativi(p_email text, p_ip text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT
       (SELECT count(*) FROM login_attempts
         WHERE email = p_email AND created_at > now() - interval '15 minutes') >= 10
    OR (p_ip IS NOT NULL AND (SELECT count(*) FROM login_attempts
         WHERE ip = p_ip AND created_at > now() - interval '15 minutes') >= 30)
    OR (p_ip IS NULL AND (SELECT count(*) FROM login_attempts
         WHERE created_at > now() - interval '15 minutes') >= 300)
$$;

CREATE OR REPLACE FUNCTION account_registra_fallimento(p_email text, p_ip text)
RETURNS void LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  INSERT INTO login_attempts (email, ip) VALUES (p_email, p_ip);
  DELETE FROM login_attempts WHERE created_at < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION account_ip_richiesta()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION account_hash_valido(text)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION account_profilo_json(profiles)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION account_troppi_tentativi(text, text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION account_registra_fallimento(text, text)   FROM PUBLIC, anon, authenticated;

-- ── get_login_params ───────────────────────────────────────────────────────
-- Sempre e solo {iter, salt}. Per un account vecchio (SHA-256) o un'email che non esiste il
-- sale è HMAC(email, segreto): stabile, e indistinguibile da uno vero. Per l'account vecchio è
-- anche il sale con cui verrà salvato l'hash nuovo alla migrazione.
CREATE OR REPLACE FUNCTION get_login_params(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_hash   text;
  v_secret bytea;
BEGIN
  SELECT password_hash INTO v_hash FROM profiles WHERE email = v_email;
  IF account_hash_valido(v_hash) THEN
    RETURN jsonb_build_object('iter', split_part(v_hash, '$', 2)::int,
                              'salt', split_part(v_hash, '$', 3));
  END IF;
  SELECT valore INTO v_secret FROM app_secrets WHERE nome = 'login_salt';
  RETURN jsonb_build_object(
    'iter', 100000,
    'salt', encode(substring(extensions.hmac(convert_to(v_email, 'UTF8'), v_secret, 'sha256') FROM 1 FOR 16), 'base64'));
END;
$$;

-- ── login_with_password ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION login_with_password(p_email text, p_hash text, p_legacy_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_ip      text := account_ip_richiesta();
  v_p       profiles%ROWTYPE;
  v_ok      boolean := false;
  v_migrato boolean := false;
BEGIN
  IF v_email = '' OR length(v_email) > 254 OR NOT account_hash_valido(p_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  IF account_troppi_tentativi(v_email, v_ip) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'troppi_tentativi');
  END IF;

  SELECT * INTO v_p FROM profiles WHERE email = v_email;
  IF FOUND AND v_p.password_hash IS NOT NULL THEN
    IF account_hash_valido(v_p.password_hash) THEN
      v_ok := v_p.password_hash = p_hash;
    ELSIF v_p.password_hash ~ '^[0-9a-f]{64}$' THEN
      -- Account vecchio: si confronta l'SHA-256 e si salva al suo posto l'hash PBKDF2 che il
      -- client ha calcolato col sale HMAC ricevuto da get_login_params. p_legacy_hash deve
      -- avere anch'esso la forma di uno SHA-256 esadecimale, altrimenti non si confronta.
      v_ok := p_legacy_hash IS NOT NULL AND p_legacy_hash ~ '^[0-9a-f]{64}$'
              AND v_p.password_hash = p_legacy_hash;
      IF v_ok THEN
        UPDATE profiles SET password_hash = p_hash, updated_at = now()
         WHERE session_id = v_p.session_id;
        v_migrato := true;
      END IF;
    END IF;
    -- Se password_hash non è né un pbkdf2 valido né un legacy SHA-256 esadecimale, v_ok resta
    -- false: nessuna password è buona (stesso comportamento di un account senza hash).
  END IF;

  IF NOT v_ok THEN
    PERFORM account_registra_fallimento(v_email, v_ip);
    RETURN jsonb_build_object('ok', false, 'motivo', 'credenziali_non_valide');
  END IF;

  DELETE FROM login_attempts WHERE email = v_email;
  RETURN jsonb_build_object('ok', true, 'migrato', v_migrato, 'profilo', account_profilo_json(v_p));
END;
$$;

-- ── register_account ───────────────────────────────────────────────────────
-- email_in_uso rivela chi è iscritto: rischio accettato (spec §4.1). Ogni email_in_uso conta
-- come fallito per l'IP, così provarne mille dallo stesso posto si ferma al tetto.
CREATE OR REPLACE FUNCTION register_account(p_session_id text, p_nickname text, p_email text, p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nick  text := btrim(coalesce(p_nickname, ''));
  v_sid   text := btrim(coalesce(p_session_id, ''));
  v_ip    text := account_ip_richiesta();
  v_p     profiles%ROWTYPE;
BEGIN
  IF v_nick = '' OR length(v_nick) > 50
     OR v_sid = '' OR length(v_sid) > 100
     OR length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR NOT account_hash_valido(p_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  IF account_troppi_tentativi(v_email, v_ip) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'troppi_tentativi');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE email = v_email) THEN
    PERFORM account_registra_fallimento(NULL, v_ip);
    RETURN jsonb_build_object('ok', false, 'motivo', 'email_in_uso');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE nickname = v_nick) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nickname_in_uso');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE session_id = v_sid) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;

  BEGIN
    INSERT INTO profiles (session_id, nickname, email, password_hash, bio, starseed_type, avatar,
                          country, interests, experience_level, telepathy_score, telepathy_best,
                          show_telepathy_score)
    VALUES (v_sid, v_nick, v_email, p_hash, '', '', '', '', '[]'::jsonb, '', 0, 0, true)
    RETURNING * INTO v_p;
  EXCEPTION WHEN unique_violation THEN
    -- Due registrazioni con la stessa email nello stesso istante: vince la prima.
    RETURN jsonb_build_object('ok', false, 'motivo', 'email_in_uso');
  END;

  RETURN jsonb_build_object('ok', true, 'profilo', account_profilo_json(v_p));
END;
$$;

GRANT EXECUTE ON FUNCTION get_login_params(text)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION login_with_password(text, text, text)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION register_account(text, text, text, text)       TO anon, authenticated;

-- ── Storico delle email d'account (tetti) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS account_email_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL,
  tipo       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_email_log_idx ON account_email_log (email, created_at);
ALTER TABLE account_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_email_log FROM PUBLIC, anon, authenticated;

-- ── crea_token_account (solo ruolo di servizio, la chiama send-account-email) ──
-- NULL vuol dire «non spedire»: email non registrata o tetto raggiunto. La funzione Edge
-- risponde comunque «se l'indirizzo è registrato, ti abbiamo scritto».
-- Tetti: per email 1/minuto, 5/ora, 3/giorno; globali 3/ora, 6/giorno. Quelli globali stanno
-- dentro la quota di EmailJS (piano gratuito: 200 email al mese, da dividere con alert-cron;
-- abbassati il 28/09 da 30/ora e 40/giorno, che l'avrebbero esaurita in 5 giorni). E la
-- registrazione non verifica l'email, quindi chiunque può iscrivere indirizzi altrui e farci
-- spedire posta a sconosciuti. Nota per i test: anche i token creati dai test contano finché
-- non vengono ripuliti, quindi con richieste vere nell'ultima ora i test possono non averne. Le righe si tengono 2 giorni
-- (la finestra più lunga è di 1 giorno), così la pulizia non tocca righe ancora contate.
CREATE OR REPLACE FUNCTION crea_token_account(p_tipo text, p_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := gen_random_uuid()::text;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('reset', 'magic') THEN
    RAISE EXCEPTION 'tipo non valido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE email = v_email) THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM account_email_log WHERE email = v_email AND created_at > now() - interval '1 minute') >= 1
     OR (SELECT count(*) FROM account_email_log WHERE email = v_email AND created_at > now() - interval '1 hour') >= 5
     OR (SELECT count(*) FROM account_email_log WHERE email = v_email AND created_at > now() - interval '1 day') >= 3
     OR (SELECT count(*) FROM account_email_log WHERE created_at > now() - interval '1 hour') >= 3
     OR (SELECT count(*) FROM account_email_log WHERE created_at > now() - interval '1 day') >= 6 THEN
    RETURN NULL;
  END IF;

  INSERT INTO account_email_log (email, tipo) VALUES (v_email, p_tipo);
  DELETE FROM account_email_log WHERE created_at < now() - interval '2 days';

  IF p_tipo = 'reset' THEN
    DELETE FROM password_resets WHERE email = v_email;
    INSERT INTO password_resets (email, token, expires_at) VALUES (v_email, v_token, now() + interval '15 minutes');
  ELSE
    DELETE FROM magic_links WHERE email = v_email;
    INSERT INTO magic_links (email, token, expires_at) VALUES (v_email, v_token, now() + interval '15 minutes');
  END IF;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION crea_token_account(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crea_token_account(text, text) TO service_role;

-- ── consume_magic_link ─────────────────────────────────────────────────────
-- Chi apre il link dalla propria casella riceve la credenziale per le RPC, come oggi. Se
-- l'account non ne ha una (creato da flussi vecchi) gliene nasce una casuale: senza, resterebbe
-- dentro l'app senza poter mandare un messaggio.
CREATE OR REPLACE FUNCTION consume_magic_link(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text;
  v_scade timestamptz;
  v_p     profiles%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;
  -- Cancellato prima di tutto il resto: uso singolo anche con due schede aperte insieme.
  DELETE FROM magic_links WHERE token = p_token RETURNING email, expires_at INTO v_email, v_scade;
  IF v_email IS NULL OR v_scade IS NULL OR v_scade < now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;

  SELECT * INTO v_p FROM profiles WHERE email = lower(v_email);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;
  IF v_p.password_hash IS NULL THEN
    UPDATE profiles
       SET password_hash = 'pbkdf2$100000$' || encode(extensions.gen_random_bytes(16), 'base64')
                           || '$' || encode(extensions.gen_random_bytes(32), 'base64'),
           updated_at = now()
     WHERE session_id = v_p.session_id
    RETURNING * INTO v_p;
  END IF;
  -- Chi apre il link ha la casella: i suoi falliti si azzerano, come col reset. Senza, dopo
  -- l'azzeramento delle credenziali chi è rimasto collegato con la vecchia si bloccherebbe da solo.
  DELETE FROM login_attempts WHERE email = v_p.email;

  RETURN jsonb_build_object('ok', true, 'profilo', account_profilo_json(v_p),
                            'password_hash', v_p.password_hash);
END;
$$;

-- ── reset_password ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_password(p_token text, p_new_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text;
  v_scade timestamptz;
BEGIN
  -- Il formato si controlla PRIMA di consumare il token: un errore del client non deve
  -- costringere a chiedere un'altra email.
  IF NOT account_hash_valido(p_new_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  IF p_token IS NULL OR length(p_token) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;
  DELETE FROM password_resets WHERE token = p_token RETURNING email, expires_at INTO v_email, v_scade;
  IF v_email IS NULL OR v_scade IS NULL OR v_scade < now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;

  UPDATE profiles SET password_hash = p_new_hash, updated_at = now() WHERE email = lower(v_email);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;
  DELETE FROM magic_links WHERE email = lower(v_email);
  DELETE FROM login_attempts WHERE email = lower(v_email);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── change_password ────────────────────────────────────────────────────────
-- La vecchia credenziale è quella che l'app tiene in localStorage: non si chiede di ridigitare
-- la password (lo schermo resta com'è), ma senza la credenziale non si cambia niente.
-- Ogni credenziale sbagliata conta come un login fallito (per l'email del profilo con quel
-- nickname, NULL se il nickname non esiste, e per l'IP), così la funzione non diventa un modo
-- per provare password senza tetto. Il tetto si guarda PRIMA del confronto.
CREATE OR REPLACE FUNCTION change_password(p_nickname text, p_old_hash text, p_new_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ip    text := account_ip_richiesta();
  v_email text;
BEGIN
  IF p_old_hash IS NULL OR p_nickname IS NULL OR NOT account_hash_valido(p_new_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  SELECT email INTO v_email FROM profiles WHERE nickname = p_nickname LIMIT 1;
  IF account_troppi_tentativi(v_email, v_ip) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'troppi_tentativi');
  END IF;
  UPDATE profiles SET password_hash = p_new_hash, updated_at = now()
   WHERE nickname = p_nickname AND password_hash = p_old_hash;
  IF NOT FOUND THEN
    PERFORM account_registra_fallimento(v_email, v_ip);
    RETURN jsonb_build_object('ok', false, 'motivo', 'credenziali_non_valide');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── update_my_profile ──────────────────────────────────────────────────────
-- Credenziale sbagliata = login fallito, come in change_password.
CREATE OR REPLACE FUNCTION update_my_profile(p_nickname text, p_password_hash text, p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ip    text := account_ip_richiesta();
  v_email text;
  v_ammessi text[] := ARRAY['bio','starseed_type','avatar','country','interests','experience_level',
                            'telepathy_score','telepathy_best','show_telepathy_score'];
  v_f jsonb := p_fields;
BEGIN
  IF v_f IS NULL OR jsonb_typeof(v_f) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_f) k WHERE k <> ALL (v_ammessi))
     OR (v_f ? 'bio'              AND (jsonb_typeof(v_f->'bio') <> 'string'              OR length(v_f->>'bio') > 1000))
     OR (v_f ? 'starseed_type'    AND (jsonb_typeof(v_f->'starseed_type') <> 'string'    OR length(v_f->>'starseed_type') > 100))
     OR (v_f ? 'avatar'           AND (jsonb_typeof(v_f->'avatar') <> 'string'           OR length(v_f->>'avatar') > 16))
     OR (v_f ? 'country'          AND (jsonb_typeof(v_f->'country') <> 'string'          OR length(v_f->>'country') > 100))
     OR (v_f ? 'experience_level' AND (jsonb_typeof(v_f->'experience_level') <> 'string' OR length(v_f->>'experience_level') > 100))
     OR (v_f ? 'interests' AND (jsonb_typeof(v_f->'interests') <> 'array'
                                OR jsonb_array_length(v_f->'interests') > 30
                                OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_f->'interests') e
                                            WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') > 100)))
     OR (v_f ? 'telepathy_score' AND (jsonb_typeof(v_f->'telepathy_score') <> 'number' OR (v_f->>'telepathy_score')::numeric < 0
                                      OR (v_f->>'telepathy_score')::numeric > 2147483647
                                      OR (v_f->>'telepathy_score')::numeric <> floor((v_f->>'telepathy_score')::numeric)))
     OR (v_f ? 'telepathy_best'  AND (jsonb_typeof(v_f->'telepathy_best') <> 'number'  OR (v_f->>'telepathy_best')::numeric < 0
                                      OR (v_f->>'telepathy_best')::numeric > 2147483647
                                      OR (v_f->>'telepathy_best')::numeric <> floor((v_f->>'telepathy_best')::numeric)))
     OR (v_f ? 'show_telepathy_score' AND jsonb_typeof(v_f->'show_telepathy_score') <> 'boolean') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  SELECT email INTO v_email FROM profiles WHERE nickname = p_nickname LIMIT 1;
  IF account_troppi_tentativi(v_email, v_ip) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'troppi_tentativi');
  END IF;

  UPDATE profiles SET
    bio                  = CASE WHEN v_f ? 'bio'                  THEN v_f->>'bio'                     ELSE bio END,
    starseed_type        = CASE WHEN v_f ? 'starseed_type'        THEN v_f->>'starseed_type'           ELSE starseed_type END,
    avatar               = CASE WHEN v_f ? 'avatar'               THEN v_f->>'avatar'                  ELSE avatar END,
    country              = CASE WHEN v_f ? 'country'              THEN v_f->>'country'                 ELSE country END,
    interests            = CASE WHEN v_f ? 'interests'            THEN v_f->'interests'                ELSE interests END,
    experience_level     = CASE WHEN v_f ? 'experience_level'     THEN v_f->>'experience_level'        ELSE experience_level END,
    telepathy_score      = CASE WHEN v_f ? 'telepathy_score'      THEN (v_f->>'telepathy_score')::int  ELSE telepathy_score END,
    telepathy_best       = CASE WHEN v_f ? 'telepathy_best'       THEN (v_f->>'telepathy_best')::int   ELSE telepathy_best END,
    show_telepathy_score = CASE WHEN v_f ? 'show_telepathy_score' THEN (v_f->>'show_telepathy_score')::boolean ELSE show_telepathy_score END,
    updated_at           = now()
  WHERE nickname = p_nickname AND password_hash = p_password_hash;

  IF NOT FOUND THEN
    PERFORM account_registra_fallimento(v_email, v_ip);
    RETURN jsonb_build_object('ok', false, 'motivo', 'credenziali_non_valide');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION consume_magic_link(text)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reset_password(text, text)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION change_password(text, text, text)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_my_profile(text, text, jsonb)        TO anon, authenticated;

-- ── Telepatia: la classifica e i totali senza user_id ──────────────────────
-- Per gli iscritti user_id è l'email: la classifica pubblica la esponeva a ogni visitatore.
CREATE OR REPLACE FUNCTION get_telepathy_leaderboard(p_limit int)
RETURNS TABLE(nickname text, rounds_count int, matches_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ts.nickname, ts.rounds_count, ts.matches_count
    FROM telepathy_scores ts
   ORDER BY ts.matches_count DESC NULLS LAST
   LIMIT least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

-- Ospiti: basta l'id, come oggi (i loro totali sono comunque pubblici via nickname).
-- Iscritti: serve la credenziale, altrimenti la funzione direbbe chi è iscritto con che email.
CREATE OR REPLACE FUNCTION get_my_telepathy_totals(p_user_id text, p_password_hash text)
RETURNS TABLE(rounds_count int, matches_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ts.rounds_count, ts.matches_count
    FROM telepathy_scores ts
   WHERE ts.user_id = p_user_id
     AND (NOT EXISTS (SELECT 1 FROM profiles p WHERE p.email = lower(p_user_id))
          OR EXISTS (SELECT 1 FROM profiles p
                      WHERE p.email = lower(p_user_id) AND p.password_hash = p_password_hash))
$$;

-- Fusione ospite → account, ora con la credenziale. Corpo ripreso da quello in uso (letto dal
-- catalogo il 28/09: non esisteva nel repo), più tre cambi: la credenziale dell'account di
-- destinazione, il divieto di usare come «vecchia» la riga di un iscritto, il nickname preso
-- dal profilo. La firma a tre parametri resta per le app non ancora aggiornate.
CREATE OR REPLACE FUNCTION merge_telepathy_scores(p_old_user_id text, p_new_user_id text,
                                                  p_nickname text, p_password_hash text)
RETURNS TABLE(out_rounds integer, out_matches integer, out_sessions integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_g_rounds   int := 0;
  v_g_matches  int := 0;
  v_g_sessions int := 0;
  v_nick       text;
BEGIN
  IF p_old_user_id IS NULL OR p_new_user_id IS NULL OR p_old_user_id = p_new_user_id THEN
    RETURN;
  END IF;
  SELECT nickname INTO v_nick FROM profiles
   WHERE email = lower(p_new_user_id) AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE email = lower(p_old_user_id)) THEN
    RETURN;  -- si fondono solo righe d'ospite
  END IF;

  SELECT COALESCE(rounds_count,0), COALESCE(matches_count,0), COALESCE(sessions_count,0)
    INTO v_g_rounds, v_g_matches, v_g_sessions
    FROM telepathy_scores WHERE user_id = p_old_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_g_rounds = 0 AND v_g_matches = 0 AND v_g_sessions = 0 THEN
    DELETE FROM telepathy_scores WHERE user_id = p_old_user_id;
    RETURN;
  END IF;

  INSERT INTO telepathy_scores (user_id, nickname, sessions_count, matches_count, rounds_count, updated_at)
  VALUES (p_new_user_id, v_nick, v_g_sessions, v_g_matches, v_g_rounds, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    sessions_count = telepathy_scores.sessions_count + EXCLUDED.sessions_count,
    matches_count  = telepathy_scores.matches_count  + EXCLUDED.matches_count,
    rounds_count   = telepathy_scores.rounds_count   + EXCLUDED.rounds_count,
    nickname       = EXCLUDED.nickname,
    updated_at     = NOW();

  DELETE FROM telepathy_scores WHERE user_id = p_old_user_id;

  RETURN QUERY
    SELECT ts.rounds_count, ts.matches_count, ts.sessions_count
      FROM telepathy_scores ts WHERE ts.user_id = p_new_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_telepathy_leaderboard(int)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_telepathy_totals(text, text)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_telepathy_scores(text, text, text, text)         TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
