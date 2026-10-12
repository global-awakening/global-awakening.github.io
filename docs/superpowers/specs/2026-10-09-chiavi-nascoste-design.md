# Chiavi nascoste — design

Data: 2026-10-09 · Ramo: `feat/chiavi-nascoste` · Migration: `36a_chiavi_server.sql` (additiva) e `36b_chiudi_chiavi.sql` (chiusura), ognuna col suo `_ritorno`
Segue «notifiche chiuse» (35a/35b, live il 09/10). Irene: autonomia con le opzioni consigliate.

## Problema

Per un ospite il `session_id` è l'intera credenziale: chi lo conosce può agire a suo nome nelle
RPC che chiedono solo quello (unirsi o lasciare un rituale, segnare la presenza, accettare inviti,
leggere le sue notifiche). Oggi quel valore è leggibile da chiunque abbia la chiave pubblica,
in sei punti (verificato sul DB vero il 09/10 con `has_table_privilege` + policy):

| Dove | Colonna | Accesso anon oggi |
|---|---|---|
| `online_users` | `id` = session_id | policy `allow all`: lettura **e** scrittura (presenze falsificabili) |
| `telepathy_queue` | `id` = session_id | policy `allow all`: lettura e scrittura |
| `telepathy_matches` | `user1_id`, `user2_id` | policy `allow all`: lettura e scrittura |
| `rituals` e vista `rituali_correnti` | `creator_id`, `participants[]`, `candles[]`, chiavi di `candles_nomi` | lettura pubblica (scrittura solo via RPC) |
| RPC degli inviti (`aggiornaInviti`, `respond_telepathy_invite`) | `from_id` restituito a chi riceve | consegnato al destinatario dell'invito |

L'app usa il session_id anche come **identità pubblica**: confronta `participants.includes(sessionId)`,
`creator_id === sessionId`, `user1_id === sessionId`, e passa `partner.id` (preso da `online_users`)
agli inviti e alle partite. Il valore è sempre lo stesso: la chiave fa anche da nome.

## Obiettivo

1. Nessun session_id altrui è leggibile con la chiave pubblica: né da tabelle o viste, né nelle
   risposte delle RPC.
2. L'app continua a riconoscere «io» e «l'altro» (nei rituali, nelle presenze, nella coda, nelle
   partite e negli inviti) tramite un **id pubblico** che non permette di risalire alla chiave.
3. Presenze e coda non si possono più falsificare: si scrivono solo dal server, a nome di chi
   chiama, con il nome verificato.

## Id pubblico

- `id_pubblico(sid text) RETURNS text` = `'pub_'` seguito dai primi 32 caratteri esadecimali di
  `sha256(segreto || convert_to(sid, 'UTF8'))` in esadecimale (36 caratteri in tutto). Si usa `sha256()`
  di Postgres e non `extensions.hmac` perché PGlite, il Postgres delle prove locali, non ha pgcrypto: così
  si prova lo stesso codice che va online. Con un segreto di 32 byte in testa la forza bruta non è possibile. Il prefisso lo rende inconfondibile con
  un session_id: sul DB vero ce ne sono di 8, 32 e 33 caratteri. Il segreto è una riga nuova di `app_secrets`
  (`nome = 'id_pubblico_salt'`, 32 byte casuali generati nella 36a con `gen_random_uuid()` concatenati, mai fuori dal DB). Stesso
  schema della 26 (`login_salt`).
- Perché un segreto e non un semplice sha256 del session_id: ci sono session_id legacy di 8 caratteri. Un hash puro
  di 8 caratteri si rovescia per forza bruta in pochi minuti; con il segreto lato server, no.
- `STABLE` (legge `app_secrets`), SECURITY DEFINER, **non** concessa ad anon. NULL in ingresso → NULL.
  Un valore che inizia con `pub_` dà NULL: non è un session_id valido. Altrimenti chi si sceglie come
  session_id `pub_<id di un altro>` assumerebbe la sua identità pubblica (e riceverebbe i suoi inviti).
  Per lo stesso motivo le RPC nuove rifiutano un `p_session_id` che inizia con `pub_`.
- RPC pubblica `mio_id_pubblico(p_session_id text) RETURNS text`: l'app la chiama una volta
  all'avvio (e a ogni cambio di sessione) e tiene il valore in memoria (`myPublicId`).
  Non è un oracolo utile: dà l'id pubblico di una chiave che si conosce già.
- I dati salvati **non cambiano**: `rituals.participants`, `creator_id`, `online_users.id`,
  `telepathy_queue.id` restano session_id, e quindi `join_ritual`, `create_ritual`,
  `notify-ritual-start`, `delete_my_account` ed `export_my_account` restano come sono.
  L'id pubblico si calcola solo **in uscita**. Fa eccezione `telepathy_matches`, che l'app scrive da sé:
  vedi sotto.

## Identità di chi scrive

Per presenze e coda vale la regola della 35a: `notifica_chi_sono(sid, hash, nick)` restituisce il
nickname effettivo (registrato: password verificata e nome del profilo; ospite: `nome_pubblico`).
Se l'identità non regge, la RPC non scrive e restituisce la lista senza di me.

## Funzioni (SECURITY DEFINER, `search_path = public, pg_temp`, GRANT ad anon solo le pubbliche)

### Presenze
- `aggiorna_presenza(p_session_id, p_password_hash, p_nickname, p_lat, p_lng) RETURNS jsonb`
  - upsert della mia riga in `online_users` (id = sid, nickname = nome verificato, last_seen = now());
  - cancella le righe più vecchie di 2 minuti (stessa finestra di oggi);
  - restituisce `[{id, nickname, lat, lng, last_seen, busy}]` con `id = id_pubblico(online_users.id)`.
    `busy` = è in una partita viva (`telepathy_matches` con `ended_at` nullo), calcolato sul server:
    toglie all'app la lettura di `telepathy_matches` fatta solo per questo.
  - Tetto: chiamata ogni 4 s, nessun anti-raffica oltre l'upsert (una riga per sid).
- `esci_presenza(p_session_id, p_password_hash) RETURNS void`: cancella la mia riga (all'uscita).
- `presenza_di(p_id_pubblico text) RETURNS timestamptz`: `last_seen` della persona con quell'id
  pubblico, o NULL. Sostituisce le 3 letture `online_users.select('last_seen').eq('id', partner.id)`.

### Coda della telepatia (abbinamento casuale)
- `coda_entra(p_session_id, p_password_hash, p_nickname) RETURNS void`: upsert con nome verificato
  e timestamp attuale; pulisce le righe oltre 60 s (come oggi).
- `coda_esci(p_session_id, p_password_hash) RETURNS void`.
- `coda_leggi(p_session_id) RETURNS jsonb`: le altre righe in ordine di arrivo,
  `[{id: id_pubblico(id), nickname, timestamp}]`.

### Inviti
- Candidate dal catalogo live (09/10), da confermare sulle definizioni estratte:
  `get_my_telepathy_invites`, `get_telepathy_invite`, `respond_telepathy_invite`,
  `send_telepathy_invite`. Ogni `from_id`/`to_id` restituito diventa `id_pubblico(...)`. Quelle che
  già non restituiscono session_id (`get_invitable_users` dà un uuid di disponibilità) non cambiano.
- `telepatia_risolvi(p_disponibilita_id, p_session_online)`: `p_session_online` ora è l'id
  pubblico dell'altro, e si risolve con `id_pubblico(online_users.id) = p_session_online`.
  Fino alla 36b accetta **anche** un session_id grezzo, così l'app vecchia ancora in cache funziona.
  Ne beneficiano tutte le RPC che passano da lì (`send_telepathy_invite`, `block_telepathy_inviter`).
- `telepatia_in_training(p_session_id, p_escludi)` e `respond_telepathy_invite`: dove confrontano
  `telepathy_matches.user1_id/user2_id` con un session_id, confrontano con
  `id_pubblico(sid)` **oppure** sid (le due forme convivono fino alla 36b; dopo resta solo la prima).
  Le partite che `respond_telepathy_invite` crea, se le crea, usano gli id pubblici.
- Prima di ridefinire, estrarre le versioni live con `pg_get_functiondef` (lezione della 35a).

### Rituali
- Vista nuova `rituali_pubblici` (36a): stesse colonne di `rituali_correnti`, costruita sopra di
  essa, **senza** `security_invoker` (gira coi diritti del proprietario), con
  `creator_id = id_pubblico(creator_id)` e
  `participants` e `candles` mappati elemento per elemento (stesso ordine), `candles_nomi` con le
  chiavi mappate. Nomi di colonna
  invariati: l'app cambia solo il nome della vista letta e i confronti (con `myPublicId`).
- `rituali_correnti` resta com'è (`security_invoker`) per le funzioni interne; nella 36b anon perde
  il SELECT su di essa e su `rituals`, quindi non la legge più.
- Realtime: l'app ascolta `postgres_changes` su `rituals`. Dopo la 36b anon non legge più
  `rituals`, quindi l'evento non arriva: resta il giro ogni 10 s, più gli aggiornamenti immediati
  già fatti dall'app dopo le proprie azioni. Si toglie l'abbonamento (codice morto).

## Partite (`telepathy_matches`)

Resta aperta in scrittura: chiuderla vuol dire riscrivere il motore della telepatia (30 accessi
diretti), ed è il sotto-progetto successivo. Qui si cambia solo **cosa ci si scrive**:
l'app inserisce `user1_id/user2_id` = id pubblici (il mio `myPublicId`, quello dell'altro preso dalla
lista o dall'invito) e confronta con `myPublicId`. Nella 36b le righe esistenti con session_id
grezzi si convertono (`UPDATE … SET user1_id = id_pubblico(user1_id)` dove non inizia con `pub_`;
oggi sono 7 righe).
`log_telepathy_trial` riceve già `partner.id`: da qui in poi è l'id pubblico. Va bene così, perché in
`telepathy_trials` serve solo a raggruppare.

## Chiusura (solo in 36b, ≥10 min dopo il deploy)

- `online_users`, `telepathy_queue`: DROP delle policy `allow all`/`Enable all`, REVOKE ALL ad
  anon/authenticated (RLS resta accesa, nessuna policy).
- `rituals`: DROP della policy `rituals_select_public`, REVOKE ALL ad anon/authenticated.
- `rituali_correnti`: REVOKE ALL ad anon/authenticated (anon legge solo `rituali_pubblici`).
- Le RPC tolgono l'accettazione del session_id grezzo (`telepatia_risolvi`, confronti sulle partite).
- Conversione delle righe di `telepathy_matches`.
- `NOTIFY pgrst, 'reload schema'`.

## App (`src/app.jsx` → `node build.js`)

- `myPublicId` da `mio_id_pubblico` all'avvio e dopo ogni cambio di sessione (login, logout,
  ospite, merge). Finché non c'è, i confronti «io» restano falsi (nessun bottone sbagliato: al più
  un istante senza «sei iscritto»).
- Presenze: `updatePresence` → `aggiorna_presenza`; uscita → `esci_presenza`; le 3 letture del
  partner → `presenza_di`. Niente più lettura di `telepathy_matches` per `busy`.
- Coda: le 10 operazioni dirette su `telepathy_queue` → `coda_entra`/`coda_esci`/`coda_leggi`.
- Partite: ovunque l'app scrive o confronta `sessionId` con `user1_id/user2_id`, usa `myPublicId`.
- Rituali: lettura da `rituali_pubblici`; `participants.includes(sessionId)`, `candles.includes(sessionId)`,
  `candles_nomi[sid]` e `creator_id === sessionId` → `myPublicId`. Le RPC dei rituali continuano a ricevere `sessionId`.
- Le RPC continuano a ricevere il **mio** session_id: la chiave viaggia solo dal mio telefono al server.

## Prove

- **SQL locale (PGlite, `scripts/pg-locale.js`)**, `test-chiavi-nascoste-sql.js`:
  - `id_pubblico`: deterministica, `pub_` + 32 caratteri esadecimali, `pub_…` in ingresso → NULL, cambia col segreto, NULL→NULL,
    non eseguibile da anon;
  - presenze: scrivo solo la mia riga, col nome verificato (un nickname falso non passa); la lista
    non contiene alcun session_id; `busy` corretto; pulizia dei 2 minuti;
  - coda: entra/esci/leggi, nessun session_id in uscita;
  - inviti: `from_id` in uscita è pubblico; `telepatia_risolvi` accetta l'id pubblico (e il grezzo
    solo prima della 36b);
  - rituali: la vista non contiene session_id; dopo 36b anon non legge `rituals`;
  - 36b: anon riceve 42501 su `online_users`, `telepathy_queue`, `rituals`; righe di
    `telepathy_matches` convertite.
  - I test SQL esistenti restano verdi (`test-notifiche-chiuse-sql`, `test-inviti-offline-sql`,
    `test-rituali-ricorrenti-sql`, `test-candela-stanza-sql`, `test-lingue-push-sql`, `test-pg-locale`).
- **Interfaccia** (server locale con 36a live, poi sul sito vero dopo la 36b, con la tecnica delle copie
  in scratchpad): telepathy*, inviti-telepatia, inviti-offline-ui, rituali*, partecipa-subito,
  moderazione-ui, coscienza, account-gdpr, ospite-identita, merge-guest.
- **Sonda dal vivo** (`scripts/sonda-chiavi.js`, solo chiave anon): un ospite di prova si mette
  online, entra in coda, si unisce a un rituale; poi si leggono **tutte** le tabelle e viste
  leggibili da anon (elenco dal catalogo) e le RPC che restituiscono dati altrui: il suo session_id
  non deve comparire da nessuna parte. Pulizia finale.

## Criteri di «fatto»

1. La sonda dal vivo trova 0 occorrenze del session_id di prova.
2. REST anon: SELECT/INSERT/PATCH/DELETE su `online_users`, `telepathy_queue`, `rituals` → 42501.
3. Test SQL nuovi e vecchi verdi; suite UI sopra verdi sul sito vero.
4. Revisione indipendente (sub-agente) dell'intero ramo senza rilievi aperti.
5. 36a e 36b applicate nell'ordine, con i `_ritorno` pronti e provati in locale.

## Fuori scope (di proposito)

- **Motore della telepatia:** scritture libere su `telepathy_matches`, e `telepathy_chat` con RLS
  **spenta** (la chat fra due giocatori è leggibile da tutti). È il sotto-progetto 2, il più
  delicato.
- **Post e commenti** di Coscienza modificabili e cancellabili da chiunque (`allow all`; l'app fa
  solo insert e select): sotto-progetto 3, piccolo, PR a parte.
- Le chiavi **già esposte** finora restano note a chi le avesse raccolte. Ruotare i session_id degli
  ospiti romperebbe la loro identità (difetto chiuso con la PR #10). Rischio accettato: base utenti
  ancora di prova (6 profili).
- Nickname senza indice unico, profili legacy: decisioni di Irene, non toccate.

## Effetti visibili

Nessuno voluto. Due differenze minime: la lista dei rituali non si aggiorna più per evento
realtime ma col giro dei 10 s (le proprie azioni restano immediate); nei 10 minuti fra deploy e 36b
due telefoni con versioni diverse dell'app potrebbero non abbinarsi nel gioco casuale.
