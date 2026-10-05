-- ============================================================================
-- 32b_chiudi_inviti_diretti.sql — inviti a un training anche a chi non è collegato (2 di 2)
-- Segue: 32a_inviti_telepatia_offline.sql. Spec: 2026-09-25 §4.1 punto 5, §6, §8 passo 4.
--
-- Chiude l'accesso diretto a telepathy_invites: via tutte le policy, nessun privilegio all'app,
-- ANCHE in lettura. La tabella lega nomi e session_id: lasciarla leggibile trasformerebbe ogni
-- invito in una mappa «nome → session_id» e renderebbe inutile l'identificativo opaco della
-- lista. Da qui si legge e si scrive solo con le RPC della 32a.
--
-- ⚠️ Applicare SOLO quando (1) l'app nuova è live da almeno un giorno e (2) questa query
--    risponde 0 (nessuna app vecchia scrive più direttamente):
--      SELECT count(*) FROM telepathy_invites
--       WHERE via_diretta AND coalesce(responded_at, created_at) > now() - interval '24 hours';
--    Controllo del 05/10/2026: 0 (e 0 in tutto lo storico); PR 3 mergiata il 02/10.
-- Dopo: un'app vecchia ancora in cache non vede e non manda inviti finché non si aggiorna
-- (~10 minuti + chiudi e riapri). Accettato (spec §5).
-- Ritorno indietro: 32b_ritorno.sql.
-- Idempotente, in una transazione.
-- ============================================================================
BEGIN;

-- Prima di chiudere: i pending già scaduti e quelli con una scadenza impossibile (oltre 10
-- minuti da adesso), per il caso in cui qualcosa sia sfuggito al trigger di guardia.
UPDATE telepathy_invites SET status = 'expired', responded_at = coalesce(responded_at, now())
 WHERE status = 'pending' AND (expires_at <= now() OR expires_at > now() + interval '10 minutes 5 seconds');

-- Tutte le policy, con i nomi che hanno oggi (sono nate dallo Studio).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telepathy_invites' LOOP
    EXECUTE format('DROP POLICY %I ON public.telepathy_invites', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.telepathy_invites FROM PUBLIC, anon, authenticated;
-- RLS resta attiva e senza policy; il trigger di guardia resta (non costa niente e copre
-- un'eventuale riapertura).

NOTIFY pgrst, 'reload schema';

COMMIT;
