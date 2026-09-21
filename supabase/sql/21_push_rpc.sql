-- 21_push_rpc.sql
--
-- Le due porte controllate verso `push_subscriptions`, che ha RLS attiva e zero policy:
-- dal client non si legge e non si scrive, si passa solo da qui.
--
-- Perche' SECURITY DEFINER e non una policy: chiunque legga endpoint + chiavi puo' mandare
-- notifiche a quel telefono. Concedere al client una policy di SELECT significherebbe
-- regalare a chiunque la lista di tutti i telefoni raggiungibili di Global Awakening.
-- Quindi il client scrive alla cieca e non legge mai.
--
-- search_path fissato, stessa scelta di 11_/12_: impedisce che un search_path ostile dirotti
-- i nomi non qualificati dentro una funzione che gira coi privilegi del proprietario.

-- ---------------------------------------------------------------------------
-- register_push_subscription — iscrive un telefono, o aggiorna quello che c'e' gia'
-- ---------------------------------------------------------------------------
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
BEGIN
  -- Niente di quello che arriva qui viene da una fonte di cui ci si possa fidare.
  IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'session_id non valido';
  END IF;

  -- L'endpoint e' l'indirizzo del servizio push del browser: sempre https, mai altro.
  -- Senza questo controllo la tabella diventerebbe una lista di URL arbitrari che il
  -- server chiama da solo ogni minuto — cioe' un trampolino per richieste verso l'interno.
  -- Lunghezza e forma sono due controlli separati di proposito: Postgres non accetta una
  -- ripetizione oltre 255 in una regex ({1,900} da' "invalid repetition count(s)"), e 255
  -- sarebbe troppo stretto — gli endpoint di alcuni servizi push superano quella soglia.
  IF p_endpoint IS NULL OR length(p_endpoint) NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION 'endpoint non valido';
  END IF;

  IF p_endpoint !~ '^https://[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]+$' THEN
    RAISE EXCEPTION 'endpoint non valido';
  END IF;

  IF p_p256dh IS NULL OR length(p_p256dh) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'p256dh non valido';
  END IF;

  IF p_auth IS NULL OR length(p_auth) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'auth non valido';
  END IF;

  IF p_locale IS NULL OR p_locale NOT IN ('it', 'en') THEN
    RAISE EXCEPTION 'locale non valido';
  END IF;

  -- Conflitto sull'endpoint, non sul session_id: la stessa persona su due telefoni ha due
  -- righe e va avvisata su entrambi. Un endpoint invece identifica UN browser: se ricompare,
  -- e' lo stesso telefono che si ri-registra e va aggiornato, non duplicato.
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

-- ---------------------------------------------------------------------------
-- delete_push_subscription — spegne le notifiche per un telefono
-- ---------------------------------------------------------------------------
-- Prende solo l'endpoint: e' gia' un segreto che possiede soltanto chi possiede quel browser.
-- Chiedere anche il session_id non aggiungerebbe sicurezza, perche' il session_id e' meno
-- segreto dell'endpoint, non piu'.
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_endpoint IS NULL OR length(p_endpoint) NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION 'endpoint non valido';
  END IF;

  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.delete_push_subscription(text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO anon, authenticated;
