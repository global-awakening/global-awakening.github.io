# Spagnolo e francese — design

Data: 2026-10-05 · Ramo: `feat/lingue-es-fr` · Stato: da approvare (Irene) · Revisione indipendente: fatta, 2 rilievi alti e 12 medi/bassi integrati.

## 1. Perché e cosa vuol dire «fatto»

Il lancio arriva a ondate. La seconda (community spirituali su Facebook) e la terza (campagna mondiale) portano persone che non parlano italiano e spesso nemmeno inglese. Oggi l'app parla inglese e italiano, riparte sempre in inglese e non ricorda la scelta.

**Fatto quando:**
1. Una persona con il telefono in spagnolo o in francese apre l'app per la prima volta e la trova nella sua lingua, senza toccare nulla.
2. La lingua si cambia da un menu con quattro voci (EN, IT, ES, FR) e l'app la ricorda alla visita successiva.
3. Nelle quattro lingue sono tradotte la schermata d'ingresso, le sezioni, la telepatia, i rituali, i messaggi, la moderazione, la privacy, il regolamento, le notifiche push e le notifiche nella campanella. Nessuna frase a metà fra due lingue, **salvo le eccezioni di §2**.
4. Date e orari scritti dall'app seguono la lingua dell'app, non quella del browser. Fanno eccezione i selettori nativi di data e ora (`<input type="date|time">`), che il telefono disegna nella propria lingua.
5. Le prove esistenti restano verdi.

**Cosa dice Irene:** ES e FR, dopo la chiave scaduta (02/10). Procedere in autonomia con le opzioni consigliate (05/10).
**Cosa assumo io:**
- Le traduzioni le scrivo io e vanno rilette da madrelingua prima della seconda ondata. Il tono spirituale non si improvvisa, e la privacy è un testo GDPR.
- I nomi propri restano uguali in tutte le lingue: Global Awakening, starseed.

## 2. Cosa resta fuori (seconda parte, spec a sé)

- **Email di accesso** (link via email e reset password). I modelli stanno su EmailJS, solo in inglese, e la funzione del server non riceve la lingua. Tradurle richiede modelli nuovi creati a mano sul sito di EmailJS. Per il lancio va bene l'inglese.
- **Messaggi di errore del server su blocco e segnalazione** (`setErrorToast(error.message)`, app.jsx ~1334/1344/1365): restano in inglese tecnico. Sono casi rari e si traducono dai codici in una passata a parte.
- **`'Anonymous'`** scritto sul database come nickname di ripiego, e le parole del **codice ospite** (`aurora-lince-NNNN`): non si traducono, sono identità.
- **Avvisi all'amministratrice** (`alert-cron`): restano in italiano.
- **Fuori dal codice ma da non perdere:** la scheda Play Store in ES e FR per la seconda ondata.

## 3. Come funziona

### 3.1 Scelta e memoria della lingua (`src/app.jsx`)
- `LINGUE = ['en', 'it', 'es', 'fr']`.
- **Lingua iniziale:**
  1. `localStorage.ga_lang`, se valida;
  2. altrimenti si scorre `navigator.languages`, o se manca `[navigator.language]`, nell'ordine dato, e si prende la prima lingua le cui due lettere iniziali sono fra le quattro (`['de-DE','fr-FR']` → `fr`);
  3. altrimenti `en`.
  Ogni lettura e scrittura di `localStorage` sta in un try/catch. `setLang` salva in `ga_lang`.
- **Il pulsante 🌐 diventa un menu nativo** (`select`) negli stessi due punti di oggi: schermata d'ingresso e intestazione. Chiuso mostra solo «🌐 XX», come oggi, così l'intestazione non si allarga. Aperto mostra le voci nella lingua stessa: «EN · English», «IT · Italiano», «ES · Español», «FR · Français». Si controlla a 360 px.
- **Ripiego:** `t` nasce dall'inglese più la lingua sopra, con una fusione profonda fatta una volta sola all'avvio. La fusione entra **solo negli oggetti semplici**: array (`privacy.sections`, `weekdaysShort`) e funzioni (`dayOf`, `peopleHere`, `descCounter` e le nuove di §3.2) si sostituiscono per intero, mai pezzo per pezzo. Così una chiave dimenticata mostra l'inglese senza rompere la pagina, e non nascono sezioni metà spagnole e metà inglesi.

### 3.2 Testi
- `translations` riceve i blocchi `es` e `fr` con le stesse 349 chiavi di `en`/`it`.
- **Le frasi scritte a mano entrano in `translations`.** Oggi alcune restano in italiano anche nell'app inglese, altre in inglese anche nell'app italiana:
  - i 5 nomi dei tipi di rituale (`ritualTypes`, ~134-138);
  - il ripiego «Registration failed…» (~2031);
  - l'alert «Please fill in name, date and time.» (~3570, ~3579);
  - «Nessuna notifica» (~4601);
  - «Vai» (~4643);
  - `title` «Vedi gli utenti online (Community)» (~4683);
  - `aria-label` «Sezioni principali» (~4726);
  - «OK» (~4780);
  - `alt` «World map» (~5090);
  - i placeholder «New password...» (~5749), «e.g., Full Moon Meditation» (~6445) e «Describe the ritual...» (~6455);
  - le etichette «Password» (~4364/4365, ~4481/4482).
  Le righe sono indicative: nel piano si rileggono sul file.
- **Le frasi composte a pezzi**, dove l'ordine delle parole cambia da lingua a lingua, diventano funzioni nella traduzione: `levelShapes` (~1171), `partnerOffline` (~3206), «quando + alle + ora» (~4043), `starseedWaiting/s` (~5269).
- **`inviti-helpers.js`** riceve `es` e `fr` per tutte le chiavi. `testo()` oggi ripiega sull'inglese solo se manca la lingua intera: va portato a ripiegare **chiave per chiave** su `TESTI.en[chiave]` prima di `t.errore`.

### 3.3 Date e orari
- `LOCALE = { en: 'en-GB', it: 'it-IT', es: 'es-ES', fr: 'fr-FR' }`. Prende il posto del ternario it/en in `formatRitualWhen` e `descriviRipetizione`.
- I `toLocaleTimeString()` / `toLocaleString()` senza locale (~4951, ~5026, ~5058, ~5970) ricevono `LOCALE[lang]`.

### 3.4 Notifiche nella campanella
Le righe di `notifications` contengono una frase italiana già composta, uguale in tutta la storia del progetto:

| Chi la scrive | `type` | Frase |
|---|---|---|
| client | `ritual_join` | `{nome} si è unito/a al tuo rituale "{rituale}"` |
| client | `ritual_comment` | `{nome} ha commentato il tuo rituale "{rituale}"` |
| client | `comment` | `{nome} ha commentato il tuo post` |
| SQL 16_ | `private_message` | `{nome} ti ha inviato un messaggio privato` |
| SQL 32a | `telepathy_invite` | `{nome} ti ha invitato a un training telepatico` |
| SQL 32a | `telepathy_declined` | `{nome} ha rifiutato il tuo invito al training telepatico` |

**Scelta:** non tocco il database.
- Una funzione pura `testoNotifica(n, lang)`, nel nuovo file `notifiche-helpers.js` e provabile in Node, lavora **per tipo**.
- Per ogni tipo ha una regex ancorata sulla coda fissa. Il nome è tutto quello che precede la coda, spazi compresi. Il rituale è catturato fino all'ultima virgoletta, quindi regge le virgolette dentro il nome.
- Il risultato è la frase nella lingua dell'app. Una riga che non corrisponde si mostra com'è, come oggi.
- Il client continua a scrivere la frase in italiano: è la forma che il riconoscimento si aspetta.

**Perché così:** vale anche per le notifiche già salvate, e non richiede migration né modifiche alle RPC.

**Il nuovo file va cablato:**
- `<script src="notifiche-helpers.js">` in `app.html`, accanto agli altri helpers;
- nel PRECACHE e nella lista `isFresh` di `sw.js`. Ogni file fuori da `isFresh` finisce nel ramo cache-first, e le correzioni non arriverebbero più alle app installate: è lo stesso guaio del manifest a settembre.

### 3.5 Notifiche push
- **Database** (migration `33_lingue_push.sql`): `register_push_subscription` accetta `p_locale IN ('it','en','es','fr')`. Si ridefinisce partendo dal corpo in uso (`24_push_hardening.sql`). Serve un ritorno indietro (`33_ritorno.sql`). Si prova prima su PGlite.
- **Client:** tolte le riduzioni a it/en (cache `ga-push-config`, `p_locale`, `testoInviti`).
- **`push-helpers.js`:**
  - TESTI e TESTI_INVITO ricevono `es` e `fr`;
  - il controllo della lingua guarda la tabella giusta per ogni tipo;
  - il ternario «Un rituale / A ritual» passa nei testi.
- **`sw.js`:** il ripiego a due lingue (~140) passa dai testi di `push-helpers`. Si alza la versione: `ga-pwa-v13`, `push-helpers.js?v=13`. Effetto già noto: l'`activate` cancella anche la cache `ga-push-config`, che l'app riscrive alla prima apertura.
- **Funzioni del server:**
  - `notify-telepathy-invite` passa la lingua così com'è se è fra le quattro;
  - in `notify-ritual-start`, i TESTI duplicati non vengono letti da nessuno, perché il testo lo compone il telefono: al loro posto basta un elenco `LINGUE` usato come filtro. **Nessuna traduzione lato server.**
  - Tutte e due vanno ripubblicate (`scripts/deploy-push.js --solo …`).

### 3.6 Pagine e file statici
- **`regole.html`:**
  - la parte inglese diventa completa e uguale a quella italiana, e si aggiungono ES e FR, ognuna in una sezione con ancora (`#it`, `#en`, `#es`, `#fr`);
  - l'app apre `regole.html#xx`;
  - un piccolo script in linea mostra solo la sezione dell'ancora, con ripiego su `en`, e aggiorna `<html lang>` e `<title>`;
  - anche il piè di pagina «Torna all'app» va per lingua;
  - la CSP della pagina va controllata se esiste: `build.js` calcola gli hash solo per `app.html`.
- **`manifest.webmanifest`:** `description` in inglese, `lang: "en"`. Il nome resta com'è.
- `<html lang>` dell'app: lo aggiorna già l'effetto esistente.

## 4. Prove
- **Il browser di prova oggi parte nella lingua di sistema** (`it` su questo PC: `navigator.languages = ['it']`). Nessun `newContext` imposta `locale`.
  - Con il riconoscimento automatico, tutti i test UI partirebbero in italiano.
  - **Correzione in un punto solo:** `scripts/test-silenzioso.js`, che già intercetta `chromium.launch`, avvolge anche `browser.newContext`/`browser.newPage` e mette `locale: 'en-US'` quando il test non lo specifica.
  - Lo script viene caricato in ogni test (regola del progetto), quindi i test esistenti restano in inglese senza essere toccati.
- **Nuove:**
  - `test-lingue.js` (Node):
    - le quattro lingue hanno lo stesso insieme di chiavi di `en`;
    - array e funzioni hanno la stessa forma e lunghezza;
    - nessuna stringa vuota;
    - stessa verifica su `inviti-helpers`, compreso il ripiego chiave per chiave, e su `push-helpers`.
  - `test-notifiche-helpers.js`:
    - le sei forme nelle quattro lingue;
    - nickname con spazi;
    - un rituale con virgolette nel nome;
    - il ripiego sul testo grezzo.
  - `test-lingue-ui.js` (Playwright):
    - `locale: 'es-ES'` → app in spagnolo;
    - `de-DE` → inglese;
    - scelta FR dal menu → ricaricando resta FR;
    - una notifica italiana mostrata in francese;
    - in ES, scansione del testo visibile delle schermate principali alla ricerca di parole IT/EN note;
    - intestazione a 360 px senza sforare.
- **Da aggiornare:**
  - `test-push-rpc.js`: `es` e `fr` accettati, `de` ancora rifiutato.
  - `test-livelli.js` (~30) e `test-privacy.js` (~28): passano dal menu invece che dal pulsante a due stati.
  - `test-inviti-telepatia.js` (~361): cerca «rifiutato» nella pagina, e in inglese la campanella ora è tradotta.
  - `test-push-helpers.js` e `test-sw-inviti.js` per `?v=13` e le nuove lingue.
- **Da rilanciare** sul build finale: le prove dell'interfaccia (auth, account, rituali, inviti, moderazione, pwa, push).

## 5. Rilascio e ritorno
1. Una PR sola: app, helpers, sw, regole, migration 33_ e le due funzioni.
2. **Ordine obbligato:**
   1. Si applica la 33_.
   2. Si ripubblicano le due funzioni.
   3. Si fa il merge.
   L'app nuova ri-registra la push a ogni avvio e a ogni cambio di lingua. Senza la 33_, un telefono ES/FR riceverebbe «locale non valido», l'errore verrebbe inghiottito e l'interruttore resterebbe verde senza nessuna iscrizione sul server. Un'app vecchia ancora in cache manda sempre it/en, quindi con la 33_ non succede nulla.
3. **Ritorno:**
   - `33_ritorno.sql` rimette it/en; le iscrizioni es/fr già salvate tornano a `en`;
   - revert della PR;
   - le funzioni si ripubblicano dal commit precedente.
   Attenzione: dopo il ritorno, le app ES/FR ancora in cache (circa 10 minuti) falliscono la ri-registrazione in silenzio finché non si ricaricano.

## 6. Rischi
- **Traduzioni non rilette:** preparo un foglio di revisione con le quattro lingue una accanto all'altra, privacy compresa, da dare a una persona madrelingua per lingua prima della seconda ondata.
- **Telefono con la lingua impostata male:** si cambia dal menu e l'app la ricorda.
- **Peso:** circa 15 KB in più compressi, su circa 57.
