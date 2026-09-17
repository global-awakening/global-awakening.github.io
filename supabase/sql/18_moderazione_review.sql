-- ============================================================================
-- SP1 — correzioni dalla review indipendente — 2026-09-17
-- ============================================================================
-- Due rilievi della review su 16_moderazione.sql e 17_fix_delete_account.sql.
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) block_user — rate limit, come ogni altra scrittura di contenuto (B9)
-- ----------------------------------------------------------------------------
-- Era l'unica delle quattro RPC nuove senza limite: un account autenticato
-- poteva riempire user_blocks senza freno. Soglia generosa (50 blocchi in
-- 24h): un uso legittimo non ci arriva nemmeno lontanamente.
--
-- NON si aggiunge invece il controllo "il nickname bloccato deve esistere in
-- profiles", che pure la spec chiedeva: gli OSPITI non hanno riga profiles ma
-- POSSONO pubblicare nel feed (createPost non ha alcun gate su isGuest).
-- Quel controllo renderebbe impossibile bloccare un ospite molesto — cioe'
-- toglierebbe protezione proprio nel caso che ne ha piu' bisogno. La spec e'
-- stata corretta di conseguenza.

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_created
  ON user_blocks (blocker_nickname, created_at);

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

  -- Rate limit, pattern B9: conteggio sul created_at esistente, dopo auth e
  -- validazioni, prima dell'INSERT.
  IF (SELECT count(*) FROM user_blocks
       WHERE blocker_nickname = p_nickname
         AND created_at > now() - interval '24 hours') >= 50 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO user_blocks (blocker_nickname, blocked_nickname)
  VALUES (p_nickname, p_blocked_nickname)
  ON CONFLICT (blocker_nickname, blocked_nickname) DO NOTHING;
END $$;

GRANT EXECUTE ON FUNCTION public.block_user(text, text, text) TO anon;

-- ----------------------------------------------------------------------------
-- 2) delete_my_account — non cancellare i blocchi SUBITI
-- ----------------------------------------------------------------------------
-- 17_ cancellava user_blocks con "blocker = me OR blocked = me". Il secondo ramo
-- apriva un'evasione del blocco: chi molesta cancella l'account, si ri-registra
-- con lo stesso nickname (che torna libero) e ricompare alla vittima, che nel
-- frattempo ha perso il blocco senza saperlo.
-- I blocchi che HO impostato se ne vanno con me; quelli che ho SUBITO restano,
-- perche' sono la scelta di sicurezza di un'altra persona, non un mio dato.

CREATE OR REPLACE FUNCTION public.delete_my_account(
  p_nickname      text,
  p_password_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_sid   text;
BEGIN
  SELECT email, session_id INTO v_email, v_sid
    FROM profiles
   WHERE nickname = p_nickname AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  -- (a) Anonimizza i contenuti pubblici (preserva i thread altrui)
  UPDATE consciousness_posts    SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE consciousness_comments SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE ritual_comments        SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE rituals                SET creator         = 'Utente eliminato' WHERE creator = p_nickname;
  -- chat_messages NON esiste piu' (droppata da 08_drop_dead_tables.sql): vedi 17_.

  -- (b) Cancella i dati personali/privati
  DELETE FROM private_messages WHERE sender_name = p_nickname OR receiver_name = p_nickname;
  DELETE FROM notifications    WHERE user_nickname = p_nickname;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM telepathy_scores WHERE user_id = v_email;
    DELETE FROM magic_links      WHERE email   = v_email;
    DELETE FROM password_resets  WHERE email   = v_email;
  END IF;

  IF v_sid IS NOT NULL AND v_sid <> '' THEN
    DELETE FROM online_users      WHERE id = v_sid;
    DELETE FROM telepathy_queue   WHERE id = v_sid;
    DELETE FROM telepathy_invites WHERE from_id = v_sid OR to_id = v_sid;
  END IF;

  -- (c) SP1: se ne vanno solo i blocchi che ho impostato io. Quelli subiti
  -- restano, altrimenti cancellare l'account diventa un modo per farsi
  -- sbloccare da chi ci ha bloccati.
  DELETE FROM user_blocks WHERE blocker_nickname = p_nickname;
  UPDATE content_reports SET reporter_nickname = 'Utente eliminato' WHERE reporter_nickname = p_nickname;

  -- (d) Cancella l'identita'
  DELETE FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash;
END $$;

GRANT EXECUTE ON FUNCTION public.delete_my_account(text, text) TO anon;

-- ============================================================================
-- VERIFICA POST-APPLY
--   51 block_user in 24h dallo stesso utente -> 'rate_limited' al 51esimo
--   dopo delete_my_account, le righe user_blocks con blocked_nickname = utente
--   cancellato sono ancora presenti; quelle con blocker_nickname no
-- Test: node test-moderazione.js e node test-account-gdpr.js
-- ============================================================================
