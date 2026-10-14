-- Ritorno della 39b: partite e chat di nuovo aperte com'erano il 13/10 (catalogo).
GRANT ALL ON telepathy_matches TO anon, authenticated;
DROP POLICY IF EXISTS "Allow all" ON telepathy_matches;
DROP POLICY IF EXISTS "Allow all for anon" ON telepathy_matches;
CREATE POLICY "Allow all" ON telepathy_matches FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON telepathy_matches FOR ALL TO public USING (true) WITH CHECK (true);

GRANT ALL ON telepathy_chat TO anon, authenticated;
ALTER TABLE telepathy_chat DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo i partecipanti possono leggere la chat" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono inviare messaggi" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat;
CREATE POLICY "Solo i partecipanti possono leggere la chat" ON telepathy_chat FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
CREATE POLICY "Solo i partecipanti possono inviare messaggi" ON telepathy_chat FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
CREATE POLICY "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));

GRANT EXECUTE ON FUNCTION public.end_telepathy_match(uuid, text) TO PUBLIC, anon, authenticated;
