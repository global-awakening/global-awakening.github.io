# Audit dipendenze & CVE — Global Awakening (L4)

**Data:** 2026-06-04 · **Tipo:** sola lettura (nessuna modifica applicata) · **Esito generale:** ✅ basso rischio

Backlog item **L4** della checklist sicurezza/qualità. Censimento delle dipendenze
(locali + CDN) e delle vulnerabilità note, con raccomandazioni prioritizzate.
Nessuna libreria è stata modificata: cambiare le versioni e pushare sull'app live
va fatto con verifica dedicata.

---

## 1. Perimetro reale

L'app è single-file (`app.html`) e carica **solo 4 librerie esterne** da CDN. Notabile:

- **NON** usa `@supabase/supabase-js`: il client `supabase` (riga 37) è un **wrapper REST scritto a mano** su `fetch`. → niente dipendenza supply-chain per il DB.
- **NON** usa Tailwind da CDN: il CSS è inline nel `<style>` (riga 151). → niente pull esterno.
- `npm audit`: **0 vulnerabilità** (unica dep locale: `playwright`, solo per i test).

### Librerie CDN (tutte con SRI `sha384` + `crossorigin="anonymous"`)

| Libreria | Versione | Fonte | Stato |
|---|---|---|---|
| react | 18.3.1 | unpkg | ✅ ultima 18.x, nessuna CVE nota |
| react-dom | 18.3.1 | unpkg | ✅ idem |
| @babel/standalone | 7.29.2 | unpkg | ⚠️ recente e senza CVE critiche, ma transform in-browser (vedi §3) |
| @emailjs/browser | 4.4.1 | jsDelivr | ✅ recente; nota abuso public key (vedi §3) |

---

## 2. Punti di forza già presenti (da mantenere)

- **SRI integrity** + `crossorigin` su tutti e 4 gli script CDN → protezione contro CDN compromessi/manomissioni. (Ottima pratica, spesso assente in progetti simili.)
- **Versioni pinnate** esatte (no `@latest`) → build riproducibili, niente upgrade silenziosi.
- **Nessun import CSS esterno** (`@import`/`url(https://...)` assenti).
- Link esterni con `rel="noopener noreferrer"`.
- Superficie supply-chain minima (client DB e stile fatti in casa).

---

## 3. Raccomandazioni (prioritizzate)

### 🟡 [Media] Aggiungere una Content-Security-Policy
Oggi non c'è alcuna CSP. Una `<meta http-equiv="Content-Security-Policy">` che limiti
`script-src` a `'self'` + `unpkg.com` + `cdn.jsdelivr.net` darebbe difesa-in-profondità
contro XSS.
**Caveat importante:** `@babel/standalone` compila a runtime via `eval`/`Function`, quindi
una CSP richiederebbe `'unsafe-eval'` — che indebolisce molto la protezione. → questo punto
è legato al successivo: togliendo Babel in-browser, la CSP diventa davvero efficace.
*Rischio:* una CSP troppo stretta può rompere l'app → va testata sul sito live (con te).

### 🟡 [Media · perf+sicurezza] Precompilare il JSX, rimuovere @babel/standalone
L'app trasforma il proprio codice **nel browser** a ogni caricamento (avviso già visibile in
console: *"You are using the in-browser Babel transformer…"*). Conseguenze:
- carica ~3 MB di transformer e compila a runtime → **LCP peggiore** (si ricollega a **G3**);
- obbliga a `'unsafe-eval'` in CSP.
**Proposta:** uno step di build che precompila il JSX in JS semplice (es. esbuild/Babel a
build-time) servendo un bundle statico. Rimuove la dipendenza, alleggerisce il caricamento e
sblocca una CSP forte. *È un cambio al processo di build → da valutare insieme.*

### 🟢 [Bassa] EmailJS: verificare restrizioni anti-abuso
La public key EmailJS è esposta nel client (`emailjs.init({ publicKey: ... })`) — è previsto
dal design, ma chiunque potrebbe riusarla per inviare email tramite i tuoi template. Verificare
nel dashboard EmailJS che siano impostati **allowed origins** e **rate limit/quota**.

### 🟢 [Bassa · processo] Tracciare le dipendenze CDN
Essendo pinnate in HTML (non in `package.json`), gli scanner automatici (es. Dependabot) **non
le vedono**. Suggerito un ricontrollo manuale periodico (trimestrale) delle 4 versioni vs
eventuali advisory. Questo file può fungere da registro.

---

## 4. Verdetto

Nessuna vulnerabilità nota attiva. Postura supply-chain **buona** (SRI + pinning + superficie
minima). I due interventi a maggior valore (CSP + rimozione Babel in-browser) sono **migliorie
di hardening/perf**, non fix urgenti, e richiedono una verifica sull'app live → da pianificare
insieme. Nessuna azione immediata obbligatoria.
