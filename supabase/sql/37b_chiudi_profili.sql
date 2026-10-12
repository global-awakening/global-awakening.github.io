-- ============================================================================
-- 37b_chiudi_profili.sql — chiave dei profili, chiusura (2 di 2). Segue la 37a.
-- ⚠️ Applicare almeno 10 minuti DOPO il deploy dell'app nuova (max-age=600) e DOPO il merge del
--    keepalive che legge nickname: un'app vecchia chiede profiles.session_id e da qui riceve 42501
--    (il proprio profilo e quello degli altri non si caricano finché non si ricarica la pagina).
-- Cosa fa: anon e authenticated non leggono più la colonna session_id di profiles (né la usano
-- nei filtri). Le altre colonne pubbliche della 27_ restano. Le RPC (SECURITY DEFINER) non cambiano.
-- Idempotente. Ritorno: 37b_ritorno.sql.
-- ============================================================================
BEGIN;
REVOKE SELECT (session_id) ON public.profiles FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
