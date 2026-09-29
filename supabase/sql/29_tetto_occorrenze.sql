-- ============================================================================
-- Tetto agli appuntamenti calcolati — 29/09/2026
-- Segue: 28_rituali_ricorrenti.sql (review finale del ramo feat/rituali-ricorrenti)
--
-- Perché: rituale_occorrenze(r rituals) è eseguibile dalla chiave pubblica e accetta una riga
-- costruita a mano, non solo una riga vera della tabella. Il ciclo sui giorni andava da
-- data_inizio_locale a ripeti_fino senza limite: una riga inventata dal 1900 al 2100 fa
-- calcolare 73.050 giorni a ogni chiamata, e chiunque può tenere occupato il database.
--
-- create_ritual non accetta cicli più lunghi di 366 giorni (28_), quindi il tetto a 366 non
-- toglie nulla ai rituali veri: ferma solo le righe inventate. Serve anche la guardia sui NULL:
-- least() ignora i NULL, e senza guardia una riga ricorrente senza date farebbe 367 giri a vuoto.
--
-- Stessa firma, STABLE e search_path della 28_: la vista rituali_correnti e le altre funzioni
-- che la chiamano non cambiano. Idempotente, in una transazione.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION rituale_occorrenze(r rituals)
RETURNS SETOF timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT o FROM (
    SELECT ((r.date || ' ' || r.time)::timestamp AT TIME ZONE 'UTC') AS o
     WHERE r.ripeti_giorni IS NULL
    UNION ALL
    SELECT ((r.data_inizio_locale + i) + r.ora_locale) AT TIME ZONE r.fuso
      FROM generate_series(0, least(r.ripeti_fino - r.data_inizio_locale, 366)) AS i
     WHERE r.ripeti_giorni IS NOT NULL
       AND r.data_inizio_locale IS NOT NULL AND r.ripeti_fino IS NOT NULL
       AND extract(isodow FROM (r.data_inizio_locale + i))::smallint = ANY (r.ripeti_giorni)
  ) t
  WHERE r.fermato_il IS NULL OR r.ripeti_giorni IS NULL OR o <= r.fermato_il
  ORDER BY o
$$;

GRANT EXECUTE ON FUNCTION rituale_occorrenze(rituals)                   TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
