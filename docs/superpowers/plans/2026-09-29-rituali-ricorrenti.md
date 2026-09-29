# Rituali che si ripetono — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un rituale può ripetersi ogni giorno o in giorni scelti fino a una data, con notifiche, candele e presenze per appuntamento e una «stanza del rituale» che mostra la preghiera e quante persone sono lì adesso.

**Architecture:** una sola riga in `rituals` con la regola di ripetizione; gli appuntamenti li calcola Postgres (`rituale_occorrenze`), e la vista `rituali_correnti` riscrive `date`/`time` con l'appuntamento corrente così che app, notifiche e pulizia continuano a ragionare su «un istante». Il SQL si sviluppa e si prova su un Postgres locale in Node (PGlite); il database vero riceve la migration una volta sola, lanciata da Irene.

**Tech Stack:** Postgres/Supabase (plpgsql, PostgREST), Deno Edge Function, React in un solo file `src/app.jsx` compilato con `node build.js` in `app.js`, test in Node + Playwright, PGlite (`@electric-sql/pglite`) per il SQL locale.

**Spec:** `docs/superpowers/specs/2026-09-29-rituali-ricorrenti-design.md` (leggerla PRIMA di ogni task: è la fonte, il piano la traduce).

## Global Constraints

- Tutti i test si lanciano muti: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node <test>.js`.
- **Nessun agente applica SQL al database vero** (`scripts/apply-sql.js` su un file che modifica è bloccato e va lasciato a Irene). Il SQL nuovo si prova solo su PGlite finché Irene non ha applicato la 28_ (checkpoint dopo il Task 3).
- L'hook pre-commit rifiuta la parola del ruolo di servizio di Supabase (`service` + `_role`) in qualunque file tranne le righe GRANT/REVOKE dei `.sql`. Nei `.js` costruirla a pezzi (`'service' + '_role'`); nei testi scrivere «ruolo di servizio».
- Commenti in italiano, stile del file che si tocca (spiegano il *perché*). Niente refactor fuori dal necessario.
- `app.js` è generato: dopo ogni modifica a `src/app.jsx` si lancia `node build.js` e si committano entrambi.
- Server locale per i test UI: `npx serve -l 4321 .` e **verificare** che stampi `Accepting connections at http://localhost:4321` (su Windows un `serve` rimasto acceso fa aprire in silenzio un'altra porta).
- Mai `git push`, mai merge: li fa il controller con Irene.
- Formati: `rituals.date` testo `YYYY-MM-DD`, `rituals.time` testo `HH:MM:SS` (UTC). Giorni ISO 1=lun…7=dom. Durata massima dei ricorrenti 720 minuti; «Fino al» al massimo 366 giorni dopo il primo giorno; al massimo 10 cicli attivi per creatore.
- La migration è `supabase/sql/28_rituali_ricorrenti.sql`, in un'unica transazione, idempotente, chiusa da `NOTIFY pgrst, 'reload schema';`.

## Review Focus

1. **Giorno 2 di un ciclo dopo una RPC che restituisce la riga** (candela, creazione): la scheda deve restare sul giorno 2 e la stanza aperta → test UI nel Task 8.
2. **Ora legale e fusi**: 07:00 `Europe/Rome` = 05:00Z il 24/10/2026 e 06:00Z il 26/10/2026; `America/New_York` segue il suo calendario → test SQL nel Task 2.
3. **Rituali singoli già esistenti**: vista identica alla tabella, candele non azzerate, pulizia identica → test SQL nel Task 2 e Task 3.
4. **Data del modulo che non è un giorno scelto** (lunedì con «Mer, Ven»): il primo appuntamento è mercoledì, `date`/`time` riscritti → test SQL nel Task 2.
5. **Notifiche fra migration e ripubblicazione della funzione** (righe `'epoch'`): nessun doppione → test SQL nel Task 3.

---

### Task 1: Postgres locale per i test SQL

**Files:**
- Modify: `package.json` (devDependency `@electric-sql/pglite` `^0.2`)
- Create: `scripts/pg-locale.js`
- Create: `test-pg-locale.js`

**Interfaces:**
- Produces: `async function creaDbLocale({ con28 = true } = {}) → PGlite` in `scripts/pg-locale.js`: un database in memoria con lo schema minimo di oggi (tabelle stub + funzioni vere dai file del repo) e, se `con28`, la migration 28_ applicata. Esporta anche `applicaFile(db, percorso)` e `RUOLO_SERVIZIO` (la stringa costruita a pezzi).

- [ ] **Step 1: installare**

Run: `npm install --save-dev @electric-sql/pglite@^0.2`

- [ ] **Step 2: scrivere `scripts/pg-locale.js`**

Schema stub (dal catalogo del database vero al 29/09/2026, vedi spec §0.1 e §2):

```js
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

async function creaDbLocale({ con28 = true } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`SET TIME ZONE 'UTC';`);
  await db.exec(SCHEMA);
  // Le funzioni di oggi, dai file veri, nell'ordine in cui sono state applicate.
  await applicaFile(db, 'supabase/sql/13_rate_limit.sql');            // create_ritual (10 parametri)
  await applicaFile(db, 'supabase/sql/11_rpc_validation_hardening.sql'); // join, energia, candela
  await applicaFile(db, 'supabase/sql/25_cancella_rituale.sql');      // delete_ritual
  if (con28) await applicaFile(db, 'supabase/sql/28_rituali_ricorrenti.sql');
  return db;
}

module.exports = { creaDbLocale, applicaFile, RUOLO_SERVIZIO };
```

Se un file del repo non si applica sullo stub (colonna mancante, indice su tabella stub), **aggiungere allo stub** la colonna o la tabella che manca, non modificare il file del repo. Il `GRANT ... TO anon` finale dei file va a buon fine perché i ruoli esistono.

- [ ] **Step 3: scrivere `test-pg-locale.js`** (fumo: lo schema di oggi si carica e funziona)

```js
/**
 * Il Postgres locale regge le funzioni di oggi — Global Awakening
 * node test-pg-locale.js
 */
const { creaDbLocale } = require('./scripts/pg-locale');
let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };

(async () => {
  const db = await creaDbLocale({ con28: false });
  const r = await db.query(`SELECT id, date, time FROM create_ritual('Ospite','s1','Prova','','consciousness',11,'2026-10-24','05:00',3,NULL)`);
  check(r.rows.length === 1 && r.rows[0].date === '2026-10-24' && r.rows[0].time === '05:00:00',
    'create_ritual di oggi scrive date/time come testo YYYY-MM-DD / HH:MM:SS', r.rows);
  const tz = await db.query(`SELECT ('2026-10-26 07:00'::timestamp AT TIME ZONE 'Europe/Rome') AS t`);
  check(new Date(tz.rows[0].t).toISOString() === '2026-10-26T06:00:00.000Z', 'ora legale: il 26/10 le 07 di Roma sono le 06Z', tz.rows);
  console.log(`\n${passed} passati, ${failed} falliti`);
})().catch(e => { console.log('  ❌ eccezione: ' + e.message); process.exitCode = 1; });
```

- [ ] **Step 4: eseguire** — Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-pg-locale.js` — Expected: `2 passati, 0 falliti`.

- [ ] **Step 5: commit** — `git add package.json package-lock.json scripts/pg-locale.js test-pg-locale.js && git commit -m "test: Postgres locale (PGlite) per provare le migration dei rituali"` (+ riga Co-Authored-By del progetto).

---

### Task 2: migration 28_, parte A — regola, appuntamenti, vista, `create_ritual`

**Files:**
- Create: `supabase/sql/28_rituali_ricorrenti.sql`
- Create: `test-rituali-ricorrenti-sql.js`

**Interfaces:**
- Consumes: `creaDbLocale` (Task 1).
- Produces (SQL): colonne `ripeti_giorni smallint[]`, `ripeti_fino date`, `fuso text`, `ora_locale time`, `data_inizio_locale date`, `fermato_il timestamptz`, `candles_occorrenza timestamptz`; tabella `ritual_presence`; `rituale_occorrenze(rituals) SETOF timestamptz`; `rituale_occorrenza_corrente(rituals) timestamptz`; `rituale_presenti_ora(bigint, timestamptz) int`; vista `rituali_correnti` (colonne di `rituals` + `prima_date`, `prima_time`, `occorrenza_numero int`, `occorrenze_totali int`, `presenti_ora int`); `get_ritual_occurrences(bigint) SETOF timestamptz`; `create_ritual(p_creator text, p_creator_id text, p_name text, p_description text, p_type text, p_sacred_number int, p_date date, p_time time, p_duration int, p_password_hash text, p_ripeti_giorni smallint[] DEFAULT NULL, p_ripeti_fino date DEFAULT NULL, p_fuso text DEFAULT NULL) SETOF rituals`.

- [ ] **Step 1: test che falliscono** — `test-rituali-ricorrenti-sql.js`, stessa intestazione/`check` del Task 1, poi:

```js
const { creaDbLocale, RUOLO_SERVIZIO } = require('./scripts/pg-locale');
const iso = (t) => new Date(t).toISOString();
const crea = (db, { giorni = null, fino = null, fuso = null, data, ora, durata = 30, creatore = 's1' }) =>
  db.query(`SELECT * FROM create_ritual('Ospite',$1,'Preghiera','riga uno\nriga due','consciousness',11,$2,$3,$4,NULL,$5,$6,$7)`,
    [creatore, data, ora, durata, giorni, fino, fuso]);
const occorrenze = async (db, id) => (await db.query(`SELECT o FROM get_ritual_occurrences($1) o`, [id])).rows.map(r => iso(r.o));
const errore = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

async function parteA(db) {
  console.log('\n— regola, appuntamenti, vista, create_ritual —');
  // Ora legale: ogni giorno alle 07:00 di Roma dal 23 al 27/10/2026. Il modulo manda l'istante UTC
  // del primo giorno (05:00Z = 07:00 CEST).
  const dst = (await crea(db, { giorni: [1,2,3,4,5,6,7], fino: '2026-10-27', fuso: 'Europe/Rome', data: '2026-10-23', ora: '05:00' })).rows[0];
  check((await occorrenze(db, dst.id)).join() === ['2026-10-23T05:00:00.000Z','2026-10-24T05:00:00.000Z','2026-10-25T06:00:00.000Z','2026-10-26T06:00:00.000Z','2026-10-27T06:00:00.000Z'].join(),
    'Europe/Rome: le 07:00 restano le 07:00 dopo il 25/10 (05Z → 06Z)', await occorrenze(db, dst.id));
  check(dst.ora_locale === '07:00:00' && dst.data_inizio_locale === '2026-10-23', 'ora e giorno locali calcolati dal server', dst);

  // America/New_York: domeniche alle 07:00 dal 25/10 all'8/11/2026. Lì l'ora solare torna il 1/11,
  // una settimana dopo l'Europa: 07:00 EDT = 11:00Z, 07:00 EST = 12:00Z.
  const ny = (await crea(db, { giorni: [7], fino: '2026-11-08', fuso: 'America/New_York', data: '2026-10-25', ora: '11:00' })).rows[0];
  check((await occorrenze(db, ny.id)).join() === ['2026-10-25T11:00:00.000Z','2026-11-01T12:00:00.000Z','2026-11-08T12:00:00.000Z'].join(),
    'America/New_York: 07:00 locali ogni domenica, anche dopo il suo cambio d'ora del 1/11', await occorrenze(db, ny.id));
```

Proseguire nella stessa funzione:

```js
  // Giorni scelti e data del modulo che non è un giorno scelto: lunedì 5/10/2026 con Mer+Ven.
  const mv = (await crea(db, { giorni: [3,5], fino: '2026-10-16', fuso: 'Europe/Rome', data: '2026-10-05', ora: '05:00' })).rows[0];
  check(mv.date === '2026-10-07' && mv.time === '05:00:00', 'date/time riscritti sul primo giorno scelto (mer 7/10)', mv);
  check((await occorrenze(db, mv.id)).length === 4, 'mer/ven dal 5 al 16/10 inclusi = 4 appuntamenti');

  // Errori.
  const base = { fuso: 'Europe/Rome', data: '2026-10-05', ora: '05:00' };
  const casi = [
    [{ ...base, giorni: [1], fino: null }, 'recurrence_incomplete'],
    [{ ...base, giorni: [], fino: '2026-10-10' }, 'recurrence_days_invalid'],
    [{ ...base, giorni: [8], fino: '2026-10-10' }, 'recurrence_days_invalid'],
    [{ ...base, giorni: [1,1], fino: '2026-10-10' }, 'recurrence_days_invalid'],
    [{ ...base, giorni: [1], fino: '2026-10-10', fuso: 'Marte/Olympus' }, 'timezone_invalid'],
    [{ ...base, giorni: [1], fino: '2026-10-04' }, 'recurrence_end_invalid'],
    [{ ...base, giorni: [1], fino: '2027-10-07' }, 'recurrence_end_invalid'],
    [{ ...base, giorni: [1], fino: '2026-10-10', durata: 721 }, 'recurrence_duration_too_long'],
    [{ ...base, giorni: [7], fino: '2026-10-10' }, 'recurrence_empty'],
  ];
  for (const [arg, atteso] of casi) {
    const m = await errore(crea(db, { ...arg, creatore: 'err' + atteso }));
    check(m && m.includes(atteso), `rifiuto ${atteso}`, m);
  }
  // Tetto: 10 cicli attivi per creatore (il rate-limit di 5/10 min si aggira con created_at indietro).
  for (let i = 0; i < 10; i++) {
    await crea(db, { giorni: [1], fino: '2026-12-31', fuso: 'UTC', data: '2026-10-05', ora: '07:00', creatore: 'tetto' });
    await db.query(`UPDATE rituals SET created_at = now() - interval '1 hour' WHERE creator_id = 'tetto'`);
  }
  const m11 = await errore(crea(db, { giorni: [1], fino: '2026-12-31', fuso: 'UTC', data: '2026-10-05', ora: '07:00', creatore: 'tetto' }));
  check(m11 && m11.includes('recurrence_limit'), 'l\'11° ciclo attivo dello stesso creatore è rifiutato', m11);

  // Rituale singolo: la chiamata di oggi (10 parametri per nome) funziona ancora e la vista è identica.
  const s = (await db.query(`SELECT * FROM create_ritual(p_creator=>'Ospite',p_creator_id=>'sing',p_name=>'Singolo',p_description=>'',p_type=>'consciousness',p_sacred_number=>11,p_date=>'2026-10-05',p_time=>'05:00',p_duration=>3,p_password_hash=>NULL)`)).rows[0];
  const vs = (await db.query(`SELECT * FROM rituali_correnti WHERE id = $1`, [s.id])).rows[0];
  check(vs.date === s.date && vs.time === s.time && vs.occorrenza_numero === 1 && vs.occorrenze_totali === 1,
    'rituale singolo: vista uguale alla tabella, giorno 1 di 1', vs);
  // Riga malformata (può esistere da vecchie scritture dirette): la vista non deve esplodere.
  await db.query(`INSERT INTO rituals (creator, creator_id, name, type, sacred_number, date, time, duration) VALUES ('x','x','rotto','consciousness',11,'non-una-data','boh',3)`);
  check(!(await errore(db.query(`SELECT count(*) FROM rituali_correnti`))), 'una riga malformata non spegne la vista');
  // Via subito: la pulizia di oggi (e quella nuova, per i singoli) fa date::date e su questa esploderebbe.
  await db.query(`DELETE FROM rituals WHERE name = 'rotto'`);

  // Vista su un ciclo in corso: ogni giorno in UTC, partito 2 giorni fa, alle (adesso - 1 minuto).
  const t0 = new Date(Date.now() - 60000);
  const dueGiorniFa = new Date(t0.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const fino = new Date(t0.getTime() + 5 * 86400000).toISOString().slice(0, 10);
  const oraT0 = t0.toISOString().slice(11, 16);
  const c = (await crea(db, { giorni: [1,2,3,4,5,6,7], fino, fuso: 'UTC', data: dueGiorniFa, ora: oraT0, creatore: 'ciclo' })).rows[0];
  const vc = (await db.query(`SELECT * FROM rituali_correnti WHERE id = $1`, [c.id])).rows[0];
  check(vc.date === t0.toISOString().slice(0, 10) && vc.time === oraT0 + ':00', 'vista: date/time = appuntamento di oggi, formati di sempre', vc);
  check(vc.prima_date === dueGiorniFa && vc.occorrenza_numero === 3 && vc.occorrenze_totali === 8, 'vista: prima data originale, giorno 3 di 8', vc);

  // Permessi: anon legge la vista, non la tabella delle presenze.
  await db.query(`SET ROLE anon`);
  const vistaAnon = await errore(db.query(`SELECT id, date, presenti_ora FROM rituali_correnti LIMIT 1`));
  const presAnon = await errore(db.query(`SELECT * FROM ritual_presence LIMIT 1`));
  await db.query(`RESET ROLE`);
  check(!vistaAnon, 'anon legge rituali_correnti', vistaAnon);
  check(presAnon && /permission denied/.test(presAnon), 'anon NON legge ritual_presence', presAnon);
  return { c, s };
}

(async () => {
  const db = await creaDbLocale();
  await parteA(db);
  console.log(`\n${passed} passati, ${failed} falliti`);
})().catch(e => { console.log('  ❌ eccezione: ' + e.message); process.exitCode = 1; });
```

- [ ] **Step 2: eseguire** — Expected: FAIL (il file 28_ non esiste → eccezione in `creaDbLocale`).

- [ ] **Step 3: scrivere `supabase/sql/28_rituali_ricorrenti.sql`, parte A**

```sql
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
            ELSE (SELECT count(*)::int FROM rituale_occorrenze(r) o WHERE o <= c.occ) END AS occorrenza_numero,
       CASE WHEN r.ripeti_giorni IS NULL THEN 1
            ELSE (SELECT count(*)::int FROM rituale_occorrenze(r)) END AS occorrenze_totali,
       CASE WHEN c.occ IS NULL THEN 0 ELSE rituale_presenti_ora(r.id, c.occ) END AS presenti_ora
  FROM rituals r
  CROSS JOIN LATERAL (SELECT rituale_occorrenza_corrente(r) AS occ) c;

GRANT SELECT ON rituali_correnti TO anon, authenticated, RUOLO_DI_SERVIZIO;
GRANT EXECUTE ON FUNCTION rituale_occorrenze(rituals)                   TO anon, authenticated, RUOLO_DI_SERVIZIO;
GRANT EXECUTE ON FUNCTION rituale_occorrenza_corrente(rituals)          TO anon, authenticated, RUOLO_DI_SERVIZIO;
GRANT EXECUTE ON FUNCTION rituale_presenti_ora(bigint, timestamptz)     TO anon, authenticated, RUOLO_DI_SERVIZIO;

CREATE OR REPLACE FUNCTION get_ritual_occurrences(p_ritual_id bigint)
RETURNS SETOF timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT o FROM rituals r, rituale_occorrenze(r) o WHERE r.id = p_ritual_id ORDER BY o
$$;
GRANT EXECUTE ON FUNCTION get_ritual_occurrences(bigint) TO anon, authenticated, RUOLO_DI_SERVIZIO;

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

NOTIFY pgrst, 'reload schema';

COMMIT;
```

**Il nome del ruolo di servizio.** Nel piano è scritto `RUOLO_DI_SERVIZIO` perché l'hook pre-commit rifiuta il nome vero nei `.md`. Nel file `.sql` va scritto il nome vero del ruolo di servizio di Supabase (`service` seguito da `_role`, tutto attaccato): nelle righe GRANT l'hook lo ammette.

Nota per l'implementatore: il rituale singolo passa `date`/`time` come `to_char` dell'istante UTC; prima era `p_date`/`p_time` convertiti a testo dall'INSERT (`'2026-10-24'`, `'05:00:00'`): il risultato deve essere **identico**, il test del Task 1 e quello del singolo lo verificano. Nelle righe GRANT la parola del ruolo di servizio è ammessa dall'hook. I giorni ISO sono `smallint[]`: dal client arrivano come array JSON di numeri; in PGlite il parametro `$5` di `crea()` va passato come array JS (PGlite lo serializza) — se non lo fa, usare `$5::smallint[]` nella query del test.

- [ ] **Step 4: eseguire** fino al verde — Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali-ricorrenti-sql.js` e `node test-pg-locale.js` — Expected: tutti ✅.

- [ ] **Step 5: commit** — `git add supabase/sql/28_rituali_ricorrenti.sql test-rituali-ricorrenti-sql.js && git commit -m "feat(db): rituali che si ripetono, parte A (regola, appuntamenti, vista, create_ritual) — 28_, non applicata"`.

---

### Task 3: migration 28_, parte B — lasciare, fermare, candele, presenze, pulizia, notifiche

**Files:**
- Modify: `supabase/sql/28_rituali_ricorrenti.sql` (aggiungere prima di `NOTIFY`)
- Modify: `test-rituali-ricorrenti-sql.js` (funzione `parteB(db, {c, s})`, chiamata dopo `parteA`, e test di idempotenza)

**Interfaces:**
- Consumes: tutto il Task 2.
- Produces: `leave_ritual(p_ritual_id bigint, p_session_id text, p_password_hash text) RETURNS void`; `ferma_rituale(p_ritual_id bigint, p_session_id text, p_password_hash text) RETURNS bigint`; `segna_presenza_rituale(p_ritual_id bigint, p_session_id text) RETURNS int`; `toggle_ritual_candle(bigint, text) RETURNS SETOF rituals` (firma invariata); `cleanup_expired_rituals() RETURNS integer` (firma invariata); colonna `ritual_notifications_sent.occorrenza timestamptz NOT NULL DEFAULT 'epoch'`, PK `(ritual_id, subscription_id, kind, occorrenza)`, trigger `trg_ritual_notifications_occorrenza`. Codici d'errore: `session_required`, `session_id_too_long`, `ritual_not_found`, `creator_cannot_leave`, `Auth failed`, `not_creator`, `not_recurring`, `already_stopped`, `not_started`, `not_live`.

- [ ] **Step 1: test che falliscono** — in `test-rituali-ricorrenti-sql.js`:

```js
async function parteB(db, { c, s }) {
  console.log('\n— lasciare, fermare, candele, presenze, pulizia, notifiche —');
  const vista = async (id) => (await db.query(`SELECT * FROM rituali_correnti WHERE id = $1`, [id])).rows[0];

  // leave_ritual.
  await db.query(`SELECT join_ritual($1, 'ospite2')`, [c.id]);
  await db.query(`SELECT leave_ritual($1, 'ospite2', NULL)`, [c.id]);
  check(!(await vista(c.id)).participants.includes('ospite2'), 'un ospite lascia il ciclo');
  check((await errore(db.query(`SELECT leave_ritual($1, 'ciclo', NULL)`, [c.id]))).includes('creator_cannot_leave'), 'il creatore non può lasciare');
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('reg1','Reg1','r@test.com','pbkdf2$1$a$b')`);
  await db.query(`SELECT join_ritual($1, 'reg1')`, [c.id]);
  check((await errore(db.query(`SELECT leave_ritual($1, 'reg1', 'sbagliato')`, [c.id]))).includes('Auth failed'), 'registrato: serve la credenziale per lasciare');
  await db.query(`SELECT leave_ritual($1, 'reg1', 'pbkdf2$1$a$b')`, [c.id]);
  check(!(await vista(c.id)).participants.includes('reg1'), 'registrato con credenziale: lascia');

  // Candele per appuntamento: una candela di ieri non vale oggi.
  const ieri = new Date(Date.now() - 86400000 - 60000).toISOString();
  await db.query(`UPDATE rituals SET candles = '["vecchia"]', candles_occorrenza = $2 WHERE id = $1`, [c.id, ieri]);
  check((await vista(c.id)).candles.length === 0, 'vista: la candela di ieri non si vede oggi');
  await db.query(`SELECT * FROM toggle_ritual_candle($1, 'nuova')`, [c.id]);
  check(JSON.stringify((await vista(c.id)).candles) === '["nuova"]', 'toggle: azzera ieri e accende oggi');
  // Rituale singolo esistente (candles_occorrenza NULL): le candele degli altri restano.
  await db.query(`UPDATE rituals SET candles = '["a"]', candles_occorrenza = NULL WHERE id = $1`, [s.id]);
  await db.query(`SELECT * FROM toggle_ritual_candle($1, 'b')`, [s.id]);
  check(JSON.stringify((await vista(s.id)).candles) === '["a","b"]', 'singolo: la candela di un altro non si spegne');

  // Presenze.
  check((await db.query(`SELECT segna_presenza_rituale($1, 'p1') AS n`, [c.id])).rows[0].n === 1, 'presenza: 1 persona qui adesso');
  check((await db.query(`SELECT segna_presenza_rituale($1, 'p1') AS n`, [c.id])).rows[0].n === 1, 'presenza: idempotente');
  await db.query(`UPDATE ritual_presence SET visto_il = now() - interval '2 minutes' WHERE session_id = 'p1'`);
  check((await vista(c.id)).presenti_ora === 0, 'presenza: dopo 60 s senza segni non conta più');
  check((await errore(db.query(`SELECT segna_presenza_rituale($1, 'p1')`, [s.id]))).includes('not_live'), 'presenza: rifiutata se l\'appuntamento non è in corso');

  // ferma_rituale.
  const futuro = (await crea(db, { giorni: [1,2,3,4,5,6,7], fino: '2026-12-31', fuso: 'UTC', data: '2026-12-01', ora: '07:00', creatore: 'fermo' })).rows[0];
  check((await errore(db.query(`SELECT ferma_rituale($1, 'fermo', NULL)`, [futuro.id]))).includes('not_started'), 'fermare prima dell\'inizio: si usa Cancella');
  check((await errore(db.query(`SELECT ferma_rituale($1, 'altro', NULL)`, [c.id]))).includes('not_creator'), 'solo il creatore ferma');
  check((await errore(db.query(`SELECT ferma_rituale($1, 'sing', NULL)`, [s.id]))).includes('not_recurring'), 'un rituale singolo non si ferma');
  const primaDi = (await db.query(`SELECT count(*)::int n FROM get_ritual_occurrences($1)`, [c.id])).rows[0].n;
  await db.query(`SELECT ferma_rituale($1, 'ciclo', NULL)`, [c.id]);
  const dopo = (await db.query(`SELECT count(*)::int n FROM get_ritual_occurrences($1)`, [c.id])).rows[0].n;
  check(primaDi === 8 && dopo === 3, 'fermato: restano solo gli appuntamenti già iniziati (quello in corso finisce)', { primaDi, dopo });
  check((await errore(db.query(`SELECT ferma_rituale($1, 'ciclo', NULL)`, [c.id]))).includes('already_stopped'), 'non si ferma due volte');

  // Pulizia: non tocca un ciclo con appuntamenti futuri; cancella uno finito.
  const finito = (await crea(db, { giorni: [1,2,3,4,5,6,7], fino: '2026-09-02', fuso: 'UTC', data: '2026-09-01', ora: '07:00', creatore: 'finito' })).rows[0];
  await db.query(`SELECT cleanup_expired_rituals()`);
  const ids = (await db.query(`SELECT id FROM rituals`)).rows.map(r => Number(r.id));
  check(!ids.includes(Number(finito.id)) && ids.includes(Number(futuro.id)), 'pulizia: via il ciclo finito, resta quello futuro');

  // Notifiche: dedup per appuntamento, e la riga «epoch» della funzione vecchia diventa l'appuntamento corrente.
  const sub = (await db.query(`INSERT INTO push_subscriptions (session_id) VALUES ('x') RETURNING id`)).rows[0].id;
  await db.query(`INSERT INTO ritual_notifications_sent (ritual_id, subscription_id, kind) VALUES ($1, $2, 'start')`, [futuro.id, sub]);
  const occ = (await db.query(`SELECT occorrenza FROM ritual_notifications_sent WHERE ritual_id = $1`, [futuro.id])).rows[0].occorrenza;
  check(iso(occ) === '2026-12-01T07:00:00.000Z', 'riga senza occorrenza: il trigger mette l\'appuntamento corrente', iso(occ));
  check(!!(await errore(db.query(`INSERT INTO ritual_notifications_sent (ritual_id, subscription_id, kind, occorrenza) VALUES ($1, $2, 'start', '2026-12-01T07:00:00Z')`, [futuro.id, sub]))), 'stesso appuntamento: conflitto (niente doppione)');
  check(!(await errore(db.query(`INSERT INTO ritual_notifications_sent (ritual_id, subscription_id, kind, occorrenza) VALUES ($1, $2, 'start', '2026-12-02T07:00:00Z')`, [futuro.id, sub]))), 'appuntamento dopo: la notifica riparte');
}
```

E in fondo al main, dopo `parteB`: idempotenza.

```js
  const { applicaFile } = require('./scripts/pg-locale');
  check(!(await errore(applicaFile(db, 'supabase/sql/28_rituali_ricorrenti.sql'))), '28_ si rilancia senza errori (idempotente)');
```

- [ ] **Step 2: eseguire** — Expected: FAIL (`leave_ritual` non esiste).

- [ ] **Step 3: aggiungere alla 28_, prima di `NOTIFY`:**

```sql
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
 WHERE r.id = s.ritual_id AND s.occorrenza = 'epoch' AND rituale_occorrenza_corrente(r) IS NOT NULL;
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
```

- [ ] **Step 4: eseguire** fino al verde — `test-rituali-ricorrenti-sql.js` e `test-pg-locale.js` tutti ✅.

- [ ] **Step 5: commit** — `git commit -am "feat(db): rituali che si ripetono, parte B (lasciare, fermare, candele, presenze, pulizia, notifiche) — 28_, non applicata"`.

---

### CHECKPOINT (controller, non un agente): Irene applica la 28_

Il controller chiede a Irene: `! node scripts/apply-sql.js supabase/sql/28_rituali_ricorrenti.sql`, poi verifica dal catalogo (lettura) che esistano la vista e la firma a 13 parametri, e che l'app online funzioni ancora (`test-rituali.js`, `test-rituali-candele.js`, `test-rituali-cancellazione.js` verdi contro il database vero).

---

### Task 4: prova sul database vero

**Files:**
- Create: `test-rituali-ricorrenti.js`

**Interfaces:**
- Consumes: la 28_ applicata; `serviceFetch`, `requireServiceKey`, `createTestAccount`, `deleteTestAccount`, `SUPABASE_URL` da `test-helpers.js`; la chiave pubblica `ANON` come in `test-account-rpc.js:16`.

- [ ] **Step 1: scrivere il test**, sulla falsariga di `test-rituali-cancellazione.js` (leggerlo prima): chiamate PostgREST con la chiave pubblica (`/rest/v1/rpc/...`, `/rest/v1/rituali_correnti?id=eq.X`), preparazione e pulizia con la chiave di servizio, `try/finally` che cancella ogni rituale creato (per `creator_id` con prefisso `rric-<TS>`) anche se il test si interrompe. Casi:
  1. `create_ritual` con `p_ripeti_giorni: [1,2,3,4,5,6,7]`, `p_ripeti_fino: '2026-10-27'`, `p_fuso: 'Europe/Rome'`, `p_date: '2026-10-23'`, `p_time: '05:00'` → `get_ritual_occurrences` = le 5 attese del Task 2 (ora legale sul server vero).
  2. La vista via anon restituisce `date`, `time`, `occorrenza_numero`, `occorrenze_totali`, `presenti_ora`; la tabella `ritual_presence` via anon → 401/403/42501.
  3. La chiamata a 10 parametri per nome (quella dell'app online) crea ancora un rituale singolo.
  4. Un ciclo in corso (come nel Task 2: UTC, partito 2 giorni fa, alle adesso − 1 min) → `segna_presenza_rituale` = 1; `leave_ritual` di un ospite; `ferma_rituale` del creatore.
  5. Dedup: con la chiave di servizio, insert in `ritual_notifications_sent` senza `occorrenza` per un abbonamento finto (creato e cancellato nel test) → il valore è l'appuntamento corrente; secondo insert uguale → 409.
- [ ] **Step 2: eseguire** — Expected: tutti ✅. Poi rilanciare `test-rituali.js`, `test-rituali-candele.js`, `test-rituali-cancellazione.js`, `test-rituali-validazione.js`, `test-rituali-impersonation.js` → verdi come prima.
- [ ] **Step 3: commit** — `git add test-rituali-ricorrenti.js && git commit -m "test: rituali ricorrenti sul database vero"`.

---

### Task 5: Edge Function per appuntamento

**Files:**
- Modify: `supabase/functions/notify-ritual-start/index.ts`

**Interfaces:**
- Consumes: vista `rituali_correnti` (colonne `id, name, date, time, duration, participants`), colonna `ritual_notifications_sent.occorrenza`.

- [ ] **Step 1: modificare** — tre punti:
  - `.from('rituals')` → `.from('rituali_correnti')`, con un commento: per i ricorrenti `date`/`time` sono l'appuntamento corrente (28_), quindi il filtro ±1 giorno e `istanteInizio` restano giusti.
  - nella prenotazione: `.insert({ ritual_id: rituale.id, subscription_id: ab.id, kind: tipo, occorrenza: new Date(inizio).toISOString() })`, con un commento: la chiave include l'appuntamento, sennò la notifica di domani troverebbe «già presa» quella di oggi.
  - nel rilascio (`case 'rilascia'`): aggiungere `.eq('occorrenza', new Date(inizio).toISOString())`.
- [ ] **Step 2: verificare** — `node -e "require('fs').readFileSync('supabase/functions/notify-ritual-start/index.ts','utf8')"` non basta: rilanciare `test-push-finestre.js`, `test-push-esito.js`, `test-push-cron.js` (se richiede la funzione pubblicata, annotarlo) e controllare a mano che nessun altro punto del file usi `rituals`.
- [ ] **Step 3: commit** — `git commit -am "feat(push): notifiche per appuntamento — la funzione legge rituali_correnti"`. La pubblicazione (`node scripts/deploy-push.js`) la fa il controller o Irene.

---

### Task 6: app — dati dalla vista, creazione ricorrente, lasciare, fermare

**Files:**
- Modify: `src/app.jsx` (`loadData` ~r.1448, `createRitual` ~r.2947-3019, `toggleCandle` ~r.3223, dopo `doDeleteRitual` ~r.3250; traduzioni `rituals` IT ~r.593 e EN ~r.245)
- Modify: `test-partecipa-subito.js` (pattern `**/rest/v1/rituals?*` → `**/rest/v1/rituali_correnti?*`, righe ~73 e ~88)
- Modify: `app.js` (build)

**Interfaces:**
- Produces (nel componente): `rileggiRituale(id) → Promise<void>` (legge `rituali_correnti` per id e sostituisce la riga in `rituals`, o la toglie se non c'è più); `leaveRitual(ritualId)`; `doFermaRituale(ritualId)`; stato `ritualToStop` + `setRitualToStop`; campi nuovi di `newRitual`: `ripeti: 'mai'|'ogni'|'giorni'`, `giorni: number[]` (ISO), `fino: 'YYYY-MM-DD'`. Traduzioni nuove in `t.rituals`: `repeat`, `repeatNever`, `repeatDaily`, `repeatDays`, `until`, `weekdaysShort` (array di 7, lun→dom), `everyDay`, `atTime`, `dayOf` (funzione `(n, m) => string`), `leave`, `stop`, `stopTitle`, `stopBody`, `stopYes`, `stopNo`, `stopFailed`, `leaveFailed`, `room`, `peopleHere` (funzione `n => string`), `closeRoom`, `descCounter` (funzione `n => string`), `recurrenceErrors` (oggetto codice → frase).

- [ ] **Step 1: test che fallisce** — nel test UI del Task 8 i casi «Lascia» e «giorno 1 di N» coprono questo task; qui aggiornare `test-partecipa-subito.js` e verificare che **ora fallisce** con l'app di prima (il pattern nuovo non intercetta niente finché `loadData` legge `rituals`) — se non fallisce, annotarlo nel report.

- [ ] **Step 2: implementare**

`loadData`: `supabase.from('rituali_correnti').select('*')...` al posto di `from('rituals')`; il resto invariato (il filtro `expired` lavora su `date`/`time`, che per i ricorrenti sono l'appuntamento corrente). Il canale realtime resta su `table: 'rituals'` con un commento (le viste non emettono eventi; ogni modifica alla tabella fa comunque ricaricare dalla vista).

Helper, vicino a `joinRitual`:

```jsx
          // Le RPC che restituiscono una riga (create_ritual, toggle_ritual_candle) la danno dalla
          // TABELLA: per un rituale che si ripete lì date/time sono il primo appuntamento, non quello
          // di oggi. Sostituirla a quella della vista riporterebbe il rituale al giorno 1 (stanza
          // chiusa, musica spenta). Si rilegge dalla vista, che è l'unica fonte per l'app.
          const rileggiRituale = async (id) => {
            const { data } = await supabase.from('rituali_correnti').select('*').eq('id', id);
            setRituals(prev => {
              const riga = Array.isArray(data) && data[0];
              if (!riga) return prev.filter(r => r.id !== id);
              return prev.some(r => r.id === id) ? prev.map(r => r.id === id ? riga : r) : [riga, ...prev];
            });
          };
```

`toggleCandle`: dopo il controllo d'errore, `await rileggiRituale(ritualId);` al posto di `setRituals(prev => prev.map(... data[0] ...))`. `createRitual`: `if (Array.isArray(data) && data[0]) await rileggiRituale(data[0].id);`. Cercare con grep altri `data[0]` di RPC sui rituali e trattarli allo stesso modo.

`createRitual`: dopo il calcolo di `dataUtc`/`oraUtc`:

```jsx
            // Ripetizione (28_): i giorni ISO 1=lun…7=dom, la fine nel calendario di chi crea, il
            // fuso dal telefono. Ora e giorno locali li ricava il server dall'istante: qui non si
            // mandano, così non possono contraddirlo.
            const ricorre = newRitual.ripeti !== 'mai';
            const giorni = newRitual.ripeti === 'ogni' ? [1, 2, 3, 4, 5, 6, 7] : newRitual.giorni;
            if (ricorre && (!newRitual.fino || giorni.length === 0)) {
              setErrorToast(t.rituals.recurrenceErrors.recurrence_incomplete);
              return;
            }
```

e nella chiamata RPC aggiungere `...(ricorre ? { p_ripeti_giorni: giorni, p_ripeti_fino: newRitual.fino, p_fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } : {})`. Nell'`if (error)` esistente: se `error.message` contiene una chiave di `t.rituals.recurrenceErrors`, `setErrorToast(quella frase)` invece di `showErrorToast()`. Aggiornare lo stato iniziale e il reset di `newRitual` con `ripeti: 'mai', giorni: [], fino: ''`.

`leaveRitual` (accanto a `joinRitual`):

```jsx
          const leaveRitual = async (ritualId) => {
            const { error } = await supabase.rpc('leave_ritual', {
              p_ritual_id: ritualId, p_session_id: sessionId, p_password_hash: passwordHash || ''
            });
            if (error) { setErrorToast(t.rituals.leaveFailed); return; }
            await rileggiRituale(ritualId);
          };
```

`doFermaRituale` + stato `ritualToStop` (accanto a `doDeleteRitual`, stesso stile):

```jsx
          const [ritualToStop, setRitualToStop] = useState(null);
          const doFermaRituale = async (ritualId) => {
            const { error } = await supabase.rpc('ferma_rituale', {
              p_ritual_id: ritualId, p_session_id: sessionId, p_password_hash: passwordHash || ''
            });
            if (error) { setErrorToast(t.rituals.stopFailed); return; }
            await rileggiRituale(ritualId);
          };
```

Traduzioni (IT; EN equivalenti nello stesso ordine nel blocco inglese):

```js
              repeat: "Si ripete", repeatNever: "Una volta sola", repeatDaily: "Ogni giorno", repeatDays: "Giorni scelti",
              until: "Fino al", weekdaysShort: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"],
              everyDay: "Ogni giorno", atTime: "alle", dayOf: (n, m) => `giorno ${n} di ${m}`,
              leave: "Lascia", leaveFailed: "Non è stato possibile lasciare il rituale.",
              stop: "Ferma", stopTitle: "Fermare il ciclo?",
              stopBody: "Il ciclo si ferma: non ci saranno altri appuntamenti. Quello in corso, se c'è, finisce normalmente.",
              stopYes: "Ferma", stopNo: "Lascialo andare", stopFailed: "Non è stato possibile fermare il ciclo.",
              room: "Stanza del rituale", peopleHere: (n) => n === 1 ? "1 persona qui adesso" : `${n} persone qui adesso`,
              closeRoom: "Chiudi", descCounter: (n) => `ancora ${n} caratteri`,
              recurrenceErrors: {
                recurrence_incomplete: "Scegli i giorni e la data di fine.",
                recurrence_days_invalid: "Scegli almeno un giorno della settimana.",
                recurrence_end_invalid: "La data di fine deve essere dopo l'inizio, al massimo fra un anno.",
                recurrence_duration_too_long: "Un rituale che si ripete dura al massimo 12 ore.",
                recurrence_empty: "In questo periodo non cade nessuno dei giorni scelti.",
                recurrence_limit: "Hai già 10 rituali che si ripetono: fermane uno prima di crearne un altro.",
                timezone_invalid: "Il fuso orario del telefono non è riconosciuto."
              }
```

EN: "Repeats", "Just once", "Every day", "Chosen days", "Until", ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], "Every day", "at", `day ${n} of ${m}`, "Leave", "Could not leave the ritual.", "Stop", "Stop the cycle?", "The cycle stops: there will be no more sessions. The current one, if any, ends normally.", "Stop", "Let it continue", "Could not stop the cycle.", "Ritual room", `1 person here now` / `${n} people here now`, "Close", `${n} characters left`, e le frasi degli errori tradotte.

- [ ] **Step 3: build e regressione** — `node build.js`; server locale; `test-partecipa-subito.js`, `test-rituali-candele.js`, `test-rituali-cancellazione-ui.js`, `test-orari-rituali.js` verdi.
- [ ] **Step 4: commit** — `git add src/app.jsx app.js test-partecipa-subito.js && git commit -m "feat(app): rituali dalla vista, creazione ricorrente, lasciare e fermare (logica)"`.

---

### Task 7: app — modulo e scheda

**Files:**
- Modify: `src/app.jsx` (modulo ~r.5483-5570, scheda ~r.4015-4110, modale di cancellazione ~r.5252 come modello per quello di «Ferma»), `app.js`

**Interfaces:**
- Consumes: Task 6 (`newRitual.ripeti/giorni/fino`, `leaveRitual`, `ritualToStop`, `doFermaRituale`, traduzioni).
- Produces: attributi per i test UI: `data-test="repeat-select"`, `data-test="repeat-day-<1..7>"`, `data-test="repeat-until"`, `data-test="ritual-recurrence"` (la riga 🔁), `data-test="leave-ritual"`, `data-test="stop-ritual"`, `data-test="stop-ritual-confirm"`, `data-test="open-room"` sulla scheda in corso.

- [ ] **Step 1: modulo** — dopo il blocco durata, un blocco «Si ripete»: `<select data-test="repeat-select">` con le tre voci; se `giorni`, sette pulsanti a interruttore (`aria-pressed`, `data-test="repeat-day-N"`, etichette `t.rituals.weekdaysShort[N-1]`); se non `mai`, `<input type="date" data-test="repeat-until" min={newRitual.date}>`. Durata: `max={newRitual.ripeti === 'mai' ? 180 : 720}` (180 è il massimo di oggi nel modulo). Descrizione: `maxLength={5000}`, `rows="5"`, e sotto `{5000 - newRitual.description.length < 500 && <div className="text-xs text-secondary">{t.rituals.descCounter(5000 - newRitual.description.length)}</div>}`.

- [ ] **Step 2: scheda** — sotto il nome, per i ricorrenti:

```jsx
                                {Array.isArray(ritual.ripeti_giorni) && (
                                  <p data-test="ritual-recurrence" className="text-sm" style={{color: '#c4b5fd'}}>
                                    🔁 {descriviRipetizione(ritual)} · {t.rituals.dayOf(ritual.occorrenza_numero, ritual.occorrenze_totali)}
                                  </p>
                                )}
```

con l'helper (accanto a `formatRitualWhen`):

```jsx
          // «Ogni giorno alle 07:00» / «Lun, Mer, Ven alle 07:00»: l'ora è quella di chi guarda,
          // calcolata dall'appuntamento corrente (date/time della vista), come il resto della scheda.
          const descriviRipetizione = (ritual) => {
            const g = ritual.ripeti_giorni || [];
            const quando = g.length === 7 ? t.rituals.everyDay : g.map(n => t.rituals.weekdaysShort[n - 1]).join(', ');
            const istante = new Date(`${ritual.date}T${ritual.time}Z`);
            const ora = isNaN(istante.getTime()) ? '' : new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB',
              { hour: '2-digit', minute: '2-digit', hour12: false }).format(istante);
            return `${quando} ${t.rituals.atTime} ${ora}`;
          };
```

Nota: i giorni sono quelli del fuso del creatore; per chi guarda da un fuso lontano l'ora mostrata è la sua, il giorno della settimana resta quello del creatore. Dichiararlo in un commento; non si converte (fuori perimetro).

Pulsanti: dopo «Partecipa», se `isJoined && ritual.creator_id !== sessionId` → `<button data-test="leave-ritual" className="btn-secondary px-4" onClick={() => leaveRitual(ritual.id)}>{t.rituals.leave}</button>`. Il cestino di oggi resta con la sua condizione **ma** calcolata sul primo appuntamento: per i ricorrenti visibile solo se `new Date(`${ritual.prima_date}T${ritual.prima_time}Z`) > new Date()`. «Ferma»: se `ritual.creator_id === sessionId && Array.isArray(ritual.ripeti_giorni) && !ritual.fermato_il && primo appuntamento già iniziato` → pulsante `data-test="stop-ritual"` che fa `setRitualToStop(ritual)`. Modale di conferma copiato da quello di cancellazione (`t.rituals.stopTitle/stopBody/stopYes/stopNo`, conferma `data-test="stop-ritual-confirm"` → `doFermaRituale(ritualToStop.id); setRitualToStop(null)`). Se `status === 'live'`, la scheda intera ha `data-test="open-room"`, `role="button"` e `onClick` che apre la stanza (Task 8: `setStanzaId(ritual.id)`) — fermando la propagazione sui pulsanti interni (`e.stopPropagation()` negli `onClick` dei pulsanti della scheda, oppure `onClick` solo su un'area/pulsante «Entra» dedicato con la stessa `data-test`: scegliere il pulsante dedicato «Entra 🕯️», più semplice e senza sorprese).

- [ ] **Step 3: build**, controllo visivo rapido con uno screenshot Playwright del modulo aperto e di una scheda ricorrente (salvare in scratchpad, non nel repo).
- [ ] **Step 4: commit** — `git add src/app.jsx app.js && git commit -m "feat(app): modulo e scheda dei rituali che si ripetono"`.

---

### Task 8: la stanza del rituale e il test UI

**Files:**
- Modify: `src/app.jsx`, `app.js`, `sw.js` (cache `ga-pwa-v10` → `ga-pwa-v11`)
- Create: `test-rituali-ricorrenti-ui.js`

**Interfaces:**
- Consumes: Task 6–7; `segna_presenza_rituale`; `?ritual=<id>` prodotto da `push-helpers.js:62`.
- Produces: stato `stanzaId` / `setStanzaId`; `data-test="ritual-room"`, `data-test="room-text"`, `data-test="room-people"`, `data-test="room-candle"`, `data-test="room-close"`.

- [ ] **Step 1: test UI che fallisce** — `test-rituali-ricorrenti-ui.js`, sulla falsariga di `test-rituali-cancellazione-ui.js` (leggerlo: login ospite con `loginAsGuest` di `test-helpers.js`, pulizia `try/finally`). Casi:
  1. Ospite A crea dal modulo un rituale «Giorni scelti» con tutti i giorni tranne uno, fine fra 7 giorni → la scheda ha `ritual-recurrence` con «giorno 1 di N» (N contato in JS dagli stessi giorni).
  2. Con la chiave di servizio si prepara un ciclo **in corso al giorno 2**: `create_ritual` via RPC con partenza ieri alle (adesso − 1 min) UTC, fuso `UTC`, ogni giorno, durata 30. Ospite B lo vede con «giorno 2 di …», preme «Partecipa», poi «Lascia» ricompare «Partecipa».
  3. B ripreme Partecipa, preme «Entra» → `ritual-room` visibile, `room-text` contiene «riga uno» e «riga due» su righe distinte (la descrizione è `'riga uno\nriga due'`; verificare `innerText` con `\n`), `room-people` dice «1 persona qui adesso» entro 5 s.
  4. **Review Focus 1**: B tocca `room-candle` → dopo 1 s la stanza è ancora aperta e la scheda dice ancora «giorno 2».
  5. Apertura da notifica: nuova pagina su `app.html?ritual=<id>` (dopo login ospite) → la stanza si apre da sola; l'indirizzo non contiene più `ritual=`.
  6. A (creatore) su un ciclo avviato vede «Ferma», conferma → il pulsante sparisce.
- [ ] **Step 2: eseguire** — Expected: FAIL (niente stanza).
- [ ] **Step 3: implementare la stanza**

Stato e lettura dell'indirizzo (accanto a `magicToken`):

```jsx
          // Dalla notifica si arriva con ?ritual=<id> (push-helpers.js). Si toglie subito
          // dall'indirizzo, come reset e magic, e si tiene qui finché i rituali non sono caricati:
          // può servire un'entrata come ospite prima.
          const [ritualeDaAprire, setRitualeDaAprire] = useState(() => {
            const p = new URLSearchParams(window.location.search);
            const id = p.get('ritual');
            if (id) window.history.replaceState({}, '', window.location.pathname);
            return id && /^\d+$/.test(id) ? Number(id) : null;
          });
          const [stanzaId, setStanzaId] = useState(null);
          const [presentiStanza, setPresentiStanza] = useState(null);
          const stanza = stanzaId != null ? rituals.find(r => r.id === stanzaId) : null;
```

Effetti (dopo `getRitualStatus` nel codice, perché lo usano):

```jsx
          // Il rituale arrivato dalla notifica: se è in corso si entra, se no non si fa niente di
          // speciale; se non esiste più (già pulito) lo si dimentica.
          React.useEffect(() => {
            if (ritualeDaAprire == null || rituals.length === 0) return;
            const r = rituals.find(x => x.id === ritualeDaAprire);
            if (r && getRitualStatus(r) === 'live') setStanzaId(r.id);
            setRitualeDaAprire(null);
          }, [ritualeDaAprire, rituals]);

          // Nella stanza ci si segna all'ingresso e ogni 30 secondi: il numero conta chi si è fatto
          // vivo nell'ultimo minuto (28_). Finito l'appuntamento, la stanza si chiude da sola.
          const stanzaLive = !!stanza && getRitualStatus(stanza) === 'live';
          React.useEffect(() => {
            if (stanzaId == null) return;
            if (!stanzaLive) { setStanzaId(null); setPresentiStanza(null); return; }
            let vivo = true;
            const segna = async () => {
              const { data, error } = await supabase.rpc('segna_presenza_rituale', { p_ritual_id: stanzaId, p_session_id: sessionId });
              if (vivo && !error && typeof data === 'number') setPresentiStanza(data);
            };
            segna();
            const timer = setInterval(segna, 30000);
            return () => { vivo = false; clearInterval(timer); };
          }, [stanzaId, stanzaLive, sessionId]);
```

Nota: `getRitualStatus` va rivalutato col tempo; la pagina già ricarica i rituali ogni 10 s (`loadData`), il che basta a chiudere la stanza entro 10 s dalla fine.

La musica: `ritualeLive` oggi richiede di essere partecipanti; la stanza aperta su un rituale in corso deve farla partire anche per chi non partecipa → `const ritualeLive = rituals.find(r => (r.id === stanzaId || (Array.isArray(r.participants) && r.participants.includes(sessionId))) && getRitualStatus(r) === 'live');`.

Render (accanto alla soglia, sotto l'`<audio>`; la soglia ha `zIndex: 10000`, la stanza `9999` così la soglia resta sopra quando serve il tocco):

```jsx
              {stanza && stanzaLive && (
                <div data-test="ritual-room" role="dialog" aria-label={t.rituals.room}
                  style={{position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column',
                          alignItems: 'center', padding: '2rem 1.25rem', gap: '1rem', overflowY: 'auto',
                          background: 'rgba(10, 6, 30, 0.94)', backdropFilter: 'blur(6px)'}}>
                  <button data-test="room-close" onClick={() => setStanzaId(null)} className="btn-secondary"
                    style={{alignSelf: 'flex-end'}}>{t.rituals.closeRoom}</button>
                  <div style={{fontSize: '3rem'}}>{ritualTypes.find(x => x.id === stanza.type)?.icon}</div>
                  <h2 className="text-white" style={{fontSize: '1.6rem', fontWeight: 700, textAlign: 'center'}}>{stanza.name}</h2>
                  <div data-test="room-people" style={{color: '#4ade80'}}>
                    {presentiStanza != null ? t.rituals.peopleHere(presentiStanza) : ''}
                  </div>
                  {stanza.description && (
                    <div data-test="room-text" className="text-white"
                      style={{whiteSpace: 'pre-wrap', fontSize: '1.35rem', lineHeight: 1.6, maxWidth: '40rem', textAlign: 'center'}}>
                      {stanza.description}
                    </div>
                  )}
                  <button data-test="room-candle" onClick={() => toggleCandle(stanza.id)} className="btn-secondary px-4">
                    🕯️ {(stanza.candles || []).length}
                  </button>
                </div>
              )}
```

`sw.js`: `const CACHE = 'ga-pwa-v11';` con un commento datato (stanza e vista nuova: le app installate devono prendere il codice nuovo).

- [ ] **Step 4: build, server locale, eseguire** `test-rituali-ricorrenti-ui.js` fino al verde; poi la regressione di spec §5 (UI e RPC dei rituali, musica, soglia, push) e `test-pwa.js`.
- [ ] **Step 5: commit** — `git add src/app.jsx app.js sw.js test-rituali-ricorrenti-ui.js && git commit -m "feat(app): la stanza del rituale — la preghiera in grande e chi c'è adesso"`.

---

## Dopo l'ultimo task (controller)

1. Revisione indipendente dell'intero ramo (`git diff main...feat/rituali-ricorrenti`) contro la spec; correggere e ripetere finché non restano rilievi alti o medi.
2. Suite completa dei rituali e dell'area account verde.
3. Pubblicazione della Edge Function (Irene se a me è bloccato), poi PR su `main` con descrizione non tecnica; merge di Irene.
