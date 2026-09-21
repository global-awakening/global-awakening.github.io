-- ============================================================================
-- 23_cron_push.sql
--
-- Sveglia il motore delle notifiche ogni minuto, e mette una sentinella su se' stesso.
--
-- ATTENZIONE — il motivo per cui questo file esiste invece di un giro nello Studio: il job
-- precedente e' stato digitato a mano ad aprile, conteneva un ritorno a capo di Windows dentro
-- la stringa JSON degli header, ed e' fallito 33.615 volte senza che nessuno se ne accorgesse.
-- Due regole nate da li':
--   1. il comando del cron vive QUI, versionato, e si applica con scripts/apply-sql.js;
--   2. questo file NON deve mai contenere un carattere \r. Se lo si modifica su Windows,
--      controllare i terminatori di riga PRIMA di applicarlo:  grep -c $'\r' <file>  → 0.
--
-- PREREQUISITI, da fare una volta sola e in quest'ordine:
--
--   a) la Edge Function deve essere gia' pubblicata:
--        supabase functions deploy notify-ritual-start
--      Applicare questo file prima significherebbe accendere un cron che chiama il vuoto —
--      cioe' rifare l'errore di aprile.
--
--   b) i due segreti devono esistere nel Vault (i valori NON stanno nel repo):
--        select vault.create_secret('<chiave di servizio>', 'chiave_servizio_cron',
--                                   'Chiave usata dai job cron per chiamare le Edge Function');
--        select vault.create_secret('<chiave privata EmailJS>', 'emailjs_private_key',
--                                   'Chiave privata EmailJS per gli avvisi automatici');
--      Vanno nel Vault e non scritte qui perche' il comando di un cron e' leggibile da chiunque
--      abbia accesso al database.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotenza: riapplicare il file non deve creare job doppi.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('notify-ritual-start', 'allarme-cron-falliti');

-- ---------------------------------------------------------------------------
-- 1. Il motore, ogni minuto
-- ---------------------------------------------------------------------------
-- Ogni minuto e non ogni cinque: con una finestra da cinque, una notifica di «sta iniziando
-- ORA» puo' arrivare con cinque minuti di ritardo. Su un'esperienza che vive dell'essere
-- insieme nello stesso momento, cinque minuti sono tanti.
SELECT cron.schedule(
  'notify-ritual-start',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-ritual-start',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'chiave_servizio_cron')
               ),
    body    := '{}'::jsonb
  );
  $job$
);

-- ---------------------------------------------------------------------------
-- 2. La sentinella sui fallimenti, ogni giorno alle 07:00 UTC
-- ---------------------------------------------------------------------------
-- Il difetto che ha reso possibile la storia del cron fantasma non e' il \r: e' che nessuno si
-- accorge quando un cron fallisce. Senza questo pezzo, il prossimo guasto dura altri cinque
-- mesi. Manda una email solo se nelle ultime 24 ore c'e' stato almeno un fallimento: un avviso
-- che arriva tutti i giorni non lo legge piu' nessuno dopo una settimana.
SELECT cron.schedule(
  'allarme-cron-falliti',
  '0 7 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://api.emailjs.com/api/v1.0/email/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'service_id',  'service_rk97p6m',
                 'template_id', 'template_gy8gdkg',
                 'user_id',     'KTIin1Rts7iSkzU96',
                 'accessToken', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'emailjs_private_key'),
                 'template_params', jsonb_build_object(
                   'to_email', 'global.awakening.app@gmail.com',
                   'subject',  'Global Awakening — un cron sta fallendo',
                   'message',  (SELECT string_agg(j.jobname || ': ' || f.c || ' fallimenti nelle ultime 24 ore', E'\n')
                                  FROM (SELECT jobid, count(*) AS c
                                          FROM cron.job_run_details
                                         WHERE status = 'failed'
                                           AND start_time > now() - interval '24 hours'
                                         GROUP BY jobid) f
                                  JOIN cron.job j ON j.jobid = f.jobid),
                   'magic_url', 'https://supabase.com/dashboard/project/vxzxdkcluyrcftsnxxza',
                   'cta_text',  'Apri il progetto',
                   'footer',    'Controllo automatico giornaliero dei job pg_cron.'
                 )
               )
  )
  WHERE EXISTS (
    SELECT 1 FROM cron.job_run_details
     WHERE status = 'failed' AND start_time > now() - interval '24 hours'
  );
  $job$
);

-- ============================================================================
-- VERIFICA POST-APPLY
--   node test-push-cron.js   → i job esistono, sono attivi, pg_net e' installata,
--                              e NON ci sono fallimenti nelle ultime 24 ore.
--   Rilanciarlo dopo tre minuti: e' il controllo che ad aprile e' mancato.
-- ============================================================================
