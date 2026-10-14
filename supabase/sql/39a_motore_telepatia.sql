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
