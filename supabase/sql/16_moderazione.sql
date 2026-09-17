-- ============================================================================
-- /!\  ATTENZIONE — QUESTO FILE E' STATO IN PARTE SUPERATO DA 18_
-- ============================================================================
-- block_user qui sotto NON ha il rate limit: la versione corrente e' in
-- supabase/sql/18_moderazione_review.sql. Se riapplichi questo file, riapplica
-- SUBITO DOPO anche 18_, altrimenti il rate limit sparisce in silenzio e
-- nessun test lo segnala al momento dell'apply.
-- (E' la stessa trappola descritta al BLOCCO 4 per send_private_message.)
-- ============================================================================

-- ============================================================================
-- SP1 — Moderazione: blocco utenti e segnalazione contenuti — 2026-09-17
-- ============================================================================
-- Requisito Google Play (policy UGC): ogni app con contenuti generati dagli
-- utenti e interazione fra utenti deve offrire segnalazione e blocco in-app.
-- Spec:  docs/superpowers/specs/2026-09-17-moderazione-segnalazione-blocco-design.md
-- Piano: docs/superpowers/plans/2026-09-17-moderazione-segnalazione-blocco.md
-- Test:  node test-moderazione.js  → atteso 15/15
--
-- Pattern: RPC SECURITY DEFINER autenticate con (nickname, password_hash),
-- identico a Messaggi Step B e alle RPC GDPR. Solo account registrati (gli
-- ospiti non hanno riga profiles). Idempotente: rieseguibile senza errori.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BLOCCO 1 — Tabelle
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_blocks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_nickname text NOT NULL,
  blocked_nickname text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_nickname, blocked_nickname)
);

-- content_snapshot NON e' ridondanza: il contenuto segnalato puo' sparire prima
-- della revisione (la chat telepatia viene cancellata a fine match, e l'autore
-- puo' rimuovere i propri contenuti). Senza la copia del testo, la segnalazione
-- arriverebbe a moderazione puntando al nulla.
CREATE TABLE IF NOT EXISTS content_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_nickname text NOT NULL,
  target_nickname   text,
  content_type      text NOT NULL,
  content_id        text,
  content_snapshot  text,
  reason            text NOT NULL,
  details           text,
  status            text NOT NULL DEFAULT 'open',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_type_chk CHECK (content_type IN
    ('post','post_comment','ritual','ritual_comment','private_message','telepathy_chat','profile')),
  CONSTRAINT content_reports_reason_chk CHECK (reason IN
    ('spam','harassment','hate','sexual','violence','self_harm','other')),
  CONSTRAINT content_reports_status_chk CHECK (status IN
    ('open','reviewed','actioned','dismissed'))
);

-- Indici: lookup del blocco (hot path di ogni send_private_message) e finestra
-- del rate-limit segnalazioni. Stesso criterio degli indici introdotti da B9.
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker
  ON user_blocks (blocker_nickname);
CREATE INDEX IF NOT EXISTS idx_user_blocks_pair
  ON user_blocks (blocker_nickname, blocked_nickname);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter_created
  ON content_reports (reporter_nickname, created_at);

-- RLS ON senza NESSUNA policy: anon non legge e non scrive direttamente, si
-- passa solo dalle RPC SECURITY DEFINER sotto. content_reports in particolare
-- non deve essere leggibile: contiene chi ha segnalato chi.
ALTER TABLE user_blocks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- BLOCCO 2 — RPC di blocco
-- ----------------------------------------------------------------------------

-- 1) block_user — idempotente, rifiuta auto-blocco e nickname vuoto
CREATE OR REPLACE FUNCTION public.block_user(
  p_nickname         text,
  p_password_hash    text,
  p_blocked_nickname text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  IF p_blocked_nickname IS NULL OR btrim(p_blocked_nickname) = '' THEN
    RAISE EXCEPTION 'Empty blocked_nickname';
  END IF;
  IF p_blocked_nickname = p_nickname THEN
    RAISE EXCEPTION 'cannot block yourself';
  END IF;

  INSERT INTO user_blocks (blocker_nickname, blocked_nickname)
  VALUES (p_nickname, p_blocked_nickname)
  ON CONFLICT (blocker_nickname, blocked_nickname) DO NOTHING;
END $$;

GRANT EXECUTE ON FUNCTION public.block_user(text, text, text) TO anon;

-- 2) unblock_user
CREATE OR REPLACE FUNCTION public.unblock_user(
  p_nickname         text,
  p_password_hash    text,
  p_blocked_nickname text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  DELETE FROM user_blocks
   WHERE blocker_nickname = p_nickname
     AND blocked_nickname = p_blocked_nickname;
END $$;

GRANT EXECUTE ON FUNCTION public.unblock_user(text, text, text) TO anon;

-- 3) get_my_blocks — i nickname che HO bloccato
CREATE OR REPLACE FUNCTION public.get_my_blocks(
  p_nickname      text,
  p_password_hash text
)
RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  RETURN QUERY
    SELECT b.blocked_nickname FROM user_blocks b
     WHERE b.blocker_nickname = p_nickname
     ORDER BY b.created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_blocks(text, text) TO anon;

-- ----------------------------------------------------------------------------
-- BLOCCO 3 — RPC di segnalazione
-- ----------------------------------------------------------------------------

-- 4) report_content — segnalazione tipizzata, con snapshot del testo segnalato
CREATE OR REPLACE FUNCTION public.report_content(
  p_reporter_nickname text,
  p_password_hash     text,
  p_target_nickname   text,
  p_content_type      text,
  p_content_id        text,
  p_content_snapshot  text,
  p_reason            text,
  p_details           text
)
RETURNS content_reports
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row content_reports%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE nickname = p_reporter_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  IF p_content_type IS NULL OR p_content_type NOT IN
     ('post','post_comment','ritual','ritual_comment','private_message','telepathy_chat','profile') THEN
    RAISE EXCEPTION 'invalid_content_type';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN
     ('spam','harassment','hate','sexual','violence','self_harm','other') THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  -- Rate-limit, stesso pattern di 13_rate_limit.sql (B9): nessuna tabella nuova,
  -- si contano le righe gia' scritte nella finestra usando created_at. Il check
  -- sta DOPO auth e validazioni (gli input malformati non consumano budget) e
  -- PRIMA dell'INSERT.
  IF (SELECT count(*) FROM content_reports
       WHERE reporter_nickname = p_reporter_nickname
         AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO content_reports (reporter_nickname, target_nickname, content_type,
                               content_id, content_snapshot, reason, details)
  VALUES (p_reporter_nickname, p_target_nickname, p_content_type, p_content_id,
          left(p_content_snapshot, 2000), p_reason, left(p_details, 1000))
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.report_content(text, text, text, text, text, text, text, text) TO anon;

-- ----------------------------------------------------------------------------
-- BLOCCO 4 — Blocco applicato lato server sui messaggi privati
-- ----------------------------------------------------------------------------
-- ATTENZIONE: il corpo di send_private_message qui sotto parte da quello di
-- 13_rate_limit.sql (B9), NON da 05_messaggi_step_b.sql. La versione di 05_ non
-- ha il rate-limit: riapplicarla lo cancellerebbe in silenzio, senza che nessun
-- test se ne accorga. Il test 15 di test-moderazione.js sorveglia proprio questo.

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

  -- SP1: blocco in entrambe le direzioni. Chi e' stato bloccato non raggiunge
  -- chi lo ha bloccato; e chi ha bloccato non scrive a chi ha bloccato.
  IF EXISTS (
    SELECT 1 FROM user_blocks
     WHERE (blocker_nickname = p_receiver_name AND blocked_nickname = p_sender_name)
        OR (blocker_nickname = p_sender_name   AND blocked_nickname = p_receiver_name)
  ) THEN
    RAISE EXCEPTION 'Blocked by recipient';
  END IF;

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

-- get_my_messages — corpo di 05_messaggi_step_b.sql + esclusione dei bloccati.
-- Lo storico NON viene cancellato: semplicemente non viene servito finche' il
-- blocco e' attivo. Uno sblocco lo fa riapparire.
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
    SELECT m.* FROM private_messages m
     WHERE (m.sender_name = p_nickname OR m.receiver_name = p_nickname)
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
          WHERE b.blocker_nickname = p_nickname
            AND b.blocked_nickname IN (m.sender_name, m.receiver_name)
       )
     ORDER BY m.created_at;
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_messages(text, text) TO anon;

-- ============================================================================
-- VERIFICA POST-APPLY (da REST anon)
--   GET  /rest/v1/user_blocks?select=*      -> 0 righe (RLS ON, nessuna policy)
--   GET  /rest/v1/content_reports?select=*  -> 0 righe
--   POST /rest/v1/rpc/block_user            -> 200
--   POST /rest/v1/rpc/report_content        -> 200, status='open'
--   POST /rest/v1/rpc/send_private_message  -> 'Blocked by recipient' se bloccato
-- Test completo: node test-moderazione.js  → atteso 15 passati, 0 falliti
-- ============================================================================
