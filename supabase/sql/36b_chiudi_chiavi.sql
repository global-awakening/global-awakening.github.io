-- ============================================================================
-- 36b_chiudi_chiavi.sql — chiavi nascoste, chiusura (2 di 2). Spec: 2026-10-09-chiavi-nascoste-design.md.
-- Segue: 36a_chiavi_server.sql (id pubblici, presenze e coda dal server, vista rituali_pubblici).
--
-- ⚠️ Applicare almeno 10 minuti DOPO il deploy dell'app nuova (max-age=600): un'app vecchia ancora
--    in cache leggerebbe online_users, telepathy_queue e rituals direttamente, e da qui non può più.
--
-- Cosa fa:
--  1. telepathy_matches: i session_id diventano id pubblici. Prima si tolgono le partite concluse
--     non convertite e, fra due partite vive della stessa coppia, la più vecchia (preferendo quella
--     già pubblica): altrimenti la conversione urterebbe l'indice unico telepathy_matches_pair_unique.
--     Il trigger dell'attività è spento durante la conversione, che non è un'attività: senza,
--     ogni partita convertita sembrerebbe giocata adesso (in training per 10 minuti).
--  2. online_users, telepathy_queue, rituals: via le policy (nomi letti dal DB vero il 09/10),
--     nessun privilegio all'app; RLS resta accesa. rituali_correnti: nessun privilegio all'app.
--     Anon legge i rituali solo da rituali_pubblici (gira coi diritti del proprietario); perché
--     la vista regga, rituali_correnti smette di essere security_invoker (vedi sotto).
--     Le funzioni delle occorrenze (rituale_occorrenz*, rituale_presenti_ora) restano eseguibili da
--     anon: la vista le chiama coi diritti di chi legge.
--  3. telepatia_risolvi, telepatia_in_training, respond_telepathy_invite, aggiorna_presenza: solo
--     id pubblici (righe marcate «-- 36b:»), stessi REVOKE/GRANT della 36a.
-- telepathy_matches resta aperta all'app (motore della telepatia: sotto-progetto 2).
-- Idempotente: rilanciata non cambia nulla. Ritorno: 36b_ritorno.sql.
-- ============================================================================
BEGIN;

-- ════ 1. Partite: i session_id diventano id pubblici ═════════════════════════
-- Concluse e non (del tutto) convertite: non servono più a nessuno e possono urtare l'indice.
DELETE FROM public.telepathy_matches
 WHERE ended_at IS NOT NULL
   AND (user1_id NOT LIKE 'pub\_%' OR user2_id NOT LIKE 'pub\_%');

-- Vive della stessa coppia dopo la conversione (es. una dell'app vecchia e una della nuova):
-- resta la già pubblica, poi la più recente.
DELETE FROM public.telepathy_matches m
 USING (SELECT x.id, row_number() OVER (
               PARTITION BY least(x.c1, x.c2), greatest(x.c1, x.c2)
               ORDER BY coalesce(x.user1_id LIKE 'pub\_%', true) AND coalesce(x.user2_id LIKE 'pub\_%', true) DESC,
                        x.ultima_attivita DESC, x.created_at DESC, x.id) AS n
          FROM (SELECT t.id, t.user1_id, t.user2_id, t.ultima_attivita, t.created_at,
                       CASE WHEN t.user1_id LIKE 'pub\_%' THEN t.user1_id ELSE public.id_pubblico(t.user1_id) END AS c1,
                       CASE WHEN t.user2_id LIKE 'pub\_%' THEN t.user2_id ELSE public.id_pubblico(t.user2_id) END AS c2
                  FROM public.telepathy_matches t) x
         WHERE least(x.c1, x.c2) IS NOT NULL) d
 WHERE m.id = d.id AND d.n > 1;

ALTER TABLE public.telepathy_matches DISABLE TRIGGER telepathy_matches_attivita;
UPDATE public.telepathy_matches
   SET user1_id = CASE WHEN user1_id LIKE 'pub\_%' THEN user1_id ELSE public.id_pubblico(user1_id) END,
       user2_id = CASE WHEN user2_id LIKE 'pub\_%' THEN user2_id ELSE public.id_pubblico(user2_id) END,
       ended_by = CASE WHEN ended_by LIKE 'pub\_%' THEN ended_by ELSE public.id_pubblico(ended_by) END
 WHERE user1_id NOT LIKE 'pub\_%' OR user2_id NOT LIKE 'pub\_%' OR ended_by NOT LIKE 'pub\_%';
ALTER TABLE public.telepathy_matches ENABLE TRIGGER telepathy_matches_attivita;

-- ════ 2. Tabelle chiuse: RLS resta accesa, nessuna policy, nessun privilegio all'app ═══════
DROP POLICY IF EXISTS "Allow all" ON public.online_users;
DROP POLICY IF EXISTS "Enable all for users" ON public.online_users;
REVOKE ALL ON public.online_users FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Allow all" ON public.telepathy_queue;
DROP POLICY IF EXISTS "Enable all for telepathy" ON public.telepathy_queue;
REVOKE ALL ON public.telepathy_queue FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS rituals_select_public ON public.rituals;
REVOKE ALL ON public.rituals FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.rituali_correnti FROM PUBLIC, anon, authenticated;
-- rituali_pubblici gira coi diritti del proprietario, ma legge rituali_correnti, che è
-- security_invoker: lì i diritti su rituals tornerebbero a essere quelli di chi legge (anon), e
-- dopo il REVOKE qui sopra anon non leggerebbe più nemmeno rituali_pubblici. Ora che l'app non ha
-- più privilegi su rituali_correnti, farla girare coi diritti del proprietario non apre nulla:
-- la leggono solo rituali_pubblici e le funzioni interne (SECURITY DEFINER, già proprietario).
ALTER VIEW public.rituali_correnti SET (security_invoker = false);

-- ════ 3. Funzioni: solo id pubblici ══════════════════════════════════════════
-- Base: le versioni della 36a; cambiano solo le righe marcate «-- 36b:».

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
             'busy', EXISTS (SELECT 1 FROM telepathy_matches m
                              WHERE m.ended_at IS NULL
                                AND (m.user1_id = id_pubblico(u.id) OR m.user2_id = id_pubblico(u.id))))  -- 36b: solo l'id pubblico
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
  ELSIF p_session_online IS NOT NULL AND length(p_session_online) <= 255 THEN
    SELECT u.id, nome_pubblico(u.id, u.nickname) INTO o_sid, o_nome
      FROM online_users u
     WHERE id_pubblico(u.id) = p_session_online                                   -- 36b: solo l'id pubblico della lista
       AND u.last_seen::timestamptz > now() - interval '30 seconds'
     ORDER BY u.last_seen::timestamptz DESC LIMIT 1;
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
     WHERE (m.user1_id = id_pubblico(p_session_id) OR m.user2_id = id_pubblico(p_session_id))  -- 36b: solo l'id pubblico
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
            AND m.user1_id = id_pubblico(v.from_id)   -- 36b: solo l'id pubblico
            AND m.user2_id = id_pubblico(v.to_id)) THEN  -- 36b: idem per user2
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
