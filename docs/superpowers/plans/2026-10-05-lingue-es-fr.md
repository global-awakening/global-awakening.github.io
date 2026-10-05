# Spagnolo e francese — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** l'app parla EN, IT, ES e FR, sceglie la lingua del telefono al primo avvio, la ricorda, e traduce schermate, regolamento, push e campanella.

**Architecture:** la logica pura va in due file nuovi in stile ES5, provabili in Node come gli helpers esistenti:
- `lingue-helpers.js`: lingua iniziale, fusione delle traduzioni, locale delle date;
- `notifiche-helpers.js`: traduzione delle notifiche della campanella.

`src/app.jsx` li usa tramite `window.LingueHelpers` / `window.NotificheHelpers`. Le traduzioni restano in `translations` dentro `src/app.jsx`. La migration `33_` allarga la RPC delle push a quattro lingue.

**Tech Stack:**
- React in un solo file `src/app.jsx`, compilato con `node build.js` in `app.js`;
- service worker `sw.js` con `push-helpers.js`;
- Supabase (plpgsql, Edge Functions Deno);
- test Node + Playwright (libreria `playwright`, non `@playwright/test`) e PGlite per l'SQL.

**Spec:** `docs/superpowers/specs/2026-10-05-lingue-es-fr-design.md`. Leggerla prima di ogni task. Dove piano e spec divergono vince la spec, e la divergenza va segnalata.
**Divergenze già note dalla spec**, decise qui:
- **(a)** Oltre a `notifiche-helpers.js` nasce `lingue-helpers.js`, perché la scelta della lingua e la fusione vanno provate in Node.
- **(b)** Il ripiego di `sw.js` (§3.5) resta scritto dentro `sw.js`, in quattro lingue. Scatta proprio quando `push-helpers.js` non si è caricato, quindi non può usarne i testi.

## Global Constraints

- **Test sempre muti:** ogni comando `node` si lancia con `NODE_OPTIONS="--require ./scripts/test-silenzioso.js"`.
- **`app.js` è generato:** dopo ogni modifica a `src/app.jsx`, `node build.js` e si committano tutti e due.
- **Lingue e locale:** `LINGUE = ['en', 'it', 'es', 'fr']`; chiave localStorage `ga_lang`; `LOCALE = { en: 'en-GB', it: 'it-IT', es: 'es-ES', fr: 'fr-FR' }`.
- **Menu della lingua:** chiuso mostra «🌐 XX» (`XX` = codice maiuscolo). Le voci sono «EN · English», «IT · Italiano», «ES · Español», «FR · Français».
- **Fusione delle traduzioni:** si entra solo negli oggetti semplici; array e funzioni si sostituiscono per intero.
- **Service worker:** cache `ga-pwa-v13`, `push-helpers.js?v=13`. `lingue-helpers.js` e `notifiche-helpers.js` vanno nel PRECACHE e nella lista `isFresh` di `sw.js`, e in `app.html` prima di `app.js`.
- **Notifiche push:** RPC `register_push_subscription` con `p_locale IN ('it','en','es','fr')` (migration `33_lingue_push.sql`, ritorno `33_ritorno.sql`).
- **Cosa non si traduce:** `'Anonymous'` scritto sul DB, le parole del codice ospite, `alert-cron`, le email EmailJS e gli errori server di blocco/segnalazione (spec §2).
- **Stile:** commenti in italiano, nello stile del file toccato, che spiegano il *perché*. Nessun refactor fuori scope.
- **Server locale per i test UI:** `npx serve -l 4321 .`, verificando che stampi `Accepting connections at http://localhost:4321`. Su Windows `TaskStop` non uccide il `node` figlio: lo si chiude per porta con `taskkill //PID <pid> //T //F`.
- **Credenziali:** il worktree non ha `.env.*`. I test sul DB vero si lanciano dal worktree caricando le chiavi in memoria:
  `node -e "process.chdir('../global-awakening'); require('../global-awakening/test-helpers').loadTestEnv(); process.chdir('../wt-lingue'); require('child_process').spawnSync(process.execPath, ['<test>.js'], {stdio:'inherit', env: process.env})"`
- **Remoti e DB:** mai `git push`, mai `apply-sql.js`, mai deploy delle funzioni da un sub-agente. Lo fa il controller (Task 11).

## Review Focus

1. **Telefono con lingua non supportata o strana** (`de-DE`, `pt-BR`, `zh-Hans-CN`, `navigator.languages` vuoto, `undefined`) → inglese, mai pagina bianca. Test nel Task 2 e nel Task 10.
2. **localStorage inaccessibile** (navigazione privata Safari, accessor che solleva) → l'app parte lo stesso con la lingua del telefono. Test nel Task 2 (storage che solleva).
3. **Notifica con un nickname che contiene la coda di un'altra frase, o un rituale con virgolette** («Ale "ha commentato il tuo post"») → si riconosce il tipo giusto, oppure si mostra il testo grezzo; mai mezzo nome. Test nel Task 6.
4. **Cambio di lingua con le push accese** → la RPC riceve la lingua nuova e il telefono riceve le push in quella lingua. Con la 33_ non ancora applicata l'errore è già inghiottito, ma il rilascio impone l'ordine. Test nel Task 8 (rpc) e nel Task 11 (ordine).
5. **Traduzione con una chiave dimenticata o una funzione scritta male** (`dayOf` che restituisce undefined) → il test di parità la trova prima del rilascio. Test nel Task 5 (parità + chiamata di ogni funzione con argomenti tipici).

---

## Task 1: i browser dei test partono in inglese

**Perché:** su questo PC `navigator.languages = ['it']`. Dal Task 3 l'app sceglie la lingua del telefono, e i circa 35 test UI che cercano testi inglesi partirebbero in italiano.

**Files:**
- Modify: `scripts/test-silenzioso.js`
- Test: `test-silenzioso-locale.js` (nuovo, piccolo)

**Interfaces:**
- Produces: ogni `browser.newContext(opts)` / `browser.newPage(opts)` riceve `locale: 'en-US'` se `opts.locale` manca. Un test può ancora chiedere `es-ES`.

- [ ] **Step 1: il test prima** — `test-silenzioso-locale.js`:
```js
// Verifica che scripts/test-silenzioso.js imposti locale en-US quando il test non lo chiede.
const { chromium } = require('playwright');
let passed = 0, failed = 0;
const check = (c, m, d) => { if (c) { passed++; console.log('  ✅ ' + m); } else { failed++; console.log('  ❌ ' + m, d === undefined ? '' : JSON.stringify(d)); } };
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const p1 = await browser.newPage();
    check((await p1.evaluate(() => navigator.language)) === 'en-US', 'newPage senza locale → en-US', await p1.evaluate(() => navigator.language));
    const ctx = await browser.newContext({ locale: 'es-ES' });
    const p2 = await ctx.newPage();
    check((await p2.evaluate(() => navigator.language)) === 'es-ES', 'newContext con locale es-ES → resta es-ES');
    const ctx2 = await browser.newContext({ viewport: { width: 360, height: 700 } });
    const p3 = await ctx2.newPage();
    check((await p3.evaluate(() => navigator.language)) === 'en-US', 'newContext con altre opzioni → en-US');
  } finally { await browser.close(); }
  console.log(`\n${passed} passati, ${failed} falliti`);
  process.exit(failed ? 1 : 0);
})();
```
- [ ] **Step 2: vederlo fallire** — `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-silenzioso-locale.js`. Atteso su questo PC: ❌ sul primo e sul terzo controllo (`it`).
- [ ] **Step 3: implementare** — in `scripts/test-silenzioso.js` sostituire il blocco di `playwright.chromium.launch` con:
```js
const playwright = require('playwright');

// I browser di prova prendono la lingua del sistema (su questo PC «it»). Dal 2026-10 l'app
// sceglie la lingua del telefono, e i test che cercano testi inglesi partirebbero in italiano:
// qui si fissa en-US a ogni contesto che non ne chiede un'altra, in un punto solo.
const conLocale = (opzioni) => (opzioni && opzioni.locale ? opzioni : { ...(opzioni || {}), locale: 'en-US' });

const avvio = playwright.chromium.launch.bind(playwright.chromium);
playwright.chromium.launch = async (opzioni = {}) => {
  const browser = await avvio({ ...opzioni, args: [...(opzioni.args || []), '--mute-audio'] });
  const nuovoContesto = browser.newContext.bind(browser);
  const nuovaPagina = browser.newPage.bind(browser);
  browser.newContext = (o) => nuovoContesto(conLocale(o));
  browser.newPage = (o) => nuovaPagina(conLocale(o));
  return browser;
};
```
  Aggiornare il commento di testa del file con una riga sul locale.
- [ ] **Step 4: vederlo passare** — stesso comando → `3 passati, 0 falliti`. Poi, come controprova che nulla si è rotto, server locale + `… node test-privacy.js` → stesso esito di prima (verde).
- [ ] **Step 5: commit** — `test: i browser di prova partono in en-US (la lingua di sistema è it)`.

**Fatto quando:** 3/0; `test-privacy.js` verde.

---

## Task 2: `lingue-helpers.js`

**Files:**
- Create: `lingue-helpers.js`, `test-lingue-helpers.js`

**Interfaces:**
- Produces (in `window.LingueHelpers` nel browser, `module.exports` in Node):
  - `LINGUE: string[]` = `['en','it','es','fr']`
  - `LOCALE: {[l]: string}`
  - `linguaIniziale(salvata: any, lingueTelefono: any): string`. `salvata` è il valore letto da `ga_lang` (può essere null o spazzatura); `lingueTelefono` è `navigator.languages` o `[navigator.language]`.
  - `leggiLinguaSalvata(storage): string|null` e `salvaLingua(storage, l): void`. Non sollevano mai.
  - `fondi(base: object, sopra: object): object`. Fusione profonda: entra solo negli oggetti semplici, mentre array, funzioni e primitivi di `sopra` sostituiscono per intero. Non modifica gli argomenti.
  - `locale(l): string` = `LOCALE[l] || 'en-GB'`
  - `etichetta(l): string`, per esempio `'ES · Español'`

- [ ] **Step 1: il test prima** — `test-lingue-helpers.js`:
```js
const L = require('./lingue-helpers.js');
let passed = 0, failed = 0;
const uguale = (m, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) { passed++; console.log('  ✅ ' + m); } else { failed++; console.log('  ❌ ' + m, JSON.stringify(a), '≠', JSON.stringify(b)); } };

uguale('quattro lingue', L.LINGUE, ['en', 'it', 'es', 'fr']);
// lingua iniziale
uguale('salvata valida vince sul telefono', L.linguaIniziale('fr', ['es-ES']), 'fr');
uguale('salvata spazzatura → telefono', L.linguaIniziale('xx', ['es-ES']), 'es');
uguale('salvata null → telefono', L.linguaIniziale(null, ['it-IT', 'en-US']), 'it');
uguale('prima supportata in ordine', L.linguaIniziale(null, ['de-DE', 'fr-FR']), 'fr');
uguale('maiuscole e trattino basso', L.linguaIniziale(null, ['ES_mx']), 'es');
uguale('nessuna supportata → en', L.linguaIniziale(null, ['de-DE', 'pt-BR', 'zh-Hans-CN']), 'en');
uguale('lista vuota → en', L.linguaIniziale(null, []), 'en');
uguale('undefined → en', L.linguaIniziale(undefined, undefined), 'en');
uguale('voci non stringa ignorate', L.linguaIniziale(null, [null, 42, 'fr']), 'fr');
// storage
const mem = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };
const s = mem(); L.salvaLingua(s, 'es');
uguale('salva e rilegge', L.leggiLinguaSalvata(s), 'es');
const rotto = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
uguale('storage che solleva: lettura → null', L.leggiLinguaSalvata(rotto), null);
uguale('storage che solleva: scrittura non solleva', (() => { L.salvaLingua(rotto, 'it'); return 'ok'; })(), 'ok');
uguale('storage assente', L.leggiLinguaSalvata(null), null);
uguale('non salva una lingua non supportata', (() => { const m = mem(); L.salvaLingua(m, 'de'); return L.leggiLinguaSalvata(m); })(), null);
// fusione
const base = { a: 'A', g: { x: 'X', y: 'Y' }, arr: [1, 2, 3], f: (n) => 'en' + n };
const sopra = { g: { x: 'X2' }, arr: [9], f: (n) => 'es' + n };
const r = L.fondi(base, sopra);
uguale('chiave mancante → base', r.a, 'A');
uguale('oggetto annidato fuso', r.g, { x: 'X2', y: 'Y' });
uguale('array sostituito per intero', r.arr, [9]);
uguale('funzione sostituita', r.f(1), 'es1');
uguale('base intatta', base.g, { x: 'X', y: 'Y' });
uguale('sopra assente → copia della base', L.fondi(base, undefined).g.y, 'Y');
// locale ed etichette
uguale('locale es', L.locale('es'), 'es-ES');
uguale('locale sconosciuto → en-GB', L.locale('de'), 'en-GB');
uguale('etichetta fr', L.etichetta('fr'), 'FR · Français');

console.log(`\n${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
```
- [ ] **Step 2: vederlo fallire** — `… node test-lingue-helpers.js`. Atteso: `Cannot find module './lingue-helpers.js'`.
- [ ] **Step 3: implementare** — `lingue-helpers.js`:
```js
/**
 * lingue-helpers.js — quale lingua parla l'app e come si mettono insieme le traduzioni.
 * Vive fuori da app.jsx per lo stesso motivo di inviti-helpers.js: qui si prova in node
 * (test-lingue-helpers.js). Stile ES5, nessuna dipendenza, nessun passaggio di build.
 * Spec: docs/superpowers/specs/2026-10-05-lingue-es-fr-design.md §3.1, §3.3.
 */
(function (globale) {
  'use strict';

  var LINGUE = ['en', 'it', 'es', 'fr'];
  var LOCALE = { en: 'en-GB', it: 'it-IT', es: 'es-ES', fr: 'fr-FR' };
  var NOMI = { en: 'English', it: 'Italiano', es: 'Español', fr: 'Français' };
  var CHIAVE = 'ga_lang';

  function supportata(l) { return typeof l === 'string' && LINGUE.indexOf(l) !== -1; }

  // Dalla lingua del telefono contano le due lettere iniziali: «es-MX» e «es_ES» sono spagnolo.
  function codice(voce) {
    return typeof voce === 'string' ? voce.slice(0, 2).toLowerCase() : '';
  }

  function linguaIniziale(salvata, lingueTelefono) {
    if (supportata(salvata)) return salvata;
    var voci = Array.isArray(lingueTelefono) ? lingueTelefono : [];
    for (var i = 0; i < voci.length; i++) {
      var c = codice(voci[i]);
      if (supportata(c)) return c;
    }
    return 'en';
  }

  // In navigazione privata o con i dati del sito bloccati l'accesso a localStorage solleva:
  // la lingua allora non si ricorda, ma l'app parte lo stesso.
  function leggiLinguaSalvata(storage) {
    try {
      var v = storage ? storage.getItem(CHIAVE) : null;
      return supportata(v) ? v : null;
    } catch (e) { return null; }
  }

  function salvaLingua(storage, l) {
    if (!supportata(l)) return;
    try { if (storage) storage.setItem(CHIAVE, l); } catch (e) { /* non si ricorda: pazienza */ }
  }

  function semplice(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }

  // Fusione profonda solo negli oggetti semplici. Array (privacy.sections, weekdaysShort) e
  // funzioni (dayOf, peopleHere…) si sostituiscono per intero: fonderli pezzo per pezzo
  // creerebbe sezioni metà spagnole e metà inglesi.
  function fondi(base, sopra) {
    var r = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) {
      r[k] = semplice(base[k]) ? fondi(base[k], {}) : base[k];
    }
    if (!semplice(sopra)) return r;
    for (k in sopra) if (Object.prototype.hasOwnProperty.call(sopra, k)) {
      r[k] = semplice(sopra[k]) && semplice(r[k]) ? fondi(r[k], sopra[k]) : sopra[k];
    }
    return r;
  }

  function locale(l) { return LOCALE[l] || 'en-GB'; }
  function etichetta(l) { return supportata(l) ? l.toUpperCase() + ' · ' + NOMI[l] : l; }

  var api = { LINGUE: LINGUE, LOCALE: LOCALE, linguaIniziale: linguaIniziale,
              leggiLinguaSalvata: leggiLinguaSalvata, salvaLingua: salvaLingua,
              fondi: fondi, locale: locale, etichetta: etichetta };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.LingueHelpers = api;
})(typeof self !== 'undefined' ? self : this);
```
- [ ] **Step 4: vederlo passare** — `… node test-lingue-helpers.js` → `29 passati, 0 falliti` (contare i `uguale`: se il numero è diverso conta che siano tutti ✅).
- [ ] **Step 5: commit** — `feat(lingue): lingue-helpers — lingua iniziale, memoria, fusione delle traduzioni`.

**Fatto quando:** tutti ✅.

---

## Task 3: l'app sceglie, ricorda e cambia la lingua da un menu

**Files:**
- Modify:
  - `src/app.jsx`: righe ~905, ~1164, ~1212, ~1428, ~3698, ~3720, ~4021, ~4036, ~4292, ~4528, ~4946, ~5021, ~5053, ~5970 (cercare `toLocaleTimeString()` / `toLocaleString()`), ~5799, ~6176;
  - `app.js` (build);
  - `app.html` (script);
  - `sw.js` (PRECACHE, `isFresh`, versione);
  - `test-livelli.js` (~29-33), `test-privacy.js` (~28).

**Interfaces:**
- Consumes: `window.LingueHelpers` (Task 2).
- Produces:
  - in `App`, `const LH = typeof window !== 'undefined' ? window.LingueHelpers : null;`;
  - `lang` è sempre uno di `LINGUE`;
  - `const t = TRADUZIONI[lang]`, dove `TRADUZIONI` è calcolato una volta sola, fuori dal componente, con `fondi(translations.en, translations[l])`;
  - nel DOM, il menu è `<select data-test="lingua">`, con `value` uguale al codice e un'option per lingua.

- [ ] **Step 1: test prima (aggiornare i due test)**
  - `test-livelli.js`: sostituire il blocco «switcho a IT cliccando 🌐 EN» con
    ```js
    await page.locator('select[data-test="lingua"]').first().selectOption('it');
    await page.waitForSelector('select[data-test="lingua"] >> nth=0', { timeout: TIMEOUT });
    ```
  - `test-privacy.js`: `await page.locator('button', { hasText: '🌐 EN' }).first().click();` diventa `await page.locator('select[data-test="lingua"]').first().selectOption('it');`.
  - Lanciarli sull'app di oggi (server locale): devono **fallire** sul selettore assente.
- [ ] **Step 2: cablaggio**
  - `app.html`: subito prima di `<script src="inviti-helpers.js"></script>` aggiungere
    ```html
    <!-- Prima di app.js: definisce LingueHelpers (lingua iniziale, fusione delle traduzioni). -->
    <script src="lingue-helpers.js"></script>
    ```
  - `sw.js`:
    - `const CACHE = 'ga-pwa-v13';`, con un commento `// v13: quattro lingue; push-helpers con ES/FR.`;
    - `importScripts('push-helpers.js?v=13');` e nel PRECACHE `'push-helpers.js?v=13'`;
    - nel PRECACHE aggiungere `'lingue-helpers.js', 'notifiche-helpers.js'`;
    - in `isFresh` aggiungere `|| url.pathname.endsWith('/lingue-helpers.js') || url.pathname.endsWith('/notifiche-helpers.js')`.
    `notifiche-helpers.js` nasce nel Task 6. Nel PRECACHE si usa `Promise.allSettled`, quindi un file che manca non blocca l'installazione.
- [ ] **Step 3: lingua iniziale e memoria** (`src/app.jsx`)
  - Accanto a `const translations = {...}`, dopo la sua chiusura:
    ```js
    // Ogni lingua nasce dall'inglese più la sua traduzione: una chiave dimenticata mostra
    // l'inglese invece di rompere la pagina (spec lingue §3.1). Calcolato una volta sola.
    const TRADUZIONI = (() => {
      const LH = typeof window !== 'undefined' ? window.LingueHelpers : null;
      const r = {};
      ['en', 'it', 'es', 'fr'].forEach((l) => { r[l] = LH ? LH.fondi(translations.en, translations[l]) : (translations[l] || translations.en); });
      return r;
    })();
    ```
  - Riga ~905: `const [lang, setLangStato] = useState(() => { const LH = window.LingueHelpers; if (!LH) return 'en'; let salvata = null; try { salvata = LH.leggiLinguaSalvata(window.localStorage); } catch (e) {} const tel = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language]; return LH.linguaIniziale(salvata, tel); });` più
    ```js
    const setLang = (l) => { setLangStato(l); try { window.LingueHelpers && window.LingueHelpers.salvaLingua(window.localStorage, l); } catch (e) {} };
    ```
    Va fuori dal JSX, subito dopo. `window.localStorage` solleva in alcuni browser: da qui il try esterno.
  - Riga ~1164: `const t = TRADUZIONI[lang] || TRADUZIONI.en;`.
- [ ] **Step 4: il menu** — sostituire **tutti e due** i pulsanti (~4292 e ~4528) con:
  ```jsx
  <label className="lingua-menu btn-secondary" title="Language">
    <span aria-hidden="true">🌐 {lang.toUpperCase()}</span>
    <select data-test="lingua" aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)}>
      {['en', 'it', 'es', 'fr'].map((l) => (
        <option key={l} value={l}>{window.LingueHelpers ? window.LingueHelpers.etichetta(l) : l.toUpperCase()}</option>
      ))}
    </select>
  </label>
  ```
  Nell'intestazione, la stessa `className` dei pulsanti di oggi (`btn-secondary px-3 py-2`). Nel `<style>` di `app.html`, o nel CSS dove stanno le classi `btn-*` (cercare `.btn-secondary`), aggiungere:
  ```css
  /* Il menu della lingua: si vede «🌐 XX» come il vecchio pulsante; la select nativa sta sopra,
     trasparente, così il telefono apre il suo selettore e l'intestazione non si allarga. */
  .lingua-menu { position: relative; display: inline-flex; align-items: center; cursor: pointer; }
  .lingua-menu select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; }
  ```
  `font-size: 16px` evita lo zoom automatico di iOS. Se `app.html` ha una CSP con hash di stili inline, `node build.js` li ricalcola: va controllato che stampi «CSP aggiornata».
- [ ] **Step 5: date e lingua passata ad altri**
  - ~4021 e ~4036: `lang === 'it' ? 'it-IT' : 'en-GB'` → `(window.LingueHelpers ? window.LingueHelpers.locale(lang) : 'en-GB')`. Meglio una costante dentro `App`: `const LOC = window.LingueHelpers ? window.LingueHelpers.locale(lang) : 'en-GB';`, poi `LOC` in tutti i punti.
  - ~4946, ~5021, ~5053, ~5970: `toLocaleTimeString()` → `toLocaleTimeString(LOC)`, `toLocaleString()` → `toLocaleString(LOC)`.
  - ~1428: `IH.testo(chiave, lang === 'it' ? 'it' : 'en', valori)` → `IH.testo(chiave, lang, valori)`.
  - ~3698 e ~3720: `lang === 'it' ? 'it' : 'en'` → `lang`. Prima del Task 8 l'RPC rifiuterebbe es/fr, ma qui il flusso non cambia per it/en, e il rilascio applica la 33_ prima del merge.
  - ~5799 e ~6176: `href="regole.html"` → ``href={`regole.html#${lang}`}``.
- [ ] **Step 6: build e prove**
  - `node build.js`.
  - Server locale: `… node test-livelli.js` e `… node test-privacy.js` → verdi.
  - `… node test-auth.js` → 12/12, perché parte in en-US grazie al Task 1.
  - `… node test-pwa.js` → controllare che non cerchi `ga-pwa-v12` o `?v=12`. Se li cerca, aggiornarli a v13 nello stesso commit.
- [ ] **Step 7: commit** — `feat(lingue): lingua dal telefono, ricordata, menu a quattro voci, date nella lingua dell'app` con `src/app.jsx app.js app.html sw.js test-livelli.js test-privacy.js` (+ `test-pwa.js` se toccato).

**Fatto quando:** i quattro test sono verdi e `grep -n "lang === 'it' ? 'it' : 'en'\|lang === 'en' ? 'it' : 'en'\|'it-IT' : 'en-GB'" src/app.jsx` non stampa nulla.

---

## Task 4: le frasi scritte a mano e quelle composte a pezzi

**Files:**
- Modify: `src/app.jsx` (blocchi `en` e `it` di `translations` + i punti d'uso), `app.js`

**Interfaces:**
- Produces: chiavi nuove in `translations.en` e `translations.it` (le userà il Task 5 per es/fr):
  - **radice:** `registrationFailed`, `fillNameDateTime`, `noNotifications`, `go`, `ok`, `seeOnlineUsers`, `mainSections`, `worldMapAlt`, `password`, `newPasswordPh`;
  - **`rituals`:** `namePh`, `descPh`, `types` (oggetto con le 5 chiavi oggi in `ritualTypes`, ~134-138: leggere lì i valori), `whenAt(quando, ora)`;
  - **`telepathy`:** `levelShapesN(n)`, `partnerOfflineN(nick)`, `waiting(n)`.

- [ ] **Step 1: elenco puntuale** — rileggere sul file ognuno dei punti di spec §3.2, cercandoli per testo (`grep -n "Please fill in name\|Nessuna notifica\|Sezioni principali\|Vedi gli utenti online\|World map\|New password...\|Full Moon Meditation\|Describe the ritual\|Registration failed" src/app.jsx`). Annotare le righe vere nel messaggio di commit.
- [ ] **Step 2: chiavi in `en` e `it`** — aggiungere le chiavi sopra con i testi di oggi. Il testo inglese esistente va in `en`; per l'italiano, la traduzione naturale. Le frasi composte:
  - `whenAt: (quando, ora) => \`${quando} at ${ora}\`` / `(quando, ora) => \`${quando} alle ${ora}\``. Prima va letto ~4043 per vedere come oggi si compone `atTime` e mantenere lo stesso risultato in en/it.
  - `levelShapesN: (n) => \`${n} ${…}\`` con il testo di oggi di `levelShapes` (~1171).
  - `partnerOfflineN: (nick) => \`${nick} ${…}\`` con il testo di oggi di `partnerOffline` (~3206).
  - `waiting: (n) => …` che riproduce `queueSize > 2 ? starseedsWaiting : starseedWaiting` (~5269), compreso il numero se oggi c'è.
  Le chiavi vecchie (`levelShapes`, `partnerOffline`, `starseedWaiting/s`, `atTime`) si tolgono **solo se** non restano altri usi (`grep`).
- [ ] **Step 3: usare le chiavi** — ogni punto di Step 1 legge da `t.…`. `ritualTypes` (~134-138) resta come elenco di **valori** salvati sul DB (non si cambia cosa si salva); l'etichetta mostrata nella select (~6474) diventa `t.rituals.types[valore]`, letto sul file quale chiave usare. `'Anonymous'` scritto sul DB **non** si tocca.
- [ ] **Step 4: prova** — `node build.js`; server locale; `… node test-rituali-ricorrenti-ui.js`, `… node test-livelli.js`, `… node test-account-ui.js` → verdi. In IT, nell'intestazione e nella creazione rituale, non devono restare frasi inglesi: controllo a occhio con uno screenshot Playwright salvato nello scratchpad.
- [ ] **Step 5: commit** — `feat(lingue): frasi fisse e composte dentro translations (en, it)`.

**Fatto quando:** `grep -n "Please fill in name\|Nessuna notifica\|Sezioni principali\|Vedi gli utenti online\|'World map'\|New password\.\.\.\|Full Moon Meditation\|Describe the ritual" src/app.jsx` trova solo righe dentro `translations`.

---

## Task 5: le traduzioni ES e FR, e la prova di parità

**Files:**
- Modify: `src/app.jsx` (blocchi `es` e `fr` dentro `translations`, più due commenti marcatori), `app.js`
- Create: `test-lingue.js`

**Interfaces:**
- Consumes: le chiavi di `translations.en` dopo il Task 4.
- Produces: `translations.es`, `translations.fr` con **le stesse foglie** di `en`. I marcatori `// ==== TRADUZIONI: INIZIO ====` sulla riga prima di `const translations = {` e `// ==== TRADUZIONI: FINE ====` sulla riga dopo la sua chiusura servono a `test-lingue.js`.

- [ ] **Step 1: il test prima** — `test-lingue.js`:
```js
// Parità delle traduzioni: ogni lingua ha le stesse foglie di «en», con lo stesso tipo,
// stesse lunghezze degli array, funzioni che rispondono con una stringa non vuota.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('src/app.jsx', 'utf8');
const m = src.match(/\/\/ ==== TRADUZIONI: INIZIO ====\n([\s\S]*?)\n\s*\/\/ ==== TRADUZIONI: FINE ====/);
if (!m) { console.log('❌ marcatori TRADUZIONI non trovati'); process.exit(1); }
const ctx = {}; vm.createContext(ctx);
vm.runInContext(m[1].replace(/const translations\s*=/, 'translations ='), ctx);
const T = ctx.translations;
let passed = 0, failed = 0;
const check = (c, msg, d) => { if (c) passed++; else { failed++; console.log('  ❌ ' + msg, d === undefined ? '' : JSON.stringify(d)); } };

// Argomenti tipici per le funzioni, per nome di chiave (le nuove del Task 4 e le tre storiche).
const ARGOMENTI = { dayOf: [3], peopleHere: [2], descCounter: [12, 500], whenAt: ['lun 6 ott', '21:00'],
  levelShapesN: [5], partnerOfflineN: ['Ale'], waiting: [3] };
function foglie(o, pre, out) {
  for (const k of Object.keys(o)) {
    const v = o[k]; const p = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) foglie(v, p, out); else out[p] = v;
  }
  return out;
}
const en = foglie(T.en, '', {});
for (const l of ['it', 'es', 'fr']) {
  check(!!T[l], `${l}: blocco presente`);
  if (!T[l]) continue;
  const f = foglie(T[l], '', {});
  for (const k of Object.keys(en)) {
    const a = en[k], b = f[k];
    check(k in f, `${l}: manca ${k}`);
    if (!(k in f)) continue;
    check(typeof a === typeof b && Array.isArray(a) === Array.isArray(b), `${l}: tipo diverso per ${k}`, [typeof a, typeof b]);
    if (typeof b === 'string') check(b.trim().length > 0, `${l}: stringa vuota ${k}`);
    if (Array.isArray(a) && Array.isArray(b)) check(a.length === b.length, `${l}: lunghezza diversa per ${k}`, [a.length, b.length]);
    if (typeof b === 'function') {
      const nome = k.split('.').pop();
      const r = b(...(ARGOMENTI[nome] || [1]));
      check(typeof r === 'string' && r.trim().length > 0, `${l}: ${k}() non restituisce testo`, r);
    }
  }
  for (const k of Object.keys(f)) check(k in en, `${l}: chiave in più ${k}`);
}
console.log(`\n${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
```
- [ ] **Step 2: vederlo fallire** — prima mettere i due marcatori, poi `… node test-lingue.js`. Atteso: `❌ es: blocco presente`, `❌ fr: blocco presente`, mentre `it` è tutto verde. Se `it` ha già dei ❌, la parità di oggi è rotta: correggerla prima (il Task 4 deve aver aggiunto le chiavi a tutti e due).
- [ ] **Step 3: scrivere `es` e poi `fr`** — subito dopo il blocco `it`, con la stessa struttura e lo stesso ordine delle chiavi. Regole di traduzione:
  - **Tono:** caldo e semplice come l'italiano; si dà del tu (`tú` / `tu`), mai `usted`/`vous`.
  - **Restano uguali:** Global Awakening, «starseed», i nomi propri dei livelli se in inglese sono nomi propri, le emoji, i segnaposto `{…}` e la forma di ogni funzione.
  - **Plurali:** `peopleHere` e `waiting` ripetono la logica a due forme dell'italiano.
  - **Privacy (`privacy.sections`):** traduzione fedele all'italiano, senza aggiungere né togliere obblighi; è un testo GDPR.
  - **Spagnolo neutro** (no voseo) e **francese di Francia**.
  - **Non inventare:** se una frase italiana è ambigua, seguire l'inglese.
- [ ] **Step 4: vederlo passare** — `… node test-lingue.js` → `0 falliti`. `node build.js`. Server locale e un controllo a occhio: screenshot Playwright con `locale: 'es-ES'` e `'fr-FR'` della schermata d'ingresso, della telepatia e dei rituali, salvati nello scratchpad.
- [ ] **Step 5: commit** — `feat(lingue): traduzioni ES e FR (prima stesura, da rileggere madrelingua)`.

**Fatto quando:** `test-lingue.js` dà 0 falliti; gli screenshot non mostrano chiavi grezze né testo inglese o italiano, fuori dalle eccezioni di spec §2.

---

## Task 6: la campanella nella lingua dell'app

**Files:**
- Create: `notifiche-helpers.js`, `test-notifiche-helpers.js`
- Modify:
  - `src/app.jsx` (~4623, `{n.message}`), `app.js`;
  - `app.html` (script);
  - `test-inviti-telepatia.js` (~361).

**Interfaces:**
- Produces: `window.NotificheHelpers.testoNotifica(n: {type, message}, lang): string`. Non solleva; se non riconosce la frase restituisce `String(n.message || '')`.

- [ ] **Step 1: il test prima** — `test-notifiche-helpers.js`:
```js
const N = require('./notifiche-helpers.js');
let passed = 0, failed = 0;
const uguale = (m, a, b) => { if (a === b) { passed++; console.log('  ✅ ' + m); } else { failed++; console.log('  ❌ ' + m, JSON.stringify(a), '≠', JSON.stringify(b)); } };
const T = (type, message, lang) => N.testoNotifica({ type, message }, lang);

// Le sei forme (spec §3.4), in francese.
uguale('ritual_join fr', T('ritual_join', 'Ale si è unito/a al tuo rituale "Luna piena"', 'fr'), 'Ale a rejoint ton rituel « Luna piena »');
uguale('ritual_comment es', T('ritual_comment', 'Ale ha commentato il tuo rituale "Luna piena"', 'es'), 'Ale ha comentado tu ritual «Luna piena»');
uguale('comment en', T('comment', 'Ale ha commentato il tuo post', 'en'), 'Ale commented on your post');
uguale('private_message es', T('private_message', 'Ale ti ha inviato un messaggio privato', 'es'), 'Ale te ha enviado un mensaje privado');
uguale('telepathy_invite fr', T('telepathy_invite', 'Ale ti ha invitato a un training telepatico', 'fr'), 'Ale t’a invité·e à un entraînement télépathique');
uguale('telepathy_declined en', T('telepathy_declined', 'Ale ha rifiutato il tuo invito al training telepatico', 'en'), 'Ale declined your telepathy training invite');
// italiano: invariato
uguale('it resta com\'è', T('comment', 'Ale ha commentato il tuo post', 'it'), 'Ale ha commentato il tuo post');
// nomi difficili
uguale('nickname con spazi', T('comment', 'Luce del Mattino ha commentato il tuo post', 'en'), 'Luce del Mattino commented on your post');
uguale('rituale con virgolette', T('ritual_join', 'Ale si è unito/a al tuo rituale "Il "cerchio" di luce"', 'en'), 'Ale joined your ritual "Il "cerchio" di luce"');
uguale('nickname che contiene la coda di un altro tipo', T('private_message', 'Bob ha commentato il tuo post ti ha inviato un messaggio privato', 'en'), 'Bob ha commentato il tuo post sent you a private message');
// ripieghi
uguale('tipo sconosciuto → grezzo', T('altro', 'Ciao', 'en'), 'Ciao');
uguale('frase che non corrisponde → grezza', T('comment', 'Messaggio diverso', 'en'), 'Messaggio diverso');
uguale('nome vuoto → grezza', T('comment', ' ha commentato il tuo post', 'en'), ' ha commentato il tuo post');
uguale('message assente', T('comment', undefined, 'en'), '');
uguale('lingua sconosciuta → en', T('comment', 'Ale ha commentato il tuo post', 'de'), 'Ale commented on your post');
uguale('n nullo non solleva', N.testoNotifica(null, 'en'), '');

console.log(`\n${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
```
- [ ] **Step 2: vederlo fallire** — `… node test-notifiche-helpers.js`. Atteso: `Cannot find module`.
- [ ] **Step 3: implementare** — `notifiche-helpers.js`:
```js
/**
 * notifiche-helpers.js — le notifiche della campanella nella lingua dell'app.
 *
 * Le righe di `notifications` contengono una frase italiana già composta (la scrivono il client
 * per ritual_join/ritual_comment/comment e l'SQL per private_message/telepathy_invite/
 * telepathy_declined), uguale in tutta la storia del progetto. Invece di cambiare il database,
 * qui si riconosce la frase PER TIPO, se ne estraggono nome ed eventuale rituale, e la si
 * riscrive. Una riga che non corrisponde si mostra com'è. Spec lingue §3.4.
 * Stile ES5, nessuna dipendenza; provato in node da test-notifiche-helpers.js.
 */
(function (globale) {
  'use strict';

  // Coda fissa per tipo. Ancorate in fondo: il nome è TUTTO quello che precede la coda, spazi
  // compresi; il rituale va fino all'ultima virgoletta, così regge le virgolette nel nome.
  var FORME = {
    ritual_join:        /^(.+) si è unito\/a al tuo rituale "(.*)"$/,
    ritual_comment:     /^(.+) ha commentato il tuo rituale "(.*)"$/,
    comment:            /^(.+) ha commentato il tuo post$/,
    private_message:    /^(.+) ti ha inviato un messaggio privato$/,
    telepathy_invite:   /^(.+) ti ha invitato a un training telepatico$/,
    telepathy_declined: /^(.+) ha rifiutato il tuo invito al training telepatico$/
  };

  var TESTI = {
    en: {
      ritual_join: function (n, r) { return n + ' joined your ritual "' + r + '"'; },
      ritual_comment: function (n, r) { return n + ' commented on your ritual "' + r + '"'; },
      comment: function (n) { return n + ' commented on your post'; },
      private_message: function (n) { return n + ' sent you a private message'; },
      telepathy_invite: function (n) { return n + ' invited you to a telepathy training'; },
      telepathy_declined: function (n) { return n + ' declined your telepathy training invite'; }
    },
    es: {
      ritual_join: function (n, r) { return n + ' se ha unido a tu ritual «' + r + '»'; },
      ritual_comment: function (n, r) { return n + ' ha comentado tu ritual «' + r + '»'; },
      comment: function (n) { return n + ' ha comentado tu publicación'; },
      private_message: function (n) { return n + ' te ha enviado un mensaje privado'; },
      telepathy_invite: function (n) { return n + ' te ha invitado a un entrenamiento telepático'; },
      telepathy_declined: function (n) { return n + ' ha rechazado tu invitación al entrenamiento telepático'; }
    },
    fr: {
      ritual_join: function (n, r) { return n + ' a rejoint ton rituel « ' + r + ' »'; },
      ritual_comment: function (n, r) { return n + ' a commenté ton rituel « ' + r + ' »'; },
      comment: function (n) { return n + ' a commenté ta publication'; },
      private_message: function (n) { return n + ' t’a envoyé un message privé'; },
      telepathy_invite: function (n) { return n + ' t’a invité·e à un entraînement télépathique'; },
      telepathy_declined: function (n) { return n + ' a refusé ton invitation à l’entraînement télépathique'; }
    }
  };

  function testoNotifica(n, lang) {
    var grezzo = n && n.message != null ? String(n.message) : '';
    try {
      if (!n || lang === 'it') return grezzo;
      var forma = FORME[n.type];
      if (!forma) return grezzo;
      var m = grezzo.match(forma);
      if (!m || !m[1].trim()) return grezzo;
      var t = TESTI[lang] || TESTI.en;
      return t[n.type](m[1], m[2]);
    } catch (e) { return grezzo; }
  }

  var api = { testoNotifica: testoNotifica };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.NotificheHelpers = api;
})(typeof self !== 'undefined' ? self : this);
```
  Il test atteso per `ritual_comment es` usa `«Luna piena»` senza spazi, coerente con lo spagnolo: allineare test e testo se servisse, ma sempre con le virgolette tipografiche della lingua.
- [ ] **Step 4: vederlo passare** — `… node test-notifiche-helpers.js` → 0 falliti.
- [ ] **Step 5: usarlo nell'app**
  - `app.html`: `<script src="notifiche-helpers.js"></script>` accanto a `lingue-helpers.js`, con un commento di una riga.
  - `src/app.jsx` ~4623: `{n.message}` → `{window.NotificheHelpers ? window.NotificheHelpers.testoNotifica(n, lang) : n.message}`.
  - `node build.js`.
- [ ] **Step 6: il test vecchio** — `test-inviti-telepatia.js` ~361: `document.body.innerText.includes('rifiutato')` → `/rifiutato|declined/.test(document.body.innerText)`. Lo si lancia con le chiavi in memoria (vedi Global Constraints): atteso 12/13, con il rosso preesistente al Test 7.
- [ ] **Step 7: commit** — `feat(lingue): la campanella nella lingua dell'app (notifiche-helpers)`.

**Fatto quando:** 0 falliti; `test-inviti-telepatia.js` come la baseline.

---

## Task 7: inviti-helpers in quattro lingue, ripiego chiave per chiave

**Files:**
- Modify: `inviti-helpers.js` (TESTI ~15-102, `testo()` ~104), `test-inviti-helpers.js` (~74-108)

**Interfaces:**
- Produces: `testo(chiave, lingua, valori)` ripiega su `TESTI.en[chiave]` prima di `t.errore`; `TESTI.es` e `TESTI.fr` hanno le stesse chiavi di `TESTI.en`.

- [ ] **Step 1: il test prima** — in `test-inviti-helpers.js`:
  - il controllo che ogni motivo abbia un testo passa da `['it','en']` a `['it','en','es','fr']`;
  - in più:
    ```js
    const H2 = require('./inviti-helpers.js');
    uguale('es: testo spagnolo con nome', H2.testo('non_disponibile', 'es', {}).length > 0 && H2.testo('non_disponibile', 'es', {}) !== H2.testo('non_disponibile', 'en', {}), true);
    uguale('chiave sconosciuta → errore della lingua', H2.testo('chiave_che_non_esiste', 'fr', {}), H2.testo('errore', 'fr', {}));
    ```
  - e un controllo di parità: `Object.keys` di ogni lingua uguale a quelle di `en`. `TESTI` non è esportato, quindi la parità si controlla chiamando `testo(k, l)` per ogni `k` dell'elenco di chiavi che il test già usa per en/it.
- [ ] **Step 2: vederlo fallire** — `… node test-inviti-helpers.js` → ❌ sulle nuove.
- [ ] **Step 3: implementare**
  - `TESTI.es`/`TESTI.fr`: tutte le chiavi di `en`, stesse regole di tono del Task 5, segnaposto `{nome}`/`{tempo}` intatti.
  - `testo()`:
    ```js
    var t = TESTI[lingua] ? TESTI[lingua] : TESTI.en;
    var s = Object.prototype.hasOwnProperty.call(t, chiave) ? t[chiave]
          : Object.prototype.hasOwnProperty.call(TESTI.en, chiave) ? TESTI.en[chiave] : t.errore;
    ```
- [ ] **Step 4: vederlo passare** — `… node test-inviti-helpers.js` → 0 falliti.
- [ ] **Step 5: commit** — `feat(lingue): inviti-helpers in ES e FR, ripiego per chiave`.

---

## Task 8: le push in quattro lingue

**Files:**
- Create: `supabase/sql/33_lingue_push.sql`, `supabase/sql/33_ritorno.sql`, `test-lingue-push-sql.js`
- Modify:
  - `push-helpers.js`, `sw.js` (ripiego ~140);
  - `supabase/functions/notify-telepathy-invite/index.ts` (~101), `supabase/functions/notify-ritual-start/index.ts` (TESTI ~32-41, ~146-147);
  - `test-push-helpers.js`, `test-sw-inviti.js` (se legge `?v=12`), `test-push-rpc.js` (~120).

**Interfaces:**
- Produces: RPC `register_push_subscription(p_session_id, p_endpoint, p_p256dh, p_auth, p_locale)` uguale alla 24_, salvo `p_locale IN ('it','en','es','fr')`. Il payload push ha `locale` fra le quattro.

- [ ] **Step 1: test SQL prima** — `test-lingue-push-sql.js`, su PGlite:
  - leggere `scripts/pg-locale.js` per vedere se `creaDbLocale()` crea `push_subscriptions` e applica la 24_;
  - se non lo fa, creare nel test la tabella minima (colonne come in `19_push_notifiche_rituali.sql`) e applicare `24_push_hardening.sql` con `applicaFile`; se la 24_ tocca tabelle che mancano, crearle minime;
  - poi:
    1. prima della 33_, `p_locale 'es'` → errore «locale non valido»;
    2. `applicaFile(db, 'supabase/sql/33_lingue_push.sql')`;
    3. `es` e `fr` accettati e salvati in `locale`; `de` ancora rifiutato;
    4. rilancio della 33_ senza errori;
    5. `33_ritorno.sql` → `es` di nuovo rifiutato, e le righe `es`/`fr` diventate `en`;
    6. ritorno rilanciato senza errori.
  - Usare un `p_endpoint` con un host accettato dalla 24_: leggere la lista nella 24_.
- [ ] **Step 2: vederlo fallire** — `… node test-lingue-push-sql.js` → ENOENT sulla 33_.
- [ ] **Step 3: `33_lingue_push.sql`**
  - Testa: titolo, perché (spec lingue §3.5), «Segue: 24_push_hardening.sql», ⚠️ «applicare PRIMA del merge dell'app che manda es/fr», ritorno `33_ritorno.sql», «Idempotente, in una transazione».
  - `BEGIN;` + `CREATE OR REPLACE FUNCTION public.register_push_subscription(...)`, copiata **integralmente** dalla 24_ (righe ~47 fino alla fine della funzione), salvo `IN ('it', 'en', 'es', 'fr')`.
  - Grant/revoke uguali alla 24_, se la 24_ li ha subito dopo la funzione.
  - `NOTIFY pgrst, 'reload schema'; COMMIT;`
  - **Nota sul ruolo di servizio:** l'hook pre-commit rifiuta quella parola fuori dalle righe GRANT/REVOKE.
- [ ] **Step 4: `33_ritorno.sql`** — `BEGIN;` + `UPDATE public.push_subscriptions SET locale = 'en' WHERE locale NOT IN ('it','en');` + la funzione **identica alla 24_** + `NOTIFY` + `COMMIT`. In testa: «SCRITTO E PROVATO IN LOCALE, NON APPLICATO: lo lancia Irene solo se decide che serve».
- [ ] **Step 5: vederlo passare** — `… node test-lingue-push-sql.js` → 0 falliti. Controllare `git show HEAD:supabase/sql/33_lingue_push.sql | grep -c $'\r'` → `0`, dopo il commit.
- [ ] **Step 6: `push-helpers.js`** — prima i test, in `test-push-helpers.js`:
  - per `locale: 'es'` e `'fr'`, `reminder`, `start`, `invito`, `accettato`, `rifiutato`, `scaduto` danno titoli diversi dall'inglese e non vuoti;
  - `locale: 'de'` → inglese;
  - nome rituale vuoto in `es` → il ripiego spagnolo.
  Poi l'implementazione:
  - `TESTI.es`, `TESTI.fr`, `TESTI_INVITO.es`, `TESTI_INVITO.fr` con le stesse chiavi e la stessa forma delle funzioni di `en`;
  - in `TESTI[l]`, una chiave nuova `unRituale` per ogni lingua (it «Un rituale», en «A ritual», es «Un ritual», fr «Un rituel») al posto del ternario a ~82;
  - la lingua: `var lingua = TESTI[p.locale] && TESTI_INVITO[p.locale] ? p.locale : 'en';`.
  `… node test-push-helpers.js` → 0 falliti.
- [ ] **Step 7: `sw.js` ripiego** (~140): sostituire il ternario `it` con una tabella in linea a quattro lingue:
  ```js
  const RIPIEGO = {
    it: ["Apri l'app", 'Un rituale sta iniziando.'],
    en: ['Open the app', 'A ritual is starting.'],
    es: ['Abre la app', 'Un ritual está empezando.'],
    fr: ["Ouvre l'app", 'Un rituel commence.']
  };
  const r = RIPIEGO[payload && payload.locale] || RIPIEGO.en;
  ```
  Usare `r[0]` per l'invito e `r[1]` per il rituale. Commento: sta qui e non in push-helpers, perché scatta proprio quando push-helpers non si è caricato. `… node test-sw-inviti.js` → verde; se cerca `?v=12`, aggiornarlo a `?v=13`.
- [ ] **Step 8: funzioni del server**
  - `notify-telepathy-invite/index.ts` ~101: `const lingua = ['it', 'en', 'es', 'fr'].includes(ab.locale) ? ab.locale : 'en';`
  - `notify-ritual-start/index.ts`: togliere `TESTI` (~32-41) e `const t = …` (~147); al loro posto `const LINGUE = ['it', 'en', 'es', 'fr'];` (commento: «il testo lo compone il telefono, push-helpers.js; qui la lingua serve solo come filtro») e `const lingua = LINGUE.includes(ab.locale) ? ab.locale : 'en';`. Controllare che `t` non sia usato altrove (`grep -n "\bt\." index.ts`) e che `type Tipo` resti usato.
  - Se esiste `test-invito-decisioni.js` o un test Deno/Node che legge queste funzioni, rilanciarlo: `… node test-invito-decisioni.js` → come prima.
- [ ] **Step 9: `test-push-rpc.js`** (~120): accanto al controllo «de rifiutato», aggiungere «es accettato» e «fr accettato». **Non lanciarlo adesso**: gira sul DB vero dopo la 33_ (Task 11).
- [ ] **Step 10: commit** — `feat(lingue): push in ES e FR — 33_ (+ritorno), push-helpers, ripiego sw, funzioni`.

**Fatto quando:** `test-lingue-push-sql`, `test-push-helpers` e `test-sw-inviti` danno 0 falliti.

---

## Task 9: regolamento e manifest

**Files:**
- Modify: `regole.html`, `manifest.webmanifest`

- [ ] **Step 1: struttura** — leggere `regole.html` per intero (sezione IT ~59-120, EN ~125-165, piè di pagina).
  - Ogni lingua diventa una `<section lang="xx" id="xx" class="lingua">` con titolo, testo e un piè «Torna all'app / Back to the app / Volver a la app / Retour à l'app» nella sua lingua. L'inglese va completato fino a corrispondere all'italiano punto per punto, poi si aggiungono ES e FR, con le regole di tono del Task 5.
  - Script in linea in fondo:
    ```html
    <script>
      // Mostra solo la lingua chiesta dall'app (regole.html#es); ripiego sull'inglese.
      (function () {
        var l = (location.hash || '').slice(1);
        if (!document.getElementById(l)) l = 'en';
        var s = document.querySelectorAll('section.lingua');
        for (var i = 0; i < s.length; i++) s[i].hidden = s[i].id !== l;
        document.documentElement.lang = l;
        var h = document.querySelector('#' + l + ' h1');
        if (h) document.title = h.textContent;
      })();
    </script>
    ```
  - Senza JS tutte le sezioni restano visibili, nessuna nascosta: va bene.
  - **CSP:** se `regole.html` ha un `<meta http-equiv="Content-Security-Policy">` con hash, aggiungere l'hash dello script, oppure verificare che `build.js` lo calcoli. Se non c'è CSP, niente.
- [ ] **Step 2: manifest** — `"description"` in inglese (traduzione dell'attuale), `"lang": "en"`. `name`/`short_name` invariati.
- [ ] **Step 3: prova** — server locale e Playwright a mano (script nello scratchpad): `regole.html#fr` mostra una sola sezione con `lang="fr"`; `regole.html#de` mostra l'inglese; `regole.html` mostra l'inglese. `… node test-pwa.js` → verde.
- [ ] **Step 4: commit** — `feat(lingue): regolamento completo in quattro lingue, manifest in inglese`.

---

## Task 10: prova dal browser in quattro lingue

**Files:**
- Create: `test-lingue-ui.js`

- [ ] **Step 1: scrivere il test**, nello stile di `test-privacy.js` (stessa intestazione `APP_URL`, `check`, uscita con conteggio). Scenari, ognuno in un `browser.newContext({...})` nuovo:
  1. `locale: 'es-ES'` → `select[data-test="lingua"]` ha `value === 'es'` e la schermata d'ingresso contiene il testo `translations.es` di un'etichetta d'ingresso. La si legge da `src/app.jsx` con lo stesso estrattore di `test-lingue.js`, che va messo in una funzione esportata da un piccolo `scripts/leggi-traduzioni.js` e usato da tutti e due i test.
  2. `locale: 'de-DE'` → `value === 'en'`.
  3. `locale: 'en-US'`, scelgo `fr` dal menu, ricarico → `value === 'fr'`.
  4. **Nessuna frase a metà:** in `es`, entrando come ospite (riusare l'aiuto `loginAsGuest` di `test-helpers.js`), si visitano le sezioni principali. Per ognuna si raccoglie `document.body.innerText` e si cercano parole che non devono esserci in ES: un elenco di 10-15 parole inglesi e italiane presenti oggi nell'interfaccia (es. `Rituals`, `Rituali`, `Settings`, `Impostazioni`, `Online now`, `Invita`). Va escluso il testo scritto dagli utenti: la scansione si fa su intestazione, barra delle sezioni e titoli.
  5. **Campanella:** con la chiave di servizio (`serviceFetch` di `test-helpers.js`) si inserisce per l'ospite una notifica `comment` con «Prova ha commentato il tuo post». Con l'app in `fr`, la campanella mostra «Prova a commenté ta publication». Alla fine la riga si cancella con `purge`.
  6. **360 px:** `viewport: { width: 360, height: 740 }`, `locale: 'fr-FR'`, ospite dentro. L'intestazione non ha scroll orizzontale (`document.documentElement.scrollWidth <= 360`) e il menu della lingua è visibile.
- [ ] **Step 2: lanciarlo** — server locale e chiavi in memoria → 0 falliti. Se lo scenario 4 trova parole, sono testi dimenticati: si sistemano nel Task 4 o nel Task 5 (stesso ramo), con un commit `fix(lingue): …`.
- [ ] **Step 3: commit** — `test(lingue): prova dal browser in quattro lingue`.

---

## Task 11: revisione, rilascio, verifiche dal vivo (controller)

- [ ] **Step 1: revisione indipendente** dell'intero ramo (`git diff origin/main..HEAD`), con un sub-agente separato. Rubric:
  - spec §1 punti 1-5;
  - nessun `lang === 'it' ? … : 'en'` residuo;
  - `notifiche-helpers.js` e `lingue-helpers.js` cablati in `app.html` e `sw.js` (PRECACHE + `isFresh`);
  - la 33_ uguale alla 24_ salvo la lingua;
  - i testi ES/FR coerenti di tono, del tu, senza chiavi grezze;
  - nessun refactor fuori scope.
- [ ] **Step 2: tutte le prove sul build finale** — server locale e chiavi in memoria:
  - test-lingue-helpers, test-lingue, test-notifiche-helpers, test-inviti-helpers, test-push-helpers, test-sw-inviti, test-lingue-push-sql, test-inviti-offline-sql, test-silenzioso-locale;
  - test-auth, test-account-ui, test-privacy, test-livelli, test-rituali-ricorrenti-ui, test-rituali-cancellazione-ui, test-inviti-offline-ui, test-moderazione-ui, test-pwa, test-push-ui, test-ospite-identita, test-chiave-scaduta, test-lingue-ui;
  - test-inviti-telepatia: 12/13 come la baseline.
  Annotare i numeri.
- [ ] **Step 3: push e PR** — dire a Irene «sto per pushare `feat/lingue-es-fr` su `global-awakening` e aprire la PR verso main». Poi `git push -u origin feat/lingue-es-fr` e `gh pr create`. Nella descrizione, l'ordine di rilascio e i numeri delle prove.
- [ ] **Step 4: la 33_** — dire a Irene quale file. Poi, da `global-awakening/`: `node scripts/apply-sql.js ../wt-lingue/supabase/sql/33_lingue_push.sql` (permesso del 05/10). Dopo, con le chiavi in memoria: `… node test-push-rpc.js` → verde, con es/fr accettati.
- [ ] **Step 5: le due funzioni** — `node scripts/deploy-push.js --solo notify-telepathy-invite` e `--solo notify-ritual-start`, da `global-awakening/`, puntando ai file del worktree. Prima va letto come `deploy-push.js` sceglie i file. **Non è nel permesso del 05/10**: se il classificatore blocca, si dà a Irene il comando `! …` esatto. Dopo: `… node test-invito-funzione.js` → come prima.
- [ ] **Step 6: merge** — `gh pr merge <N> --merge -R global-awakening/global-awakening.github.io`. Poi si attende la pubblicazione di Pages e si controlla che lo sha1 di `app.js` live sia uguale a quello di `origin/main`, e che `sw.js` live contenga `ga-pwa-v13`.
- [ ] **Step 7: foglio per la rilettura madrelingua** — un file di testo o una tabella, fuori dal repo, nello scratchpad o in `update progetti/`. Contiene chiave, EN, IT, ES e FR affiancati, privacy compresa, per i testi di `translations`, inviti-helpers, push-helpers, notifiche-helpers e regole. Lo si genera con un piccolo script dalle stesse fonti di `test-lingue.js`, senza scriverlo a mano.
- [ ] **Ritorno indietro (scritto, non eseguito):** `33_ritorno.sql` (lo lancia Irene, solo su sua decisione), revert della PR, funzioni ripubblicate dal commit precedente.

**Fatto quando:** PR mergiata; 33_ applicata prima del merge; funzioni ripubblicate; prove verdi come annotato; sito live uguale a main; foglio di rilettura consegnato.
