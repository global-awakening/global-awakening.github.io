# Account lato server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nessuna operazione sugli account è possibile con la sola chiave pubblica: login, registrazione, reset, link d'accesso, profilo e classifica passano da RPC `SECURITY DEFINER` e da una Edge Function, poi `profiles`, `magic_links`, `password_resets` e `telepathy_scores.user_id` si chiudono.

**Architecture:** Migration additiva `26_` (RPC nuove, l'app pubblicata continua a funzionare) → Edge Function `send-account-email` (token generato sul server, email via EmailJS con chiave privata) → app che usa solo le RPC → migration `27_` di chiusura, applicata giorni dopo il deploy. L'hash PBKDF2 resta calcolato nel browser; il server dà il sale e confronta.

**Tech Stack:** Postgres 17 su Supabase (plpgsql, `extensions.pgcrypto`), PostgREST, Supabase Edge Functions (Deno, `npm:` pinnato), React precompilato (`src/app.jsx` → `node build.js` → `app.js`), test Node + Playwright contro il database vero.

**Spec:** `docs/superpowers/specs/2026-09-25-account-lato-server-design.md` (letta per intero prima di iniziare: §0 e §4 sono la fonte delle decisioni).

## Global Constraints

- Ramo `fix/account-lato-server`. **Mai push su `main`**, niente `--force`, niente rebase del ramo una volta pubblicato. Il merge della PR lo lancia Irene (`! gh pr merge N --merge`).
- Ogni RPC: `LANGUAGE plpgsql SECURITY DEFINER`, `SET search_path = public, pg_temp`, email sempre `lower(btrim(...))`. Le funzioni interne (`account_*`, `crea_token_account`) fanno `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated` (in Postgres `EXECUTE` va a `PUBLIC` per default).
- Rifiuti delle RPC d'account = **valore di ritorno** `{ok:false, motivo}`, **mai `RAISE`** (un'eccezione annulla la riga in `login_attempts`). Eccezione unica: `merge_telepathy_scores` fa `RAISE EXCEPTION 'Auth failed'` come le RPC esistenti.
- Formato hash accettato: `^pbkdf2\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$` con iterazioni ≥ 100000.
- Colonne pubbliche di `profiles`: `session_id, nickname, bio, starseed_type, avatar, country, interests, experience_level, telepathy_score, telepathy_best, show_telepathy_score, created_at, updated_at`. Chiuse: `email`, `password_hash`.
- Whitelist di `update_my_profile`: `bio` (≤1000), `starseed_type` (≤100), `avatar` (≤16), `country` (≤100), `interests` (array jsonb di stringhe, ≤30 voci), `experience_level` (≤100), `telepathy_score`, `telepathy_best` (interi ≥0), `show_telepathy_score` (booleano).
- Tetti login: 10 falliti/email/15 min, 30 falliti/IP/15 min, 300 falliti globali/15 min. IP = header `cf-connecting-ip` (verificato il 28/09: `x-forwarded-for` è falsificabile).
- Tetti email: 1/min e 5/ora per email, 30/ora globali.
- Link: sempre `https://global-awakening.github.io/app.html?reset=<token>` / `?magic=<token>`, 15 minuti.
- Versioni `npm:` fissate nelle Edge Function (`npm:@supabase/supabase-js@2.116.0`, come `alert-cron`).
- Dopo ogni modifica a `src/app.jsx` o `app.html`: `node build.js` e committare anche `app.js`/`app.html` rigenerati.
- Server di test: `npx -y serve . -p 4321`. **Verificare che stampi `Accepting connections at http://localhost:4321`**: su Windows un `serve` orfano fa aprire in silenzio un'altra porta.
- Migration applicate con `node scripts/apply-sql.js <file>` (autonomia DB concessa da Irene). **La 27 NON si applica dentro questo piano** senza il via di Irene (Task 12).
- Testi nuovi per l'utente in `en` e `it` (gli unici due dizionari in `src/app.jsx`).
- Non toccare: `increment_telepathy_score` (gonfiabile, fuori scope), le altre tabelle aperte (spec §9), la CSP a mano (la rigenera `build.js`).

## Review Focus

1. **Sessioni già aperte al deploy.** Chi ha nel `localStorage` una credenziale nulla (entrato col link su un account senza hash, prima del fix) salva il profilo: deve vedere un errore, non «salvato». → test in Task 8.
2. **Account vecchio migrato che rientra una seconda volta.** Il secondo login deve usare il sale HMAC salvato alla migrazione e riuscire. → test in Task 2.
3. **Email con maiuscole o spazi** digitata al login, alla registrazione e alla richiesta di link. Deve trovare lo stesso account. → test in Task 2 e Task 3.
4. **Link aperto due volte** (due schede, o doppio tocco sull'email): la prima entra, la seconda riceve «link non valido», e nessuna delle due resta appesa. → test in Task 3 e Task 7.
5. **Chi sbaglia la password qualche volta e poi entra** non deve restare a metà del tetto: il login riuscito azzera i falliti di quell'email. → test in Task 2.

---

## Mappa dei file

| File | Ruolo |
|---|---|
| `supabase/sql/26_account_lato_server.sql` (nuovo) | Tabelle private, helper, tutte le RPC nuove. Additiva. Scritto in tre tappe (Task 2–4), sempre rieseguibile. |
| `supabase/sql/27_chiudi_tabelle_account.sql` (nuovo) | Chiusura. Scritto nel Task 11, applicato solo nel Task 12. |
| `supabase/functions/send-account-email/index.ts` (nuovo) | Edge Function sottile: valida, chiama `crea_token_account`, spedisce. |
| `supabase/functions/send-account-email/email.mjs` (nuovo) | Logica pura (validazione input, parametri del template), testabile da Node. |
| `test-helpers.js` | + `requireServiceKey`, `serviceFetch`, `createTestAccount`, `deleteTestAccount`. |
| `test-account-rpc.js` (nuovo) | Test RPC contro il database vero; `--dopo-chiusura` per le verifiche negative. |
| `test-account-email.js` (nuovo) | Test unitari di `email.mjs` + smoke della funzione pubblicata su email non registrata. |
| `test-account-ui.js` (nuovo) | Playwright: profilo, cambio password e classifica senza accessi diretti alle tabelle (Task 8). |
| `src/app.jsx` | Tutti i punti della tabella §4.3 della spec. |
| `app.html`, `build.js`, `sw.js` | Via EmailJS dal client; cache `ga-pwa-v10`. |
| 13 file `test-*.js` | Fixture spostate su `test-helpers` (Task 1). |

---

### Task 0: Baseline e verifica della sonda

**Files:**
- Create: `.superpowers/sdd/account-baseline.md`

**Interfaces:**
- Produces: l'elenco dei test rossi **prima** di toccare il codice. I task successivi confrontano con questo file: un rosso già qui non è una regressione.

- [ ] **Step 1: Verificare che la funzione sonda del 28/09 sia stata rimossa**

La sonda `zz_sonda_ip` è stata creata e droppata durante la scrittura del piano; il controllo finale è stato bloccato dai permessi. Chiedere a Irene di lanciare nella SQL Editor di Supabase:

```sql
SELECT count(*) FROM pg_proc WHERE proname = 'zz_sonda_ip';
```
Expected: `0`. Se è `1`: `DROP FUNCTION public.zz_sonda_ip(); NOTIFY pgrst, 'reload schema';`

- [ ] **Step 2: Avviare il server e controllare la porta**

Run (in background): `npx -y serve . -p 4321`
Expected: `Accepting connections at http://localhost:4321`

- [ ] **Step 3: Eseguire tutta la suite e annotare l'esito di ogni file**

Run: `for f in test-*.js; do echo "== $f"; node "$f" > /dev/null 2>&1 && echo VERDE || echo ROSSO; done`
Poi rieseguire **due volte** ogni file rosso, per distinguere un rosso deterministico (test vecchio) da uno instabile.

- [ ] **Step 4: Scrivere la baseline**

`.superpowers/sdd/account-baseline.md`: data, commit (`git rev-parse --short HEAD`), una riga per file `VERDE | ROSSO deterministico | ROSSO instabile`, con il messaggio del primo assert fallito per i rossi. Noto in anticipo: rosso preesistente in `test-inviti-telepatia.js` («campanella»).

- [ ] **Step 5: Commit**

```bash
git add .superpowers/sdd/account-baseline.md
git commit -m "test: baseline della suite prima del fix account"
```

---

### Task 1: Fixture dei test sulla chiave di servizio

Dopo la 27 nessun test potrà più scrivere o leggere `profiles.email/password_hash`, `magic_links`, `password_resets`, `telepathy_scores.user_id` con la chiave pubblica. Gli helper con la chiave di servizio funzionano **prima e dopo** la chiusura, quindi questo task si fa per primo e si verifica contro la baseline.

**Files:**
- Modify: `test-helpers.js`
- Modify: `test-account-gdpr.js:44,59,99`, `test-auth.js:56,108,118,141,148,199`, `test-magic-link-bug.js:49,50,102,131`, `test-merge-guest.js:59,97,120,128,143`, `test-moderazione-ui.js:46`, `test-moderazione.js:54,63,64`, `test-reset-password-bug.js:49,50,102,172`, `test-reset-password.js:57`, `test-rituali-impersonation.js:48,55`, `test-telepathy-stats.js:125,139`, `test-telepathy.js:490`

**Interfaces:**
- Produces (in `test-helpers.js`, esportati):
  - `requireServiceKey(): string` — la chiave, oppure stampa l'errore ed esce con `process.exit(2)`.
  - `serviceFetch(path: string, opts?: RequestInit): Promise<{status:number, body:any}>` — REST con la chiave di servizio, `path` relativo a `/rest/v1/`.
  - `createTestAccount({session_id, nickname, email, password_hash, ...campi}): Promise<object>` — insert in `profiles`, lancia se non 2xx; default per i campi mancanti come in `handleRegister`.
  - `deleteTestAccount(email: string): Promise<void>` — cancella il profilo e le righe `magic_links`, `password_resets`, `login_attempts`, `account_email_log` di quell'email (le ultime due possono non esistere ancora: un 404 si ignora).
  - `SUPABASE_URL` (costante, esportata).

- [ ] **Step 1: Aggiungere gli helper**

In `test-helpers.js`, prima di `module.exports`:

```js
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';

/**
 * Come getServiceKey, ma senza chiave il test si FERMA. Dopo la chiusura delle tabelle
 * account (27_) un test senza chiave di servizio non può né creare né verificare niente:
 * lasciarlo proseguire vorrebbe dire vederlo "passare" senza aver controllato nulla.
 */
function requireServiceKey() {
  const key = getServiceKey();
  if (!key) {
    console.error('⛔  SUPABASE_SERVICE_KEY mancante: questo test non può girare senza.');
    console.error('    Copia .env.test.example in .env.test e incolla la chiave di servizio.');
    process.exit(2);
  }
  return key;
}

/** REST con la chiave di servizio (bypassa RLS). Filtri SEMPRE specifici del run. */
async function serviceFetch(p, opts = {}) {
  const key = requireServiceKey();
  const { headers, ...rest } = opts;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...headers,
    },
    ...rest,
  });
  let body = null;
  try { body = await res.json(); } catch { /* vuoto */ }
  return { status: res.status, body };
}

/** Crea un account di test direttamente in profiles, con la chiave di servizio. */
async function createTestAccount(campi) {
  const riga = {
    bio: '', starseed_type: '', avatar: '', country: '', interests: [],
    experience_level: '', telepathy_score: 0, telepathy_best: 0, show_telepathy_score: true,
    ...campi,
  };
  const r = await serviceFetch('profiles', { method: 'POST', body: JSON.stringify(riga) });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`createTestAccount fallito: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return Array.isArray(r.body) ? r.body[0] : r.body;
}

/** Cancella l'account di test e tutto ciò che il flusso account gli ha appeso. */
async function deleteTestAccount(email) {
  const e = encodeURIComponent(email);
  for (const p of [`profiles?email=eq.${e}`, `magic_links?email=eq.${e}`,
                   `password_resets?email=eq.${e}`, `login_attempts?email=eq.${e}`,
                   `account_email_log?email=eq.${e}`]) {
    await serviceFetch(p, { method: 'DELETE' }); // 404 = tabella non ancora creata: va bene
  }
}
```

ed estendere l'export:

```js
module.exports = { loadTestEnv, getServiceKey, purge, loginAsGuest,
  SUPABASE_URL, requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount };
```

- [ ] **Step 2: Spostare ogni file elencato sugli helper**

Regola meccanica, file per file:
- `POST` su `profiles` → `await createTestAccount({...})` (stessi campi del seed attuale).
- `DELETE` su `profiles?email=…` → `await deleteTestAccount(email)`.
- `DELETE` su `profiles?nickname=…` (dove non c'è l'email) → `await serviceFetch(\`profiles?nickname=eq.${enc(n)}\`, { method: 'DELETE' })`.
- Letture di `email`/`password_hash`/`telepathy_score` da `profiles`, e ogni lettura di `telepathy_scores` filtrata per `user_id` o con `select=*` → `(await serviceFetch(path)).body`.
- `POST`/`GET`/`DELETE` su `magic_links` e `password_resets` → `serviceFetch` con lo stesso path e body.
- In testa a ogni file toccato: `requireServiceKey();` subito dopo i `require`.

Esempio, `test-auth.js` righe 108–118 (seed legacy):

```js
    await createTestAccount({
      session_id: `legacy-${ts}`, nickname: nick, email, password_hash: legacyHash,
    });
    const seeded = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(email)}&select=email,password_hash`)).body;
```

Le letture pubbliche che restano legittime anche dopo la 27 (es. `profiles?nickname=eq.X&select=nickname` in `test-account-gdpr.js:99`) si lasciano con la chiave pubblica: provano proprio che la colonna pubblica resta leggibile.

- [ ] **Step 3: Verificare che non resti nessun accesso diretto con la chiave pubblica**

Run: `grep -nE "sb(Fetch)?\(\s*[\`'](profiles|magic_links|password_resets|telepathy_scores)" test-*.js`
Expected: solo letture di colonne pubbliche di `profiles` (nickname, session_id…), nessuna su `email`/`password_hash`, nessuna scrittura, nessuna su `magic_links`/`password_resets`/`telepathy_scores`.

- [ ] **Step 4: Eseguire i 13 file toccati e confrontare con la baseline**

Run: `for f in test-account-gdpr.js test-auth.js test-magic-link-bug.js test-merge-guest.js test-moderazione-ui.js test-moderazione.js test-reset-password-bug.js test-reset-password.js test-rituali-impersonation.js test-telepathy-stats.js test-telepathy.js; do echo "== $f"; node "$f" 2>&1 | tail -3; done`
Expected: stesso esito della baseline file per file.

- [ ] **Step 5: Commit**

```bash
git add test-helpers.js test-*.js
git commit -m "test: fixture account sulla chiave di servizio, pronte per la chiusura"
```

---

### Task 2: Migration 26, parte A — login e registrazione

**Files:**
- Create: `supabase/sql/26_account_lato_server.sql`
- Create: `test-account-rpc.js`

**Interfaces:**
- Produces (SQL, tutte `GRANT EXECUTE … TO anon, authenticated` salvo dove detto):
  - `get_login_params(p_email text) RETURNS jsonb` → `{iter:int, salt:text}` (salt base64 di 16 byte, 24 caratteri).
  - `login_with_password(p_email text, p_hash text, p_legacy_hash text) RETURNS jsonb` → `{ok:true, migrato:bool, profilo:{session_id,nickname,email,bio,starseed_type,avatar,country,interests,experience_level,telepathy_score,telepathy_best,show_telepathy_score}}` | `{ok:false, motivo:'dati_non_validi'|'troppi_tentativi'|'credenziali_non_valide'}`. La credenziale da tenere nel client è `p_hash`.
  - `register_account(p_session_id text, p_nickname text, p_email text, p_hash text) RETURNS jsonb` → `{ok:true, profilo:{…}}` | `{ok:false, motivo:'dati_non_validi'|'troppi_tentativi'|'email_in_uso'|'nickname_in_uso'}`.
  - Interne (no grant): `account_ip_richiesta() → text`, `account_hash_valido(text) → boolean`, `account_profilo_json(profiles) → jsonb`, `account_troppi_tentativi(text, text) → boolean`, `account_registra_fallimento(text, text) → void`.
  - Tabelle private: `app_secrets(nome text pk, valore bytea)`, `login_attempts(id, email, ip, created_at)`.

- [ ] **Step 1: Scrivere il test che fallisce**

`test-account-rpc.js`:

```js
/**
 * RPC d'account lato server — Global Awakening
 *
 * Verifica supabase/sql/26_account_lato_server.sql contro il database vero. Ogni RPC va
 * provata per quello che LASCIA PASSARE e per quello che ferma.
 *
 * Esecuzione:
 *   node test-account-rpc.js                  # RPC (prima e dopo la chiusura)
 *   node test-account-rpc.js --dopo-chiusura  # + verifiche negative della 27_
 *
 * Setup e pulizia con la chiave di servizio (test-helpers). Senza chiave il test si ferma.
 */
const crypto = require('crypto');
const { requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount, SUPABASE_URL } = require('./test-helpers');

requireServiceKey();
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const DOPO_CHIUSURA = process.argv.includes('--dopo-chiusura');
const TS = Date.now();
const INIZIO = new Date().toISOString();
const EMAILS = [];
const nuovaEmail = (tag) => { const e = `acct-${tag}-${TS}@test.com`; EMAILS.push(e); return e; };

let passed = 0, failed = 0;
const pass = (m) => { console.log(`  ✅ ${m}`); passed++; };
const fail = (m) => { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; };
const check = (cond, m, extra) => cond ? pass(m) : fail(extra ? `${m} — ${JSON.stringify(extra)}` : m);

async function anon(p, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json',
               Prefer: 'return=representation', ...(opts.headers || {}) },
    ...opts,
  });
  let body = null; try { body = await res.json(); } catch { /* vuoto */ }
  return { status: res.status, body };
}
const rpc = (fn, params) => anon(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });

// Stessa derivazione di deriveStrongHash in src/app.jsx.
function pbkdf2(password, saltB64, iter = 100000) {
  const bits = crypto.pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), iter, 32, 'sha256');
  return `pbkdf2$${iter}$${saltB64}$${bits.toString('base64')}`;
}
const sha256hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const nuovoSale = () => crypto.randomBytes(16).toString('base64');

async function creaAccount(tag, password, { legacy = false, senzaHash = false } = {}) {
  const email = nuovaEmail(tag);
  const nickname = `Acct${tag}_${TS}`.slice(0, 50);
  const password_hash = senzaHash ? null : legacy ? sha256hex(password) : pbkdf2(password, nuovoSale());
  await createTestAccount({ session_id: `acct-${tag}-${TS}`, nickname, email, password_hash });
  return { email, nickname, password_hash, session_id: `acct-${tag}-${TS}` };
}

// Login come lo fa l'app: parametri → hash con quel sale → RPC con entrambi gli hash.
async function login(email, password) {
  const par = (await rpc('get_login_params', { p_email: email })).body;
  const h = pbkdf2(password, par.salt, par.iter);
  const r = await rpc('login_with_password', { p_email: email, p_hash: h, p_legacy_hash: sha256hex(password) });
  return { ...r.body, hash: h };
}

async function testLoginERegistrazione() {
  console.log('\n— get_login_params / login_with_password / register_account —');
  const PW = 'Password123!';
  const a = await creaAccount('pbk', PW);

  // Forma identica per account PBKDF2, account vecchio, email sconosciuta.
  const vecchio = await creaAccount('leg', PW, { legacy: true });
  const pA = (await rpc('get_login_params', { p_email: a.email })).body;
  const pL = (await rpc('get_login_params', { p_email: vecchio.email })).body;
  const pX = (await rpc('get_login_params', { p_email: `nessuno-${TS}@test.com` })).body;
  const chiavi = (o) => Object.keys(o || {}).sort().join(',');
  check(chiavi(pA) === 'iter,salt' && chiavi(pL) === 'iter,salt' && chiavi(pX) === 'iter,salt',
    'get_login_params ha sempre e solo {iter, salt}', { pA, pL, pX });
  check(pA.salt === a.password_hash.split('$')[2], 'account PBKDF2: sale letto dall\'hash salvato');
  const pX2 = (await rpc('get_login_params', { p_email: `nessuno-${TS}@test.com` })).body;
  check(pX.salt === pX2.salt && pX.salt.length === 24, 'email sconosciuta: sale finto stabile tra due chiamate');

  // Login giusto, sbagliato, email con maiuscole e spazi.
  const ok = await login(a.email, PW);
  check(ok.ok === true && ok.profilo && ok.profilo.session_id === a.session_id, 'login con la password giusta', ok);
  check(ok.profilo && !('password_hash' in ok.profilo), 'il profilo restituito non contiene password_hash');
  const ko = await login(a.email, 'sbagliata');
  check(ko.ok === false && ko.motivo === 'credenziali_non_valide', 'password sbagliata rifiutata', ko);
  const maiusc = await login(`  ${a.email.toUpperCase()} `, PW);
  check(maiusc.ok === true, 'email con maiuscole e spazi trova lo stesso account', maiusc);
  const nessuno = await login(`nessuno-${TS}@test.com`, PW);
  check(nessuno.ok === false && nessuno.motivo === 'credenziali_non_valide', 'email sconosciuta: stesso rifiuto');

  // Account vecchio: entra, migra, rientra col sale HMAC salvato.
  const l1 = await login(vecchio.email, PW);
  check(l1.ok === true && l1.migrato === true, 'account SHA-256 entra e viene migrato', l1);
  const salvato = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(vecchio.email)}&select=password_hash`)).body[0].password_hash;
  check(salvato === l1.hash, 'hash salvato = hash PBKDF2 mandato dal client');
  const l2 = await login(vecchio.email, PW);
  check(l2.ok === true && l2.migrato === false && l2.hash === l1.hash, 'account migrato rientra una seconda volta', l2);

  // Account senza hash: nessuna password è buona.
  const senza = await creaAccount('noh', PW, { senzaHash: true });
  const s = await login(senza.email, 'qualunque');
  check(s.ok === false && s.motivo === 'credenziali_non_valide', 'account senza hash: rifiutato con qualunque password', s);

  // Formato hash errato.
  const f = await rpc('login_with_password', { p_email: a.email, p_hash: 'abc', p_legacy_hash: null });
  check(f.body && f.body.motivo === 'dati_non_validi', 'hash malformato → dati_non_validi', f.body);

  // Tetto per email: il rifiuto deve essere CONTATO (niente rollback).
  const t = await creaAccount('tetto', PW);
  for (let i = 0; i < 10; i++) await login(t.email, 'sbagliata');
  const bloccato = await login(t.email, PW);
  check(bloccato.ok === false && bloccato.motivo === 'troppi_tentativi', '11° tentativo (anche giusto) → troppi_tentativi', bloccato);
  const righe = (await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(t.email)}&select=id`)).body;
  check(Array.isArray(righe) && righe.length >= 10, 'le righe dei falliti sopravvivono al rifiuto', righe && righe.length);

  // Login riuscito azzera i falliti.
  const z = await creaAccount('azzera', PW);
  for (let i = 0; i < 3; i++) await login(z.email, 'sbagliata');
  await login(z.email, PW);
  const dopo = (await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(z.email)}&select=id`)).body;
  check(Array.isArray(dopo) && dopo.length === 0, 'login riuscito cancella i falliti di quell\'email', dopo);

  // Tetto per IP: si legge l'IP registrato da un fallito vero e si riempie la finestra.
  const ipRiga = (await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(t.email)}&select=ip&limit=1`)).body;
  const ip = ipRiga && ipRiga[0] && ipRiga[0].ip;
  check(!!ip, 'l\'IP del chiamante viene registrato (cf-connecting-ip)', ipRiga);
  if (ip) {
    const finte = Array.from({ length: 30 }, (_, i) => ({ email: `acct-ipfill-${i}-${TS}@test.com`, ip }));
    await serviceFetch('login_attempts', { method: 'POST', body: JSON.stringify(finte) });
    const fresco = await creaAccount('ipnuovo', PW);
    const r = await login(fresco.email, PW);
    check(r.ok === false && r.motivo === 'troppi_tentativi', '30 falliti dallo stesso IP → anche un\'altra email è bloccata', r);
    await serviceFetch(`login_attempts?email=like.acct-ipfill-*-${TS}@test.com`, { method: 'DELETE' });
    await serviceFetch(`login_attempts?ip=eq.${encodeURIComponent(ip)}&created_at=gte.${INIZIO}`, { method: 'DELETE' });
    const sblocco = await login(fresco.email, PW);
    check(sblocco.ok === true, 'svuotata la finestra, lo stesso IP rientra', sblocco);
  }

  // Registrazione.
  const email = nuovaEmail('reg');
  const nick = `AcctReg_${TS}`;
  const h = pbkdf2(PW, nuovoSale());
  const reg = await rpc('register_account', { p_session_id: `acct-reg-${TS}`, p_nickname: nick, p_email: ` ${email.toUpperCase()} `, p_hash: h });
  check(reg.body && reg.body.ok === true, 'registrazione riuscita', reg.body);
  const riga = (await serviceFetch(`profiles?session_id=eq.acct-reg-${TS}&select=email,password_hash`)).body[0];
  check(riga && riga.email === email && riga.password_hash === h, 'email salvata normalizzata, hash salvato così com\'è', riga);
  const dupE = await rpc('register_account', { p_session_id: `acct-reg2-${TS}`, p_nickname: `Altro_${TS}`, p_email: email, p_hash: h });
  check(dupE.body && dupE.body.motivo === 'email_in_uso', 'email già usata → email_in_uso', dupE.body);
  const dupN = await rpc('register_account', { p_session_id: `acct-reg3-${TS}`, p_nickname: nick, p_email: nuovaEmail('reg3'), p_hash: h });
  check(dupN.body && dupN.body.motivo === 'nickname_in_uso', 'nickname già usato → nickname_in_uso', dupN.body);
  const malH = await rpc('register_account', { p_session_id: `acct-reg4-${TS}`, p_nickname: `Nuovo_${TS}`, p_email: nuovaEmail('reg4'), p_hash: sha256hex(PW) });
  check(malH.body && malH.body.motivo === 'dati_non_validi', 'hash non PBKDF2 alla registrazione → dati_non_validi', malH.body);
}

async function pulizia() {
  for (const e of EMAILS) await deleteTestAccount(e);
  await serviceFetch(`login_attempts?email=like.nessuno-${TS}@test.com`, { method: 'DELETE' });
}

(async () => {
  try {
    await testLoginERegistrazione();
  } catch (e) {
    fail('eccezione: ' + e.message);
  } finally {
    await pulizia();
    console.log(`\n${passed} passati, ${failed} falliti`);
  }
})();
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `node test-account-rpc.js`
Expected: FAIL — `get_login_params` inesistente (404 da PostgREST), primi assert rossi.

- [ ] **Step 3: Scrivere la parte A della migration**

`supabase/sql/26_account_lato_server.sql`:

```sql
-- ============================================================================
-- Account lato server, parte additiva — 28/09/2026
--
-- Spec: docs/superpowers/specs/2026-09-25-account-lato-server-design.md
--
-- Aggiunge soltanto: nessuna tabella viene chiusa qui (lo fa la 27_), quindi l'app già
-- pubblicata continua a funzionare mentre quella nuova passa da queste funzioni.
--
-- Perché i rifiuti sono valori e non eccezioni: un RAISE annulla l'intera chiamata, compresa
-- la riga scritta in login_attempts. Il tetto dei tentativi non conterebbe mai niente.
--
-- Idempotente: si può rieseguire.
-- ============================================================================

-- ── Tabelle private ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_secrets (
  nome   text PRIMARY KEY,
  valore bytea NOT NULL
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_secrets FROM PUBLIC, anon, authenticated;
-- Segreto del sale finto: rende la risposta di get_login_params uguale per chi esiste e per
-- chi no. Generato una volta; rieseguire la migration non lo cambia.
INSERT INTO app_secrets (nome, valore)
VALUES ('login_salt', extensions.gen_random_bytes(32))
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS login_attempts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx    ON login_attempts (ip, created_at);
CREATE INDEX IF NOT EXISTS login_attempts_time_idx  ON login_attempts (created_at);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
-- Esplicito: i privilegi di default di Supabase darebbero la tabella ad anon.
REVOKE ALL ON login_attempts FROM PUBLIC, anon, authenticated;

-- ── Helper interni ─────────────────────────────────────────────────────────
-- IP del chiamante. cf-connecting-ip lo scrive Cloudflare e un client non può sceglierlo
-- (verificato il 28/09: la richiesta con quell'header viene rifiutata, errore 1000). Il primo
-- valore di x-forwarded-for invece lo sceglie chi chiama.
CREATE OR REPLACE FUNCTION account_ip_richiesta()
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT nullif(btrim((coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json)
                      ->> 'cf-connecting-ip'), '')
$$;

CREATE OR REPLACE FUNCTION account_hash_valido(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p IS NULL OR p !~ '^pbkdf2\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$' THEN false
    ELSE split_part(p, '$', 2)::int >= 100000
  END
$$;

CREATE OR REPLACE FUNCTION account_profilo_json(p profiles)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'session_id', p.session_id, 'nickname', p.nickname, 'email', p.email,
    'bio', p.bio, 'starseed_type', p.starseed_type, 'avatar', p.avatar,
    'country', p.country, 'interests', p.interests, 'experience_level', p.experience_level,
    'telepathy_score', p.telepathy_score, 'telepathy_best', p.telepathy_best,
    'show_telepathy_score', p.show_telepathy_score)
$$;

CREATE OR REPLACE FUNCTION account_troppi_tentativi(p_email text, p_ip text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT
       (SELECT count(*) FROM login_attempts
         WHERE email = p_email AND created_at > now() - interval '15 minutes') >= 10
    OR (p_ip IS NOT NULL AND (SELECT count(*) FROM login_attempts
         WHERE ip = p_ip AND created_at > now() - interval '15 minutes') >= 30)
    OR (SELECT count(*) FROM login_attempts
         WHERE created_at > now() - interval '15 minutes') >= 300
$$;

CREATE OR REPLACE FUNCTION account_registra_fallimento(p_email text, p_ip text)
RETURNS void LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  INSERT INTO login_attempts (email, ip) VALUES (p_email, p_ip);
  DELETE FROM login_attempts WHERE created_at < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION account_ip_richiesta()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION account_hash_valido(text)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION account_profilo_json(profiles)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION account_troppi_tentativi(text, text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION account_registra_fallimento(text, text)   FROM PUBLIC, anon, authenticated;

-- ── get_login_params ───────────────────────────────────────────────────────
-- Sempre e solo {iter, salt}. Per un account vecchio (SHA-256) o un'email che non esiste il
-- sale è HMAC(email, segreto): stabile, e indistinguibile da uno vero. Per l'account vecchio è
-- anche il sale con cui verrà salvato l'hash nuovo alla migrazione.
CREATE OR REPLACE FUNCTION get_login_params(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_hash   text;
  v_secret bytea;
BEGIN
  SELECT password_hash INTO v_hash FROM profiles WHERE email = v_email;
  IF account_hash_valido(v_hash) THEN
    RETURN jsonb_build_object('iter', split_part(v_hash, '$', 2)::int,
                              'salt', split_part(v_hash, '$', 3));
  END IF;
  SELECT valore INTO v_secret FROM app_secrets WHERE nome = 'login_salt';
  RETURN jsonb_build_object(
    'iter', 100000,
    'salt', encode(substring(extensions.hmac(convert_to(v_email, 'UTF8'), v_secret, 'sha256') FROM 1 FOR 16), 'base64'));
END;
$$;

-- ── login_with_password ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION login_with_password(p_email text, p_hash text, p_legacy_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_ip      text := account_ip_richiesta();
  v_p       profiles%ROWTYPE;
  v_ok      boolean := false;
  v_migrato boolean := false;
BEGIN
  IF v_email = '' OR length(v_email) > 254 OR NOT account_hash_valido(p_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  IF account_troppi_tentativi(v_email, v_ip) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'troppi_tentativi');
  END IF;

  SELECT * INTO v_p FROM profiles WHERE email = v_email;
  IF FOUND AND v_p.password_hash IS NOT NULL THEN
    IF v_p.password_hash LIKE 'pbkdf2$%' THEN
      v_ok := v_p.password_hash = p_hash;
    ELSE
      -- Account vecchio: si confronta l'SHA-256 e si salva al suo posto l'hash PBKDF2 che il
      -- client ha calcolato col sale HMAC ricevuto da get_login_params.
      v_ok := p_legacy_hash IS NOT NULL AND v_p.password_hash = p_legacy_hash;
      IF v_ok THEN
        UPDATE profiles SET password_hash = p_hash, updated_at = now()
         WHERE session_id = v_p.session_id;
        v_migrato := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_ok THEN
    PERFORM account_registra_fallimento(v_email, v_ip);
    RETURN jsonb_build_object('ok', false, 'motivo', 'credenziali_non_valide');
  END IF;

  DELETE FROM login_attempts WHERE email = v_email;
  RETURN jsonb_build_object('ok', true, 'migrato', v_migrato, 'profilo', account_profilo_json(v_p));
END;
$$;

-- ── register_account ───────────────────────────────────────────────────────
-- email_in_uso rivela chi è iscritto: rischio accettato (spec §4.1). Ogni email_in_uso conta
-- come fallito per l'IP, così provarne mille dallo stesso posto si ferma al tetto.
CREATE OR REPLACE FUNCTION register_account(p_session_id text, p_nickname text, p_email text, p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nick  text := btrim(coalesce(p_nickname, ''));
  v_sid   text := btrim(coalesce(p_session_id, ''));
  v_ip    text := account_ip_richiesta();
  v_p     profiles%ROWTYPE;
BEGIN
  IF v_nick = '' OR length(v_nick) > 50
     OR v_sid = '' OR length(v_sid) > 100
     OR length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR NOT account_hash_valido(p_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  IF account_troppi_tentativi(v_email, v_ip) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'troppi_tentativi');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE email = v_email) THEN
    PERFORM account_registra_fallimento(NULL, v_ip);
    RETURN jsonb_build_object('ok', false, 'motivo', 'email_in_uso');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE nickname = v_nick) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nickname_in_uso');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE session_id = v_sid) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;

  BEGIN
    INSERT INTO profiles (session_id, nickname, email, password_hash, bio, starseed_type, avatar,
                          country, interests, experience_level, telepathy_score, telepathy_best,
                          show_telepathy_score)
    VALUES (v_sid, v_nick, v_email, p_hash, '', '', '', '', '[]'::jsonb, '', 0, 0, true)
    RETURNING * INTO v_p;
  EXCEPTION WHEN unique_violation THEN
    -- Due registrazioni con la stessa email nello stesso istante: vince la prima.
    RETURN jsonb_build_object('ok', false, 'motivo', 'email_in_uso');
  END;

  RETURN jsonb_build_object('ok', true, 'profilo', account_profilo_json(v_p));
END;
$$;

GRANT EXECUTE ON FUNCTION get_login_params(text)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION login_with_password(text, text, text)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION register_account(text, text, text, text)       TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Applicare e rieseguire il test**

Run: `node scripts/apply-sql.js supabase/sql/26_account_lato_server.sql && node test-account-rpc.js`
Expected: tutti ✅. Se `extensions.hmac` non esiste con quella firma: `SELECT extensions.hmac('a'::bytea, 'b'::bytea, 'sha256')` nella SQL Editor per verificarlo; non cambiare algoritmo.

- [ ] **Step 5: Rieseguire per l'idempotenza**

Run: `node scripts/apply-sql.js supabase/sql/26_account_lato_server.sql && node test-account-rpc.js`
Expected: applicata senza errori, test ancora verdi (il segreto non cambia: `ON CONFLICT DO NOTHING`).

- [ ] **Step 6: Commit**

```bash
git add supabase/sql/26_account_lato_server.sql test-account-rpc.js
git commit -m "feat(db): login e registrazione lato server (26_, parte A)"
```

---

### Task 3: Migration 26, parte B — link, reset, cambio password, profilo, token

**Files:**
- Modify: `supabase/sql/26_account_lato_server.sql` (aggiungere in fondo, prima di `NOTIFY`)
- Modify: `test-account-rpc.js` (nuova funzione `testLinkResetProfilo`, chiamata dopo `testLoginERegistrazione`)

**Interfaces:**
- Consumes: `account_hash_valido`, `account_profilo_json` (Task 2).
- Produces:
  - `consume_magic_link(p_token text) RETURNS jsonb` → `{ok:true, profilo:{…}, password_hash:text}` | `{ok:false, motivo:'token_non_valido'}`.
  - `reset_password(p_token text, p_new_hash text) RETURNS jsonb` → `{ok:true}` | `{ok:false, motivo:'token_non_valido'|'dati_non_validi'}`.
  - `change_password(p_nickname text, p_old_hash text, p_new_hash text) RETURNS jsonb` → `{ok:true}` | `{ok:false, motivo:'credenziali_non_valide'|'dati_non_validi'}`.
  - `update_my_profile(p_nickname text, p_password_hash text, p_fields jsonb) RETURNS jsonb` → `{ok:true}` | `{ok:false, motivo:'credenziali_non_valide'|'dati_non_validi'}`.
  - `crea_token_account(p_tipo text, p_email text) RETURNS text` — token o `NULL`; **solo il ruolo di servizio** (vedi nota sotto il blocco SQL del Task 3).
  - Tabella privata `account_email_log(id, email, tipo, created_at)`.

- [ ] **Step 1: Scrivere i test che falliscono**

In `test-account-rpc.js`, dopo `testLoginERegistrazione`:

```js
async function rpcServizio(fn, params) {
  return serviceFetch(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
}

async function testLinkResetProfilo() {
  console.log('\n— consume_magic_link / reset_password / change_password / update_my_profile / crea_token_account —');
  const PW = 'Password123!';

  // crea_token_account: solo il ruolo di servizio.
  const a = await creaAccount('link', PW);
  const daAnon = await rpc('crea_token_account', { p_tipo: 'magic', p_email: a.email });
  check(daAnon.status >= 400, 'crea_token_account NON è chiamabile con la chiave pubblica', daAnon.status);
  const t1 = (await rpcServizio('crea_token_account', { p_tipo: 'magic', p_email: ` ${a.email.toUpperCase()}` })).body;
  check(typeof t1 === 'string' && t1.length >= 32, 'la chiave di servizio ottiene un token per un\'email registrata (maiuscole ok)', t1);
  const tX = (await rpcServizio('crea_token_account', { p_tipo: 'magic', p_email: `nessuno-${TS}@test.com` })).body;
  check(tX === null, 'email non registrata → nessun token', tX);
  const tFretta = (await rpcServizio('crea_token_account', { p_tipo: 'magic', p_email: a.email })).body;
  check(tFretta === null, 'seconda richiesta nello stesso minuto → nessun token (tetto 1/min)', tFretta);

  // consume_magic_link: uso singolo, restituisce la credenziale.
  const c1 = (await rpc('consume_magic_link', { p_token: t1 })).body;
  check(c1 && c1.ok === true && c1.password_hash === a.password_hash && c1.profilo.session_id === a.session_id,
    'link valido → profilo e credenziale', c1);
  const c2 = (await rpc('consume_magic_link', { p_token: t1 })).body;
  check(c2 && c2.ok === false && c2.motivo === 'token_non_valido', 'lo stesso link aperto due volte → token_non_valido', c2);

  // Link scaduto.
  const b = await creaAccount('scad', PW);
  const tokScad = crypto.randomUUID();
  await serviceFetch('magic_links', { method: 'POST', body: JSON.stringify({ email: b.email, token: tokScad, expires_at: new Date(Date.now() - 60000).toISOString() }) });
  const cs = (await rpc('consume_magic_link', { p_token: tokScad })).body;
  check(cs && cs.ok === false, 'link scaduto → rifiutato', cs);

  // Account senza hash: il link crea una credenziale casuale.
  const n = await creaAccount('linknoh', PW, { senzaHash: true });
  const tn = (await rpcServizio('crea_token_account', { p_tipo: 'magic', p_email: n.email })).body;
  const cn = (await rpc('consume_magic_link', { p_token: tn })).body;
  const salvataN = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(n.email)}&select=password_hash`)).body[0].password_hash;
  check(cn && cn.ok === true && /^pbkdf2\$/.test(cn.password_hash || '') && salvataN === cn.password_hash,
    'account senza hash: il link crea e salva una credenziale', cn);

  // reset_password.
  const r = await creaAccount('reset', PW);
  const tr = (await rpcServizio('crea_token_account', { p_tipo: 'reset', p_email: r.email })).body;
  const nuovo = pbkdf2('Nuova456!', nuovoSale());
  const malR = (await rpc('reset_password', { p_token: tr, p_new_hash: 'abc' })).body;
  check(malR && malR.motivo === 'dati_non_validi', 'reset con hash malformato → dati_non_validi (token non consumato)', malR);
  const okR = (await rpc('reset_password', { p_token: tr, p_new_hash: nuovo })).body;
  check(okR && okR.ok === true, 'reset con token valido', okR);
  check((await login(r.email, 'Nuova456!')).ok === true, 'dopo il reset si entra con la password nuova');
  const riusoR = (await rpc('reset_password', { p_token: tr, p_new_hash: nuovo })).body;
  check(riusoR && riusoR.motivo === 'token_non_valido', 'token di reset riusato → token_non_valido', riusoR);

  // change_password: esige sempre la vecchia credenziale.
  const c = await creaAccount('chg', PW);
  const nuovoC = pbkdf2('Cambiata789!', nuovoSale());
  const senzaVecchia = (await rpc('change_password', { p_nickname: c.nickname, p_old_hash: null, p_new_hash: nuovoC })).body;
  check(senzaVecchia && senzaVecchia.ok === false, 'cambio password con vecchia nulla → rifiutato', senzaVecchia);
  const vecchiaErrata = (await rpc('change_password', { p_nickname: c.nickname, p_old_hash: pbkdf2('x', nuovoSale()), p_new_hash: nuovoC })).body;
  check(vecchiaErrata && vecchiaErrata.motivo === 'credenziali_non_valide', 'cambio password con vecchia errata → rifiutato', vecchiaErrata);
  const okC = (await rpc('change_password', { p_nickname: c.nickname, p_old_hash: c.password_hash, p_new_hash: nuovoC })).body;
  check(okC && okC.ok === true, 'cambio password con la vecchia giusta', okC);
  check((await login(c.email, 'Cambiata789!')).ok === true, 'dopo il cambio si entra con la password nuova');

  // update_my_profile: whitelist e credenziale.
  const p = await creaAccount('prof', PW);
  const upOk = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash,
    p_fields: { bio: 'ciao', interests: ['meditazione'], telepathy_score: 3, show_telepathy_score: false } })).body;
  check(upOk && upOk.ok === true, 'modifica dei campi pubblici', upOk);
  const letta = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(p.email)}&select=bio,interests,telepathy_score,show_telepathy_score,email`)).body[0];
  check(letta.bio === 'ciao' && letta.interests[0] === 'meditazione' && letta.telepathy_score === 3 && letta.show_telepathy_score === false,
    'i campi sono davvero scritti', letta);
  const fuori = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash, p_fields: { email: 'x@y.z' } })).body;
  check(fuori && fuori.motivo === 'dati_non_validi', 'campo fuori whitelist (email) → dati_non_validi', fuori);
  const fuori2 = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash, p_fields: { password_hash: 'x' } })).body;
  check(fuori2 && fuori2.motivo === 'dati_non_validi', 'campo fuori whitelist (password_hash) → dati_non_validi', fuori2);
  const lungo = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash, p_fields: { bio: 'x'.repeat(1001) } })).body;
  check(lungo && lungo.motivo === 'dati_non_validi', 'bio oltre 1000 caratteri → dati_non_validi', lungo);
  const senzaCred = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: null, p_fields: { bio: 'hack' } })).body;
  check(senzaCred && senzaCred.motivo === 'credenziali_non_valide', 'credenziale nulla → credenziali_non_valide', senzaCred);
  const bio = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(p.email)}&select=bio`)).body[0].bio;
  check(bio === 'ciao', 'dopo i rifiuti il profilo è invariato', bio);
}
```

e nel blocco principale: `await testLoginERegistrazione(); await testLinkResetProfilo();`

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `node test-account-rpc.js`
Expected: parte A verde, parte B rossa (funzioni inesistenti).

- [ ] **Step 3: Aggiungere la parte B alla migration**

In `26_account_lato_server.sql`, prima del `NOTIFY` finale:

```sql
-- ── Storico delle email d'account (tetti) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS account_email_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL,
  tipo       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_email_log_idx ON account_email_log (email, created_at);
ALTER TABLE account_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_email_log FROM PUBLIC, anon, authenticated;

-- ── crea_token_account (solo ruolo di servizio, la chiama send-account-email) ──
-- NULL vuol dire «non spedire»: email non registrata o tetto raggiunto. La funzione Edge
-- risponde comunque «se l'indirizzo è registrato, ti abbiamo scritto».
CREATE OR REPLACE FUNCTION crea_token_account(p_tipo text, p_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := gen_random_uuid()::text;
BEGIN
  IF p_tipo NOT IN ('reset', 'magic') THEN
    RAISE EXCEPTION 'tipo non valido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE email = v_email) THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM account_email_log WHERE email = v_email AND created_at > now() - interval '1 minute') >= 1
     OR (SELECT count(*) FROM account_email_log WHERE email = v_email AND created_at > now() - interval '1 hour') >= 5
     OR (SELECT count(*) FROM account_email_log WHERE created_at > now() - interval '1 hour') >= 30 THEN
    RETURN NULL;
  END IF;

  INSERT INTO account_email_log (email, tipo) VALUES (v_email, p_tipo);
  DELETE FROM account_email_log WHERE created_at < now() - interval '1 day';

  IF p_tipo = 'reset' THEN
    DELETE FROM password_resets WHERE email = v_email;
    INSERT INTO password_resets (email, token, expires_at) VALUES (v_email, v_token, now() + interval '15 minutes');
  ELSE
    DELETE FROM magic_links WHERE email = v_email;
    INSERT INTO magic_links (email, token, expires_at) VALUES (v_email, v_token, now() + interval '15 minutes');
  END IF;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION crea_token_account(text, text) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE al ruolo di servizio: vedi la nota sotto questo blocco.

-- ── consume_magic_link ─────────────────────────────────────────────────────
-- Chi apre il link dalla propria casella riceve la credenziale per le RPC, come oggi. Se
-- l'account non ne ha una (creato da flussi vecchi) gliene nasce una casuale: senza, resterebbe
-- dentro l'app senza poter mandare un messaggio.
CREATE OR REPLACE FUNCTION consume_magic_link(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text;
  v_scade timestamptz;
  v_p     profiles%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;
  -- Cancellato prima di tutto il resto: uso singolo anche con due schede aperte insieme.
  DELETE FROM magic_links WHERE token = p_token RETURNING email, expires_at INTO v_email, v_scade;
  IF v_email IS NULL OR v_scade < now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;

  SELECT * INTO v_p FROM profiles WHERE email = lower(v_email);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;
  IF v_p.password_hash IS NULL THEN
    UPDATE profiles
       SET password_hash = 'pbkdf2$100000$' || encode(extensions.gen_random_bytes(16), 'base64')
                           || '$' || encode(extensions.gen_random_bytes(32), 'base64'),
           updated_at = now()
     WHERE session_id = v_p.session_id
    RETURNING * INTO v_p;
  END IF;

  RETURN jsonb_build_object('ok', true, 'profilo', account_profilo_json(v_p),
                            'password_hash', v_p.password_hash);
END;
$$;

-- ── reset_password ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_password(p_token text, p_new_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text;
  v_scade timestamptz;
BEGIN
  -- Il formato si controlla PRIMA di consumare il token: un errore del client non deve
  -- costringere a chiedere un'altra email.
  IF NOT account_hash_valido(p_new_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  IF p_token IS NULL OR length(p_token) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;
  DELETE FROM password_resets WHERE token = p_token RETURNING email, expires_at INTO v_email, v_scade;
  IF v_email IS NULL OR v_scade < now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;

  UPDATE profiles SET password_hash = p_new_hash, updated_at = now() WHERE email = lower(v_email);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_non_valido');
  END IF;
  DELETE FROM magic_links WHERE email = lower(v_email);
  DELETE FROM login_attempts WHERE email = lower(v_email);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── change_password ────────────────────────────────────────────────────────
-- La vecchia credenziale è quella che l'app tiene in localStorage: non si chiede di ridigitare
-- la password (lo schermo resta com'è), ma senza la credenziale non si cambia niente.
CREATE OR REPLACE FUNCTION change_password(p_nickname text, p_old_hash text, p_new_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_old_hash IS NULL OR p_nickname IS NULL OR NOT account_hash_valido(p_new_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  UPDATE profiles SET password_hash = p_new_hash, updated_at = now()
   WHERE nickname = p_nickname AND password_hash = p_old_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'credenziali_non_valide');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── update_my_profile ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_my_profile(p_nickname text, p_password_hash text, p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ammessi text[] := ARRAY['bio','starseed_type','avatar','country','interests','experience_level',
                            'telepathy_score','telepathy_best','show_telepathy_score'];
  v_f jsonb := p_fields;
BEGIN
  IF v_f IS NULL OR jsonb_typeof(v_f) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_f) k WHERE k <> ALL (v_ammessi))
     OR (v_f ? 'bio'              AND (jsonb_typeof(v_f->'bio') <> 'string'              OR length(v_f->>'bio') > 1000))
     OR (v_f ? 'starseed_type'    AND (jsonb_typeof(v_f->'starseed_type') <> 'string'    OR length(v_f->>'starseed_type') > 100))
     OR (v_f ? 'avatar'           AND (jsonb_typeof(v_f->'avatar') <> 'string'           OR length(v_f->>'avatar') > 16))
     OR (v_f ? 'country'          AND (jsonb_typeof(v_f->'country') <> 'string'          OR length(v_f->>'country') > 100))
     OR (v_f ? 'experience_level' AND (jsonb_typeof(v_f->'experience_level') <> 'string' OR length(v_f->>'experience_level') > 100))
     OR (v_f ? 'interests' AND (jsonb_typeof(v_f->'interests') <> 'array'
                                OR jsonb_array_length(v_f->'interests') > 30
                                OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_f->'interests') e
                                            WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') > 100)))
     OR (v_f ? 'telepathy_score' AND (jsonb_typeof(v_f->'telepathy_score') <> 'number' OR (v_f->>'telepathy_score')::numeric < 0
                                      OR (v_f->>'telepathy_score')::numeric <> floor((v_f->>'telepathy_score')::numeric)))
     OR (v_f ? 'telepathy_best'  AND (jsonb_typeof(v_f->'telepathy_best') <> 'number'  OR (v_f->>'telepathy_best')::numeric < 0
                                      OR (v_f->>'telepathy_best')::numeric <> floor((v_f->>'telepathy_best')::numeric)))
     OR (v_f ? 'show_telepathy_score' AND jsonb_typeof(v_f->'show_telepathy_score') <> 'boolean') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;

  UPDATE profiles SET
    bio                  = CASE WHEN v_f ? 'bio'                  THEN v_f->>'bio'                     ELSE bio END,
    starseed_type        = CASE WHEN v_f ? 'starseed_type'        THEN v_f->>'starseed_type'           ELSE starseed_type END,
    avatar               = CASE WHEN v_f ? 'avatar'               THEN v_f->>'avatar'                  ELSE avatar END,
    country              = CASE WHEN v_f ? 'country'              THEN v_f->>'country'                 ELSE country END,
    interests            = CASE WHEN v_f ? 'interests'            THEN v_f->'interests'                ELSE interests END,
    experience_level     = CASE WHEN v_f ? 'experience_level'     THEN v_f->>'experience_level'        ELSE experience_level END,
    telepathy_score      = CASE WHEN v_f ? 'telepathy_score'      THEN (v_f->>'telepathy_score')::int  ELSE telepathy_score END,
    telepathy_best       = CASE WHEN v_f ? 'telepathy_best'       THEN (v_f->>'telepathy_best')::int   ELSE telepathy_best END,
    show_telepathy_score = CASE WHEN v_f ? 'show_telepathy_score' THEN (v_f->>'show_telepathy_score')::boolean ELSE show_telepathy_score END,
    updated_at           = now()
  WHERE nickname = p_nickname AND password_hash = p_password_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'credenziali_non_valide');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION consume_magic_link(text)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reset_password(text, text)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION change_password(text, text, text)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_my_profile(text, text, jsonb)        TO anon, authenticated;
```

**Nota sul ruolo di servizio.** Nel file `.sql`, al posto del commento `-- GRANT EXECUTE al ruolo di servizio…`, scrivere la riga vera: `GRANT EXECUTE ON FUNCTION crea_token_account(text, text) TO` seguito dal nome Postgres del ruolo usato dalla chiave di servizio di Supabase (`service` + `_role`). Qui nel piano la parola non compare perché l'hook anti-segreti (`scripts/git-hooks/pre-commit`) la accetta solo nelle righe `GRANT`/`REVOKE` dei file `.sql`. Per lo stesso motivo nei commenti e nelle stringhe dei file `.js` si scrive «chiave di servizio», mai il nome del ruolo.

Nota: `token` è `UNIQUE` in entrambe le tabelle (verificato dal catalogo il 28/09), quindi `DELETE … RETURNING … INTO` restituisce al più una riga.

- [ ] **Step 4: Applicare e rieseguire**

Run: `node scripts/apply-sql.js supabase/sql/26_account_lato_server.sql && node test-account-rpc.js`
Expected: tutti ✅.

- [ ] **Step 5: Commit**

```bash
git add supabase/sql/26_account_lato_server.sql test-account-rpc.js
git commit -m "feat(db): link, reset, cambio password e profilo lato server (26_, parte B)"
```

---

### Task 4: Migration 26, parte C — classifica, totali, fusione ospite

**Files:**
- Modify: `supabase/sql/26_account_lato_server.sql`
- Modify: `test-account-rpc.js` (nuova `testTelepatia`)

**Interfaces:**
- Produces:
  - `get_telepathy_leaderboard(p_limit int) RETURNS TABLE(nickname text, rounds_count int, matches_count int)`.
  - `get_my_telepathy_totals(p_user_id text, p_password_hash text) RETURNS TABLE(rounds_count int, matches_count int)` — vuota se non trovata o non autorizzata.
  - `merge_telepathy_scores(p_old_user_id text, p_new_user_id text, p_nickname text, p_password_hash text) RETURNS TABLE(out_rounds int, out_matches int, out_sessions int)` — `RAISE EXCEPTION 'Auth failed'` se la credenziale non è dell'account `p_new_user_id`.

- [ ] **Step 1: Scrivere i test che falliscono**

```js
async function testTelepatia() {
  console.log('\n— get_telepathy_leaderboard / get_my_telepathy_totals / merge_telepathy_scores —');
  const PW = 'Password123!';
  const a = await creaAccount('tele', PW);
  const ospite = `acct-ospite-${TS}`;
  const vittima = await creaAccount('vitt', PW);
  const cleanupScores = [a.email, ospite, vittima.email];

  await rpc('increment_telepathy_score', { p_user_id: ospite, p_nickname: 'Ospite', p_rounds: 7, p_matches: 3 });
  await rpc('increment_telepathy_score', { p_user_id: vittima.email, p_nickname: vittima.nickname, p_rounds: 50, p_matches: 40 });

  const lb = (await rpc('get_telepathy_leaderboard', { p_limit: 10 })).body;
  check(Array.isArray(lb) && lb.length > 0 && lb.every(r => !('user_id' in r)), 'la classifica non contiene user_id', lb && lb[0]);
  const lbMax = (await rpc('get_telepathy_leaderboard', { p_limit: 1000 })).body;
  check(Array.isArray(lbMax) && lbMax.length <= 50, 'la classifica non supera 50 righe', lbMax && lbMax.length);

  const tOspite = (await rpc('get_my_telepathy_totals', { p_user_id: ospite, p_password_hash: null })).body;
  check(tOspite[0] && tOspite[0].rounds_count === 7, 'ospite: i propri totali con il solo id', tOspite);
  const tVittima = (await rpc('get_my_telepathy_totals', { p_user_id: vittima.email, p_password_hash: null })).body;
  check(Array.isArray(tVittima) && tVittima.length === 0, 'email registrata senza credenziale: nessun totale', tVittima);
  const tVittimaOk = (await rpc('get_my_telepathy_totals', { p_user_id: vittima.email, p_password_hash: vittima.password_hash })).body;
  check(tVittimaOk[0] && tVittimaOk[0].rounds_count === 50, 'email registrata con credenziale: totali', tVittimaOk);

  const senzaCred = await rpc('merge_telepathy_scores', { p_old_user_id: ospite, p_new_user_id: a.email, p_nickname: 'X', p_password_hash: pbkdf2('x', nuovoSale()) });
  check(senzaCred.status >= 400, 'fusione con credenziale sbagliata → rifiutata', senzaCred.body);
  const furto = await rpc('merge_telepathy_scores', { p_old_user_id: vittima.email, p_new_user_id: a.email, p_nickname: 'X', p_password_hash: a.password_hash });
  const vittimaDopo = (await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(vittima.email)}&select=rounds_count`)).body;
  check(vittimaDopo[0] && vittimaDopo[0].rounds_count === 50, 'non si può svuotare la riga di un account registrato usandola come «vecchia»', { furto: furto.body, vittimaDopo });
  const ok = await rpc('merge_telepathy_scores', { p_old_user_id: ospite, p_new_user_id: a.email, p_nickname: 'NomeFinto', p_password_hash: a.password_hash });
  check(Array.isArray(ok.body) && ok.body[0] && ok.body[0].out_rounds === 7, 'fusione legittima ospite → account', ok.body);
  const nick = (await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(a.email)}&select=nickname`)).body[0].nickname;
  check(nick === a.nickname, 'la fusione scrive il nickname del profilo, non quello passato', nick);

  for (const u of cleanupScores) await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(u)}`, { method: 'DELETE' });
}
```

Aggiungere `await testTelepatia();` nel blocco principale.

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `node test-account-rpc.js`
Expected: parte C rossa.

- [ ] **Step 3: Aggiungere la parte C alla migration**

```sql
-- ── Telepatia: la classifica e i totali senza user_id ──────────────────────
-- Per gli iscritti user_id è l'email: la classifica pubblica la esponeva a ogni visitatore.
CREATE OR REPLACE FUNCTION get_telepathy_leaderboard(p_limit int)
RETURNS TABLE(nickname text, rounds_count int, matches_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ts.nickname, ts.rounds_count, ts.matches_count
    FROM telepathy_scores ts
   ORDER BY ts.matches_count DESC NULLS LAST
   LIMIT least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

-- Ospiti: basta l'id, come oggi (i loro totali sono comunque pubblici via nickname).
-- Iscritti: serve la credenziale, altrimenti la funzione direbbe chi è iscritto con che email.
CREATE OR REPLACE FUNCTION get_my_telepathy_totals(p_user_id text, p_password_hash text)
RETURNS TABLE(rounds_count int, matches_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ts.rounds_count, ts.matches_count
    FROM telepathy_scores ts
   WHERE ts.user_id = p_user_id
     AND (NOT EXISTS (SELECT 1 FROM profiles p WHERE p.email = lower(p_user_id))
          OR EXISTS (SELECT 1 FROM profiles p
                      WHERE p.email = lower(p_user_id) AND p.password_hash = p_password_hash))
$$;

-- Fusione ospite → account, ora con la credenziale. Corpo ripreso da quello in uso (letto dal
-- catalogo il 28/09: non esisteva nel repo), più tre cambi: la credenziale dell'account di
-- destinazione, il divieto di usare come «vecchia» la riga di un iscritto, il nickname preso
-- dal profilo. La firma a tre parametri resta fino alla 27_ per le app non ancora aggiornate.
CREATE OR REPLACE FUNCTION merge_telepathy_scores(p_old_user_id text, p_new_user_id text,
                                                  p_nickname text, p_password_hash text)
RETURNS TABLE(out_rounds integer, out_matches integer, out_sessions integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_g_rounds   int := 0;
  v_g_matches  int := 0;
  v_g_sessions int := 0;
  v_nick       text;
BEGIN
  IF p_old_user_id IS NULL OR p_new_user_id IS NULL OR p_old_user_id = p_new_user_id THEN
    RETURN;
  END IF;
  SELECT nickname INTO v_nick FROM profiles
   WHERE email = lower(p_new_user_id) AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE email = lower(p_old_user_id)) THEN
    RETURN;  -- si fondono solo righe d'ospite
  END IF;

  SELECT COALESCE(rounds_count,0), COALESCE(matches_count,0), COALESCE(sessions_count,0)
    INTO v_g_rounds, v_g_matches, v_g_sessions
    FROM telepathy_scores WHERE user_id = p_old_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_g_rounds = 0 AND v_g_matches = 0 AND v_g_sessions = 0 THEN
    DELETE FROM telepathy_scores WHERE user_id = p_old_user_id;
    RETURN;
  END IF;

  INSERT INTO telepathy_scores (user_id, nickname, sessions_count, matches_count, rounds_count, updated_at)
  VALUES (p_new_user_id, v_nick, v_g_sessions, v_g_matches, v_g_rounds, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    sessions_count = telepathy_scores.sessions_count + EXCLUDED.sessions_count,
    matches_count  = telepathy_scores.matches_count  + EXCLUDED.matches_count,
    rounds_count   = telepathy_scores.rounds_count   + EXCLUDED.rounds_count,
    nickname       = EXCLUDED.nickname,
    updated_at     = NOW();

  DELETE FROM telepathy_scores WHERE user_id = p_old_user_id;

  RETURN QUERY
    SELECT ts.rounds_count, ts.matches_count, ts.sessions_count
      FROM telepathy_scores ts WHERE ts.user_id = p_new_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_telepathy_leaderboard(int)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_telepathy_totals(text, text)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_telepathy_scores(text, text, text, text)         TO anon, authenticated;
```

- [ ] **Step 4: Applicare e rieseguire, più la regressione telepatia**

Run: `node scripts/apply-sql.js supabase/sql/26_account_lato_server.sql && node test-account-rpc.js && node test-merge-guest.js && node test-telepathy-stats.js`
Expected: `test-account-rpc.js` tutto ✅; gli altri due come in baseline (usano ancora la firma a tre parametri dall'app vecchia).

- [ ] **Step 5: Commit**

```bash
git add supabase/sql/26_account_lato_server.sql test-account-rpc.js
git commit -m "feat(db): classifica, totali e fusione ospite senza email esposte (26_, parte C)"
```

---

### Task 5: Edge Function `send-account-email`

**Files:**
- Create: `supabase/functions/send-account-email/email.mjs`
- Create: `supabase/functions/send-account-email/index.ts`
- Create: `test-account-email.js`

**Interfaces:**
- Consumes: `crea_token_account(p_tipo, p_email) → text|null` (Task 3).
- Produces: `POST {SUPABASE_URL}/functions/v1/send-account-email`, body `{tipo:'reset'|'magic', email:string}`, header `apikey`/`Authorization: Bearer <anon>`. Risposta `200 {ok:true}` in ogni caso di input valido (anche email sconosciuta o tetto), `400 {ok:false}` per input non valido, `502 {ok:false}` se EmailJS risponde male. CORS per `https://global-awakening.github.io` e `http://localhost:4321`.
- `email.mjs` esporta `validaRichiesta(body) → {ok:true, tipo, email} | {ok:false}`, `parametriEmail(tipo, email, token) → {template_id, template_params}`, `APP_URL`, `ORIGINI_AMMESSE`.

- [ ] **Step 1: Scrivere il test che fallisce**

`test-account-email.js`:

```js
/**
 * send-account-email — Global Awakening
 *
 * 1. Logica pura (email.mjs): validazione e parametri del template. Il link punta SEMPRE alla
 *    base fissa, qualunque cosa mandi il chiamante: un appUrl libero farebbe della funzione una
 *    macchina da phishing con token veri.
 * 2. Smoke sulla funzione pubblicata, solo con un'email NON registrata: risponde ok e non
 *    spedisce niente (la quota EmailJS è piccola; l'arrivo vero si prova dal vivo).
 *
 * Esecuzione: node test-account-email.js            (solo 1)
 *             node test-account-email.js --live     (1 + 2, dopo il deploy)
 */
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, 'supabase/functions/send-account-email/email.mjs')).href);
  const { validaRichiesta, parametriEmail } = mod;

  console.log('\n— validaRichiesta —');
  check(validaRichiesta({ tipo: 'reset', email: ' A@B.it ' }).email === 'a@b.it', 'email normalizzata');
  check(validaRichiesta({ tipo: 'boh', email: 'a@b.it' }).ok === false, 'tipo sconosciuto rifiutato');
  check(validaRichiesta({ tipo: 'magic', email: 'non-email' }).ok === false, 'email malformata rifiutata');
  check(validaRichiesta({ tipo: 'magic', email: 'x'.repeat(250) + '@b.it' }).ok === false, 'email oltre 254 caratteri rifiutata');
  check(validaRichiesta(null).ok === false, 'body nullo rifiutato');
  const conAppUrl = validaRichiesta({ tipo: 'magic', email: 'a@b.it', appUrl: 'https://evil.example' });
  check(conAppUrl.ok === true && !('appUrl' in conAppUrl), 'appUrl del chiamante ignorato');

  console.log('\n— parametriEmail —');
  const r = parametriEmail('reset', 'a@b.it', 'TOK');
  check(r.template_id === 'template_i5i06pl' && r.template_params.reset_url === 'https://global-awakening.github.io/app.html?reset=TOK', 'reset: template e URL fisso', r);
  const m = parametriEmail('magic', 'a@b.it', 'TOK');
  check(m.template_id === 'template_gy8gdkg' && m.template_params.magic_url === 'https://global-awakening.github.io/app.html?magic=TOK', 'magic: template e URL fisso', m);
  check(m.template_params.to_email === 'a@b.it' && m.template_params.footer === 'This link expires in 15 minutes.', 'magic: stessi testi di oggi');
  check(parametriEmail('magic', 'a@b.it', 'a b&c').template_params.magic_url.endsWith('?magic=a%20b%26c'), 'token codificato nell\'URL');

  if (process.argv.includes('--live')) {
    console.log('\n— funzione pubblicata —');
    const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
    const url = 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/send-account-email';
    const h = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Origin: 'http://localhost:4321' };
    const a = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'magic', email: `nessuno-${Date.now()}@test.com` }) });
    check(a.status === 200 && (await a.json()).ok === true, 'email non registrata → 200 {ok:true}', a.status);
    check(a.headers.get('access-control-allow-origin') === 'http://localhost:4321', 'CORS per localhost:4321');
    const b = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'boh', email: 'a@b.it' }) });
    check(b.status === 400, 'tipo non valido → 400', b.status);
    const o = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://global-awakening.github.io', 'Access-Control-Request-Method': 'POST' } });
    check(o.status === 200 && o.headers.get('access-control-allow-origin') === 'https://global-awakening.github.io', 'preflight dal sito vero', o.status);
  }
  console.log(`\n${passed} passati, ${failed} falliti`);
})();
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `node test-account-email.js`
Expected: FAIL — `Cannot find module …/email.mjs`.

- [ ] **Step 3: Scrivere `email.mjs`**

```js
/**
 * Logica pura di send-account-email, separata da index.ts perché si possa provare con Node
 * (stessa scelta di notify-ritual-start/finestre.mjs).
 *
 * Il link non viene MAI dal chiamante: base fissa. È la differenza fra una funzione che manda
 * i nostri link e una che manda link di chiunque con il nostro nome.
 */
export const APP_URL = 'https://global-awakening.github.io/app.html';
export const ORIGINI_AMMESSE = ['https://global-awakening.github.io', 'http://localhost:4321'];

export function validaRichiesta(body) {
  if (!body || typeof body !== 'object') return { ok: false };
  const tipo = body.tipo;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (tipo !== 'reset' && tipo !== 'magic') return { ok: false };
  if (email.length === 0 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false };
  return { ok: true, tipo, email };
}

// Stessi template e stessi testi che l'app mandava dal browser fino al 28/09.
export function parametriEmail(tipo, email, token) {
  const t = encodeURIComponent(token);
  if (tipo === 'reset') {
    return { template_id: 'template_i5i06pl',
             template_params: { to_email: email, reset_url: `${APP_URL}?reset=${t}` } };
  }
  return {
    template_id: 'template_gy8gdkg',
    template_params: {
      to_email: email,
      subject: 'Your login link to Global Awakening',
      message: 'Click here to log in without a password.',
      magic_url: `${APP_URL}?magic=${t}`,
      cta_text: 'Login to Global Awakening',
      footer: 'This link expires in 15 minutes.',
    },
  };
}
```

- [ ] **Step 4: Scrivere `index.ts`**

```ts
/**
 * send-account-email — crea il token di reset o di accesso e lo spedisce.
 *
 * Perché sul server: finché il token nasceva nel browser, chi lo generava lo conosceva, e
 * chiunque poteva scriverne uno per l'email di un altro. Qui il token lo crea il database
 * (crea_token_account, eseguibile solo con la chiave di servizio) e l'email parte con la
 * chiave privata di EmailJS, che vive solo fra i segreti.
 *
 * Risponde {ok:true} anche quando non spedisce (email sconosciuta, troppe richieste): la
 * risposta non deve dire chi è iscritto.
 */
// Versione FISSATA, come alert-cron: senza, un aggiornamento a monte può rompere il deploy.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { validaRichiesta, parametriEmail, ORIGINI_AMMESSE } from './email.mjs';

function cors(req: Request): Record<string, string> {
  const origine = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINI_AMMESSE.includes(origine) ? origine : ORIGINI_AMMESSE[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, x-client-info',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return Response.json({ ok: false }, { status: 405, headers: h });

  let body: unknown = null;
  try { body = await req.json(); } catch { /* resta null */ }
  const v = validaRichiesta(body);
  if (!v.ok) return Response.json({ ok: false }, { status: 400, headers: h });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: token, error } = await supabase.rpc('crea_token_account', { p_tipo: v.tipo, p_email: v.email });
  if (error) return Response.json({ ok: false }, { status: 500, headers: h });
  if (!token) return Response.json({ ok: true }, { headers: h });

  const { template_id, template_params } = parametriEmail(v.tipo, v.email, token as string);
  const risposta = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: 'service_rk97p6m',
      template_id,
      user_id: 'KTIin1Rts7iSkzU96',
      accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY')!,
      template_params,
    }),
  });
  if (!risposta.ok) return Response.json({ ok: false }, { status: 502, headers: h });
  return Response.json({ ok: true }, { headers: h });
});
```

- [ ] **Step 5: Test unitari verdi, poi pubblicare**

Run: `node test-account-email.js`
Expected: tutti ✅ (senza `--live`).

Pubblicare (dire prima a Irene: «pubblico la funzione `send-account-email` sul progetto Supabase `vxzxdkcluyrcftsnxxza`»):

Run: `SUPABASE_ACCESS_TOKEN=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-) npx --yes supabase functions deploy send-account-email --project-ref $(cat supabase/.temp/project-ref)`
Se l'errore parla di permessi: il token in `.env.local` ha solo il permesso Database. Chiedere a Irene un token con anche «Edge Functions» (https://supabase.com/dashboard/account/tokens); non cercare altre strade.

- [ ] **Step 6: Smoke sulla funzione pubblicata**

Run: `node test-account-email.js --live`
Expected: tutti ✅.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/send-account-email test-account-email.js
git commit -m "feat(fn): send-account-email, token e email dal server"
```

---

### Task 6: App — login e registrazione

**Files:**
- Modify: `src/app.jsx:1700-1896` (`handleLogin`, `handleRegister`), dizionari `en` (~r.141) e `it` (~r.486)
- Modify: `test-auth.js`
- Rigenerati: `app.js`, `app.html`

**Interfaces:**
- Consumes: `get_login_params`, `login_with_password`, `register_account` (Task 2); `merge_telepathy_scores` a 4 parametri (Task 4); `update_my_profile` (Task 3).
- Produces: `mergeGuestTelepathyData(oldSid, newUserId, currentNickname, credenziale)` — quarto parametro nuovo, usato anche dal Task 7.
- Chiavi di traduzione nuove: `invalidCredentials`, `tooManyAttempts`.

- [ ] **Step 1: Adattare `test-auth.js` e verificare che fallisca**

Cambi al test:
- Nel test legacy (dopo il login), verificare la migrazione con `serviceFetch` (già fatto nel Task 1) **e** che l'hash salvato abbia come sale quello di `get_login_params`: `stored.split('$')[2] === (await (await fetch(\`${SUPABASE_URL}/rest/v1/rpc/get_login_params\`, {method:'POST', headers:{apikey:SUPABASE_KEY, Authorization:\`Bearer ${SUPABASE_KEY}\`, 'Content-Type':'application/json'}, body: JSON.stringify({p_email: email})})).json()).salt`.
- Aggiungere un test UI: password sbagliata su account esistente e login su email inesistente mostrano **lo stesso** messaggio `text=/Email or password not correct|Email o password non corretti/`, e mai `No account found`/`Wrong password`.
- Aggiungere un test di rete: con `page.route('**/rest/v1/profiles**', r => r.abort())` il login **riesce lo stesso** (prova che non legge più `profiles`).

Run: `node test-auth.js`
Expected: FAIL sui due test nuovi (l'app mostra ancora «Wrong password» e legge `profiles`).

- [ ] **Step 2: Traduzioni**

In `en`, accanto a `wrongPassword`:
```js
            invalidCredentials: "Email or password not correct",
            tooManyAttempts: "Too many attempts, try again in a few minutes",
```
In `it`:
```js
            invalidCredentials: "Email o password non corretti",
            tooManyAttempts: "Troppi tentativi, riprova tra qualche minuto",
```

- [ ] **Step 3: Riscrivere la parte centrale di `handleLogin`**

Sostituire da `// Search profile by email` fino a `setShowNicknamePrompt(false);` (prima della fusione) con:

```jsx
            // Login lato server (26_): il browser non vede più l'hash salvato. Riceve solo sale e
            // iterazioni, calcola l'hash e lo manda; manda anche l'SHA-256 vecchio, che il server
            // usa solo per gli account non ancora migrati.
            setAuthLoading(true);
            let esito;
            let effectiveHash;
            try {
              const { data: par, error: parErr } = await supabase.rpc('get_login_params', { p_email: email });
              if (parErr || !par || !par.salt) throw new Error('params');
              const salt = Uint8Array.from(atob(par.salt), c => c.charCodeAt(0));
              effectiveHash = await deriveStrongHash(pw, salt, par.iter);
              const legacyHash = await hashPassword(pw);
              const { data, error } = await supabase.rpc('login_with_password', {
                p_email: email, p_hash: effectiveHash, p_legacy_hash: legacyHash
              });
              if (error || !data) throw new Error('login');
              esito = data;
            } catch (e) {
              setLoginError(t.connectionError);
              setAuthLoading(false);
              return;
            }
            if (!esito.ok) {
              setLoginError(esito.motivo === 'troppi_tentativi' ? t.tooManyAttempts : t.invalidCredentials);
              setAuthLoading(false);
              return;
            }
            const existing = esito.profilo;

            setSessionId(existing.session_id);
            localStorage.setItem('ga_session_id', existing.session_id);
            setPasswordHash(effectiveHash);
            localStorage.setItem('ga_pwhash', effectiveHash);
            setUserEmail(email);
            setIsGuest(false);
            const loaded = {
              bio: existing.bio || '',
              starseedType: existing.starseed_type || '',
              avatar: existing.avatar || '',
              country: existing.country || '',
              interests: existing.interests || [],
              experienceLevel: existing.experience_level || ''
            };
            setProfile(loaded);
            localStorage.setItem('ga_profile', JSON.stringify(loaded));
            localStorage.setItem('ga_nickname', existing.nickname || 'Anonymous');
            localStorage.setItem('ga_email', email);
            localStorage.setItem('ga_is_guest', 'false');
            if (existing.telepathy_score) setTotalRounds(existing.telepathy_score);
            if (existing.telepathy_best) setTotalMatches(existing.telepathy_best);
            setNickname(existing.nickname || 'Anonymous');
            setShowNicknamePrompt(false);
```

E nella fusione subito sotto:

```jsx
            if (wasGuest) {
              const merged = await mergeGuestTelepathyData(prevGuestSid, email, existing.nickname || 'Anonymous', effectiveHash);
              if (merged) {
                setTotalRounds(merged.rounds_count);
                setTotalMatches(merged.matches_count);
                localStorage.setItem('telepathy_score', String(merged.rounds_count));
                localStorage.setItem('telepathy_best', String(merged.matches_count));
                await supabase.rpc('update_my_profile', {
                  p_nickname: existing.nickname, p_password_hash: effectiveHash,
                  p_fields: { telepathy_score: merged.rounds_count, telepathy_best: merged.matches_count }
                });
              }
            }
```

`verifyPassword` resta definita solo se usata altrove: `grep -n "verifyPassword(" src/app.jsx`; se l'unico uso era qui, rimuoverla insieme al suo commento.

- [ ] **Step 4: `mergeGuestTelepathyData` con la credenziale**

```jsx
          const mergeGuestTelepathyData = async (oldSid, newUserId, currentNickname, credenziale) => {
            if (!oldSid || !newUserId || oldSid === newUserId || !credenziale) return null;
            const { data, error } = await supabase.rpc('merge_telepathy_scores', {
              p_old_user_id: oldSid,
              p_new_user_id: newUserId,
              p_nickname: currentNickname || 'Anonymous',
              p_password_hash: credenziale
            });
```
(il resto della funzione invariato). Aggiornare il commento sopra: la RPC ora verifica la credenziale dell'account di destinazione.

- [ ] **Step 5: Riscrivere `handleRegister`**

Sostituire i due controlli `emailCheck`/`nickCheck` e l'insert con:

```jsx
            let hash;
            try {
              hash = await deriveStrongHash(pw);
            } catch (e) {
              setLoginError(t.connectionError);
              setAuthLoading(false);
              return;
            }
            const newSid = Date.now() + '-' + Math.random();
            // Unicità di email e nickname decisa dal server (26_): due controlli nel browser
            // lasciavano la porta aperta a chi scriveva direttamente nella tabella.
            const { data: reg, error: regErr } = await supabase.rpc('register_account', {
              p_session_id: newSid, p_nickname: name, p_email: email, p_hash: hash
            });
            if (regErr || !reg) { setLoginError(t.connectionError); setAuthLoading(false); return; }
            if (!reg.ok) {
              const msg = { email_in_uso: t.emailAlreadyUsed, nickname_in_uso: t.usernameAlreadyUsed,
                            troppi_tentativi: t.tooManyAttempts }[reg.motivo];
              setLoginError(msg || t.registrationError || 'Registration failed. Please try again.');
              setAuthLoading(false);
              return;
            }
            setPasswordHash(hash);
            localStorage.setItem('ga_pwhash', hash);
            setSessionId(newSid);
            localStorage.setItem('ga_session_id', newSid);
```

Nota: `setPasswordHash`/`setSessionId` vanno **dopo** l'esito positivo (oggi stanno prima dell'insert e restano anche se fallisce). Nella fusione dopo la registrazione: `mergeGuestTelepathyData(prevGuestSid, email, name, hash)` e `update_my_profile` come nello Step 3 (con `p_nickname: name`, `p_password_hash: hash`).

- [ ] **Step 6: Build e test**

Run: `node build.js && node test-auth.js && node test-merge-guest.js`
Expected: `test-auth.js` tutto verde; `test-merge-guest.js` come baseline o meglio.

- [ ] **Step 7: Commit**

```bash
git add src/app.jsx app.js app.html test-auth.js
git commit -m "feat(app): login e registrazione passano dal server"
```

---

### Task 7: App — «password dimenticata» e «entra con un link»

**Files:**
- Modify: `src/app.jsx:1898-2067` (`handleSendResetEmail`, `handleSetNewPassword`, `handleSendMagicLink`, `loginWithMagicToken`), dizionari `resetEmailSent`/`magicLinkSent`
- Modify: `test-magic-link-bug.js`, `test-reset-password-bug.js`, `test-reset-password.js`
- Rigenerati: `app.js`, `app.html`

**Interfaces:**
- Consumes: `send-account-email` (Task 5), `consume_magic_link`, `reset_password`, `update_my_profile` (Task 3), `mergeGuestTelepathyData` a 4 parametri (Task 6). Globali di `app.html`: `SUPABASE_URL`, `SB_HEADERS`.
- Produces: helper `inviaEmailAccount(tipo, email) → Promise<boolean>` dentro il componente.

- [ ] **Step 1: Adattare i test e verificare che falliscano**

- `test-magic-link-bug.js`: il token si crea con `serviceFetch('rpc/crea_token_account', {method:'POST', body: JSON.stringify({p_tipo:'magic', p_email: EMAIL})})` invece dell'insert diretto. Aggiungere: l'account di test è creato **senza** `password_hash`, e dopo il login col link `localStorage.ga_pwhash` inizia con `pbkdf2$` (`await page.evaluate(() => localStorage.getItem('ga_pwhash'))`). Aggiungere: aprire lo **stesso** link in una seconda pagina dopo il primo login → compare `text=/invalid or expired|non valido o scaduto/`.
- `test-reset-password-bug.js`: token via `crea_token_account` tipo `reset`. Dopo il reset, login via UI con la password nuova.
- `test-reset-password.js`: la schermata «password dimenticata» con un'email **non registrata** mostra lo stesso messaggio di successo di una registrata (`text=/If the address is registered|Se l'indirizzo è registrato/`), e intercettando `**/functions/v1/send-account-email` (`page.route`, rispondendo `200 {"ok":true}` senza chiamare la funzione vera) si verifica che la richiesta parta con body `{tipo:'reset', email}` e **senza** chiamate ad `api.emailjs.com` (`page.on('request')`).

Run: `node test-magic-link-bug.js; node test-reset-password-bug.js; node test-reset-password.js`
Expected: FAIL sui controlli nuovi.

- [ ] **Step 2: Testi «non riveliamo chi è iscritto»**

`en`:
```js
            resetEmailSent: "If the address is registered, we've sent you an email. Click the link inside.",
            magicLinkSent: "If the address is registered, we've sent you a login link.",
```
`it`:
```js
            resetEmailSent: "Se l'indirizzo è registrato, ti abbiamo scritto. Clicca il link nell'email.",
            magicLinkSent: "Se l'indirizzo è registrato, ti abbiamo mandato un link per entrare.",
```

- [ ] **Step 3: Helper e invio**

Sopra `handleSendResetEmail`:

```jsx
          // Token ed email li fa il server (send-account-email). SUPABASE_URL e SB_HEADERS sono
          // i globali definiti in app.html accanto al client REST.
          const inviaEmailAccount = async (tipo, email) => {
            try {
              const res = await fetch(`${SUPABASE_URL}/functions/v1/send-account-email`, {
                method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ tipo, email })
              });
              return res.ok;
            } catch (e) {
              return false;
            }
          };
```

Corpo di `handleSendResetEmail` dopo `setAuthLoading(true);`:
```jsx
            const ok = await inviaEmailAccount('reset', email);
            if (ok) { setLoginSuccess(t.resetEmailSent); setResetEmail(''); }
            else setLoginError(t.connectionError);
            setAuthLoading(false);
```

Corpo di `handleSendMagicLink` dopo `setAuthLoading(true);` (via anche il controllo `profiles` che rivelava chi è iscritto):
```jsx
            const ok = await inviaEmailAccount('magic', email);
            if (ok) { setLoginSuccess(t.magicLinkSent); setMagicLinkEmail(''); setShowMagicLink(false); }
            else setLoginError(t.connectionError);
            setAuthLoading(false);
```

- [ ] **Step 4: `handleSetNewPassword`**

Dentro il `try`, dopo `setAuthLoading(true);`:
```jsx
              const hash = await deriveStrongHash(pw);
              const { data: esito, error } = await supabase.rpc('reset_password', { p_token: resetToken, p_new_hash: hash });
              if (error || !esito) { setLoginError(t.connectionError); setAuthLoading(false); return; }
              if (!esito.ok) {
                setLoginError(t.resetTokenInvalid);
                setResetToken('');
                setAuthLoading(false);
                return;
              }
              setLoginSuccess(t.resetSuccess);
              setResetNewPassword('');
              setResetConfirmPassword('');
              setResetToken('');
              setTimeout(() => { setAuthTab('login'); setLoginSuccess(''); }, 2500);
```

- [ ] **Step 5: `loginWithMagicToken`**

Sostituire dalla lettura di `magic_links` fino a `setShowNicknamePrompt(false);`:
```jsx
              const { data: esito, error } = await supabase.rpc('consume_magic_link', { p_token: magicToken });
              if (error || !esito) { setLoginError(t.connectionError); return; }
              if (!esito.ok) { setLoginError(t.magicLinkInvalid); return; }
              const existing = esito.profilo;
              const email = existing.email;
              const credenziale = esito.password_hash;
              setSessionId(existing.session_id);
              localStorage.setItem('ga_session_id', existing.session_id);
              setUserEmail(email);
              setIsGuest(false);
              // La credenziale arriva dal server anche per gli account che non l'avevano (26_):
              // senza, messaggi e profilo resterebbero chiusi a chi è entrato col link.
              setPasswordHash(credenziale);
              localStorage.setItem('ga_pwhash', credenziale);
```
seguito dal blocco `loaded`/`localStorage`/`setNickname` invariato; nella fusione `mergeGuestTelepathyData(prevGuestSid, email, existing.nickname || 'Anonymous', credenziale)` e `update_my_profile` con `p_nickname: existing.nickname, p_password_hash: credenziale`.

- [ ] **Step 6: Build e test**

Run: `node build.js && node test-magic-link-bug.js && node test-reset-password-bug.js && node test-reset-password.js`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add src/app.jsx app.js app.html test-magic-link-bug.js test-reset-password-bug.js test-reset-password.js
git commit -m "feat(app): reset e link d'accesso con token creati dal server"
```

---

### Task 8: App — profilo, cambio password, classifica, totali

**Files:**
- Modify: `src/app.jsx` righe ~961 (`loadLeaderboard`), ~1333 (totali ospite), ~2680 (`loadProfile`), ~2708 (`saveProfile`), ~2788–2800 (fine sessione), ~2845 (`openProfile`), ~4497 (chiave riga classifica), ~4843 (toggle), ~5001 (cambio password); dizionari
- Create: `test-account-ui.js`
- Rigenerati: `app.js`, `app.html`

**Interfaces:**
- Consumes: `update_my_profile`, `change_password` (Task 3), `get_telepathy_leaderboard`, `get_my_telepathy_totals` (Task 4).
- Produces: costante `PUBLIC_PROFILE_COLUMNS` (stringa per `select`), chiavi `profileSaveFailed`, `passwordChangeFailed`.

- [ ] **Step 1: Test UI che fallisce — `test-account-ui.js` (nuovo)**

Playwright, stesso stile di `test-auth.js`. Casi:
1. Account creato con `createTestAccount` + login via UI. Con `page.on('request')` si registra ogni URL: **nessuna** richiesta a `/rest/v1/profiles` con `select=*` o con `email`/`password_hash` nel `select`, e **nessuna** scrittura (`POST`/`PATCH`) su `/rest/v1/profiles` durante: apertura profilo proprio, salvataggio del profilo con bio nuova, toggle «mostra punteggio», apertura del profilo di un altro utente, classifica.
2. Dopo il salvataggio la bio nel DB (via `serviceFetch`) è quella nuova.
3. **Review Focus 1**: con `localStorage.ga_pwhash` rimosso (`page.evaluate(() => localStorage.removeItem('ga_pwhash'))`) e pagina ricaricata, il salvataggio del profilo mostra `text=/Could not save|Non è stato possibile salvare/` e non «salvato».
4. Cambio password dal profilo → logout → login con la password nuova riesce; con credenziale rimossa come al punto 3, il cambio mostra `text=/Could not change|Non è stato possibile cambiare/`.
5. La classifica si carica (la lobby telepatia mostra righe o «nessun dato») senza richieste a `/rest/v1/telepathy_scores`.

Run: `node test-account-ui.js`
Expected: FAIL (l'app fa ancora `select('*')` e `upsert`).

- [ ] **Step 2: Traduzioni**

`en`: `profileSaveFailed: "Could not save your profile. Please log in again.",` · `passwordChangeFailed: "Could not change the password. Please log in again.",`
`it`: `profileSaveFailed: "Non è stato possibile salvare il profilo. Rientra e riprova.",` · `passwordChangeFailed: "Non è stato possibile cambiare la password. Rientra e riprova.",`

- [ ] **Step 3: Colonne pubbliche e letture**

In cima al componente (vicino agli altri helper di modulo, dopo `isValidEmail`):
```jsx
        // Le sole colonne di profiles leggibili con la chiave pubblica dopo la 27_. Email e hash
        // non si leggono più da qui: arrivano solo dalle RPC di login, a chi ha la password.
        const PUBLIC_PROFILE_COLUMNS = 'session_id,nickname,bio,starseed_type,avatar,country,interests,experience_level,telepathy_score,telepathy_best,show_telepathy_score';
```
- `loadProfile` (~2680): `select(PUBLIC_PROFILE_COLUMNS)`.
- `openProfile` (~2845): `select(PUBLIC_PROFILE_COLUMNS)`.

- [ ] **Step 4: Scritture del profilo**

`saveProfile` (~2708), sostituire la costruzione di `row` e l'`upsert`:
```jsx
          const saveProfile = async () => {
            localStorage.setItem('ga_profile', JSON.stringify(profile));
            if (isGuest) {
              setProfileSaved(true);
              setTimeout(() => setProfileSaved(false), 3000);
              return;
            }
            const { data: esito, error } = await supabase.rpc('update_my_profile', {
              p_nickname: nickname, p_password_hash: passwordHash,
              p_fields: {
                bio: profile.bio || '', starseed_type: profile.starseedType || '', avatar: profile.avatar || '',
                country: profile.country || '', interests: profile.interests || [],
                experience_level: profile.experienceLevel || '',
                telepathy_score: totalRounds || 0, telepathy_best: totalMatches || 0,
                show_telepathy_score: showTelepathyScore !== false
              }
            });
            if (error || !esito || !esito.ok) {
              // Prima l'upsert falliva in silenzio e lo schermo diceva «salvato» lo stesso.
              alert(t.profileSaveFailed);
              return;
            }
            setProfileSaved(true);
            setTimeout(() => setProfileSaved(false), 3000);
          };
```
Prima di scrivere, guardare come l'app mostra altri errori nel profilo (`grep -n "alert(" src/app.jsx | head`): se esiste già uno stato di errore visibile nel pannello profilo, usare quello al posto di `alert` e adattare il selettore del test.

Fine sessione (~2788–2800):
```jsx
              const { data: updated } = await supabase.rpc('get_my_telepathy_totals', { p_user_id: userId, p_password_hash: passwordHash });
```
e al posto dell'`update` su `profiles`:
```jsx
              if (!isGuest && nickname && passwordHash) {
                await supabase.rpc('update_my_profile', {
                  p_nickname: nickname, p_password_hash: passwordHash,
                  p_fields: { telepathy_score: newRounds, telepathy_best: newMatches }
                });
              }
```
(Oggi l'update gira anche per gli ospiti, che non hanno riga: non scriveva niente. Ora non parte.)

Totali ospite (~1333):
```jsx
                const { data } = await supabase.rpc('get_my_telepathy_totals', { p_user_id: sessionId, p_password_hash: null });
```

Toggle (~4843):
```jsx
                                await supabase.rpc('update_my_profile', {
                                  p_nickname: nickname, p_password_hash: passwordHash,
                                  p_fields: { show_telepathy_score: newVal }
                                });
```

- [ ] **Step 5: Cambio password (~5001)**

```jsx
                              onClick={async () => {
                                const hash = await deriveStrongHash(profilePassword.trim());
                                const { data: esito, error } = await supabase.rpc('change_password', {
                                  p_nickname: nickname, p_old_hash: passwordHash, p_new_hash: hash
                                });
                                if (error || !esito || !esito.ok) {
                                  setProfilePasswordMsg(t.passwordChangeFailed);
                                  return;
                                }
                                // La credenziale locale cambia SOLO se il server ha accettato: prima
                                // cambiava comunque, e da lì browser e database divergevano.
                                setPasswordHash(hash);
                                localStorage.setItem('ga_pwhash', hash);
                                setProfilePassword('');
                                setProfilePasswordMsg(t.passwordSet);
                                setTimeout(() => setProfilePasswordMsg(''), 3000);
                              }}
```
Il box di `profilePasswordMsg` è verde (`result-success`): per `passwordChangeFailed` va reso con lo stile d'errore già usato nel file (`grep -n "result-try-again" src/app.jsx | head -3`), scegliendo la classe in base a `profilePasswordMsg === t.passwordChangeFailed`.

- [ ] **Step 6: Classifica**

```jsx
          const loadLeaderboard = async () => {
            const { data } = await supabase.rpc('get_telepathy_leaderboard', { p_limit: 10 });
            setLeaderboard(Array.isArray(data) ? data : []);
          };
```
e alla riga ~4497 `key={row.nickname || i}` al posto di `row.user_id`. Aggiornare il commento sopra `loadLeaderboard` (non legge più la tabella).

- [ ] **Step 7: Nessun accesso diretto rimasto**

Run: `grep -nE "from\('(profiles|magic_links|password_resets|telepathy_scores)'\)" src/app.jsx`
Expected: solo le due `select(PUBLIC_PROFILE_COLUMNS)` su `profiles`.

- [ ] **Step 8: Build e test**

Run: `node build.js && node test-account-ui.js && node test-telepathy-stats.js && node test-merge-guest.js && node test-telepathy.js`
Expected: `test-account-ui.js` verde; gli altri come baseline.

- [ ] **Step 9: Commit**

```bash
git add src/app.jsx app.js app.html test-account-ui.js
git commit -m "feat(app): profilo, password e classifica solo tramite RPC"
```

---

### Task 9: Via EmailJS dal browser

**Files:**
- Modify: `app.html:24-25` (script EmailJS e `emailjs.init`), `build.js:56` (`connect-src`), `sw.js:18,25,52` (cache e precache)
- Test: `test-pwa.js`, `test-privacy.js` (esistenti)

**Interfaces:**
- Consumes: nessun `emailjs.` rimasto in `src/app.jsx` dopo il Task 7.

- [ ] **Step 1: Verificare che nessuno usi più EmailJS nel client**

Run: `grep -n "emailjs" src/app.jsx`
Expected: nessuna riga. Se ce n'è: fermarsi, è un uso non previsto dalla spec.

- [ ] **Step 2: Rimuovere**

- `app.html`: le due righe `<script … @emailjs/browser@4.4.1 …>` e `<script>emailjs.init({ publicKey: 'KTIin1Rts7iSkzU96' });</script>`.
- `build.js`: `` `connect-src 'self' ${SUPABASE}` `` (via `https://api.emailjs.com`).
- `sw.js`: togliere l'URL EmailJS da `PRECACHE`; `/emailjs\.com$/` da riga 52 si può lasciare (innocuo) o togliere; `const CACHE = 'ga-pwa-v10';` con una riga di commento sotto quelle esistenti: `// v10: via EmailJS dal precache (28/09/2026): token ed email ora li fa il server.`

- [ ] **Step 3: Build e verifica**

Run: `node build.js && grep -c "emailjs" app.html; node test-pwa.js && node test-privacy.js`
Expected: `0`; i due test come baseline. La build rigenera la CSP senza l'hash dello script `emailjs.init` rimosso.

- [ ] **Step 4: Commit**

```bash
git add app.html build.js sw.js app.js
git commit -m "chore(app): via EmailJS dal browser e dalla CSP, cache v10"
```

---

### Task 10: Regressione completa prima della chiusura

**Files:**
- Modify: `.superpowers/sdd/account-baseline.md` (sezione «Dopo il Task 10»)

- [ ] **Step 1: Suite intera**

Run (server attivo sulla 4321): `for f in test-*.js; do echo "== $f"; node "$f" > /dev/null 2>&1 && echo VERDE || echo ROSSO; done`

- [ ] **Step 2: Confronto con la baseline**

Ogni file VERDE in baseline deve essere VERDE. Un ROSSO nuovo: rieseguirlo due volte; se resta rosso è una regressione e si torna al task che l'ha causata (con `superpowers:systematic-debugging`). Annotare l'esito nel file della baseline.

- [ ] **Step 3: Commit**

```bash
git add .superpowers/sdd/account-baseline.md
git commit -m "test: regressione completa dopo le RPC d'account"
```

---

### Task 11: Migration 27 — la chiusura (scritta, NON applicata)

**Files:**
- Create: `supabase/sql/27_chiudi_tabelle_account.sql`
- Modify: `test-account-rpc.js` (funzione `testDopoChiusura`, solo con `--dopo-chiusura`)

**Interfaces:**
- Consumes: tutto quanto sopra; nessuna funzione nuova.

- [ ] **Step 1: Scrivere le verifiche negative**

```js
async function testDopoChiusura() {
  console.log('\n— verifiche negative dopo la 27_ —');
  const a = await creaAccount('chiuso', 'Password123!');
  const e = encodeURIComponent(a.email);
  const hashR = await anon(`profiles?email=eq.${e}&select=password_hash`);
  check(hashR.status >= 400, 'anon non legge password_hash', hashR.status);
  const emailR = await anon(`profiles?nickname=eq.${encodeURIComponent(a.nickname)}&select=email`);
  check(emailR.status >= 400, 'anon non legge email', emailR.status);
  const starR = await anon(`profiles?nickname=eq.${encodeURIComponent(a.nickname)}&select=*`);
  check(starR.status >= 400, 'anon non fa select=* su profiles', starR.status);
  const pubR = await anon(`profiles?nickname=eq.${encodeURIComponent(a.nickname)}&select=nickname,bio`);
  check(pubR.status === 200 && pubR.body.length === 1, 'le colonne pubbliche restano leggibili', pubR);
  const keep = await anon('profiles?select=session_id&limit=1');
  check(keep.status === 200, 'la lettura del keepalive funziona', keep.status);
  const upd = await anon(`profiles?nickname=eq.${encodeURIComponent(a.nickname)}`, { method: 'PATCH', body: JSON.stringify({ bio: 'x' }) });
  const bio = (await serviceFetch(`profiles?email=eq.${e}&select=bio`)).body[0].bio;
  check(upd.status >= 400 || bio === '', 'anon non scrive profiles', { status: upd.status, bio });
  const ins = await anon('magic_links', { method: 'POST', body: JSON.stringify({ email: a.email, token: crypto.randomUUID(), expires_at: new Date(Date.now() + 600000).toISOString() }) });
  check(ins.status >= 400, 'anon non inserisce in magic_links', ins.status);
  const pr = await anon('password_resets?select=token&limit=1');
  check(pr.status >= 400, 'anon non legge password_resets', pr.status);
  const ts = await anon('telepathy_scores?select=user_id&limit=1');
  check(ts.status >= 400, 'anon non legge telepathy_scores.user_id', ts.status);
  const tsPub = await anon('telepathy_scores?select=nickname,matches_count&limit=1');
  check(tsPub.status === 200, 'le colonne pubbliche di telepathy_scores restano leggibili', tsPub.status);
  const la = await anon('login_attempts?select=id&limit=1');
  check(la.status >= 400, 'anon non legge login_attempts', la.status);
  const sec = await anon('app_secrets?select=nome&limit=1');
  check(sec.status >= 400, 'anon non legge app_secrets', sec.status);
  const vecchia = await rpc('merge_telepathy_scores', { p_old_user_id: 'x', p_new_user_id: 'y', p_nickname: 'z' });
  check(vecchia.status >= 400, 'la firma senza credenziale di merge_telepathy_scores non esiste più', vecchia.status);
}
```
Nel blocco principale: `if (DOPO_CHIUSURA) await testDopoChiusura();`

- [ ] **Step 2: Scrivere la migration**

```sql
-- ============================================================================
-- Chiusura delle tabelle account — da applicare SOLO dopo che l'app nuova è pubblicata
-- da alcuni giorni (spec §6 punto 6) e con il via di Irene.
--
-- Spec: docs/superpowers/specs/2026-09-25-account-lato-server-design.md §4.4
-- Prima di applicare: node test-account-rpc.js verde. Dopo: node test-account-rpc.js --dopo-chiusura.
--
-- Idempotente: si può rieseguire.
-- ============================================================================

-- ── profiles: solo lettura, solo colonne pubbliche ─────────────────────────
DROP POLICY IF EXISTS "Allow all" ON profiles;
DROP POLICY IF EXISTS profiles_lettura_pubblica ON profiles;
CREATE POLICY profiles_lettura_pubblica ON profiles FOR SELECT USING (true);
REVOKE ALL ON profiles FROM anon, authenticated;
GRANT SELECT (session_id, nickname, bio, starseed_type, avatar, country, interests,
              experience_level, telepathy_score, telepathy_best, show_telepathy_score,
              created_at, updated_at)
  ON profiles TO anon, authenticated;

-- ── magic_links, password_resets: chiuse del tutto ─────────────────────────
ALTER TABLE magic_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON magic_links     FROM anon, authenticated;
REVOKE ALL ON password_resets FROM anon, authenticated;
-- Ogni token creato finora può essere stato scritto o letto da chiunque.
DELETE FROM magic_links;
DELETE FROM password_resets;

-- ── telepathy_scores: via user_id (per gli iscritti è l'email) ─────────────
-- Le scritture passano già da RPC SECURITY DEFINER; le uniche policy sono di SELECT
-- (verificato dal catalogo il 28/09), e i privilegi di scrittura di anon si tolgono qui.
REVOKE ALL ON telepathy_scores FROM anon, authenticated;
GRANT SELECT (nickname, sessions_count, matches_count, rounds_count, updated_at)
  ON telepathy_scores TO anon, authenticated;

-- ── Tabelle private della 26_: ribadito ────────────────────────────────────
REVOKE ALL ON login_attempts    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app_secrets       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON account_email_log FROM PUBLIC, anon, authenticated;

-- ── Fusione senza credenziale: via ─────────────────────────────────────────
DROP FUNCTION IF EXISTS merge_telepathy_scores(text, text, text);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Verificare la sintassi senza applicare**

Run: `node scripts/apply-sql.js supabase/sql/27_chiudi_tabelle_account.sql --dry-run`
Expected: `[dry-run] … non applicato.` **Non** applicarla.

- [ ] **Step 4: Commit**

```bash
git add supabase/sql/27_chiudi_tabelle_account.sql test-account-rpc.js
git commit -m "feat(db): chiusura delle tabelle account (27_, da applicare dopo il rilascio)"
```

---

### Task 12: Rilascio (con Irene, a gesti)

Nessun codice nuovo: sono i passi di §6 della spec, ognuno annunciato prima («sto per fare X, su quale repo e ramo»). Un gesto alla volta con Irene; screenshot dove serve.

- [ ] **Step 1: Review dell'intero ramo** con un sub-agente separato (`superpowers:requesting-code-review`), contro spec e piano. Rilievi chiusi prima di andare avanti.
- [ ] **Step 2: Push del ramo e PR** — annunciare: «pubblico il ramo `fix/account-lato-server` su `global-awakening/global-awakening` e apro la PR verso `main`». `git push -u origin fix/account-lato-server` e `gh pr create`. Corpo della PR con la sequenza di rilascio e la riga `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Merge** — lo lancia Irene: `! gh pr merge N --merge`.
- [ ] **Step 4: EmailJS** — subito dopo il deploy di GitHub Pages, Irene attiva in EmailJS → Account → Security l'obbligo della chiave privata. Poi: «password dimenticata» vero con la sua email su Chrome (non sulla PWA), e verifica che `alert-cron` risponda ancora (`curl` non va su questa macchina: usare `Invoke-WebRequest` o `node -e "fetch(...)"`).
- [ ] **Step 5: Prove su Chrome** dopo ~10 minuti (`max-age=600`): login, registrazione, link d'accesso, reset, cambio password, salvataggio profilo, classifica.
- [ ] **Step 6: Attesa** di alcuni giorni (indicativamente 3–5; Irene può accorciare) perché le PWA installate si aggiornino.
- [ ] **Step 7: Chiusura** — con il via esplicito di Irene: `node scripts/apply-sql.js supabase/sql/27_chiudi_tabelle_account.sql`, poi `node test-account-rpc.js --dopo-chiusura` e la suite intera. Verificare il workflow keepalive (prossima esecuzione verde su GitHub Actions).
- [ ] **Step 8: Funzioni morte** — `npx supabase functions list --project-ref …`: se `send-reset-email` / `send-magic-link` risultano pubblicate, **chiedere a Irene** prima di cancellarle dal progetto (azione irreversibile su un remoto). Poi rimuovere le cartelle dal repo e la sezione `[functions.send-reset-email]` da `supabase/config.toml` in una PR piccola. Controllare nei segreti se una chiave Resend non serve più a nessuno e segnalarlo a Irene.
- [ ] **Step 9: Messaggio agli iscritti** (spec §8): proporre a Irene il testo che invita a cambiare password. Gli hash letti prima della chiusura restano credenziali valide finché la password non cambia.
