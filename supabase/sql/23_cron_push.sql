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
--   2. il blob git di questo file non deve contenere nessun \r (la copia di lavoro su Windows
--      ce l'ha, ed e' normale: git converte). Verifica:
--        git show HEAD:supabase/sql/23_cron_push.sql | grep -c $'\r'   -> 0
--
-- NESSUN SEGRETO QUI DENTRO, ed e' una scelta.
--
-- La prima stesura leggeva la chiave di servizio e quella di EmailJS dal Vault. Funzionava, ma
-- metteva due credenziali dentro il database e costringeva a incollarle a mano. Non serve:
--   - le Edge Function accettano la chiave ANONIMA, che e' gia' pubblica dentro app.html.
--     Chiamarle con quella non espone niente di nuovo — erano gia' invocabili da chiunque;
--   - la chiave privata di EmailJS resta dov'e' giusto che stia, fra i segreti della Edge
--     Function `alert-cron`, che e' l'unica a mandare email.
-- Il comando di un cron e' leggibile da chiunque abbia accesso al database: meno credenziali
-- ci finiscono dentro, meglio e'.
--
-- PREREQUISITO: le due Edge Function devono essere gia' pubblicate.
--     supabase functions deploy notify-ritual-start
--     supabase functions deploy alert-cron
-- Applicare questo file prima significherebbe accendere un cron che chiama il vuoto — cioe'
-- rifare l'errore di aprile.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotenza: riapplicare il file non deve creare job doppi.
SELECT cron.unschedule(jobid) FROM cron.job
 WHERE jobname IN ('notify-ritual-start', 'allarme-cron-falliti', 'controllo-salute-cron');

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
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM'
               ),
    body    := '{}'::jsonb
  );
  $job$
);

-- ---------------------------------------------------------------------------
-- 2. La sentinella
-- ---------------------------------------------------------------------------
-- ⚠️ La prima stesura guardava solo `cron.job_run_details.status = 'failed'`, e sarebbe stata
-- CIECA al guasto piu' probabile. `net.http_post` non aspetta la risposta: mette la richiesta
-- in coda e ritorna subito, quindi il job risulta `succeeded` anche se la Edge Function
-- risponde 401 (chiave sbagliata), 404 (funzione non pubblicata) o 500. L'errore di aprile era
-- di SINTASSI SQL, e quello si' che pg_cron lo registra come failed: era l'unica classe che
-- quel controllo intercettava. Lo stato vero delle chiamate sta in `net._http_response`.

-- Storico nostro, perche' pg_net tiene le risposte solo per qualche ora e un controllo
-- giornaliero le troverebbe gia' sparite.
CREATE TABLE IF NOT EXISTS public.cron_salute (
  finestra_fine   timestamptz PRIMARY KEY DEFAULT now(),
  job_falliti     integer     NOT NULL DEFAULT 0,
  risposte_non_ok integer     NOT NULL DEFAULT 0,
  avvisato        boolean     NOT NULL DEFAULT false
);

ALTER TABLE public.cron_salute ENABLE ROW LEVEL SECURITY;

-- Conta, registra e dice se questo e' il momento in cui il guasto comincia. Non manda niente:
-- l'email la manda `alert-cron`, che ha la chiave di EmailJS fra i propri segreti.
-- Deve essere SECURITY DEFINER perche' legge gli schemi `cron` e `net`.
CREATE OR REPLACE FUNCTION public.controlla_salute_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_falliti    integer;
  v_non_ok     integer;
  v_precedente integer;
  v_avvisa     boolean := false;
BEGIN
  -- (a) job che pg_cron stesso dichiara falliti (sintassi, permessi, timeout).
  --     Solo i job ATTIVI: i fallimenti storici di un job spento apposta non sono azionabili.
  SELECT count(*)::int INTO v_falliti
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
   WHERE d.status = 'failed'
     AND d.start_time > now() - interval '20 minutes'
     AND j.active;

  -- (b) risposte HTTP andate male: e' qui che si vede una Edge Function che risponde 401 o
  --     404, cioe' il guasto che il controllo sui job non vedrebbe mai.
  SELECT count(*)::int INTO v_non_ok
    FROM net._http_response
   WHERE created > now() - interval '20 minutes'
     AND (error_msg IS NOT NULL OR status_code IS NULL OR status_code < 200 OR status_code >= 300);

  -- Avviso "sul fronte di salita": una email quando il guasto COMINCIA, non a ogni controllo.
  -- Un avviso che arriva ogni quarto d'ora per un giorno intero e' il modo migliore per
  -- smettere di leggere gli avvisi.
  SELECT coalesce(job_falliti + risposte_non_ok, 0) INTO v_precedente
    FROM cron_salute ORDER BY finestra_fine DESC LIMIT 1;

  IF (v_falliti + v_non_ok) > 0 AND coalesce(v_precedente, 0) = 0 THEN
    v_avvisa := true;
  END IF;

  INSERT INTO cron_salute (finestra_fine, job_falliti, risposte_non_ok, avvisato)
  VALUES (now(), v_falliti, v_non_ok, v_avvisa);

  -- Lo storico non serve a niente dopo un mese.
  DELETE FROM cron_salute WHERE finestra_fine < now() - interval '30 days';

  RETURN jsonb_build_object('job_falliti', v_falliti, 'risposte_non_ok', v_non_ok, 'avvisato', v_avvisa);
END;
$$;

-- La chiama solo `alert-cron`, con la chiave di servizio. Non e' roba da client.
REVOKE ALL ON FUNCTION public.controlla_salute_cron() FROM public;
REVOKE ALL ON FUNCTION public.controlla_salute_cron() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.controlla_salute_cron() TO service_role;

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

-- ============================================================================
-- VERIFICA POST-APPLY
--   node test-push-cron.js   → i job esistono, sono attivi, pg_net e' installata, e non ci
--                              sono ne' job falliti ne' risposte HTTP non riuscite.
--   Rilanciarlo dopo tre minuti: e' il controllo che ad aprile e' mancato.
-- ============================================================================
