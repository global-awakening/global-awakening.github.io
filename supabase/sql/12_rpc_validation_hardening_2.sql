-- ============================================================================
-- B5 round 2 — Hardening validazione create_ritual / create_ritual_comment — 2026-06-16
-- ============================================================================
-- Completa B5 sulle 2 RPC dei rituali con contenuto (Step B, con hash auth).
-- Additivo e NON-breaking: corpi Step B (07_) preservati verbatim, anti-
-- impersonazione resta la PRIMA barriera; aggiunte solo validazioni di formato
-- ALLINEATE ai valori reali inviati dal client (src/app.jsx):
--   • type ∈ {consciousness,dna,lightbody,unity,ascension}  (ritualTypes, app.jsx:120)
--     NULL → 'consciousness' (default invariato) → accettato;
--   • sacred_number ∈ [1,1000]  (il client offre 1..108, sacredNumbers app.jsx:128)
--     NULL → 11 (default invariato) → accettato;
--   • name: non vuoto (già c'era) + cap 200  (form maxLength=80, app.jsx:4359);
--   • description: cap 5000;
--   • date/time: NOT NULL  (il client già li richiede, createRitual app.jsx:2459);
--   • create_ritual_comment: cap 200 su author_nickname (resto già validato in 07_).
-- Il client ignora/gestisce gli errori e non invia mai input fuori da questi
-- limiti → nessun impatto sul flusso legittimo.
-- Idempotente: CREATE OR REPLACE. Applicare in Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) create_ritual (firma 10-arg Step B, con p_password_hash)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_ritual(
  p_creator         text,
  p_creator_id      text,
  p_name            text,
  p_description     text,
  p_type            text,
  p_sacred_number   int,
  p_date            date,
  p_time            time,
  p_duration        int,
  p_password_hash   text
)
RETURNS SETOF rituals
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anti-impersonazione condizionale (verbatim da 07_): PRIMA barriera.
  IF EXISTS (SELECT 1 FROM profiles WHERE nickname = p_creator) THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE nickname = p_creator AND password_hash = p_password_hash) THEN
      RAISE EXCEPTION 'Auth failed';
    END IF;
  END IF;

  -- Validazione di formato (B5 round 2)
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  IF length(p_name) > 200 THEN
    RAISE EXCEPTION 'name_too_long';
  END IF;
  IF length(coalesce(p_description, '')) > 5000 THEN
    RAISE EXCEPTION 'description_too_long';
  END IF;
  IF coalesce(p_type, 'consciousness') NOT IN ('consciousness','dna','lightbody','unity','ascension') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;
  IF p_sacred_number IS NOT NULL AND (p_sacred_number < 1 OR p_sacred_number > 1000) THEN
    RAISE EXCEPTION 'sacred_number_out_of_range';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'date_required';
  END IF;
  IF p_time IS NULL THEN
    RAISE EXCEPTION 'time_required';
  END IF;
  IF p_duration IS NULL OR p_duration < 1 OR p_duration > 1440 THEN
    RAISE EXCEPTION 'duration_out_of_range';
  END IF;

  RETURN QUERY
    INSERT INTO rituals (
      creator, creator_id, name, description, type,
      sacred_number, date, time, duration, participants, energy
    )
    VALUES (
      coalesce(nullif(p_creator, ''), 'Anonymous'),
      p_creator_id,
      p_name,
      coalesce(p_description, ''),
      coalesce(p_type, 'consciousness'),
      coalesce(p_sacred_number, 11),
      p_date,
      p_time,
      p_duration,
      jsonb_build_array(p_creator_id),
      0
    )
    RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION create_ritual(text,text,text,text,text,int,date,time,int,text) TO anon;

-- ----------------------------------------------------------------------------
-- 2) create_ritual_comment (firma 4-arg Step B, con p_password_hash)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_ritual_comment(
  p_ritual_id        bigint,
  p_author_nickname  text,
  p_content          text,
  p_password_hash    text
)
RETURNS SETOF ritual_comments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anti-impersonazione condizionale (verbatim da 07_): PRIMA barriera.
  IF EXISTS (SELECT 1 FROM profiles WHERE nickname = p_author_nickname) THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE nickname = p_author_nickname AND password_hash = p_password_hash) THEN
      RAISE EXCEPTION 'Auth failed';
    END IF;
  END IF;

  IF coalesce(trim(p_content), '') = '' THEN
    RAISE EXCEPTION 'content_required';
  END IF;
  IF length(p_content) > 2000 THEN
    RAISE EXCEPTION 'content_too_long';
  END IF;
  IF length(coalesce(p_author_nickname, '')) > 200 THEN
    RAISE EXCEPTION 'author_too_long';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rituals WHERE id = p_ritual_id) THEN
    RAISE EXCEPTION 'ritual_not_found';
  END IF;

  RETURN QUERY
    INSERT INTO ritual_comments (ritual_id, author_nickname, content)
    VALUES (p_ritual_id,
            coalesce(nullif(p_author_nickname, ''), 'Anonymous'),
            p_content)
    RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION create_ritual_comment(bigint,text,text,text) TO anon;

-- ============================================================================
-- VERIFICA POST-APPLY (test automatico: node test-rituali-validazione.js)
--   • create_ritual(..., p_type:'malware', ...)       -> ERRORE invalid_type
--   • create_ritual(..., p_sacred_number:999999, ...)  -> ERRORE sacred_number_out_of_range
--   • create_ritual(..., p_name:<300 char>, ...)       -> ERRORE name_too_long
--   • create_ritual(..., p_date:null, ...)             -> ERRORE date_required
--   • create_ritual(..., type valido, sacred 108)      -> 200, riga creata
-- ============================================================================
