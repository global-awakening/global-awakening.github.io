-- 39b — chiude partite e chat della telepatia: da qui in poi si passa solo dalle RPC della 39a.
-- Da applicare almeno 10 minuti DOPO il rilascio dell'app che usa le RPC (cache della PWA).
-- Un'app aperta da prima si ferma sulla telepatia finché non si ricarica (come per 36b/37b).
-- Ritorno: 39b_ritorno.sql.
DROP POLICY IF EXISTS "Allow all" ON telepathy_matches;
DROP POLICY IF EXISTS "Allow all for anon" ON telepathy_matches;
ALTER TABLE telepathy_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON telepathy_matches FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Solo i partecipanti possono leggere la chat" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono inviare messaggi" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat;
ALTER TABLE telepathy_chat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON telepathy_chat FROM PUBLIC, anon, authenticated;

-- Chiudeva qualunque partita a nome di chiunque: la sostituisce partita_esci.
REVOKE ALL ON FUNCTION public.end_telepathy_match(uuid, text) FROM PUBLIC, anon, authenticated;

-- Non più usata dall'app dopo la scala 05: modificava qualunque partita senza guardare chi chiama.
REVOKE ALL ON FUNCTION public.apply_level_change_if_both_agree(uuid, text, text) FROM PUBLIC, anon, authenticated;
