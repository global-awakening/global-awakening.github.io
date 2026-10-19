# Motore della telepatia chiuso — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** partite e chat della telepatia leggibili e modificabili solo dai due giocatori, attraverso RPC SECURITY DEFINER. Chi indovina non vede il simbolo prima di rispondere. Il gioco resta identico.

**Architecture:** migration additiva `39a` con le funzioni-guardiano e la chat legata alla partita (FK in cascata). Stesso rilascio: l'app passa a usare solo le RPC. Almeno 10 minuti dopo, la migration `39b` chiude le tabelle. Ogni migration ha il suo `_ritorno`. La logica di tempo resta nel client.

**Tech Stack:** Postgres/Supabase (plpgsql), PGlite per i test SQL (`scripts/pg-locale.js`), React in `src/app.jsx` compilato con `node build.js` in `app.js`, client PostgREST fatto a mano in `app.html` (`supabase.rpc` restituisce `{data, error}` e non solleva mai), Playwright per i test UI.

**Spec:** `docs/superpowers/specs/2026-10-13-motore-telepatia-chiuso-design.md`

## Global Constraints

- Ogni RPC pubblica: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`, poi `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` e `GRANT EXECUTE … TO anon, authenticated;`. Gli helper interni hanno solo il REVOKE.
- Identità: `chiavi_sid_valido(p_session_id)` + `telepatia_verifica_identita(p_session_id, p_password_hash)`. «Io» nella partita = `id_pubblico(p_session_id)`.
- Le RPC del polling non sollevano mai errori e restituiscono `NULL`. Chi non è giocatore riceve la stessa risposta di una partita inesistente.
- Ruolo effettivo = ruolo base, scambiato quando `(round_count / 3) % 2 = 1` (stesso `roleForRound` di `src/app.jsx:1784`).
- Livelli ammessi: `lvl3`, `lvl5`, `lvl7`, `lvl9`, `numbers`, `words`. Simbolo e risposta: da 1 a 64 caratteri. Chat: testo `btrim` da 1 a 500 caratteri.
- Finestre di pulizia invariate: partite chiuse da più di 60 s, ferme da più di 10 minuti, mai giocate e nate da più di 5 minuti. Coda fresca = 60 s.
- Nei file versionati non si scrive mai per intero il nome del ruolo di servizio di Supabase (lo blocca l'hook pre-commit): si dice «chiave di servizio», come fa `pg-locale.js` con `RUOLO_SERVIZIO`.
- Ogni test si lancia con `NODE_OPTIONS="--require ./scripts/test-silenzioso.js"`: niente audio, finestre fuori schermo.
- Nessun refactor di `app.jsx` oltre agli accessi elencati nella spec. Niente realtime, niente job cron nuovi.
- Su git: si lavora sul ramo `feat/motore-telepatia-chiuso`, mai push su `main`, e prima di ogni push o merge si dice a Irene cosa si sta per fare.

## Review Focus

1. **Doppio abbinamento simultaneo.** A sceglie B mentre B sceglie A, o C sceglie B nello stesso istante: deve nascere una partita sola e nessuno deve finire in due. Test di idempotenza in Task 2; la concorrenza vera la coprono il lock e l'indice unico.
2. **Rientro della stessa coppia subito dopo una partita** («Gioca ancora», nuovo invito): la partita chiusa da pochi secondi non deve far fallire la nuova sul vincolo `telepathy_matches_pair_unique`. Test in Task 2.
3. **Il ricevente cambia ruolo al confine dei 3 round mentre il DB è ancora al round precedente.** Il simbolo va nascosto in base al round del DB, non a quello locale. Test in Task 1 (vista ai round 2 e 3).
4. **Errore di rete durante il polling.** Oggi un errore della select fa sembrare la partita finita. Con le RPC, `error` vuol dire «riprova», e solo `data === null` vuol dire «partita sparita». Test di sorgente in Task 6.
5. **Mittente ostile in chat.** Un nome falso o un testo enorme non devono passare: il nome lo mette il server, la lunghezza è limitata. Test in Task 3.

---

## File

- Create: `supabase/sql/39a_motore_telepatia.sql`, `supabase/sql/39a_ritorno.sql`, `supabase/sql/39b_chiudi_telepatia.sql`, `supabase/sql/39b_ritorno.sql`
- Create: `test-motore-telepatia-sql.js` (PGlite), `scripts/sonda-telepatia.js` (DB vero)
- Modify: `scripts/pg-locale.js` (schema `telepathy_chat`, 14_, opzioni `con39a`/`con39b`)
- Modify: `src/app.jsx` (circa 30 accessi), poi `node build.js` → `app.js`
- Modify: `test-telepathy-gating.js` (adeguare ai nuovi accessi), `test-telepathy-session-end.js` (riscritto su `partita_esci`)

---

### Task 1: fondamenta della 39a (PGlite, chat legata, vista, partita_mia/partita_stato)

**Files:**
- Modify: `scripts/pg-locale.js`
- Create: `supabase/sql/39a_motore_telepatia.sql` (prima parte)
- Create: `test-motore-telepatia-sql.js`

**Interfaces:**
- Produces (helper interni): `partita_io(p_session_id text, p_password_hash text) → text`, `partita_ruolo(m telepathy_matches, p_io text) → text`, `partita_vista(m telepathy_matches, p_io text) → jsonb`, `partite_pulizia() → void`, `partita_viva_di(p_io text) → telepathy_matches` (riga o NULL)
- Produces (RPC): `partita_mia(p_session_id text, p_password_hash text) → jsonb|null`, `partita_stato(p_session_id text, p_password_hash text, p_match_id uuid) → jsonb|null`
- Vista (jsonb): `id, created_at, user1_id, user1_nickname, user1_role, user2_id, user2_nickname, user2_role, level, round_count, level_change_choice_sender, sender_symbol, simbolo_inviato, receiver_guess, ended_at, ended_by, giocato, da_invito`
- `pg-locale.js` esporta in più `F14, F39A, F39B` e `creaDbTelepatia({ …, con39a, con39b })`

- [ ] **Step 1: schema locale.** In `SCHEMA_TELEPATIA` di `scripts/pg-locale.js`, dopo `telepathy_matches`, aggiungi la chat com'è sul DB vero (catalogo 13/10: RLS spenta, tre policy inerti, privilegi pieni):

```js
  -- Come sul DB vero (catalogo 13/10): RLS SPENTA, tre policy auth.uid() inerti, privilegi pieni.
  CREATE TABLE telepathy_chat (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id text NOT NULL,
    sender_name text NOT NULL, content text NOT NULL, created_at timestamptz DEFAULT now());
  GRANT ALL ON telepathy_chat TO anon, authenticated;
```

Le tre policy vanno create **dopo** `CREATE SCHEMA auth` / `auth.uid()` (che nello schema viene più giù): aggiungile subito dopo `CREATE OR REPLACE FUNCTION auth.uid()`:

```js
  CREATE POLICY "Solo i partecipanti possono leggere la chat" ON telepathy_chat FOR SELECT TO public
    USING (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id
      AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
  CREATE POLICY "Solo i partecipanti possono inviare messaggi" ON telepathy_chat FOR INSERT TO public
    WITH CHECK (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id
      AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
  CREATE POLICY "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat FOR DELETE TO public
    USING (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id
      AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
```

Sulle partite, come sul DB vero, aggiungi la RLS con le due policy `Allow all` (oggi lo schema locale ha solo i GRANT):

```js
  ALTER TABLE telepathy_matches ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow all" ON telepathy_matches FOR ALL TO public USING (true) WITH CHECK (true);
  CREATE POLICY "Allow all for anon" ON telepathy_matches FOR ALL TO public USING (true) WITH CHECK (true);
```

Poi le costanti e le opzioni:

```js
const F14 = 'supabase/sql/14_telepathy_session_end.sql';
const F39A = 'supabase/sql/39a_motore_telepatia.sql';
const F39B = 'supabase/sql/39b_chiudi_telepatia.sql';
```

In `creaDbTelepatia` aggiungi i parametri `con39a = false, con39b = false` e, in fondo, prima del `return db`:

```js
  // 39a/39b stanno sopra la catena 36a/36b (id pubblici) e usano end_telepathy_match della 14_.
  if (con39a) { await applicaFile(db, F14); await applicaFile(db, F39A); }
  if (con39a && con39b) await applicaFile(db, F39B);
```

Esporta `F14, F39A, F39B`. Lancia `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-chiavi-nascoste-sql.js` e `node test-inviti-offline-sql.js`: devono restare verdi come prima. Le policy nuove sulle partite non cambiano niente: `Allow all` lascia passare tutto.

- [ ] **Step 2: test che falliscono.** Crea `test-motore-telepatia-sql.js` con lo stesso impianto di `test-chiavi-nascoste-sql.js` (righe 1-30: `check`, `errore`, `righe`, `uno`, `chiama`, `comeAnon`, `pub`, `sezione`, esecuzione finale identica, con `creaDbTelepatia(opzioni)`). Opzioni di default: `{ con35a: true, con36a: true, con36b: true, con39a: true }`. Aggiungi questi helper:

```js
const { creaDbTelepatia, applicaFile, F39A, F39B } = require('./scripts/pg-locale');
const IO = (sid, pw = null) => ({ p_session_id: sid, p_password_hash: pw });
// Una partita scritta direttamente (come farebbe un'app vecchia), con gli id pubblici.
const partita = async (db, sidA, sidB, campi = {}) => {
  const c = { user1_id: await pub(db, sidA), user1_nickname: 'Ada', user1_role: 'sender',
              user2_id: await pub(db, sidB), user2_nickname: 'Bea', user2_role: 'receiver', level: 'lvl3', round_count: 0, ...campi };
  const k = Object.keys(c);
  return (await uno(db, `INSERT INTO telepathy_matches (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, k.map((x) => c[x]))).id;
};
```

Le sezioni di questo task:

```js
sezione('F1. chat legata alla partita', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  await db.query(`INSERT INTO telepathy_chat (match_id, sender_name, content) VALUES ($1, 'Ada', 'ciao')`, [m]);
  await db.query(`DELETE FROM telepathy_matches WHERE id = $1`, [m]);
  check((await righe(db, `SELECT 1 FROM telepathy_chat`)).length === 0, 'cancellando la partita sparisce anche la chat');
  const tipo = await uno(db, `SELECT data_type FROM information_schema.columns WHERE table_name = 'telepathy_chat' AND column_name = 'match_id'`);
  check(tipo.data_type === 'uuid', 'match_id è uuid', tipo);
  const e = await comeAnon(db, () => errore(db.query(`INSERT INTO telepathy_chat (match_id, sender_name, content) VALUES (gen_random_uuid(), 'X', 'y')`)));
  check(e !== null, 'non si scrive chat per una partita inesistente', e);
}, { con35a: true, con36a: true, con36b: true, con39a: false });
```

`F1` gira **senza** 39a e prima applica a mano due messaggi orfani, per provare che la 39a li ripulisce:

```js
// (dentro F1, PRIMA di tutto il resto)
  await db.query(`INSERT INTO telepathy_chat (match_id, sender_name, content) VALUES ('non-un-uuid', 'X', 'a'), (gen_random_uuid()::text, 'Y', 'b')`);
  await applicaFile(db, 'supabase/sql/14_telepathy_session_end.sql');
  await applicaFile(db, F39A);
  check((await righe(db, `SELECT 1 FROM telepathy_chat`)).length === 0, 'la 39a toglie i messaggi orfani (anche con match_id non uuid)');
  check(!(await errore(applicaFile(db, F39A))), 'la 39a si riapplica senza errori');
```

```js
sezione('F2. vista: simbolo nascosto a chi indovina', async (db) => {
  const m = await partita(db, 'sidA', 'sidB', { sender_symbol: 'stella' });   // round 0: A manda, B indovina
  const vA = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidA'), p_match_id: m }));
  const vB = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidB'), p_match_id: m }));
  check(vA.sender_symbol === 'stella', 'chi manda vede il proprio simbolo', vA);
  check(vB.sender_symbol === null && vB.simbolo_inviato === true, 'chi indovina: simbolo nascosto, ma sa che è stato inviato', vB);
  await db.query(`UPDATE telepathy_matches SET receiver_guess = 'luna' WHERE id = $1`, [m]);
  const vB2 = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidB'), p_match_id: m }));
  check(vB2.sender_symbol === 'stella' && vB2.receiver_guess === 'luna', 'dopo la risposta il simbolo arriva a entrambi', vB2);
  // Round 3: i ruoli si scambiano. Ora B manda, A indovina.
  await db.query(`UPDATE telepathy_matches SET round_count = 3, sender_symbol = 'sole', receiver_guess = NULL WHERE id = $1`, [m]);
  const vA3 = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidA'), p_match_id: m }));
  const vB3 = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidB'), p_match_id: m }));
  check(vA3.sender_symbol === null && vB3.sender_symbol === 'sole', 'round 3: ruoli scambiati, nascosto ad A', { vA3, vB3 });
  // Round 2 (ultimo del primo blocco): ancora A manda.
  await db.query(`UPDATE telepathy_matches SET round_count = 2 WHERE id = $1`, [m]);
  const vB2b = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidB'), p_match_id: m }));
  check(vB2b.sender_symbol === null, 'round 2: B indovina ancora', vB2b);
  const chiavi = Object.keys(vA).sort().join(',');
  check(chiavi === 'created_at,da_invito,ended_at,ended_by,giocato,id,level,level_change_choice_sender,receiver_guess,round_count,sender_symbol,simbolo_inviato,user1_id,user1_nickname,user1_role,user2_id,user2_nickname,user2_role',
    'la vista ha esattamente le colonne dell\'app più simbolo_inviato', chiavi);
});

sezione('F3. estranei e identità', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  check(await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidC'), p_match_id: m })) === null, 'un estraneo non vede la partita');
  check(await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidA'), p_match_id: '00000000-0000-0000-0000-000000000000' })) === null, 'partita inesistente: stessa risposta');
  check(await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO(await pub(db, 'sidA')), p_match_id: m })) === null, 'un id pubblico al posto del session_id non vale');
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('sidR', 'Rosa', 'r@test.com', 'h1')`);
  const mR = await partita(db, 'sidR', 'sidB');
  check(await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidR', 'sbagliata'), p_match_id: mR })) === null, 'iscritta con password sbagliata: null, nessun errore');
  check((await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidR', 'h1'), p_match_id: mR }))).id === mR, 'iscritta con password giusta: vede');
});

sezione('F4. partita_mia e pulizia', async (db) => {
  check(await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidA'))) === null, 'nessuna partita: null');
  const m = await partita(db, 'sidA', 'sidB');
  check((await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidB')))).id === m, 'B trova la partita creata per lui');
  await db.query(`UPDATE telepathy_matches SET da_invito = true WHERE id = $1`, [m]);
  check(await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidB'))) === null, 'un orfano d\'invito mai giocato non è «la mia partita»');
  await db.query(`DELETE FROM telepathy_matches`);
  const chiusa = await partita(db, 'sidA', 'sidB');
  await db.query(`UPDATE telepathy_matches SET ended_at = now() - interval '61 seconds' WHERE id = $1`, [chiusa]);
  const ferma = await partita(db, 'sidC', 'sidD');
  await db.query(`ALTER TABLE telepathy_matches DISABLE TRIGGER telepathy_matches_attivita`);
  await db.query(`UPDATE telepathy_matches SET ultima_attivita = now() - interval '11 minutes', giocato = true WHERE id = $1`, [ferma]);
  const orfana = await partita(db, 'sidE', 'sidF');
  await db.query(`UPDATE telepathy_matches SET created_at = now() - interval '6 minutes', giocato = false WHERE id = $1`, [orfana]);
  const lunga = await partita(db, 'sidG', 'sidH');
  await db.query(`UPDATE telepathy_matches SET created_at = now() - interval '20 minutes', giocato = true WHERE id = $1`, [lunga]);
  await db.query(`ALTER TABLE telepathy_matches ENABLE TRIGGER telepathy_matches_attivita`);
  await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidZ')));
  const resta = (await righe(db, `SELECT id FROM telepathy_matches`)).map((r) => r.id);
  check(JSON.stringify(resta) === JSON.stringify([lunga]), 'pulizia: via chiuse >60 s, ferme >10 min, orfane >5 min; resta il training lungo ma attivo', resta);
});
```

- [ ] **Step 3: lancia e verifica che fallisce.** `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-motore-telepatia-sql.js`. Atteso: eccezioni con `file non trovato` o `function partita_stato does not exist`.

- [ ] **Step 4: scrivi la prima parte di `supabase/sql/39a_motore_telepatia.sql`.**

```sql
-- 39a — il motore della telepatia passa dal server (additiva: le tabelle restano aperte, le chiude la 39b).
-- Spec: docs/superpowers/specs/2026-10-13-motore-telepatia-chiuso-design.md
-- Ogni funzione verifica chi chiama: solo i due giocatori di una partita la vedono o la toccano.
-- Ritorno: 39a_ritorno.sql.

-- ════ A. Chat legata alla partita ═════════════════════════════════════════════
-- Messaggi orfani (partita già cancellata, o match_id che non è nemmeno un uuid): via, poi FK in cascata.
DELETE FROM telepathy_chat c
 WHERE c.match_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT EXISTS (SELECT 1 FROM telepathy_matches m WHERE m.id::text = c.match_id::text);
ALTER TABLE telepathy_chat ALTER COLUMN match_id TYPE uuid USING match_id::text::uuid;
ALTER TABLE telepathy_chat DROP CONSTRAINT IF EXISTS telepathy_chat_match_fk;
ALTER TABLE telepathy_chat ADD CONSTRAINT telepathy_chat_match_fk
  FOREIGN KEY (match_id) REFERENCES telepathy_matches(id) ON DELETE CASCADE;

-- ════ B. Helper interni ═══════════════════════════════════════════════════════
-- Il mio id pubblico se l'identità regge, altrimenti NULL (mai un errore: il polling gira ogni 2 s).
CREATE OR REPLACE FUNCTION public.partita_io(p_session_id text, p_password_hash text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT chiavi_sid_valido(p_session_id) THEN RETURN NULL; END IF;
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  RETURN id_pubblico(p_session_id);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.partita_io(text, text) FROM PUBLIC, anon, authenticated;

-- Ruolo effettivo nel round corrente: lo stesso roleForRound dell'app (scambio ogni 3 round).
CREATE OR REPLACE FUNCTION public.partita_ruolo(m telepathy_matches, p_io text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN b.base IS NULL THEN NULL
              WHEN (coalesce(m.round_count, 0) / 3) % 2 = 0 THEN b.base
              WHEN b.base = 'sender' THEN 'receiver' ELSE 'sender' END
    FROM (SELECT CASE WHEN p_io = m.user1_id THEN m.user1_role
                      WHEN p_io = m.user2_id THEN m.user2_role END AS base) b;
$$;
REVOKE ALL ON FUNCTION public.partita_ruolo(telepathy_matches, text) FROM PUBLIC, anon, authenticated;

-- Le colonne che l'app usa. Il simbolo resta nascosto a chi indovina finché non ha risposto.
CREATE OR REPLACE FUNCTION public.partita_vista(m telepathy_matches, p_io text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'created_at', m.created_at,
    'user1_id', m.user1_id, 'user1_nickname', m.user1_nickname, 'user1_role', m.user1_role,
    'user2_id', m.user2_id, 'user2_nickname', m.user2_nickname, 'user2_role', m.user2_role,
    'level', m.level, 'round_count', coalesce(m.round_count, 0),
    'level_change_choice_sender', m.level_change_choice_sender,
    'sender_symbol', CASE WHEN partita_ruolo(m, p_io) = 'receiver' AND m.receiver_guess IS NULL
                          THEN NULL ELSE m.sender_symbol END,
    'simbolo_inviato', m.sender_symbol IS NOT NULL,
    'receiver_guess', m.receiver_guess,
    'ended_at', m.ended_at, 'ended_by', m.ended_by, 'giocato', m.giocato, 'da_invito', m.da_invito);
$$;
REVOKE ALL ON FUNCTION public.partita_vista(telepathy_matches, text) FROM PUBLIC, anon, authenticated;

-- Le tre pulizie che faceva findPartner sulle partite di chiunque (stesse finestre).
CREATE OR REPLACE FUNCTION public.partite_pulizia() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM telepathy_matches
   WHERE ended_at < now() - interval '60 seconds'
      OR ultima_attivita < now() - interval '10 minutes'
      OR (NOT giocato AND created_at < now() - interval '5 minutes');
$$;
REVOKE ALL ON FUNCTION public.partite_pulizia() FROM PUBLIC, anon, authenticated;

-- «Viva» per l'abbinamento, come il vivo() di findPartner: non chiusa e non un orfano d'invito mai giocato.
CREATE OR REPLACE FUNCTION public.partita_viva_di(p_io text) RETURNS telepathy_matches
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM telepathy_matches
   WHERE (user1_id = p_io OR user2_id = p_io) AND ended_at IS NULL AND NOT (da_invito AND NOT giocato)
   ORDER BY created_at LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.partita_viva_di(text) FROM PUBLIC, anon, authenticated;

-- ════ C. Lettura ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.partita_mia(p_session_id text, p_password_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  IF v_io IS NULL THEN RETURN NULL; END IF;
  PERFORM partite_pulizia();
  m := partita_viva_di(v_io);
  IF m.id IS NULL THEN RETURN NULL; END IF;
  RETURN partita_vista(m, v_io);
END $$;
REVOKE ALL ON FUNCTION public.partita_mia(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_mia(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.partita_stato(p_session_id text, p_password_hash text, p_match_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  IF v_io IS NULL OR p_match_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO m FROM telepathy_matches WHERE id = p_match_id AND (user1_id = v_io OR user2_id = v_io);
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN partita_vista(m, v_io);
END $$;
REVOKE ALL ON FUNCTION public.partita_stato(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_stato(text, text, uuid) TO anon, authenticated;
```

- [ ] **Step 5: lancia e verifica che passa.** Stesso comando. Atteso: F1-F4 tutti ✅, `0 falliti`. Rilancia anche `test-chiavi-nascoste-sql.js` e `test-inviti-offline-sql.js`: devono restare verdi.

- [ ] **Step 6: commit.**

```bash
git add scripts/pg-locale.js supabase/sql/39a_motore_telepatia.sql test-motore-telepatia-sql.js
git commit -m "39a: chat legata alla partita, vista con simbolo nascosto, partita_mia/partita_stato"
```

---

### Task 2: nascita della partita (coda, invito, ingresso di chi ha invitato)

**Files:**
- Modify: `supabase/sql/39a_motore_telepatia.sql` (in coda)
- Modify: `test-motore-telepatia-sql.js`

**Interfaces:**
- Consumes: `partita_io`, `partita_vista`, `partite_pulizia`, `partita_viva_di` (Task 1). Dalle migration esistenti: `chiavi_chi_sono(text,text,text)`, `telepatia_bloccati(text,text,text,text)`, `telepatia_verifica_identita`, `respond_telepathy_invite(uuid,text,text,boolean,uuid)` (36b, **non si modifica**)
- Produces: `partita_blocca(a text, b text) → void` (interno); `partita_crea_da_coda(p_session_id text, p_password_hash text, p_nickname text, p_altro text) → jsonb` `{ok, partita?|motivo?}` con `motivo ∈ dati_non_validi|non_in_coda|occupato|bloccato`; `accetta_invito_partita(p_invite_id uuid, p_session_id text, p_password_hash text) → jsonb` (risposta di `respond_telepathy_invite`, più `partita` quando `ok`); `partita_entra(p_session_id text, p_password_hash text, p_match_id uuid) → jsonb` `{ok, partita?}`

- [ ] **Step 1: test che falliscono.** Aggiungi in `test-motore-telepatia-sql.js`:

```js
const inCoda = (db, sid, nick, secondiFa = 0) => db.query(
  `INSERT INTO telepathy_queue (id, nickname, timestamp) VALUES ($1, $2, (extract(epoch FROM clock_timestamp()) * 1000)::bigint - $3)`,
  [sid, nick, secondiFa * 1000]);
const crea = (db, sid, nick, altroSid) => pub(db, altroSid).then((altro) =>
  comeAnon(db, () => chiama(db, 'partita_crea_da_coda', { ...IO(sid), p_nickname: nick, p_altro: altro })));

sezione('N1. abbinamento dalla coda', async (db) => {
  await inCoda(db, 'sidA', 'Ada');
  const r = await crea(db, 'sidB', 'Bea', 'sidA');
  check(r.ok === true && r.partita.user1_id === await pub(db, 'sidA') && r.partita.user2_id === await pub(db, 'sidB'), 'B abbina A: user1 = chi era in coda', r);
  check(r.partita.user1_nickname === 'Ada' && r.partita.user2_nickname === 'Bea', 'nickname verificati', r.partita);
  check(new Set([r.partita.user1_role, r.partita.user2_role]).size === 2 && ['sender', 'receiver'].includes(r.partita.user1_role), 'ruoli opposti', r.partita);
  check(r.partita.level === 'lvl3' && r.partita.round_count === 0 && r.partita.giocato === false, 'parte da lvl3, round 0, non giocata', r.partita);
  check((await righe(db, `SELECT 1 FROM telepathy_queue`)).length === 0, 'tutti e due escono dalla coda');
  const r2 = await crea(db, 'sidB', 'Bea', 'sidA');
  check(r2.ok === true && r2.partita.id === r.partita.id, 'un secondo giro restituisce la stessa partita (niente doppioni)', r2);
  check((await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidA')))).id === r.partita.id, 'A la trova con partita_mia');
});

sezione('N2. abbinamento rifiutato', async (db) => {
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'non_in_coda', 'chi non è in coda non si abbina');
  await inCoda(db, 'sidA', 'Ada', 61);
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'non_in_coda', 'riga di coda vecchia di 61 s: non vale');
  await db.query(`DELETE FROM telepathy_queue`);
  await inCoda(db, 'sidA', 'Ada');
  await partita(db, 'sidA', 'sidC');
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'occupato', 'A è già in partita con C: occupato');
  await db.query(`DELETE FROM telepathy_matches`);
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Ada', 'Bea')`);
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'bloccato', 'blocco fra i due: niente partita');
  await db.query(`DELETE FROM user_blocks`);
  check((await crea(db, 'sidA', 'Ada', 'sidA')).motivo === 'dati_non_validi', 'non ci si abbina con sé stessi');
  check((await comeAnon(db, () => chiama(db, 'partita_crea_da_coda', { ...IO('sidB'), p_nickname: 'Bea', p_altro: null }))).motivo === 'dati_non_validi', 'altro mancante');
});

sezione('N3. stessa coppia subito dopo una partita chiusa', async (db) => {
  const vecchia = await partita(db, 'sidA', 'sidB');
  await db.query(`UPDATE telepathy_matches SET ended_at = now() WHERE id = $1`, [vecchia]);
  await inCoda(db, 'sidA', 'Ada');
  const r = await crea(db, 'sidB', 'Bea', 'sidA');
  check(r.ok === true && r.partita.id !== vecchia, 'la partita chiusa da pochi secondi non blocca la nuova', r);
});

const invita = async (db, daSid, daNome, aSid, aNome) => (await uno(db,
  `INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, expires_at) VALUES ($1, $2, $3, $4, 'pending', now() + interval '45 seconds') RETURNING id`,
  [daSid, daNome, aSid, aNome])).id;

sezione('N4. invito accettato: la partita la crea il server', async (db) => {
  const inv = await invita(db, 'sidA', 'Ada', 'sidB', 'Bea');
  const r = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv, ...IO('sidB') }));
  check(r.ok === true && r.status === 'accepted' && r.partita && r.partita.da_invito === true, 'accettato, partita da invito', r);
  check(r.partita.user1_id === await pub(db, 'sidA') && r.partita.user2_nickname === 'Bea', 'user1 = chi invita, user2 = chi accetta', r.partita);
  const i = await uno(db, `SELECT status, match_id FROM telepathy_invites WHERE id = $1`, [inv]);
  check(i.status === 'accepted' && i.match_id === r.partita.id, 'l\'invito punta alla partita', i);
  const e = await comeAnon(db, () => chiama(db, 'partita_entra', { ...IO('sidA'), p_match_id: r.partita.id }));
  check(e.ok === true && e.partita.giocato === true, 'chi ha invitato entra: la partita risulta giocata', e);
  check((await comeAnon(db, () => chiama(db, 'partita_entra', { ...IO('sidC'), p_match_id: r.partita.id }))).ok === false, 'un estraneo non entra');
});

sezione('N5. invito non più valido: nessuna partita resta', async (db) => {
  const inv = await invita(db, 'sidA', 'Ada', 'sidB', 'Bea');
  await db.query(`UPDATE telepathy_invites SET status = 'cancelled' WHERE id = $1`, [inv]);
  const r = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv, ...IO('sidB') }));
  check(r.ok === false && r.motivo === 'annullato', 'invito annullato: il motivo lo dice respond_telepathy_invite', r);
  check((await righe(db, `SELECT 1 FROM telepathy_matches`)).length === 0, 'nessuna partita rimasta');
  const inv2 = await invita(db, 'sidA', 'Ada', 'sidB', 'Bea');
  const r2 = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv2, ...IO('sidC') }));
  check(r2.ok === false && r2.motivo === 'non_trovato', 'un invito non mio: non_trovato', r2);
  // Il trigger della 32a mette giocato = false a ogni INSERT: si segna giocata con un UPDATE.
  const mD = await partita(db, 'sidA', 'sidD');
  await db.query(`UPDATE telepathy_matches SET giocato = true WHERE id = $1`, [mD]);
  const r3 = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv2, ...IO('sidB') }));
  check(r3.ok === false && r3.motivo === 'in_match', 'chi ha invitato è in training: in_match, e la partita appena creata sparisce', r3);
  check((await righe(db, `SELECT 1 FROM telepathy_matches WHERE da_invito`)).length === 0, 'nessun orfano d\'invito');
});
```

Nota per chi implementa: prima di scrivere N5 controlla in `supabase/sql/32a_inviti_telepatia_offline.sql` cosa restituisce `telepatia_motivo_stato('cancelled')` e quali colonne servono a `telepathy_invites` nello schema locale (`expires_at`, `match_id`, `responded_at` le aggiunge la 32a). Usa i valori veri nei `check`: se il motivo si chiama diversamente da `annullato`, si adegua il test, non la funzione.

- [ ] **Step 2: lancia e verifica che fallisce** (`function partita_crea_da_coda does not exist`).

- [ ] **Step 3: implementa.** In coda alla 39a:

```sql
-- ════ D. Nascita della partita ═════════════════════════════════════════════════
-- Un lock per persona, in ordine fisso: due abbinamenti simultanei sulla stessa persona si mettono in fila.
CREATE OR REPLACE FUNCTION public.partita_blocca(a text, b text) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('telepatia:' || least(a, b)));
  PERFORM pg_advisory_xact_lock(hashtext('telepatia:' || greatest(a, b)));
END $$;
REVOKE ALL ON FUNCTION public.partita_blocca(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.partita_crea_da_coda(p_session_id text, p_password_hash text, p_nickname text, p_altro text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash);
        v_nome text := chiavi_chi_sono(p_session_id, p_password_hash, p_nickname);
        v_ora bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
        q telepathy_queue; m telepathy_matches; v_ruolo text;
BEGIN
  IF v_io IS NULL OR v_nome IS NULL OR p_altro IS NULL OR p_altro = v_io THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  PERFORM partita_blocca(v_io, p_altro);
  PERFORM partite_pulizia();
  -- L'altro mi ha abbinato un istante prima: è quella la mia partita.
  m := partita_viva_di(v_io);
  IF m.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io)); END IF;
  SELECT * INTO q FROM telepathy_queue
   WHERE chiavi_sid_valido(id) AND id_pubblico(id) = p_altro AND timestamp >= v_ora - 60000;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_in_coda'); END IF;
  IF (partita_viva_di(p_altro)).id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'occupato'); END IF;
  IF telepatia_bloccati(p_session_id, v_nome, q.id, q.nickname) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'bloccato');
  END IF;
  -- Una partita chiusa della stessa coppia farebbe scattare telepathy_matches_pair_unique.
  DELETE FROM telepathy_matches
   WHERE least(user1_id, user2_id) = least(v_io, p_altro) AND greatest(user1_id, user2_id) = greatest(v_io, p_altro)
     AND ended_at IS NOT NULL;
  v_ruolo := CASE WHEN random() < 0.5 THEN 'sender' ELSE 'receiver' END;
  BEGIN
    INSERT INTO telepathy_matches (user1_id, user1_nickname, user1_role, user2_id, user2_nickname, user2_role, level, round_count)
    VALUES (p_altro, q.nickname, CASE v_ruolo WHEN 'sender' THEN 'receiver' ELSE 'sender' END,
            v_io, v_nome, v_ruolo, 'lvl3', 0)
    RETURNING * INTO m;
  EXCEPTION WHEN unique_violation THEN
    -- La coppia ha già una partita aperta (es. un orfano d'invito): non si gioca su quella.
    RETURN jsonb_build_object('ok', false, 'motivo', 'occupato');
  END;
  DELETE FROM telepathy_queue WHERE id IN (p_session_id, q.id);
  RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.partita_crea_da_coda(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_crea_da_coda(text, text, text, text) TO anon, authenticated;

-- La partita dell'invito la crea il server; poi decide la respond_telepathy_invite di sempre.
CREATE OR REPLACE FUNCTION public.accetta_invito_partita(p_invite_id uuid, p_session_id text, p_password_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v telepathy_invites; m telepathy_matches; r jsonb; v_ruolo text; v_io text; v_da text;
BEGIN
  -- Come respond_telepathy_invite: una credenziale vecchia è un errore «Auth failed» (l'app lo riconosce).
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  SELECT * INTO v FROM telepathy_invites WHERE id = p_invite_id AND to_id = p_session_id;
  IF NOT FOUND OR v.status <> 'pending' OR v.expires_at <= now() THEN
    -- Il motivo giusto (non_trovato, scaduto, annullato…) lo sa già respond_telepathy_invite.
    RETURN respond_telepathy_invite(p_invite_id, p_session_id, p_password_hash, true, NULL);
  END IF;
  v_io := id_pubblico(p_session_id); v_da := id_pubblico(v.from_id);
  PERFORM partita_blocca(v_io, v_da);
  DELETE FROM telepathy_matches
   WHERE least(user1_id, user2_id) = least(v_io, v_da) AND greatest(user1_id, user2_id) = greatest(v_io, v_da)
     AND ended_at IS NOT NULL;
  v_ruolo := CASE WHEN random() < 0.5 THEN 'sender' ELSE 'receiver' END;
  BEGIN
    INSERT INTO telepathy_matches (user1_id, user1_nickname, user1_role, user2_id, user2_nickname, user2_role, level, round_count, da_invito)
    VALUES (v_da, v.from_name, CASE v_ruolo WHEN 'sender' THEN 'receiver' ELSE 'sender' END,
            v_io, v.to_name, v_ruolo, 'lvl3', 0, true)
    RETURNING * INTO m;
  EXCEPTION WHEN unique_violation THEN
    -- Un altro telefono ha appena accettato: respond lo dice col suo motivo.
    RETURN respond_telepathy_invite(p_invite_id, p_session_id, p_password_hash, true, NULL);
  END;
  r := respond_telepathy_invite(p_invite_id, p_session_id, p_password_hash, true, m.id);
  IF NOT coalesce((r->>'ok')::boolean, false) THEN
    DELETE FROM telepathy_matches WHERE id = m.id;
    RETURN r;
  END IF;
  RETURN r || jsonb_build_object('partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.accetta_invito_partita(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accetta_invito_partita(uuid, text, text) TO anon, authenticated;

-- Chi ha invitato arriva: il «tocco» che segna la partita come giocata (trigger della 32a).
CREATE OR REPLACE FUNCTION public.partita_entra(p_session_id text, p_password_hash text, p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  IF v_io IS NULL OR p_match_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  UPDATE telepathy_matches SET round_count = round_count
   WHERE id = p_match_id AND (user1_id = v_io OR user2_id = v_io) AND ended_at IS NULL
  RETURNING * INTO m;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.partita_entra(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_entra(text, text, uuid) TO anon, authenticated;
```

- [ ] **Step 4: lancia e verifica che passa** (F1-F4, N1-N5 verdi). Se la cancellazione in N5 (r3) non torna, controlla che `respond_telepathy_invite` restituisca `in_match` *senza* sollevare: il `DELETE` deve avvenire.

- [ ] **Step 5: commit.** `git commit -am "39a: la partita la crea il server (coda, invito, ingresso)"` (aggiungi i file con `git add` se nuovi).

---

### Task 3: mosse, uscita, chat e ritorno della 39a

**Files:**
- Modify: `supabase/sql/39a_motore_telepatia.sql` (in coda)
- Create: `supabase/sql/39a_ritorno.sql`
- Modify: `test-motore-telepatia-sql.js`

**Interfaces:**
- Consumes: Task 1 (`partita_io`, `partita_ruolo`, `partita_vista`)
- Produces (tutte `→ jsonb {ok, partita?|motivo?}` tranne dove indicato): `partita_simbolo(p_session_id text, p_password_hash text, p_match_id uuid, p_simbolo text, p_livello text)`, `partita_ipotesi(p_session_id text, p_password_hash text, p_match_id uuid, p_ipotesi text)`, `partita_avanza(p_session_id text, p_password_hash text, p_match_id uuid, p_round_atteso integer)`, `partita_livello(p_session_id text, p_password_hash text, p_match_id uuid, p_livello text, p_scelta text)`, `partita_esci(p_session_id text, p_password_hash text, p_match_id uuid) → void`, `chat_scrivi(p_session_id text, p_password_hash text, p_match_id uuid, p_testo text) → jsonb {ok}`, `chat_leggi(p_session_id text, p_password_hash text, p_match_id uuid) → jsonb` (array di `{id, sender_name, content, created_at}`, oppure NULL)
- Motivi: `non_trovata`, `chiusa`, `non_tocca_a_te`, `gia_inviato`, `simbolo_mancante`, `gia_risposto`, `round_incompleto`, `dati_non_validi`. `partita_avanza` con un round già passato restituisce `{ok:true, gia_avanzato:true}` senza toccare nulla.

- [ ] **Step 1: test che falliscono.**

```js
const mossa = (db, fn, sid, m, extra = {}) => comeAnon(db, () => chiama(db, fn, { ...IO(sid), p_match_id: m, ...extra }));

sezione('M1. turni del round', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');   // round 0: A manda, B indovina
  check((await mossa(db, 'partita_simbolo', 'sidB', m, { p_simbolo: 'x', p_livello: 'lvl3' })).motivo === 'non_tocca_a_te', 'chi indovina non manda il simbolo');
  check((await mossa(db, 'partita_ipotesi', 'sidB', m, { p_ipotesi: 'x' })).motivo === 'simbolo_mancante', 'niente risposta prima del simbolo');
  check((await mossa(db, 'partita_simbolo', 'sidC', m, { p_simbolo: 'x', p_livello: 'lvl3' })).motivo === 'non_trovata', 'un estraneo: non_trovata');
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'x', p_livello: 'boh' })).motivo === 'dati_non_validi', 'livello sconosciuto: rifiutato');
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'y'.repeat(65), p_livello: 'lvl3' })).motivo === 'dati_non_validi', 'simbolo oltre 64 caratteri: rifiutato');
  const s = await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'stella', p_livello: 'lvl5' });
  check(s.ok === true && s.partita.sender_symbol === 'stella' && s.partita.level === 'lvl5', 'A manda il simbolo (e il livello)', s);
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'luna', p_livello: 'lvl5' })).motivo === 'gia_inviato', 'il simbolo non si cambia');
  check((await mossa(db, 'partita_avanza', 'sidA', m, { p_round_atteso: 0 })).motivo === 'round_incompleto', 'non si avanza senza risposta');
  const g = await mossa(db, 'partita_ipotesi', 'sidB', m, { p_ipotesi: 'luna' });
  check(g.ok === true && g.partita.sender_symbol === 'stella' && g.partita.receiver_guess === 'luna', 'B risponde e vede il simbolo', g);
  check((await mossa(db, 'partita_ipotesi', 'sidB', m, { p_ipotesi: 'sole' })).motivo === 'gia_risposto', 'una sola risposta per round');
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'sole', p_livello: 'lvl5' })).motivo === 'gia_inviato', 'dopo la risposta il simbolo resta quello');
  check((await mossa(db, 'partita_avanza', 'sidB', m, { p_round_atteso: 0 })).motivo === 'non_tocca_a_te', 'avanza solo chi manda');
  const a = await mossa(db, 'partita_avanza', 'sidA', m, { p_round_atteso: 0 });
  check(a.ok === true && a.partita.round_count === 1 && a.partita.sender_symbol === null && a.partita.receiver_guess === null, 'round 1, simboli azzerati', a);
  const a2 = await mossa(db, 'partita_avanza', 'sidA', m, { p_round_atteso: 0 });
  check(a2.ok === true && a2.gia_avanzato === true, 'un doppio invio non salta un round', a2);
  check((await uno(db, `SELECT round_count FROM telepathy_matches WHERE id = $1`, [m])).round_count === 1, 'sul DB resta round 1');
  await db.query(`UPDATE telepathy_matches SET round_count = 3 WHERE id = $1`, [m]);
  check((await mossa(db, 'partita_simbolo', 'sidB', m, { p_simbolo: 'x', p_livello: 'lvl5' })).ok === true, 'round 3: ora manda B');
});

sezione('M2. livello e uscita', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  check((await mossa(db, 'partita_livello', 'sidB', m, { p_livello: 'words', p_scelta: 'r7' })).ok === true, 'un giocatore cambia livello');
  check((await uno(db, `SELECT level, level_change_choice_sender AS c FROM telepathy_matches WHERE id = $1`, [m])).c === 'r7', 'marcatore scritto');
  check((await mossa(db, 'partita_livello', 'sidB', m, { p_livello: 'words', p_scelta: 'x7' })).motivo === 'dati_non_validi', 'marcatore malformato: rifiutato');
  check((await mossa(db, 'partita_livello', 'sidC', m, { p_livello: 'words', p_scelta: 'r7' })).motivo === 'non_trovata', 'un estraneo no');
  await mossa(db, 'partita_esci', 'sidC', m);
  check((await uno(db, `SELECT ended_at FROM telepathy_matches WHERE id = $1`, [m])).ended_at === null, 'un estraneo non chiude la partita');
  await mossa(db, 'partita_esci', 'sidA', m);
  await mossa(db, 'partita_esci', 'sidB', m);
  const e = await uno(db, `SELECT ended_at, ended_by FROM telepathy_matches WHERE id = $1`, [m]);
  check(e.ended_at !== null && e.ended_by === await pub(db, 'sidA'), 'chiude chi esce per primo; il secondo non riscrive ended_by', e);
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'x', p_livello: 'lvl3' })).motivo === 'chiusa', 'partita chiusa: niente mosse');
});

sezione('C1. chat', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  check((await mossa(db, 'chat_scrivi', 'sidA', m, { p_testo: '  ciao  ' })).ok === true, 'A scrive');
  check((await mossa(db, 'chat_scrivi', 'sidC', m, { p_testo: 'intruso' })).ok === false, 'un estraneo non scrive');
  check((await mossa(db, 'chat_scrivi', 'sidA', m, { p_testo: 'z'.repeat(501) })).ok === false, 'oltre 500 caratteri: rifiutato');
  check((await mossa(db, 'chat_scrivi', 'sidA', m, { p_testo: '   ' })).ok === false, 'testo vuoto: rifiutato');
  await mossa(db, 'chat_scrivi', 'sidB', m, { p_testo: 'eccomi' });
  const l = await mossa(db, 'chat_leggi', 'sidB', m);
  check(Array.isArray(l) && l.length === 2 && l[0].content === 'ciao' && l[0].sender_name === 'Ada' && l[1].sender_name === 'Bea', 'B legge in ordine, testo ripulito, nomi messi dal server', l);
  check(JSON.stringify(Object.keys(l[0]).sort()) === JSON.stringify(['content', 'created_at', 'id', 'sender_name']), 'solo le colonne che servono', Object.keys(l[0]));
  check(await mossa(db, 'chat_leggi', 'sidC', m) === null, 'un estraneo non legge');
  await mossa(db, 'partita_esci', 'sidA', m);
  check((await mossa(db, 'chat_scrivi', 'sidB', m, { p_testo: 'dopo' })).ok === false, 'a partita chiusa non si scrive');
  check((await mossa(db, 'chat_leggi', 'sidB', m)).length === 2, 'ma si rilegge');
});

sezione('R1. 39a_ritorno', async (db) => {
  const e = await errore(applicaFile(db, 'supabase/sql/39a_ritorno.sql'));
  check(!e, 'il ritorno si applica', e);
  const f = await righe(db, `SELECT proname FROM pg_proc WHERE proname LIKE 'partita%' OR proname LIKE 'chat\\_%' OR proname = 'accetta_invito_partita'`);
  check(f.length === 0, 'nessuna funzione nuova rimasta', f);
  const t = await uno(db, `SELECT data_type FROM information_schema.columns WHERE table_name = 'telepathy_chat' AND column_name = 'match_id'`);
  check(t.data_type === 'text', 'match_id torna text', t);
  check(!(await errore(applicaFile(db, 'supabase/sql/39a_ritorno.sql'))), 'il ritorno si riapplica');
  check(!(await errore(applicaFile(db, F39A))), 'dopo il ritorno la 39a si riapplica');
});
```

- [ ] **Step 2: lancia e verifica che fallisce.**

- [ ] **Step 3: implementa.** In coda alla 39a:

```sql
-- ════ E. Mosse ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.partita_livello_valido(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p IN ('lvl3', 'lvl5', 'lvl7', 'lvl9', 'numbers', 'words');
$$;
REVOKE ALL ON FUNCTION public.partita_livello_valido(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.partita_simbolo(p_session_id text, p_password_hash text, p_match_id uuid, p_simbolo text, p_livello text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  SELECT * INTO m FROM telepathy_matches WHERE id = p_match_id AND v_io IS NOT NULL AND (user1_id = v_io OR user2_id = v_io) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovata'); END IF;
  IF m.ended_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'chiusa'); END IF;
  IF partita_ruolo(m, v_io) IS DISTINCT FROM 'sender' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_tocca_a_te'); END IF;
  IF m.sender_symbol IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'gia_inviato'); END IF;
  IF p_simbolo IS NULL OR length(p_simbolo) NOT BETWEEN 1 AND 64
     OR (p_livello IS NOT NULL AND NOT partita_livello_valido(p_livello)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  UPDATE telepathy_matches SET sender_symbol = p_simbolo, level = coalesce(p_livello, level)
   WHERE id = m.id RETURNING * INTO m;
  RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.partita_simbolo(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_simbolo(text, text, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.partita_ipotesi(p_session_id text, p_password_hash text, p_match_id uuid, p_ipotesi text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  SELECT * INTO m FROM telepathy_matches WHERE id = p_match_id AND v_io IS NOT NULL AND (user1_id = v_io OR user2_id = v_io) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovata'); END IF;
  IF m.ended_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'chiusa'); END IF;
  IF partita_ruolo(m, v_io) IS DISTINCT FROM 'receiver' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_tocca_a_te'); END IF;
  IF m.sender_symbol IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'simbolo_mancante'); END IF;
  IF m.receiver_guess IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'gia_risposto'); END IF;
  IF p_ipotesi IS NULL OR length(p_ipotesi) NOT BETWEEN 1 AND 64 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  UPDATE telepathy_matches SET receiver_guess = p_ipotesi WHERE id = m.id RETURNING * INTO m;
  RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.partita_ipotesi(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_ipotesi(text, text, uuid, text) TO anon, authenticated;

-- Solo chi manda, solo a round completo, solo se il round è ancora quello atteso (idempotente).
CREATE OR REPLACE FUNCTION public.partita_avanza(p_session_id text, p_password_hash text, p_match_id uuid, p_round_atteso integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  SELECT * INTO m FROM telepathy_matches WHERE id = p_match_id AND v_io IS NOT NULL AND (user1_id = v_io OR user2_id = v_io) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovata'); END IF;
  IF m.ended_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'chiusa'); END IF;
  IF coalesce(m.round_count, 0) IS DISTINCT FROM p_round_atteso THEN
    RETURN jsonb_build_object('ok', true, 'gia_avanzato', true, 'partita', partita_vista(m, v_io));
  END IF;
  IF partita_ruolo(m, v_io) IS DISTINCT FROM 'sender' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_tocca_a_te'); END IF;
  IF m.sender_symbol IS NULL OR m.receiver_guess IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'round_incompleto'); END IF;
  UPDATE telepathy_matches SET round_count = coalesce(round_count, 0) + 1, sender_symbol = NULL, receiver_guess = NULL
   WHERE id = m.id RETURNING * INTO m;
  RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.partita_avanza(text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_avanza(text, text, uuid, integer) TO anon, authenticated;

-- Chi sceglie lo decide il client (a turni): il server verifica partecipazione e formato.
CREATE OR REPLACE FUNCTION public.partita_livello(p_session_id text, p_password_hash text, p_match_id uuid, p_livello text, p_scelta text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches;
BEGIN
  SELECT * INTO m FROM telepathy_matches WHERE id = p_match_id AND v_io IS NOT NULL AND (user1_id = v_io OR user2_id = v_io) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovata'); END IF;
  IF m.ended_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'chiusa'); END IF;
  IF NOT coalesce(partita_livello_valido(p_livello), false) OR p_scelta IS NULL OR p_scelta !~ '^r[0-9]{1,5}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  UPDATE telepathy_matches SET level = p_livello, level_change_choice_sender = p_scelta WHERE id = m.id RETURNING * INTO m;
  RETURN jsonb_build_object('ok', true, 'partita', partita_vista(m, v_io));
END $$;
REVOKE ALL ON FUNCTION public.partita_livello(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_livello(text, text, uuid, text, text) TO anon, authenticated;

-- Chiude la partita (non la cancella: l'altro deve leggere ended_at; la cancella la pulizia).
CREATE OR REPLACE FUNCTION public.partita_esci(p_session_id text, p_password_hash text, p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash);
BEGIN
  IF v_io IS NULL OR p_match_id IS NULL THEN RETURN; END IF;
  UPDATE telepathy_matches SET ended_at = coalesce(ended_at, now()), ended_by = coalesce(ended_by, v_io)
   WHERE id = p_match_id AND (user1_id = v_io OR user2_id = v_io);
END $$;
REVOKE ALL ON FUNCTION public.partita_esci(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partita_esci(text, text, uuid) TO anon, authenticated;

-- ════ F. Chat ═════════════════════════════════════════════════════════════════
-- Il nome del mittente lo mette il server (quello della partita): nessuno si firma per un altro.
CREATE OR REPLACE FUNCTION public.chat_scrivi(p_session_id text, p_password_hash text, p_match_id uuid, p_testo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash); m telepathy_matches; v_testo text := btrim(p_testo);
BEGIN
  SELECT * INTO m FROM telepathy_matches WHERE id = p_match_id AND v_io IS NOT NULL AND (user1_id = v_io OR user2_id = v_io) AND ended_at IS NULL;
  IF NOT FOUND OR v_testo IS NULL OR length(v_testo) NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('ok', false); END IF;
  INSERT INTO telepathy_chat (match_id, sender_name, content)
  VALUES (m.id, CASE WHEN m.user1_id = v_io THEN m.user1_nickname ELSE m.user2_nickname END, v_testo);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.chat_scrivi(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_scrivi(text, text, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.chat_leggi(p_session_id text, p_password_hash text, p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_io text := partita_io(p_session_id, p_password_hash);
BEGIN
  IF v_io IS NULL OR NOT EXISTS (SELECT 1 FROM telepathy_matches WHERE id = p_match_id AND (user1_id = v_io OR user2_id = v_io)) THEN
    RETURN NULL;
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'sender_name', c.sender_name, 'content', c.content, 'created_at', c.created_at)
                                    ORDER BY c.created_at, c.id)
                     FROM telepathy_chat c WHERE c.match_id = p_match_id), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.chat_leggi(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_leggi(text, text, uuid) TO anon, authenticated;
```

Crea `supabase/sql/39a_ritorno.sql`:

```sql
-- Ritorno della 39a: toglie le funzioni del motore e riporta la chat com'era (match_id text, senza FK).
-- Va applicato DOPO 39b_ritorno se la 39b è stata applicata. I messaggi orfani cancellati non tornano.
DROP FUNCTION IF EXISTS public.chat_leggi(text, text, uuid);
DROP FUNCTION IF EXISTS public.chat_scrivi(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.partita_esci(text, text, uuid);
DROP FUNCTION IF EXISTS public.partita_livello(text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.partita_avanza(text, text, uuid, integer);
DROP FUNCTION IF EXISTS public.partita_ipotesi(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.partita_simbolo(text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.partita_livello_valido(text);
DROP FUNCTION IF EXISTS public.partita_entra(text, text, uuid);
DROP FUNCTION IF EXISTS public.accetta_invito_partita(uuid, text, text);
DROP FUNCTION IF EXISTS public.partita_crea_da_coda(text, text, text, text);
DROP FUNCTION IF EXISTS public.partita_blocca(text, text);
DROP FUNCTION IF EXISTS public.partita_stato(text, text, uuid);
DROP FUNCTION IF EXISTS public.partita_mia(text, text);
DROP FUNCTION IF EXISTS public.partita_viva_di(text);
DROP FUNCTION IF EXISTS public.partite_pulizia();
DROP FUNCTION IF EXISTS public.partita_vista(telepathy_matches, text);
DROP FUNCTION IF EXISTS public.partita_ruolo(telepathy_matches, text);
DROP FUNCTION IF EXISTS public.partita_io(text, text);
ALTER TABLE telepathy_chat DROP CONSTRAINT IF EXISTS telepathy_chat_match_fk;
ALTER TABLE telepathy_chat ALTER COLUMN match_id TYPE text USING match_id::text;
```

- [ ] **Step 4: lancia e verifica che passa.** Tutte le sezioni verdi, compresa R1. Poi `node test-chiavi-nascoste-sql.js`, `node test-inviti-offline-sql.js` e `node test-pg-locale.js`, tutti verdi.

- [ ] **Step 5: commit.** `git add supabase/sql/39a_ritorno.sql && git commit -am "39a: mosse, uscita e chat dal server, con ritorno"`

---

### Task 4: la chiusura 39b e il suo ritorno

**Files:**
- Create: `supabase/sql/39b_chiudi_telepatia.sql`, `supabase/sql/39b_ritorno.sql`
- Modify: `test-motore-telepatia-sql.js`

**Interfaces:**
- Consumes: tutte le RPC della 39a (devono continuare a funzionare dopo la 39b)
- Produces: anon e authenticated ricevono `permission denied` (42501) su `telepathy_matches`, `telepathy_chat` ed `end_telepathy_match`

- [ ] **Step 1: test che falliscono.**

```js
const negato = (e) => /permission denied/.test(e || '');
sezione('Z1. dopo la 39b: tabelle chiuse, RPC vive', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  for (const sql of [`SELECT * FROM telepathy_matches`, `SELECT * FROM telepathy_chat`,
                     `INSERT INTO telepathy_matches (user1_id) VALUES ('x')`, `UPDATE telepathy_matches SET level = 'lvl9'`,
                     `DELETE FROM telepathy_matches`, `TRUNCATE telepathy_matches`, `TRUNCATE telepathy_chat`,
                     `INSERT INTO telepathy_chat (match_id, sender_name, content) VALUES ('${m}', 'X', 'y')`]) {
    check(negato(await comeAnon(db, () => errore(db.query(sql)))), `anon: ${sql.slice(0, 40)} → negato`);
  }
  check(negato(await comeAnon(db, () => errore(chiama(db, 'end_telepathy_match', { p_match_id: m, p_ended_by: 'x' })))), 'end_telepathy_match non più chiamabile');
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'stella', p_livello: 'lvl3' })).ok === true, 'le mosse passano dalle RPC');
  check((await mossa(db, 'chat_scrivi', 'sidB', m, { p_testo: 'ciao' })).ok === true, 'la chat passa dalle RPC');
  check((await mossa(db, 'chat_leggi', 'sidA', m)).length === 1, 'e si rilegge');
  await inCoda(db, 'sidC', 'Cia');
  check((await crea(db, 'sidD', 'Dea', 'sidC')).ok === true, 'l\'abbinamento funziona');
  const inv = await invita(db, 'sidE', 'Eva', 'sidF', 'Fra');
  check((await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv, ...IO('sidF') }))).ok === true, 'l\'invito funziona');
  const pres = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...IO('sidA'), p_nickname: 'Ada', p_lat: 1, p_lng: 1 }));
  check(pres.find((u) => u.nickname === 'Ada').busy === true, 'aggiorna_presenza vede ancora le partite (busy)', pres);
}, { con35a: true, con36a: true, con36b: true, con39a: true, con39b: true });

sezione('Z2. 39b_ritorno', async (db) => {
  check(!(await errore(applicaFile(db, 'supabase/sql/39b_ritorno.sql'))), 'il ritorno si applica');
  check(!(await comeAnon(db, () => errore(db.query(`SELECT * FROM telepathy_matches`)))), 'anon rilegge le partite');
  check(!(await comeAnon(db, () => errore(db.query(`SELECT * FROM telepathy_chat`)))), 'anon rilegge la chat');
  const rls = await uno(db, `SELECT relrowsecurity AS r FROM pg_class WHERE relname = 'telepathy_chat'`);
  check(rls.r === false, 'chat: RLS di nuovo spenta, com\'era', rls);
  const pol = (await righe(db, `SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('telepathy_matches','telepathy_chat') ORDER BY 1, 2`)).map((p) => p.policyname);
  check(pol.length === 5, 'le cinque policy di prima', pol);
  check(!(await comeAnon(db, () => errore(chiama(db, 'end_telepathy_match', { p_match_id: '00000000-0000-0000-0000-000000000000', p_ended_by: 'x' })))), 'end_telepathy_match di nuovo chiamabile');
  check(!(await errore(applicaFile(db, 'supabase/sql/39b_ritorno.sql'))), 'il ritorno si riapplica');
  check(!(await errore(applicaFile(db, F39B))), 'dopo il ritorno la 39b si riapplica');
  check(negato(await comeAnon(db, () => errore(db.query(`SELECT * FROM telepathy_matches`)))), 'e richiude');
  check(!(await errore(applicaFile(db, 'supabase/sql/39b_ritorno.sql'))) && !(await errore(applicaFile(db, 'supabase/sql/39a_ritorno.sql'))), 'catena 39b_ritorno → 39a_ritorno senza errori');
}, { con35a: true, con36a: true, con36b: true, con39a: true, con39b: true });
```

- [ ] **Step 2: lancia e verifica che fallisce.**

- [ ] **Step 3: implementa** `supabase/sql/39b_chiudi_telepatia.sql`:

```sql
-- 39b — chiude partite e chat della telepatia: da qui in poi si passa solo dalle RPC della 39a.
-- Da applicare almeno 10 minuti DOPO il rilascio dell'app che usa le RPC (cache della PWA).
-- Un'app aperta da prima si ferma sulla telepatia finché non si ricarica (come per 36b/37b).
-- Ritorno: 39b_ritorno.sql.
DROP POLICY IF EXISTS "Allow all" ON telepathy_matches;
DROP POLICY IF EXISTS "Allow all for anon" ON telepathy_matches;
ALTER TABLE telepathy_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON telepathy_matches FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Solo i partecipanti possono leggere la chat" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono inviare messaggi" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat;
ALTER TABLE telepathy_chat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON telepathy_chat FROM PUBLIC, anon, authenticated;

-- Chiudeva qualunque partita a nome di chiunque: la sostituisce partita_esci.
REVOKE ALL ON FUNCTION public.end_telepathy_match(uuid, text) FROM PUBLIC, anon, authenticated;
```

E `supabase/sql/39b_ritorno.sql`:

```sql
-- Ritorno della 39b: partite e chat di nuovo aperte com'erano il 13/10 (catalogo).
GRANT ALL ON telepathy_matches TO anon, authenticated;
DROP POLICY IF EXISTS "Allow all" ON telepathy_matches;
DROP POLICY IF EXISTS "Allow all for anon" ON telepathy_matches;
CREATE POLICY "Allow all" ON telepathy_matches FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON telepathy_matches FOR ALL TO public USING (true) WITH CHECK (true);

GRANT ALL ON telepathy_chat TO anon, authenticated;
ALTER TABLE telepathy_chat DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo i partecipanti possono leggere la chat" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono inviare messaggi" ON telepathy_chat;
DROP POLICY IF EXISTS "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat;
CREATE POLICY "Solo i partecipanti possono leggere la chat" ON telepathy_chat FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
CREATE POLICY "Solo i partecipanti possono inviare messaggi" ON telepathy_chat FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));
CREATE POLICY "Solo i partecipanti possono cancellare messaggi" ON telepathy_chat FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM telepathy_matches WHERE telepathy_matches.id::text = telepathy_chat.match_id::text
    AND (telepathy_matches.user1_id = auth.uid()::text OR telepathy_matches.user2_id = auth.uid()::text)));

GRANT EXECUTE ON FUNCTION public.end_telepathy_match(uuid, text) TO PUBLIC, anon, authenticated;
```

- [ ] **Step 4: lancia e verifica che passa.** Tutto `test-motore-telepatia-sql.js` verde.

- [ ] **Step 5: commit.** `git add supabase/sql/39b_*.sql && git commit -am "39b: partite e chat chiuse, con ritorno"`

---

### Task 5: app — abbinamento, invito, ingresso di chi ha invitato

**Files:**
- Modify: `src/app.jsx` (`findPartner` ~2545-2690, `entraNelMatchDaInvito` ~3405-3445, `accettaInvito` ~3715-3800, effetto `attesaInvitante` ~3843)

**Interfaces:**
- Consumes: `partita_mia`, `partita_crea_da_coda`, `accetta_invito_partita`, `partita_entra`, `partita_stato`, `partita_esci` (Task 1-3)
- Produces: helper `rpcPartita(fn, extra) → Promise<{data, error}>`, usato anche dal Task 6

- [ ] **Step 1: helper.** Subito dopo `const rpcInviti = async (fn, extra) => { … };` (riga ~2295) aggiungi:

```js
          // Motore della telepatia (39a): ogni lettura e scrittura di partite e chat passa dal server,
          // che riconosce chi chiama dalla stessa coppia session_id + password degli inviti.
          const rpcPartita = (fn, extra) => supabase.rpc(fn, {
            p_session_id: sessionIdRef.current || sessionId,
            p_password_hash: passwordHashRef.current || null,
            ...(extra || {})
          });
```

- [ ] **Step 2: `findPartner`.** Togli le tre pulizie (`delete().lt(...)`) e la funzione `vivo` (ora le fa il server). Sostituisci il passo 1 (SELECT di tutta la tabella) con:

```js
              // 1. Qualcuno mi ha già abbinato? (il server fa anche la pulizia delle partite vecchie)
              const { data: myMatch, error: errMia } = await rpcPartita('partita_mia');
              if (errMia) return;   // rete: si riprova al giro dopo
              if (myMatch) {
                const amUser1 = myMatch.user1_id === me;
                const altroNick = amUser1 ? myMatch.user2_nickname : myMatch.user1_nickname;
                if (isBlocked(altroNick)) {
                  await rpcPartita('partita_esci', { p_match_id: myMatch.id });
                  return;
                }
                setPartner({ id: amUser1 ? myMatch.user2_id : myMatch.user1_id, nickname: altroNick });
                setRole(amUser1 ? myMatch.user1_role : myMatch.user2_role);
                setMatchId(myMatch.id);
                setSearchingPartner(false);
                await esciDallaCoda();
                return;
              }
```

Nel passo 2, al posto di tutto il blocco che va da `// Re-check pre-insert` fino al `setSearchingPartner(false);` dopo `esciDallaCoda()` (precheck, insert, ripulitura dei residui, dedup post-insert), metti:

```js
                // La partita la crea il server: controlla che l'altro sia in coda e libero, sorteggia
                // i ruoli e non fa doppioni se ci abbiniamo a vicenda nello stesso istante.
                const { data: r, error: errCrea } = await rpcPartita('partita_crea_da_coda', {
                  p_nickname: nickname || 'Anonymous', p_altro: available.id
                });
                if (errCrea || !r || !r.ok) return;   // occupato, uscito dalla coda, rete: giro dopo
                const winner = r.partita;
                const amUser1 = winner.user1_id === me;
                setPartner({ id: amUser1 ? winner.user2_id : winner.user1_id, nickname: amUser1 ? winner.user2_nickname : winner.user1_nickname });
                setRole(amUser1 ? winner.user1_role : winner.user2_role);
                setMatchId(winner.id);
                // Il server ci ha già tolti entrambi dalla coda; l'uscita resta per sicurezza.
                await esciDallaCoda();
                setSearchingPartner(false);
```

- [ ] **Step 3: `entraNelMatchDaInvito`.** Sostituisci la select e l'update finto con:

```js
            const { data: e, error } = await rpcPartita('partita_entra', { p_match_id: idMatch });
            if (error || !e) return null;   // null = non so (rete), false = non c'è
            const m = e.ok ? e.partita : null;
            if (!m || (m.user1_id !== me && m.user2_id !== me)) {
              setDirectInviteTarget(null);
              setInvitoInUscita(null);
              setAvvisoInviti(testoInviti('non_ce_piu'));
              return false;
            }
```

e togli la riga `await supabase.from('telepathy_matches').update({ round_count: … })` (l'ingresso ora lo fa `partita_entra`). Il resto della funzione resta com'è.

- [ ] **Step 4: `accettaInvito`.** Togli la pulizia dei residui (`staleAccept`), il sorteggio `myRole/theirRole`, l'insert, la prima `respond_telepathy_invite` e la `delete` in caso di rifiuto. Al loro posto:

```js
            // La partita la crea il server insieme alla risposta (39a): se l'invito non vale più,
            // non resta nessuna partita a metà.
            let r = await rpcInviti('accetta_invito_partita', { p_invite_id: invito.invite_id });
            if (r && r.ok === false && r.motivo === 'errore') {
              // Errore di rete: la risposta può essere arrivata al server anche se non a noi.
              const stato = await rpcInviti('get_telepathy_invite', { p_invite_id: invito.invite_id });
              if (stato && stato.ok && stato.invito && stato.invito.status === 'accepted' && stato.invito.match_id) {
                const { data: p } = await rpcPartita('partita_stato', { p_match_id: stato.invito.match_id });
                if (p) r = { ok: true, status: 'accepted', responded_at: stato.invito.responded_at, adesso: stato.adesso, partita: p };
              }
            }
            if (!r || !r.ok || !r.partita) {
              setIncomingInvite(null);
              setAvvisoInviti(testoInviti((r && r.motivo) || 'errore', { nome: invito.from_name }));
              return;
            }
            const nuovo = r.partita;
            const myRole = nuovo.user2_role;   // chi accetta è sempre user2
```

Il resto (`setMatchId(nuovo.id)`, `setRole(myRole)`, attesa di chi ha invitato…) resta com'è. Prima di salvare, controlla che `rpcInviti` passi `p_session_id`/`p_password_hash` (righe 2295-2300): `accetta_invito_partita` li vuole con quei nomi.

- [ ] **Step 5: effetto `attesaInvitante`.** Sostituisci `supabase.from('telepathy_matches').select('giocato')` con:

```js
                const { data: mm, error: errM } = await rpcPartita('partita_stato', { p_match_id: matchId });
                if (fermo) return;
                if (!errM && mm && mm.giocato === true) { setAttesaInvitante(null); return; }
```

e, nello stesso effetto, `supabase.rpc('end_telepathy_match', …)` con `await rpcPartita('partita_esci', { p_match_id: matchId })`.

- [ ] **Step 6: build e controllo veloce.** `node build.js` deve finire senza errori. Poi `grep -n "from('telepathy_matches')" src/app.jsx`: devono restare solo gli accessi del Task 6.

- [ ] **Step 7: commit.** `git commit -am "App: abbinamento e inviti passano dal server"`

---

### Task 6: app — round, chat, uscita (e test di sorgente)

**Files:**
- Modify: `src/app.jsx` (`handleUnload` ~2357, `sendSymbol`/`submitGuess`/`proposeLevelChange` ~3180-3212, `pollResult` ~3216, `checkPartnerLeft` ~3330, `pollLevelChange` ~3383, chat ~3521, `checkSenderSent` ~3534, `resetTelepathy` ~3586, `leaveSession` ~3648, «gioca ancora» ~4076, `sendTelepathyMessage` ~4143, `endSession` ~4211)
- Modify: `test-telepathy-gating.js`

**Interfaces:**
- Consumes: `rpcPartita` (Task 5); `partita_stato`, `partita_simbolo`, `partita_ipotesi`, `partita_avanza`, `partita_livello`, `partita_esci`, `chat_scrivi`, `chat_leggi`

- [ ] **Step 1: adegua prima il test di sorgente (così fallisce).** In `test-telepathy-gating.js` sostituisci le due asserzioni su `checkSenderSent` con:

```js
ok(check !== null && /rpcPartita\('partita_stato'/.test(check),
  'checkSenderSent legge lo stato dal server (partita_stato)');
ok(check !== null && /simbolo_inviato/.test(check) && /dbRound === roundCount/.test(check),
  'checkSenderSent usa simbolo_inviato (il simbolo è nascosto) e confronta il round');
```

e aggiungi in fondo, prima del riepilogo:

```js
console.log('\n— Motore chiuso (39a): niente accessi diretti a partite e chat —');
ok(!/from\('telepathy_matches'\)/.test(src), 'nessun from(\'telepathy_matches\') in app.jsx');
ok(!/from\('telepathy_chat'\)/.test(src), 'nessun from(\'telepathy_chat\') in app.jsx');
ok(!/rest\/v1\/telepathy_(matches|chat)/.test(src), 'nessuna fetch REST diretta alle due tabelle');
ok(!/end_telepathy_match/.test(src), 'end_telepathy_match non si chiama più (c\'è partita_esci)');
const poll = block('const pollResult = async', 'pollResult();');
ok(poll !== null && /if \(error\) return;/.test(poll), 'pollResult: un errore di rete non chiude la partita');
```

Lancia `node test-telepathy-gating.js`: atteso FAIL sulle nuove righe.

- [ ] **Step 2: mosse.**

```js
          const sendSymbol = async () => {
            if (!selectedSymbol || !matchId || attesaInvitanteRef.current) return;
            setWaitingForPartner(true);
            await rpcPartita('partita_simbolo', { p_match_id: matchId, p_simbolo: selectedSymbol, p_livello: currentLevel });
          };

          const submitGuess = async () => {
            if (!guessedSymbol || !matchId || attesaInvitanteRef.current) return;
            setWaitingForPartner(true);
            await rpcPartita('partita_ipotesi', { p_match_id: matchId, p_ipotesi: guessedSymbol });
          };
```

In `proposeLevelChange` sostituisci l'update con:

```js
            await rpcPartita('partita_livello', { p_match_id: matchId, p_livello: newLevel, p_scelta: 'r' + bannerRound });
```

- [ ] **Step 3: `pollResult`.** In testa:

```js
              const { data: match, error } = await rpcPartita('partita_stato', { p_match_id: matchId });
              if (matchIdRef.current !== matchId) return;
              if (error) return;   // rete: si riprova fra 2 s, la partita non è finita
              if (!match) {
```

(il corpo del vecchio `if (!data || data.length === 0)` resta; togli `const match = data[0];`). Nell'avanzamento del sender:

```js
                  setTimeout(async () => {
                    await rpcPartita('partita_avanza', { p_match_id: matchId, p_round_atteso: dbRound });
                  }, 4000);
```

- [ ] **Step 4: `checkPartnerLeft`.** Togli `endedColumnsSupportedRef` e le due select (la 14_ è applicata da mesi):

```js
              const { data: match, error } = await rpcPartita('partita_stato', { p_match_id: matchId });
              if (matchIdRef.current !== matchId) return;
              if (error) return;
              if (!match) {
```

togliendo poi `const match = data[0];`. Se `endedColumnsSupportedRef` non è usato altrove (`grep -n endedColumnsSupportedRef src/app.jsx`), togli anche la sua dichiarazione.

- [ ] **Step 5: `pollLevelChange` e `checkSenderSent`.**

```js
              const { data: match } = await rpcPartita('partita_stato', { p_match_id: matchId });
              if (!match) return;
```

(al posto di select e `data[0]` in `pollLevelChange`) e in `checkSenderSent`:

```js
              const { data: p } = await rpcPartita('partita_stato', { p_match_id: matchId });
              if (p) {
                // Il simbolo a chi indovina non arriva più (39a): basta sapere che è stato inviato.
                const dbRound = p.round_count || 0;
                setSenderHasSent(!!p.simbolo_inviato && dbRound === roundCount);
              }
```

Mantieni il commento A4/bug 4 sopra la riga `dbRound`.

- [ ] **Step 6: chat.**

```js
            const loadChat = async () => {
              const { data } = await rpcPartita('chat_leggi', { p_match_id: matchId });
              if (Array.isArray(data)) setTelepathyChatMessages(data.filter(x => !isBlocked(x.sender_name)));
            };
```

```js
          const sendTelepathyMessage = async () => {
            if (!newTelepathyMessage.trim() || !matchId) return;
            const msg = newTelepathyMessage.trim();
            setNewTelepathyMessage('');
            // Il nome del mittente lo mette il server (quello della partita).
            await rpcPartita('chat_scrivi', { p_match_id: matchId, p_testo: msg });
          };
```

Aggiungi `maxLength={500}` all'`<input>` della chat (~riga 6425).

- [ ] **Step 7: uscite.**
  - `handleUnload`: al posto delle due `fetch` DELETE:

```js
                if (mid) {
                  // Chiudere la scheda chiude la partita (la cancella poi il server, chat compresa).
                  fetch(`${SUPABASE_URL}/rest/v1/rpc/partita_esci`, {
                    method: 'POST', headers: SB_HEADERS, keepalive: true,
                    body: JSON.stringify({ p_session_id: sid, p_password_hash: passwordHashRef.current || null, p_match_id: mid })
                  });
                }
```

  - `resetTelepathy`: al posto delle due delete, `rpcPartita('partita_esci', { p_match_id: oldMatchId });` (senza await, come prima).
  - `leaveSession` (~3648) e «gioca ancora» (~4076): `try { await rpcPartita('partita_esci', { p_match_id: matchId }); } catch (_) {}`.
  - `endSession` (~4211): il blocco `if (matchId) { … }` diventa:

```js
              if (matchId) {
                // Chiude la partita sul server: l'altro lato legge ended_at; partita e chat le
                // cancella poi la pulizia del server (la chat va via in cascata).
                await rpcPartita('partita_esci', { p_match_id: matchId });
              }
```

- [ ] **Step 8: verifica.** `node build.js`, poi `node test-telepathy-gating.js` (tutto verde) e `grep -nE "telepathy_(matches|chat)|end_telepathy_match" src/app.jsx`. Possono restare solo commenti e `type: 'telepathy_chat'` della moderazione (~6417). Lancia anche `node test-telepathy-role-rotation.js`, `node test-telepathy-livelli-scala.js` e `node test-telepathy-stats.js`: devono restare verdi.

- [ ] **Step 9: commit.** `git commit -am "App: round, chat e uscita passano dal server; simbolo nascosto a chi indovina"`

---

### Task 7: sonda sul DB vero, test adeguati, prove UI in locale

**Files:**
- Create: `scripts/sonda-telepatia.js`
- Modify: `test-telepathy-session-end.js`

**Interfaces:**
- Consumes: `test-helpers.js` (`SUPABASE_URL`, `requireServiceKey`, `getServiceKey`, `purge`), stesso impianto di `scripts/sonda-community.js`

- [ ] **Step 1: sonda.** Crea `scripts/sonda-telepatia.js` copiando l'impianto di `scripts/sonda-community.js` (ANON, `check`, `chiusa` con `--dopo-39b` al posto di `--dopo-38`, `rest(chiave, path, opts)`). Scenario:
  1. Con la chiave di servizio crea una partita di prova fra `pub_` di due sid di prova (calcolati con `rpc/id_pubblico` via chiave di servizio) e un messaggio di chat.
  2. Con ANON: `GET telepathy_matches?select=*`, `GET telepathy_chat?select=*`, `POST` su entrambe, `PATCH telepathy_matches?id=eq.<id>`, `DELETE telepathy_matches?id=eq.<id>`, `DELETE telepathy_chat?match_id=eq.<id>`, `rpc/end_telepathy_match` sulla partita di prova. Ognuna è una falla `chiusa(...)`: «chiusa» vuol dire HTTP 401/403, oppure un corpo vuoto con la riga ancora intatta (verificata con la chiave di servizio).
  3. Con ANON e sid estraneo: `rpc/partita_stato`, `rpc/chat_leggi` → `null`; `rpc/partita_simbolo`, `rpc/chat_scrivi` → `ok:false`; `rpc/partita_esci` → la partita resta aperta. Questi sono `check` veri già prima della 39b (le RPC esistono dalla 39a).
  4. Con ANON e sid giocatore: `partita_stato` a chi indovina con simbolo inviato → `sender_symbol` null e `simbolo_inviato` true.
  5. Pulizia finale con la chiave di servizio (la chat va via in cascata).

  TRUNCATE non è esposto via REST: lo copre il test PGlite Z1.

- [ ] **Step 2: `test-telepathy-session-end.js`.** Riscrivilo sullo stesso scenario, con le RPC nuove: la partita la crea la chiave di servizio, A esce con `rpc/partita_esci`, B legge `ended_at`/`ended_by` con `rpc/partita_stato` (deve essere l'id pubblico di A), la seconda uscita (di B) non riscrive `ended_by`, un estraneo non chiude. Pulizia con la chiave di servizio.

- [ ] **Step 3: applica la 39a? NO, non ancora.** Le prove UI in locale (`test-telepathy.js` e `test-inviti-*`) usano il DB vero, che non ha ancora la 39a: in questa fase si lanciano solo `test-motore-telepatia-sql.js` e i test di sorgente. Le prove UI vanno nel Task 8, dopo l'applicazione della 39a (additiva e sicura: l'app di oggi continua a funzionare).

- [ ] **Step 4: commit.** `git add scripts/sonda-telepatia.js && git commit -am "Sonda telepatia e test di fine sessione sulle RPC nuove"`

---

### Task 8: rilascio, tempo (a)

Ogni passo che tocca il remoto o il DB vero si annuncia prima a Irene in chat: quale file o quale PR.

- [ ] **Step 1: revisione indipendente** dell'intero ramo con un agente separato (spec + piano + diff). Si correggono tutti i Critical e gli Important.
- [ ] **Step 2: applica la 39a sul DB vero.** `node scripts/apply-sql.js supabase/sql/39a_motore_telepatia.sql`. Poi la sonda prima della chiusura: `node scripts/sonda-telepatia.js` (le falle note escono come ⏳, i `check` sulle RPC sono verdi).
- [ ] **Step 3: prove UI in locale contro il DB vero con la 39a.** Server `npx serve -l 4321` (verificare «Accepting connections at …:4321»), poi con `NODE_OPTIONS="--require ./scripts/test-silenzioso.js"`: `test-telepathy.js`, `test-inviti-telepatia.js`, `test-inviti-offline-ui.js`, `test-telepathy-session-end.js`, `test-inviti-offline-rpc.js`. Tutti verdi, a gruppi piccoli e con un server nuovo se serve. A fine prove si spegne il server.
- [ ] **Step 4: push del ramo e PR** (annunciati prima), poi merge (`gh pr merge <n> --squash`, da solo).
- [ ] **Step 5: deploy.** Si aspetta che il sito vero serva il nuovo `app.js` (confronto con `main`), poi le stesse prove UI contro il sito vero (preload in scratchpad che riscrive `localhost:4321` → sito).

### Task 9: rilascio, tempo (b), e chiusura

- [ ] **Step 1:** almeno 10 minuti dopo il deploy, `node scripts/apply-sql.js supabase/sql/39b_chiudi_telepatia.sql` (annunciato prima).
- [ ] **Step 2:** `node scripts/sonda-telepatia.js --dopo-39b` → 0 falle. `node scripts/sonda-chiavi.js --dopo-37b` e `node scripts/sonda-community.js --dopo-38` → verdi.
- [ ] **Step 3:** sul sito vero, prove UI di telepatia, inviti (tutte e due), presenze e rituali (`test-rituali*.js`, `test-partecipa-subito.js`) → verdi.
- [ ] **Step 4: controllo finale nel Chrome di Irene.** Prima lo si chiede a Irene; poi si apre il sito vero con un **account ospite di prova**, mai il suo. Un Chrome nascosto (Playwright) fa da secondo giocatore, si giocano due round e si scrive un messaggio in chat. Non si invia nulla a persone vere.
- [ ] **Step 5:** memoria (`project_chiavi_nascoste.md`), handoff in `update progetti/coder-handoff/`, `update progetti/global-awakening.md`.
