-- RPC apply_level_change_if_both_agree
-- SECURITY DEFINER: chiude atomicamente il consenso sul cambio livello.
-- Pattern coerente con increment_telepathy_score / merge_telepathy_scores (2026-04-29).
--
-- Flusso:
--   1. Aggiorna la propria choice (in base a p_role).
--   2. Rilegge entrambe le choices con FOR UPDATE.
--   3. Decide: agreed | disagreement | pending | no_match.
--   4. Resetta le choices se agreed/disagreement, applica level se agreed.
--   5. Ritorna lo stato.

CREATE OR REPLACE FUNCTION public.apply_level_change_if_both_agree(
  p_match_id uuid,
  p_choice text,
  p_role text
)
RETURNS TABLE (
  out_status text,
  out_new_level text,
  out_sender_choice text,
  out_receiver_choice text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender   text;
  v_receiver text;
  v_level    text;
BEGIN
  IF p_role NOT IN ('sender','receiver') THEN
    RAISE EXCEPTION 'p_role must be sender|receiver, got %', p_role;
  END IF;
  IF p_choice NOT IN ('numbers','words','shapes','continue') THEN
    RAISE EXCEPTION 'p_choice invalid: %', p_choice;
  END IF;

  IF p_role = 'sender' THEN
    UPDATE telepathy_matches
       SET level_change_choice_sender = p_choice
     WHERE id = p_match_id;
  ELSE
    UPDATE telepathy_matches
       SET level_change_choice_receiver = p_choice
     WHERE id = p_match_id;
  END IF;

  SELECT level_change_choice_sender,
         level_change_choice_receiver,
         level
    INTO v_sender, v_receiver, v_level
    FROM telepathy_matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_match'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_sender IS NULL OR v_receiver IS NULL THEN
    RETURN QUERY SELECT 'pending'::text, v_level, v_sender, v_receiver;
    RETURN;
  END IF;

  IF v_sender = v_receiver AND v_sender <> 'continue' THEN
    UPDATE telepathy_matches
       SET level = v_sender,
           level_change_choice_sender = NULL,
           level_change_choice_receiver = NULL
     WHERE id = p_match_id;
    RETURN QUERY SELECT 'agreed'::text, v_sender, v_sender, v_receiver;
  ELSE
    UPDATE telepathy_matches
       SET level_change_choice_sender = NULL,
           level_change_choice_receiver = NULL
     WHERE id = p_match_id;
    RETURN QUERY SELECT 'disagreement'::text, v_level, v_sender, v_receiver;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_level_change_if_both_agree(uuid, text, text) TO anon;
