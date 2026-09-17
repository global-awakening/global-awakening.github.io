# Moderazione — segnalazione contenuti e blocco utenti · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare a Global Awakening la segnalazione dei contenuti e il blocco degli utenti, requisito obbligatorio della policy UGC di Google Play, senza il quale l'app viene rifiutata.

**Architecture:** due tabelle nuove (`user_blocks`, `content_reports`) accessibili solo tramite RPC `SECURITY DEFINER` autenticate con `(nickname, password_hash)`, esattamente come le RPC di Messaggi Step B e GDPR. Il blocco è **vincolante lato server** dove il flusso passa da RPC (messaggi privati) e **filtro di visibilità lato client** dove la lettura è una SELECT pubblica (feed, rituali, chat telepatia). La UI aggiunge un menu `⋯` sulle card di contenuto altrui e due voci sulla scheda profilo.

**Tech Stack:** Postgres/Supabase (SQL idempotente in `supabase/sql/`), React senza build step via `src/app.jsx` → `node build.js` → `app.js`, test Node puri su `fetch` (niente Playwright per le RPC).

**Spec:** `docs/superpowers/specs/2026-09-17-moderazione-segnalazione-blocco-design.md`

## Global Constraints

- Progetto Supabase: **`vxzxdkcluyrcftsnxxza`**. Non spostarlo, non crearne altri.
- Ogni file SQL è **idempotente** e rieseguibile: `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `CREATE INDEX IF NOT EXISTS`.
- Ogni RPC: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` + `GRANT EXECUTE ... TO anon`.
- Auth fallita → `RAISE EXCEPTION 'Auth failed'`. Rate limit superato → `RAISE EXCEPTION 'rate_limited'` (stessa stringa di B9, non inventarne altre).
- **L'applicazione dell'SQL su Supabase la fa Irene a mano dallo Studio.** Nessun agente applica migration al DB senza il suo OK esplicito. Il piano si ferma e chiede.
- Si modifica `src/app.jsx` (il sorgente), **mai** `app.js` (generato). Dopo ogni modifica al sorgente: `node build.js`.
- Prima di buildare o testare per la prima volta: `npm install`.
- Ogni stringa nuova visibile all'utente va in `translations` in **italiano e inglese**.
- **Nessun refactor** di `src/app.jsx` oltre a quanto serve. Il file è un monolite da 4705 righe: si aggiunge, non si riordina.
- Gli **ospiti** (`isGuest === true`) non hanno riga `profiles` e quindi non hanno credenziale: nessuna azione di moderazione per loro, nessun crash.
- I test girano contro il DB reale: nickname prefissati con il timestamp del run e pulizia finale obbligatoria.

---

### Task 1: Test di moderazione che falliscono

Scrive l'intera suite prima dell'implementazione. Al termine del task i test **devono fallire**, perché le RPC non esistono ancora: è la prova che il test misura qualcosa.

**Files:**
- Create: `test-moderazione.js`

**Interfaces:**
- Consumes: pattern REST di `test-account-gdpr.js` (helper `sb`, `rpc`, `pass`, `fail`), `SUPABASE_URL` e anon key già presenti in quel file.
- Produces: `node test-moderazione.js` con exit code 0 solo se 15/15 verdi. I task successivi lo rieseguono senza modificarlo.

- [ ] **Step 1: Creare `test-moderazione.js` con setup, helper e pulizia**

```js
/**
 * Test moderazione — segnalazione contenuti e blocco utenti
 *
 * Copre le RPC di supabase/sql/16_moderazione.sql:
 *   block_user / unblock_user / get_my_blocks / report_content
 *   + blocco lato server su send_private_message e get_my_messages
 *   + non-regressione del rate-limit B9 sui messaggi
 *
 * Esecuzione: node test-moderazione.js
 * Prerequisito: aver applicato supabase/sql/16_moderazione.sql in Studio.
 */
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS       = Date.now();
const NICK_A   = `Mod_A_${TS}`;      // chi blocca / segnala
const NICK_B   = `Mod_B_${TS}`;      // chi viene bloccato
const EMAIL_A  = `mod_a_${TS}@test.com`;
const EMAIL_B  = `mod_b_${TS}@test.com`;
const SID_A    = `mod-sid-a-${TS}`;
const SID_B    = `mod-sid-b-${TS}`;
const HASH_A   = `hash-a-${TS}`;
const HASH_B   = `hash-b-${TS}`;
const BAD_HASH = 'hash-sbagliato';

let passed = 0, failed = 0;
function pass(m) { console.log(`  ✅ ${m}`); passed++; }
function fail(m) { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; }

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers },
    ...opts,
  });
  if (res.status === 204) return null;
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return txt; }
}
async function rpc(fn, params) {
  return sb(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
}
/** true se la risposta della RPC è un errore che contiene `needle`. */
function isError(res, needle) {
  const msg = res && (res.message || res.error || res.hint || '');
  return typeof msg === 'string' && msg.toLowerCase().includes(needle.toLowerCase());
}

async function seed() {
  for (const [sid, nick, email, hash] of [[SID_A, NICK_A, EMAIL_A, HASH_A], [SID_B, NICK_B, EMAIL_B, HASH_B]]) {
    await sb('profiles', { method: 'POST', body: JSON.stringify({
      session_id: sid, nickname: nick, email, password_hash: hash,
      bio: 'test moderazione', country: '', interests: [],
      telepathy_score: 0, telepathy_best: 0, show_telepathy_score: true }) });
  }
}

async function cleanup() {
  const e = encodeURIComponent;
  await sb(`profiles?email=eq.${e(EMAIL_A)}`, { method: 'DELETE' });
  await sb(`profiles?email=eq.${e(EMAIL_B)}`, { method: 'DELETE' });
  await sb(`private_messages?sender_name=eq.${e(NICK_A)}`, { method: 'DELETE' });
  await sb(`private_messages?sender_name=eq.${e(NICK_B)}`, { method: 'DELETE' });
  await sb(`notifications?user_nickname=eq.${e(NICK_A)}`, { method: 'DELETE' });
  await sb(`notifications?user_nickname=eq.${e(NICK_B)}`, { method: 'DELETE' });
}
```

Le DELETE su `user_blocks` e `content_reports` **non passano dalla anon key** (RLS senza policy). La pulizia di quelle due tabelle usa la chiave di servizio (quella privilegiata, vedi `SUPABASE_SERVICE_KEY` in `.env.test`) tramite `purge` di `test-helpers.js`, aggiunta nello Step successivo.

- [ ] **Step 2: Aggiungere la pulizia RLS-aware delle due tabelle nuove**

In testa al file, accanto agli altri require:

```js
const { purge } = require('./test-helpers');
```

E dentro `cleanup()`, in coda:

```js
  // user_blocks e content_reports hanno RLS ON senza policy: la anon key non cancella
  // nulla (PostgREST risponde comunque 2xx). Serve la chiave privilegiata via purge().
  await purge(SUPABASE_URL, [
    `user_blocks?blocker_nickname=eq.${e(NICK_A)}`,
    `user_blocks?blocker_nickname=eq.${e(NICK_B)}`,
    `content_reports?reporter_nickname=eq.${e(NICK_A)}`,
    `content_reports?reporter_nickname=eq.${e(NICK_B)}`,
  ], { label: 'moderazione' });
```

- [ ] **Step 3: Scrivere i test 1-5 (blocco)**

```js
async function testBlocco() {
  console.log('— Blocco —');

  // 1) auth errata
  let r = await rpc('block_user', { p_nickname: NICK_A, p_password_hash: BAD_HASH, p_blocked_nickname: NICK_B });
  isError(r, 'Auth failed') ? pass('block_user con hash errato → Auth failed')
                            : fail(`block_user con hash errato: atteso Auth failed, ricevuto ${JSON.stringify(r)}`);

  // 2) auto-blocco
  r = await rpc('block_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_A });
  isError(r, 'cannot block yourself') ? pass('auto-blocco rifiutato')
                                      : fail(`auto-blocco: atteso errore, ricevuto ${JSON.stringify(r)}`);

  // 3) idempotenza: due blocchi uguali → una sola riga
  await rpc('block_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });
  await rpc('block_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });
  let blocks = await rpc('get_my_blocks', { p_nickname: NICK_A, p_password_hash: HASH_A });
  const soloB = Array.isArray(blocks) && blocks.filter(x => (x.get_my_blocks || x) === NICK_B).length === 1;
  soloB ? pass('block_user è idempotente (una sola riga)')
        : fail(`idempotenza: atteso 1 blocco su ${NICK_B}, ricevuto ${JSON.stringify(blocks)}`);

  // 4) get_my_blocks isola per utente
  blocks = await rpc('get_my_blocks', { p_nickname: NICK_B, p_password_hash: HASH_B });
  (Array.isArray(blocks) && blocks.length === 0)
    ? pass('get_my_blocks ritorna solo i propri blocchi')
    : fail(`get_my_blocks di B: atteso [], ricevuto ${JSON.stringify(blocks)}`);

  // 5) unblock
  await rpc('unblock_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });
  blocks = await rpc('get_my_blocks', { p_nickname: NICK_A, p_password_hash: HASH_A });
  (Array.isArray(blocks) && blocks.length === 0)
    ? pass('unblock_user rimuove il blocco')
    : fail(`dopo unblock: atteso [], ricevuto ${JSON.stringify(blocks)}`);
}
```

- [ ] **Step 4: Scrivere i test 6-8 (blocco vincolante sui messaggi)**

```js
async function testBloccoMessaggi() {
  console.log('— Blocco sui messaggi privati —');

  // B scrive ad A: deve passare (nessun blocco attivo)
  let r = await rpc('send_private_message', {
    p_sender_id: SID_B, p_sender_name: NICK_B, p_receiver_name: NICK_A,
    p_content: 'primo messaggio', p_sender_password_hash: HASH_B });
  if (!Array.isArray(r) && !r?.id && isError(r, 'blocked')) {
    fail('messaggio bloccato prima ancora del blocco');
  }

  // A blocca B
  await rpc('block_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });

  // 6) ora B non riesce più a scrivere ad A
  r = await rpc('send_private_message', {
    p_sender_id: SID_B, p_sender_name: NICK_B, p_receiver_name: NICK_A,
    p_content: 'messaggio dopo il blocco', p_sender_password_hash: HASH_B });
  isError(r, 'Blocked by recipient')
    ? pass('send_private_message da utente bloccato → Blocked by recipient')
    : fail(`invio da bloccato: atteso Blocked by recipient, ricevuto ${JSON.stringify(r)}`);

  // 8) l'inbox di A non mostra più i messaggi di B (nemmeno quello precedente al blocco)
  let inbox = await rpc('get_my_messages', { p_nickname: NICK_A, p_password_hash: HASH_A });
  const daB = Array.isArray(inbox) ? inbox.filter(m => m.sender_name === NICK_B) : [];
  daB.length === 0
    ? pass('get_my_messages non restituisce i messaggi di un bloccato')
    : fail(`inbox di A: attesi 0 messaggi da B, trovati ${daB.length}`);

  // 7) dopo lo sblocco l'invio torna possibile
  await rpc('unblock_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });
  r = await rpc('send_private_message', {
    p_sender_id: SID_B, p_sender_name: NICK_B, p_receiver_name: NICK_A,
    p_content: 'messaggio dopo lo sblocco', p_sender_password_hash: HASH_B });
  (r && r.id) ? pass('dopo unblock_user l\'invio riesce di nuovo')
              : fail(`invio dopo sblocco: atteso messaggio creato, ricevuto ${JSON.stringify(r)}`);
}
```

- [ ] **Step 5: Scrivere i test 9-12 (segnalazione)**

```js
async function testSegnalazione() {
  console.log('— Segnalazione —');
  const base = {
    p_reporter_nickname: NICK_A, p_password_hash: HASH_A, p_target_nickname: NICK_B,
    p_content_id: 'fake-id-1', p_content_snapshot: 'testo segnalato', p_details: null,
  };

  // 9) content_type fuori dominio
  let r = await rpc('report_content', { ...base, p_content_type: 'inesistente', p_reason: 'spam' });
  isError(r, 'invalid_content_type') ? pass('content_type fuori dominio → invalid_content_type')
                                     : fail(`content_type invalido: ricevuto ${JSON.stringify(r)}`);

  // 10) reason fuori dominio
  r = await rpc('report_content', { ...base, p_content_type: 'post', p_reason: 'perche_si' });
  isError(r, 'invalid_reason') ? pass('reason fuori dominio → invalid_reason')
                               : fail(`reason invalido: ricevuto ${JSON.stringify(r)}`);

  // 11) segnalazione valida
  r = await rpc('report_content', { ...base, p_content_type: 'post', p_reason: 'harassment',
                                    p_details: 'insulti ripetuti' });
  (r && r.id && r.status === 'open')
    ? pass('segnalazione valida creata con status open')
    : fail(`segnalazione valida: ricevuto ${JSON.stringify(r)}`);

  // 12) rate limit: 20 totali nelle 24h, la 21esima fallisce (1 già fatta sopra → altre 19 ok)
  for (let i = 0; i < 19; i++) {
    await rpc('report_content', { ...base, p_content_type: 'post', p_reason: 'spam' });
  }
  r = await rpc('report_content', { ...base, p_content_type: 'post', p_reason: 'spam' });
  isError(r, 'rate_limited') ? pass('21ª segnalazione in 24h → rate_limited')
                             : fail(`rate limit segnalazioni: ricevuto ${JSON.stringify(r)}`);
}
```

- [ ] **Step 6: Scrivere i test 13-15 (RLS e non-regressione B9)**

```js
async function testRlsERegressione() {
  console.log('— RLS e non-regressione —');

  // 13) content_reports non leggibile da anon
  let rows = await sb('content_reports?select=*&limit=5');
  (Array.isArray(rows) && rows.length === 0)
    ? pass('content_reports non leggibile via anon')
    : fail(`content_reports via anon: attese 0 righe, ricevuto ${JSON.stringify(rows).slice(0, 200)}`);

  // 14) user_blocks non leggibile da anon
  rows = await sb('user_blocks?select=*&limit=5');
  (Array.isArray(rows) && rows.length === 0)
    ? pass('user_blocks non leggibile via anon')
    : fail(`user_blocks via anon: attese 0 righe, ricevuto ${JSON.stringify(rows).slice(0, 200)}`);

  // 15) non-regressione B9: il rate-limit dei messaggi è ancora vivo dopo il CREATE OR REPLACE
  let last = null;
  for (let i = 0; i < 21; i++) {
    last = await rpc('send_private_message', {
      p_sender_id: SID_B, p_sender_name: NICK_B, p_receiver_name: NICK_A,
      p_content: `rate ${i}`, p_sender_password_hash: HASH_B });
  }
  isError(last, 'rate_limited')
    ? pass('rate-limit B9 sui messaggi ancora attivo dopo 16_')
    : fail(`non-regressione B9: atteso rate_limited alla 21ª, ricevuto ${JSON.stringify(last)}`);
}
```

- [ ] **Step 7: Aggiungere il runner in coda al file**

```js
(async () => {
  console.log('— Setup —');
  await cleanup();
  await seed();

  await testBlocco();
  await testBloccoMessaggi();
  await testSegnalazione();
  await testRlsERegressione();

  console.log('— Pulizia —');
  await cleanup();

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  if (failed > 0) process.exitCode = 1;
})();
```

- [ ] **Step 8: Eseguire i test e verificare che FALLISCANO**

```bash
npm install
node test-moderazione.js
```

Atteso: i test che chiamano `block_user`, `unblock_user`, `get_my_blocks`, `report_content` falliscono perché PostgREST risponde `404` / `Could not find the function`. È il rosso che dimostra che il test misura davvero. I test 13-14 potrebbero già passare (le tabelle non esistono → PostgREST risponde errore, non righe): va bene, verranno riverificati dopo l'apply.

- [ ] **Step 9: Commit**

```bash
git add test-moderazione.js
git commit -m "test(moderazione): suite RPC blocco e segnalazione (rossa, RPC non ancora create)"
```

---

### Task 2: SQL — tabelle, RPC e blocco lato server

**Files:**
- Create: `supabase/sql/16_moderazione.sql`

**Interfaces:**
- Consumes: `profiles(nickname, password_hash)`, `private_messages`, `notifications`. Corpo di `send_private_message` **così com'è in `13_rate_limit.sql`**, non in `05_messaggi_step_b.sql`.
- Produces: RPC `block_user(text,text,text)`, `unblock_user(text,text,text)`, `get_my_blocks(text,text) RETURNS SETOF text`, `report_content(text,text,text,text,text,text,text,text) RETURNS content_reports`. Il client del Task 3 chiama esattamente queste firme.

- [ ] **Step 1: Creare il file con tabelle, indici e RLS**

```sql
-- ============================================================================
-- SP1 — Moderazione: blocco utenti e segnalazione contenuti — 2026-09-17
-- ============================================================================
-- Requisito Google Play (policy UGC): ogni app con contenuti generati dagli
-- utenti e interazione fra utenti deve offrire segnalazione e blocco in-app.
-- Spec: docs/superpowers/specs/2026-09-17-moderazione-segnalazione-blocco-design.md
--
-- Pattern: RPC SECURITY DEFINER autenticate con (nickname, password_hash),
-- identico a Messaggi Step B e alle RPC GDPR. Solo account registrati.
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_blocks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_nickname text NOT NULL,
  blocked_nickname text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_nickname, blocked_nickname)
);

CREATE TABLE IF NOT EXISTS content_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_nickname text NOT NULL,
  target_nickname   text,
  content_type      text NOT NULL,
  content_id        text,
  content_snapshot  text,
  reason            text NOT NULL,
  details           text,
  status            text NOT NULL DEFAULT 'open',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_type_chk CHECK (content_type IN
    ('post','post_comment','ritual','ritual_comment','private_message','telepathy_chat','profile')),
  CONSTRAINT content_reports_reason_chk CHECK (reason IN
    ('spam','harassment','hate','sexual','violence','self_harm','other')),
  CONSTRAINT content_reports_status_chk CHECK (status IN
    ('open','reviewed','actioned','dismissed'))
);

-- Indici: lookup del blocco (hot path di ogni send_private_message) e finestra
-- del rate-limit segnalazioni. Stesso criterio degli indici di B9.
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker
  ON user_blocks (blocker_nickname);
CREATE INDEX IF NOT EXISTS idx_user_blocks_pair
  ON user_blocks (blocker_nickname, blocked_nickname);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter_created
  ON content_reports (reporter_nickname, created_at);

-- RLS ON senza NESSUNA policy: anon non legge e non scrive direttamente.
-- Si passa solo dalle RPC SECURITY DEFINER sotto. content_reports in
-- particolare non deve essere leggibile: contiene chi ha segnalato chi.
ALTER TABLE user_blocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports  ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Aggiungere le RPC di blocco**

```sql
-- ----------------------------------------------------------------------------
-- 1) block_user — idempotente, rifiuta auto-blocco e nickname inesistente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_user(
  p_nickname         text,
  p_password_hash    text,
  p_blocked_nickname text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  IF p_blocked_nickname IS NULL OR btrim(p_blocked_nickname) = '' THEN
    RAISE EXCEPTION 'Empty blocked_nickname';
  END IF;
  IF p_blocked_nickname = p_nickname THEN
    RAISE EXCEPTION 'cannot block yourself';
  END IF;

  INSERT INTO user_blocks (blocker_nickname, blocked_nickname)
  VALUES (p_nickname, p_blocked_nickname)
  ON CONFLICT (blocker_nickname, blocked_nickname) DO NOTHING;
END $$;

GRANT EXECUTE ON FUNCTION public.block_user(text, text, text) TO anon;

-- ----------------------------------------------------------------------------
-- 2) unblock_user
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unblock_user(
  p_nickname         text,
  p_password_hash    text,
  p_blocked_nickname text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  DELETE FROM user_blocks
   WHERE blocker_nickname = p_nickname
     AND blocked_nickname = p_blocked_nickname;
END $$;

GRANT EXECUTE ON FUNCTION public.unblock_user(text, text, text) TO anon;

-- ----------------------------------------------------------------------------
-- 3) get_my_blocks — i nickname che HO bloccato
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_blocks(
  p_nickname      text,
  p_password_hash text
)
RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  RETURN QUERY
    SELECT blocked_nickname FROM user_blocks
     WHERE blocker_nickname = p_nickname
     ORDER BY created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_blocks(text, text) TO anon;
```

- [ ] **Step 3: Aggiungere `report_content`**

```sql
-- ----------------------------------------------------------------------------
-- 4) report_content — segnalazione tipizzata, con snapshot del testo
-- ----------------------------------------------------------------------------
-- content_snapshot serve perché il contenuto segnalato può sparire prima della
-- revisione: la chat telepatia viene cancellata a fine match e l'autore può
-- rimuovere i propri contenuti. Senza copia, la segnalazione punterebbe al nulla.
CREATE OR REPLACE FUNCTION public.report_content(
  p_reporter_nickname text,
  p_password_hash     text,
  p_target_nickname   text,
  p_content_type      text,
  p_content_id        text,
  p_content_snapshot  text,
  p_reason            text,
  p_details           text
)
RETURNS content_reports
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row content_reports%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE nickname = p_reporter_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  IF p_content_type IS NULL OR p_content_type NOT IN
     ('post','post_comment','ritual','ritual_comment','private_message','telepathy_chat','profile') THEN
    RAISE EXCEPTION 'invalid_content_type';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN
     ('spam','harassment','hate','sexual','violence','self_harm','other') THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  -- Rate-limit (stesso pattern di B9: conteggio sul created_at esistente, nessuna
  -- tabella nuova, DOPO auth e validazioni e PRIMA dell'INSERT).
  IF (SELECT count(*) FROM content_reports
       WHERE reporter_nickname = p_reporter_nickname
         AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO content_reports (reporter_nickname, target_nickname, content_type,
                               content_id, content_snapshot, reason, details)
  VALUES (p_reporter_nickname, p_target_nickname, p_content_type, p_content_id,
          left(p_content_snapshot, 2000), p_reason, left(p_details, 1000))
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.report_content(text, text, text, text, text, text, text, text) TO anon;
```

- [ ] **Step 4: Riscrivere `send_private_message` partendo dal corpo di `13_rate_limit.sql`**

Il corpo sotto è quello **attualmente in produzione** (auth + validazioni + rate-limit B9), con le sole due righe nuove del blocco. Non semplificarlo e non riprenderlo da `05_messaggi_step_b.sql`: quella versione non ha il rate-limit e applicarla lo cancellerebbe in silenzio.

```sql
-- ----------------------------------------------------------------------------
-- 5) send_private_message — corpo di 13_rate_limit.sql + controllo blocco
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_private_message(
  p_sender_id            text,
  p_sender_name          text,
  p_receiver_name        text,
  p_content              text,
  p_sender_password_hash text
)
RETURNS private_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg private_messages%ROWTYPE;
  v_clean_content text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE nickname = p_sender_name AND password_hash = p_sender_password_hash
  ) THEN
    RAISE EXCEPTION 'Sender auth failed';
  END IF;

  v_clean_content := btrim(p_content);
  IF v_clean_content IS NULL OR v_clean_content = '' THEN RAISE EXCEPTION 'Empty content'; END IF;
  IF p_receiver_name IS NULL OR p_receiver_name = '' THEN RAISE EXCEPTION 'Empty receiver_name'; END IF;
  IF length(v_clean_content) > 2000 THEN RAISE EXCEPTION 'Content too long'; END IF;

  -- SP1: blocco in entrambe le direzioni. Il destinatario che ha bloccato non
  -- riceve; chi ha bloccato non scrive a chi ha bloccato.
  IF EXISTS (
    SELECT 1 FROM user_blocks
     WHERE (blocker_nickname = p_receiver_name AND blocked_nickname = p_sender_name)
        OR (blocker_nickname = p_sender_name   AND blocked_nickname = p_receiver_name)
  ) THEN
    RAISE EXCEPTION 'Blocked by recipient';
  END IF;

  -- Rate-limit (B9): max 20 messaggi per sender_name (autenticato) nell'ultimo minuto.
  IF p_sender_name IS NOT NULL AND (
       SELECT count(*) FROM private_messages
        WHERE sender_name = p_sender_name
          AND created_at > now() - interval '1 minute'
     ) >= 20 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO private_messages (sender_id, sender_name, receiver_name, content, is_read)
  VALUES (p_sender_id, p_sender_name, p_receiver_name, v_clean_content, false)
  RETURNING * INTO v_msg;

  INSERT INTO notifications (user_nickname, type, message)
  VALUES (p_receiver_name, 'private_message', p_sender_name || ' ti ha inviato un messaggio privato');

  RETURN v_msg;
END $$;

GRANT EXECUTE ON FUNCTION public.send_private_message(text, text, text, text, text) TO anon;
```

- [ ] **Step 5: Riscrivere `get_my_messages` con il filtro dei bloccati**

```sql
-- ----------------------------------------------------------------------------
-- 6) get_my_messages — corpo di 05_messaggi_step_b.sql + esclusione dei bloccati
-- ----------------------------------------------------------------------------
-- Lo storico NON viene cancellato: semplicemente non viene servito finché il
-- blocco è attivo. Uno sblocco lo fa riapparire.
CREATE OR REPLACE FUNCTION public.get_my_messages(
  p_nickname      text,
  p_password_hash text
)
RETURNS SETOF private_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE nickname = p_nickname AND password_hash = p_password_hash
  ) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  RETURN QUERY
    SELECT m.* FROM private_messages m
     WHERE (m.sender_name = p_nickname OR m.receiver_name = p_nickname)
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
          WHERE b.blocker_nickname = p_nickname
            AND b.blocked_nickname IN (m.sender_name, m.receiver_name)
       )
     ORDER BY m.created_at;
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_messages(text, text) TO anon;

-- ============================================================================
-- VERIFICA POST-APPLY (test: node test-moderazione.js → 15/15)
--   GET  /rest/v1/user_blocks?select=*       -> 0 righe (RLS senza policy)
--   GET  /rest/v1/content_reports?select=*   -> 0 righe
--   POST /rest/v1/rpc/block_user             -> 200
--   POST /rest/v1/rpc/report_content         -> 200 con status='open'
-- ============================================================================
```

- [ ] **Step 6: Fermarsi e chiedere a Irene di applicare l'SQL**

Non applicare nulla in autonomia. Messaggio da darle, un gesto alla volta:

1. apri `https://supabase.com/dashboard/project/vxzxdkcluyrcftsnxxza/sql/new`
2. incolla tutto il contenuto di `supabase/sql/16_moderazione.sql`
3. premi **Run**
4. dimmi cosa compare (atteso: `Success. No rows returned`)

- [ ] **Step 7: Rieseguire i test — ora devono passare**

```bash
node test-moderazione.js
```

Atteso: `Risultato: 15 passati, 0 falliti`. Se il test 15 fallisce, il corpo di `send_private_message` ha perso il rate-limit: torna allo Step 4.

- [ ] **Step 8: Verificare che i test preesistenti dei messaggi non siano regrediti**

```bash
node test-account-gdpr.js
```

Atteso: verde come prima. `test-messaggi.js` richiede il server locale e Playwright; va eseguito nel Task 8 insieme alla verifica finale.

- [ ] **Step 9: Commit**

```bash
git add supabase/sql/16_moderazione.sql
git commit -m "feat(moderazione): tabelle, RPC blocco/segnalazione e blocco server-side sui messaggi"
```

---

### Task 3: Client — stato dei bloccati

**Files:**
- Modify: `src/app.jsx` (stato del componente `GlobalAwakeningPlatform`, vicino agli altri `useState` intorno a riga 887)

**Interfaces:**
- Consumes: RPC `get_my_blocks` del Task 2; stato esistente `nickname`, `passwordHash`, `isGuest`.
- Produces: `blockedUsers` (array di stringhe), `isBlocked(nick)`, `reloadBlocks()`. I Task 4-6 usano solo questi tre nomi.

- [ ] **Step 1: Aggiungere lo stato con cache in localStorage**

Accanto agli altri `useState` (riga ~887, dove c'è già `passwordHash`):

```jsx
          // SP1 moderazione: nickname che l'utente ha bloccato. Cache locale per
          // evitare che al primo render compaiano contenuti che poi spariscono.
          const [blockedUsers, setBlockedUsers] = useState(() => {
            try { return JSON.parse(localStorage.getItem('ga_blocked') || '[]'); }
            catch { return []; }
          });
```

- [ ] **Step 2: Aggiungere il caricamento e l'helper**

Subito dopo lo stato:

```jsx
          const reloadBlocks = useCallback(async () => {
            if (!nickname || isGuest || !passwordHash) { setBlockedUsers([]); return; }
            const { data, error } = await supabase.rpc('get_my_blocks', {
              p_nickname: nickname,
              p_password_hash: passwordHash
            });
            if (error) return;                       // rete giù: si tiene la cache
            const list = (data || []).map(x => (typeof x === 'string' ? x : x.get_my_blocks));
            setBlockedUsers(list);
            try { localStorage.setItem('ga_blocked', JSON.stringify(list)); } catch {}
          }, [nickname, isGuest, passwordHash]);

          useEffect(() => { reloadBlocks(); }, [reloadBlocks]);

          // Usato da tutti i filtri di visibilità. Gli ospiti non bloccano nessuno.
          const isBlocked = (nick) => !!nick && blockedUsers.includes(nick);
```

Se `useCallback` non è ancora fra gli import di React nel file, aggiungerlo alla riga di destrutturazione esistente.

- [ ] **Step 3: Azzerare la cache al logout**

Nella funzione di logout, accanto alla rimozione di `ga_pwhash`:

```jsx
            localStorage.removeItem('ga_blocked');
            setBlockedUsers([]);
```

- [ ] **Step 4: Buildare e verificare che l'app parta**

```bash
node build.js
```

Atteso: nessun errore. Aprire `app.html` sul server locale e controllare che la console del browser sia pulita e che il login funzioni come prima.

- [ ] **Step 5: Commit**

```bash
git add src/app.jsx app.js
git commit -m "feat(moderazione): stato blockedUsers con cache locale e helper isBlocked"
```

---

### Task 4: Client — filtri di visibilità

**Files:**
- Modify: `src/app.jsx` (punti di lettura: ~1144, ~1157, ~1161, ~1165, ~2072, ~2814, ~2872, più inviti e coda telepatia)

**Interfaces:**
- Consumes: `isBlocked(nick)` dal Task 3.
- Produces: nessuna nuova API. Effetto osservabile: i contenuti dei bloccati non compaiono.

- [ ] **Step 1: Filtrare feed e commenti al post**

Riga ~1157, dopo il fetch dei post:

```jsx
                  const { data: postsData } = await supabase.from('consciousness_posts').select('*').order('created_at', { ascending: false }).limit(50);
                  setPosts((postsData || []).filter(p => !isBlocked(p.author_nickname)));
```

Stesso trattamento ai commenti (righe ~1161 e ~2872): `.filter(c => !isBlocked(c.author_nickname))` prima di metterli nello stato.

- [ ] **Step 2: Filtrare rituali e commenti ai rituali**

Riga ~1144: i rituali hanno l'autore in `creator`, non `author_nickname`.

```jsx
                  const { data: ritualsData } = await supabase.from('rituals').select('*').order('created_at', { ascending: false });
                  setRituals((ritualsData || []).filter(r => !isBlocked(r.creator)));
```

Righe ~1165 e ~2814 (commenti ai rituali): `.filter(c => !isBlocked(c.author_nickname))`.

- [ ] **Step 3: Filtrare la chat telepatia**

Riga ~2072, dopo il fetch:

```jsx
              setTelepathyChatMessages((data || []).filter(m => !isBlocked(m.user_name)));
```

Verificare il nome reale della colonna autore in `telepathy_chat` leggendo l'INSERT a riga ~2403 e usare quello.

- [ ] **Step 4: Filtrare inviti e coda telepatia**

Dove si leggono `telepathy_invites`, scartare gli inviti il cui mittente è bloccato prima di mostrarli. Dove il matchmaking propone un partner da `telepathy_queue`, se il partner è bloccato non accettare il match e restare in attesa.

- [ ] **Step 5: Verifica manuale**

Con due account su due browser: A blocca B, A ricarica. I post, i commenti, i rituali e gli inviti di B non compaiono più ad A. Dopo lo sblocco ricompaiono.

- [ ] **Step 6: Commit**

```bash
git add src/app.jsx app.js
git commit -m "feat(moderazione): filtra i contenuti dei bloccati su feed, rituali, chat e inviti"
```

---

### Task 5: Client — UI di segnalazione e blocco

**Files:**
- Modify: `src/app.jsx` (oggetto `translations` ~riga 130; card post ~3556; commenti post ~3590; card rituale ~3392; commenti rituale ~3485; chat telepatia ~4015; conversazione privata ~4376)

**Interfaces:**
- Consumes: `isBlocked`, `reloadBlocks` (Task 3); RPC `block_user`, `report_content` (Task 2).
- Produces: componente `ModerationMenu`, stato `reportTarget`, funzioni `doBlock(nick)` e `doReport(...)`.

- [ ] **Step 1: Aggiungere le stringhe IT ed EN**

Dentro `translations.it` una chiave `moderation`, e la gemella in `translations.en`:

```jsx
            moderation: {
              menu: 'Azioni',
              report: 'Segnala',
              block: 'Blocca',
              unblock: 'Sblocca',
              blockedUsers: 'Utenti bloccati',
              noBlocked: 'Non hai bloccato nessuno.',
              blockConfirm: 'Non vedrai più i suoi contenuti e non potrà scriverti. Puoi annullare quando vuoi.',
              blockDone: 'Utente bloccato.',
              reportTitle: 'Segnala contenuto',
              reportWhy: 'Perché lo segnali?',
              reportNotes: 'Note (facoltative)',
              reportSend: 'Invia segnalazione',
              reportDone: 'Segnalazione inviata. La esamineremo entro 48 ore.',
              reportRules: 'Regolamento dei contenuti',
              guestOnly: 'Serve un account registrato per segnalare o bloccare.',
              reasons: {
                spam: 'Spam o pubblicità',
                harassment: 'Molestie o insulti',
                hate: 'Odio o discriminazione',
                sexual: 'Contenuto sessuale',
                violence: 'Violenza o minacce',
                self_harm: 'Autolesionismo o suicidio',
                other: 'Altro'
              }
            },
```

Versione inglese con le stesse chiavi: `'Report'`, `'Block'`, `'Unblock'`, `'Blocked users'`, `"You haven't blocked anyone."`, `"You won't see their content and they won't be able to message you. You can undo this anytime."`, `'User blocked.'`, `'Report content'`, `'Why are you reporting this?'`, `'Notes (optional)'`, `'Send report'`, `"Report sent. We'll review it within 48 hours."`, `'Content rules'`, `'You need a registered account to report or block.'`, e le sette motivazioni tradotte.

- [ ] **Step 2: Aggiungere lo stato del dialog e le due azioni**

```jsx
          // SP1: quando != null il dialog di segnalazione è aperto.
          // { type, id, author, snapshot }
          const [reportTarget, setReportTarget] = useState(null);
          const [reportReason, setReportReason] = useState('spam');
          const [reportNotes, setReportNotes] = useState('');

          const doBlock = async (nick) => {
            if (isGuest || !passwordHash) { showToast(t.moderation.guestOnly); return; }
            const { error } = await supabase.rpc('block_user', {
              p_nickname: nickname, p_password_hash: passwordHash, p_blocked_nickname: nick
            });
            if (error) { showToast(error.message); return; }
            await reloadBlocks();
            showToast(t.moderation.blockDone);
          };

          const doReport = async () => {
            if (!reportTarget) return;
            if (isGuest || !passwordHash) { showToast(t.moderation.guestOnly); return; }
            const { error } = await supabase.rpc('report_content', {
              p_reporter_nickname: nickname,
              p_password_hash: passwordHash,
              p_target_nickname: reportTarget.author,
              p_content_type: reportTarget.type,
              p_content_id: reportTarget.id ? String(reportTarget.id) : null,
              p_content_snapshot: reportTarget.snapshot || null,
              p_reason: reportReason,
              p_details: reportNotes || null
            });
            setReportTarget(null);
            setReportNotes('');
            setReportReason('spam');
            showToast(error ? error.message : t.moderation.reportDone);
          };
```

Usare il meccanismo di notifica già presente nel file al posto di `showToast` se ha un altro nome: cercarlo prima di scrivere.

- [ ] **Step 3: Aggiungere il componente del menu**

Definito dentro `GlobalAwakeningPlatform`, così vede lo stato senza passare props:

```jsx
          // Menu ⋯ mostrato solo sui contenuti ALTRUI e solo agli account registrati.
          const ModerationMenu = ({ author, type, id, snapshot }) => {
            const [open, setOpen] = useState(false);
            if (!author || author === nickname) return null;
            if (isGuest) return null;
            return (
              <span style={{position: 'relative', marginLeft: 'auto'}}>
                <button
                  aria-label={t.moderation.menu}
                  onClick={() => setOpen(o => !o)}
                  className="text-secondary"
                  style={{background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: '1.1rem', lineHeight: 1, padding: '0.25rem 0.5rem', minHeight: '32px'}}
                >⋯</button>
                {open && (
                  <div style={{position: 'absolute', right: 0, top: '100%', zIndex: 40,
                               background: 'rgba(17,12,30,0.98)', border: '1px solid rgba(167,139,250,0.35)',
                               borderRadius: '0.75rem', padding: '0.25rem', minWidth: '11rem'}}>
                    <button
                      onClick={() => { setOpen(false); setReportTarget({ author, type, id, snapshot }); }}
                      style={{display: 'block', width: '100%', textAlign: 'left', background: 'none',
                              border: 'none', color: '#e9d5ff', padding: '0.6rem 0.75rem', cursor: 'pointer'}}
                    >{t.moderation.report}</button>
                    <button
                      onClick={() => { setOpen(false); doBlock(author); }}
                      style={{display: 'block', width: '100%', textAlign: 'left', background: 'none',
                              border: 'none', color: '#fca5a5', padding: '0.6rem 0.75rem', cursor: 'pointer'}}
                    >{t.moderation.block} {author}</button>
                  </div>
                )}
              </span>
            );
          };
```

- [ ] **Step 4: Innestare il menu sulle sei superfici**

In ogni card, nella riga d'intestazione che già contiene autore e data (è sempre un `<div className="flex items-center gap-2 ...">`), aggiungere il menu come ultimo figlio. Per il post (riga ~3556):

```jsx
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="text-primary font-medium text-sm"
                                style={{cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(167,139,250,0.4)'}}
                                onClick={() => openProfile(post.author_nickname)}
                              >{post.author_nickname}</span>
                              <span style={{color: '#c4b5fd'}} className="text-xs">{new Date(post.created_at).toLocaleString()}</span>
                              <ModerationMenu author={post.author_nickname} type="post" id={post.id} snapshot={post.content} />
                            </div>
```

Ripetere con gli stessi attributi cambiando solo `type`, `id`, `author`, `snapshot`:

| Superficie | riga | `type` | `author` | `snapshot` |
|---|---|---|---|---|
| commento al post | ~3590 | `post_comment` | `c.author_nickname` | `c.content` |
| rituale | ~3392 | `ritual` | `ritual.creator` | `ritual.description` |
| commento al rituale | ~3485 | `ritual_comment` | `c.author_nickname` | `c.content` |
| chat telepatia | ~4015 | `telepathy_chat` | autore del messaggio | testo del messaggio |
| messaggio privato | ~4376 | `private_message` | `msg.sender_name` | `msg.content` |

- [ ] **Step 5: Aggiungere il dialog di segnalazione**

Accanto agli altri overlay del file, così compare sopra qualunque schermata:

```jsx
          {reportTarget && (
            <div style={{position: 'fixed', inset: 0, zIndex: 60, display: 'flex',
                         alignItems: 'center', justifyContent: 'center', padding: '1rem',
                         background: 'rgba(0,0,0,0.7)'}}
                 onClick={() => setReportTarget(null)}>
              <div className="bg-glass rounded-2xl border-glass p-4"
                   style={{maxWidth: '26rem', width: '100%'}}
                   onClick={e => e.stopPropagation()}>
                <h3 className="text-white font-bold mb-3">{t.moderation.reportTitle}</h3>
                <p className="text-secondary text-xs mb-2">{t.moderation.reportWhy}</p>
                {['spam','harassment','hate','sexual','violence','self_harm','other'].map(k => (
                  <label key={k} style={{display: 'flex', alignItems: 'center', gap: '0.5rem',
                                         color: '#e9d5ff', padding: '0.35rem 0', cursor: 'pointer'}}>
                    <input type="radio" name="report-reason" value={k}
                           checked={reportReason === k}
                           onChange={() => setReportReason(k)} />
                    {t.moderation.reasons[k]}
                  </label>
                ))}
                <textarea
                  value={reportNotes}
                  onChange={e => setReportNotes(e.target.value)}
                  placeholder={t.moderation.reportNotes}
                  maxLength={1000}
                  style={{width: '100%', marginTop: '0.75rem', minHeight: '4.5rem',
                          background: 'rgba(255,255,255,0.06)', color: '#fff',
                          border: '1px solid rgba(167,139,250,0.3)', borderRadius: '0.6rem', padding: '0.5rem'}}
                />
                <div className="flex gap-2" style={{marginTop: '0.75rem'}}>
                  <button className="btn-primary" onClick={doReport}>{t.moderation.reportSend}</button>
                  <button className="btn-secondary" onClick={() => setReportTarget(null)}>{t.common.cancel}</button>
                </div>
                <a href="regole.html" target="_blank" rel="noopener"
                   className="text-secondary text-xs"
                   style={{display: 'inline-block', marginTop: '0.75rem'}}>{t.moderation.reportRules}</a>
              </div>
            </div>
          )}
```

Verificare il nome reale della chiave "Annulla" già presente in `translations` e usare quella invece di `t.common.cancel` se differisce.

- [ ] **Step 6: Buildare e provare a mano**

```bash
node build.js
```

Con due account: il menu `⋯` compare sui contenuti altrui e **non** sui propri; il dialog si apre, invia, mostra la conferma; passando l'app in inglese tutte le stringhe nuove sono tradotte.

- [ ] **Step 7: Commit**

```bash
git add src/app.jsx app.js
git commit -m "feat(moderazione): menu azioni, dialog di segnalazione e stringhe IT/EN"
```

---

### Task 6: Client — schermata utenti bloccati e azioni sul profilo

**Files:**
- Modify: `src/app.jsx` (scheda profilo altrui ~4300; sezione profilo proprio, accanto alle voci GDPR)

**Interfaces:**
- Consumes: `blockedUsers`, `reloadBlocks`, `doBlock`, `setReportTarget`.
- Produces: nessuna nuova API.

- [ ] **Step 1: Aggiungere le due azioni sulla scheda profilo altrui**

Sotto il blocco `viewingProfile.bio` (riga ~4306), visibile solo se il profilo non è il proprio e l'utente non è ospite:

```jsx
                          {viewingProfile.nickname !== nickname && !isGuest && (
                            <div className="flex gap-2" style={{justifyContent: 'center'}}>
                              <button className="btn-secondary" style={{fontSize: '0.8rem'}}
                                onClick={() => setReportTarget({
                                  author: viewingProfile.nickname, type: 'profile',
                                  id: null, snapshot: viewingProfile.bio || ''
                                })}>{t.moderation.report}</button>
                              {blockedUsers.includes(viewingProfile.nickname) ? (
                                <button className="btn-secondary" style={{fontSize: '0.8rem'}}
                                  onClick={async () => {
                                    await supabase.rpc('unblock_user', {
                                      p_nickname: nickname, p_password_hash: passwordHash,
                                      p_blocked_nickname: viewingProfile.nickname });
                                    await reloadBlocks();
                                  }}>{t.moderation.unblock}</button>
                              ) : (
                                <button className="btn-secondary" style={{fontSize: '0.8rem', color: '#fca5a5'}}
                                  onClick={() => doBlock(viewingProfile.nickname)}>{t.moderation.block}</button>
                              )}
                            </div>
                          )}
```

- [ ] **Step 2: Aggiungere la lista degli utenti bloccati nel proprio profilo**

Accanto alle voci GDPR (export ed eliminazione account):

```jsx
                      <div className="bg-glass-dark rounded-xl p-4">
                        <p className="text-white font-bold mb-2">{t.moderation.blockedUsers}</p>
                        {blockedUsers.length === 0 ? (
                          <p className="text-secondary text-xs">{t.moderation.noBlocked}</p>
                        ) : blockedUsers.map(nick => (
                          <div key={nick} className="flex items-center gap-2" style={{padding: '0.35rem 0'}}>
                            <span className="text-white text-sm">{nick}</span>
                            <button className="btn-secondary"
                              style={{marginLeft: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.7rem'}}
                              onClick={async () => {
                                await supabase.rpc('unblock_user', {
                                  p_nickname: nickname, p_password_hash: passwordHash,
                                  p_blocked_nickname: nick });
                                await reloadBlocks();
                              }}>{t.moderation.unblock}</button>
                          </div>
                        ))}
                      </div>
```

- [ ] **Step 3: Buildare e verificare il giro completo**

```bash
node build.js
```

Blocco dal profilo → l'utente compare nella lista → Sblocca → sparisce e i suoi contenuti tornano visibili dopo un ricaricamento.

- [ ] **Step 4: Commit**

```bash
git add src/app.jsx app.js
git commit -m "feat(moderazione): lista utenti bloccati nel profilo e azioni sulla scheda altrui"
```

---

### Task 7: Regolamento dei contenuti

Il dialog del Task 5 rimanda a `regole.html`. La roadmap la collocava in SP2, ma un link morto in un flusso che Google ispeziona è un difetto: la pagina si fa qui. È l'unico scostamento dalla spec e va riportato nella roadmap.

**Files:**
- Create: `regole.html`
- Modify: `docs/superpowers/specs/2026-09-17-distribuzione-play-store-roadmap.md` (sposta `regole.html` da SP2 a SP1)

**Interfaces:**
- Consumes: niente.
- Produces: `https://global-awakening.github.io/regole.html`, raggiungibile senza login. Verrà indicata anche in Play Console.

- [ ] **Step 1: Creare la pagina**

Pagina statica autonoma, stesso fondo scuro e stesso viola dell'app (`#0c0f14`, `#a78bfa`), nessuna dipendenza esterna, `lang="it"`, responsive a larghezza telefono. Contenuti obbligatori:

- cosa non è ammesso: molestie e insulti, odio e discriminazione, contenuto sessuale, violenza e minacce, incitamento all'autolesionismo, spam e pubblicità, impersonazione;
- come si segnala: menu `⋯` sul contenuto, oppure Segnala sulla scheda profilo;
- come si blocca e cosa comporta;
- tempi: le segnalazioni sono esaminate entro 48 ore;
- conseguenze: rimozione del contenuto e, nei casi gravi, dell'account;
- contatto: `global.awakening.app@gmail.com`.

- [ ] **Step 2: Aggiornare la roadmap**

Nella tabella di SP2 togliere la riga `regole.html` e annotare in SP1 che la pagina è stata realizzata lì, per non lasciare il link morto.

- [ ] **Step 3: Verificare la pagina in locale**

Aprirla sul server locale e controllare che si legga bene a 360px di larghezza e che non ci sia scroll orizzontale.

- [ ] **Step 4: Commit**

```bash
git add regole.html docs/superpowers/specs/2026-09-17-distribuzione-play-store-roadmap.md
git commit -m "feat(moderazione): regolamento dei contenuti pubblico e link dal dialog"
```

---

### Task 8: Notifica email delle segnalazioni

**Files:**
- Create: `supabase/functions/notify-content-report/index.ts`
- Modify: `src/app.jsx` (in `doReport`, dopo l'esito positivo)

**Interfaces:**
- Consumes: pattern di `supabase/functions/notify-ritual-participants/index.ts` per l'invio e per i segreti.
- Produces: endpoint invocabile dal client; nessun valore di ritorno usato.

- [ ] **Step 1: Scrivere la Edge Function**

Riprende struttura, CORS e gestione dei segreti da `notify-ritual-participants/index.ts`. Riceve `{ report_id, content_type, reason, target_nickname, reporter_nickname }` e manda una mail a `global.awakening.app@gmail.com` con oggetto `[Global Awakening] Segnalazione <reason> su <content_type>`. **Non** include il testo segnalato nel corpo della mail: resta in `content_reports.content_snapshot`, così il contenuto sensibile non viaggia via email.

- [ ] **Step 2: Chiamarla dal client, senza far fallire la segnalazione**

In `doReport`, dopo l'esito positivo della RPC:

```jsx
            // Best-effort: se la mail non parte, la segnalazione resta comunque salvata.
            supabase.functions.invoke('notify-content-report', {
              body: { report_id: data?.id, content_type: reportTarget.type,
                      reason: reportReason, target_nickname: reportTarget.author,
                      reporter_nickname: nickname }
            }).catch(() => {});
```

Serve catturare `data` dalla chiamata RPC, che allo Step 2 del Task 5 non veniva usata.

- [ ] **Step 3: Chiedere a Irene il deploy della funzione**

Un gesto alla volta, come per l'SQL. Non fare il deploy in autonomia.

- [ ] **Step 4: Verificare l'arrivo della mail**

Inviare una segnalazione di prova e controllare la casella `global.awakening.app@gmail.com`. Se non arriva, la segnalazione deve comunque risultare in `content_reports`: è il comportamento corretto, non un fallimento del task.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notify-content-report/index.ts src/app.jsx app.js
git commit -m "feat(moderazione): notifica email best-effort delle segnalazioni"
```

---

### Task 9: Verifica finale e review indipendente

**Files:** nessuna modifica prevista; eventuali fix nascono dai rilievi.

- [ ] **Step 1: Suite completa**

```bash
node test-moderazione.js
node test-account-gdpr.js
node test-privacy.js
node test-messaggi.js
```

`test-messaggi.js` richiede il server locale e Playwright. Attesi tutti verdi. Incollare l'output, non riassumerlo.

- [ ] **Step 2: Verifica che nessun dato di test sia rimasto**

Da Studio: `select count(*) from content_reports where reporter_nickname like 'Mod\_%';` → 0. Stesso controllo su `user_blocks`.

- [ ] **Step 3: Review con sub-agente indipendente**

Dispacciare un agente che non ha implementato la feature, con il diff dell'intero branch e i due documenti (spec e piano). Deve verificare in particolare: che `send_private_message` abbia ancora il rate-limit B9; che nessuna policy RLS sia stata aperta per errore; che il menu non compaia sui contenuti propri; che tutte le stringhe esistano in IT e EN; che non ci siano segreti nel codice.

- [ ] **Step 4: Sistemare i rilievi e ripetere dallo Step 1**

Iterare finché la review non ha rilievi aperti e la suite è verde due volte di fila.

- [ ] **Step 5: Aggiornare il ledger**

Riportare l'esito in `.superpowers/sdd/progress.md` come per gli interventi precedenti.

---

## Self-review del piano

**Copertura della spec.** Schema → Task 2 Step 1. RPC → Task 2 Step 2-3. Blocco server-side → Task 2 Step 4-5. Blocco client-side → Task 3 e 4. UI → Task 5 e 6. Regolamento → Task 7. Canale di moderazione → Task 8. I 15 test → Task 1, eseguiti in Task 2 e 9. Rubric → Task 9.

**Scostamento dalla spec:** `regole.html` era in SP2, viene realizzata in SP1 (Task 7) per non lasciare un link morto nel dialog. Registrato nel task e riportato nella roadmap.

**Coerenza dei nomi.** `isBlocked`, `reloadBlocks`, `blockedUsers`, `doBlock`, `doReport`, `reportTarget`, `ModerationMenu` sono definiti nel Task 3 e 5 e usati con lo stesso nome nei Task 4, 5, 6 e 8. Le firme RPC del Task 2 corrispondono ai parametri passati nei Task 5 e 6. L'errore di rate limit è `rate_limited` ovunque, l'errore di blocco `Blocked by recipient` ovunque.

**Punti in cui il piano dice di verificare invece di assumere:** nome della colonna autore in `telepathy_chat` (Task 4 Step 3), nome della funzione di toast (Task 5 Step 2), chiave di traduzione per "Annulla" (Task 5 Step 5). Sono i tre punti che non ho potuto fissare senza leggere il codice in quel punto esatto, e il piano lo dice invece di inventare un nome.
