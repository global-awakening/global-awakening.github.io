# Notifiche push di avvio rituale — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** far arrivare sul telefono una notifica quando un rituale a cui la persona si è iscritta sta per iniziare e quando inizia, anche ad app chiusa.

**Architecture:** un cron `pg_cron` sveglia ogni minuto una Edge Function Deno; la funzione classifica i rituali in finestra, risolve gli abbonamenti push dei partecipanti, registra l'invio *prima* di spedirlo (la PK composta rende impossibile un doppione) e manda la push firmata VAPID. Nel browser, `sw.js` riceve e mostra la notifica.

**Tech Stack:** Postgres 15 + `pg_cron` 1.6.4 + `pg_net` (da installare), Supabase Edge Functions (Deno), React 18 via `src/app.jsx` → `app.js` (`node build.js`), service worker vanilla, test E2E Playwright come script node autonomi.

**Spec:** `docs/superpowers/specs/2026-09-21-notifiche-push-avvio-rituali-design.md`

## Nota di chiusura (aggiunta a lavoro fatto)

Il **Task 1 è in parte superato**: lo strumento `scripts/csp-hashes.js` che prescrive è stato
scritto e poi **rimosso**, perché `buildCsp()` dentro `build.js` faceva già esattamente quel
lavoro, normalizzazione CRLF→LF compresa. Del Task 1 resta valido solo `gen-vapid.js` e
l'inserimento della chiave pubblica in `app.html`; gli hash CSP li riallinea `node build.js`,
che va comunque eseguito a ogni modifica di `src/app.jsx`. Ogni riferimento a
`test-csp-hashes.js` più sotto è da ignorare.

Altre differenze fra il piano e ciò che è stato costruito sono elencate in §0 della spec.

---

## Global Constraints

- **Ramo:** `feat/notifiche-push-rituali`. Mai commit su `main`, mai push senza dirlo a Irene.
- **Stato del database solo in migration versionate** in `supabase/sql/`, mai digitato nello Studio. Si applicano con `node scripts/apply-sql.js <file>` (token ristretto in `.env.local`).
- **File SQL e JS scritti con terminatori LF.** Un `\r` dentro una stringa JSON è il bug che ha tenuto il cron rotto per cinque mesi.
- **Il pre-commit hook blocca la parola che nomina il ruolo di servizio Supabase** anche nei commenti: scrivere «chiave di servizio». Non usare `--no-verify`.
- **La CSP di `app.html` contiene gli hash sha256 dei 4 script inline.** Ogni modifica a uno script inline richiede di ricalcolare l'hash, altrimenti la pagina resta bianca in produzione. Task 1 crea lo strumento che lo fa.
- **`src/app.jsx` è il sorgente; `app.js` è il build.** Dopo ogni modifica: `node build.js`. Si committano entrambi.
- **Test:** script node autonomi nella radice (`node test-xxx.js`), server locale su `http://localhost:4321`. Usano `test-helpers.js` per la pulizia.
- **Niente dipendenze npm nuove nel client.** Il client Supabase è fatto a mano in `app.html`.
- Finestre: `reminder` se `now >= start - 15min AND now < start`; `start` se `now >= start AND now < start + 5min`.
- Testo del promemoria **senza numero di minuti** («sta per iniziare»), perché chi si iscrive a T-5 è ancora dentro la soglia.
- Lingue supportate: `it` e `en`, come il resto dell'app.

---

### Task 1: Chiavi VAPID e strumento per gli hash CSP

Le push si firmano con una coppia di chiavi VAPID. La pubblica va nel client, la privata solo nei segreti della Edge Function. Per metterla nel client bisogna toccare uno script inline di `app.html`, e senza ricalcolare l'hash CSP la pagina muore: quindi lo strumento nasce qui.

**Files:**
- Create: `scripts/csp-hashes.js`
- Create: `scripts/gen-vapid.js`
- Modify: `app.html` (script inline delle costanti, e la `<meta>` CSP)
- Test: `test-csp-hashes.js`

**Interfaces:**
- Consumes: niente.
- Produces: la costante globale `VAPID_PUBLIC_KEY` (string base64url) disponibile in `app.html`; `node scripts/csp-hashes.js --check` esce con codice 1 se un hash non corrisponde, `--fix` riscrive la `<meta>`.

- [ ] **Step 1: Scrivi il test che fallisce**

```js
// test-csp-hashes.js
const { execFileSync } = require('child_process');
const fs = require('fs');

function run(args) {
  return execFileSync('node', ['scripts/csp-hashes.js', ...args], { encoding: 'utf8' });
}

// 1. su app.html integro, --check passa
run(['--check']);
console.log('✅ --check passa su app.html integro');

// 2. sporcando uno script inline, --check deve fallire
const originale = fs.readFileSync('app.html', 'utf8');
try {
  fs.writeFileSync('app.html', originale.replace('const SUPABASE_URL', 'const SUPABASE_URL_X'), 'utf8');
  let fallito = false;
  try { run(['--check']); } catch { fallito = true; }
  if (!fallito) throw new Error('--check NON ha visto lo script modificato');
  console.log('✅ --check vede uno script inline modificato');

  // 3. --fix rimette a posto gli hash, e dopo --check passa
  run(['--fix']);
  run(['--check']);
  console.log('✅ --fix aggiorna la CSP');
} finally {
  fs.writeFileSync('app.html', originale, 'utf8');
}
console.log('\nTutti i controlli CSP passati.');
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `node test-csp-hashes.js`
Expected: FAIL — `Cannot find module 'scripts/csp-hashes.js'`

- [ ] **Step 3: Scrivi `scripts/csp-hashes.js`**

```js
#!/usr/bin/env node
/**
 * csp-hashes.js — tiene allineati gli hash sha256 degli script inline con la CSP di app.html.
 *
 * Perché esiste: la CSP di app.html elenca un 'sha256-...' per ogni <script> inline. Se si
 * modifica anche un solo carattere dentro uno di quegli script senza aggiornare l'hash, il
 * browser rifiuta di eseguirlo e la pagina resta BIANCA in produzione. Non c'è test E2E che
 * lo veda in locale, perché in locale la CSP spesso non morde allo stesso modo.
 *
 * Uso:
 *   node scripts/csp-hashes.js --check   # esce 1 se un hash non corrisponde
 *   node scripts/csp-hashes.js --fix     # riscrive la <meta> con gli hash giusti
 */
const fs = require('fs');
const crypto = require('crypto');

const FILE = 'app.html';

function hashesInline(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push('sha256-' + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64'));
  }
  return out;
}

function main() {
  const modo = process.argv[2];
  if (modo !== '--check' && modo !== '--fix') {
    console.error('Uso: node scripts/csp-hashes.js --check | --fix');
    process.exit(2);
  }

  const html = fs.readFileSync(FILE, 'utf8');
  const attesi = hashesInline(html);

  const metaRe = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
  const meta = html.match(metaRe);
  if (!meta) { console.error('CSP non trovata in ' + FILE); process.exit(2); }

  const presenti = (meta[2].match(/'sha256-[A-Za-z0-9+/=]+'/g) || []).map((s) => s.slice(1, -1));
  const mancanti = attesi.filter((h) => !presenti.includes(h));
  const avanzati = presenti.filter((h) => !attesi.includes(h));

  if (modo === '--check') {
    if (mancanti.length === 0 && avanzati.length === 0) {
      console.log(`✅ CSP allineata: ${attesi.length} script inline, ${attesi.length} hash.`);
      return;
    }
    console.error('❌ CSP disallineata.');
    mancanti.forEach((h) => console.error(`   manca nella CSP: ${h}`));
    avanzati.forEach((h) => console.error(`   nella CSP ma nessuno script corrisponde: ${h}`));
    console.error('   Rimedio: node scripts/csp-hashes.js --fix');
    process.exit(1);
  }

  // --fix: sostituisce il blocco di script-src mantenendo il resto della direttiva
  let nuovaCsp = meta[2].replace(/\s*'sha256-[A-Za-z0-9+/=]+'/g, '');
  nuovaCsp = nuovaCsp.replace(/(script-src[^;]*)/, (s) => s + ' ' + attesi.map((h) => `'${h}'`).join(' '));
  fs.writeFileSync(FILE, html.replace(metaRe, `$1${nuovaCsp}$3`), 'utf8');
  console.log(`✅ CSP aggiornata con ${attesi.length} hash.`);
}

main();
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `node test-csp-hashes.js`
Expected: PASS — tre controlli verdi. Se il primo fallisce subito, la CSP era **già** disallineata prima di questo lavoro: fermarsi e dirlo a Irene, non «aggiustare» in silenzio.

- [ ] **Step 5: Scrivi `scripts/gen-vapid.js`**

```js
#!/usr/bin/env node
/**
 * gen-vapid.js — genera una coppia di chiavi VAPID per le notifiche push.
 *
 * La PUBBLICA va in app.html (è pubblica per definizione: il browser la vede comunque).
 * La PRIVATA va SOLO nei segreti della Edge Function. Non finisce mai nel repo.
 *
 * Uso: node scripts/gen-vapid.js
 */
const crypto = require('crypto');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-65);
const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(36, 68);

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

console.log('VAPID_PUBLIC_KEY  =', b64url(pubRaw));
console.log('VAPID_PRIVATE_KEY =', b64url(privRaw));
console.log('');
console.log('La pubblica va in app.html, la privata SOLO nei segreti della Edge Function:');
console.log('  supabase secrets set VAPID_PRIVATE_KEY=... VAPID_PUBLIC_KEY=... VAPID_SUBJECT=mailto:global.awakening.app@gmail.com');
```

- [ ] **Step 6: Genera le chiavi e metti la pubblica in `app.html`**

Run: `node scripts/gen-vapid.js`

Nello script inline di `app.html` che contiene già `SUPABASE_URL` (intorno alla riga 28), aggiungere subito **dopo** `SUPABASE_KEY`:

```js
    // Chiave pubblica VAPID: firma le notifiche push. È pubblica per definizione — il browser
    // la riceve comunque quando ci si iscrive. La privata sta solo nei segreti della Edge Function.
    const VAPID_PUBLIC_KEY = 'INCOLLA_QUI_LA_PUBBLICA';
```

La privata va conservata da Irene e caricata nei segreti della Edge Function (Task 6). **Non scriverla in nessun file del repo**, `.env.local` compreso.

- [ ] **Step 7: Riallinea la CSP e verifica**

Run: `node scripts/csp-hashes.js --fix && node scripts/csp-hashes.js --check && node test-csp-hashes.js`
Expected: tutto verde.

- [ ] **Step 8: Verifica che l'app si carichi ancora**

Run: `node build.js`, poi servire la cartella su `localhost:4321` e aprire `app.html`.
Expected: l'app si apre normalmente, **zero errori CSP in console**.

- [ ] **Step 9: Commit**

```bash
git add scripts/csp-hashes.js scripts/gen-vapid.js test-csp-hashes.js app.html
git commit -m "feat(push): chiave VAPID nel client e strumento per gli hash CSP"
```

---

### Task 2: RPC di registrazione e cancellazione degli abbonamenti

Le tabelle esistono già (migration 19) e sono chiuse: RLS attiva, zero policy. Servono le due porte controllate da cui il client può passare.

**Files:**
- Create: `supabase/sql/21_push_rpc.sql`
- Test: `test-push-rpc.js`

**Interfaces:**
- Consumes: tabelle `push_subscriptions`, `ritual_notifications_sent` (migration 19).
- Produces:
  - `register_push_subscription(p_session_id text, p_endpoint text, p_p256dh text, p_auth text, p_locale text) returns void`
  - `delete_push_subscription(p_endpoint text) returns void`

- [ ] **Step 1: Scrivi il test che fallisce**

```js
// test-push-rpc.js
/**
 * Test delle RPC degli abbonamenti push.
 * Esecuzione: node test-push-rpc.js
 * Prerequisiti: 19_push_notifiche_rituali.sql e 21_push_rpc.sql applicate.
 */
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const { getServiceKey } = require('./test-helpers');

const H = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
const TS = Date.now();
const SID = `push_test_${TS}`;
const ENDPOINT = `https://fcm.googleapis.com/fcm/send/test_${TS}`;

let passati = 0, falliti = 0;
function ok(nome) { console.log('✅ ' + nome); passati++; }
function ko(nome, dettaglio) { console.error('❌ ' + nome + ' — ' + dettaglio); falliti++; }

async function rpc(nome, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  return { status: res.status, testo: await res.text() };
}

async function contaRighe() {
  const key = getServiceKey();
  if (!key) return null; // senza chiave non si finge: si salta
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?session_id=eq.${SID}&select=id,endpoint,locale`, {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  return await res.json();
}

(async () => {
  // 1. registrazione
  let r = await rpc('register_push_subscription', {
    p_session_id: SID, p_endpoint: ENDPOINT, p_p256dh: 'chiave_p256dh_finta', p_auth: 'chiave_auth_finta', p_locale: 'it'
  });
  r.status < 300 ? ok('registrazione accettata') : ko('registrazione accettata', r.status + ' ' + r.testo);

  // 2. stesso endpoint una seconda volta: aggiorna, non duplica
  r = await rpc('register_push_subscription', {
    p_session_id: SID, p_endpoint: ENDPOINT, p_p256dh: 'chiave_p256dh_finta', p_auth: 'chiave_auth_finta', p_locale: 'en'
  });
  const righe = await contaRighe();
  if (righe === null) console.log('⏭️  conteggio saltato: manca SUPABASE_SERVICE_KEY in .env.test');
  else if (righe.length === 1 && righe[0].locale === 'en') ok('seconda registrazione aggiorna e non duplica');
  else ko('seconda registrazione aggiorna e non duplica', JSON.stringify(righe));

  // 3. anon NON legge la tabella
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint`, { headers: H });
  const corpo = await res.json();
  Array.isArray(corpo) && corpo.length === 0
    ? ok('anon non legge push_subscriptions')
    : ko('anon non legge push_subscriptions', JSON.stringify(corpo).slice(0, 120));

  // 4. endpoint non https rifiutato
  r = await rpc('register_push_subscription', {
    p_session_id: SID, p_endpoint: 'http://cattivo.example/x', p_p256dh: 'a', p_auth: 'b', p_locale: 'it'
  });
  r.status >= 400 ? ok('endpoint non https rifiutato') : ko('endpoint non https rifiutato', 'accettato con ' + r.status);

  // 5. cancellazione
  r = await rpc('delete_push_subscription', { p_endpoint: ENDPOINT });
  const dopo = await contaRighe();
  if (dopo === null) console.log('⏭️  verifica cancellazione saltata');
  else if (dopo.length === 0) ok('cancellazione rimuove la riga');
  else ko('cancellazione rimuove la riga', JSON.stringify(dopo));

  console.log(`\n${passati} passati, ${falliti} falliti`);
  process.exit(falliti === 0 ? 0 : 1);
})();
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `node test-push-rpc.js`
Expected: FAIL — la RPC non esiste (404 / `Could not find the function`).

- [ ] **Step 3: Scrivi `supabase/sql/21_push_rpc.sql`**

```sql
-- 21_push_rpc.sql
--
-- Le due porte controllate verso `push_subscriptions`, che ha RLS attiva e zero policy:
-- dal client non si legge e non si scrive, si passa solo da qui.
--
-- Perche' SECURITY DEFINER: chiunque legga endpoint + chiavi puo' mandare notifiche a quel
-- telefono. Concedere una policy di SELECT al client significherebbe regalare a chiunque la
-- lista di tutti i telefoni raggiungibili. Quindi si scrive alla cieca e non si legge mai.
--
-- search_path fissato: stessa scelta di 11_/12_, evita che un search_path ostile dirotti i
-- nomi non qualificati dentro una funzione che gira coi privilegi del proprietario.

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_session_id text,
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_locale     text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Validazione: niente di tutto questo arriva da una fonte di cui ci si possa fidare.
  IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'session_id non valido';
  END IF;

  -- L'endpoint e' un indirizzo del servizio push del browser: sempre https, mai altro.
  -- Senza questo controllo la tabella diventa una lista di URL arbitrari che il server
  -- chiamera' da solo ogni minuto — cioe' un trampolino per richieste verso l'interno.
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]{1,900}$' THEN
    RAISE EXCEPTION 'endpoint non valido';
  END IF;

  IF p_p256dh IS NULL OR length(p_p256dh) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'p256dh non valido';
  END IF;

  IF p_auth IS NULL OR length(p_auth) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'auth non valido';
  END IF;

  IF p_locale IS NULL OR p_locale NOT IN ('it', 'en') THEN
    RAISE EXCEPTION 'locale non valido';
  END IF;

  INSERT INTO public.push_subscriptions (session_id, endpoint, p256dh, auth, locale)
  VALUES (p_session_id, p_endpoint, p_p256dh, p_auth, p_locale)
  ON CONFLICT (endpoint) DO UPDATE
    SET session_id    = EXCLUDED.session_id,
        p256dh        = EXCLUDED.p256dh,
        auth          = EXCLUDED.auth,
        locale        = EXCLUDED.locale,
        last_seen_at  = now(),
        failure_count = 0;
END;
$$;

-- La cancellazione prende solo l'endpoint: e' gia' un segreto che possiede solo chi possiede
-- quel browser. Chiedere anche il session_id non aggiungerebbe sicurezza, perche' il session_id
-- e' meno segreto dell'endpoint.
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_endpoint IS NULL OR length(p_endpoint) NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION 'endpoint non valido';
  END IF;

  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.delete_push_subscription(text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO anon, authenticated;
```

- [ ] **Step 4: Applica la migration**

Run: `node scripts/apply-sql.js supabase/sql/21_push_rpc.sql --dry-run` poi senza `--dry-run`
Expected: `applicato (HTTP 201)`

- [ ] **Step 5: Lancia il test e verifica che passi**

Run: `node test-push-rpc.js`
Expected: `5 passati, 0 falliti` (o alcuni ⏭️ se manca `SUPABASE_SERVICE_KEY` in `.env.test`).

- [ ] **Step 6: Commit**

```bash
git add supabase/sql/21_push_rpc.sql test-push-rpc.js
git commit -m "feat(push): RPC di registrazione e cancellazione degli abbonamenti"
```

---

### Task 3: «Elimina account» cancella anche gli abbonamenti push

Il debito annotato nella migration 19. Chi cancella l'account oggi lascerebbe un abbonamento vivo che continua a ricevere notifiche di rituali.

**Files:**
- Read first: `supabase/sql/17_fix_delete_account.sql` (per intero)
- Create: `supabase/sql/22_delete_account_push.sql`
- Modify: `test-account-gdpr.js`

**Interfaces:**
- Consumes: `delete_my_account(p_nickname, p_password_hash)` come definita in 17.
- Produces: la stessa funzione, con in più la cancellazione degli abbonamenti push.

- [ ] **Step 1: Leggi per intero la funzione attuale**

Run: `cat supabase/sql/17_fix_delete_account.sql`

**Non riscriverla a memoria.** È `SECURITY DEFINER` e tocca una dozzina di tabelle: la nuova versione deve essere quella vecchia **identica** più una riga. Copiare il corpo, non ricostruirlo.

- [ ] **Step 2: Aggiungi al test GDPR il controllo che fallisce**

In `test-account-gdpr.js`, dopo la registrazione dell'utente di prova e **prima** della chiamata a `delete_my_account`, registrare un abbonamento push per quel `sessionId`; dopo la cancellazione, verificare con la chiave di servizio che non resti nessuna riga:

```js
// --- abbonamento push: deve sparire con l'account ---
const ENDPOINT_PUSH = `https://fcm.googleapis.com/fcm/send/gdpr_${TS}`;
await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_push_subscription`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    p_session_id: sessionId, p_endpoint: ENDPOINT_PUSH,
    p_p256dh: 'x', p_auth: 'y', p_locale: 'it'
  })
});

// ... qui avviene la delete_my_account già esistente ...

const keyServizio = getServiceKey();
if (!keyServizio) {
  console.log('⏭️  verifica push saltata: manca SUPABASE_SERVICE_KEY in .env.test');
} else {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?session_id=eq.${sessionId}&select=id`, {
    headers: { 'apikey': keyServizio, 'Authorization': 'Bearer ' + keyServizio }
  });
  const rimaste = await res.json();
  rimaste.length === 0
    ? ok('elimina account rimuove gli abbonamenti push')
    : ko('elimina account rimuove gli abbonamenti push', `rimaste ${rimaste.length} righe`);
}
```

- [ ] **Step 3: Lancia il test e verifica che fallisca**

Run: `node test-account-gdpr.js`
Expected: FAIL sul nuovo controllo — `rimaste 1 righe`. Gli altri controlli restano verdi.

- [ ] **Step 4: Scrivi `supabase/sql/22_delete_account_push.sql`**

Intestazione del file:

```sql
-- 22_delete_account_push.sql
--
-- `delete_my_account` non conosceva `push_subscriptions` (creata da 19). Senza questa riga,
-- chi cancella l'account continua a ricevere notifiche di rituali su un telefono che non ha
-- piu' un account: l'abbonamento sopravvive al suo proprietario.
--
-- `ritual_notifications_sent` segue in cascata (FK ON DELETE CASCADE), quindi non serve
-- toccarla.
--
-- Il corpo che segue e' quello di 17_fix_delete_account.sql, COPIATO, piu' la sola riga
-- nuova. Non e' stato riscritto a memoria: e' una funzione SECURITY DEFINER che tocca una
-- dozzina di tabelle e una svista qui non cancella dati che andavano cancellati.
```

Poi il `CREATE OR REPLACE FUNCTION public.delete_my_account(...)` copiato da 17, con questa riga aggiunta nel blocco che usa `v_sid`, accanto a `DELETE FROM online_users WHERE id = v_sid;`:

```sql
    DELETE FROM push_subscriptions WHERE session_id = v_sid;
```

- [ ] **Step 5: Applica e verifica che il test passi**

Run: `node scripts/apply-sql.js supabase/sql/22_delete_account_push.sql && node test-account-gdpr.js`
Expected: tutti i controlli verdi, incluso quello nuovo.

- [ ] **Step 6: Commit**

```bash
git add supabase/sql/22_delete_account_push.sql test-account-gdpr.js
git commit -m "fix(gdpr): elimina account cancella anche gli abbonamenti push"
```

---

### Task 4: Le funzioni pure del service worker

Il service worker non è testabile facilmente dall'esterno. La parte che merita test — decidere titolo, testo e destinazione di una notifica — si estrae in un file caricabile sia da `sw.js` (con `importScripts`) sia da node.

**Files:**
- Create: `push-helpers.js`
- Test: `test-push-helpers.js`

**Interfaces:**
- Consumes: niente.
- Produces: `costruisciNotifica(payload)` → `{ titolo, corpo, tag, url }`, dove `payload` è `{ tipo: 'reminder'|'start', rituale: string, ritualeId: number, locale: 'it'|'en' }`.

- [ ] **Step 1: Scrivi il test che fallisce**

```js
// test-push-helpers.js
const { costruisciNotifica } = require('./push-helpers.js');

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const uguale = (n, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok(n) : ko(n, `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`));

// Promemoria in italiano: nessun numero di minuti, perche' chi si iscrive a T-5 e' ancora
// dentro la soglia del promemoria e "tra 15 minuti" sarebbe falso.
const p = costruisciNotifica({ tipo: 'reminder', rituale: 'Luna piena', ritualeId: 42, locale: 'it' });
uguale('promemoria it: titolo', p.titolo, 'Luna piena sta per iniziare');
if (/\d+\s*minut/i.test(p.titolo + p.corpo)) ko('promemoria senza numero di minuti', p.titolo + ' / ' + p.corpo);
else ok('promemoria senza numero di minuti');
uguale('promemoria: destinazione', p.url, 'app.html?ritual=42');

const a = costruisciNotifica({ tipo: 'start', rituale: 'Luna piena', ritualeId: 42, locale: 'it' });
uguale('avvio it: titolo', a.titolo, 'Luna piena sta iniziando ora');

const e = costruisciNotifica({ tipo: 'start', rituale: 'Full moon', ritualeId: 7, locale: 'en' });
uguale('avvio en: titolo', e.titolo, 'Full moon is starting now');

// Il tag distingue i due tipi: altrimenti l'avvio sostituirebbe il promemoria nel centro
// notifiche invece di affiancarlo.
if (p.tag !== a.tag) ok('promemoria e avvio hanno tag diversi');
else ko('promemoria e avvio hanno tag diversi', p.tag);

// Lingua sconosciuta: si ripiega su inglese invece di rompersi.
const x = costruisciNotifica({ tipo: 'start', rituale: 'X', ritualeId: 1, locale: 'de' });
uguale('lingua sconosciuta ripiega su en', x.titolo, 'X is starting now');

// Nome ostile: non deve poter iniettare nulla, viene usato come testo e basta.
const h = costruisciNotifica({ tipo: 'start', rituale: '<img src=x onerror=alert(1)>', ritualeId: 1, locale: 'it' });
if (h.titolo.includes('<img src=x onerror=alert(1)>')) ok('il nome resta testo, non viene interpretato');
else ko('il nome resta testo', h.titolo);

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `node test-push-helpers.js`
Expected: FAIL — `Cannot find module './push-helpers.js'`

- [ ] **Step 3: Scrivi `push-helpers.js`**

```js
/**
 * push-helpers.js — funzioni pure delle notifiche push.
 *
 * Vive fuori da sw.js per un motivo solo: dentro un service worker non si testa niente, e
 * questa e' la parte che decide cosa legge la persona sul telefono. Caricato da sw.js con
 * importScripts() e da node con require().
 */
(function (globale) {
  'use strict';

  var TESTI = {
    it: {
      reminder: function (n) { return { titolo: n + ' sta per iniziare', corpo: 'Preparati: il rituale sta per cominciare.' }; },
      start:    function (n) { return { titolo: n + ' sta iniziando ora', corpo: 'Il rituale è iniziato. Unisciti adesso.' }; }
    },
    en: {
      reminder: function (n) { return { titolo: n + ' is about to begin', corpo: 'Get ready: the ritual is about to start.' }; },
      start:    function (n) { return { titolo: n + ' is starting now', corpo: 'The ritual has begun. Join now.' }; }
    }
  };

  /**
   * @param {{tipo:'reminder'|'start', rituale:string, ritualeId:number, locale:string}} payload
   * @returns {{titolo:string, corpo:string, tag:string, url:string}}
   */
  function costruisciNotifica(payload) {
    var lingua = TESTI[payload && payload.locale] ? payload.locale : 'en';
    var tipo = payload && payload.tipo === 'reminder' ? 'reminder' : 'start';
    var nome = payload && typeof payload.rituale === 'string' ? payload.rituale : '';
    var id = payload && payload.ritualeId;

    var t = TESTI[lingua][tipo](nome);
    return {
      titolo: t.titolo,
      corpo: t.corpo,
      // tag diverso per tipo: il centro notifiche sostituisce le notifiche con lo stesso tag,
      // e l'avvio non deve cancellare il promemoria.
      tag: 'rituale-' + id + '-' + tipo,
      url: 'app.html?ritual=' + id
    };
  }

  var api = { costruisciNotifica: costruisciNotifica };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.PushHelpers = api;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `node test-push-helpers.js`
Expected: `8 passati, 0 falliti`

- [ ] **Step 5: Commit**

```bash
git add push-helpers.js test-push-helpers.js
git commit -m "feat(push): funzioni pure per costruire le notifiche"
```

---

### Task 5: Il service worker riceve e apre le notifiche

**Files:**
- Modify: `sw.js` (bump `CACHE`, aggiungi `push-helpers.js` a `PRECACHE`, tre nuovi listener)
- Modify: `test-pwa.js` (controllo che il SW dichiari i tre handler)

**Interfaces:**
- Consumes: `PushHelpers.costruisciNotifica` da Task 4; `register_push_subscription` da Task 2.
- Produces: il service worker mostra le notifiche e gestisce il click.

- [ ] **Step 1: Aggiungi il controllo a `test-pwa.js`**

```js
// --- push: il service worker deve dichiarare i tre handler ---
const swTesto = fs.readFileSync('sw.js', 'utf8');
for (const evento of ['push', 'notificationclick', 'pushsubscriptionchange']) {
  swTesto.includes(`addEventListener('${evento}'`)
    ? ok(`sw.js gestisce l'evento ${evento}`)
    : ko(`sw.js gestisce l'evento ${evento}`, 'handler assente');
}
swTesto.includes("importScripts('push-helpers.js')")
  ? ok('sw.js carica push-helpers.js')
  : ko('sw.js carica push-helpers.js', 'importScripts assente');
swTesto.includes("'push-helpers.js'") && swTesto.match(/PRECACHE\s*=\s*\[[\s\S]*?push-helpers\.js/)
  ? ok('push-helpers.js è nel precache')
  : ko('push-helpers.js è nel precache', 'manca dal PRECACHE: offline il SW non partirebbe');
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `node test-pwa.js`
Expected: FAIL sui quattro nuovi controlli, gli altri 20 verdi.

- [ ] **Step 3: Modifica `sw.js`**

In cima, dopo il commento di intestazione:

```js
importScripts('push-helpers.js');
```

Bump della versione cache (obbligatorio: senza, i browser tengono il vecchio SW senza handler push):

```js
const CACHE = 'ga-pwa-v7';
```

Aggiungere `'push-helpers.js'` all'array `PRECACHE`, subito dopo `'app.js'`.

In fondo al file, i tre listener:

```js
// --- Notifiche push ---------------------------------------------------------
// Il payload arriva cifrato dalla Edge Function; il browser lo decifra e ce lo consegna qui.
// `userVisibleOnly: true` in fase di iscrizione ci obbliga a mostrare SEMPRE una notifica:
// se questo handler non ne mostra nessuna, il browser ne mostra una generica di sistema e,
// se succede spesso, ci toglie il permesso.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let payload = {};
    try { payload = e.data ? e.data.json() : {}; } catch { payload = {}; }

    const n = self.PushHelpers.costruisciNotifica(payload);
    await self.registration.showNotification(n.titolo, {
      body: n.corpo,
      tag: n.tag,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: n.url }
    });
  })());
});

// Toccando la notifica: se una finestra dell'app e' gia' aperta la si mette a fuoco e la si
// porta sul rituale, invece di aprirne una seconda. Aprire una nuova finestra ogni volta
// lascerebbe la persona con cinque copie dell'app aperte.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destinazione = (e.notification.data && e.notification.data.url) || 'app.html';

  e.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of finestre) {
      if (f.url.includes('app.html')) {
        await f.focus();
        if ('navigate' in f) { try { await f.navigate(destinazione); } catch { /* alcune versioni lo vietano */ } }
        return;
      }
    }
    await self.clients.openWindow(destinazione);
  })());
});

// Il browser puo' cambiare da solo l'indirizzo dell'abbonamento. Senza questo handler la
// persona smette di ricevere notifiche e non se ne accorge nessuno, noi compresi.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const vecchia = e.oldSubscription;
    const nuova = e.newSubscription || await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: (e.oldSubscription && e.oldSubscription.options && e.oldSubscription.options.applicationServerKey) || undefined
    });
    if (!nuova) return;

    const dati = await caches.open('ga-push-config').then((c) => c.match('config'))
      .then((r) => (r ? r.json() : null))
      .catch(() => null);
    if (!dati) return; // senza URL e chiave non possiamo registrare: si riprende al prossimo avvio dell'app

    const json = nuova.toJSON();
    await fetch(`${dati.url}/rest/v1/rpc/register_push_subscription`, {
      method: 'POST',
      headers: { 'apikey': dati.key, 'Authorization': 'Bearer ' + dati.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_session_id: dati.sessionId,
        p_endpoint: nuova.endpoint,
        p_p256dh: json.keys.p256dh,
        p_auth: json.keys.auth,
        p_locale: dati.locale
      })
    }).catch(() => {});

    if (vecchia && vecchia.endpoint && vecchia.endpoint !== nuova.endpoint) {
      await fetch(`${dati.url}/rest/v1/rpc/delete_push_subscription`, {
        method: 'POST',
        headers: { 'apikey': dati.key, 'Authorization': 'Bearer ' + dati.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_endpoint: vecchia.endpoint })
      }).catch(() => {});
    }
  })());
});
```

- [ ] **Step 4: Lancia i test e verifica che passino**

Run: `node test-pwa.js && node test-push-helpers.js`
Expected: tutti verdi (24 controlli in `test-pwa.js`).

- [ ] **Step 5: Commit**

```bash
git add sw.js test-pwa.js
git commit -m "feat(push): il service worker riceve, mostra e apre le notifiche"
```

---

### Task 6: Il flusso nell'app — permesso, iscrizione, interruttore

Il pezzo che decide se questo progetto funziona: il permesso si chiede una volta sola nella vita, e un «no» al browser è quasi definitivo.

**Files:**
- Modify: `src/app.jsx` (funzione `joinRitual` intorno alla riga 3057; pannello impostazioni/profilo)
- Modify: `app.js` (rigenerato con `node build.js`)
- Test: `test-push-ui.js`

**Interfaces:**
- Consumes: `VAPID_PUBLIC_KEY` (Task 1), `register_push_subscription` / `delete_push_subscription` (Task 2).
- Produces: `chiediPermessoPush(sessionId, locale)` → `Promise<boolean>`; `spegniPush()` → `Promise<void>`; chiavi `localStorage`: `ga_push_rifiutato_il` (timestamp ISO), `ga_push_spento` (`'1'`).

- [ ] **Step 1: Scrivi il test che fallisce**

```js
// test-push-ui.js
/**
 * Test del flusso permesso/iscrizione push nell'app.
 *
 * Chromium headless non ha un vero servizio push: `pushManager.subscribe` fallirebbe sempre.
 * Quindi lo si sostituisce con un finto tramite addInitScript, e si verifica CHI lo chiama e
 * QUANDO — che e' esattamente il comportamento che ci interessa proteggere.
 *
 * Esecuzione: node test-push-ui.js
 * Prerequisiti: server su http://localhost:4321, migration 19 e 21 applicate.
 */
const { chromium } = require('playwright');

const APP_URL = 'http://localhost:4321/app.html';
const TIMEOUT = 20000;

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };

// Sostituisce subscribe e requestPermission con dei finti che registrano le chiamate.
const FINTO = `
  window.__push = { subscribeChiamato: 0, permessoChiesto: 0 };
  Object.defineProperty(Notification, 'permission', { get: () => window.__permesso || 'default', configurable: true });
  Notification.requestPermission = async () => { window.__push.permessoChiesto++; window.__permesso = window.__rispostaPermesso || 'granted'; return window.__permesso; };
  navigator.serviceWorker.ready.then((reg) => {
    reg.pushManager.subscribe = async () => {
      window.__push.subscribeChiamato++;
      return { endpoint: 'https://fcm.googleapis.com/fcm/send/finto_' + Date.now(),
               toJSON: () => ({ keys: { p256dh: 'p_finta', auth: 'a_finta' } }),
               unsubscribe: async () => true };
    };
    reg.pushManager.getSubscription = async () => null;
  });
`;

async function nuovaPagina(browser) {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:4321' });
  const page = await ctx.newPage();
  await page.addInitScript(FINTO);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();

  // 1. Al «Partecipa» compare la NOSTRA domanda, e il popup del browser NON e' ancora partito.
  {
    const { ctx, page } = await nuovaPagina(browser);
    await page.evaluate(() => { window.__entraComeOspite && window.__entraComeOspite(); });
    await page.waitForTimeout(500);
    const bottoneJoin = page.locator('[data-test="join-ritual"]').first();
    if (await bottoneJoin.count() === 0) {
      ko('esiste un rituale su cui fare Partecipa', 'nessun bottone [data-test=join-ritual]: creane uno nel setup');
    } else {
      await bottoneJoin.click();
      await page.waitForTimeout(500);
      const nostraDomanda = await page.locator('[data-test="push-chiedi"]').count();
      nostraDomanda === 1 ? ok('al Partecipa compare la nostra domanda') : ko('al Partecipa compare la nostra domanda', `trovati ${nostraDomanda} elementi`);
      const stato = await page.evaluate(() => window.__push);
      stato.permessoChiesto === 0 ? ok('il popup del browser non e\\' ancora partito') : ko('il popup del browser non e\\' ancora partito', `chiesto ${stato.permessoChiesto} volte`);

      // 2. Su «No», il popup del browser NON si apre. E' il test piu' importante del progetto.
      await page.locator('[data-test="push-no"]').click();
      await page.waitForTimeout(500);
      const dopoNo = await page.evaluate(() => window.__push);
      dopoNo.permessoChiesto === 0 ? ok('su NO il popup del browser non si apre') : ko('su NO il popup del browser non si apre', `chiesto ${dopoNo.permessoChiesto} volte`);
      dopoNo.subscribeChiamato === 0 ? ok('su NO non ci si iscrive') : ko('su NO non ci si iscrive', 'subscribe chiamato');
      const segno = await page.evaluate(() => localStorage.getItem('ga_push_rifiutato_il'));
      segno ? ok('il no viene ricordato per non ri-chiedere subito') : ko('il no viene ricordato', 'ga_push_rifiutato_il assente');
    }
    await ctx.close();
  }

  // 3. Su «Si», parte il popup e poi l'iscrizione.
  {
    const { ctx, page } = await nuovaPagina(browser);
    await page.evaluate(() => { window.__entraComeOspite && window.__entraComeOspite(); });
    await page.waitForTimeout(500);
    const bottoneJoin = page.locator('[data-test="join-ritual"]').first();
    if (await bottoneJoin.count() > 0) {
      await bottoneJoin.click();
      await page.waitForTimeout(500);
      await page.locator('[data-test="push-si"]').click();
      await page.waitForTimeout(1000);
      const stato = await page.evaluate(() => window.__push);
      stato.permessoChiesto === 1 ? ok('su SI il popup del browser si apre') : ko('su SI il popup del browser si apre', `chiesto ${stato.permessoChiesto} volte`);
      stato.subscribeChiamato === 1 ? ok('su SI ci si iscrive') : ko('su SI ci si iscrive', `subscribe chiamato ${stato.subscribeChiamato} volte`);
    }
    await ctx.close();
  }

  // 4. Spento l'interruttore, un nuovo Partecipa NON ri-iscrive di nascosto.
  {
    const { ctx, page } = await nuovaPagina(browser);
    await page.evaluate(() => {
      window.__permesso = 'granted';
      localStorage.setItem('ga_push_spento', '1');
      window.__entraComeOspite && window.__entraComeOspite();
    });
    await page.waitForTimeout(500);
    const bottoneJoin = page.locator('[data-test="join-ritual"]').first();
    if (await bottoneJoin.count() > 0) {
      await bottoneJoin.click();
      await page.waitForTimeout(1000);
      const stato = await page.evaluate(() => window.__push);
      stato.subscribeChiamato === 0 ? ok('spegnimento esplicito rispettato') : ko('spegnimento esplicito rispettato', 'ri-iscritto di nascosto');
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${passati} passati, ${falliti} falliti`);
  process.exit(falliti === 0 ? 0 : 1);
})();
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `node test-push-ui.js` (con il server su `localhost:4321`)
Expected: FAIL — non esistono `[data-test="push-chiedi"]`, `push-si`, `push-no`.

- [ ] **Step 3: Aggiungi le traduzioni in `src/app.jsx`**

Nei due blocchi di traduzioni (`en` intorno alla riga 252, `it` intorno alla 582), dentro la sezione dei rituali:

```js
// en
pushChiedi: 'Want me to notify you when it starts?',
pushSi: 'Yes, notify me',
pushNo: 'Not now',
pushImpostazioni: 'Notify me when a ritual starts',
pushNegato: 'Notifications are blocked for this site. To turn them back on, allow them in your browser settings.',
pushIosInstalla: 'To receive notifications, add the app to your Home Screen first.',

// it
pushChiedi: 'Vuoi che ti avvisi quando inizia?',
pushSi: 'Sì, avvisami',
pushNo: 'Non ora',
pushImpostazioni: 'Avvisami quando inizia un rituale',
pushNegato: 'Le notifiche sono bloccate per questo sito. Per riattivarle, consentile nelle impostazioni del browser.',
pushIosInstalla: 'Per ricevere le notifiche, aggiungi prima l\\'app alla schermata Home.',
```

- [ ] **Step 4: Aggiungi le funzioni push in `src/app.jsx`**

Subito prima di `joinRitual`:

```js
          // --- Notifiche push -------------------------------------------------------
          // Il permesso del browser si chiede UNA VOLTA SOLA nella vita: se la persona dice no,
          // il popup non ricompare mai piu' e per tornare indietro deve andare a mano nelle
          // impostazioni di sistema. Per questo prima chiediamo NOI, dentro l'app, e apriamo il
          // popup vero solo su un si'. Un rifiuto cosi' resta nostro e ri-proponibile.
          const [chiediPush, setChiediPush] = React.useState(false);
          const [mostraInstallaPerPush, setMostraInstallaPerPush] = React.useState(false);

          const pushDisponibile = () =>
            typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

          const b64UrlToUint8 = (b64) => {
            const pad = '='.repeat((4 - (b64.length % 4)) % 4);
            const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
            const raw = atob(s);
            return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
          };

          // Il service worker, quando il browser gli cambia l'indirizzo sotto i piedi, non ha
          // accesso a localStorage. Gli lasciamo qui quello che gli serve per ri-registrarsi.
          const salvaConfigPush = async () => {
            try {
              const c = await caches.open('ga-push-config');
              await c.put('config', new Response(JSON.stringify({
                url: SUPABASE_URL, key: SUPABASE_KEY, sessionId, locale: lang === 'it' ? 'it' : 'en'
              }), { headers: { 'Content-Type': 'application/json' } }));
            } catch { /* cache non disponibile: si riprova al prossimo avvio */ }
          };

          const iscriviPush = async () => {
            const reg = await navigator.serviceWorker.ready;
            const esistente = await reg.pushManager.getSubscription();
            const sub = esistente || await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: b64UrlToUint8(VAPID_PUBLIC_KEY)
            });
            const j = sub.toJSON();
            await supabase.rpc('register_push_subscription', {
              p_session_id: sessionId,
              p_endpoint: sub.endpoint,
              p_p256dh: j.keys.p256dh,
              p_auth: j.keys.auth,
              p_locale: lang === 'it' ? 'it' : 'en'
            });
            await salvaConfigPush();
            localStorage.removeItem('ga_push_spento');
            localStorage.removeItem('ga_push_rifiutato_il');
          };

          const spegniPush = async () => {
            localStorage.setItem('ga_push_spento', '1');
            try {
              const reg = await navigator.serviceWorker.ready;
              const sub = await reg.pushManager.getSubscription();
              if (sub) {
                await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
                await sub.unsubscribe();
              }
            } catch { /* se il browser l'ha gia' buttata via, il segno in localStorage basta */ }
          };

          // Decide se e cosa chiedere al momento del «Partecipa». Non apre MAI il popup del
          // browser da sola: quello parte solo dalla risposta affermativa alla nostra domanda.
          const valutaPush = async () => {
            if (!pushDisponibile()) {
              // Su iPhone in Safari non installato l'oggetto Notification non esiste: non
              // possiamo nemmeno CHIEDERE. Invece di tacere, si spiega che per ricevere gli
              // avvisi l'app va prima aggiunta alla schermata Home — senza quel passo, le
              // notifiche su iOS semplicemente non esistono.
              const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
              const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
              if (iOS && !installata) setMostraInstallaPerPush(true);
              return;
            }
            if (localStorage.getItem('ga_push_spento') === '1') return;  // scelta esplicita, si rispetta
            if (Notification.permission === 'denied') return;     // gia' bruciato: non si insiste

            if (Notification.permission === 'granted') {
              try { await iscriviPush(); } catch { /* si riprovera' */ }
              return;
            }

            const rifiutatoIl = localStorage.getItem('ga_push_rifiutato_il');
            if (rifiutatoIl && Date.now() - Date.parse(rifiutatoIl) < 7 * 24 * 60 * 60 * 1000) return;

            setChiediPush(true);
          };

          const rispondiPush = async (si) => {
            setChiediPush(false);
            if (!si) { localStorage.setItem('ga_push_rifiutato_il', new Date().toISOString()); return; }
            const esito = await Notification.requestPermission();
            if (esito !== 'granted') return;
            try { await iscriviPush(); } catch { /* si riprovera' al prossimo Partecipa */ }
          };
```

Poi, in fondo a `joinRitual`, dopo l'inserimento della notifica al creatore:

```js
            await valutaPush();
```

- [ ] **Step 5: Aggiungi la domanda e l'interruttore all'interfaccia**

La domanda, come pannello richiudibile sopra la lista dei rituali (accanto al banner di installazione già esistente):

```jsx
                {chiediPush && (
                  <div data-test="push-chiedi" className="bg-purple-900/40 border border-purple-500/40 rounded-xl p-4 mb-4">
                    <p className="text-white text-sm mb-3">{t.rituals.pushChiedi}</p>
                    <div className="flex gap-2">
                      <button data-test="push-si" onClick={() => rispondiPush(true)}
                        className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm">{t.rituals.pushSi}</button>
                      <button data-test="push-no" onClick={() => rispondiPush(false)}
                        className="px-4 py-2 rounded-lg bg-white/10 text-white/70 text-sm">{t.rituals.pushNo}</button>
                    </div>
                  </div>
                )}
```

Il messaggio per iPhone non installato, che riusa il testo `pushIosInstalla`:

```jsx
                {mostraInstallaPerPush && (
                  <div data-test="push-installa-ios" className="bg-purple-900/40 border border-purple-500/40 rounded-xl p-4 mb-4">
                    <p className="text-white text-sm">{t.rituals.pushIosInstalla}</p>
                    <button onClick={() => setMostraInstallaPerPush(false)}
                      className="mt-2 text-white/60 text-xs underline">OK</button>
                  </div>
                )}
```

L'interruttore, nel pannello impostazioni/profilo accanto alle altre preferenze:

```jsx
                <label className="flex items-center justify-between py-2">
                  <span className="text-white/80 text-sm">{t.rituals.pushImpostazioni}</span>
                  <input data-test="push-interruttore" type="checkbox"
                    checked={localStorage.getItem('ga_push_spento') !== '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'}
                    onChange={(e) => (e.target.checked ? rispondiPush(true) : spegniPush())} />
                </label>
```

Il bottone «Partecipa» deve avere `data-test="join-ritual"` se non ce l'ha già.

- [ ] **Step 6: Ricostruisci, riallinea la CSP, lancia i test**

Run: `node build.js && node scripts/csp-hashes.js --check && node test-push-ui.js`
Expected: tutti i controlli verdi.

- [ ] **Step 7: Regressione sui rituali**

Run: `node test-rituali.js && node test-orari-rituali.js && node test-pwa.js`
Expected: rituali 18/18, orari verdi, PWA 24/24.

- [ ] **Step 8: Commit**

```bash
git add src/app.jsx app.js test-push-ui.js
git commit -m "feat(push): domanda in-app prima del permesso, iscrizione e interruttore"
```

---

### Task 7: La logica delle finestre, in un modulo puro

Il cuore del motore, isolato perché sia testabile senza toccare né database né rete.

**Files:**
- Create: `supabase/functions/notify-ritual-start/finestre.js`
- Test: `test-push-finestre.js`

**Interfaces:**
- Consumes: niente.
- Produces: `classifica(adesso, inizioIso)` → `'reminder' | 'start' | null`, dove entrambi gli argomenti sono millisecondi/stringa ISO UTC.

- [ ] **Step 1: Scrivi il test che fallisce**

```js
// test-push-finestre.js
const { classifica, istanteInizio } = require('./supabase/functions/notify-ritual-start/finestre.js');

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const atteso = (n, a, b) => (a === b ? ok(n) : ko(n, `atteso ${b}, ottenuto ${a}`));

const INIZIO = Date.parse('2026-09-21T21:00:00Z');
const min = (m) => INIZIO + m * 60000;

atteso('T-16 → niente',        classifica(min(-16), INIZIO), null);
atteso('T-15 → promemoria',    classifica(min(-15), INIZIO), 'reminder');
atteso('T-1  → promemoria',    classifica(min(-1),  INIZIO), 'reminder');
atteso('T    → avvio',         classifica(INIZIO,   INIZIO), 'start');
atteso('T+4  → avvio',         classifica(min(4),   INIZIO), 'start');
atteso('T+6  → niente',        classifica(min(6),   INIZIO), null);

// Il database tiene data e ora come TESTO in UTC: la lettura deve essere esplicitamente UTC,
// altrimenti il server interpreta nel proprio fuso e i rituali suonano all'ora sbagliata.
atteso('data+ora lette come UTC', istanteInizio('2026-09-21', '21:00'), INIZIO);
atteso('ora con i secondi',       istanteInizio('2026-09-21', '21:00:00'), INIZIO);
atteso('data malformata → NaN',   Number.isNaN(istanteInizio('non-una-data', '21:00')), true);

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `node test-push-finestre.js`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Scrivi `supabase/functions/notify-ritual-start/finestre.js`**

```js
/**
 * finestre.js — decide se un rituale merita una notifica adesso, e quale.
 *
 * Vive in un file suo, in JavaScript semplice, perche' e' l'unica parte del motore che si puo'
 * provare senza database ne' rete: Deno lo importa dalla Edge Function, node lo richiede dai test.
 *
 * SOGLIE, non intervalli stretti. Se un'esecuzione del cron salta, quella dopo recupera invece
 * di perdere la notifica. E' la tabella ritual_notifications_sent (PK composta) a rendere
 * sicura una soglia larga: la seconda occasione non produce un doppione.
 */

const QUINDICI_MINUTI = 15 * 60000;
const CINQUE_MINUTI = 5 * 60000;

/**
 * @param {number} adesso  millisecondi
 * @param {number} inizio  millisecondi
 * @returns {'reminder'|'start'|null}
 */
function classifica(adesso, inizio) {
  if (!Number.isFinite(adesso) || !Number.isFinite(inizio)) return null;
  if (adesso >= inizio && adesso < inizio + CINQUE_MINUTI) return 'start';
  if (adesso >= inizio - QUINDICI_MINUTI && adesso < inizio) return 'reminder';
  return null;
}

/**
 * Il database tiene `date` e `time` come TESTO, in UTC (vedi PR #4 del 18/09: la conversione
 * di fuso e' sul contorno, il database resta UTC). La `Z` finale non e' decorativa: senza,
 * Deno interpreta la stringa nel fuso del server e i rituali suonano all'ora sbagliata.
 *
 * @returns {number} millisecondi, oppure NaN se la data non e' leggibile
 */
function istanteInizio(data, ora) {
  const oraPiena = /^\d{2}:\d{2}$/.test(ora) ? ora + ':00' : ora;
  return Date.parse(`${data}T${oraPiena}Z`);
}

const api = { classifica, istanteInizio };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
export { classifica, istanteInizio };
```

> Nota per chi implementa: il doppio export (CommonJS + ESM) serve perché lo stesso file è letto da node (test) e da Deno (Edge Function). Se node protesta sull'`export`, rinominare il test in `.cjs` **non** risolve — in quel caso separare in `finestre.js` (logica, CommonJS) e `finestre.mjs` (`export * from './finestre.js'`) e importare quest'ultimo da Deno.

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `node test-push-finestre.js`
Expected: `9 passati, 0 falliti`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notify-ritual-start/finestre.js test-push-finestre.js
git commit -m "feat(push): logica delle finestre di notifica, isolata e testata"
```

---

### Task 8: La Edge Function che manda le notifiche

**Files:**
- Create: `supabase/functions/notify-ritual-start/index.ts`
- Delete: `supabase/functions/notify-ritual-participants/` (intera cartella)

**Interfaces:**
- Consumes: `classifica`, `istanteInizio` (Task 7); tabelle di migration 19.
- Produces: un endpoint `POST /functions/v1/notify-ritual-start` che risponde `{"inviate": N, "errori": M}`.

- [ ] **Step 1: Cancella la funzione morta**

```bash
git rm -r supabase/functions/notify-ritual-participants
```

Motivo, da mettere nel messaggio di commit: interroga una tabella cancellata da `08_drop_dead_tables.sql`, manda email invece che push, e usa un solo flag `notified` che con due tipi di notifica non può funzionare. Non è una base, è un residuo.

- [ ] **Step 2: Scrivi `supabase/functions/notify-ritual-start/index.ts`**

```ts
/**
 * notify-ritual-start — manda le notifiche push di promemoria e avvio dei rituali.
 *
 * Svegliata ogni minuto dal cron pg_cron (vedi 23_cron_push.sql).
 *
 * L'ordine delle operazioni non e' negoziabile: si REGISTRA l'invio PRIMA di spedirlo,
 * sfruttando la chiave primaria composta (rituale, telefono, tipo). Se l'INSERT va in
 * conflitto, un'altra esecuzione ha gia' preso quella notifica e si salta. Cosi' un doppio
 * invio e' impossibile per costruzione.
 *
 * Il rischio qui e' asimmetrico: perdere una notifica e' spiacevole, bombardare qualcuno di
 * sessanta notifiche uguali gli fa spegnere le push per sempre — e il permesso non torna.
 * Nel dubbio si perde la notifica.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';
import { classifica, istanteInizio } from './finestre.js';

const TESTI: Record<string, Record<string, (n: string) => { titolo: string; corpo: string }>> = {
  it: {
    reminder: (n) => ({ titolo: `${n} sta per iniziare`, corpo: 'Preparati: il rituale sta per cominciare.' }),
    start:    (n) => ({ titolo: `${n} sta iniziando ora`, corpo: 'Il rituale è iniziato. Unisciti adesso.' })
  },
  en: {
    reminder: (n) => ({ titolo: `${n} is about to begin`, corpo: 'Get ready: the ritual is about to start.' }),
    start:    (n) => ({ titolo: `${n} is starting now`, corpo: 'The ritual has begun. Join now.' })
  }
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  );

  const adesso = Date.now();

  // Si guardano solo i rituali della finestra di ieri/oggi/domani: senza filtro, fra un anno
  // questa query leggerebbe l'intera tabella ogni minuto.
  const giorno = 86400000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const { data: rituali } = await supabase
    .from('rituals')
    .select('id, name, date, time, participants')
    .gte('date', iso(adesso - giorno))
    .lte('date', iso(adesso + giorno));

  if (!rituali || rituali.length === 0) {
    return Response.json({ inviate: 0, errori: 0 });
  }

  let inviate = 0;
  let errori = 0;

  for (const rituale of rituali) {
    const inizio = istanteInizio(rituale.date, rituale.time);
    const tipo = classifica(adesso, inizio);
    if (!tipo) continue;

    const partecipanti: string[] = Array.isArray(rituale.participants) ? rituale.participants : [];
    if (partecipanti.length === 0) continue;

    // Chi partecipa si legge ADESSO, non al momento dell'iscrizione: chi ha lasciato il
    // rituale non riceve niente, senza codice dedicato.
    const { data: abbonamenti } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, locale, failure_count')
      .in('session_id', partecipanti);

    if (!abbonamenti || abbonamenti.length === 0) continue;

    for (const ab of abbonamenti) {
      // 1. Prenotazione: se qualcun altro ha gia' preso questa notifica, l'INSERT va in
      //    conflitto e si passa oltre senza spedire nulla.
      const { error: erroreDedup } = await supabase
        .from('ritual_notifications_sent')
        .insert({ ritual_id: rituale.id, subscription_id: ab.id, kind: tipo });

      if (erroreDedup) continue; // gia' inviata (conflitto sulla PK) — comportamento voluto

      // 2. Invio.
      const lingua = TESTI[ab.locale] ? ab.locale : 'en';
      const t = TESTI[lingua][tipo](rituale.name);

      try {
        await webpush.sendNotification(
          { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
          JSON.stringify({ tipo, rituale: rituale.name, ritualeId: rituale.id, locale: lingua }),
          { TTL: tipo === 'start' ? 300 : 900 }
        );
        inviate++;
        await supabase.from('push_subscriptions')
          .update({ failure_count: 0, last_seen_at: new Date().toISOString() })
          .eq('id', ab.id);
      } catch (e) {
        errori++;
        const stato = (e as { statusCode?: number }).statusCode;

        if (stato === 404 || stato === 410) {
          // Abbonamento morto: telefono pulito, app disinstallata, browser che ha dimenticato.
          // Si cancella; la riga di dedup sparisce in cascata.
          await supabase.from('push_subscriptions').delete().eq('id', ab.id);
        } else {
          // Guasto temporaneo: si libera la prenotazione, cosi' il giro dopo riprova. La soglia
          // larga della finestra fa il resto.
          await supabase.from('ritual_notifications_sent')
            .delete()
            .eq('ritual_id', rituale.id).eq('subscription_id', ab.id).eq('kind', tipo);

          const nuovoConteggio = (ab as { failure_count?: number }).failure_count ?? 0;
          if (nuovoConteggio + 1 >= 10) {
            await supabase.from('push_subscriptions').delete().eq('id', ab.id);
          } else {
            await supabase.from('push_subscriptions')
              .update({ failure_count: nuovoConteggio + 1 })
              .eq('id', ab.id);
          }
        }
      }
    }
  }

  return Response.json({ inviate, errori });
});
```

- [ ] **Step 3: Carica i segreti e pubblica la funzione**

```bash
supabase secrets set VAPID_PUBLIC_KEY=<pubblica> VAPID_PRIVATE_KEY=<privata> VAPID_SUBJECT=mailto:global.awakening.app@gmail.com
supabase functions deploy notify-ritual-start
```

La privata è quella generata al Task 1 e **non sta in nessun file del repo**.

- [ ] **Step 4: Prova dal vivo**

1. Aprire l'app in Chrome, entrare, toccare «Partecipa» su un rituale, rispondere «Sì».
2. Creare un rituale che inizia **fra 14 minuti** (deve cadere nella finestra del promemoria).
3. Invocare la funzione a mano e leggere la risposta.
4. Verificare che la notifica arrivi e che toccandola si apra il rituale.
5. Invocare la funzione una seconda volta: `inviate` deve essere **0** (dedup).

Expected: prima chiamata `{"inviate":1,"errori":0}`, seconda `{"inviate":0,"errori":0}`, una sola notifica ricevuta.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notify-ritual-start/index.ts
git commit -m "feat(push): motore di invio, con prenotazione prima dell'invio"
```

---

### Task 9: `pg_net`, il cron al minuto e l'allarme sui fallimenti

**Files:**
- Create: `supabase/sql/23_cron_push.sql`
- Test: `test-push-cron.js`

**Interfaces:**
- Consumes: la Edge Function `notify-ritual-start` pubblicata (Task 8).
- Produces: due job `pg_cron` attivi: `notify-ritual-start` (ogni minuto) e `allarme-cron-falliti` (una volta al giorno).

- [ ] **Step 1: Scrivi il test che fallisce**

```js
// test-push-cron.js
/**
 * Verifica lo stato dei job pg_cron. Non li esegue: controlla che esistano, siano attivi e
 * che NON stiano fallendo — il controllo che nel 2026 e' mancato per cinque mesi.
 *
 * Esecuzione: node test-push-cron.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function interroga(sql) {
  const f = path.join(os.tmpdir(), `q_${Date.now()}.sql`);
  fs.writeFileSync(f, sql, 'utf8');
  try {
    const out = execFileSync('node', ['scripts/apply-sql.js', f], { encoding: 'utf8' });
    const m = out.match(/righe restituite: (.*)/);
    return m ? JSON.parse(m[1]) : [];
  } finally { fs.unlinkSync(f); }
}

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };

const job = interroga("select jobname, schedule, active from cron.job order by jobname;");

const motore = job.find((j) => j.jobname === 'notify-ritual-start');
motore ? ok('il job del motore esiste') : ko('il job del motore esiste', 'assente');
motore && motore.schedule === '* * * * *' ? ok('gira ogni minuto') : ko('gira ogni minuto', motore ? motore.schedule : '-');
motore && motore.active ? ok('il job del motore e\\' attivo') : ko('il job del motore e\\' attivo', 'spento');

const allarme = job.find((j) => j.jobname === 'allarme-cron-falliti');
allarme && allarme.active ? ok('l\\'allarme sui fallimenti e\\' attivo') : ko('l\\'allarme sui fallimenti e\\' attivo', 'assente o spento');

const vecchio = job.find((j) => j.jobname === 'notify-ritual-participants');
!vecchio || !vecchio.active ? ok('il vecchio job rotto e\\' spento') : ko('il vecchio job rotto e\\' spento', 'ancora attivo');

// pg_net deve essere davvero installata, non solo disponibile.
const est = interroga("select extname from pg_extension where extname = 'pg_net';");
est.length === 1 ? ok('pg_net e\\' installata') : ko('pg_net e\\' installata', 'assente: il cron non puo\\' chiamare nulla');

// Nessun fallimento nelle ultime 24 ore per il motore.
const falliti24 = interroga(`
  select count(*)::int as n from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where j.jobname = 'notify-ritual-start' and d.status = 'failed' and d.start_time > now() - interval '24 hours';
`);
const n = falliti24[0] ? falliti24[0].n : 0;
n === 0 ? ok('nessun fallimento nelle ultime 24 ore') : ko('nessun fallimento nelle ultime 24 ore', `${n} fallimenti`);

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `node test-push-cron.js`
Expected: FAIL — il job non esiste, `pg_net` non è installata.

- [ ] **Step 3: Metti la chiave di servizio nel Vault**

Il comando del cron è leggibile da chiunque abbia accesso al database: la chiave non ci va in chiaro. Da eseguire **una volta sola**, a mano, con la chiave vera (non finisce nel repo):

```sql
select vault.create_secret('<chiave-di-servizio>', 'chiave_servizio_cron', 'Chiave usata dai job cron per chiamare le Edge Function');
```

- [ ] **Step 4: Scrivi `supabase/sql/23_cron_push.sql`**

```sql
-- 23_cron_push.sql
--
-- Sveglia il motore delle notifiche ogni minuto, e mette una sentinella su se' stesso.
--
-- ATTENZIONE, il motivo per cui questo file esiste: il job precedente e' stato digitato a mano
-- nello Studio ad aprile, conteneva un ritorno a capo di Windows dentro la stringa JSON degli
-- header, ed e' fallito 33.615 volte senza che nessuno se ne accorgesse. Due regole nate da li':
--   1. il comando del cron vive QUI, versionato, e si applica da apply-sql.js;
--   2. questo file NON deve mai contenere un carattere \r. Se lo si modifica su Windows,
--      controllare i terminatori di riga prima di applicarlo.
--
-- Prerequisito eseguito a mano una volta sola (la chiave non sta nel repo):
--   select vault.create_secret('<chiave>', 'chiave_servizio_cron', '...');

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotenza: riapplicare il file non deve creare job doppi.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('notify-ritual-start', 'allarme-cron-falliti');

-- ---------------------------------------------------------------------------
-- 1. Il motore, ogni minuto
-- ---------------------------------------------------------------------------
-- Ogni minuto e non ogni 5: con la finestra a 5 minuti una notifica di "sta iniziando ORA"
-- puo' arrivare con cinque minuti di ritardo, e su un'esperienza che vive dell'essere insieme
-- nello stesso momento e' tanto.
SELECT cron.schedule(
  'notify-ritual-start',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-ritual-start',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'chiave_servizio_cron')
               ),
    body    := '{}'::jsonb
  );
  $job$
);

-- ---------------------------------------------------------------------------
-- 2. La sentinella, una volta al giorno alle 07:00 UTC
-- ---------------------------------------------------------------------------
-- Il difetto che ha reso possibile la storia del cron fantasma non e' il \r: e' che nessuno
-- si accorge quando un cron fallisce. Senza questo pezzo, il prossimo guasto dura altri
-- cinque mesi.
SELECT cron.schedule(
  'allarme-cron-falliti',
  '0 7 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://api.emailjs.com/api/v1.0/email/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'service_id',  'service_rk97p6m',
                 'template_id', 'template_gy8gdkg',
                 'user_id',     'KTIin1Rts7iSkzU96',
                 'accessToken', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'emailjs_private_key'),
                 'template_params', jsonb_build_object(
                   'to_email', 'global.awakening.app@gmail.com',
                   'subject',  'Global Awakening — un cron sta fallendo',
                   'message',  (SELECT string_agg(j.jobname || ': ' || c || ' fallimenti nelle ultime 24h', E'\n')
                                FROM (SELECT jobid, count(*) AS c FROM cron.job_run_details
                                      WHERE status = 'failed' AND start_time > now() - interval '24 hours'
                                      GROUP BY jobid) f
                                JOIN cron.job j ON j.jobid = f.jobid),
                   'magic_url', 'https://supabase.com/dashboard/project/vxzxdkcluyrcftsnxxza',
                   'cta_text',  'Apri il progetto',
                   'footer',    'Controllo automatico giornaliero dei job pg_cron.'
                 )
               )
  )
  WHERE EXISTS (
    SELECT 1 FROM cron.job_run_details
    WHERE status = 'failed' AND start_time > now() - interval '24 hours'
  );
  $job$
);
```

> Prerequisito aggiuntivo: anche `emailjs_private_key` deve stare nel Vault. Se non c'è, aggiungerla con `vault.create_secret` prima di applicare.

- [ ] **Step 5: Applica e verifica**

Run: `node scripts/apply-sql.js supabase/sql/23_cron_push.sql --dry-run`, poi senza, poi `node test-push-cron.js`
Expected: `7 passati, 0 falliti`

- [ ] **Step 6: Aspetta tre minuti e ricontrolla che il cron non stia fallendo**

Run: `node test-push-cron.js`
Expected: ancora `0 fallimenti`. **Se fallisce, fermarsi qui**: un cron che fallisce in silenzio è precisamente il problema che questo lavoro doveva chiudere. Leggere `return_message` in `cron.job_run_details` prima di andare avanti.

- [ ] **Step 7: Commit**

```bash
git add supabase/sql/23_cron_push.sql test-push-cron.js
git commit -m "feat(push): cron al minuto e sentinella sui fallimenti"
```

---

### Task 10: Regressione completa e review indipendente

**Files:** nessuna modifica prevista; i fix che emergono si committano singolarmente.

- [ ] **Step 1: Lancia tutta la batteria**

```bash
node test-push-helpers.js && node test-push-finestre.js && node test-push-rpc.js \
  && node test-push-ui.js && node test-push-cron.js && node test-push-esito.js \
  && node test-rituali.js && node test-orari-rituali.js && node test-musica.js \
  && node test-musica-sblocco.js \
  && node test-rituali-cancellazione.js && node test-rituali-cancellazione-ui.js \
  && node test-pwa.js && node test-auth.js && node test-account-gdpr.js \
  && node test-moderazione.js && node test-moderazione-ui.js
```

Expected: tutto verde. **Nota:** `test-inviti-telepatia.js` ha un rosso **preesistente** a questo lavoro (annotato a settembre). Va lanciato, e il suo esito confrontato con quello prima delle modifiche: deve essere *lo stesso* rosso, non uno nuovo.

- [ ] **Step 2: Review con un agente indipendente**

Dispacciare un sub-agente che non ha scritto questo codice, dandogli il diff completo del ramo e la spec. Criteri su cui deve pronunciarsi, uno per uno:

1. Un doppio invio della stessa notifica è davvero impossibile? (prenotazione prima dell'invio, PK composta)
2. Il popup del permesso del browser può partire da un percorso che non sia una risposta affermativa esplicita?
3. La tabella `push_subscriptions` è leggibile da `anon` per qualche strada, diretta o indiretta?
4. `delete_my_account` cancella davvero tutto, o resta qualcosa attaccato al `session_id`?
5. C'è un `\r` in un file SQL o in una stringa JSON?
6. Gli hash CSP sono allineati con gli script inline?
7. Un errore del servizio push può cancellare un abbonamento vivo per sbaglio?
8. La query dei rituali può degenerare quando la tabella cresce?

- [ ] **Step 3: Chiudere ogni rilievo**

Per ciascun rilievo: o si corregge con un commit dedicato, o si scrive **nella spec** perché non è un problema. Non si chiude un rilievo con un'opinione.

- [ ] **Step 4: Aggiornare la spec con quello che si è imparato**

Se durante l'implementazione una decisione della spec si è rivelata sbagliata, la spec si corregge. Un documento che descrive un progetto che non è stato costruito è peggio di nessun documento.

- [ ] **Step 5: Handoff e messaggio a Irene**

Scrivere `update progetti/coder-handoff/global-awakening-AAAA-MM-GG-HH.md` **e** mandare lo stesso contenuto in chat. Devono comparire: cosa è stato fatto, cosa è stato verificato dal vivo e cosa no, i rilievi della review e come sono stati chiusi, e cosa resta da provare su un telefono vero.

---

## Cosa resta fuori da questo piano

- La prova su iPhone vero. Richiede un telefono con l'app aggiunta alla schermata Home: nessun test automatico la sostituisce, ed è l'unico modo di sapere se le notifiche arrivano davvero su iOS.
- La prova che aprendo il link da Instagram e TikTok compaia «Apri in Safari» (in sospeso dal 18/09).
- Notifiche a chi non ha fatto «Partecipa», notifiche per messaggi e commenti, app nativa iOS. Fuori scope per scelta, §11 della spec.
