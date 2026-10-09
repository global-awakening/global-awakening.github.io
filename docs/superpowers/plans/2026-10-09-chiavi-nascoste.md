# Chiavi nascoste — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nessun session_id altrui leggibile con la chiave pubblica; l'app riconosce le persone tramite un id pubblico `pub_…`.

**Architecture:** l'id pubblico si calcola sul server, in uscita (`id_pubblico(sid)` = `pub_` + sha256 con segreto). I dati salvati restano session_id, tranne `telepathy_matches`, che l'app scrive da sé e che da ora contiene id pubblici. Rilascio in due tempi: 36a additiva e compatibile con l'app vecchia, poi l'app nuova, poi la 36b che chiude.

**Tech Stack:** Postgres/Supabase (plpgsql, PostgREST), PGlite per le prove SQL locali (`scripts/pg-locale.js`), React senza bundler (`src/app.jsx` → `node build.js` → `app.js`), Playwright per le prove UI.

**Spec:** `docs/superpowers/specs/2026-10-09-chiavi-nascoste-design.md`
**Catalogo live (09/10, da cui si copiano le funzioni da ridefinire):** `docs/superpowers/plans/catalogo-chiavi-36.txt`

## Global Constraints

- Migration: `supabase/sql/36a_chiavi_server.sql`, `36a_ritorno.sql`, `36b_chiudi_chiavi.sql`, `36b_ritorno.sql`. Ognuna in `BEGIN; … COMMIT;`, idempotente (rilanciabile senza errori), termina con `NOTIFY pgrst, 'reload schema';` prima del COMMIT.
- Ogni funzione: `SECURITY DEFINER`, `SET search_path = public, pg_temp`. Supabase concede EXECUTE ad anon sulle funzioni nuove per default: ogni funzione ha subito dopo `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` e, solo se pubblica, `GRANT EXECUTE … TO anon, authenticated;`.
- Le funzioni ridefinite si copiano **dal catalogo live** e si cambiano solo le righe indicate; ogni riga cambiata porta un commento `-- 36a:` (o `-- 36b:`).
- `id_pubblico('pub_…')` → NULL; le RPC nuove rifiutano `p_session_id` che inizia con `pub_`.
- Prove: sempre `NODE_OPTIONS="--require ./scripts/test-silenzioso.js"` (test muti). Nel worktree non c'è `.env`: per i test che lo richiedono si usa un preload che chiama `require('../global-awakening/test-helpers').loadTestEnv()`; **mai copiare `.env`**.
- L'hook pre-commit rifiuta la stringa del ruolo di servizio scritta per intero fuori dalle righe GRANT dei `.sql` (vedi `pg-locale.js`, `RUOLO_SERVIZIO`).
- Niente refactor del motore della telepatia oltre ai confronti d'identità; niente modifiche a post/commenti, chat della telepatia, nickname.
- Testi dei commit in italiano, finiscono con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Session_id che inizia con `pub_`** (scelto da un malintenzionato): non deve mai produrre l'id pubblico di un altro né ricevere i suoi inviti → test in Task 1 e Task 2.
2. **Finestra fra deploy e 36b** (app vecchia e nuova insieme, 10 minuti): un invito accettato da un'app nuova verso un'app vecchia (e viceversa) deve ancora creare una partita valida → test in Task 2 (`respond_telepathy_invite` con forme miste).
3. **Ospite con nickname uguale a un registrato** che aggiorna la presenza: deve comparire come `Anonymous`, non col nome del registrato → test in Task 1.
4. **Registrato con password sbagliata**: la presenza non si scrive ma la lista arriva lo stesso (l'app non deve vedere un errore ogni 4 s) → test in Task 1.
5. **Rituale con candele e `candles_nomi`**: nella vista pubblica l'ordine delle candele resta quello di accensione e ogni chiave dei nomi corrisponde a un elemento di `candles` → test in Task 2.

---

### Task 1: id pubblico, presenze e coda (36a, parte 1)

**Files:**
- Create: `supabase/sql/36a_chiavi_server.sql` (sezioni A–C)
- Modify: `scripts/pg-locale.js` (costanti `F36A`, `F36B`, opzioni `con36a`, `con36b` in `creaDbTelepatia`, tabella `app_secrets` nello schema)
- Test: `test-chiavi-nascoste-sql.js` (nuovo)

**Interfaces:**
- Produces (SQL, usate da Task 2–4):
  - `id_pubblico(p_sid text) RETURNS text` (non pubblica)
  - `mio_id_pubblico(p_session_id text) RETURNS text` (pubblica)
  - `aggiorna_presenza(p_session_id text, p_password_hash text, p_nickname text, p_lat float8, p_lng float8) RETURNS jsonb` → array di `{id, nickname, lat, lng, last_seen, busy}` (pubblica)
  - `esci_presenza(p_session_id text, p_password_hash text) RETURNS void` (pubblica)
  - `presenza_di(p_id_pubblico text) RETURNS timestamptz` (pubblica)
  - `coda_entra(p_session_id text, p_password_hash text, p_nickname text) RETURNS boolean` (pubblica)
  - `coda_esci(p_session_id text, p_password_hash text) RETURNS void` (pubblica)
  - `coda_leggi(p_session_id text) RETURNS jsonb` → array di `{id, nickname, timestamp}` in ordine di arrivo, senza di me (pubblica)
- Produces (JS): `creaDbTelepatia({ con32a, con32b, con35a, con35b, con36a, con36b })`; `F36A`, `F36B` esportate.

- [ ] **Step 1: preparare il DB locale.** In `scripts/pg-locale.js`:
  - nello `SCHEMA_TELEPATIA` aggiungere (copiato dalla 26):
    ```sql
    CREATE TABLE IF NOT EXISTS app_secrets (nome text PRIMARY KEY, valore bytea NOT NULL);
    ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON app_secrets FROM PUBLIC, anon, authenticated;
    ```
    e, perché la vista dei rituali e `busy` funzionino come sul DB vero, le policy di oggi:
    ```sql
    ALTER TABLE online_users ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all" ON online_users FOR ALL TO public USING (true) WITH CHECK (true);
    ALTER TABLE telepathy_queue ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all" ON telepathy_queue FOR ALL TO public USING (true) WITH CHECK (true);
    ```
    (verificare prima con `grep` che non esistano già; se `telepathy_matches` non ha `ultima_attivita`/`giocato`, le aggiunge la 32a).
  - costanti `const F36A = 'supabase/sql/36a_chiavi_server.sql'; const F36B = 'supabase/sql/36b_chiudi_chiavi.sql';`
  - `creaDbTelepatia({ con32a = true, con32b = false, con35a = false, con35b = false, con36a = false, con36b = false } = {})`: dopo il blocco 35 aggiungere
    ```js
    if (con36a) await applicaFile(db, F36A);
    if (con36a && con36b) await applicaFile(db, F36B);
    ```
    ed esportare `F36A, F36B`.
  - Lanciare `node test-pg-locale.js`, `node test-notifiche-chiuse-sql.js`, `node test-inviti-offline-sql.js` (con NODE_OPTIONS dei test muti): devono restare verdi come prima (7/0, 209/0, 270/0). Se le policy aggiunte cambiano un esito, toglierle e annotarlo.

- [ ] **Step 2: scrivere il test (fallisce).** `test-chiavi-nascoste-sql.js`, stessa ossatura di `test-notifiche-chiuse-sql.js` (copiare `check`, `errore`, `righe`, `uno`, `chiama`, `comeAnon`, `G`, `iscritto`, `sezione` e il runner). Il runner usa `creaDbTelepatia(opzioni)`, con default `{ con35a: true, con36a: true }`. Sezioni:
  ```js
  const pub = (db, sid) => uno(db, `SELECT id_pubblico($1) AS r`, [sid]).then((r) => r.r);
  const nessunSid = (valore, sids) => sids.every((s) => !JSON.stringify(valore).includes(s));

  sezione('I1. id_pubblico', async (db) => {
    const a = await pub(db, 'sidA-123'), b = await pub(db, 'sidA-123');
    check(/^pub_[0-9a-f]{32}$/.test(a), 'formato pub_ + 32 esadecimali', a);
    check(a === b, 'deterministica');
    check(a !== await pub(db, 'sidB-123'), 'sid diversi, id diversi');
    check(await pub(db, null) === null, 'NULL → NULL');
    check(await pub(db, a) === null, 'un valore pub_… dà NULL (non è un session_id)');
    await db.query(`UPDATE app_secrets SET valore = '\\x00' WHERE nome = 'id_pubblico_salt'`);
    check(await pub(db, 'sidA-123') !== a, 'cambia col segreto');
    const e = await comeAnon(db, () => errore(pub(db, 'x')));
    check(/permission denied/.test(e || ''), 'anon non esegue id_pubblico', e);
    const m = await comeAnon(db, () => chiama(db, 'mio_id_pubblico', { p_session_id: 'sidB-123' }));
    check(m === await pub(db, 'sidB-123'), 'mio_id_pubblico per anon = id_pubblico');
    const e2 = await comeAnon(db, () => errore(chiama(db, 'mio_id_pubblico', { p_session_id: a })));
    check(e2 !== null, 'mio_id_pubblico rifiuta pub_…', e2);
  });

  sezione('P1. presenze', async (db) => {
    await iscritto(db, 'sidR', 'Rosa', 'h1');
    const lista = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidL', 'Luna'), p_lat: 10, p_lng: 20 }));
    check(lista.length === 1 && lista[0].nickname === 'Luna' && lista[0].id === await pub(db, 'sidL'), 'scrivo la mia riga, esco con id pubblico', lista);
    const l2 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidR', 'Rosa', 'h1'), p_lat: 1, p_lng: 2 }));
    check(l2.length === 2 && nessunSid(l2, ['sidL', 'sidR']), 'due presenti, nessun session_id in uscita', l2);
    const l3 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidX', 'Rosa'), p_lat: 1, p_lng: 2 }));
    check(l3.find((u) => u.id === pub(db, 'sidX')) === undefined || l3.some((u) => u.nickname === 'Anonymous'), 'ospite col nome di un registrato → Anonymous', l3);
    const l4 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidR', 'Rosa', 'sbagliata'), p_lat: 1, p_lng: 2 }));
    check(Array.isArray(l4), 'password sbagliata: nessun errore, la lista arriva', l4);
    const l5 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('pub_abc', 'Eco'), p_lat: 1, p_lng: 2 }));
    check(!l5.some((u) => u.nickname === 'Eco'), 'session_id pub_… non scrive', l5);
    const l6 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidK', 'Kai'), p_lat: 999, p_lng: -999 }));
    const kai = l6.find((u) => u.nickname === 'Kai');
    check(kai && kai.lat === null && kai.lng === null, 'coordinate fuori scala → null', kai);
    await db.query(`UPDATE online_users SET last_seen = now() - interval '3 minutes' WHERE id = 'sidL'`);
    const l7 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidK', 'Kai'), p_lat: 1, p_lng: 1 }));
    check(!l7.some((u) => u.nickname === 'Luna'), 'pulizia oltre 2 minuti', l7);
    await db.query(`INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ($1, 'altro')`, [await pub(db, 'sidK')]);
    const l8 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidK', 'Kai'), p_lat: 1, p_lng: 1 }));
    check(l8.find((u) => u.nickname === 'Kai').busy === true, 'busy da partita viva con id pubblico', l8);
    await db.query(`DELETE FROM telepathy_matches`);
    await db.query(`INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ('sidK', 'altro')`);
    const l9 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidK', 'Kai'), p_lat: 1, p_lng: 1 }));
    check(l9.find((u) => u.nickname === 'Kai').busy === true, 'busy anche con partita col session_id grezzo (app vecchia)', l9);
    check(await comeAnon(db, () => chiama(db, 'presenza_di', { p_id_pubblico: l9[0].id })) !== null, 'presenza_di trova chi è online');
    check(await comeAnon(db, () => chiama(db, 'presenza_di', { p_id_pubblico: 'sidK' })) === null, 'presenza_di non accetta session_id');
    await comeAnon(db, () => chiama(db, 'esci_presenza', { p_session_id: 'sidK', p_password_hash: null }));
    check((await righe(db, `SELECT 1 FROM online_users WHERE id = 'sidK'`)).length === 0, 'esci_presenza toglie la mia riga');
    await comeAnon(db, () => chiama(db, 'esci_presenza', { p_session_id: 'sidR', p_password_hash: 'sbagliata' }));
    check((await righe(db, `SELECT 1 FROM online_users WHERE id = 'sidR'`)).length === 1, 'esci_presenza con password sbagliata non toglie nulla');
  });

  sezione('C1. coda', async (db) => {
    check(await comeAnon(db, () => chiama(db, 'coda_entra', G('sidA', 'Ada'))) === true, 'entro in coda');
    await comeAnon(db, () => chiama(db, 'coda_entra', G('sidB', 'Bea')));
    const vista = await comeAnon(db, () => chiama(db, 'coda_leggi', { p_session_id: 'sidA' }));
    check(vista.length === 1 && vista[0].nickname === 'Bea' && vista[0].id === await pub(db, 'sidB') && nessunSid(vista, ['sidA', 'sidB']), 'vedo gli altri, con id pubblico', vista);
    check(await comeAnon(db, () => chiama(db, 'coda_entra', G('pub_x', 'Eco'))) === false, 'pub_… non entra');
    await db.query(`UPDATE telepathy_queue SET timestamp = timestamp - 61000 WHERE id = 'sidB'`);
    check((await comeAnon(db, () => chiama(db, 'coda_leggi', { p_session_id: 'sidA' }))).length === 0, 'oltre 60 s si esce');
    await comeAnon(db, () => chiama(db, 'coda_esci', { p_session_id: 'sidA', p_password_hash: null }));
    check((await righe(db, `SELECT 1 FROM telepathy_queue WHERE id = 'sidA'`)).length === 0, 'coda_esci');
  });
  ```
  (nella P1 il controllo «Anonymous» va scritto senza `pub(...)` sincrono: calcolare prima `const pX = await pub(db, 'sidX')` e verificare `l3.find((u) => u.id === pX).nickname === 'Anonymous'`.)

- [ ] **Step 3: verificare che fallisca.** `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-chiavi-nascoste-sql.js` → eccezione «file 36a non trovato» o «function id_pubblico does not exist».

- [ ] **Step 4: scrivere la 36a, sezioni A–C.** Intestazione come la 35a (scopo, compatibilità con l'app vecchia, idempotenza, ritorno, «richiede 32a e 35a»).
  ```sql
  BEGIN;
  -- ════ A. Segreto e id pubblico ════
  CREATE TABLE IF NOT EXISTS public.app_secrets (nome text PRIMARY KEY, valore bytea NOT NULL);
  ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.app_secrets FROM PUBLIC, anon, authenticated;
  INSERT INTO public.app_secrets (nome, valore)
  VALUES ('id_pubblico_salt', decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'))
  ON CONFLICT (nome) DO NOTHING;

  CREATE OR REPLACE FUNCTION public.id_pubblico(p_sid text) RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE v bytea;
  BEGIN
    IF p_sid IS NULL OR p_sid LIKE 'pub\_%' THEN RETURN NULL; END IF;
    SELECT valore INTO v FROM app_secrets WHERE nome = 'id_pubblico_salt';
    IF v IS NULL THEN RAISE EXCEPTION 'id_pubblico_salt mancante'; END IF;
    RETURN 'pub_' || left(encode(sha256(v || convert_to(p_sid, 'UTF8')), 'hex'), 32);
  END $$;
  REVOKE ALL ON FUNCTION public.id_pubblico(text) FROM PUBLIC, anon, authenticated;

  CREATE OR REPLACE FUNCTION public.chiavi_sid_valido(p_sid text) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
    SELECT p_sid IS NOT NULL AND p_sid <> '' AND length(p_sid) <= 255 AND p_sid NOT LIKE 'pub\_%';
  $$;
  REVOKE ALL ON FUNCTION public.chiavi_sid_valido(text) FROM PUBLIC, anon, authenticated;

  CREATE OR REPLACE FUNCTION public.mio_id_pubblico(p_session_id text) RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  BEGIN
    IF NOT chiavi_sid_valido(p_session_id) THEN RAISE EXCEPTION 'session_non_valida'; END IF;
    RETURN id_pubblico(p_session_id);
  END $$;
  REVOKE ALL ON FUNCTION public.mio_id_pubblico(text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.mio_id_pubblico(text) TO anon, authenticated;

  -- Nome verificato, o NULL se l'identità non regge (mai un errore: presenze e coda girano ogni pochi secondi).
  CREATE OR REPLACE FUNCTION public.chiavi_chi_sono(p_session_id text, p_password_hash text, p_nickname text) RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  BEGIN
    IF NOT chiavi_sid_valido(p_session_id) THEN RETURN NULL; END IF;
    RETURN notifica_chi_sono(p_session_id, p_password_hash, p_nickname);
  EXCEPTION WHEN OTHERS THEN RETURN NULL;
  END $$;
  REVOKE ALL ON FUNCTION public.chiavi_chi_sono(text, text, text) FROM PUBLIC, anon, authenticated;

  -- ════ B. Presenze ════
  CREATE OR REPLACE FUNCTION public.aggiorna_presenza(p_session_id text, p_password_hash text, p_nickname text, p_lat float8, p_lng float8)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE v_nome text := chiavi_chi_sono(p_session_id, p_password_hash, p_nickname);
  BEGIN
    IF v_nome IS NOT NULL THEN
      INSERT INTO online_users (id, nickname, lat, lng, last_seen)
      VALUES (p_session_id, v_nome,
              CASE WHEN p_lat BETWEEN -90 AND 90 THEN p_lat END,
              CASE WHEN p_lng BETWEEN -180 AND 180 THEN p_lng END, now())
      ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, lat = EXCLUDED.lat, lng = EXCLUDED.lng, last_seen = now();
    END IF;
    DELETE FROM online_users WHERE last_seen < now() - interval '2 minutes';
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id_pubblico(u.id), 'nickname', u.nickname, 'lat', u.lat, 'lng', u.lng, 'last_seen', u.last_seen,
               -- 36b: resta solo id_pubblico(u.id), le partite sono convertite.
               'busy', EXISTS (SELECT 1 FROM telepathy_matches m
                                WHERE m.ended_at IS NULL
                                  AND (m.user1_id IN (u.id, id_pubblico(u.id)) OR m.user2_id IN (u.id, id_pubblico(u.id)))))
             ORDER BY u.last_seen DESC)
        FROM online_users u WHERE chiavi_sid_valido(u.id)), '[]'::jsonb);
  END $$;
  -- REVOKE + GRANT EXECUTE ad anon, authenticated

  CREATE OR REPLACE FUNCTION public.esci_presenza(p_session_id text, p_password_hash text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  BEGIN
    IF chiavi_chi_sono(p_session_id, p_password_hash, NULL) IS NULL THEN RETURN; END IF;
    DELETE FROM online_users WHERE id = p_session_id;
  END $$;

  CREATE OR REPLACE FUNCTION public.presenza_di(p_id_pubblico text) RETURNS timestamptz
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT max(last_seen) FROM online_users
     WHERE p_id_pubblico LIKE 'pub\_%' AND id_pubblico(id) = p_id_pubblico;
  $$;

  -- ════ C. Coda della telepatia ════
  CREATE OR REPLACE FUNCTION public.coda_entra(p_session_id text, p_password_hash text, p_nickname text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE v_nome text := chiavi_chi_sono(p_session_id, p_password_hash, p_nickname);
          v_ora bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  BEGIN
    IF v_nome IS NULL THEN RETURN false; END IF;
    DELETE FROM telepathy_queue WHERE timestamp < v_ora - 60000;
    INSERT INTO telepathy_queue (id, nickname, timestamp) VALUES (p_session_id, v_nome, v_ora)
    ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, timestamp = EXCLUDED.timestamp;
    RETURN true;
  END $$;

  CREATE OR REPLACE FUNCTION public.coda_esci(p_session_id text, p_password_hash text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  BEGIN
    IF chiavi_chi_sono(p_session_id, p_password_hash, NULL) IS NULL THEN RETURN; END IF;
    DELETE FROM telepathy_queue WHERE id = p_session_id;
  END $$;

  CREATE OR REPLACE FUNCTION public.coda_leggi(p_session_id text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE v_ora bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  BEGIN
    DELETE FROM telepathy_queue WHERE timestamp < v_ora - 60000;
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', id_pubblico(q.id), 'nickname', q.nickname, 'timestamp', q.timestamp)
                                      ORDER BY q.timestamp)
                       FROM telepathy_queue q
                      WHERE q.id IS DISTINCT FROM p_session_id AND chiavi_sid_valido(q.id)), '[]'::jsonb);
  END $$;
  ```
  Ogni funzione pubblica (`mio_id_pubblico`, `aggiorna_presenza`, `esci_presenza`, `presenza_di`, `coda_entra`, `coda_esci`, `coda_leggi`) ha `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO anon, authenticated;`. Le sezioni D–E le aggiunge il Task 2; chiudere il file con `NOTIFY pgrst, 'reload schema'; COMMIT;`.
  Nota su `chiavi_chi_sono(sid, hash, NULL)`: per un ospite `notifica_chi_sono` restituisce comunque un nome (`Anonymous`), quindi la verifica passa; per un registrato serve la password giusta. È quello che si vuole per `esci_presenza`/`coda_esci`.

- [ ] **Step 5: test verdi.** `node test-chiavi-nascoste-sql.js` → tutte le sezioni I1, P1, C1 verdi; rilanciare anche `test-notifiche-chiuse-sql.js`, `test-inviti-offline-sql.js`, `test-pg-locale.js`.

- [ ] **Step 6: commit.** `git add scripts/pg-locale.js supabase/sql/36a_chiavi_server.sql test-chiavi-nascoste-sql.js && git commit -m "feat(chiavi): id pubblico, presenze e coda dal server (36a parte 1)"`.

---

### Task 2: inviti, partite e vista dei rituali (36a, parte 2) e ritorno della 36a

**Files:**
- Modify: `supabase/sql/36a_chiavi_server.sql` (sezioni D–E, prima del NOTIFY/COMMIT)
- Create: `supabase/sql/36a_ritorno.sql`
- Test: `test-chiavi-nascoste-sql.js` (sezioni nuove)

**Interfaces:**
- Consumes: `id_pubblico`, `chiavi_sid_valido` (Task 1).
- Produces:
  - vista `rituali_pubblici` con le **stesse colonne, nello stesso ordine** di `rituali_correnti`; `creator_id`, `participants`, `candles`, chiavi di `candles_nomi` in forma pubblica; SELECT per anon e authenticated, nient'altro.
  - `telepatia_risolvi(p_disponibilita_id uuid, p_session_online text, OUT o_sid text, OUT o_nome text)`: `p_session_online` accetta l'id pubblico **o** (fino alla 36b) il session_id grezzo.
  - `telepatia_in_training(p_session_id text, p_escludi uuid)`: riconosce le partite con l'id pubblico o col grezzo.
  - `respond_telepathy_invite(...)`: la partita valida può avere ciascun lato in forma pubblica o grezza.
  - `get_my_telepathy_invites`, `get_telepathy_invite`: `from_id` in uscita = `id_pubblico(from_id)`.

- [ ] **Step 1: test (falliscono).** Sezioni nuove in `test-chiavi-nascoste-sql.js`. Per creare inviti e partite riusare gli helper già presenti in `test-inviti-offline-sql.js` (leggerlo: copiare la creazione di disponibilità/invito che usa `send_telepathy_invite` con `p_session_online`):
  ```js
  sezione('V1. vista rituali_pubblici', async (db) => {
    const rid = (await uno(db, `INSERT INTO rituals (creator, creator_id, name, type, sacred_number, date, time, duration, participants, candles)
      VALUES ('Ada', 'sidA', 'r', 'meditation', 7, to_char(now() + interval '1 day', 'YYYY-MM-DD'), '10:00:00', 3,
              '["sidA","sidB"]'::jsonb, '["sidB","sidA"]'::jsonb) RETURNING id`)).id;
    await db.query(`UPDATE rituals SET candles_nomi = '{"sidA":"Ada","sidB":"Bea"}'::jsonb WHERE id = $1`, [rid]).catch(() => {});
    const pA = await pub(db, 'sidA'), pB = await pub(db, 'sidB');
    const [r] = await comeAnon(db, () => righe(db, `SELECT * FROM rituali_pubblici WHERE id = $1`, [rid]));
    check(r.creator_id === pA, 'creator_id pubblico', r.creator_id);
    check(JSON.stringify(r.participants) === JSON.stringify([pA, pB]), 'participants pubblici, stesso ordine', r.participants);
    check(JSON.stringify(r.candles) === JSON.stringify([pB, pA]), 'candles pubbliche, ordine di accensione', r.candles);
    if (r.candles_nomi && Object.keys(r.candles_nomi).length) {
      check(r.candles_nomi[pA] === 'Ada' && r.candles_nomi[pB] === 'Bea', 'candles_nomi con chiavi pubbliche', r.candles_nomi);
    }
    check(nessunSid(r, ['sidA', 'sidB']), 'nessun session_id nella riga', r);
    const colP = (await righe(db, `SELECT column_name FROM information_schema.columns WHERE table_name = 'rituali_pubblici' ORDER BY ordinal_position`)).map((x) => x.column_name);
    const colC = (await righe(db, `SELECT column_name FROM information_schema.columns WHERE table_name = 'rituali_correnti' ORDER BY ordinal_position`)).map((x) => x.column_name);
    check(JSON.stringify(colP) === JSON.stringify(colC), 'stesse colonne di rituali_correnti, stesso ordine', { colP, colC });
    const w = await comeAnon(db, () => errore(db.query(`UPDATE rituali_pubblici SET name = 'x'`)));
    check(w !== null, 'anon non scrive dalla vista', w);
  });

  sezione('T1. inviti e partite', async (db) => {
    // A invita B (online); B riceve from_id pubblico; accetta con partita a forme miste.
    // Scrivere qui la sequenza con: aggiorna_presenza per A e B; send_telepathy_invite di A con
    // p_session_online = id pubblico di B (deve riuscire: ok=true); get_my_telepathy_invites di B →
    // in_arrivo.from_id === pubblico(A) e nessunSid(..., ['sidA']); get_telepathy_invite di B → from_id pubblico.
    // Poi tre accettazioni, ognuna su un DB nuovo o reimpostando invito e partita:
    //   (a) partita user1=pub(A), user2=pub(B)  → ok (app nuova)
    //   (b) partita user1=pub(A), user2='sidB'  → ok (B ha l'app vecchia, A nuova: from_id gli arriva già pubblico)
    //   (c) partita user1='sidA', user2='sidB'  → ok (tutte e due vecchie, invito creato prima della 36a)
    // e una partita con user1 = pub di un terzo → match_non_valido.
    // telepatia_in_training('sidA') è true con partita pubblica viva e giocata (giocato = true).
    // send_telepathy_invite con p_session_online = 'sidB' (grezzo) → ok (compatibilità fino alla 36b).
    // send_telepathy_invite con p_session_online = 'pub_' || 32 zeri → non_disponibile.
    // Un ospite col session_id 'pub_<id di B>' che aggiorna la presenza NON riceve gli inviti per B:
    //   aggiorna_presenza fallisce in silenzio (Task 1), e telepatia_risolvi(pub(B)) risolve ancora 'sidB'.
  });
  ```
  Tradurre i commenti di T1 in codice vero con `check(...)` per ogni riga; i nomi dei campi delle risposte sono nel catalogo (`ok`, `motivo`, `in_arrivo`, `invito.from_id`).

- [ ] **Step 2: verificare che falliscano** (vista inesistente, `from_id` grezzo).

- [ ] **Step 3: sezioni D–E della 36a.**
  - **D. Vista:**
    ```sql
    CREATE OR REPLACE VIEW public.rituali_pubblici AS
    SELECT rc.id, rc.creator, id_pubblico(rc.creator_id) AS creator_id, rc.name, rc.description, rc.type, rc.sacred_number,
           rc.date, rc."time", rc.duration,
           coalesce((SELECT jsonb_agg(id_pubblico(x) ORDER BY o) FROM jsonb_array_elements_text(rc.participants) WITH ORDINALITY AS t(x, o)), '[]'::jsonb) AS participants,
           rc.energy, rc.created_at,
           coalesce((SELECT jsonb_agg(id_pubblico(x) ORDER BY o) FROM jsonb_array_elements_text(rc.candles) WITH ORDINALITY AS t(x, o)), '[]'::jsonb) AS candles,
           rc.ripeti_giorni, rc.ripeti_fino, rc.fuso, rc.ora_locale, rc.data_inizio_locale, rc.fermato_il, rc.candles_occorrenza,
           rc.prima_date, rc.prima_time, rc.occorrenza_numero, rc.occorrenze_totali, rc.presenti_ora,
           coalesce((SELECT jsonb_object_agg(id_pubblico(k), v) FROM jsonb_each(rc.candles_nomi) AS e(k, v) WHERE id_pubblico(k) IS NOT NULL), '{}'::jsonb) AS candles_nomi
      FROM rituali_correnti rc;
    -- Gira coi diritti del proprietario (niente security_invoker): dopo la 36b anon non legge
    -- rituals né rituali_correnti, solo questa vista.
    REVOKE ALL ON public.rituali_pubblici FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.rituali_pubblici TO anon, authenticated;
    ```
    Prima di scriverla, confrontare l'elenco colonne con quello di `rituali_correnti` **nel DB locale** (che viene dalle migration 28–30) e con il catalogo live: se il locale non ha una colonna (es. `candles_nomi` prima della 30), la vista va scritta per il live e il test V1 si adegua; non inventare colonne.
  - **E. Funzioni ridefinite** (copiate dal catalogo, righe cambiate marcate `-- 36a:`):
    - `telepatia_risolvi`, ramo online:
      ```sql
      ELSIF p_session_online IS NOT NULL AND length(p_session_online) <= 255 THEN
        SELECT u.id, nome_pubblico(u.id, u.nickname) INTO o_sid, o_nome
          FROM online_users u
         WHERE (id_pubblico(u.id) = p_session_online
                OR (p_session_online NOT LIKE 'pub\_%' AND u.id = p_session_online))  -- 36a: il grezzo solo fino alla 36b
           AND u.last_seen > now() - interval '30 seconds'
         ORDER BY u.last_seen DESC LIMIT 1;
      ```
    - `telepatia_in_training`: `WHERE (m.user1_id IN (p_session_id, id_pubblico(p_session_id)) OR m.user2_id IN (p_session_id, id_pubblico(p_session_id)))`.
    - `respond_telepathy_invite`: solo la condizione della partita:
      `AND m.user1_id IN (v.from_id, id_pubblico(v.from_id)) AND m.user2_id IN (v.to_id, id_pubblico(v.to_id))`.
    - `get_my_telepathy_invites`: `'from_id', id_pubblico(i.from_id)`.
    - `get_telepathy_invite`: `'from_id', CASE WHEN v_ruolo = 'destinatario' AND v.status = 'pending' THEN id_pubblico(v.from_id) END`.
    - Dopo ogni `CREATE OR REPLACE`, ripetere REVOKE/GRANT **identici a quelli del catalogo/32a/35a** (cercare in `supabase/sql/32a_*.sql` e `35a_*.sql` le righe GRANT della funzione).
    - `send_telepathy_invite`, `block_telepathy_inviter`, `cancel_telepathy_invite` **non** cambiano: passano da `telepatia_risolvi` e non restituiscono session_id (verificato sul catalogo).
- [ ] **Step 4: `36a_ritorno.sql`.** In una transazione: `DROP VIEW IF EXISTS rituali_pubblici`; DROP delle funzioni nuove (`mio_id_pubblico`, `aggiorna_presenza`, `esci_presenza`, `presenza_di`, `coda_entra`, `coda_esci`, `coda_leggi`, `chiavi_chi_sono`, `chiavi_sid_valido`, `id_pubblico`, con le firme); ricreare dal catalogo **testuale** le cinque funzioni ridefinite (copiare i blocchi del catalogo così come sono, con i loro GRANT); `DELETE FROM app_secrets WHERE nome = 'id_pubblico_salt'`; NOTIFY; COMMIT. Le partite scritte con id pubblici nel frattempo restano: lo si scrive in testa al file.
- [ ] **Step 5: test.** Sezione `R1. 36a_ritorno`: dopo `applicaFile(db, 'supabase/sql/36a_ritorno.sql')` la vista e `id_pubblico` non esistono, `get_my_telepathy_invites` restituisce di nuovo il `from_id` grezzo, il ritorno si applica due volte senza errori, e la 36a si può riapplicare dopo il ritorno. Poi tutte le suite SQL verdi: `test-chiavi-nascoste-sql`, `test-notifiche-chiuse-sql`, `test-inviti-offline-sql`, `test-rituali-ricorrenti-sql`, `test-candela-stanza-sql`, `test-lingue-push-sql`, `test-pg-locale`.
- [ ] **Step 6: commit.** `feat(chiavi): inviti, partite e vista dei rituali con id pubblici (36a parte 2) + ritorno`.

---

### Task 3: chiusura (36b) e suo ritorno

**Files:**
- Create: `supabase/sql/36b_chiudi_chiavi.sql`, `supabase/sql/36b_ritorno.sql`
- Test: `test-chiavi-nascoste-sql.js` (sezioni con `{ con35a: true, con36a: true, con36b: true }`)

**Interfaces:**
- Consumes: tutto il Task 1–2.
- Produces: `online_users`, `telepathy_queue`, `rituals`, `rituali_correnti` chiuse ad anon/authenticated; partite convertite; `telepatia_risolvi`, `telepatia_in_training`, `respond_telepathy_invite`, `aggiorna_presenza` solo con id pubblici.

- [ ] **Step 1: test (falliscono).**
  ```js
  sezione('B1. chiusura', async (db) => {
    for (const t of ['online_users', 'telepathy_queue', 'rituals', 'rituali_correnti']) {
      const e = await comeAnon(db, () => errore(righe(db, `SELECT * FROM ${t}`)));
      check(/permission denied/.test(e || ''), `anon non legge ${t}`, e);
      const w = await comeAnon(db, () => errore(db.query(`DELETE FROM ${t}`)));
      check(w !== null, `anon non cancella da ${t}`, w);
    }
    check(Array.isArray(await comeAnon(db, () => righe(db, `SELECT * FROM rituali_pubblici`))), 'anon legge rituali_pubblici');
    check(Array.isArray(await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidA', 'Ada'), p_lat: 1, p_lng: 1 }))), 'le RPC funzionano a tabelle chiuse');
  }, { con35a: true, con36a: true, con36b: true });

  sezione('B2. conversione partite e niente più grezzo', async (db) => {
    // DB con 36a: inserire una partita ('sidA','sidB', ended_by 'sidA'), poi applicaFile(db, F36B):
    // user1_id = pub(A), user2_id = pub(B), ended_by = pub(A); una partita già pubblica resta uguale.
    // telepatia_risolvi(NULL, 'sidB') con B online → o_sid NULL; con pub(B) → 'sidB'.
    // respond con partita a lati grezzi → match_non_valido.
    // 36b applicata due volte: nessun errore, nessun doppio prefisso.
  }, { con35a: true, con36a: true });
  ```
  Tradurre i commenti di B2 in `check(...)` come nel Task 2.
- [ ] **Step 2: verificare che falliscano.**
- [ ] **Step 3: `36b_chiudi_chiavi.sql`.** Intestazione con l'avvertenza «applicare ≥10 minuti dopo il deploy dell'app nuova (max-age=600)». Contenuto:
  ```sql
  BEGIN;
  -- Partite: i session_id diventano id pubblici (oggi 7 righe). ended_by lo scrive l'app.
  UPDATE telepathy_matches SET user1_id = id_pubblico(user1_id) WHERE user1_id NOT LIKE 'pub\_%';
  UPDATE telepathy_matches SET user2_id = id_pubblico(user2_id) WHERE user2_id NOT LIKE 'pub\_%';
  UPDATE telepathy_matches SET ended_by = id_pubblico(ended_by) WHERE ended_by IS NOT NULL AND ended_by NOT LIKE 'pub\_%';
  -- Tabelle chiuse: RLS resta accesa, nessuna policy, nessun privilegio all'app.
  DROP POLICY IF EXISTS "Allow all" ON public.online_users;
  DROP POLICY IF EXISTS "Enable all for users" ON public.online_users;
  REVOKE ALL ON public.online_users FROM PUBLIC, anon, authenticated;
  DROP POLICY IF EXISTS "Allow all" ON public.telepathy_queue;
  DROP POLICY IF EXISTS "Enable all for telepathy" ON public.telepathy_queue;
  REVOKE ALL ON public.telepathy_queue FROM PUBLIC, anon, authenticated;
  DROP POLICY IF EXISTS rituals_select_public ON public.rituals;
  REVOKE ALL ON public.rituals FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON public.rituali_correnti FROM PUBLIC, anon, authenticated;
  -- poi: CREATE OR REPLACE di telepatia_risolvi, telepatia_in_training, respond_telepathy_invite,
  -- aggiorna_presenza con i confronti solo su id_pubblico (righe marcate -- 36b:), stessi GRANT.
  NOTIFY pgrst, 'reload schema';
  COMMIT;
  ```
  Attenzione: l'indice unico `telepathy_matches_pair_unique` (least/greatest) potrebbe urtare se esistono due righe della stessa coppia, una grezza e una pubblica. Prima degli UPDATE: `DELETE FROM telepathy_matches m WHERE m.ended_at IS NOT NULL AND m.user1_id NOT LIKE 'pub\_%' AND EXISTS (…stessa coppia in forma pubblica…)`, oppure più semplice e accettabile: cancellare le partite **concluse** non convertite (`ended_at IS NOT NULL AND user1_id NOT LIKE 'pub\_%'`) prima di convertire le vive. Coprire con un check in B2.
  **Verificare** prima, sul catalogo live o con `pg_policies` del DB vero (lo fa il controller, che ha `.env.local`), i nomi esatti delle policy: dal catalogo del 09/10 sono `"Allow all"` e `"Enable all for users"` su online_users, `"Allow all"` e `"Enable all for telepathy"` su telepathy_queue, `rituals_select_public` su rituals.
- [ ] **Step 4: `36b_ritorno.sql`.** Ricrea le policy e i privilegi esattamente come prima (stesse policy `FOR ALL TO public USING (true) WITH CHECK (true)` e `GRANT ALL … TO anon, authenticated` su online_users/telepathy_queue; `rituals_select_public` FOR SELECT TO anon/ public come nel catalogo e `GRANT SELECT`; `GRANT SELECT ON rituali_correnti`), ripristina le versioni 36a delle quattro funzioni. Le partite convertite restano pubbliche (lo dice in testa). Test `R2`: dopo il ritorno anon rilegge `online_users` e `rituals`; idempotente.
- [ ] **Step 5: tutte le suite SQL verdi** (elenco del Task 2, Step 5).
- [ ] **Step 6: commit.** `feat(chiavi): 36b chiude presenze, coda e rituali; converte le partite`.

---

### Task 4: l'app usa l'id pubblico e le RPC

**Files:**
- Modify: `src/app.jsx` (poi `node build.js` → `app.js`, va committato anche `app.js`)
- Modify: `test-partecipa-subito.js`, `test-push-ui.js`, `test-telepathy.js` (letture dirette di `rituals`/`online_users`/`telepathy_queue` con chiave anon)

**Interfaces:**
- Consumes: le RPC dei Task 1–2 (nomi e parametri esatti sopra); la vista `rituali_pubblici`.
- Produces: nell'app, `myPublicId` (stringa `pub_…` o null) disponibile ovunque si confrontava `sessionId`.

Regola unica: **il mio `sessionId` viaggia solo come parametro `p_session_id` (o `p_creator_id`, `p_ritual_id`… delle RPC esistenti). Ovunque si confronta con dati di altri o si scrive in una tabella pubblica, si usa `myPublicId`.**

- [ ] **Step 1: `myPublicId`.** Accanto a `const [sessionId, setSessionId]` (oggi ~riga 1899): `const [myPublicId, setMyPublicId] = useState(null);` e un `useEffect([sessionId])` che chiama `supabase.rpc('mio_id_pubblico', { p_session_id: sessionId })` e fa `setMyPublicId(data || null)`; in caso di errore riprova al giro successivo (un `setTimeout` di 5 s, al massimo 5 volte). Più un `myPublicIdRef` come gli altri ref di sessione, per i callback negli intervalli.
- [ ] **Step 2: presenze** (oggi ~2367–2455): `updatePresence` chiama `supabase.rpc('aggiorna_presenza', { p_session_id, p_password_hash: passwordHashRef.current || null, p_nickname: nickname || 'Anonymous', p_lat: myLat, p_lng: myLng })`; la lista restituita sostituisce `data` di `select('*')` (stesso dedup per nickname); `busy` arriva già dal server: togliere la lettura di `telepathy_matches` fatta solo per `busyIds`; il fallback «almeno me stesso» usa `{ id: myPublicId, … }`. All'uscita: `supabase.rpc('esci_presenza', { p_session_id: sessionId, p_password_hash: passwordHashRef.current || null })`. Le tre letture del partner (~3328, ~3781, ~4013) → `supabase.rpc('presenza_di', { p_id_pubblico: partner.id })`, il risultato (timestamp o null) prende il posto di `pu[0].last_seen` / `presence[0]`.
- [ ] **Step 3: coda** (~2509–2664, ~3546): `delete().lt('timestamp', …)` → sparisce (la pulizia è nel server); `delete().eq('id', sessionId)` → `rpc('coda_esci', { p_session_id: sessionId, p_password_hash })`; `select('*').neq('id', sessionId)` → `rpc('coda_leggi', { p_session_id: sessionId })`; `upsert({...})` → `rpc('coda_entra', { p_session_id, p_password_hash, p_nickname })`; `delete().eq('id', available.id)` (~2638, togliere l'altro dalla coda) → si toglie: l'altro esce da sé quando vede la partita, e in ogni caso dopo 60 s; `select('*')` di `allQueue` (~2650) → `coda_leggi` più il controllo che io ci sia ancora va fatto confrontando con… niente: se serve sapere se sono in coda, tenere uno stato locale `inCoda`. Leggere bene il flusso prima di toccarlo e mantenerne il comportamento.
- [ ] **Step 4: partite.** Ogni `user1_id === sessionId`, `user2_id === sessionId`, `user2_id: sessionId` (insert), `ended_by !== sessionId`, `p_ended_by: sessionId`, `mySlot` (~1909) → `myPublicId` (o `myPublicIdRef.current` nei callback). Se `myPublicId` è null il gioco casuale e gli inviti non partono (disabilitare i bottoni come quando non c'è nickname). `partner.id` e `invito.from_id` sono già pubblici (vengono da `aggiorna_presenza`, `coda_leggi`, `get_my_telepathy_invites`): non cambiano. Un `partner` salvato in localStorage da una versione vecchia ha un id grezzo: `presenza_di` restituisce null → si comporta come «partner offline», va bene.
- [ ] **Step 5: rituali.** `from('rituali_correnti')` (~2460, ~4697) → `from('rituali_pubblici')`; `participants.includes(sessionId)`, `candles.includes(sessionId)`, `candles_nomi[...]`, `creator_id === sessionId` → `myPublicId`; l'aggiornamento ottimistico dopo `join_ritual` (~4683) aggiunge `myPublicId`; la creazione (~4422–4430) che costruisce l'oggetto locale con `creator_id: sessionId, participants: [sessionId]` → `myPublicId` nell'oggetto locale, ma `p_creator_id: sessionId` nella RPC resta. Togliere l'abbonamento realtime `rituals-channel` (~2492) e la sua `removeChannel`.
- [ ] **Step 6: controllo meccanico.** `grep -n "sessionId" src/app.jsx` e passare ogni riga: deve essere un parametro di RPC (`p_session_id`, `p_creator_id`…), una scrittura in localStorage, o un confronto col **mio** stato locale. Nessun `from('online_users'|'telepathy_queue'|'rituali_correnti'|'rituals')` deve restare: `grep -c` = 0.
- [ ] **Step 7: test UI che leggono le tabelle chiuse.** In `test-partecipa-subito.js`, `test-push-ui.js`, `test-telepathy.js` le letture con chiave anon di `rituals`/`rituali_correnti`/`online_users`/`telepathy_queue` diventano letture con chiave di servizio (`serviceFetch` di `test-helpers.js`) se il test controlla dati interni (es. `participants` grezzi), oppure di `rituali_pubblici` se controlla ciò che vede l'app.
- [ ] **Step 8: build e prova.** `node build.js`; poi — **solo dopo che il controller ha applicato la 36a sul DB vero** — servire il worktree in locale (`npx serve -l 4321 .`, verificare la riga «Accepting connections at …:4321»; su Windows un server orfano apre in silenzio un'altra porta) e lanciare, con i test muti e il preload del `.env`: `test-telepathy.js`, `test-telepathy-session-end.js`, `test-telepathy-role-rotation.js`, `test-telepathy-stats.js`, `test-inviti-telepatia.js`, `test-inviti-offline-ui.js`, `test-rituali.js`, `test-rituali-candele.js`, `test-rituali-ricorrenti-ui.js`, `test-rituali-cancellazione-ui.js`, `test-partecipa-subito.js`, `test-moderazione-ui.js`, `test-coscienza.js`, `test-account-gdpr.js`, `test-ospite-identita.js`, `test-merge-guest.js`, `test-push-ui.js`. A gruppi piccoli e con un server nuovo se cade. Un rosso va capito (test vecchio che legge una tabella chiusa? flusso cambiato?) prima di correggerlo; `test-coscienza` «Commento appare subito in UI di B» è un difetto preesistente e intermittente (handoff 09/10), non va inseguito qui.
- [ ] **Step 9: commit.** `feat(chiavi): l'app riconosce le persone con l'id pubblico` (con `app.js`).

---

### Task 5: sonda dal vivo

**Files:**
- Create: `scripts/sonda-chiavi.js`

**Interfaces:**
- Consumes: chiave anon (in `app.html`), RPC pubbliche dei Task 1–2, `test-helpers.js` (`serviceFetch`) solo per la pulizia.
- Produces: comando `node scripts/sonda-chiavi.js` che stampa una riga per controllo e `Risultato: N passati, M falliti`; esce con codice 1 se qualcosa fallisce.

- [ ] **Step 1: scrivere la sonda.** Con un ospite di prova `sid = 'sonda-' + Date.now() + '-' + Math.random()`: `aggiorna_presenza`, `coda_entra`, creazione di un rituale di prova con `create_ritual` (parametri come in `test-rituali.js`) e `join_ritual` di un secondo ospite, `toggle_ritual_candle`. Poi legge, **con la sola chiave anon**: ogni tabella e vista dell'elenco `['online_users','telepathy_queue','telepathy_matches','rituals','rituali_correnti','rituali_pubblici','telepathy_invites','notifications','profiles','push_subscriptions','telepathy_trials','telepathy_scores','ritual_comments','consciousness_posts','consciousness_comments','telepathy_chat','user_blocks','content_reports']` con `?select=*` (un 401/42501 conta come «non leggibile», va bene), e le RPC `aggiorna_presenza` e `coda_leggi` **chiamate da un secondo ospite**. Controllo: la stringa `sid` (e quella del secondo ospite) non compare in nessuna risposta. In più: SELECT/INSERT/PATCH/DELETE anon su `online_users`, `telepathy_queue`, `rituals` → 42501 (questa parte ha senso solo dopo la 36b: flag `--dopo-36b`).
- [ ] **Step 2: pulizia** con `serviceFetch` (rituale, presenze, coda) e controllo che non resti nulla; la pulizia gira anche se un controllo fallisce (`finally`).
- [ ] **Step 3: commit.** `test(chiavi): sonda dal vivo, nessun session_id leggibile`.

---

### Rilascio (lo fa il controller, non un sub-agente)

1. Revisione indipendente dell'intero ramo (sub-agente), rilievi chiusi.
2. Applicare `36a_chiavi_server.sql` sul DB vero (`node scripts/apply-sql.js ../wt-chiavi/supabase/sql/36a_chiavi_server.sql` da `global-awakening/`), verificare: funzioni presenti, `rituali_pubblici` leggibile da anon, `id_pubblico` non eseguibile da anon, l'app **vecchia** online funziona (test UI contro il sito vero, tecnica delle copie in scratchpad).
3. Test UI del Task 4, Step 8 (app nuova in locale, 36a live).
4. Push del ramo, PR, merge (comando singolo), attesa del deploy (sha1 di `app.js` live = ramo), ~10 minuti.
5. Applicare `36b_chiudi_chiavi.sql`; `node scripts/sonda-chiavi.js --dopo-36b`; suite UI principali contro il sito vero.
6. Handoff, diario del progetto, memoria.
