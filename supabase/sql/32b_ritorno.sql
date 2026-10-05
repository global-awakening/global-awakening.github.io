-- ============================================================================
-- 32b_ritorno.sql — ritorno indietro della 32b. SCRITTO E PROVATO IN LOCALE, NON APPLICATO:
-- lo lancia Irene solo se decide che serve.
-- Rimette le policy e i privilegi di telepathy_invites com'erano prima della 32b, letti dal
-- catalogo il 30/09/2026 (Task 1 del piano inviti, .superpowers/sdd/catalogo-inviti.txt,
-- risposte cat8…cat13 e pol5…pol7).
-- Le RPC della 32a continuano a funzionare anche con l'accesso diretto riaperto.
-- Idempotente, in una transazione.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS "Destinatario può aggiornare lo status" ON public.telepathy_invites;
CREATE POLICY "Destinatario può aggiornare lo status" ON public.telepathy_invites FOR UPDATE TO public USING ((auth.uid())::text = to_id);
DROP POLICY IF EXISTS "Destinatario vede i propri inviti" ON public.telepathy_invites;
CREATE POLICY "Destinatario vede i propri inviti" ON public.telepathy_invites FOR SELECT TO public USING ((auth.uid())::text = to_id);
DROP POLICY IF EXISTS "Mittente può cancellare il proprio invito" ON public.telepathy_invites;
CREATE POLICY "Mittente può cancellare il proprio invito" ON public.telepathy_invites FOR DELETE TO public USING ((auth.uid())::text = from_id);
DROP POLICY IF EXISTS "Utenti autenticati possono creare inviti" ON public.telepathy_invites;
CREATE POLICY "Utenti autenticati possono creare inviti" ON public.telepathy_invites FOR INSERT TO public WITH CHECK ((auth.uid())::text = from_id);
DROP POLICY IF EXISTS "anon can delete telepathy_invites" ON public.telepathy_invites;
CREATE POLICY "anon can delete telepathy_invites" ON public.telepathy_invites FOR DELETE TO anon USING (true);
DROP POLICY IF EXISTS "anon can insert telepathy_invites" ON public.telepathy_invites;
CREATE POLICY "anon can insert telepathy_invites" ON public.telepathy_invites FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "anon can select telepathy_invites" ON public.telepathy_invites;
CREATE POLICY "anon can select telepathy_invites" ON public.telepathy_invites FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon can update telepathy_invites" ON public.telepathy_invites;
CREATE POLICY "anon can update telepathy_invites" ON public.telepathy_invites FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- I privilegi di cat13: tutti e sette (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE,
-- UPDATE) per anon e authenticated, quindi ALL è equivalente.
GRANT ALL ON public.telepathy_invites TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
