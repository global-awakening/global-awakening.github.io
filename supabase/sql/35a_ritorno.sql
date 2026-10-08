-- ============================================================================
-- 35a_ritorno.sql — ritorno indietro della 35a. SCRITTO E PROVATO IN LOCALE, NON APPLICATO.
-- Ordine: prima le funzioni (le nuove tolte, le ridefinite ripristinate), poi tabella e colonne,
-- perché le funzioni dipendono dalle colonne. Idempotente.
-- ============================================================================
BEGIN;

-- ── 1. Funzioni nuove: tolte ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.notify_event(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.register_my_post(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.mark_my_notification_read(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.get_my_notifications(text, text, text);
DROP FUNCTION IF EXISTS public.notifica_bloccata(text, text, text, text);
DROP FUNCTION IF EXISTS public.notifica_chi_sono(text, text, text);

-- ── 2. Funzioni ridefinite dalla 35a: RIPRISTINO delle versioni precedenti ──
-- (Task 3 aggiunge qui le versioni di prima. Vuoto per ora. Va PRIMA dei drop del punto 3.)

-- ── 3. Tabella e colonne, per ultime ───────────────────────────────────────
DROP TABLE IF EXISTS public.consciousness_post_autori;
DROP INDEX IF EXISTS public.notifications_recipient_non_lette;
DROP INDEX IF EXISTS public.notifications_nickname_non_lette;
ALTER TABLE public.notifications
  DROP COLUMN IF EXISTS recipient_session_id,
  DROP COLUMN IF EXISTS sender_session_id,
  DROP COLUMN IF EXISTS sender_nickname,
  DROP COLUMN IF EXISTS oggetto;

NOTIFY pgrst, 'reload schema';
COMMIT;
