# Rituali che si ripetono — design

29/09/2026 · ramo `feat/rituali-ricorrenti` · decisioni di Irene in brainstorming (vedi §0)

## 0. Perché e cosa ha deciso Irene

Un amico di Irene, prete, dice ogni giorno la stessa preghiera alla stessa ora, e sa che altre
persone la dicono nello stesso momento. **Conta la sincronia**: sapere che altri, adesso, stanno
facendo la stessa cosa. Oggi un rituale dell'app è un evento unico, che finisce e viene cancellato.

Decisioni (brainstorming 29/09):

| # | Domanda | Scelta |
|---|---|---|
| D1 | A cosa serve | Tutte e tre: **ricordarsi** (notifica), **sentirsi insieme** (presenza nell'istante), **stesso testo** (la preghiera sullo schermo) |
| D2 | Come si ripete | **Ogni giorno** oppure **giorni scelti della settimana**, sempre con una **data di fine** obbligatoria |
| D3 | Partecipare | Un solo «Partecipa» vale **per tutto il ciclo**, e c'è «Lascia» per uscire |
| D4 | Ora legale | L'ora resta **quella del creatore nel suo fuso** (la preghiera delle 7 resta delle 7 anche dopo il 25/10); l'istante è comunque lo stesso per tutti nel mondo |
| D5 | Strada | **Una sola riga di rituale con la regola dentro**; le occorrenze si calcolano, non si copiano |

Scelte di default accettate: candele e presenze ripartono a ogni occorrenza; la scheda dice il
prossimo appuntamento e «giorno N di M»; durante il rituale il testo si legge in grande; il
creatore può fermare il ciclo; dopo l'ultima occorrenza il rituale sparisce come oggi; la
descrizione (dove si scrive la preghiera) sale da 500 a 5000 caratteri nel modulo.

## 1. Cosa vede chi usa l'app

**Chi crea.** Il modulo attuale guadagna un blocco «Si ripete»:
- *Una volta sola* (predefinito, comportamento di oggi);
- *Ogni giorno*;
- *Giorni scelti*: sette interruttori Lun…Dom, almeno uno acceso.

Se si ripete, compare **«Fino al»** (data, obbligatoria, non prima della data d'inizio, al massimo
366 giorni dopo). Il fuso orario non si chiede: lo dà il telefono
(`Intl.DateTimeFormat().resolvedOptions().timeZone`). La descrizione accetta 5000 caratteri,
con un contatore visibile quando mancano meno di 500.

**Sulla scheda** di un rituale che si ripete, sotto il nome:
«🔁 Ogni giorno alle 07:00 · giorno 3 di 9» oppure «🔁 Lun, Mer, Ven alle 07:00 · giorno 2 di 12».
L'orario è quello di chi guarda (come oggi con `formatRitualWhen`); il conteggio conta le
occorrenze già iniziate, compresa quella in corso. Lo stato (conto alla rovescia / in corso)
si riferisce **all'occorrenza corrente** (quella in corso, o la prossima).

**Pulsanti della scheda:**
- «Partecipa» come oggi; se già dentro e non si è il creatore, compare **«Lascia»**.
- Creatore, prima che la **prima** occorrenza inizi: il cestino di oggi (cancella tutto).
- Creatore, dopo l'inizio della prima occorrenza di un rituale che si ripete: **«Ferma»** con
  conferma («Il ciclo si ferma: non ci saranno altri appuntamenti. Quello in corso, se c'è,
  finisce normalmente.»).

**La stanza del rituale** (nuova). È una schermata a tutto schermo sopra l'app che si apre:
- toccando una scheda quando il rituale è **in corso**;
- toccando la notifica: l'app legge `?ritual=<id>` dall'indirizzo (oggi lo ignora) e, appena il
  rituale è caricato, apre la stanza se è in corso, altrimenti porta sulla scheda.

Contiene: nome; **il testo della descrizione in grande**, a capo rispettati, scorrevole se lungo;
**«N persone qui adesso»**; il pulsante candela con il numero di candele accese in questa
occorrenza; la musica di oggi (la soglia «Tocca per entrare» resta il meccanismo di sblocco
audio); un pulsante per chiudere. La stanza vale anche per i rituali singoli: è lo stesso momento.

**Notifiche:** le due di oggi («sta per iniziare» da T-15, «sta iniziando ora» da T), **a ogni
occorrenza**, a chi partecipa.

## 2. Dati

### 2.1 Colonne nuove su `rituals` (tutte nulle per i rituali singoli)

| Colonna | Tipo | Significato |
|---|---|---|
| `ripeti_giorni` | `smallint[]` | giorni ISO 1=lun … 7=dom; NULL = non si ripete |
| `ripeti_fino` | `date` | ultimo giorno (nel fuso del creatore), incluso |
| `fuso` | `text` | nome IANA del fuso del creatore (es. `Europe/Rome`) |
| `ora_locale` | `time` | ora di inizio nel fuso del creatore |
| `data_inizio_locale` | `date` | primo giorno possibile, nel fuso del creatore |
| `fermato_il` | `timestamptz` | se valorizzato, niente occorrenze che iniziano dopo |
| `candles_occorrenza` | `timestamptz` | a quale occorrenza si riferisce `candles` |
| `presenti` | `jsonb` default `'[]'` | session_id presenti nell'occorrenza `presenti_occorrenza` |
| `presenti_occorrenza` | `timestamptz` | a quale occorrenza si riferisce `presenti` |

`date`/`time` restano, in UTC, e per un rituale che si ripete indicano **la prima occorrenza**
(così `delete_ritual` e il suo cancello `already_started` restano corretti senza modifiche).

`ora_locale` e `data_inizio_locale` li calcola **il server** da `date`/`time` UTC e `fuso`
(`((date||' '||time)::timestamp AT TIME ZONE 'UTC') AT TIME ZONE fuso`): il client non può
mandare un'ora locale che contraddice l'istante.

### 2.2 Le occorrenze: una sola funzione, fonte unica

`rituale_occorrenze(r rituals) RETURNS SETOF timestamptz` — tutte le partenze, in ordine:
- non si ripete → una sola: `(date||' '||time)::timestamp AT TIME ZONE 'UTC'`;
- si ripete → per ogni giorno `d` da `data_inizio_locale` a `ripeti_fino` con
  `extract(isodow from d) = ANY(ripeti_giorni)`: `(d + ora_locale) AT TIME ZONE fuso`; esclusi
  quelli con partenza `> fermato_il`.

Il cambio d'ora lo gestisce Postgres (`AT TIME ZONE` con nome IANA): il 26/10/2026 alle 07:00 di
`Europe/Rome` è 06:00Z, il 24/10 è 05:00Z. Un'ora che non esiste (salto primaverile, 02:30) viene
spostata da Postgres; lo accettiamo e lo testiamo solo come «non esplode».

`rituale_occorrenza_corrente(r, t)` → la prima occorrenza con `partenza + durata > t`; se non ce
n'è (tutte passate), l'**ultima**. Così «in corso / conto alla rovescia / finito» si calcola come
oggi, con un solo istante.

### 2.3 La vista `rituali_correnti` — il trucco che tiene fermo il resto

`CREATE VIEW rituali_correnti WITH (security_invoker = true)` sopra `rituals`, con **le stesse
colonne**, dove:
- `date`, `time` = l'occorrenza **corrente** in UTC, negli stessi formati testo di oggi
  (`YYYY-MM-DD`, `HH:MM:SS`) → `getRitualStatus`, `formatRitualWhen`, la musica, la soglia,
  `istanteInizio` della Edge Function e la pulizia funzionano **senza cambiare logica**;
- `candles` = `candles` se `candles_occorrenza` è NULL o uguale all'occorrenza corrente,
  altrimenti `'[]'`; `presenti` idem con `presenti_occorrenza`;
- colonne in più: `prima_date`, `prima_time` (le originali), `occorrenza_numero`,
  `occorrenze_totali` (int), `presenti_ora` (int, = lunghezza di `presenti` filtrato).

`GRANT SELECT` ad `anon, authenticated`. L'app legge da `rituali_correnti` al posto di `rituals`;
il canale realtime resta su `rituals` (le viste non emettono eventi) e continua a far ricaricare.

Nota: a 10 000 rituali la vista genera fino a 367 righe per rituale ricorrente a ogni lettura.
Ai volumi di oggi (decine) è irrilevante; è un limite dichiarato, non da ottimizzare ora.

### 2.4 Funzioni (tutte `SECURITY DEFINER`, `SET search_path = public`, grant ad anon)

- **`create_ritual`**: stessa firma di oggi + `p_ripeti_giorni smallint[] DEFAULT NULL`,
  `p_ripeti_fino date DEFAULT NULL`, `p_fuso text DEFAULT NULL`. Nello stesso file si fa
  `DROP FUNCTION` della firma a 10 parametri, altrimenti PostgREST trova due candidate e l'app
  vecchia (che manda 10 parametri) va in errore. Con i default l'app vecchia continua a funzionare.
  Validazioni nuove (RAISE come le esistenti): i tre parametri o tutti NULL o tutti presenti
  (`recurrence_incomplete`); giorni non vuoti, valori 1..7, senza doppioni (`recurrence_days_invalid`);
  fuso esistente in `pg_timezone_names` (`timezone_invalid`); `ripeti_fino` ≥ `data_inizio_locale`
  e ≤ `data_inizio_locale + 366` (`recurrence_end_invalid`); almeno una occorrenza
  (`recurrence_empty`: es. «solo domenica» dal lunedì al sabato). Rate-limit e auth come oggi.
- **`leave_ritual(p_ritual_id bigint, p_session_id text, p_password_hash text)`**: toglie la
  sessione da `participants`, `candles`, `presenti`. Il creatore non può lasciare
  (`creator_cannot_leave`: usa Cancella o Ferma). Auth condizionale come `create_ritual`: se la
  sessione appartiene a un profilo registrato, l'hash deve combaciare (i `session_id` sono
  leggibili da tutti nell'array `participants`, e togliere qualcuno gli spegnerebbe le notifiche).
- **`ferma_rituale(p_ritual_id, p_session_id, p_password_hash)`**: solo il creatore (stessi
  cancelli di `delete_ritual`: esiste, `not_creator`, auth), solo se si ripete (`not_recurring`),
  solo se non già fermato (`already_stopped`). Imposta `fermato_il = now()`.
- **`toggle_ritual_candle`**: se l'occorrenza corrente è diversa da `candles_occorrenza`, prima
  azzera `candles` e aggiorna `candles_occorrenza`, poi accende/spegne come oggi. Restituisce la
  riga come oggi (`SETOF rituals`).
- **`segna_presenza_rituale(p_ritual_id bigint, p_session_id text) RETURNS int`**: solo mentre
  l'occorrenza corrente è in corso (`not_live` altrimenti); azzera se è cambiata l'occorrenza;
  aggiunge la sessione (idempotente); restituisce il numero di presenti. Trustful come
  `join_ritual` (conta, non autorizza niente). Cap 255 sul session_id.
- **`get_ritual_occurrences(p_ritual_id bigint) RETURNS SETOF timestamptz`**: le occorrenze di un
  rituale (informazione pubblica); serve ai test e a eventuali usi futuri.
- **`cleanup_expired_rituals`**: stessa firma e ritorno; cancella i rituali la cui occorrenza
  corrente (cioè l'ultima, se tutte passate) è finita. Per i rituali singoli il risultato è
  identico a oggi.

### 2.5 Notifiche: dedup per occorrenza

`ritual_notifications_sent` guadagna `occorrenza timestamptz NOT NULL DEFAULT 'epoch'` e la chiave
primaria diventa `(ritual_id, subscription_id, kind, occorrenza)`. Nella stessa migration si
valorizzano le righe esistenti con la partenza del loro rituale (se il rituale esiste ancora),
così un rituale singolo già avvisato non riceve un doppione quando esce la funzione nuova.

Edge Function `notify-ritual-start`: legge da `rituali_correnti` invece che da `rituals` (stesse
colonne, stesso filtro ±1 giorno su `date`, che ora è l'occorrenza corrente) e scrive
`occorrenza` = ISO della partenza nella prenotazione e nel rilascio. Il payload aggiunge niente.
Il tag della notifica (`rituale-<id>-<tipo>`) resta: la notifica di oggi sostituisce quella di ieri.

## 3. Ordine di rilascio (ogni passo non rompe il precedente)

1. **Migration 28_** (additiva + firma di `create_ritual` con default + PK nuova con default):
   l'app online e la funzione di oggi continuano a funzionare. La lancia Irene
   (`! node scripts/apply-sql.js supabase/sql/28_rituali_ricorrenti.sql`).
2. **Edge Function** ripubblicata (`scripts/deploy-push.js` o comando equivalente; la lancia Irene
   se a me è bloccato).
3. **App** (PR su `main`, merge di Irene). Cache del service worker alzata.

Gli inviti di telepatia offline, in pausa, slittano a `29_`.

## 4. Errori e casi limite

- Rituale ricorrente creato da un'app vecchia: impossibile (l'app vecchia non manda i parametri).
- Il creatore lascia l'app e non ferma mai: il ciclo finisce comunque a `ripeti_fino` (≤ 366 gg).
- Occorrenza in corso quando il creatore ferma: finisce normalmente (partenza ≤ `fermato_il`).
- Fermato prima di qualunque occorrenza futura e nessuna in corso: la corrente diventa l'ultima
  passata → la pulizia lo cancella al giro successivo.
- Chi arriva in ritardo: la stanza è aperta finché l'occorrenza dura; poi la scheda mostra la
  prossima.
- `segna_presenza_rituale` fallisce (rete): la stanza mostra l'ultimo numero noto, riprova al
  giro di `loadData` (10 s); nessun messaggio d'errore a tutto schermo per un contatore.
- Traduzioni IT/EN per ogni testo nuovo; errori delle RPC nuove mostrati col toast esistente.

## 5. Test (verde prima del merge; tutti con `NODE_OPTIONS="--require ./scripts/test-silenzioso.js"`)

- **`test-rituali-ricorrenti.js`** (RPC, database vero, chiave di servizio per pulizia): creazione
  valida/non valida per ogni codice d'errore; `get_ritual_occurrences` per ogni giorno, giorni
  scelti, fine inclusa, **cambio d'ora 25/10/2026 Europe/Rome** (07:00 locale = 05:00Z prima,
  06:00Z dopo), fuso diverso (America/New_York); vista: `date`/`time` = occorrenza corrente,
  numero/totale, candele e presenze azzerate a occorrenza nuova (si simula spostando `date`/
  `ora_locale` con la chiave di servizio); `leave_ritual` (sé, creatore rifiutato, auth per
  registrati); `ferma_rituale` (cancelli, effetto sulle occorrenze); `segna_presenza_rituale`
  (not_live, idempotenza, conteggio); `cleanup_expired_rituals` non tocca un ciclo con occorrenze
  future e cancella uno finito; rituale singolo invariato in vista e pulizia.
- **`test-push-finestre.js`/nuovo unit** se cambia `finestre.mjs` (non previsto).
- **UI Playwright** (`test-rituali-ricorrenti-ui.js`, server locale 4321): creare un rituale
  «giorni scelti»; la scheda mostra la riga 🔁 e «giorno 1 di N»; «Lascia» appare e funziona per
  un secondo utente; la stanza si apre toccando una scheda in corso e con `?ritual=<id>`, mostra
  il testo con gli a capo e «1 persona qui adesso»; «Ferma» per il creatore.
- **Regressione**: `test-rituali.js`, `test-rituali-cancellazione.js`,
  `test-rituali-cancellazione-ui.js`, `test-rituali-candele.js`, `test-rituali-validazione.js`,
  `test-rituali-impersonation.js`, `test-orari-rituali.js`, `test-partecipa-subito.js`,
  `test-soglia-rituale.js`, `test-musica*.js`, `test-push-*.js` verdi come prima.

## 6. Criteri di «fatto»

1. Migration 28_ idempotente (si rilancia senza errori) e applicata.
2. Tutti i test di §5 verdi; nessun test prima verde diventa rosso.
3. Una revisione indipendente dell'intero ramo senza rilievi aperti di gravità alta o media.
4. `node build.js` senza errori; `app.js` rigenerato e committato; cache SW alzata.
5. PR aperta su `main` con descrizione non tecnica; merge e passi sul database a Irene.

## 7. Fuori perimetro (non si fa)

Saltare un singolo giorno; ripetizioni mensili o «ogni N giorni»; cicli senza fine; modificare un
rituale dopo la creazione; elenco nominativo di chi è presente (solo il numero); notifiche a chi
non partecipa; statistiche di costanza; refactor della scheda o della pagina rituali oltre il
necessario.
