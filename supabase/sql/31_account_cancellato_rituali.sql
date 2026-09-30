-- ============================================================================
-- Chi cancella l'account esce anche dai rituali — 30/09/2026
-- Segue: 30_candela_nella_stanza.sql. Ridefinisce solo delete_my_account.
--
-- Perché: la versione della 30_ toglie le candele e i nomi (candles, candles_nomi) e anonimizza
-- il creatore, ma lascia il session_id di chi se ne va in rituals.participants (l'elenco di chi
-- partecipa, array jsonb di session_id) e in ritual_presence (le presenze nella stanza, 28_).
-- Chi chiede di sparire resterebbe contato fra i partecipanti e presente nelle stanze.
--
-- Corpo identico a quello della 30_, più il blocco segnato «NUOVO (31)», dentro lo stesso
-- IF v_sid della rimozione delle candele: stesso SECURITY DEFINER, search_path e GRANT.
--
-- ⚠️ Se si rilancia la 30_ (o la catena 28_ → 29_ → 30_), rilanciare subito dopo anche la 31_:
-- la 30_ rimette la delete_my_account senza questo blocco.
--
-- Idempotente, in una transazione.
-- ============================================================================

BEGIN;

-- ── Cancellare l'account ───────────────────────────────────────────────────
-- Corpo della 30_ (l'ultima migration che la ridefinisce), identico, più il blocco «NUOVO (31)».
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

    -- NUOVO (30): le sue candele e il nome accanto, in ogni rituale.
    UPDATE rituals
       SET candles      = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                                     WHERE e <> to_jsonb(v_sid)), '[]'::jsonb),
           candles_nomi = candles_nomi - v_sid
     WHERE candles @> to_jsonb(array[v_sid]) OR candles_nomi ? v_sid;

    -- NUOVO (31): la sua partecipazione (participants, array di session_id come candles) e le
    -- sue presenze nelle stanze. Gli altri partecipanti restano, nello stesso ordine.
    UPDATE rituals
       SET participants = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(participants) e
                                     WHERE e <> to_jsonb(v_sid)), '[]'::jsonb)
     WHERE participants @> to_jsonb(array[v_sid]);
    DELETE FROM ritual_presence WHERE session_id = v_sid;
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

NOTIFY pgrst, 'reload schema';

COMMIT;
