-- ============================================================================
-- 34_ritorno.sql
--
-- SCRITTO E PROVATO IN LOCALE, NON APPLICATO: lo lancia Irene solo se decide che serve.
--
-- Annulla la 34_: la sentinella torna all'attesa predefinita di pg_net (5 s), com'era nella
-- 23_. Con questo tornano anche i falsi allarmi descritti nella 34_.
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
    body    := '{}'::jsonb
  );
  $job$
);

COMMIT;
