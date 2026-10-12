-- ============================================================================
-- 38_chiudi_community.sql — post e commenti della Community (Coscienza) non si riscrivono né si
-- cancellano più da fuori. Passo unico: l'app (anche quella vecchia) su queste tabelle fa solo
-- SELECT e INSERT di author_nickname/content(/post_id), quindi niente da aspettare.
-- Prima: consciousness_posts aveva la policy "allow all" (chiunque modificava o cancellava ogni
-- post), consciousness_comments aveva la RLS spenta, e anon/authenticated avevano tutti i
-- privilegi (anche TRUNCATE) sulle tre tabelle dei commenti.
-- Dopo:
--   - posts e commenti: lettura per tutti, scrittura solo INSERT delle colonne che manda l'app
--     (id e created_at li mette il DB: niente post retrodatati o id scelti da fuori);
--   - ritual_comments: già con RLS e sola lettura (si scrive con create_ritual_comment); qui si
--     tolgono soltanto i privilegi di scrittura rimasti in eccesso.
-- Le funzioni SECURITY DEFINER (delete_my_account, export_my_account, register_my_post,
-- create_ritual_comment, delete_ritual) e la chiave di servizio (moderazione) non cambiano.
-- Fuori da qui: chi scrive un post sceglie ancora il nickname che vuole (author_nickname non è
-- legato alla chiave): è un altro lavoro.
-- Idempotente. Ritorno: 38_ritorno.sql.
-- ============================================================================
BEGIN;

-- consciousness_posts
ALTER TABLE public.consciousness_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON public.consciousness_posts;
DROP POLICY IF EXISTS consciousness_posts_lettura ON public.consciousness_posts;
DROP POLICY IF EXISTS consciousness_posts_scrittura ON public.consciousness_posts;
CREATE POLICY consciousness_posts_lettura ON public.consciousness_posts
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY consciousness_posts_scrittura ON public.consciousness_posts
  FOR INSERT TO anon, authenticated WITH CHECK (true);
REVOKE ALL ON public.consciousness_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.consciousness_posts TO anon, authenticated;
GRANT INSERT (author_nickname, content) ON public.consciousness_posts TO anon, authenticated;

-- consciousness_comments (la RLS era spenta)
ALTER TABLE public.consciousness_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON public.consciousness_comments;
DROP POLICY IF EXISTS consciousness_comments_lettura ON public.consciousness_comments;
DROP POLICY IF EXISTS consciousness_comments_scrittura ON public.consciousness_comments;
CREATE POLICY consciousness_comments_lettura ON public.consciousness_comments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY consciousness_comments_scrittura ON public.consciousness_comments
  FOR INSERT TO anon, authenticated WITH CHECK (true);
REVOKE ALL ON public.consciousness_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.consciousness_comments TO anon, authenticated;
GRANT INSERT (post_id, author_nickname, content) ON public.consciousness_comments TO anon, authenticated;

-- ritual_comments: resta solo la lettura (la policy di sola lettura c'è già).
REVOKE ALL ON public.ritual_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ritual_comments TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
