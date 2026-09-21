-- ============================================================================
-- 22_delete_account_push.sql
--
-- `delete_my_account` non conosceva `push_subscriptions`, creata da 19. Senza questa riga chi
-- cancella l'account continua a ricevere notifiche di rituali su un telefono che non ha piu'
-- un account: l'abbonamento sopravvive al suo proprietario.
--
-- Verificato prima di scrivere questo file: test-account-gdpr.js falliva con
-- «abbonamenti push ancora presenti», non e' un timore teorico.
--
-- `ritual_notifications_sent` segue in cascata (FK ON DELETE CASCADE), quindi non serve
-- toccarla.
--
-- Il corpo che segue e' quello di 17_fix_delete_account.sql COPIATO, piu' la sola riga nuova
-- in (b). Non e' stato riscritto a memoria: e' una funzione SECURITY DEFINER che tocca una
-- dozzina di tabelle, e una svista qui non cancella dati che andavano cancellati — senza che
-- nessun errore lo segnali. E' la stessa classe di bug che a settembre aveva lasciato
-- «Elimina account» rotta da giugno.
--
-- Test: node test-account-gdpr.js  → atteso 10/10
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
  -- RIMOSSA: UPDATE chat_messages ... — tabella droppata da 08_drop_dead_tables.sql

  -- (b) Cancella i dati personali/privati
  DELETE FROM private_messages WHERE sender_name = p_nickname OR receiver_name = p_nickname;
  DELETE FROM notifications    WHERE user_nickname = p_nickname;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM telepathy_scores WHERE user_id = v_email;
    DELETE FROM magic_links      WHERE email   = v_email;
    DELETE FROM password_resets  WHERE email   = v_email;
  END IF;

  -- Effimeri telepatia/presenza con colonne note (TTL breve, session_id opachi).
  -- telepathy_matches/telepathy_chat NON toccati: si auto-puliscono a TTL <5min
  -- e contengono solo id effimeri + simboli, non PII persistente identificabile.
  IF v_sid IS NOT NULL AND v_sid <> '' THEN
    DELETE FROM online_users      WHERE id = v_sid;
    DELETE FROM telepathy_queue   WHERE id = v_sid;
    DELETE FROM telepathy_invites WHERE from_id = v_sid OR to_id = v_sid;

    -- NUOVO (22): abbonamenti alle notifiche push. Un endpoint push e' un canale aperto
    -- verso un telefono: lasciarlo vivo dopo la cancellazione significa continuare a
    -- scrivere a qualcuno che ha chiesto di sparire.
    DELETE FROM push_subscriptions WHERE session_id = v_sid;
  END IF;

  -- (c) SP1: i blocchi impostati dall'utente e quelli subiti non hanno piu'
  -- soggetto una volta cancellata l'identita'. Le segnalazioni INVIATE restano
  -- (servono alla moderazione) ma perdono il legame col reporter.
  DELETE FROM user_blocks WHERE blocker_nickname = p_nickname OR blocked_nickname = p_nickname;
  UPDATE content_reports SET reporter_nickname = 'Utente eliminato' WHERE reporter_nickname = p_nickname;

  -- (d) Cancella l'identita'
  DELETE FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash;
END $$;

GRANT EXECUTE ON FUNCTION public.delete_my_account(text, text) TO anon;

-- ============================================================================
-- VERIFICA POST-APPLY
--   node test-account-gdpr.js  → 10/10, incluso «delete rimuove gli abbonamenti push»
-- ============================================================================
