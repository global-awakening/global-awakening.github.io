-- ============================================================================
-- B5 — Hardening validazione RPC "trustful" dei rituali — 2026-06-16
-- ============================================================================
-- Irrobustisce le 3 RPC dei rituali a validazione PARZIALE che usano un
-- session_id opaco (niente auth/hash): join_ritual, send_ritual_energy,
-- toggle_ritual_candle. Additivo e NON-breaking:
--   • i corpi originali sono preservati verbatim;
--   • i nuovi controlli rifiutano solo input ILLEGITTIMI (session vuoto/enorme,
--     rituale inesistente) che il client non invia mai per uso normale;
--   • join_ritual / send_ritual_energy: il client (app.jsx) ignora l'errore
--     della RPC (no try/catch sul risultato) → un RAISE non cambia la UX
--     (resta un no-op, come prima con UPDATE 0 righe);
--   • toggle_ritual_candle: il client già gestisce l'errore con un toast, ma
--     un sessionId reale (UUID) non supera mai il cap di lunghezza.
-- Hardening trasversale: SET search_path = public su ogni SECURITY DEFINER
-- (evita il dirottamento del search_path; già presente su toggle dal file 09).
-- Idempotente: CREATE OR REPLACE. Applicare in Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) join_ritual — append idempotente all'array participants (jsonb)
--    Aggiunto: session_id non vuoto + cap 255 + rituale esistente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_ritual(
  p_ritual_id  bigint,
  p_session_id text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'session_required';
  END IF;
  IF length(p_session_id) > 255 THEN
    RAISE EXCEPTION 'session_id_too_long';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rituals WHERE id = p_ritual_id) THEN
    RAISE EXCEPTION 'ritual_not_found';
  END IF;

  UPDATE rituals
     SET participants = participants || jsonb_build_array(p_session_id)
   WHERE id = p_ritual_id
     AND NOT (participants @> jsonb_build_array(p_session_id));
END;
$$;
GRANT EXECUTE ON FUNCTION join_ritual(bigint,text) TO anon;

-- ----------------------------------------------------------------------------
-- 2) send_ritual_energy — incremento controllato del campo energy
--    Aggiunto: rituale esistente (prima: UPDATE silenzioso a 0 righe).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_ritual_energy(
  p_ritual_id bigint,
  p_amount    int DEFAULT 10
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100 THEN
    RAISE EXCEPTION 'energy_out_of_range';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rituals WHERE id = p_ritual_id) THEN
    RAISE EXCEPTION 'ritual_not_found';
  END IF;

  UPDATE rituals SET energy = coalesce(energy, 0) + p_amount
   WHERE id = p_ritual_id;
END;
$$;
GRANT EXECUTE ON FUNCTION send_ritual_energy(bigint,int) TO anon;

-- ----------------------------------------------------------------------------
-- 3) toggle_ritual_candle — accende/spegne la candela (array jsonb candles)
--    Aggiunto: cap 255 sul session_id. Il resto è verbatim dal file 09.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toggle_ritual_candle(
  p_ritual_id  bigint,
  p_session_id text
)
RETURNS SETOF rituals
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'session_required';
  END IF;
  IF length(p_session_id) > 255 THEN
    RAISE EXCEPTION 'session_id_too_long';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rituals WHERE id = p_ritual_id) THEN
    RAISE EXCEPTION 'ritual_not_found';
  END IF;

  RETURN QUERY
    UPDATE rituals
       SET candles = CASE
         WHEN candles @> to_jsonb(array[p_session_id]) THEN
           coalesce(
             (SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
               WHERE e <> to_jsonb(p_session_id)),
             '[]'::jsonb)
         ELSE
           candles || to_jsonb(p_session_id)
       END
     WHERE id = p_ritual_id
     RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION toggle_ritual_candle(bigint,text) TO anon;

-- ============================================================================
-- VERIFICA POST-APPLY (da REST anon o SQL Editor):
--   • join_ritual(<id_esistente>, '')            -> ERRORE session_required
--   • join_ritual(<id_esistente>, repeat('x',300)) -> ERRORE session_id_too_long
--   • join_ritual(999999999, 's1')               -> ERRORE ritual_not_found
--   • send_ritual_energy(999999999, 10)          -> ERRORE ritual_not_found
--   • toggle_ritual_candle(999999999, 's1')      -> ERRORE ritual_not_found
--   • chiamate legittime (id reale, session valido) -> invariate, funzionano
-- Test automatico: node test-rituali-validazione.js (rosso prima dell'apply,
-- verde dopo).
-- ============================================================================
