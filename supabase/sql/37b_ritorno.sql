-- ============================================================================
-- 37b_ritorno.sql — ritorno della 37b: ridà ad anon e authenticated la lettura di
-- profiles.session_id, come dalla 27_. Idempotente.
-- ============================================================================
BEGIN;
GRANT SELECT (session_id) ON public.profiles TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
