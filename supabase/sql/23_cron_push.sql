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
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'chiave_servizio_cron')
               ),
    body    := '{}'::jsonb
  );
  $job$
);

-- ---------------------------------------------------------------------------
-- 2. La sentinella
-- ---------------------------------------------------------------------------
-- Il difetto che ha reso possibile il cron fantasma non e' il \r: e' che nessuno si accorge
-- quando un cron fallisce. Senza questo pezzo, il prossimo guasto dura altri cinque mesi.
--
-- ⚠️ La prima stesura guardava solo `cron.job_run_details.status = 'failed'`, e sarebbe stata
-- CIECA al guasto piu' probabile. `net.http_post` non aspetta la risposta: mette la richiesta
-- in coda e ritorna subito, quindi il job risulta `succeeded` anche se la Edge Function
-- risponde 401 (chiave sbagliata nel Vault), 404 (funzione non pubblicata) o 500 a ogni giro.
-- L'errore di aprile era di SINTASSI SQL, e quello si' che pg_cron lo registra come failed:
-- era l'unica classe che quel controllo intercettava. Lo stato vero delle chiamate sta in
-- `net._http_response`, e adesso si guarda anche quello.

-- Storico nostro, perche' pg_net tiene le risposte solo per qualche ora e un controllo
-- giornaliero le troverebbe gia' sparite.
CREATE TABLE IF NOT EXISTS public.cron_salute (
  finestra_fine   timestamptz PRIMARY KEY DEFAULT now(),
  job_falliti     integer     NOT NULL DEFAULT 0,
  risposte_non_ok integer     NOT NULL DEFAULT 0,
  avvisato        boolean     NOT NULL DEFAULT false
);

ALTER TABLE public.cron_salute ENABLE ROW LEVEL SECURITY;

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
  -- (a) job che pg_cron stesso dichiara falliti (errori di sintassi, permessi, timeout)
  SELECT count(*)::int INTO v_falliti
    FROM cron.job_run_details
   WHERE status = 'failed'
     AND start_time > now() - interval '20 minutes';

  -- (b) risposte HTTP che non sono andate bene: e' qui che si vede una Edge Function che
  --     risponde 401 o 404, cioe' il guasto che il controllo sui job non vedrebbe mai.
  SELECT count(*)::int INTO v_non_ok
    FROM net._http_response
   WHERE created > now() - interval '20 minutes'
     AND (error_msg IS NOT NULL OR status_code IS NULL OR status_code < 200 OR status_code >= 300);

  -- Avviso "sul fronte di salita": si manda una email quando il guasto COMINCIA, non a ogni
  -- controllo. Un avviso che arriva ogni quarto d'ora per un giorno intero non lo legge
  -- nessuno, ed e' lo stesso modo in cui si smette di leggere gli avvisi veri.
  SELECT coalesce(job_falliti + risposte_non_ok, 0) INTO v_precedente
    FROM cron_salute ORDER BY finestra_fine DESC LIMIT 1;

  IF (v_falliti + v_non_ok) > 0 AND coalesce(v_precedente, 0) = 0 THEN
    v_avvisa := true;
  END IF;

  INSERT INTO cron_salute (finestra_fine, job_falliti, risposte_non_ok, avvisato)
  VALUES (now(), v_falliti, v_non_ok, v_avvisa);

  IF v_avvisa THEN
    PERFORM net.http_post(
      url     := 'https://api.emailjs.com/api/v1.0/email/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
                   'service_id',  'service_rk97p6m',
                   'template_id', 'template_gy8gdkg',
                   'user_id',     'KTIin1Rts7iSkzU96',
                   'accessToken', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'emailjs_private_key'),
                   'template_params', jsonb_build_object(
                     'to_email', 'global.awakening.app@gmail.com',
                     'subject',  'Global Awakening — qualcosa non gira',
                     'message',  format('Negli ultimi 20 minuti: %s esecuzioni di cron fallite, %s risposte HTTP non riuscite. Le notifiche di avvio rituale potrebbero non partire.',
                                        v_falliti, v_non_ok),
                     'magic_url', 'https://supabase.com/dashboard/project/vxzxdkcluyrcftsnxxza',
                     'cta_text',  'Apri il progetto',
                     'footer',    'Controllo automatico dei job pg_cron, ogni 15 minuti.'
                   )
                 )
    );
  END IF;

  -- Lo storico non serve a niente dopo un mese.
  DELETE FROM cron_salute WHERE finestra_fine < now() - interval '30 days';

  RETURN jsonb_build_object('job_falliti', v_falliti, 'risposte_non_ok', v_non_ok, 'avvisato', v_avvisa);
END;
$$;

REVOKE ALL ON FUNCTION public.controlla_salute_cron() FROM public;

SELECT cron.schedule('controllo-salute-cron', '*/15 * * * *', $job$ SELECT public.controlla_salute_cron(); $job$);

-- ============================================================================
-- VERIFICA POST-APPLY
--   node test-push-cron.js   → i job esistono, sono attivi, pg_net e' installata,
--                              e non ci sono ne' job falliti ne' risposte HTTP non riuscite.
--   Rilanciarlo dopo tre minuti: e' il controllo che ad aprile e' mancato.
-- ============================================================================
