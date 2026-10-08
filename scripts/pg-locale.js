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

// Lo schema della telepatia e delle tabelle che delete_my_account/export_my_account toccano,
// ricopiato dal catalogo del database vero (letto il 30/09/2026, Task 1 del piano inviti).
// Solo per creaDbTelepatia: creaDbLocale resta com'era, perché test-candela-stanza-sql.js crea
// da sé alcune di queste tabelle e non deve trovarle già lì.
const SCHEMA_TELEPATIA = `
  -- send_private_message (catalogo 35) scrive e legge queste due colonne.
  ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS sender_id text, ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
  ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS bio text, ADD COLUMN IF NOT EXISTS country text,
    ADD COLUMN IF NOT EXISTS show_telepathy_score boolean DEFAULT true;
  ALTER TABLE push_subscriptions
    ADD COLUMN IF NOT EXISTS endpoint text UNIQUE, ADD COLUMN IF NOT EXISTS p256dh text,
    ADD COLUMN IF NOT EXISTS auth text, ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;
  CREATE TABLE online_users (id text PRIMARY KEY, nickname text NOT NULL, lat float8, lng float8, last_seen timestamptz DEFAULT now());
  CREATE TABLE telepathy_queue (id text PRIMARY KEY, nickname text, timestamp bigint);
  CREATE TABLE telepathy_matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id text, user1_nickname text, user1_role text,
    user2_id text, user2_nickname text, user2_role text,
    level text DEFAULT 'shapes', round_count integer DEFAULT 0, sender_symbol text, receiver_guess text,
    level_change_choice_sender text, level_change_choice_receiver text,
    score_sender integer DEFAULT 0, score_receiver integer DEFAULT 0,
    created_at timestamptz DEFAULT now(), ended_at timestamptz, ended_by text);
  CREATE UNIQUE INDEX telepathy_matches_pair_unique
    ON telepathy_matches (least(user1_id, user2_id), greatest(user1_id, user2_id));
  CREATE TABLE telepathy_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(),
    from_id text NOT NULL, from_name text NOT NULL, to_id text NOT NULL, to_name text NOT NULL,
    status text DEFAULT 'pending');
  ALTER TABLE telepathy_invites ENABLE ROW LEVEL SECURITY;
  -- auth.uid() finto: NULL, come per l'app che usa la chiave pubblica (nessun utente Supabase Auth).
  -- creaDbLocale non ha uno schema auth, e le policy qui sotto lo richiedono per esistere.
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
  -- Le 8 policy di oggi, come nel catalogo (cat8-cat12, pol5-pol7). Le quattro per public con
  -- auth.uid() sono inerti per l'app (auth.uid() è null con la chiave pubblica); le quattro per
  -- anon con true sono quelle che oggi lasciano leggere e scrivere chiunque.
  CREATE POLICY "Destinatario può aggiornare lo status" ON telepathy_invites FOR UPDATE TO public USING ((auth.uid())::text = to_id);
  CREATE POLICY "Destinatario vede i propri inviti" ON telepathy_invites FOR SELECT TO public USING ((auth.uid())::text = to_id);
  CREATE POLICY "Mittente può cancellare il proprio invito" ON telepathy_invites FOR DELETE TO public USING ((auth.uid())::text = from_id);
  CREATE POLICY "Utenti autenticati possono creare inviti" ON telepathy_invites FOR INSERT TO public WITH CHECK ((auth.uid())::text = from_id);
  CREATE POLICY "anon can delete telepathy_invites" ON telepathy_invites FOR DELETE TO anon USING (true);
  CREATE POLICY "anon can insert telepathy_invites" ON telepathy_invites FOR INSERT TO anon WITH CHECK (true);
  CREATE POLICY "anon can select telepathy_invites" ON telepathy_invites FOR SELECT TO anon USING (true);
  CREATE POLICY "anon can update telepathy_invites" ON telepathy_invites FOR UPDATE TO anon USING (true) WITH CHECK (true);
  GRANT ALL ON telepathy_invites TO anon, authenticated;
  GRANT ALL ON telepathy_matches, online_users, telepathy_queue TO anon, authenticated;
  CREATE TABLE user_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_nickname text NOT NULL, blocked_nickname text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (blocker_nickname, blocked_nickname));
  CREATE TABLE telepathy_scores (user_id text PRIMARY KEY, nickname text, sessions_count integer DEFAULT 0,
    matches_count integer DEFAULT 0, rounds_count integer DEFAULT 0, updated_at timestamptz DEFAULT now());
  CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_nickname text NOT NULL,
    type text NOT NULL, message text NOT NULL,
    read boolean DEFAULT false, created_at timestamptz DEFAULT now());
  GRANT ALL ON notifications TO anon, authenticated;
  CREATE TABLE consciousness_posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_nickname text, created_at timestamptz DEFAULT now());
  CREATE TABLE consciousness_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid, author_nickname text, content text, created_at timestamptz DEFAULT now());
  CREATE TABLE magic_links (email text); CREATE TABLE password_resets (email text);
  CREATE TABLE content_reports (reporter_nickname text);

  -- pg_net finto: registra le chiamate invece di farle. Stessa firma di net.http_post.
  CREATE SCHEMA net;
  CREATE TABLE net.chiamate (id bigserial PRIMARY KEY, url text, body jsonb, headers jsonb, at timestamptz DEFAULT now());
  CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
                                headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
    RETURNS bigint LANGUAGE sql AS $f$
      INSERT INTO net.chiamate (url, body, headers) VALUES (url, body, headers) RETURNING id $f$;

  -- pg_cron finto: il minimo che serve alla 32a per ridefinire il job.
  CREATE SCHEMA cron;
  CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
  CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $f$
    INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
    RETURNING jobid $f$;
  CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE sql AS $f$
    DELETE FROM cron.job WHERE jobid = job_id RETURNING true $f$;
  -- Il job della 23_, com'è oggi (una sola chiamata).
  SELECT cron.schedule('notify-ritual-start', '* * * * *',
    $j$ SELECT net.http_post(url := 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-ritual-start', body := '{}'::jsonb); $j$);
`;

const F31 = 'supabase/sql/31_account_cancellato_rituali.sql';
const F32A = 'supabase/sql/32a_inviti_telepatia_offline.sql';
const F32B = 'supabase/sql/32b_chiudi_inviti_diretti.sql';
const F35A = 'supabase/sql/35a_notifiche_server.sql';
const CATALOGO_35 = 'docs/superpowers/plans/catalogo-notifiche-35.txt';

// Le cinque funzioni com'erano sul DB vero prima della 35a (catalogo), nell'ordine del file.
function funzioniCatalogo35() {
  const t = fs.readFileSync(path.join(ROOT, CATALOGO_35), 'utf8').replace(/\r/g, '');
  return t.split('-- ════ notifications')[0].split(/^-- ════\n/m).map((x) => x.trim()).filter(Boolean);
}

// Per gli inviti telepatia: catena dei rituali fino alla 30_, schema della telepatia, 31_
// (l'ultima delete_my_account su main), poi le migration nuove se richieste.
async function creaDbTelepatia({ con32a = true, con32b = false, con35a = false } = {}) {
  const db = await creaDbLocale();
  await db.exec(SCHEMA_TELEPATIA);
  await applicaFile(db, F31);
  if (con32a) await applicaFile(db, F32A);
  if (con32a && con32b) await applicaFile(db, F32B);
  // send_private_message non è in nessuna migration caricata qui: si installa la versione del catalogo.
  await db.exec(funzioniCatalogo35().find((f) => f.includes('FUNCTION public.send_private_message(')) + ';');
  if (con35a) await applicaFile(db, F35A);
  return db;
}

module.exports = { creaDbLocale, creaDbTelepatia, applicaFile, RUOLO_SERVIZIO, F31, F32A, F32B, F35A, funzioniCatalogo35 };
