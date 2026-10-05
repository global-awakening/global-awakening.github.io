# Spagnolo e francese — design

Data: 2026-10-05 · Ramo: `feat/lingue-es-fr` · Stato: da approvare (Irene)

## 1. Perché e cosa vuol dire «fatto»

Il lancio arriva a ondate. La seconda (community spirituali su Facebook) e la terza (campagna mondiale) portano persone che non parlano italiano e spesso nemmeno inglese. Oggi l'app parla inglese e italiano, riparte sempre in inglese e non ricorda la scelta.

**Fatto quando:**
1. Una persona con il telefono in spagnolo o in francese apre l'app per la prima volta e la trova nella sua lingua, senza toccare nulla.
2. La lingua si cambia da un menu con quattro voci (EN, IT, ES, FR) e l'app la ricorda alla visita successiva.
3. Nelle quattro lingue sono tradotte la schermata d'ingresso, le sezioni, la telepatia, i rituali, i messaggi, la moderazione, la privacy, il regolamento, le notifiche push e le notifiche nella campanella. Nessuna frase a metà fra due lingue.
4. Date e orari seguono la lingua dell'app, non quella del browser.
5. Le prove esistenti restano verdi. Per le prove che contano sull'inglese all'avvio, il browser di prova è impostato in inglese.

**Cosa dice Irene:** ES e FR, dopo la chiave scaduta (02/10). Procedere in autonomia con le opzioni consigliate (05/10).
**Cosa assumo io:**
- Le traduzioni le scrivo io e vanno rilette da madrelingua prima della seconda ondata, perché il tono spirituale non si improvvisa.
- I nomi delle cose dell'app restano uguali in tutte le lingue: Global Awakening, starseed, i nomi dei livelli se sono nomi propri.

## 2. Cosa resta fuori (seconda parte, spec a sé)

- **Email di accesso** (link via email e reset password). Oggi i modelli stanno su EmailJS, solo in inglese, e la funzione del server non riceve la lingua. Tradurle significa creare modelli nuovi dal sito di EmailJS, un passo manuale. Per il lancio va bene l'inglese, che uno spagnolo o un francese che si registra capisce.
- **Messaggi di errore del server sulla moderazione**, che oggi compaiono in inglese tecnico in tutte le lingue: «cannot block yourself», «invalid_reason». Sono casi rari. Li si traduce dai codici in una passata a parte.
- **Avvisi all'amministratrice** (`alert-cron`): restano in italiano.
- Le parole del codice ospite (`aurora-lince-NNNN`) **non si traducono**: sono un'identità.

## 3. Come funziona

### 3.1 Scelta e memoria della lingua (`src/app.jsx`)
- `LINGUE = ['en', 'it', 'es', 'fr']`.
- **Lingua iniziale**, in quest'ordine:
  1. `localStorage.ga_lang`, se valida;
  2. altrimenti `navigator.languages` / `navigator.language`, guardando solo le prime due lettere, se è fra le quattro;
  3. altrimenti `en`.
  Ogni lettura e scrittura di `localStorage` sta in un try/catch.
- `setLang` salva in `ga_lang`.
- **Il pulsante 🌐 diventa un menu** (una `select` nativa: funziona bene sui telefoni, è accessibile e costa poco). Ogni voce mostra il nome della lingua nella lingua stessa: English, Italiano, Español, Français. Il menu sta negli stessi due punti di oggi: schermata d'ingresso e intestazione.
- **Ripiego:** l'oggetto `t` di ogni lingua nasce dall'inglese più la lingua sopra, con una fusione profonda fatta una volta sola all'avvio. Una chiave dimenticata mostra l'inglese invece di rompere la pagina.

### 3.2 Testi
- `translations` riceve i blocchi `es` e `fr` con le stesse 349 chiavi di `en`/`it`, comprese le tre funzioni (`dayOf`, `peopleHere`, `descCounter`) e i due array.
- Le circa 20 frasi scritte a mano fuori da `translations` vi entrano: alert, placeholder, title/aria-label, «Nessuna notifica», «Password», i nomi dei tipi di rituale. Fa eccezione `'Anonymous'` quando viene scritto sul database: resta com'è.
- Le frasi composte a pezzi, dove l'ordine delle parole cambia da lingua a lingua, diventano funzioni nella traduzione: `levelShapes`, `partnerOffline`, la data del rituale «quando + alle + ora», `starseedWaiting/s`.
- `inviti-helpers.js` riceve `es` e `fr` per tutte le chiavi; `testo()` ripiega già sull'inglese.

### 3.3 Date e orari
- `LOCALE = { en: 'en-GB', it: 'it-IT', es: 'es-ES', fr: 'fr-FR' }`. Prende il posto del ternario it/en in `formatRitualWhen` e `descriviRipetizione`.
- I `toLocaleTimeString()` / `toLocaleString()` senza locale ricevono `LOCALE[lang]`.

### 3.4 Notifiche nella campanella
Le righe di `notifications` contengono una frase italiana già composta. Lo fa il client per `ritual_join`, `ritual_comment` e `comment`, e lo fa il SQL per `private_message`, `telepathy_invite` e `telepathy_declined`.

**Scelta:** non tocco il database. L'app riconosce le sei forme italiane che conosce, ne estrae il nome e, quando c'è, il nome del rituale, e mostra la frase nella lingua dell'app (funzione pura `testoNotifica(n, lang)` in un file a sé, `notifiche-helpers.js`, provabile in Node). Se una riga non corrisponde a nessuna forma, si mostra il testo così com'è, come oggi.

**Perché così:** vale anche per le notifiche già salvate e non richiede migration né modifiche alle RPC. Il client continua a scrivere la frase in italiano: è la forma che il riconoscimento si aspetta.

### 3.5 Notifiche push
- **Database** (migration `33_lingue_push.sql`): la RPC `register_push_subscription` accetta `p_locale IN ('it','en','es','fr')`. Si ridefinisce partendo dal corpo in uso (24_). Serve anche un ritorno indietro (`33_ritorno.sql`). Si prova prima su PGlite.
- **Client:** tolte le riduzioni a it/en (cache `ga-push-config`, `p_locale`, `testoInviti`).
- **`push-helpers.js`:** TESTI e TESTI_INVITO ricevono `es` e `fr`. Il controllo della lingua guarda tutte e due le tabelle; il ternario «Un rituale» passa nei testi.
- **`sw.js`:** il ripiego a due lingue passa dai testi di `push-helpers`. Si alza la versione della cache (`ga-pwa-v13`, `push-helpers.js?v=13`), perché `push-helpers.js` è in cache-first.
- **Funzioni del server:** `notify-telepathy-invite` passa la lingua così com'è se è fra le quattro. `notify-ritual-start` riceve ES/FR nei suoi TESTI duplicati. Vanno **ripubblicate tutte e due** (`scripts/deploy-push.js --solo …`).

### 3.6 Pagine e file statici
- **`regole.html`:** la parte inglese diventa completa, uguale a quella italiana, e si aggiungono le parti ES e FR. La pagina mostra la sezione della lingua dell'app (`regole.html?lang=xx`, link da app.jsx), con ripiego sull'inglese.
- **`manifest.webmanifest`:** la `description` diventa in inglese, la lingua neutra; `lang: "en"`. Il nome non cambia.
- `<html lang>`: lo aggiorna già l'effetto esistente.

## 4. Prove
- **Nuove:**
  - `test-lingue.js` (Node, senza browser): le quattro lingue hanno lo stesso insieme di chiavi di `en`, le funzioni rispondono, nessuna stringa vuota. Stessa verifica su `inviti-helpers` e `push-helpers`.
  - `test-notifiche-helpers.js`: le sei forme in quattro lingue, più il ripiego sul testo grezzo.
  - `test-lingue-ui.js` (Playwright):
    - browser in `es-ES` → app in spagnolo;
    - browser in `de-DE` → inglese;
    - scelta FR dal menu → ricaricando resta FR;
    - una notifica italiana mostrata in francese.
- **Da aggiornare:**
  - `test-push-rpc.js`: `es` e `fr` accettati, `de` ancora rifiutato.
  - `test-livelli.js` e `test-privacy.js`: passano dal menu invece che dal pulsante a due stati.
  - Tutti i test Playwright che danno per scontato l'inglese all'avvio girano con `locale: 'en-US'`, che è già il default di Playwright: va controllato che lo sia davvero.
- **Da rilanciare** sul build finale: le prove dell'interfaccia (auth, account, rituali, inviti, moderazione, pwa, push).

## 5. Rilascio e ritorno
1. PR unica con app, helpers, sw e regole, insieme alla migration 33_ e alle due funzioni.
2. **Ordine:** prima la 33_ applicata. Altrimenti il telefono in spagnolo che si iscrive alle notifiche riceve «locale non valido» e resta senza push. Poi le due funzioni ripubblicate, poi il merge.
3. **Ritorno:** `33_ritorno.sql` (rimette it/en; le iscrizioni es/fr già salvate tornano a `en`), revert della PR, funzioni ripubblicate dal commit precedente.

## 6. Rischi
- **Traduzioni non rilette:** la prima versione la scrivo io. Prima della seconda ondata serve una lettura madrelingua. Per facilitarla preparo un foglio di revisione con le quattro lingue una accanto all'altra.
- **Telefoni con la lingua impostata male:** chi ha il telefono in inglese ma parla spagnolo cambia lingua dal menu e l'app la ricorda.
- **Peso:** circa 15 KB in più compressi su circa 57. Trascurabile.
