-- ============================================================================
-- Rituali che si ripetono — 29/09/2026
-- Spec: docs/superpowers/specs/2026-09-29-rituali-ricorrenti-design.md
--
-- Una sola riga per rituale, con la regola dentro. Gli appuntamenti non si copiano: li calcola
-- rituale_occorrenze(), unica fonte. La vista rituali_correnti riscrive date/time con
-- l'appuntamento corrente, così app, notifiche e pulizia continuano a ragionare su un istante
-- solo, come prima.
--
-- Idempotente, in una transazione. Additiva per l'app online: create_ritual guadagna tre
-- parametri con default, quindi la chiamata di oggi (10 parametri) continua a funzionare.
-- ============================================================================

BEGIN;

-- ── La regola ──────────────────────────────────────────────────────────────
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS ripeti_giorni      smallint[];
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS ripeti_fino        date;
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS fuso               text;
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS ora_locale         time;
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS data_inizio_locale date;
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS fermato_il         timestamptz;
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS candles_occorrenza timestamptz;

-- ── Presenze: tabella a parte ──────────────────────────────────────────────
-- Non una colonna di rituals: chi è nella stanza si segna ogni 30 secondi, e ogni scrittura su
-- rituals fa ricaricare tutte le app collegate (canale realtime). Qui si scrive senza rumore.
CREATE TABLE IF NOT EXISTS ritual_presence (
  ritual_id  bigint      NOT NULL REFERENCES rituals(id) ON DELETE CASCADE,
  occorrenza timestamptz NOT NULL,
  session_id text        NOT NULL,
  visto_il   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ritual_id, occorrenza, session_id)
);
ALTER TABLE ritual_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ritual_presence FROM PUBLIC, anon, authenticated;

-- ── Gli appuntamenti ───────────────────────────────────────────────────────
-- Il giorno si conta con un intero, non con generate_series su date: quella versione restituisce
-- timestamptz nel fuso della sessione, e il giorno «di Roma» diventerebbe quello del server.
-- (d + ora_locale) è un timestamp senza fuso; AT TIME ZONE fuso lo legge come ora di quel fuso:
-- è qui che l'ora legale viene gestita da Postgres.
CREATE OR REPLACE FUNCTION rituale_occorrenze(r rituals)
RETURNS SETOF timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT o FROM (
    SELECT ((r.date || ' ' || r.time)::timestamp AT TIME ZONE 'UTC') AS o
     WHERE r.ripeti_giorni IS NULL
    UNION ALL
    SELECT ((r.data_inizio_locale + i) + r.ora_locale) AT TIME ZONE r.fuso
      FROM generate_series(0, r.ripeti_fino - r.data_inizio_locale) AS i
     WHERE r.ripeti_giorni IS NOT NULL
       AND extract(isodow FROM (r.data_inizio_locale + i))::smallint = ANY (r.ripeti_giorni)
  ) t
  WHERE r.fermato_il IS NULL OR r.ripeti_giorni IS NULL OR o <= r.fermato_il
  ORDER BY o
$$;

-- L'appuntamento «corrente»: quello in corso o il prossimo; se sono tutti passati, l'ultimo
-- (così lo stato «finito» e la pulizia funzionano come per un rituale singolo). plpgsql per
-- poter intercettare una riga malformata: meglio NULL che far fallire la vista per tutti.
CREATE OR REPLACE FUNCTION rituale_occorrenza_corrente(r rituals)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v timestamptz;
BEGIN
  SELECT o INTO v FROM rituale_occorrenze(r) o
   WHERE o + make_interval(mins => coalesce(r.duration, 0)) > now()
   ORDER BY o LIMIT 1;
  IF v IS NULL THEN
    SELECT max(o) INTO v FROM rituale_occorrenze(r) o;
  END IF;
  RETURN v;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Posizione e totale («giorno 3 di 8»): protette come l'appuntamento corrente, perché la vista le
-- chiama per ogni riga. Una regola rotta (fuso sconosciuto, date storte) dà NULL e rompe solo
-- la sua scheda, non l'elenco per tutti.
CREATE OR REPLACE FUNCTION rituale_occorrenza_numero(r rituals, p_occ timestamptz)
RETURNS int LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  RETURN (SELECT count(*)::int FROM rituale_occorrenze(r) o WHERE o <= p_occ);
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION rituale_occorrenze_totali(r rituals)
RETURNS int LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  RETURN (SELECT count(*)::int FROM rituale_occorrenze(r));
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Quante persone sono nella stanza adesso: viste negli ultimi 60 secondi. SECURITY DEFINER
-- perché anon non legge ritual_presence (si contano, non si elencano).
CREATE OR REPLACE FUNCTION rituale_presenti_ora(p_ritual_id bigint, p_occorrenza timestamptz)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM ritual_presence
   WHERE ritual_id = p_ritual_id AND occorrenza = p_occorrenza
     AND visto_il > now() - interval '60 seconds'
$$;

-- ── La vista ───────────────────────────────────────────────────────────────
-- Stesse colonne di rituals. Per i rituali singoli date/time/candles passano intatti (nessuna
-- conversione: una riga malformata rompe solo la sua scheda, come prima). Per i ricorrenti
-- date/time diventano l'appuntamento corrente, in UTC, negli stessi formati testo di sempre.
DROP VIEW IF EXISTS rituali_correnti;
CREATE VIEW rituali_correnti WITH (security_invoker = true) AS
SELECT r.id, r.creator, r.creator_id, r.name, r.description, r.type, r.sacred_number,
       CASE WHEN r.ripeti_giorni IS NOT NULL AND c.occ IS NOT NULL
            THEN to_char(c.occ AT TIME ZONE 'UTC', 'YYYY-MM-DD') ELSE r.date END AS date,
       CASE WHEN r.ripeti_giorni IS NOT NULL AND c.occ IS NOT NULL
            THEN to_char(c.occ AT TIME ZONE 'UTC', 'HH24:MI:SS') ELSE r.time END AS time,
       r.duration, r.participants, r.energy, r.created_at,
       CASE WHEN r.candles_occorrenza IS NULL OR r.candles_occorrenza = c.occ
            THEN r.candles ELSE '[]'::jsonb END AS candles,
       r.ripeti_giorni, r.ripeti_fino, r.fuso, r.ora_locale, r.data_inizio_locale, r.fermato_il,
       r.candles_occorrenza,
       r.date AS prima_date, r.time AS prima_time,
       CASE WHEN r.ripeti_giorni IS NULL THEN 1
            ELSE rituale_occorrenza_numero(r, c.occ) END AS occorrenza_numero,
       CASE WHEN r.ripeti_giorni IS NULL THEN 1
            ELSE rituale_occorrenze_totali(r) END AS occorrenze_totali,
       CASE WHEN c.occ IS NULL THEN 0 ELSE rituale_presenti_ora(r.id, c.occ) END AS presenti_ora
  FROM rituals r
  CROSS JOIN LATERAL (SELECT rituale_occorrenza_corrente(r) AS occ) c;

GRANT SELECT ON rituali_correnti TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rituale_occorrenze(rituals)                   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rituale_occorrenza_corrente(rituals)          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rituale_occorrenza_numero(rituals, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rituale_occorrenze_totali(rituals)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rituale_presenti_ora(bigint, timestamptz)     TO anon, authenticated, service_role;

-- Volutamente SECURITY INVOKER (non definer come le altre): chi chiama vede solo i rituali che la
-- sua policy di SELECT gli lascia vedere; con definer si esporrebbero righe che non potrebbe leggere.
CREATE OR REPLACE FUNCTION get_ritual_occurrences(p_ritual_id bigint)
RETURNS SETOF timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT o FROM rituals r, rituale_occorrenze(r) o WHERE r.id = p_ritual_id ORDER BY o
$$;
GRANT EXECUTE ON FUNCTION get_ritual_occurrences(bigint) TO anon, authenticated, service_role;

-- ── create_ritual con la ripetizione ───────────────────────────────────────
-- Si toglie la firma a 10 parametri (unica esistente, verificato dal catalogo il 29/09): con due
-- candidate PostgREST non saprebbe quale chiamare e l'app di oggi andrebbe in errore. La nuova
-- ha i tre parametri in più con default, quindi la chiamata di oggi la trova.
DROP FUNCTION IF EXISTS create_ritual(text,text,text,text,text,int,date,time,int,text);

CREATE OR REPLACE FUNCTION create_ritual(
  p_creator text, p_creator_id text, p_name text, p_description text, p_type text,
  p_sacred_number int, p_date date, p_time time, p_duration int, p_password_hash text,
  p_ripeti_giorni smallint[] DEFAULT NULL, p_ripeti_fino date DEFAULT NULL, p_fuso text DEFAULT NULL
)
RETURNS SETOF rituals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ricorre boolean := p_ripeti_giorni IS NOT NULL OR p_ripeti_fino IS NOT NULL OR p_fuso IS NOT NULL;
  v_locale  timestamp;
  v_ora     time;
  v_giorno  date;
  v_primo   date;
  v_istante timestamptz;
  i         int;
BEGIN
  -- Corpo di 13_rate_limit.sql, verbatim, fino al rate-limit escluso.
  IF EXISTS (SELECT 1 FROM profiles WHERE nickname = p_creator) THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE nickname = p_creator AND password_hash = p_password_hash) THEN
      RAISE EXCEPTION 'Auth failed';
    END IF;
  END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF length(p_name) > 200 THEN RAISE EXCEPTION 'name_too_long'; END IF;
  IF length(coalesce(p_description, '')) > 5000 THEN RAISE EXCEPTION 'description_too_long'; END IF;
  IF coalesce(p_type, 'consciousness') NOT IN ('consciousness','dna','lightbody','unity','ascension') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;
  IF p_sacred_number IS NOT NULL AND (p_sacred_number < 1 OR p_sacred_number > 1000) THEN
    RAISE EXCEPTION 'sacred_number_out_of_range';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'date_required'; END IF;
  IF p_time IS NULL THEN RAISE EXCEPTION 'time_required'; END IF;
  IF p_duration IS NULL OR p_duration < 1 OR p_duration > 1440 THEN RAISE EXCEPTION 'duration_out_of_range'; END IF;

  v_istante := (p_date + p_time) AT TIME ZONE 'UTC';

  IF v_ricorre THEN
    IF p_ripeti_giorni IS NULL OR p_ripeti_fino IS NULL OR p_fuso IS NULL THEN
      RAISE EXCEPTION 'recurrence_incomplete';
    END IF;
    IF cardinality(p_ripeti_giorni) = 0
       OR EXISTS (SELECT 1 FROM unnest(p_ripeti_giorni) g WHERE g IS NULL OR g < 1 OR g > 7)
       OR (SELECT count(DISTINCT g) FROM unnest(p_ripeti_giorni) g) <> cardinality(p_ripeti_giorni) THEN
      RAISE EXCEPTION 'recurrence_days_invalid';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_fuso) THEN
      RAISE EXCEPTION 'timezone_invalid';
    END IF;
    -- Il modulo manda l'istante del primo giorno in UTC; ora e giorno «di chi crea» si
    -- ricavano qui, così il client non può mandarne una versione che contraddice l'istante.
    v_locale := v_istante AT TIME ZONE p_fuso;
    v_ora    := v_locale::time;
    v_giorno := v_locale::date;
    IF p_ripeti_fino < v_giorno OR p_ripeti_fino > v_giorno + 366 THEN
      RAISE EXCEPTION 'recurrence_end_invalid';
    END IF;
    -- Una preghiera quotidiana che dura più di 12 ore si sovrapporrebbe alla successiva (e il
    -- promemoria delle 15 minuti prima andrebbe perso, perché «corrente» è ancora la vecchia).
    IF p_duration > 720 THEN RAISE EXCEPTION 'recurrence_duration_too_long'; END IF;
    -- La data del modulo vale come «a partire da»: il primo appuntamento è il primo giorno
    -- scelto da lì in avanti.
    v_primo := NULL;
    FOR i IN 0..6 LOOP
      IF v_giorno + i <= p_ripeti_fino
         AND extract(isodow FROM v_giorno + i)::smallint = ANY (p_ripeti_giorni) THEN
        v_primo := v_giorno + i; EXIT;
      END IF;
    END LOOP;
    IF v_primo IS NULL THEN RAISE EXCEPTION 'recurrence_empty'; END IF;
    IF p_creator_id IS NOT NULL AND (
         SELECT count(*) FROM rituals
          WHERE creator_id = p_creator_id AND ripeti_giorni IS NOT NULL
            AND fermato_il IS NULL AND ripeti_fino >= current_date - 1) >= 10 THEN
      RAISE EXCEPTION 'recurrence_limit';
    END IF;
    v_istante := (v_primo + v_ora) AT TIME ZONE p_fuso;
  END IF;

  -- Rate-limit (B9, verbatim da 13_): max 5 rituali per creator_id negli ultimi 10 minuti.
  IF p_creator_id IS NOT NULL AND (
       SELECT count(*) FROM rituals
        WHERE creator_id = p_creator_id AND created_at > now() - interval '10 minutes') >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  RETURN QUERY
    INSERT INTO rituals (
      creator, creator_id, name, description, type, sacred_number, date, time, duration,
      participants, energy, ripeti_giorni, ripeti_fino, fuso, ora_locale, data_inizio_locale
    ) VALUES (
      coalesce(nullif(p_creator, ''), 'Anonymous'), p_creator_id, p_name,
      coalesce(p_description, ''), coalesce(p_type, 'consciousness'), coalesce(p_sacred_number, 11),
      to_char(v_istante AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      to_char(v_istante AT TIME ZONE 'UTC', 'HH24:MI:SS'),
      p_duration, jsonb_build_array(p_creator_id), 0,
      CASE WHEN v_ricorre THEN (SELECT array_agg(g ORDER BY g) FROM unnest(p_ripeti_giorni) g) END,
      CASE WHEN v_ricorre THEN p_ripeti_fino END,
      CASE WHEN v_ricorre THEN p_fuso END,
      CASE WHEN v_ricorre THEN v_ora END,
      CASE WHEN v_ricorre THEN v_primo END
    )
    RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION create_ritual(text,text,text,text,text,int,date,time,int,text,smallint[],date,text) TO anon;

-- ── Lasciare un ciclo ──────────────────────────────────────────────────────
-- Un solo «Partecipa» vale per tutto il ciclo (D3); serve quindi anche l'uscita. Il creatore non
-- esce: per lui ci sono Cancella e Ferma. Auth condizionale: i session_id sono leggibili da tutti
-- nell'array participants, e togliere qualcuno gli spegnerebbe le notifiche. Per gli ospiti il
-- session_id resta l'unica prova (rischio accettato, spec §4).
CREATE OR REPLACE FUNCTION leave_ritual(p_ritual_id bigint, p_session_id text, p_password_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v rituals%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN RAISE EXCEPTION 'session_required'; END IF;
  IF length(p_session_id) > 255 THEN RAISE EXCEPTION 'session_id_too_long'; END IF;
  SELECT * INTO v FROM rituals WHERE id = p_ritual_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ritual_not_found'; END IF;
  IF v.creator_id = p_session_id THEN RAISE EXCEPTION 'creator_cannot_leave'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND email IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND password_hash = p_password_hash) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;
  UPDATE rituals
     SET participants = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(participants) e
                                   WHERE e <> to_jsonb(p_session_id)), '[]'::jsonb),
         candles      = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                                   WHERE e <> to_jsonb(p_session_id)), '[]'::jsonb)
   WHERE id = p_ritual_id;
  DELETE FROM ritual_presence WHERE ritual_id = p_ritual_id AND session_id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION leave_ritual(bigint, text, text) TO anon;

-- ── Fermare un ciclo ───────────────────────────────────────────────────────
-- Stessi cancelli di delete_ritual (25_): esiste, è del chiamante, credenziale per i registrati.
-- Prima del primo appuntamento non si ferma: si cancella (senza appuntamenti la riga non
-- avrebbe un «corrente» e resterebbe appesa).
CREATE OR REPLACE FUNCTION ferma_rituale(p_ritual_id bigint, p_session_id text, p_password_hash text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v rituals%ROWTYPE;
BEGIN
  SELECT * INTO v FROM rituals WHERE id = p_ritual_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ritual_not_found'; END IF;
  IF coalesce(v.creator_id, '') IS DISTINCT FROM coalesce(p_session_id, '') THEN RAISE EXCEPTION 'not_creator'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE nickname = v.creator)
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE nickname = v.creator AND password_hash = p_password_hash) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;
  IF v.ripeti_giorni IS NULL THEN RAISE EXCEPTION 'not_recurring'; END IF;
  IF v.fermato_il IS NOT NULL THEN RAISE EXCEPTION 'already_stopped'; END IF;
  IF now() < ((v.date || ' ' || v.time)::timestamp AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'not_started'; END IF;
  UPDATE rituals SET fermato_il = now() WHERE id = p_ritual_id;
  RETURN p_ritual_id;
END;
$$;
GRANT EXECUTE ON FUNCTION ferma_rituale(bigint, text, text) TO anon;

-- ── Candele per appuntamento ───────────────────────────────────────────────
-- Corpo di 11_ con una regola in più: le candele di un appuntamento passato si spengono prima di
-- accendere quella nuova. candles_occorrenza NULL = «quello corrente» (i rituali singoli di prima
-- della 28_ ce l'hanno NULL: le candele degli altri non devono sparire al primo tocco).
CREATE OR REPLACE FUNCTION toggle_ritual_candle(p_ritual_id bigint, p_session_id text)
RETURNS SETOF rituals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v rituals%ROWTYPE; v_occ timestamptz;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN RAISE EXCEPTION 'session_required'; END IF;
  IF length(p_session_id) > 255 THEN RAISE EXCEPTION 'session_id_too_long'; END IF;
  SELECT * INTO v FROM rituals WHERE id = p_ritual_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ritual_not_found'; END IF;
  v_occ := rituale_occorrenza_corrente(v);
  UPDATE rituals SET candles = '[]'::jsonb
   WHERE id = p_ritual_id AND candles_occorrenza IS NOT NULL AND candles_occorrenza IS DISTINCT FROM v_occ;
  RETURN QUERY
    UPDATE rituals
       SET candles = CASE
             WHEN candles @> to_jsonb(array[p_session_id]) THEN
               coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                          WHERE e <> to_jsonb(p_session_id)), '[]'::jsonb)
             ELSE candles || to_jsonb(p_session_id) END,
           candles_occorrenza = v_occ
     WHERE id = p_ritual_id
     RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION toggle_ritual_candle(bigint, text) TO anon;

-- ── Presenze ───────────────────────────────────────────────────────────────
-- La stanza la chiama all'apertura e ogni 30 secondi; conta chi si è fatto vivo nell'ultimo
-- minuto. Trustful come join_ritual: conta, non autorizza niente. Tetto di 500 righe per
-- appuntamento: oltre, chi arriva non viene scritto ma il numero torna lo stesso.
CREATE OR REPLACE FUNCTION segna_presenza_rituale(p_ritual_id bigint, p_session_id text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v rituals%ROWTYPE; v_occ timestamptz;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN RAISE EXCEPTION 'session_required'; END IF;
  IF length(p_session_id) > 255 THEN RAISE EXCEPTION 'session_id_too_long'; END IF;
  SELECT * INTO v FROM rituals WHERE id = p_ritual_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ritual_not_found'; END IF;
  v_occ := rituale_occorrenza_corrente(v);
  IF v_occ IS NULL OR now() < v_occ OR now() >= v_occ + make_interval(mins => v.duration) THEN
    RAISE EXCEPTION 'not_live';
  END IF;
  DELETE FROM ritual_presence WHERE ritual_id = p_ritual_id AND occorrenza <> v_occ;
  IF EXISTS (SELECT 1 FROM ritual_presence WHERE ritual_id = p_ritual_id AND occorrenza = v_occ AND session_id = p_session_id)
     OR (SELECT count(*) FROM ritual_presence WHERE ritual_id = p_ritual_id AND occorrenza = v_occ) < 500 THEN
    INSERT INTO ritual_presence (ritual_id, occorrenza, session_id) VALUES (p_ritual_id, v_occ, p_session_id)
      ON CONFLICT (ritual_id, occorrenza, session_id) DO UPDATE SET visto_il = now();
  END IF;
  RETURN rituale_presenti_ora(p_ritual_id, v_occ);
END;
$$;
GRANT EXECUTE ON FUNCTION segna_presenza_rituale(bigint, text) TO anon;

-- ── Pulizia ────────────────────────────────────────────────────────────────
-- I singoli: stessa condizione di prima, verbatim. I ricorrenti: finito l'ultimo appuntamento,
-- oppure nessun appuntamento.
CREATE OR REPLACE FUNCTION cleanup_expired_rituals()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH expired AS (
    DELETE FROM rituals r
     WHERE (r.ripeti_giorni IS NULL
            AND (r.date::date + r.time::time) + make_interval(mins => coalesce(r.duration, 0))
                < (now() AT TIME ZONE 'UTC')::timestamp)
        OR (r.ripeti_giorni IS NOT NULL
            AND coalesce(rituale_occorrenza_corrente(r) + make_interval(mins => coalesce(r.duration, 0)) < now(), true))
     RETURNING id)
  SELECT count(*)::int INTO n FROM expired;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION cleanup_expired_rituals() TO anon;

-- ── Notifiche: una per appuntamento ────────────────────────────────────────
ALTER TABLE ritual_notifications_sent ADD COLUMN IF NOT EXISTS occorrenza timestamptz NOT NULL DEFAULT 'epoch';
ALTER TABLE ritual_notifications_sent DROP CONSTRAINT IF EXISTS ritual_notifications_sent_pkey;
UPDATE ritual_notifications_sent s
   SET occorrenza = rituale_occorrenza_corrente(r)
  FROM rituals r
-- Se sulla stessa terna (rituale, iscrizione, tipo) esiste già la riga dell'appuntamento corrente
-- (una riga «epoch» rimasta irrisolta in un giro precedente, con la regola rotta, e poi l'altra
-- risolta), promuovere anche questa creerebbe un doppione e la PK fallirebbe (23505) al rilancio:
-- la riga «epoch» resta com'è, e la sua chiave è comunque distinta.
 WHERE r.id = s.ritual_id AND s.occorrenza = 'epoch' AND rituale_occorrenza_corrente(r) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM ritual_notifications_sent x
                    WHERE x.ritual_id = s.ritual_id AND x.subscription_id = s.subscription_id
                      AND x.kind = s.kind AND x.occorrenza = rituale_occorrenza_corrente(r));
ALTER TABLE ritual_notifications_sent
  ADD CONSTRAINT ritual_notifications_sent_pkey PRIMARY KEY (ritual_id, subscription_id, kind, occorrenza);

-- La funzione di oggi, finché non viene ripubblicata, scrive senza occorrenza: il trigger mette
-- quella corrente, così le sue righe e quelle della funzione nuova si riconoscono e non partono
-- doppioni nel passaggio.
CREATE OR REPLACE FUNCTION ritual_notifications_occorrenza()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v timestamptz;
BEGIN
  IF NEW.occorrenza = 'epoch' THEN
    SELECT rituale_occorrenza_corrente(r) INTO v FROM rituals r WHERE r.id = NEW.ritual_id;
    IF v IS NOT NULL THEN NEW.occorrenza := v; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ritual_notifications_occorrenza ON ritual_notifications_sent;
CREATE TRIGGER trg_ritual_notifications_occorrenza
  BEFORE INSERT ON ritual_notifications_sent
  FOR EACH ROW EXECUTE FUNCTION ritual_notifications_occorrenza();

NOTIFY pgrst, 'reload schema';

COMMIT;
