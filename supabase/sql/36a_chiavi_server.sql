-- ============================================================================
-- 36a_chiavi_server.sql — chiavi nascoste, parte additiva (spec 2026-10-09, Task 1: sezioni A-C).
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

NOTIFY pgrst, 'reload schema';
COMMIT;
