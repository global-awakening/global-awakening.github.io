-- ============================================================================
-- 36b_ritorno.sql — ritorno indietro della 36b. SCRITTO E PROVATO IN LOCALE, NON APPLICATO.
-- Riporta il DB allo stato della sola 36a: l'app vecchia (che legge e scrive online_users,
-- telepathy_queue e rituals direttamente) torna a funzionare.
-- Cosa fa:
--  1. rituali_correnti torna security_invoker, con SELECT ad anon/authenticated.
--  2. rituals: policy rituals_select_public (FOR SELECT TO anon USING true) e SELECT ad anon/authenticated.
--  3. online_users e telepathy_queue: le due policy di oggi per tabella (FOR ALL TO public, USING e
--     CHECK true; nomi letti dal DB vero il 09/10) e GRANT ALL ad anon/authenticated.
--  4. aggiorna_presenza, telepatia_risolvi, telepatia_in_training, respond_telepathy_invite: le
--     versioni della 36a (testo identico, che accetta anche il session_id grezzo), stessi privilegi.
-- ⚠️ Cosa NON torna: le partite convertite dalla 36b restano con gli id pubblici (e quelle concluse
--    o doppie tolte dalla 36b non ricompaiono). Con la 36a le funzioni le riconoscono comunque.
-- Per tornare a prima della 36a: questo, poi 36a_ritorno.sql.
-- Idempotente: le policy si tolgono e si ricreano.
-- ============================================================================
BEGIN;

-- ── 1. Vista rituali_correnti ────────────────────────────────────────────────
ALTER VIEW public.rituali_correnti SET (security_invoker = true);
GRANT SELECT ON public.rituali_correnti TO anon, authenticated;

-- ── 2. rituals ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rituals_select_public ON public.rituals;
CREATE POLICY rituals_select_public ON public.rituals FOR SELECT TO anon USING (true);
GRANT SELECT ON public.rituals TO anon, authenticated;

-- ── 3. Presenze e coda ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON public.online_users;
DROP POLICY IF EXISTS "Enable all for users" ON public.online_users;
CREATE POLICY "Allow all" ON public.online_users FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for users" ON public.online_users FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.online_users TO anon, authenticated;

DROP POLICY IF EXISTS "Allow all" ON public.telepathy_queue;
DROP POLICY IF EXISTS "Enable all for telepathy" ON public.telepathy_queue;
CREATE POLICY "Allow all" ON public.telepathy_queue FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for telepathy" ON public.telepathy_queue FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.telepathy_queue TO anon, authenticated;

-- ── 4. Le quattro funzioni: versioni della 36a (testo copiato da 36a_chiavi_server.sql) ──
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
REVOKE ALL ON FUNCTION public.respond_telepathy_invite(uuid, text, text, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_telepathy_invite(uuid, text, text, boolean, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
