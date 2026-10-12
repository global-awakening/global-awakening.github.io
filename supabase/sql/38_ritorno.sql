-- ============================================================================
-- 38_ritorno.sql — ritorno della 38: rimette posts e commenti com'erano prima (policy
-- "allow all" sui post, RLS spenta e nessuna policy sui commenti, tutti i privilegi ad anon/authenticated).
-- Riapre la falla: usarlo solo se la 38 rompe l'app. Idempotente.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS consciousness_posts_lettura ON public.consciousness_posts;
DROP POLICY IF EXISTS consciousness_posts_scrittura ON public.consciousness_posts;
DROP POLICY IF EXISTS "allow all" ON public.consciousness_posts;
CREATE POLICY "allow all" ON public.consciousness_posts FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
REVOKE ALL ON public.consciousness_posts FROM anon, authenticated;
GRANT ALL ON public.consciousness_posts TO anon, authenticated;

DROP POLICY IF EXISTS consciousness_comments_lettura ON public.consciousness_comments;
DROP POLICY IF EXISTS consciousness_comments_scrittura ON public.consciousness_comments;
ALTER TABLE public.consciousness_comments DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consciousness_comments FROM anon, authenticated;
GRANT ALL ON public.consciousness_comments TO anon, authenticated;

REVOKE ALL ON public.ritual_comments FROM anon, authenticated;
GRANT ALL ON public.ritual_comments TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
