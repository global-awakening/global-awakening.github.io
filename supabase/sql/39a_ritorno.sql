-- Ritorno della 39a: toglie le funzioni del motore e riporta la chat com'era (match_id text, senza FK).
-- Va applicato DOPO 39b_ritorno se la 39b è stata applicata. I messaggi orfani cancellati non tornano.
DROP FUNCTION IF EXISTS public.chat_leggi(text, text, uuid);
DROP FUNCTION IF EXISTS public.chat_scrivi(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.partita_esci(text, text, uuid);
DROP FUNCTION IF EXISTS public.partita_livello(text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.partita_avanza(text, text, uuid, integer);
DROP FUNCTION IF EXISTS public.partita_ipotesi(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.partita_simbolo(text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.partita_livello_valido(text);
DROP FUNCTION IF EXISTS public.partita_entra(text, text, uuid);
DROP FUNCTION IF EXISTS public.accetta_invito_partita(uuid, text, text);
DROP FUNCTION IF EXISTS public.partita_crea_da_coda(text, text, text, text);
DROP FUNCTION IF EXISTS public.partita_blocca(text, text);
DROP FUNCTION IF EXISTS public.partita_stato(text, text, uuid);
DROP FUNCTION IF EXISTS public.partita_mia(text, text);
DROP FUNCTION IF EXISTS public.partita_invito_in_corso(text);
DROP FUNCTION IF EXISTS public.partita_viva_di(text);
DROP FUNCTION IF EXISTS public.partite_pulizia();
DROP FUNCTION IF EXISTS public.partita_vista(telepathy_matches, text);
DROP FUNCTION IF EXISTS public.partita_ruolo(telepathy_matches, text);
DROP FUNCTION IF EXISTS public.partita_io(text, text);
ALTER TABLE telepathy_chat DROP CONSTRAINT IF EXISTS telepathy_chat_match_fk;
-- Le tre policy inerti della chat citano match_id: Postgres rifiuta il cambio di tipo finché ci sono.
-- Si tolgono e si rimettono identiche a come erano prima della 39a.
DROP POLICY IF EXISTS "Solo i partecipanti possono leggere la chat" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono inviare messaggi" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat;
ALTER TABLE telepathy_chat ALTER COLUMN match_id TYPE text USING match_id::text;
CREATE POLICY "Solo i partecipanti possono leggere la chat" ON telepathy_chat FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
CREATE POLICY "Solo i partecipanti possono inviare messaggi" ON telepathy_chat FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
CREATE POLICY "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
