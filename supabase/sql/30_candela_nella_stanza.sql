-- ============================================================================
-- La candela si accende nella stanza, e si vede chi l'ha accesa — 29/09/2026
-- Segue: 28_rituali_ricorrenti.sql, 29_tetto_occorrenze.sql (non ne tocca le funzioni)
--
-- Perché: la candela era un pulsante sulla scheda, accendibile giorni prima o dopo il rituale,
-- e restava un numero anonimo. Accendere una candela ha senso mentre si prega insieme: si
-- accende solo durante l'appuntamento in corso (dall'app, solo dentro la stanza), e nella stanza
-- si leggono i nomi di chi l'ha accesa.
--
-- Il controllo vero è qui: toggle_ritual_candle rifiuta con «not_live» fuori dall'appuntamento
-- in corso, anche se a chiamarla è un'app vecchia ancora in cache. Il nome di chi accende sta in
-- candles_nomi ({session_id: nome}).
--
-- Chi può accendere a nome di chi (dopo la revisione del 30/09):
--   · registrato (profilo con email): serve la sua credenziale (p_password_hash, stesso cancello
--     di leave_ritual) e il nome viene dal profilo. Senza credenziale: «Auth failed».
--   · ospite: il session_id resta l'unica prova, come per leave_ritual (rischio accettato, spec
--     28_ §4). I session_id sono pubblici (array candles), quindi chi li legge può ancora
--     accendere o spegnere la candela di un ALTRO OSPITE, e due ospiti possono darsi lo stesso
--     nome. Non può però usare il nome di un registrato: un nome uguale (maiuscole a parte) al
--     nickname di un altro profilo diventa 'Anonymous'.
--   · in più: si accende solo chi è nelle presenze dell'appuntamento corrente (visto negli ultimi
--     60 s, 28_) — «not_present» —, e al massimo 500 candele per appuntamento — «too_many_candles».
--
-- App vecchie in cache: chiamano con due parametri per nome e trovano la nuova funzione grazie
-- ai default. Per un ospite nella stanza funziona come prima; per un registrato risponde «Auth
-- failed» (manca la credenziale) finché l'app non si aggiorna: scelta consapevole, l'alternativa
-- era lasciare aperta l'impersonazione. Dalla scheda, fuori dalla stanza, l'app vecchia riceve
-- «not_present»: la candela si accende solo nella stanza.
--
-- ⚠️ Se si rilancia la 28_ vanno rilanciate anche la 29_ e la 30_, in quest'ordine: la 28_ rimette
-- toggle_ritual_candle a due parametri (senza cancelli), leave_ritual e la vista senza i nomi.
--
-- Ridefinisce anche delete_my_account (base: 22_, l'ultima che la tocca) perché chi cancella
-- l'account porti via le sue candele e i suoi nomi.
--
-- Idempotente, in una transazione.
-- ============================================================================

BEGIN;

ALTER TABLE rituals ADD COLUMN IF NOT EXISTS candles_nomi jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── La candela ─────────────────────────────────────────────────────────────
-- Una sola firma: con due (o tre) PostgREST non saprebbe quale chiamare e l'app andrebbe in
-- errore. Si tolgono quella della 28_ (due parametri) e quella della prima stesura della 30_ (tre).
-- Stesse validazioni della 28_, più i cancelli descritti in testa.
DROP FUNCTION IF EXISTS toggle_ritual_candle(bigint, text);
DROP FUNCTION IF EXISTS toggle_ritual_candle(bigint, text, text);

CREATE OR REPLACE FUNCTION toggle_ritual_candle(p_ritual_id bigint, p_session_id text,
                                                p_nickname text DEFAULT NULL, p_password_hash text DEFAULT NULL)
RETURNS SETOF rituals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v rituals%ROWTYPE; v_occ timestamptz; v_nome text; v_candles jsonb; v_accende boolean;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN RAISE EXCEPTION 'session_required'; END IF;
  IF length(p_session_id) > 255 THEN RAISE EXCEPTION 'session_id_too_long'; END IF;
  -- FOR UPDATE: due accensioni insieme non superano il tetto e non si perdono a vicenda.
  SELECT * INTO v FROM rituals WHERE id = p_ritual_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ritual_not_found'; END IF;
  v_occ := rituale_occorrenza_corrente(v);
  -- Stessa finestra della stanza e delle presenze (segna_presenza_rituale, 28_).
  IF v_occ IS NULL OR now() < v_occ OR now() >= v_occ + make_interval(mins => coalesce(v.duration, 0)) THEN
    RAISE EXCEPTION 'not_live';
  END IF;
  -- Registrato: stesso cancello di leave_ritual. Senza la sua credenziale nessuno accende o
  -- spegne a suo nome (nemmeno un'app vecchia che non la manda).
  IF EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND email IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND password_hash = p_password_hash) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;
  -- Le candele (e i nomi) di un appuntamento passato si spengono prima di accendere quella nuova.
  -- candles_occorrenza NULL = «quello corrente» (vedi 28_).
  UPDATE rituals SET candles = '[]'::jsonb, candles_nomi = '{}'::jsonb
   WHERE id = p_ritual_id AND candles_occorrenza IS NOT NULL AND candles_occorrenza IS DISTINCT FROM v_occ;
  SELECT candles INTO v_candles FROM rituals WHERE id = p_ritual_id;
  v_accende := NOT (v_candles @> to_jsonb(array[p_session_id]));
  -- Spegnere la propria candela si può sempre; accenderla solo da dentro la stanza.
  IF v_accende THEN
    IF NOT EXISTS (SELECT 1 FROM ritual_presence
                    WHERE ritual_id = p_ritual_id AND occorrenza = v_occ AND session_id = p_session_id
                      AND visto_il > now() - interval '60 seconds') THEN
      RAISE EXCEPTION 'not_present';
    END IF;
    -- Stesso tetto delle presenze (28_).
    IF jsonb_array_length(v_candles) >= 500 THEN RAISE EXCEPTION 'too_many_candles'; END IF;
  END IF;
  -- Il nome. Registrato: quello del profilo, qualunque cosa dica l'app. Ospite: quello mandato,
  -- ripulito da caratteri di controllo, a larghezza zero e di direzione del testo (un nome
  -- «invisibile» o che si scrive al contrario), poi al massimo 50 caratteri; se non resta niente,
  -- o se è il nome di un altro profilo, 'Anonymous' come per il creatore in create_ritual.
  SELECT nullif(btrim(nickname), '') INTO v_nome FROM profiles WHERE session_id = p_session_id;
  IF v_nome IS NULL THEN
    v_nome := nullif(left(btrim(regexp_replace(coalesce(p_nickname, ''),
                '[[:cntrl:]​-‏‪-‮⁦-⁩]', '', 'g')), 50), '');
    IF v_nome IS NOT NULL AND EXISTS (SELECT 1 FROM profiles
                                        WHERE lower(nickname) = lower(v_nome) AND session_id <> p_session_id) THEN
      v_nome := NULL;
    END IF;
  END IF;
  v_nome := coalesce(v_nome, 'Anonymous');
  RETURN QUERY
    UPDATE rituals
       SET candles = CASE
             WHEN NOT v_accende THEN
               coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                          WHERE e <> to_jsonb(p_session_id)), '[]'::jsonb)
             ELSE candles || to_jsonb(p_session_id) END,
           candles_nomi = CASE
             WHEN NOT v_accende THEN candles_nomi - p_session_id
             ELSE candles_nomi || jsonb_build_object(p_session_id, v_nome) END,
           candles_occorrenza = v_occ
     WHERE id = p_ritual_id
     RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION toggle_ritual_candle(bigint, text, text, text) TO anon;

-- ── La vista ───────────────────────────────────────────────────────────────
-- Identica a quella della 28_, più candles_nomi filtrata come candles: i nomi di un
-- appuntamento passato non si mostrano in quello di oggi.
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
       CASE WHEN c.occ IS NULL THEN 0 ELSE rituale_presenti_ora(r.id, c.occ) END AS presenti_ora,
       CASE WHEN r.candles_occorrenza IS NULL OR r.candles_occorrenza = c.occ
            THEN r.candles_nomi ELSE '{}'::jsonb END AS candles_nomi
  FROM rituals r
  CROSS JOIN LATERAL (SELECT rituale_occorrenza_corrente(r) AS occ) c;

GRANT SELECT ON rituali_correnti TO anon, authenticated, service_role;

-- ── Lasciare un ciclo ──────────────────────────────────────────────────────
-- Corpo della 28_, più il nome: chi esce dal ciclo porta via la sua candela e il suo nome.
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
                                   WHERE e <> to_jsonb(p_session_id)), '[]'::jsonb),
         candles_nomi = candles_nomi - p_session_id
   WHERE id = p_ritual_id;
  DELETE FROM ritual_presence WHERE ritual_id = p_ritual_id AND session_id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION leave_ritual(bigint, text, text) TO anon;

-- ── Cancellare l'account ───────────────────────────────────────────────────
-- Corpo della 22_ (l'ultima migration che la ridefinisce), identico, più il blocco segnato
-- «NUOVO (30)»: la candela è il session_id dentro rituals.candles, il nome sta in candles_nomi.
-- Senza, chi chiede di sparire resterebbe scritto col suo nome nelle stanze dei rituali.
CREATE OR REPLACE FUNCTION public.delete_my_account(
  p_nickname      text,
  p_password_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_sid   text;
BEGIN
  SELECT email, session_id INTO v_email, v_sid
    FROM profiles
   WHERE nickname = p_nickname AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  -- (a) Anonimizza i contenuti pubblici (preserva i thread altrui)
  UPDATE consciousness_posts    SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE consciousness_comments SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE ritual_comments        SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE rituals                SET creator         = 'Utente eliminato' WHERE creator = p_nickname;
  -- chat_messages NON esiste piu' (droppata da 08_drop_dead_tables.sql): vedi 17_.

  -- (b) Cancella i dati personali/privati
  DELETE FROM private_messages WHERE sender_name = p_nickname OR receiver_name = p_nickname;
  DELETE FROM notifications    WHERE user_nickname = p_nickname;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM telepathy_scores WHERE user_id = v_email;
    DELETE FROM magic_links      WHERE email   = v_email;
    DELETE FROM password_resets  WHERE email   = v_email;
  END IF;

  IF v_sid IS NOT NULL AND v_sid <> '' THEN
    DELETE FROM online_users      WHERE id = v_sid;
    DELETE FROM telepathy_queue   WHERE id = v_sid;
    DELETE FROM telepathy_invites WHERE from_id = v_sid OR to_id = v_sid;

    -- NUOVO (22): abbonamenti alle notifiche push. Un endpoint push e' un canale aperto verso
    -- un telefono: lasciarlo vivo dopo la cancellazione significa continuare a scrivere a
    -- qualcuno che ha chiesto di sparire.
    DELETE FROM push_subscriptions WHERE session_id = v_sid;

    -- NUOVO (30): le sue candele e il nome accanto, in ogni rituale.
    UPDATE rituals
       SET candles      = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                                     WHERE e <> to_jsonb(v_sid)), '[]'::jsonb),
           candles_nomi = candles_nomi - v_sid
     WHERE candles @> to_jsonb(array[v_sid]) OR candles_nomi ? v_sid;
  END IF;

  -- (c) SP1: se ne vanno solo i blocchi che ho impostato io. Quelli subiti
  -- restano, altrimenti cancellare l'account diventa un modo per farsi
  -- sbloccare da chi ci ha bloccati.
  DELETE FROM user_blocks WHERE blocker_nickname = p_nickname;
  UPDATE content_reports SET reporter_nickname = 'Utente eliminato' WHERE reporter_nickname = p_nickname;

  -- (d) Cancella l'identita'
  DELETE FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash;
END $$;

GRANT EXECUTE ON FUNCTION public.delete_my_account(text, text) TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
