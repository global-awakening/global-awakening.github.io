# Rituali che si ripetono — design

29/09/2026 · ramo `feat/rituali-ricorrenti` · decisioni di Irene in brainstorming (§0) · rivista da
un revisore indipendente (§0.1)

## 0. Perché e cosa ha deciso Irene

Un amico di Irene, prete, dice ogni giorno la stessa preghiera alla stessa ora, e sa che altre
persone la dicono nello stesso momento. **Conta la sincronia**: sapere che altri, adesso, stanno
facendo la stessa cosa. Oggi un rituale dell'app è un evento unico, che finisce e viene cancellato.

| # | Domanda | Scelta |
|---|---|---|
| D1 | A cosa serve | Tutte e tre: **ricordarsi** (notifica), **sentirsi insieme** (presenza nell'istante), **stesso testo** (la preghiera sullo schermo) |
| D2 | Come si ripete | **Ogni giorno** oppure **giorni scelti della settimana**, sempre con una **data di fine** obbligatoria |
| D3 | Partecipare | Un solo «Partecipa» vale **per tutto il ciclo**, e c'è «Lascia» per uscire |
| D4 | Ora legale | L'ora resta **quella del creatore nel suo fuso** (la preghiera delle 7 resta delle 7 dopo il 25/10); l'istante è lo stesso per tutti nel mondo |
| D5 | Strada | **Una sola riga di rituale con la regola dentro**; le occorrenze si calcolano, non si copiano |

Default accettati: candele e presenze ripartono a ogni occorrenza; la scheda dice il prossimo
appuntamento e «giorno N di M»; durante il rituale il testo si legge in grande; il creatore può
fermare il ciclo; dopo l'ultima occorrenza il rituale sparisce come oggi; la descrizione (dove si
scrive la preghiera) sale da 500 a 5000 caratteri nel modulo.

## 0.1 Esito della revisione indipendente (29/09)

15 rilievi, tutti accolti; qui la traccia, il corpo è già aggiornato.

| # | Grav. | Rilievo | Dove si risolve |
|---|---|---|---|
| 1 | alta | `toggle_ritual_candle`/`create_ritual` restituiscono la riga di `rituals`: l'app la sostituisce a quella della vista e dal giorno 2 il rituale torna alla prima data (stanza chiusa, musica spenta) | §2.6: dopo ogni RPC che restituisce una riga, l'app rilegge quella riga dalla vista |
| 2 | alta | la data scritta nel modulo può non essere un giorno scelto → `date`/`time` non è un'occorrenza | §2.4 `create_ritual` riscrive `date`/`time` con la prima occorrenza vera |
| 3 | alta | `ferma_rituale` prima dell'inizio → nessuna occorrenza → vista con NULL, pulizia mai | §2.4 `not_started`; §2.2 e §2.3 ripiego sulle colonne originali; pulizia anche senza occorrenze |
| 4 | media | durata fino a 1440 min con ripetizione quotidiana → occorrenze sovrapposte, promemoria perso | §2.4 durata ≤ 720 per i ricorrenti |
| 5 | media | «giorno N di M» contraddittorio | §2.3 N = posizione dell'occorrenza corrente (in corso o prossima), da 1 |
| 6 | media | candele dei rituali singoli azzerate al primo tocco (NULL ≠ corrente) | §2.4: NULL vale «corrente», come nella vista |
| 7 | media | presenza senza scadenza, realtime a valanga, nessun tetto | §2.1 tabella `ritual_presence` separata con `visto_il`; conta chi è stato visto negli ultimi 60 s |
| 8 | media | ospiti: session_id pubblico → chiunque può toglierli, fermarli, iscriverli | §4 rischio accettato e dichiarato; tetto 10 cicli attivi per creatore |
| 9 | media | doppioni fra migration e ripubblicazione della funzione | §2.5 trigger che valorizza `occorrenza` quando arriva vuota |
| 10 | media | `test-partecipa-subito.js` intercetta `/rest/v1/rituals?*` e perderebbe la protezione | §5 aggiornare i pattern; controllare `test-push-ui.js` |
| 11 | media | una riga malformata spegnerebbe tutta la vista | §2.3 i singoli passano `date`/`time` originali; `to_char` con `AT TIME ZONE 'UTC'` |
| 12 | media | permessi: la policy è solo `TO anon`; ruolo di servizio; ricreabilità della vista | §2.3 grant ad anon, authenticated e al ruolo di servizio, `DROP VIEW IF EXISTS`, funzioni STABLE |
| 13 | media | sostituzione `create_ritual` | §2.4 in una transazione con `NOTIFY pgrst`; verificato dal catalogo: esiste solo la firma a 10 parametri |
| 14 | bassa | `?ritual=` e ripulitura dell'indirizzo | §1 |
| 15 | bassa | manca la prova del dedup al giorno 2 | §5 test del dedup per occorrenza |

## 1. Cosa vede chi usa l'app

**Chi crea.** Il modulo attuale guadagna un blocco «Si ripete»: *Una volta sola* (predefinito,
comportamento di oggi), *Ogni giorno*, *Giorni scelti* (sette interruttori Lun…Dom, almeno uno).
Se si ripete compare **«Fino al»** (data obbligatoria, non prima della data d'inizio, al massimo
366 giorni dopo) e la durata è al massimo 720 minuti. Il fuso non si chiede: lo dà il telefono
(`Intl.DateTimeFormat().resolvedOptions().timeZone`). La data scritta nel modulo vale come «a
partire da»: se non è uno dei giorni scelti, il primo appuntamento è il primo giorno scelto dopo.
La descrizione accetta 5000 caratteri, con un contatore visibile quando mancano meno di 500.

**Sulla scheda** di un rituale che si ripete, sotto il nome:
«🔁 Ogni giorno alle 07:00 · giorno 3 di 9» oppure «🔁 Lun, Mer, Ven alle 07:00 · giorno 2 di 12».
L'orario è quello di chi guarda; «giorno N» è la posizione dell'appuntamento mostrato (quello in
corso, o il prossimo). Stato e conto alla rovescia si riferiscono a quell'appuntamento.

**Pulsanti della scheda:**
- «Partecipa» come oggi; se già dentro e non si è il creatore, compare **«Lascia»**.
- Creatore, prima che il **primo** appuntamento inizi: il cestino di oggi (cancella tutto).
- Creatore, dopo, se il rituale si ripete e non è già fermato: **«Ferma»** con conferma («Il
  ciclo si ferma: non ci saranno altri appuntamenti. Quello in corso, se c'è, finisce
  normalmente.»).

**La stanza del rituale** (nuova): schermata a tutto schermo sopra l'app. Si apre:
- toccando una scheda quando il rituale è **in corso**;
- dalla notifica: l'app legge `?ritual=<id>` all'avvio, lo toglie subito dall'indirizzo
  (`replaceState`, come fa con `reset` e `magic`) e lo tiene in memoria; quando i rituali sono
  caricati (anche dopo un'eventuale entrata come ospite) apre la stanza se quel rituale è in corso,
  altrimenti non fa niente di speciale. Se l'id non esiste più, lo dimentica in silenzio.

Contiene: nome; **il testo della descrizione in grande**, a capo rispettati, scorrevole se lungo;
**«N persone qui adesso»**; il pulsante candela con quante candele sono accese in questo
appuntamento; la musica di oggi (la soglia «Tocca per entrare» resta il meccanismo di sblocco
audio); un pulsante per chiudere. Vale anche per i rituali singoli: è lo stesso momento. Quando
l'appuntamento finisce, la stanza si chiude da sola.

**Notifiche:** le due di oggi («sta per iniziare» da T-15, «sta iniziando ora» da T), **a ogni
appuntamento**, a chi partecipa.

## 2. Dati

### 2.1 Colonne e tabella nuove

Su `rituals` (tutte nulle per i rituali singoli, salvo `candles_occorrenza`):

| Colonna | Tipo | Significato |
|---|---|---|
| `ripeti_giorni` | `smallint[]` | giorni ISO 1=lun … 7=dom; NULL = non si ripete |
| `ripeti_fino` | `date` | ultimo giorno (nel fuso del creatore), incluso |
| `fuso` | `text` | nome IANA del fuso del creatore (es. `Europe/Rome`) |
| `ora_locale` | `time` | ora di inizio nel fuso del creatore |
| `data_inizio_locale` | `date` | giorno del primo appuntamento, nel fuso del creatore |
| `fermato_il` | `timestamptz` | se valorizzato, niente appuntamenti che iniziano dopo |
| `candles_occorrenza` | `timestamptz` | a quale appuntamento si riferisce `candles` (NULL = quello corrente) |

Tabella nuova **`ritual_presence`**: `ritual_id bigint REFERENCES rituals ON DELETE CASCADE`,
`session_id text`, `occorrenza timestamptz`, `visto_il timestamptz DEFAULT now()`, PK
`(ritual_id, occorrenza, session_id)`. RLS attiva, nessun permesso ad anon (si scrive e si conta
solo via funzioni). È separata apposta: aggiornare `rituals` ogni 30 secondi per ogni presente
farebbe ricaricare tutte le app collegate (canale realtime su `rituals`).

`date`/`time` restano in UTC e, per un rituale che si ripete, sono **il primo appuntamento vero**
(riscritti da `create_ritual`): così `delete_ritual` e il suo `already_started` restano corretti.
`ora_locale` e `data_inizio_locale` li calcola il server; il client non può mandare un'ora locale
che contraddice l'istante.

### 2.2 Gli appuntamenti: una sola funzione, fonte unica

Funzioni `LANGUAGE sql STABLE` (non SECURITY DEFINER), `EXECUTE` ad anon, authenticated e al ruolo di servizio:

`rituale_occorrenze(r rituals) RETURNS SETOF timestamptz` — tutte le partenze, in ordine:
- non si ripete → una sola, dalle colonne `date`/`time` UTC;
- si ripete → per ogni giorno `d` da `data_inizio_locale` a `ripeti_fino` con
  `extract(isodow from d) = ANY(ripeti_giorni)`: `(d + ora_locale) AT TIME ZONE fuso` (un
  `timestamp` senza fuso interpretato nel fuso del creatore → `timestamptz`); esclusi quelli con
  partenza `> fermato_il`.

Il cambio d'ora lo gestisce Postgres: il 26/10/2026 alle 07:00 di `Europe/Rome` è 06:00Z, il 24/10
è 05:00Z. Un'ora che non esiste (salto primaverile, 02:30) viene spostata da Postgres; lo
accettiamo e lo testiamo solo come «non esplode».

`rituale_occorrenza_corrente(r rituals) RETURNS timestamptz` → la prima partenza con
`partenza + durata > now()`; se tutte passate, l'**ultima**; se non ce n'è nessuna (non dovrebbe
accadere: vedi §2.4), NULL.

### 2.3 La vista `rituali_correnti` — il trucco che tiene fermo il resto

`DROP VIEW IF EXISTS` + `CREATE VIEW rituali_correnti WITH (security_invoker = true)` sopra
`rituals`, con **tutte le colonne di `rituals`**, dove:
- **rituale singolo**: `date`, `time`, `candles` passano così come sono (nessuna conversione:
  una riga malformata rompe solo la sua scheda, come oggi);
- **rituale che si ripete** con appuntamento corrente non NULL: `date` =
  `to_char(occ AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, `time` = `to_char(occ AT TIME ZONE 'UTC',
  'HH24:MI:SS')` → stessi formati testo di oggi, quindi `getRitualStatus`, `formatRitualWhen`,
  musica, soglia, `istanteInizio` della Edge Function funzionano **senza cambiare logica**;
  se l'appuntamento corrente è NULL, `date`/`time` originali;
- `candles` = `candles` se `candles_occorrenza` è NULL o uguale all'appuntamento corrente,
  altrimenti `'[]'`;
- colonne in più: `prima_date`, `prima_time` (le originali), `occorrenza_numero` (posizione da 1
  dell'appuntamento corrente fra tutti), `occorrenze_totali`, `presenti_ora` (quante righe di
  `ritual_presence` per questo rituale e l'appuntamento corrente hanno `visto_il > now() - 60 s`;
  calcolato da una funzione `SECURITY DEFINER` perché anon non legge la tabella).

`GRANT SELECT ON rituali_correnti TO anon, authenticated e al ruolo di servizio`. La policy di SELECT su
`rituals` è oggi solo `TO anon` (verificato dal catalogo): la vista con `security_invoker` vede
quello che vede chi la interroga, quindi a `authenticated` non mostra niente — come oggi la tabella.
L'app usa solo anon; la Edge Function usa il ruolo di servizio, che ignora le policy.

Limite dichiarato: fino a 367 righe generate per rituale ricorrente a ogni lettura. Ai volumi di
oggi (decine) è irrilevante.

### 2.4 Funzioni che cambiano o nascono (SECURITY DEFINER, `SET search_path = public`, grant ad anon)

- **`create_ritual`**: firma di oggi + `p_ripeti_giorni smallint[] DEFAULT NULL`,
  `p_ripeti_fino date DEFAULT NULL`, `p_fuso text DEFAULT NULL`. In **una transazione**: `DROP
  FUNCTION IF EXISTS` della firma a 10 parametri (unica esistente, verificato dal catalogo),
  `CREATE` della nuova, `GRANT`, `NOTIFY pgrst, 'reload schema'`. Con i default l'app vecchia
  continua a funzionare. Validazioni nuove (RAISE come le esistenti):
  `recurrence_incomplete` (i tre parametri non sono tutti NULL o tutti presenti);
  `recurrence_days_invalid` (vuoto, fuori 1..7, doppioni); `timezone_invalid` (non in
  `pg_timezone_names`); `recurrence_end_invalid` (`ripeti_fino` < giorno di partenza o > partenza
  + 366 giorni); `recurrence_duration_too_long` (durata > 720); `recurrence_empty` (nessun
  appuntamento, es. solo domenica dal lunedì al sabato); `recurrence_limit` (il creatore ha già 10
  rituali ricorrenti non finiti). Poi calcola il primo appuntamento vero dal giorno indicato in
  avanti e **riscrive `date`/`time`** con quello (UTC), e salva `ora_locale`/`data_inizio_locale`.
  Rate-limit e auth come oggi.
- **`leave_ritual(p_ritual_id bigint, p_session_id text, p_password_hash text) RETURNS void`**:
  toglie la sessione da `participants` e `candles` e le sue righe di `ritual_presence`. Il creatore
  non può lasciare (`creator_cannot_leave`). Auth condizionale come `create_ritual`: se la sessione
  appartiene a un profilo registrato, l'hash deve combaciare.
- **`ferma_rituale(p_ritual_id, p_session_id, p_password_hash) RETURNS bigint`**: stessi cancelli
  di `delete_ritual` (esiste, `not_creator`, `Auth failed` per i registrati; **per gli ospiti basta
  il session_id, come per `delete_ritual`**), poi `not_recurring`, `already_stopped`, `not_started`
  (il primo appuntamento non è ancora iniziato: si usa Cancella). Imposta `fermato_il = now()`.
- **`toggle_ritual_candle`**: se `candles_occorrenza` non è NULL ed è diverso dall'appuntamento
  corrente, azzera `candles`; imposta `candles_occorrenza` = appuntamento corrente; poi
  accende/spegne come oggi. Firma e ritorno invariati.
- **`segna_presenza_rituale(p_ritual_id bigint, p_session_id text) RETURNS int`**: solo mentre
  l'appuntamento corrente è in corso (`not_live`); upsert `(ritual_id, occorrenza, session_id)` con
  `visto_il = now()`; cancella le righe di quel rituale con occorrenza diversa; tetto 500 righe
  per rituale e appuntamento (`presence_full`, conteggio restituito comunque); session_id non
  vuoto, ≤ 255. Restituisce `presenti_ora`. La stanza la chiama all'apertura e ogni 30 s.
- **`get_ritual_occurrences(p_ritual_id bigint) RETURNS SETOF timestamptz`**: gli appuntamenti di
  un rituale (informazione pubblica); serve ai test.
- **`cleanup_expired_rituals`**: stessa firma e ritorno; cancella i rituali il cui appuntamento
  corrente (cioè l'ultimo, se tutti passati) è finito, **e** i ricorrenti senza nessun
  appuntamento. Per i rituali singoli il risultato è identico a oggi.

### 2.5 Notifiche: dedup per appuntamento

`ritual_notifications_sent` guadagna `occorrenza timestamptz NOT NULL DEFAULT 'epoch'`; `DROP
CONSTRAINT IF EXISTS ritual_notifications_sent_pkey` e nuova PK `(ritual_id, subscription_id,
kind, occorrenza)`. Un **trigger BEFORE INSERT** sostituisce `'epoch'` con l'appuntamento corrente
del rituale: la funzione vecchia, finché è pubblicata, scrive righe compatibili con quella nuova, e
non partono doppioni. Riempimento delle righe esistenti con `'epoch'` (idempotente: solo quelle).

Edge Function `notify-ritual-start`: legge da `rituali_correnti` invece che da `rituals` (stesse
colonne, stesso filtro ±1 giorno su `date`, che ora è l'appuntamento corrente) e mette
`occorrenza` = ISO della partenza nella prenotazione e nel rilascio (`.eq('occorrenza', …)`). Il
tag della notifica (`rituale-<id>-<tipo>`) resta: la notifica di oggi sostituisce quella di ieri.

### 2.6 App: una sola fonte per le righe

`loadData` legge da `rituali_correnti`. Dove oggi l'app sostituisce una riga con quella restituita
da una RPC (`createRitual` ~r.3000, candela ~r.3229, e ogni altro punto trovato con grep), rilegge
invece quella riga da `rituali_correnti` (`.eq('id', …)`) e sostituisce con quella. Un piccolo
helper `rileggiRituale(id)` evita di ripetere il codice.

## 3. Ordine di rilascio (ogni passo non rompe il precedente)

1. **Migration `28_rituali_ricorrenti.sql`** (additiva + firma di `create_ritual` con default + PK
   nuova col trigger), idempotente. La lancia Irene
   (`! node scripts/apply-sql.js supabase/sql/28_rituali_ricorrenti.sql`).
2. **Edge Function** ripubblicata (la lancia Irene se a me è bloccato).
3. **App** (PR su `main`, merge di Irene). Cache del service worker alzata.

Gli inviti di telepatia offline, in pausa, slittano a `29_`.

## 4. Errori, casi limite, rischi accettati

- Rituale ricorrente creato da un'app vecchia: impossibile (non manda i parametri).
- Il creatore sparisce e non ferma mai: il ciclo finisce comunque a `ripeti_fino` (≤ 366 gg).
- Appuntamento in corso quando il creatore ferma: finisce normalmente (partenza ≤ `fermato_il`).
- Fermato quando non ci sono più appuntamenti futuri: il corrente diventa l'ultimo passato → la
  pulizia lo cancella al giro successivo.
- Chi arriva in ritardo: la stanza è aperta finché l'appuntamento dura.
- `segna_presenza_rituale` fallisce (rete): la stanza mostra l'ultimo numero noto e riprova al
  giro successivo; nessun errore a tutto schermo per un contatore.
- **Rischio accettato (ospiti):** per gli ospiti il session_id è l'unica prova d'identità ed è
  pubblico (è in `participants` e in `profiles.session_id`). Chiunque sappia usare l'API può
  quindi togliere un ospite da un rituale, fermare il ciclo di un rituale creato da un ospite, o
  iscrivere un ospite a rituali altrui (come già oggi con `join_ritual`). Per i registrati serve
  la credenziale. È la stessa protezione che hanno oggi cancellazione e iscrizione; chiuderla
  richiede un'identità degli ospiti lato server ed è fuori da questo lavoro.
- Traduzioni IT/EN per ogni testo nuovo; errori delle RPC nuove col toast esistente.

## 5. Test (verde prima del merge; tutti con `NODE_OPTIONS="--require ./scripts/test-silenzioso.js"`)

- **`test-rituali-ricorrenti.js`** (RPC, database vero, chiave di servizio per preparare e
  pulire): creazione valida e ogni codice d'errore di §2.4; `date`/`time` riscritti sul primo
  giorno scelto; `get_ritual_occurrences` per ogni giorno, giorni scelti, fine inclusa, **cambio
  d'ora 25/10/2026 Europe/Rome** (07:00 locale = 05:00Z prima, 06:00Z dopo), `America/New_York`;
  vista: `date`/`time` = appuntamento corrente nei formati esatti, numero/totale, candele azzerate
  al cambio di appuntamento e **candele di un rituale singolo NON azzerate**, rituale singolo
  identico alla tabella; `leave_ritual` (sé, creatore rifiutato, auth per registrati);
  `ferma_rituale` (tutti i cancelli, effetto sugli appuntamenti); `segna_presenza_rituale`
  (not_live, idempotenza, scadenza 60 s simulata spostando `visto_il`); `cleanup_expired_rituals`
  (non tocca un ciclo con appuntamenti futuri, cancella uno finito, rituale singolo come oggi);
  **dedup per appuntamento**: due righe stesso rituale/abbonamento/tipo con appuntamenti diversi
  entrano, stessa occorrenza va in conflitto, riga con `'epoch'` diventa l'appuntamento corrente.
  Gli appuntamenti «in corso» o «passati» si ottengono spostando le colonne con la chiave di
  servizio, non aspettando.
- **UI Playwright** (`test-rituali-ricorrenti-ui.js`, server locale 4321): creare un rituale
  «giorni scelti»; la scheda mostra la riga 🔁 e «giorno 1 di N»; «Lascia» per un secondo utente;
  la stanza si apre toccando una scheda in corso e con `?ritual=<id>`, mostra il testo con gli a
  capo e «1 persona qui adesso»; **accendere la candela al giorno 2 lascia la stanza aperta e la
  scheda sul giorno 2**; «Ferma» per il creatore.
- **Regressione**: `test-rituali.js`, `test-rituali-cancellazione.js`,
  `test-rituali-cancellazione-ui.js`, `test-rituali-candele.js`, `test-rituali-validazione.js`,
  `test-rituali-impersonation.js`, `test-orari-rituali.js`, `test-partecipa-subito.js`
  (**pattern di intercettazione aggiornati alla vista**), `test-soglia-rituale.js`,
  `test-musica*.js`, `test-push-*.js` (controllare `test-push-ui.js` che scrive su `rituals`)
  verdi come prima.

## 6. Criteri di «fatto»

1. Migration 28_ idempotente (si rilancia senza errori) e applicata.
2. Tutti i test di §5 verdi; nessun test prima verde diventa rosso.
3. Revisione indipendente dell'intero ramo senza rilievi aperti di gravità alta o media.
4. `node build.js` senza errori; `app.js` rigenerato e committato; cache SW alzata.
5. Edge Function aggiornata e pubblicata; PR aperta su `main` con descrizione non tecnica; merge e
   passi sul database a Irene.

## 7. Fuori perimetro (non si fa)

Saltare un singolo giorno; ripetizioni mensili o «ogni N giorni»; cicli senza fine; modificare un
rituale dopo la creazione; elenco nominativo di chi è presente (solo il numero); notifiche a chi
non partecipa; statistiche di costanza; identità degli ospiti lato server; refactor della scheda o
della pagina rituali oltre il necessario.
