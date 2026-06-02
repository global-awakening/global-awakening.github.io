-- ============================================================================
-- Messaggi privati — Step B: privacy reale lettura + anti-impersonazione
-- Riferimento: MESSAGGI_AUDIT.md (Step B). Segue Step A (04_messaggi_step_a.sql).
-- Decisione: messaggi privati SOLO per account registrati (guest esclusi).
-- password_hash = credenziale di auth nelle RPC (SHA-256 attuale, C1; migliorerà).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BLOCCO 1 — FASE 1 (eseguire ORA): RPC nuove, non breaking
--   (convivono con SELECT pubblica + send_private_message 4-param di Step A)
-- ----------------------------------------------------------------------------

-- Lettura autenticata: ritorna solo l'inbox del chiamante se (nickname, hash) matcha profiles
CREATE OR REPLACE FUNCTION public.get_my_messages(
  p_nickname      text,
  p_password_hash text
)
RETURNS SETOF private_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  RETURN QUERY
    SELECT * FROM private_messages
     WHERE sender_name = p_nickname OR receiver_name = p_nickname
     ORDER BY created_at;
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_messages(text, text) TO anon;

-- Invio autenticato (overload 5-param): valida il mittente -> chiude impersonazione (VULN-4)
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

  INSERT INTO private_messages (sender_id, sender_name, receiver_name, content, is_read)
  VALUES (p_sender_id, p_sender_name, p_receiver_name, v_clean_content, false)
  RETURNING * INTO v_msg;

  INSERT INTO notifications (user_nickname, type, message)
  VALUES (p_receiver_name, 'private_message', p_sender_name || ' ti ha inviato un messaggio privato');

  RETURN v_msg;
END $$;

GRANT EXECUTE ON FUNCTION public.send_private_message(text, text, text, text, text) TO anon;

-- ----------------------------------------------------------------------------
-- BLOCCO 2 — FASE 3 (eseguire SOLO dopo il deploy del client che usa le RPC):
--   chiude la lettura pubblica e rimuove la vecchia send vulnerabile all'impersonazione
-- ----------------------------------------------------------------------------
-- DROP POLICY IF EXISTS private_messages_select_public ON private_messages;
-- DROP FUNCTION IF EXISTS public.send_private_message(text, text, text, text);
--
-- Esito atteso dopo il BLOCCO 2:
--   - SELECT diretta anon su private_messages -> niente policy SELECT -> 0 righe / negata
--   - lettura solo via get_my_messages (auth con password_hash)
--   - invio solo via send_private_message 5-param (mittente validato)

-- ----------------------------------------------------------------------------
-- BLOCCO 3 — Verifica (post FASE 3, da REST anon)
-- ----------------------------------------------------------------------------
-- GET  /rest/v1/private_messages?select=*            -> 0 righe / 401 (lettura pubblica chiusa)
-- POST /rest/v1/rpc/get_my_messages  (hash giusto)   -> 200, solo il proprio inbox
-- POST /rest/v1/rpc/get_my_messages  (hash errato)   -> errore 'Auth failed'
-- POST /rest/v1/rpc/send_private_message (5 arg, hash errato) -> errore 'Sender auth failed'
