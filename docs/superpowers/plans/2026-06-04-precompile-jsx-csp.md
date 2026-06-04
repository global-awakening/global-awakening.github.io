# Precompilazione JSX + CSP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rimuovere la trasformazione Babel a runtime (precompilando il JSX a build-time) e attivare una Content-Security-Policy forte, senza rompere l'app live.

**Architecture:** Il JSX oggi nel blocco `<script type="text/babel">` di `app.html` viene estratto in `src/app.jsx`; uno script `build.js` lo compila in `app.js` (classic script) e calcola gli hash sha256 degli script inline rimasti iniettandoli nel meta CSP di `app.html`. Il service worker viene aggiornato (no Babel, +app.js, cache v2). La rete di sicurezza è la suite E2E esistente, che deve restare verde a ogni milestone.

**Tech Stack:** Node, `@babel/core` + `@babel/preset-react` (dev-deps), Playwright (E2E già presente), Supabase REST (invariato).

**Prerequisiti esecuzione:**
- `.env.test` con `SUPABASE_SERVICE_KEY` già configurato (serve all'auto-cleanup dei test E2E).
- Server locale: `npx serve . -p 4321` (l'app risponde su `http://localhost:4321/app.html`).
- Baseline E2E VERDE prima di iniziare (oggi: telepatia 28/28, messaggi 15/15, rituali 18/18).

---

## File Structure

- **Create `src/app.jsx`** — sorgente JSX dell'app (estratto dal blocco `text/babel`). È il file che si modifica per la logica.
- **Create `build.js`** — compila `src/app.jsx`→`app.js` e aggiorna il meta CSP di `app.html` con gli hash degli inline.
- **Create `app.js`** — output generato (committato).
- **Modify `app.html`** — rimuove blocco babel + CDN @babel/standalone; aggiunge `<script src="app.js">` e meta CSP.
- **Modify `sw.js`** — rimuove @babel dal precache, aggiunge `app.js`, `CACHE`→`ga-pwa-v2`.
- **Modify `package.json`** — dev-deps babel + script `build`.
- **Modify `README.md`** (se esiste sezione build/dev) — nuovo flusso.

---

## MILESTONE 1 — Precompilazione (app funzionante senza Babel a runtime, CSP non ancora)

### Task 1: Setup dipendenze di build

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Installa le dev-deps**

Run:
```bash
npm install --save-dev @babel/core@^7 @babel/preset-react@^7
```
Expected: `package.json` ottiene `devDependencies` con `@babel/core` e `@babel/preset-react`; `npm audit` resta pulito (verificare: `npm audit` → "found 0 vulnerabilities").

- [ ] **Step 2: Aggiungi lo script build a package.json**

Modifica `package.json` aggiungendo:
```json
{
  "scripts": {
    "build": "node build.js"
  }
}
```

- [ ] **Step 3: Commit**
```bash
git add package.json package-lock.json
git commit -m "build: dev-deps babel (core + preset-react) e script build"
```

---

### Task 2: build.js (solo compilazione JSX→JS)

**Files:**
- Create: `build.js`

- [ ] **Step 1: Scrivi build.js (versione compilazione)**

```js
// build.js — precompila il JSX dell'app e (Milestone 2) aggiorna la CSP.
// Eseguire: node build.js
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = __dirname;

function buildAppJs() {
  const srcPath = path.join(ROOT, 'src', 'app.jsx');
  const src = fs.readFileSync(srcPath, 'utf8');
  const { code } = babel.transformSync(src, {
    // SOLO preset-react (runtime classic): trasforma il JSX in React.createElement,
    // riferendo i global UMD React/ReactDOM. NIENTE preset-env: i browser target
    // supportano gia' la sintassi usata e down-levellare cambierebbe comportamento.
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    filename: 'app.jsx',
    compact: false,
    comments: false,
    babelrc: false,
    configFile: false,
  });
  fs.writeFileSync(path.join(ROOT, 'app.js'), code, 'utf8');
  console.log(`  ✅ app.js generato (${code.length} byte) da src/app.jsx`);
}

buildAppJs();
console.log('Build completata.');
```

- [ ] **Step 2: Commit (build.js senza ancora il sorgente — non eseguibile finché non c'è src/app.jsx)**
```bash
git add build.js
git commit -m "build: build.js - compilazione src/app.jsx -> app.js (preset-react classic)"
```

---

### Task 3: Estrazione del JSX in src/app.jsx + guscio app.html

**Files:**
- Create: `src/app.jsx`
- Modify: `app.html` (blocco `<script type="text/babel">` → `<script src="app.js">`; rimozione CDN babel)

- [ ] **Step 1: Estrai il blocco babel in src/app.jsx con uno script una-tantum**

Esegui questo snippet (estrazione affidabile, niente taglio manuale di ~4300 righe). Verifica
che ci sia ESATTAMENTE un blocco `<script type="text/babel">`:

```bash
node -e "
const fs=require('fs');
let h=fs.readFileSync('app.html','utf8');
const open=h.indexOf('<script type=\"text/babel\">');
if(open<0){console.error('blocco babel non trovato');process.exit(1)};
const innerStart=h.indexOf('>',open)+1;
const close=h.indexOf('</script>',innerStart);
if(close<0){console.error('chiusura non trovata');process.exit(1)};
const jsx=h.slice(innerStart,close);
fs.mkdirSync('src',{recursive:true});
fs.writeFileSync('src/app.jsx',jsx.replace(/^\n/,''),'utf8');
// sostituisci l'intero blocco (tag aperto..chiuso) con il riferimento a app.js
const blockEnd=close+'</script>'.length;
h=h.slice(0,open)+'<script src=\"app.js\"></script>'+h.slice(blockEnd);
fs.writeFileSync('app.html',h,'utf8');
console.log('Estratte', (jsx.match(/\n/g)||[]).length, 'righe in src/app.jsx; app.html aggiornato');
"
```
Expected: `src/app.jsx` creato con ~4300 righe; in `app.html` il blocco è sostituito da `<script src="app.js"></script>` nella STESSA posizione (ordine di caricamento preservato: dopo React UMD e dopo l'inline dei costanti/supabase).

- [ ] **Step 2: Rimuovi la riga CDN di @babel/standalone da app.html**

Rimuovi da `app.html` la riga (≈23):
```html
<script crossorigin="anonymous" integrity="sha384-dqDn4UOhYWNxmtwnMX6yC3WtZZ6Li8rF6rLB7cu0i/R7btvb+p+kObgEHto7VsJK" src="https://unpkg.com/@babel/standalone@7.29.2/babel.min.js"></script>
```
(Usare Edit con match esatto sulla riga.)

- [ ] **Step 3: Genera app.js**

Run: `node build.js`
Expected: `✅ app.js generato (... byte) da src/app.jsx`. Nessun errore di compilazione.

- [ ] **Step 4: Smoke manuale dell'app**

Run (se non già attivo): `npx serve . -p 4321` (in background), poi verifica con uno smoke headless:
```bash
node -e "
const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://localhost:4321/app.html',{waitUntil:'networkidle'});
  const hasGuest = await p.locator('button:has-text(\"Ospite\"), button:has-text(\"Guest\")').count();
  await b.close();
  console.log('console errors:', errs.length?errs:'nessuno');
  console.log('bottone Ospite presente:', hasGuest>0?'SI':'NO');
  process.exit(hasGuest>0 && errs.length===0 ? 0 : 1);
})();
"
```
Expected: `console errors: nessuno`, `bottone Ospite presente: SI`. (Conferma che l'app si carica e renderizza senza Babel a runtime.)

- [ ] **Step 5: Suite E2E completa (prova di equivalenza funzionale)**

Con server attivo, esegui in sequenza (browser visibili, alcuni minuti ciascuno):
```bash
node test-telepathy.js
node test-messaggi.js
node test-rituali.js
```
Expected: ognuno termina con `RISULTATO: ✅ PASSATO` (telepatia 28/28, messaggi 15/15, rituali 18/18). Se uno fallisce → la compilazione diverge: NON proseguire, diagnosticare (probabile preset/ordine script).

- [ ] **Step 6: Commit (Milestone 1 — precompilazione funzionante e verificata)**
```bash
git add app.html app.js src/app.jsx
git commit -m "perf: precompila il JSX (app.js) e rimuove Babel a runtime"
```

---

## MILESTONE 2 — CSP forte

### Task 4: build.js calcola gli hash inline e scrive il meta CSP

**Files:**
- Modify: `build.js`
- Modify: `app.html` (aggiunta meta CSP con marker)

- [ ] **Step 1: Aggiungi il meta CSP placeholder in app.html**

Nel `<head>` di `app.html`, subito dopo `<meta charset...>`, aggiungi (Edit):
```html
    <meta http-equiv="Content-Security-Policy" content="__CSP__">
```

- [ ] **Step 2: Estendi build.js per calcolare hash e iniettare la CSP**

Aggiungi a `build.js` (dopo `buildAppJs()`), e richiama `buildCsp()`:
```js
const crypto = require('crypto');

function sha256b64(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('base64');
}

function buildCsp() {
  const htmlPath = path.join(ROOT, 'app.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Hash di ogni <script> INLINE (senza attributo src). La CSP richiede l'hash
  // del contenuto esatto tra i tag.
  const hashes = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1];
    if (body.trim() === '') continue; // ignora eventuali script vuoti
    hashes.push(`'sha256-${sha256b64(body)}'`);
  }

  const SUPABASE = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
  const csp = [
    "default-src 'self'",
    `script-src 'self' https://unpkg.com https://cdn.jsdelivr.net ${hashes.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${SUPABASE} https://api.emailjs.com`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  // Sostituisci SEMPRE il content del meta CSP (idempotente: matcha qualsiasi valore).
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/,
    `$1${csp}$2`
  );
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`  ✅ CSP aggiornata (${hashes.length} hash inline)`);
}

buildCsp();
```
NB: `buildCsp()` deve girare DOPO che `app.html` è nella forma finale (con `<script src="app.js">`, che è escluso perché ha `src`). Gli inline attesi: SW-register, emailjs.init, costanti/supabase, starfield → ~4 hash.

- [ ] **Step 3: Rigenera**

Run: `node build.js`
Expected: `✅ app.js generato...` + `✅ CSP aggiornata (4 hash inline)` (il numero può variare; deve essere ≥ il numero di script inline non vuoti). In `app.html` il `content="__CSP__"` è ora la policy completa.

- [ ] **Step 4: Smoke CSP — nessuna violazione in console**

Con server attivo:
```bash
node -e "
const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  const csp=[];p.on('console',m=>{const t=m.text();if(/Content Security Policy|Refused to/i.test(t))csp.push(t)});
  await p.goto('http://localhost:4321/app.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(1500);
  await b.close();
  console.log('violazioni CSP:', csp.length?csp:'nessuna');
  process.exit(csp.length===0?0:1);
})();
"
```
Expected: `violazioni CSP: nessuna`. Se compaiono violazioni → leggere quale risorsa/inline è bloccato e aggiungere la direttiva/hash mancante in `buildCsp()`, poi `node build.js` e ripetere.

- [ ] **Step 5: Suite E2E completa**

Run: `node test-telepathy.js && node test-messaggi.js && node test-rituali.js` (con server attivo)
Expected: tutti `✅ PASSATO`.

- [ ] **Step 6: Commit (Milestone 2 — CSP forte attiva)**
```bash
git add build.js app.html app.js
git commit -m "security: CSP forte via meta (hash inline calcolati da build.js, no unsafe-eval)"
```

---

## MILESTONE 3 — Service worker e documentazione

### Task 5: Aggiorna sw.js

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Rimuovi @babel dal precache, aggiungi app.js, bump cache**

In `sw.js` (Edit):
- cambia `const CACHE = 'ga-pwa-v1';` → `const CACHE = 'ga-pwa-v2';`
- in `PRECACHE`, rimuovi la riga `'https://unpkg.com/@babel/standalone@7.29.2/babel.min.js',`
- aggiungi `'app.js',` accanto a `'app.html'`.

- [ ] **Step 2: Smoke PWA — il SW si registra e app.js è raggiungibile**

Con server attivo:
```bash
node -e "
const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  await p.goto('http://localhost:4321/app.html',{waitUntil:'networkidle'});
  const reg = await p.evaluate(async()=>{ if(!('serviceWorker' in navigator))return 'no-sw-api'; const r=await navigator.serviceWorker.getRegistration(); return r?'registered':'not-registered'; });
  const appjs = await p.evaluate(async()=>{ const r=await fetch('app.js'); return r.status; });
  await b.close();
  console.log('SW:', reg, '| app.js HTTP', appjs);
  process.exit(appjs===200?0:1);
})();
"
```
Expected: `app.js HTTP 200` (e SW `registered` o `not-registered` a seconda del timing — non bloccante).

- [ ] **Step 3: Commit**
```bash
git add sw.js
git commit -m "pwa: sw cache v2 - rimuove @babel dal precache, aggiunge app.js"
```

---

### Task 6: Documentazione del nuovo flusso

**Files:**
- Modify: `README.md` (se presente) o crea una nota build in cima al repo

- [ ] **Step 1: Documenta il flusso build**

Aggiungi al README (o crea `BUILD.md`) una sezione:
```markdown
## Sviluppo / build

L'app è precompilata: il JSX vive in `src/app.jsx`, il servito è `app.js` (generato).

1. Modifica `src/app.jsx` (logica) o `app.html` (guscio, stili, script inline).
2. Esegui `node build.js` (o `npm run build`) → rigenera `app.js` e aggiorna la CSP in `app.html`.
3. Provalo: `npx serve . -p 4321` → http://localhost:4321/app.html
4. Esegui la suite E2E (deve restare verde) → poi commit/push.

NB: se modifichi uno script inline in `app.html`, ESEGUI la build: la CSP usa l'hash
del loro contenuto e va rigenerata, altrimenti lo script verrebbe bloccato.
```

- [ ] **Step 2: Commit**
```bash
git add README.md
git commit -m "docs: flusso build (src/app.jsx -> app.js, ricordare la CSP)"
```

---

### Task 7: Verifica finale e push

- [ ] **Step 1: Build pulita da zero**

Run: `node build.js`
Expected: app.js generato + CSP aggiornata, nessun errore.

- [ ] **Step 2: Suite E2E completa finale**

Run (server attivo): `node test-telepathy.js && node test-messaggi.js && node test-rituali.js`
Expected: tutti `✅ PASSATO`.

- [ ] **Step 3: Smoke finale (app + CSP)**

Ripeti gli smoke di Task 3/Step 4 e Task 4/Step 4. Expected: app carica, 0 errori console, 0 violazioni CSP.

- [ ] **Step 4: Push (solo a tutto verde)**
```bash
git push origin main
```
Poi verificare l'app live su GitHub Pages (https://ireneacqua.github.io/global-awakening/app.html):
caricamento ok, nessun errore console, e in DevTools → Network che `@babel/standalone` NON
viene più scaricato.

---

## Note di rollback
Se qualcosa va storto in produzione: `git revert` dei commit delle milestone (l'app.html
precedente ricarica Babel a runtime). La PWA: il bump a `v2` fa sì che il revert (che riporta
`v1` o richiede `v3`) vada gestito alzando ancora la versione cache se serve forzare refresh.
