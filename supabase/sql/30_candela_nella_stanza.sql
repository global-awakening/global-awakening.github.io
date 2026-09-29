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
-- candles_nomi ({session_id: nome}): per un profilo registrato lo prende il database dal profilo
-- (non si può spacciare per un altro), per un ospite vale quello mandato dall'app.
--
-- Idempotente, in una transazione. La chiamata di oggi (due parametri per nome) trova la nuova
-- funzione grazie al default del terzo.
-- ============================================================================

BEGIN;

ALTER TABLE rituals ADD COLUMN IF NOT EXISTS candles_nomi jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── La candela ─────────────────────────────────────────────────────────────
-- Con due firme (due e tre parametri) PostgREST non saprebbe quale chiamare e l'app andrebbe in
-- errore: la vecchia si toglie. Stesse validazioni della 28_, più il cancello «in corso».
DROP FUNCTION IF EXISTS toggle_ritual_candle(bigint, text);

CREATE OR REPLACE FUNCTION toggle_ritual_candle(p_ritual_id bigint, p_session_id text, p_nickname text DEFAULT NULL)
RETURNS SETOF rituals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v rituals%ROWTYPE; v_occ timestamptz; v_nome text;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN RAISE EXCEPTION 'session_required'; END IF;
  IF length(p_session_id) > 255 THEN RAISE EXCEPTION 'session_id_too_long'; END IF;
  SELECT * INTO v FROM rituals WHERE id = p_ritual_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ritual_not_found'; END IF;
  v_occ := rituale_occorrenza_corrente(v);
  -- Stessa finestra della stanza e delle presenze (segna_presenza_rituale, 28_).
  IF v_occ IS NULL OR now() < v_occ OR now() >= v_occ + make_interval(mins => coalesce(v.duration, 0)) THEN
    RAISE EXCEPTION 'not_live';
  END IF;
  -- Registrato: il nome del profilo, qualunque cosa dica l'app. Ospite: quello mandato, al
  -- massimo 50 caratteri; se manca, 'Anonymous' come per il creatore in create_ritual.
  SELECT nullif(btrim(nickname), '') INTO v_nome FROM profiles WHERE session_id = p_session_id;
  IF v_nome IS NULL THEN v_nome := nullif(left(btrim(coalesce(p_nickname, '')), 50), ''); END IF;
  v_nome := coalesce(v_nome, 'Anonymous');
  -- Le candele (e i nomi) di un appuntamento passato si spengono prima di accendere quella nuova.
  -- candles_occorrenza NULL = «quello corrente» (vedi 28_).
  UPDATE rituals SET candles = '[]'::jsonb, candles_nomi = '{}'::jsonb
   WHERE id = p_ritual_id AND candles_occorrenza IS NOT NULL AND candles_occorrenza IS DISTINCT FROM v_occ;
  -- Nell'UPDATE, «candles» a destra è il valore di prima: le due colonne decidono insieme.
  RETURN QUERY
    UPDATE rituals
       SET candles = CASE
             WHEN candles @> to_jsonb(array[p_session_id]) THEN
               coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                          WHERE e <> to_jsonb(p_session_id)), '[]'::jsonb)
             ELSE candles || to_jsonb(p_session_id) END,
           candles_nomi = CASE
             WHEN candles @> to_jsonb(array[p_session_id]) THEN candles_nomi - p_session_id
             ELSE candles_nomi || jsonb_build_object(p_session_id, v_nome) END,
           candles_occorrenza = v_occ
     WHERE id = p_ritual_id
     RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION toggle_ritual_candle(bigint, text, text) TO anon;

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

NOTIFY pgrst, 'reload schema';

COMMIT;
