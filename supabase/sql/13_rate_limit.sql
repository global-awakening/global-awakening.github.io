-- ============================================================================
-- B9 — Rate-limit DB mirato sulle scritture di contenuto — 2026-06-16
-- ============================================================================
-- Limita la frequenza di create_ritual / create_ritual_comment / send_private_message
-- per prevenire spam e abuso ACCIDENTALE (doppio-click, loop client buggati).
--
-- LIMITE NOTO (deliberato): le RPC Postgres non vedono l'IP del chiamante, quindi
-- il conteggio si basa sull'identità applicativa (creator_id / author_nickname /
-- sender_name autenticato). È efficace contro spam casual e bug, NON contro un
-- attaccante che ruota l'identità — per quello servirebbe un layer con l'IP
-- (Edge Function / Cloudflare), fuori scope qui.
--
-- Implementazione SENZA nuove tabelle: si conta le righe già scritte nella
-- finestra usando il created_at esistente. Il check è DOPO auth + validazioni
-- (gli input malformati vengono respinti prima e non consumano budget) e PRIMA
-- dell'INSERT. Soglie generose per non dare falsi positivi sull'uso legittimo:
--   • create_ritual          : max 5  / 10 min per creator_id
--   • create_ritual_comment  : max 15 / 1 min  per author_nickname
--   • send_private_message    : max 20 / 1 min  per sender_name (autenticato)
-- Corpi (auth + validazioni di 12_ e 05_) preservati verbatim. Idempotente.
-- ============================================================================

-- Indici a supporto del conteggio rate-limit (chiave + created_at): trascurabili
-- ai volumi attuali, evitano scansioni quando le tabelle cresceranno. Idempotenti.
CREATE INDEX IF NOT EXISTS idx_rituals_creator_created
  ON rituals (creator_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ritual_comments_author_created
  ON ritual_comments (author_nickname, created_at);
CREATE INDEX IF NOT EXISTS idx_private_messages_sender_created
  ON private_messages (sender_name, created_at);

-- ----------------------------------------------------------------------------
-- 1) create_ritual — rate-limit per creator_id (5 / 10 min)
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
  IF EXISTS (SELECT 1 FROM profiles WHERE nickname = p_creator) THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE nickname = p_creator AND password_hash = p_password_hash) THEN
      RAISE EXCEPTION 'Auth failed';
    END IF;
  END IF;

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

  -- Rate-limit (B9): max 5 rituali per creator_id negli ultimi 10 minuti.
  IF p_creator_id IS NOT NULL AND (
       SELECT count(*) FROM rituals
        WHERE creator_id = p_creator_id
          AND created_at > now() - interval '10 minutes'
     ) >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
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
-- 2) create_ritual_comment — rate-limit per author_nickname (15 / 1 min)
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

  -- Rate-limit (B9): max 15 commenti per author_nickname nell'ultimo minuto.
  IF p_author_nickname IS NOT NULL AND (
       SELECT count(*) FROM ritual_comments
        WHERE author_nickname = p_author_nickname
          AND created_at > now() - interval '1 minute'
     ) >= 15 THEN
    RAISE EXCEPTION 'rate_limited';
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

-- ----------------------------------------------------------------------------
-- 3) send_private_message — rate-limit per sender_name autenticato (20 / 1 min)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_private_message(
  p_sender_id            text,
  p_sender_name          text,
  p_receiver_name        text,
  p_content              text,
  p_sender_password_hash text
)
RETURNS private_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg private_messages%ROWTYPE;
  v_clean_content text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE nickname = p_sender_name AND password_hash = p_sender_password_hash
  ) THEN
    RAISE EXCEPTION 'Sender auth failed';
  END IF;

  v_clean_content := btrim(p_content);
  IF v_clean_content IS NULL OR v_clean_content = '' THEN RAISE EXCEPTION 'Empty content'; END IF;
  IF p_receiver_name IS NULL OR p_receiver_name = '' THEN RAISE EXCEPTION 'Empty receiver_name'; END IF;
  IF length(v_clean_content) > 2000 THEN RAISE EXCEPTION 'Content too long'; END IF;

  -- Rate-limit (B9): max 20 messaggi per sender_name (autenticato) nell'ultimo minuto.
  IF p_sender_name IS NOT NULL AND (
       SELECT count(*) FROM private_messages
        WHERE sender_name = p_sender_name
          AND created_at > now() - interval '1 minute'
     ) >= 20 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO private_messages (sender_id, sender_name, receiver_name, content, is_read)
  VALUES (p_sender_id, p_sender_name, p_receiver_name, v_clean_content, false)
  RETURNING * INTO v_msg;

  INSERT INTO notifications (user_nickname, type, message)
  VALUES (p_receiver_name, 'private_message', p_sender_name || ' ti ha inviato un messaggio privato');

  RETURN v_msg;
END $$;
GRANT EXECUTE ON FUNCTION public.send_private_message(text, text, text, text, text) TO anon;

-- ============================================================================
-- VERIFICA POST-APPLY (test: node test-rituali-validazione.js — sezione rate-limit)
--   • 5 create_ritual con stesso creator_id -> OK; il 6° -> ERRORE rate_limited
--   • le scritture legittime sotto soglia restano invariate
-- ============================================================================
