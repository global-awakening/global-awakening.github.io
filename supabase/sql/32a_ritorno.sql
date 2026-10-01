-- ============================================================================
-- 32a_ritorno.sql — ritorno indietro della 32a. SCRITTO E PROVATO IN LOCALE, NON APPLICATO:
-- lo lancia Irene solo se decide che serve (spec §8 passo 2).
--
-- Quando: se gli indici unici, il CHECK sugli stati, il NOT NULL su status o il trigger di
-- guardia danno problemi alle app vecchie ancora in cache (inviti che non partono, accettazioni
-- che falliscono). Riporta questi vincoli alla forma di prima della 32a, NOT NULL compreso.
-- Cosa NON tocca: tabelle, colonne e RPC nuove (senza l'app nuova sono inerti) e il trigger di
-- telepathy_matches (aggiorna solo ultima_attivita e giocato, le app vecchie non lo vedono).
-- Il job del cron torna com'era con: node scripts/apply-sql.js supabase/sql/23_cron_push.sql
-- Per rimettere tutto: rilanciare la 32a. Il rilancio NON è una «prima applicazione» (la 32a lo
-- capisce dalla colonna expires_at, che il ritorno lascia): gli inviti vivi restano vivi, si
-- chiudono solo i pending già scaduti, e i doppioni di pending per mittente o destinatario
-- scritti dalle app vecchie nel frattempo vengono normalizzati prima di ricreare gli indici.
-- ============================================================================
BEGIN;
DROP TRIGGER IF EXISTS telepathy_invites_guardia ON telepathy_invites;
DROP INDEX IF EXISTS telepathy_invites_un_pending_mittente;
DROP INDEX IF EXISTS telepathy_invites_un_pending_destinatario;
ALTER TABLE telepathy_invites DROP CONSTRAINT IF EXISTS telepathy_invites_stato_valido;
ALTER TABLE telepathy_invites ALTER COLUMN status DROP NOT NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
