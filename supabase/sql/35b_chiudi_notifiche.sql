-- ============================================================================
-- 35b_chiudi_notifiche.sql — notifiche chiuse (2 di 2)
-- Segue: 35a_notifiche_server.sql. Spec: 2026-10-08-notifiche-chiuse-design.md.
--
-- Chiude l'accesso diretto a notifications: via la policy "allow all" (cmd=*, tutti, using e
-- check true: letta dal DB vero l'08/10/2026, catalogo-notifiche-35.txt) e nessun privilegio
-- all'app. Da qui si legge e si scrive solo con le RPC SECURITY DEFINER della 35a
-- (get_my_notifications, mark_my_notification_read, notify_event, register_my_post).
--
-- ⚠️ Applicare circa 10 minuti DOPO il deploy dell'app nuova (che usa le RPC): la cache del sito
--    dura max-age=600, e un'app vecchia ancora in cache non vedrebbe più le notifiche finché non
--    si aggiorna. Nella finestra fra 35a e 35b la tabella resta leggibile, ma non contiene
--    credenziali: i session_id stanno in notifiche_instradamento, privata già dalla 35a.
-- Ritorno indietro: 35b_ritorno.sql.
-- Idempotente, in una transazione.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS "allow all" ON public.notifications;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
-- RLS resta attiva e senza policy.

NOTIFY pgrst, 'reload schema';

COMMIT;
