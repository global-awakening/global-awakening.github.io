-- ============================================================================
-- 22_delete_account_push.sql
--
-- `delete_my_account` non conosceva `push_subscriptions`, creata da 19. Senza questa riga chi
-- cancella l'account continua a ricevere notifiche di rituali su un telefono che non ha piu'
-- un account: l'abbonamento sopravvive al suo proprietario.
--
-- Verificato prima di scrivere questo file: test-account-gdpr.js falliva con «abbonamenti push
-- ancora presenti». Non e' un timore teorico.
--
-- `ritual_notifications_sent` segue in cascata (FK ON DELETE CASCADE), quindi non serve toccarla.
--
-- ⚠️ BASE: 18_moderazione_review.sql, NON 17_fix_delete_account.sql.
--
-- La prima stesura di questo file copiava da 17_ perche' era l'ultima migration col nome
-- "delete_account". Sbagliato: la 18_ aveva ridefinito la stessa funzione per chiudere
-- un'evasione del blocco — 17_ cancellava user_blocks con "blocker = me OR blocked = me", e il
-- secondo ramo permetteva a chi molesta di cancellare l'account, ri-registrare lo stesso
-- nickname e ricomparire alla vittima, che nel frattempo aveva perso il blocco senza saperlo.
-- Ripartire da 17_ riapriva quel buco in silenzio. L'ha intercettato test-moderazione.js
-- («evasione del blocco possibile: atteso 1 blocco superstite, trovato []»), non una rilettura.
--
-- Morale per la prossima volta: per un CREATE OR REPLACE non basta cercare il file col nome
-- giusto, bisogna cercare l'ULTIMA migration che tocca quella funzione:
--   grep -l "FUNCTION public.<nome>" supabase/sql/*.sql | sort | tail -1
--
-- Rispetto alla 18_ questo file aggiunge esattamente una riga di codice.
--
-- Test: node test-account-gdpr.js → 10/10  e  node test-moderazione.js → 17/17
-- Idempotente.
-- ============================================================================

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

    -- NUOVO (22): abbonamenti alle notifiche push. Un endpoint push e' un canale aperto verso
    -- un telefono: lasciarlo vivo dopo la cancellazione significa continuare a scrivere a
    -- qualcuno che ha chiesto di sparire.
    DELETE FROM push_subscriptions WHERE session_id = v_sid;
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
--   node test-account-gdpr.js  → 10/10, incluso «delete rimuove gli abbonamenti push»
--   node test-moderazione.js   → 17/17, incluso «evasione del blocco impossibile»
-- ============================================================================
