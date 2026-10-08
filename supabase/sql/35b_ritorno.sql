-- ============================================================================
-- 35b_ritorno.sql — ritorno indietro della 35b. SCRITTO E PROVATO IN LOCALE, NON APPLICATO:
-- lo lancia Irene solo se decide che serve.
-- Rimette la policy e i privilegi di notifications com'erano prima della 35b, letti dal
-- catalogo l'08/10/2026 (docs/superpowers/plans/catalogo-notifiche-35.txt): policy "allow all"
-- cmd=* per tutti, using/check true; sette privilegi (DELETE, INSERT, REFERENCES, SELECT,
-- TRIGGER, TRUNCATE, UPDATE) ad anon e authenticated; RLS attiva e non forzata.
-- Le RPC della 35a continuano a funzionare anche con l'accesso diretto riaperto. Riaprire non
-- espone credenziali: in notifications restano solo sender_nickname e oggetto; i session_id
-- stanno in notifiche_instradamento, che resta chiusa.
-- Idempotente, in una transazione.
-- ============================================================================
BEGIN;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON public.notifications;
CREATE POLICY "allow all" ON public.notifications FOR ALL TO public USING (true) WITH CHECK (true);
-- I sette privilegi elencati (non GRANT ALL: su Postgres 17 includerebbe anche MAINTAIN).
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
