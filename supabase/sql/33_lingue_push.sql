-- ============================================================================
-- 33_lingue_push.sql
--
-- Le notifiche push parlano quattro lingue (spec lingue ES/FR, §3.5).
--
-- `register_push_subscription` accettava solo 'it' e 'en' nella colonna `locale`: un telefono
-- con l'app in spagnolo o in francese verrebbe rifiutato con «locale non valido». Qui la lista
-- diventa it, en, es, fr. Tutto il resto della funzione e' identico alla 24_.
--
-- Segue: 24_push_hardening.sql
--
-- ⚠️  APPLICARE PRIMA del merge dell'app che manda es/fr: finche' la funzione non conosce le
--     nuove lingue, la registrazione push di quei telefoni fallisce.
--
-- Ritorno: 33_ritorno.sql
-- Test: node test-lingue-push-sql.js (PGlite), node test-push-rpc.js (database vero)
-- Idempotente, in una transazione.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_session_id text,
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_locale     text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_host    text;
  v_quanti  integer;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'session_id non valido';
  END IF;

  -- Lunghezza e forma sono controlli separati: Postgres non accetta una ripetizione oltre 255
  -- in una regex ({1,900} da' "invalid repetition count(s)"), e 255 sarebbe troppo stretto.
  IF p_endpoint IS NULL OR length(p_endpoint) NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION 'endpoint non valido';
  END IF;

  IF p_endpoint !~ '^https://[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]+$' THEN
    RAISE EXCEPTION 'endpoint non valido';
  END IF;

  -- L'host deve essere di un servizio push conosciuto. I LIKE con il punto iniziale
  -- ('%.push.services.mozilla.com') richiedono che l'host FINISCA con quel dominio: per
  -- passare bisognerebbe controllare un sottodominio di Mozilla o di Microsoft.
  v_host := substring(p_endpoint from '^https://([^/]+)');
  IF v_host IS NULL OR NOT (
       v_host = 'fcm.googleapis.com'                   -- Chrome, Edge, Android
    OR v_host = 'web.push.apple.com'                   -- Safari, iOS
    OR v_host LIKE '%.push.services.mozilla.com'       -- Firefox
    OR v_host LIKE '%.notify.windows.com'              -- WNS
  ) THEN
    RAISE EXCEPTION 'endpoint non riconosciuto come servizio push';
  END IF;

  IF p_p256dh IS NULL OR length(p_p256dh) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'p256dh non valido';
  END IF;

  IF p_auth IS NULL OR length(p_auth) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'auth non valido';
  END IF;

  IF p_locale IS NULL OR p_locale NOT IN ('it', 'en', 'es', 'fr') THEN
    RAISE EXCEPTION 'locale non valido';
  END IF;

  -- Tetto per session_id. Dieci e' generoso per una persona vera (un telefono, un tablet, un
  -- paio di browser sul computer) e toglie di mezzo l'abuso su scala.
  -- Il conteggio esclude l'endpoint che stiamo per scrivere, altrimenti il decimo telefono
  -- non potrebbe piu' ri-registrarsi.
  SELECT count(*) INTO v_quanti
    FROM public.push_subscriptions
   WHERE session_id = p_session_id AND endpoint <> p_endpoint;

  IF v_quanti >= 10 THEN
    RAISE EXCEPTION 'troppi abbonamenti per questo dispositivo';
  END IF;

  INSERT INTO public.push_subscriptions (session_id, endpoint, p256dh, auth, locale)
  VALUES (p_session_id, p_endpoint, p_p256dh, p_auth, p_locale)
  ON CONFLICT (endpoint) DO UPDATE
    SET session_id    = EXCLUDED.session_id,
        p256dh        = EXCLUDED.p256dh,
        auth          = EXCLUDED.auth,
        locale        = EXCLUDED.locale,
        last_seen_at  = now(),
        failure_count = 0;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
