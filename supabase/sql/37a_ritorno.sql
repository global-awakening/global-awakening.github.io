-- ============================================================================
-- 37a_ritorno.sql — ritorno della 37a. Solo PRIMA della 37b (dopo, serve prima 37b_ritorno):
-- senza mio_profilo l'app nuova non carica il proprio profilo dal server (usa la copia locale).
-- Idempotente.
-- ============================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.mio_profilo(text);
NOTIFY pgrst, 'reload schema';
COMMIT;
