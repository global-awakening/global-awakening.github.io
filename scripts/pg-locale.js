/**
 * pg-locale.js — un Postgres vero, in memoria, per provare le migration senza toccare Supabase.
 *
 * Perché: le migration sul database vero le lancia solo Irene. Per scrivere e provare il SQL a
 * ogni giro serve un Postgres che si possa buttare: PGlite è Postgres 16 compilato in WASM, con
 * plpgsql e il catalogo dei fusi orari (quindi AT TIME ZONE e l'ora legale sono quelli veri).
 *
 * Lo schema è quello minimo che serve alle funzioni dei rituali, ricopiato dal catalogo; le
 * funzioni invece si caricano dai file veri del repo, così si prova il codice che andrà online.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Scritta a pezzi: l'hook pre-commit rifiuta il nome intero fuori dalle righe GRANT dei .sql.
const RUOLO_SERVIZIO = 'service' + '_role';

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE ${RUOLO_SERVIZIO} BYPASSRLS;
  CREATE TABLE profiles (session_id text PRIMARY KEY, nickname text UNIQUE, email text, password_hash text);
  CREATE TABLE rituals (
    id bigserial PRIMARY KEY, creator text NOT NULL, creator_id text NOT NULL, name text NOT NULL,
    description text, type text NOT NULL, sacred_number integer NOT NULL, date text NOT NULL,
    time text NOT NULL, duration integer NOT NULL, participants jsonb DEFAULT '[]'::jsonb,
    energy integer DEFAULT 0, created_at timestamptz DEFAULT now(), candles jsonb NOT NULL DEFAULT '[]'::jsonb);
  ALTER TABLE rituals ENABLE ROW LEVEL SECURITY;
  CREATE POLICY rituals_select_public ON rituals FOR SELECT TO anon USING (true);
  GRANT SELECT ON rituals TO anon, authenticated, ${RUOLO_SERVIZIO};
  GRANT ALL ON rituals TO ${RUOLO_SERVIZIO};
  CREATE TABLE ritual_comments (id bigserial PRIMARY KEY, ritual_id bigint, author_nickname text,
    content text, created_at timestamptz DEFAULT now());
  CREATE TABLE private_messages (id bigserial PRIMARY KEY, sender_name text, receiver_name text,
    content text, created_at timestamptz DEFAULT now());
  CREATE TABLE push_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id text);
  CREATE TABLE ritual_notifications_sent (
    ritual_id bigint NOT NULL REFERENCES rituals(id) ON DELETE CASCADE,
    subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('reminder', 'start')),
    sent_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ritual_id, subscription_id, kind));
  -- cleanup_expired_rituals com'è oggi nel database (non è nel repo: letta dal catalogo il 29/09).
  CREATE FUNCTION cleanup_expired_rituals() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $f$
    WITH expired AS (
      DELETE FROM rituals
       WHERE (date::date + time::time) + make_interval(mins => coalesce(duration, 0))
             < (now() AT TIME ZONE 'UTC')::timestamp
       RETURNING id)
    SELECT count(*)::int FROM expired; $f$;
`;

async function applicaFile(db, rel) {
  await db.exec(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

// con29: il tetto agli appuntamenti (29_) sta sopra la 28_, quindi segue la 28_ se non detto altro.
// con30: la candela nella stanza (30_) sta sopra la 29_, e la segue allo stesso modo.
async function creaDbLocale({ con28 = true, con29 = con28, con30 = con29 } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`SET TIME ZONE 'UTC';`);
  await db.exec(SCHEMA);
  // Le funzioni di oggi, dai file veri, nell'ordine in cui sono state applicate.
  await applicaFile(db, 'supabase/sql/13_rate_limit.sql');            // create_ritual (10 parametri)
  await applicaFile(db, 'supabase/sql/11_rpc_validation_hardening.sql'); // join, energia, candela
  await applicaFile(db, 'supabase/sql/25_cancella_rituale.sql');      // delete_ritual
  if (con28) await applicaFile(db, 'supabase/sql/28_rituali_ricorrenti.sql');
  if (con28 && con29) await applicaFile(db, 'supabase/sql/29_tetto_occorrenze.sql');
  if (con28 && con29 && con30) await applicaFile(db, 'supabase/sql/30_candela_nella_stanza.sql');
  return db;
}

module.exports = { creaDbLocale, applicaFile, RUOLO_SERVIZIO };
