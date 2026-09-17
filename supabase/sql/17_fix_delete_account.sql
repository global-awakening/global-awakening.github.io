-- ============================================================================
-- Fix — delete_my_account era rotta da 08_drop_dead_tables.sql — 2026-09-17
-- ============================================================================
-- SINTOMO: POST /rest/v1/rpc/delete_my_account -> HTTP 404
--          {"code":"42P01","message":"relation \"chat_messages\" does not exist"}
--          Effetto: l'eccezione annulla l'intera transazione, quindi il profilo
--          NON viene cancellato e i contenuti pubblici NON vengono anonimizzati.
--          "Elimina account" non funzionava per nessuno.
--
-- CAUSA:   06_account_gdpr.sql definisce delete_my_account con
--            UPDATE chat_messages SET user_name = 'Utente eliminato' ...
--          e 08_drop_dead_tables.sql ha poi fatto DROP TABLE chat_messages
--          (insieme a ritual_participants). In plpgsql il riferimento alla
--          tabella si risolve all'esecuzione, quindi la funzione ha continuato
--          a "esistere" e a fallire solo quando invocata davvero.
--
-- FIX:     si rimuove la sola riga che tocca la tabella inesistente. Tutto il
--          resto del corpo e' ripreso VERBATIM da 06_account_gdpr.sql.
--          ritual_participants non era referenziata: nessun'altra riga da togliere.
--          export_my_account non cita tabelle morte: non va toccata.
--
-- Perche' conta oltre al GDPR: Google Play richiede che un'app con registrazione
-- offra la cancellazione dell'account funzionante, in-app e via web. Con questa
-- rotta la pubblicazione verrebbe respinta.
--
-- Test: node test-account-gdpr.js  → atteso 9/9
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
--   POST /rest/v1/rpc/delete_my_account (hash corretto) -> 204, nessun errore
--   il profilo risulta cancellato, i post anonimizzati in 'Utente eliminato'
--   POST /rest/v1/rpc/delete_my_account (hash errato)   -> 'Auth failed'
-- ============================================================================
