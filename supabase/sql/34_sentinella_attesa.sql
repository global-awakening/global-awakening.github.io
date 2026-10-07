-- ============================================================================
-- 34_sentinella_attesa.sql
--
-- La sentinella della 23_ si accusava da sola. Questa migration le dà 30 secondi per
-- rispondere invece dei 5 predefiniti di pg_net.
--
-- Il guasto (trovato il 07/10/2026):
--   - `controllo-salute-cron` gira ogni 15 minuti, quindi la Edge Function `alert-cron` parte
--     quasi sempre «fredda» e risponde dopo più di 5 secondi;
--   - pg_net smette di aspettare a 5 s e registra in net._http_response un «Timeout of 5000 ms»;
--   - al giro dopo `controlla_salute_cron()` trova quella risposta (che era lei stessa) fra le
--     «risposte HTTP non riuscite», la conta come guasto e a volte fa partire l'email.
-- Risultato: 214 email d'allarme fra il 21/09 e il 07/10, tutte false. Le notifiche vere non
-- ne hanno mai sofferto: nelle 12 ore esaminate `notify-ritual-start` ha risposto bene a tutti
-- i quarti d'ora (47/47), e la sentinella ha scritto il suo controllo in `cron_salute` anche
-- nei giri «falliti». Era lenta, non rotta.
--
-- Cosa cambia: solo `timeout_milliseconds`. Stesso nome, stesso orario, stessa chiamata della
-- 23_; il job del motore (`notify-ritual-start`) non si tocca.
--
-- Il blob git di questo file non deve contenere \r (vedi 23_).
-- Ritorno: 34_ritorno.sql.
-- ============================================================================

BEGIN;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'controllo-salute-cron';
SELECT cron.schedule(
  'controllo-salute-cron',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/alert-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

COMMIT;

-- ============================================================================
-- VERIFICA POST-APPLY
--   node test-push-cron.js → «la sentinella aspetta abbastanza la propria risposta» verde.
--   Il controllo «nessuna risposta HTTP non riuscita nelle ultime 24 ore» resta rosso finché i
--   timeout di prima non escono dalla finestra: è giusto, non va forzato.
-- ============================================================================
