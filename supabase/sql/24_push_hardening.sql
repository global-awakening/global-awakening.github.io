-- ============================================================================
-- 24_push_hardening.sql
--
-- Chiude due rilievi della review indipendente del 21/09 e un buco GDPR.
--
-- 1) L'ENDPOINT POTEVA ESSERE QUALUNQUE URL https.
--
--    `register_push_subscription` e' chiamabile da `anon` senza nessuna prova di identita',
--    e la 21_ validava l'endpoint solo su schema, caratteri e lunghezza. Quindi chiunque
--    poteva far scrivere nella tabella un indirizzo arbitrario, e il nostro server lo avrebbe
--    chiamato in POST una volta al minuto per ogni rituale in finestra: un trampolino verso
--    host scelti da un estraneo, e un amplificatore di traffico a spese nostre.
--
--    Rimedio: l'host deve appartenere a un servizio push conosciuto. Non e' un dettaglio
--    cosmetico — e' l'unica cosa che impedisce a una tabella scrivibile da chiunque di
--    diventare un motore di richieste in uscita.
--
-- 2) UN SESSION_ID NON E' UN SEGRETO.
--
--    `rituals` ha una policy `rituals_select_public` (SELECT a `anon`, USING true) e la colonna
--    `participants` contiene esattamente i session_id dei partecipanti. Chiunque puo' leggerli e
--    registrare il PROPRIO telefono sotto il session_id di un'altra persona.
--
--    Quello che si guadagna cosi' e' poco: si ricevono i nomi dei rituali a cui quella persona
--    partecipa, informazione gia' pubblica in `participants`. Non si ruba niente e non si
--    impedisce alla vittima di ricevere le sue notifiche, perche' il conflitto e' sull'endpoint
--    e le due righe restano distinte. Una prova di identita' vera non e' possibile senza
--    cambiare il modello: agli ospiti, che partecipano ai rituali, non e' associata nessuna
--    credenziale.
--
--    Quello che si puo' fare, e si fa qui, e' togliere l'abuso su scala: un tetto di 10
--    abbonamenti per session_id. Senza, un estraneo poteva iscrivere centinaia di indirizzi a
--    nome di una persona e moltiplicare per centinaia il lavoro del motore a ogni rituale.
--
--    La parte che resta aperta e' scritta nella spec, non nascosta qui.
--
-- 3) `export_my_account` non esportava gli abbonamenti push, che contengono session_id ed
--    endpoint — dati personali. La cancellazione era coperta dalla 22, l'accesso no.
--
-- Test: node test-push-rpc.js → 10/10,  node test-account-gdpr.js → 10/10
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) register_push_subscription — host conosciuto e tetto per session_id
-- ----------------------------------------------------------------------------
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

  IF p_locale IS NULL OR p_locale NOT IN ('it', 'en') THEN
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

-- ----------------------------------------------------------------------------
-- 2) export_my_account — include gli abbonamenti push
-- ----------------------------------------------------------------------------
-- Corpo copiato da 06_account_gdpr.sql, che e' l'ULTIMA migration che tocca questa funzione
-- (verificato con: grep -l "FUNCTION public.export_my_account" supabase/sql/*.sql | sort).
-- Aggiunta una sola voce.
CREATE OR REPLACE FUNCTION public.export_my_account(
  p_nickname      text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  text;
  v_sid    text;
  v_result jsonb;
BEGIN
  SELECT email, session_id INTO v_email, v_sid
    FROM profiles
   WHERE nickname = p_nickname AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'profile', (SELECT to_jsonb(p) - 'password_hash'
                  FROM profiles p WHERE p.nickname = p_nickname),
    'private_messages', coalesce((SELECT jsonb_agg(to_jsonb(m))
                  FROM private_messages m
                 WHERE m.sender_name = p_nickname OR m.receiver_name = p_nickname), '[]'::jsonb),
    'consciousness_posts', coalesce((SELECT jsonb_agg(to_jsonb(c))
                  FROM consciousness_posts c WHERE c.author_nickname = p_nickname), '[]'::jsonb),
    'consciousness_comments', coalesce((SELECT jsonb_agg(to_jsonb(c))
                  FROM consciousness_comments c WHERE c.author_nickname = p_nickname), '[]'::jsonb),
    'ritual_comments', coalesce((SELECT jsonb_agg(to_jsonb(rc))
                  FROM ritual_comments rc WHERE rc.author_nickname = p_nickname), '[]'::jsonb),
    'rituals_created', coalesce((SELECT jsonb_agg(to_jsonb(r))
                  FROM rituals r WHERE r.creator = p_nickname OR r.creator_id = v_sid), '[]'::jsonb),
    'telepathy_scores', coalesce((SELECT jsonb_agg(to_jsonb(ts))
                  FROM telepathy_scores ts WHERE ts.user_id = v_email), '[]'::jsonb),
    'notifications', coalesce((SELECT jsonb_agg(to_jsonb(n))
                  FROM notifications n WHERE n.user_nickname = p_nickname), '[]'::jsonb),
    -- NUOVO (24): abbonamenti alle notifiche push.
    'push_subscriptions', coalesce((SELECT jsonb_agg(to_jsonb(ps))
                  FROM push_subscriptions ps WHERE ps.session_id = v_sid), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.export_my_account(text, text) TO anon;
