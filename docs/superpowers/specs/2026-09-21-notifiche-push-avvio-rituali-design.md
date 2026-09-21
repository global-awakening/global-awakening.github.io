# Notifiche push di avvio rituale — design

**Data:** 2026-09-21
**Stato:** implementata sul ramo `feat/notifiche-push-rituali`, in attesa di deploy e prova dal vivo
**Piano:** `docs/superpowers/plans/2026-09-21-notifiche-push-avvio-rituali.md`

---

## 0. Correzioni emerse durante l'implementazione

Quello che la scrittura del codice ha smentito rispetto a questa spec. Un documento che
descrive un progetto diverso da quello costruito è peggio di nessun documento.

- **Gli hash CSP avevano già uno strumento.** §Task 1 del piano nasceva dalla convinzione che
  non esistesse: `buildCsp()` dentro `build.js` fa esattamente quel lavoro, normalizzazione
  CRLF→LF compresa. Lo strumento duplicato è stato rimosso.
- **`delete_my_account` va copiata da `18_moderazione_review.sql`, non da `17_`.** La 18 aveva
  ridefinito la funzione per non cancellare i blocchi *subiti* e chiudere un'evasione del
  blocco. Ripartire dalla 17 riapriva quel buco in silenzio; l'ha intercettato
  `test-moderazione.js`. Regola generale: per un `CREATE OR REPLACE`, cercare l'**ultima**
  migration che tocca quella funzione, non il file col nome che sembra giusto.
- **Postgres non accetta ripetizioni oltre 255 in una regex.** `{1,900}` dà *invalid repetition
  count(s)*: lunghezza e forma dell'endpoint sono due controlli separati.
- **Dopo una migration che crea RPC serve `NOTIFY pgrst, 'reload schema'`**, altrimenti
  PostgREST continua a rispondere 404 dalla cache.
- **Il modulo delle finestre è `.mjs`**, non `.js`: un file non può essere insieme CommonJS ed
  ESM, e Deno vuole ESM. I test node lo caricano con `import()` dinamico.
- **Il pre-commit hook è stato affinato**, non aggirato: il controllo sulla parola che nomina
  il ruolo di servizio ora ignora il solo nome della variabile d'ambiente. Prima rendeva non
  modificabili anche `send-magic-link` e `send-reset-email`.

---

## 0-bis. Esito della review indipendente

Un agente che non aveva scritto il codice ha esaminato l'intero ramo. Ogni rilievo è chiuso
con una correzione o con un motivo scritto — nessuno con un'opinione.

**Corretti**

| Rilievo | Cosa sarebbe successo | Dove |
|---|---|---|
| Soglia «10 fallimenti → cancella» | Dieci minuti di 500 da FCM cancellavano **tutti** gli abbonamenti vivi in finestra, per sempre. Un 403 da chiave VAPID ruotata faceva lo stesso. | `esito.mjs`, `index.ts` |
| «Doppio invio impossibile» era falso | La prenotazione veniva liberata anche su timeout: una consegna riuscita ma senza risposta veniva ripetuta fino a 15 volte. | `esito.mjs` |
| Endpoint = qualunque URL https | Il server chiamava in POST host scelti da estranei, una volta al minuto. | `24_push_hardening.sql` |
| Errore RPC ignorato dal client | Interruttore verde, nessun abbonamento sul server. | `src/app.jsx` |
| Config del service worker stantia | Al rinnovo dell'indirizzo si riscriveva il `sessionId` da ospite sopra quello giusto: notifiche mute, in silenzio. | `src/app.jsx` |
| Logout senza pulizia | Su un telefono condiviso, chi entra dopo riceve i rituali di chi è uscito, col nome in chiaro sulla schermata di blocco. | `src/app.jsx` |
| Interruttore senza guardia | `TypeError` su iPhone non installato: il bottone non faceva e non diceva nulla. | `src/app.jsx` |
| `PushHelpers` non protetto | Nessuna notifica mostrata ⇒ il browser mostra la sua generica ⇒ revoca del permesso. | `sw.js` |
| Sentinella cieca | `net.http_post` non aspetta la risposta: 401/404/500 della Edge Function risultavano `succeeded`. La sentinella non avrebbe visto il guasto più probabile. | `23_cron_push.sql` |
| Silenzi nel motore | Errore di lettura ⇒ «nessun abbonamento»; `.in()` con centinaia di partecipanti ⇒ 414 muto. | `index.ts` |
| Export GDPR incompleto | Gli abbonamenti non erano esportabili, solo cancellabili. | `24_push_hardening.sql` |
| Falso verde nel test UI | Restava verde con la RPC completamente rotta. | `test-push-ui.js` |

**Non corretti, con motivo**

- **Un `session_id` non è un segreto.** `rituals` ha una policy di SELECT pubblica e
  `participants` contiene i `session_id`: chiunque può registrare il proprio telefono sotto
  l'identità di un altro. Ci si guadagna poco — si ricevono i nomi di rituali a cui quella
  persona partecipa, informazione già pubblica nella stessa colonna — e la vittima continua a
  ricevere le sue notifiche, perché il conflitto è sull'endpoint. Una prova di identità vera
  non è possibile senza cambiare il modello: **gli ospiti partecipano ai rituali e non hanno
  credenziali**. Mitigato l'abuso su scala con un tetto di 10 abbonamenti per `session_id`.
- **La funzione è invocabile con la chiave anonima** (`verify_jwt` accetta il JWT `anon`, che è
  pubblico). Impatto: carico, non corruzione — la deduplicazione impedisce invii doppi e la
  funzione manda solo ciò che è già dovuto.
- **Chi partecipa da ospite e poi crea l'account** resta in `participants` col `sessionId`
  vecchio, mentre l'abbonamento passa al nuovo: per quel rituale non riceve notifiche. È un
  limite del modello di identità, non di questo lavoro.
- **`\r` nei file SQL**: falso allarme. I blob git hanno zero `\r` (verificato con
  `git show HEAD:<file> | grep -c $'\r'`); il CRLF è solo nella copia di lavoro su Windows.
  Aggiunto comunque un `.gitattributes` perché la regola non dipenda dalla configurazione della
  singola macchina.
- **Nessun test automatico del motore.** Girerebbe solo su Supabase e richiederebbe un servizio
  push vero. Estratta e testata la parte che decide se cancellare un abbonamento (`esito.mjs`,
  10 controlli): è la logica che può fare danni irreversibili. Il resto si verifica dal vivo.

---

## 1. Il problema

Global Awakening è costruita su rituali **sincroni**: il valore sta nell'essere presenti nello
stesso momento. Eppure oggi **nessuno viene avvisato quando un rituale inizia.**

Verificato nel codice e nel database il 21/09:

- `sw.js` non ha nessun handler `push` né `showNotification`;
- `src/app.jsx` non chiama mai `pushManager.subscribe`, non chiede il permesso notifiche, non
  ha chiavi VAPID;
- non esiste nessuna tabella di abbonamenti push;
- le notifiche esistenti (`telepathy_invite`, `ritual_join`, `ritual_comment`, `comment`) sono
  righe in `notifications` lette con un **poll ogni 10 secondi mentre l'app è aperta**
  (`src/app.jsx:2850`). Ad app chiusa non arriva niente.

Nessun tipo di notifica riguarda l'avvio di un rituale.

## 2. Quello che c'era già, e perché non serviva a niente

`supabase/functions/notify-ritual-participants/index.ts` (79 righe) sembrava un punto di
partenza. Non lo è: è **codice morto con tre bug sovrapposti**, e va cancellato.

1. Interroga `ritual_participants`, tabella **eliminata** da `08_drop_dead_tables.sql`
   (0 righe, mismatch `rituals.id` bigint vs `ritual_id` uuid ⇒ ogni INSERT dava 400).
2. Manda **email via EmailJS**, non push.
3. Usa un solo flag `notified`, che con due tipi di notifica non può funzionare.

Il calcolo degli orari (`${date}T${time}Z`) invece **è corretto**: il database tiene data e ora
in UTC e la PR #4 del 18/09 ha spostato la conversione di fuso sul contorno, lasciando il
database com'era.

### Il cron fantasma

Nel database c'è un cron job (`pg_cron` 1.6.4, già installato) che chiama quella funzione **ogni
5 minuti dal 17 aprile 2026**. Non era nel repo: viveva solo dentro Postgres.

```
esecuzioni: 33.615 — riuscite: 0 — ultima: 2026-09-21 08:20 UTC

ERROR:  invalid input syntax for type json
LINE 4:     headers := '{"Authorization": "Bearer
DETAIL:  Character with value 0x0d must be escaped
```

Un **ritorno a capo di Windows dentro la stringa JSON** degli header. Postgres si ferma sulla
sintassi prima ancora di tentare la chiamata — motivo per cui gli altri due problemi (`pg_net`
non installato, tabella inesistente) non sono mai emersi.

Cinque mesi di fallimenti invisibili, perché **i fallimenti di cron non arrivano da nessuna
parte**. Due conseguenze vincolanti per questo progetto:

- ogni pezzo di stato del database vive in una migration versionata in `supabase/sql/`, mai
  digitato una volta nello Studio;
- l'allarme sui fallimenti fa parte del lavoro, non è un extra (§8).

Il job è stato **disattivato** — non cancellato — da `20_spegni_cron_rotto.sql`.

## 3. Decisioni di prodotto

Prese da Irene durante il brainstorming del 21/09.

| Domanda | Scelta | Conseguenza tecnica |
|---|---|---|
| Chi riceve le push? | **Tutti, ospiti compresi** | L'abbonamento si lega al telefono (`sessionId`), non all'account |
| Quando suonano? | **Entrambe**: promemoria + avvio | Serve tracciare *quale* delle due è partita, non un sì/no |
| A chi arrivano? | **Solo a chi ha fatto «partecipa»** | Si legge `rituals.participants`; nessun broadcast |
| Quando si chiede il permesso? | **Al «partecipa»**, con doppio passaggio | Una nostra domanda in-app prima del popup del browser |

Il **doppio passaggio** è la decisione più importante del progetto. Il permesso del browser si
chiede **una volta sola**: un «no» è quasi definitivo, perché per tornare indietro la persona
deve andare a mano nelle impostazioni di sistema. Quindi prima chiediamo noi, dentro l'app, e
apriamo il popup vero **solo su un sì**. Così un rifiuto resta nostro e ri-proponibile, invece
di bruciare il permesso per sempre.

### Vincolo iOS

Su iPhone le push web funzionano **solo da iOS 16.4+ e solo se l'app è stata aggiunta alla
schermata Home**. In Safari non installato l'oggetto `Notification` non esiste: non possiamo
nemmeno chiedere. Il banner di installazione e le istruzioni «Apri in Safari» fatte il 18/09
diventano **presupposto tecnico delle notifiche**, non rifiniture.

## 4. Architettura

Approccio scelto: **`pg_cron` → Edge Function**.

```
  cron ogni minuto  (pg_cron, in una migration versionata)
        │  net.http_post   (pg_net, da installare)
        ▼
  Edge Function  notify-ritual-start   (Deno / TypeScript)
        │  1. quali rituali sono in finestra?
        │  2. quali partecipanti hanno un abbonamento?
        │  3. cosa è già partito?  →  ritual_notifications_sent
        │  4. firma VAPID + cifratura del contenuto
        ▼
  servizio push del browser  →  sw.js  →  notifica sul telefono
```

Scartati:

- **tutto in Postgres**: una push va firmata (ES256) e il contenuto cifrato (aes128gcm). In SQL
  puro è sproporzionato e fragile.
- **cron su GitHub Actions**: sarebbe versionato nel repo — il problema che ci è costato cinque
  mesi — ma i suoi cron arrivano in ritardo anche di dieci minuti. Su «il rituale sta iniziando
  **ora**» è un difetto che si sente. Il versionamento si ottiene comunque mettendo il comando
  del cron in una migration.

**Precisione attesa:** notifica entro ~1 minuto dall'orario del rituale, più i secondi di
consegna del servizio push. Sotto il minuto servirebbe pre-calcolare l'istante esatto di ogni
rituale: molto più complicato, scartato.

## 5. Dati — già applicati

`19_push_notifiche_rituali.sql`, applicata il 21/09 e verificata interrogando il database.

**`push_subscriptions`** — una riga per telefono/browser, non per persona.

| colonna | tipo | note |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | text | identità locale dell'app, ospiti compresi |
| `endpoint` | text UNIQUE | l'indirizzo che il servizio push consegna |
| `p256dh`, `auth` | text | chiavi di cifratura del destinatario |
| `locale` | text, default `en` | lingua della notifica |
| `created_at`, `last_seen_at` | timestamptz | |
| `failure_count` | integer | invii falliti consecutivi |

Indice su `session_id`, perché il motore parte dai partecipanti.

**Sicurezza:** chiunque legga `endpoint` + chiavi può mandare notifiche a quel telefono. RLS
attiva e **zero policy**: `anon` e `authenticated` non leggono e non scrivono. Ci arrivano solo
la Edge Function (con la **chiave di servizio**, che scavalca RLS) e la RPC `SECURITY DEFINER` di
registrazione. Verificato: `relrowsecurity = true` e `0` policy su entrambe le tabelle.

**`ritual_notifications_sent`** — PK composta `(ritual_id, subscription_id, kind)`,
`kind ∈ {reminder, start}`, cascade su `rituals` e su `push_subscriptions`.

Fa due lavori:

1. tiene separati promemoria e avvio, così il primo non zittisce il secondo;
2. **impedisce il bombardamento**: il cron gira ogni minuto e lo stesso rituale ricade nella
   finestra decine di volte. Senza questa tabella la stessa persona riceverebbe la stessa
   notifica sessanta volte di fila.

Non si ricrea `ritual_participants`: si legge la colonna `participants` (jsonb) che l'app usa
davvero.

## 6. Flusso nell'app

### Iscrizione, al tocco di «Partecipa»

1. **Push non supportate** (browser vecchio, o iPhone in Safari non installato) → si mostrano le
   istruzioni di installazione già esistenti. Nessun popup.
2. **Permesso mai chiesto** → nostra domanda in-app: *«Vuoi che ti avvisi quando inizia?»*
   - **Sì** → `Notification.requestPermission()`, e su concessione
     `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC })` →
     RPC `register_push_subscription(session_id, endpoint, p256dh, auth, locale)`, upsert su
     `endpoint`.
   - **No** → nessun popup. Si segna in `localStorage` e non si ri-chiede prima di **7 giorni**.
3. **Permesso già negato al browser** (`Notification.permission === 'denied'`) → non si chiede
   mai più; una riga nelle impostazioni spiega come riattivarle a mano.
4. **Permesso già concesso** → se un abbonamento valido esiste, si aggiorna solo `last_seen_at`.
   Se non esiste, la distinzione conta:
   - la persona aveva **spento l'interruttore** → non si fa niente. Uno spegnimento esplicito non
     si annulla da solo al prossimo «partecipa»; per riaccendere si usa l'interruttore. Lo si
     riconosce da un segno in `localStorage` scritto allo spegnimento;
   - **nessuno spegnimento esplicito** (il browser ha buttato via l'abbonamento da solo) → ci si
     ri-iscrive in silenzio, senza chiedere di nuovo nulla.

### Spegnimento

Interruttore nelle impostazioni: *«Avvisami quando inizia un rituale»*. Off →
`subscription.unsubscribe()` sul browser, RPC `delete_push_subscription(endpoint)` sul server, e
il segno in `localStorage` che rende lo spegnimento una scelta e non un incidente (§6.1.4).
Spegnere da un lato solo lascerebbe righe morte che continuano a ricevere.

### Tocco sulla notifica

`notificationclick` in `sw.js`: se una finestra dell'app è già aperta la mette a fuoco e la porta
al rituale; altrimenti apre `app.html?ritual=<id>`. Mai aprire una seconda finestra.

### Rinnovo

`pushsubscriptionchange` in `sw.js`: il browser può cambiare l'indirizzo da solo. All'evento ci
si ri-iscrive e si aggiorna la riga.

## 7. Il motore — `notify-ritual-start`

Nuova Edge Function. La vecchia `notify-ritual-participants` viene **cancellata** dal repo.

### Finestre a soglia, non a intervallo

```
reminder : now >= start - 15min   AND now < start
start    : now >= start           AND now < start + 5min
```

Soglie, non intervalli stretti: se un'esecuzione salta, quella dopo recupera invece di perdere la
notifica. È la tabella di dedup a rendere sicura la soglia larga.

Conseguenza sul testo: il promemoria dice *«sta per iniziare»* **senza il numero di minuti**. Chi
si iscrive cinque minuti prima dell'inizio è ancora dentro la soglia del promemoria, e «inizia
tra 15 minuti» sarebbe falso.

### Ordine delle operazioni

Si registra in `ritual_notifications_sent` **prima** di inviare, sfruttando la PK composta: se
l'INSERT va in conflitto, un'altra esecuzione ha già preso quella notifica e si salta. Un doppio
invio diventa **impossibile per costruzione**.

Se l'invio poi fallisce:

- **404 / 410** dal servizio push = abbonamento morto (telefono pulito, app disinstallata) → si
  **cancella** la riga in `push_subscriptions`; la riga di dedup sparisce in cascata;
- **429 / 5xx** = problema temporaneo → si **cancella la riga di dedup** e si incrementa
  `failure_count`, così il giro dopo riprova;
- `failure_count` oltre 10 → si cancella l'abbonamento.

Il rischio qui è asimmetrico: perdere una notifica è spiacevole, **bombardare qualcuno di
sessanta notifiche uguali lo fa spegnere le push per sempre** — e il permesso non torna. Nel
dubbio si perde la notifica.

### Chi partecipa si legge al momento dell'invio

`rituals.participants` viene letta quando il cron scatta, non quando la persona si iscrive: chi
lascia il rituale dopo essersi iscritto non riceve niente, senza codice dedicato.

### Segreti

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` come variabili d'ambiente della Edge
Function. La chiave **pubblica** serve anche al client e finisce nel build: è pubblica per
definizione. La privata non esce mai dal server.

La **chiave di servizio** con cui il cron chiama la funzione **non va scritta in chiaro nel
comando del cron**: si legge da Supabase Vault (`vault.decrypted_secrets`). Il comando del cron è
leggibile da chiunque abbia accesso al database.

## 8. Visibilità dei fallimenti

Il difetto che ha reso possibile questa storia non è il `\r`: è che **nessuno si accorge** quando
un cron fallisce. Senza questo pezzo, il prossimo guasto durerà altri cinque mesi.

Minimo indispensabile: un secondo cron, una volta al giorno, che conta i fallimenti in
`cron.job_run_details` nelle 24 ore e, se ce n'è anche solo uno, manda una email a
`global.awakening.app@gmail.com` con EmailJS (già configurato, `service_rk97p6m`).

**Fatto**, in `23_cron_push.sql`, job `allarme-cron-falliti`. Manda l'email solo se nelle ultime
24 ore c'è stato almeno un fallimento: un avviso che arriva tutti i giorni, dopo una settimana
non lo legge più nessuno. Richiede `emailjs_private_key` nel Vault.

## 9. Debito da chiudere in questo lavoro

**`delete_my_account` non conosce le tabelle nuove.** Chi cancella l'account lascerebbe un
abbonamento push attivo che continua a ricevere notifiche. Va aggiunto
`DELETE FROM push_subscriptions WHERE session_id = v_sid;` — il resto segue in cascata.

Richiede di riscrivere per intero una funzione `SECURITY DEFINER`, quindi si fa a vista e con i
test. È annotato in fondo a `19_push_notifiche_rituali.sql`. È la stessa classe di bug che a
settembre aveva lasciato «Elimina account» rotta da giugno.

## 10. Test

| Livello | Cosa si verifica |
|---|---|
| RPC | registrazione; seconda registrazione dello stesso `endpoint` → aggiorna, non duplica; cancellazione; `anon` non legge `push_subscriptions` |
| Logica pura | il calcolo delle finestre, estratto in un modulo puro, provato con orari fissi: T-16, T-15, T-1, T, T+4, T+6 |
| Dedup | due esecuzioni consecutive del motore sullo stesso rituale → **un solo** invio |
| Errori | 410 cancella l'abbonamento; 503 lascia la riga pronta al nuovo tentativo |
| UI (Playwright) | al «partecipa» compare la **nostra** domanda; su «No» il popup del browser **non** si apre; su «Sì» si chiama `subscribe`; l'interruttore nelle impostazioni disiscrive da entrambi i lati |
| Spegnimento esplicito | spento l'interruttore, un nuovo «partecipa» **non** ri-iscrive di nascosto |
| Regressione | rituali 18/18, musica 11/11, PWA 20/20, auth 11/11, moderazione 11/11 |

Il test che conta più di tutti è **«su No il popup non si apre»**: è la garanzia che non stiamo
bruciando il permesso delle persone.

## 11. Fuori scope

- Notifiche a chi **non** ha fatto «partecipa» (broadcast dei rituali nuovi). Valutabile dopo,
  come canale separato e volontario, spento di default.
- Notifiche per messaggi privati, inviti di telepatia, commenti: restano sul poll attuale.
- App nativa iOS. Discussa il 21/09: si resta PWA per il lancio, si rivaluta con i numeri.
