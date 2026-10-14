-- 39a — il motore della telepatia passa dal server (additiva: le tabelle restano aperte, le chiude la 39b).
-- Spec: docs/superpowers/specs/2026-10-13-motore-telepatia-chiuso-design.md
-- Ogni funzione verifica chi chiama: solo i due giocatori di una partita la vedono o la toccano.
-- Ritorno: 39a_ritorno.sql.

-- ════ A. Chat legata alla partita ═════════════════════════════════════════════
-- Messaggi orfani (partita già cancellata, o match_id che non è nemmeno un uuid): via, poi FK in cascata.
DELETE FROM telepathy_chat c
 WHERE c.match_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT EXISTS (SELECT 1 FROM telepathy_matches m WHERE m.id::text = c.match_id::text);
-- Le tre policy auth.uid() (inerti: RLS spenta, auth.uid() è null) citano match_id e bloccano il cambio di tipo: via.
DROP POLICY IF EXISTS "Solo i partecipanti possono leggere la chat" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono inviare messaggi" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat;
ALTER TABLE telepathy_chat ALTER COLUMN match_id TYPE uuid USING match_id::text::uuid;
ALTER TABLE telepathy_chat DROP CONSTRAINT IF EXISTS telepathy_chat_match_fk;
ALTER TABLE telepathy_chat ADD CONSTRAINT telepathy_chat_match_fk
  FOREIGN KEY (match_id) REFERENCES telepathy_matches(id) ON DELETE CASCADE;

-- ════ B. Helper interni ═══════════════════════════════════════════════════════
-- Il mio id pubblico se l'identità regge, altrimenti NULL (mai un errore: il polling gira ogni 2 s).
CREATE OR REPLACE FUNCTION public.partita_io(p_session_id text, p_password_hash text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT chiavi_sid_valido(p_session_id) THEN RETURN NULL; END IF;
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  RETURN id_pubblico(p_session_id);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.partita_io(text, text) FROM PUBLIC, anon, authenticated;

-- Ruolo effettivo nel round corrente: lo stesso roleForRound dell'app (scambio ogni 3 round).
CREATE OR REPLACE FUNCTION public.partita_ruolo(m telepathy_matches, p_io text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN b.base IS NULL THEN NULL
              WHEN (coalesce(m.round_count, 0) / 3) % 2 = 0 THEN b.base
              WHEN b.base = 'sender' THEN 'receiver' ELSE 'sender' END
    FROM (SELECT CASE WHEN p_io = m.user1_id THEN m.user1_role
                      WHEN p_io = m.user2_id THEN m.user2_role END AS base) b;
$$;
REVOKE ALL ON FUNCTION public.partita_ruolo(telepathy_matches, text) FROM PUBLIC, anon, authenticated;

-- Le colonne che l'app usa. Il simbolo resta nascosto a chi indovina finché non ha risposto.
CREATE OR REPLACE FUNCTION public.partita_vista(m telepathy_matches, p_io text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'created_at', m.created_at,
    'user1_id', m.user1_id, 'user1_nickname', m.user1_nickname, 'user1_role', m.user1_role,
    'user2_id', m.user2_id, 'user2_nickname', m.user2_nickname, 'user2_role', m.user2_role,
    'level', m.level, 'round_count', coalesce(m.round_count, 0),
    'level_change_choice_sender', m.level_change_choice_sender,
    'sender_symbol', CASE WHEN partita_ruolo(m, p_io) = 'receiver' AND m.receiver_guess IS NULL
                          THEN NULL ELSE m.sender_symbol END,
    'simbolo_inviato', m.sender_symbol IS NOT NULL,
    'receiver_guess', m.receiver_guess,
    'ended_at', m.ended_at, 'ended_by', m.ended_by, 'giocato', m.giocato, 'da_invito', m.da_invito);
$$;
REVOKE ALL ON FUNCTION public.partita_vista(telepathy_matches, text) FROM PUBLIC, anon, authenticated;

-- Le tre pulizie che faceva findPartner sulle partite di chiunque (stesse finestre).
CREATE OR REPLACE FUNCTION public.partite_pulizia() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM telepathy_matches
   WHERE ended_at < now() - interval '60 seconds'
      OR ultima_attivita < now() - interval '10 minutes'
      OR (NOT giocato AND created_at < now() - interval '5 minutes');
$$;
REVOKE ALL ON FUNCTION public.partite_pulizia() FROM PUBLIC, anon, authenticated;

-- «Viva» per l'abbinamento, come il vivo() di findPartner: non chiusa e non un orfano d'invito mai giocato.
CREATE OR REPLACE FUNCTION public.partita_viva_di(p_io text) RETURNS telepathy_matches
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM telepathy_matches
   WHERE (user1_id = p_io OR user2_id = p_io) AND ended_at IS NULL AND NOT (da_invito AND NOT giocato)
   ORDER BY created_at LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.partita_viva_di(text) FROM PUBLIC, anon, authenticated;

-- ════ C. Lettura ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.partita_mia(p_session_id text, p_password_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  IF v_io IS NULL THEN RETURN NULL; END IF;
  PERFORM partite_pulizia();
  m := partita_viva_di(v_io);
  IF m.id IS NULL THEN RETURN NULL; END IF;
  RETURN partita_vista(m, v_io);
END $$;
REVOKE ALL ON FUNCTION public.partita_mia(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_mia(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.partita_stato(p_session_id text, p_password_hash text, p_match_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  IF v_io IS NULL OR p_match_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO m FROM telepathy_matches WHERE id = p_match_id AND (user1_id = v_io OR user2_id = v_io);
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN partita_vista(m, v_io);
END $$;
REVOKE ALL ON FUNCTION public.partita_stato(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_stato(text, text, uuid) TO anon, authenticated;

-- ════ D. Nascita della partita ═════════════════════════════════════════════════
-- Un lock per persona, in ordine fisso: due abbinamenti simultanei sulla stessa persona si mettono in fila.
CREATE OR REPLACE FUNCTION public.partita_blocca(a text, b text) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('telepatia:' || least(a, b)));
  PERFORM pg_advisory_xact_lock(hashtext('telepatia:' || greatest(a, b)));
END $$;
REVOKE ALL ON FUNCTION public.partita_blocca(text, text) FROM PUBLIC, anon, authenticated;

-- Una partita nata da un invito già accettato, ma di cui chi ha invitato non è ancora entrato:
-- partita_viva_di non la conta (è un orfano d'invito possibile), ma la persona è già impegnata.
CREATE OR REPLACE FUNCTION public.partita_invito_in_corso(p_io text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM telepathy_matches m JOIN telepathy_invites i ON i.match_id = m.id AND i.status = 'accepted'
     WHERE (m.user1_id = p_io OR m.user2_id = p_io) AND m.ended_at IS NULL AND m.da_invito AND NOT m.giocato);
$$;
REVOKE ALL ON FUNCTION public.partita_invito_in_corso(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.partita_crea_da_coda(p_session_id text, p_password_hash text, p_nickname text, p_altro text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash);
        v_nome text := chiavi_chi_sono(p_session_id, p_password_hash, p_nickname);
        v_ora bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
        q telepathy_queue; m telepathy_matches; v_ruolo text;
BEGIN
  IF v_io IS NULL OR v_nome IS NULL OR p_altro IS NULL OR p_altro = v_io THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  PERFORM partita_blocca(v_io, p_altro);
  PERFORM partite_pulizia();
  -- L'altro mi ha abbinato un istante prima: è quella la mia partita.
  m := partita_viva_di(v_io);
  IF m.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io)); END IF;
  SELECT * INTO q FROM telepathy_queue
   WHERE chiavi_sid_valido(id) AND id_pubblico(id) = p_altro AND timestamp >= v_ora - 60000;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_in_coda'); END IF;
  IF (partita_viva_di(p_altro)).id IS NOT NULL OR partita_invito_in_corso(p_altro) OR partita_invito_in_corso(v_io) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'occupato'); END IF;
  IF telepatia_bloccati(p_session_id, v_nome, q.id, q.nickname) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'bloccato');
  END IF;
  -- Una partita chiusa della stessa coppia farebbe scattare telepathy_matches_pair_unique.
  DELETE FROM telepathy_matches
   WHERE least(user1_id, user2_id) = least(v_io, p_altro) AND greatest(user1_id, user2_id) = greatest(v_io, p_altro)
     AND ended_at IS NOT NULL;
  v_ruolo := CASE WHEN random() < 0.5 THEN 'sender' ELSE 'receiver' END;
  BEGIN
    INSERT INTO telepathy_matches (user1_id, user1_nickname, user1_role, user2_id, user2_nickname, user2_role, level, round_count)
    VALUES (p_altro, q.nickname, CASE v_ruolo WHEN 'sender' THEN 'receiver' ELSE 'sender' END,
            v_io, v_nome, v_ruolo, 'lvl3', 0)
    RETURNING * INTO m;
  EXCEPTION WHEN unique_violation THEN
    -- La coppia ha già una partita aperta (es. un orfano d'invito): non si gioca su quella.
    RETURN jsonb_build_object('ok', false, 'motivo', 'occupato');
  END;
  DELETE FROM telepathy_queue WHERE id IN (p_session_id, q.id);
  RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.partita_crea_da_coda(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_crea_da_coda(text, text, text, text) TO anon, authenticated;

-- La partita dell'invito la crea il server; poi decide la respond_telepathy_invite di sempre.
CREATE OR REPLACE FUNCTION public.accetta_invito_partita(p_invite_id uuid, p_session_id text, p_password_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v telepathy_invites; m telepathy_matches; r jsonb; v_ruolo text; v_io text; v_da text;
BEGIN
  -- Come respond_telepathy_invite: una credenziale vecchia è un errore «Auth failed» (l'app lo riconosce).
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  SELECT * INTO v FROM telepathy_invites WHERE id = p_invite_id AND to_id = p_session_id;
  IF NOT FOUND OR v.status <> 'pending' OR v.expires_at <= now() THEN
    -- Il motivo giusto (non_trovato, scaduto, annullato…) lo sa già respond_telepathy_invite.
    RETURN respond_telepathy_invite(p_invite_id, p_session_id, p_password_hash, true, NULL);
  END IF;
  v_io := id_pubblico(p_session_id); v_da := id_pubblico(v.from_id);
  PERFORM partita_blocca(v_io, v_da);
  DELETE FROM telepathy_matches
   WHERE least(user1_id, user2_id) = least(v_io, v_da) AND greatest(user1_id, user2_id) = greatest(v_io, v_da)
     AND ended_at IS NOT NULL;
  -- Chi è già in una partita (anche appena nata dalla coda) non può accettare un secondo invito.
  IF (partita_viva_di(v_io)).id IS NOT NULL OR (partita_viva_di(v_da)).id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'in_match');
  END IF;
  v_ruolo := CASE WHEN random() < 0.5 THEN 'sender' ELSE 'receiver' END;
  BEGIN
    INSERT INTO telepathy_matches (user1_id, user1_nickname, user1_role, user2_id, user2_nickname, user2_role, level, round_count, da_invito)
    VALUES (v_da, v.from_name, CASE v_ruolo WHEN 'sender' THEN 'receiver' ELSE 'sender' END,
            v_io, v.to_name, v_ruolo, 'lvl3', 0, true)
    RETURNING * INTO m;
  EXCEPTION WHEN unique_violation THEN
    -- Un altro telefono ha appena accettato, o la coppia ha già una partita aperta: respond lo dice col suo motivo.
    RETURN respond_telepathy_invite(p_invite_id, p_session_id, p_password_hash, true, NULL);
  END;
  r := respond_telepathy_invite(p_invite_id, p_session_id, p_password_hash, true, m.id);
  IF NOT coalesce((r->>'ok')::boolean, false) THEN
    DELETE FROM telepathy_matches WHERE id = m.id;
    RETURN r;
  END IF;
  RETURN r || jsonb_build_object('partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.accetta_invito_partita(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accetta_invito_partita(uuid, text, text) TO anon, authenticated;

-- Chi ha invitato arriva: il «tocco» che segna la partita come giocata (trigger della 32a).
CREATE OR REPLACE FUNCTION public.partita_entra(p_session_id text, p_password_hash text, p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  IF v_io IS NULL OR p_match_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  UPDATE telepathy_matches SET round_count = round_count
   WHERE id = p_match_id AND (user1_id = v_io OR user2_id = v_io) AND ended_at IS NULL
  RETURNING * INTO m;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.partita_entra(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_entra(text, text, uuid) TO anon, authenticated;
