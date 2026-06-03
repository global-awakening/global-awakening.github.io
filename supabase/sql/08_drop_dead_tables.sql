-- ============================================================================
-- Cleanup tabelle morte (B7) — 2026-06-03
-- ----------------------------------------------------------------------------
-- DISTRUTTIVO E IRREVERSIBILE. Eseguire in Supabase Studio dopo conferma.
--
-- Contenuto verificato via REST (2026-06-03):
--   - ritual_participants: 0 righe. Dead-write storico (mismatch tipo
--     rituals.id=bigint vs ritual_participants.ritual_id=uuid → ogni INSERT 400).
--     La partecipazione reale vive in rituals.participants (jsonb). Mai usata.
--   - chat_messages: 1 riga, un messaggio di test ('Irene' / 'hello', 2026-04-03).
--     La chat globale è stata rimossa dal client (commit aa99327): tabella orfana.
--
-- Nessuna RPC/funzione referenzia queste tabelle (verificato: le RPC rituali
-- usano solo rituals/ritual_comments; nessuna RPC tocca chat_messages).
-- ============================================================================

DROP TABLE IF EXISTS ritual_participants;
DROP TABLE IF EXISTS chat_messages;

-- Verifica post-apply:
--   SELECT to_regclass('public.ritual_participants');  -> NULL
--   SELECT to_regclass('public.chat_messages');        -> NULL
