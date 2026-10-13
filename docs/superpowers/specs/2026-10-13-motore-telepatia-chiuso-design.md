# Motore della telepatia chiuso — design

Data: 2026-10-13 · Ramo: `feat/motore-telepatia-chiuso` · Migration: `39a_motore_telepatia.sql` (additiva) e `39b_chiudi_telepatia.sql` (chiusura), ognuna col suo `_ritorno`
Sotto-progetto 2 di «chiavi nascoste» (1 = chiavi, 36a/36b/37; 3 = Community, 38). Design approvato da Irene in chat il 13/10, a sezioni.

## Problema

Verificato sul DB vero il 13/10, in sola lettura:

| Tabella | Stato | Conseguenza |
|---|---|---|
| `telepathy_matches` | RLS accesa, ma con due policy `Allow all` (ALL, `true`). anon e authenticated hanno tutti i privilegi, TRUNCATE compreso | chiunque abbia la chiave pubblica legge, crea, modifica e cancella qualunque partita, o svuota la tabella |
| `telepathy_chat` | **RLS spenta**. Le tre policy presenti (basate su `auth.uid()`) non contano e comunque escluderebbero gli ospiti. Privilegi pieni, TRUNCATE compreso | le chat sono leggibili e scrivibili da tutti, e il mittente può firmarsi con qualunque nome |

Al 13/10 ci sono 0 partite e 28 messaggi di chat orfani (`match_id` è `text`, senza FK).

Ci sono altri due problemi nello stesso motore:
- **Sbircio.** Chi indovina riceve tutta la riga, `sender_symbol` compreso, prima di rispondere. Bastano gli strumenti del browser per barare, e i dati dell'indagine (`telepathy_trials`) ne escono inquinati.
- **`end_telepathy_match(p_match_id, p_ended_by)`** è SECURITY DEFINER e non verifica chi la chiama: chiunque può chiudere qualunque partita a nome di chiunque.

L'app tocca le due tabelle in circa 30 punti (`src/app.jsx`), tutti con accesso diretto e polling ogni 2–3 s. Non usa il realtime: `channel()` del client in `app.html` è finto.

## Obiettivo

Partite e chat sono leggibili e modificabili **solo dai due giocatori**, e solo tramite RPC SECURITY DEFINER che verificano l'identità. Chi indovina vede il simbolo solo dopo aver risposto. Per chi gioca **il comportamento non cambia**: stessi tempi, stessi turni, stesso polling.

## Approccio scelto

Funzioni-guardiano sul server, che ricalcano le operazioni di oggi. La logica di tempo del client resta dov'è: avanzamento del round dopo 4 s a cura di chi manda, cambio di livello ogni 7 round, uscita dopo 90 s di stallo, `checkPartnerLeft`. Si sono scartate due alternative: il motore tutto sul server (cambia il gioco, troppo rischio) e la chiusura in un passo solo (romperebbe le schede aperte durante il rilascio).

## Identità e regole comuni

- Ogni RPC riceve `p_session_id` e `p_password_hash`, verificati con `telepatia_verifica_identita`. Per gli ospiti vale la stessa regola già in uso nelle RPC degli inviti.
- «Sono un giocatore di questa partita» significa `id_pubblico(p_session_id)` uguale a `user1_id` o `user2_id`.
- Chi non è un giocatore riceve la stessa risposta di una partita inesistente (`null`, oppure `ok:false, motivo:'non_trovata'`), così non si scopre se l'id esiste.
- **Ruolo effettivo** = il ruolo base, scambiato ogni 3 round: lo stesso `roleForRound` dell'app (`floor(round/3) % 2`), portato in SQL in una funzione interna.
- Le RPC di lettura usate dal polling non sollevano mai errori (stessa regola di `chiavi_chi_sono`): in caso di problemi restituiscono `null`.
- Ogni RPC scrittrice aggiorna `ultima_attivita` e `giocato` come oggi: il trigger 32a resta e scatta da solo.

## Funzioni (39a)

I nomi sono indicativi e li fissa il piano.

| Momento | RPC | Regole sul server |
|---|---|---|
| «Mi hanno abbinato?» | `partita_mia` | Restituisce la mia partita non chiusa (vista filtrata, sotto) oppure `null`. Sostituisce i SELECT di tutta la tabella in `findPartner` |
| Abbinamento dalla coda | `partita_crea_da_coda(…, p_altro_id_pubblico)` | L'altro deve essere in `telepathy_queue`, fresco (stessa finestra di 60 s di `coda_leggi`). Nessuno dei due deve avere partite vive (`telepatia_in_training`), e fra i due non ci deve essere un blocco. Il server sorteggia ruoli opposti, prende i nickname verificati e inserisce la riga. Più chiamate concorrenti generano **una sola** partita: lock sulla coppia, o `ON CONFLICT` su `telepathy_matches_pair_unique` con restituzione della partita esistente. Prima dell'insert il server toglie le partite chiuse della stessa coppia (oggi lo fa il client) |
| Invito accettato | `respond_telepathy_invite` con `p_accept=true` e `p_match_id` **null** | Il server crea la partita (user1 = chi invita, user2 = chi accetta, `da_invito=true`, ruoli sorteggiati) e la collega all'invito. Il ramo con `p_match_id` valorizzato resta in 39a per le app vecchie, si toglie in 39b |
| Entra chi ha invitato | `partita_entra(…, p_match_id)` | Il «tocco» che oggi fa l'update finto di `round_count`: segna `giocato` e restituisce la vista |
| Stato (polling) | `partita_stato(…, p_match_id)` | Vista filtrata, oppure `null` se la riga non c'è più (l'app oggi tratta la riga sparita come «partita finita»: il comportamento resta) |
| Simbolo | `partita_simbolo(…, p_match_id, p_simbolo, p_livello)` | Solo chi manda nel round corrente, solo se `sender_symbol` è vuoto e la partita è aperta. Chi manda non può cambiare il simbolo nello stesso round |
| Risposta | `partita_ipotesi(…, p_match_id, p_ipotesi)` | Solo chi indovina nel round corrente, solo dopo il simbolo, una volta per round |
| Round successivo | `partita_avanza(…, p_match_id, p_round_atteso)` | Solo chi manda, solo con simbolo e risposta entrambi presenti, e solo se `round_count = p_round_atteso`, perché un doppio invio non deve saltare un round. Fa `round_count+1` e azzera simbolo e risposta |
| Cambio di livello | `partita_livello(…, p_match_id, p_livello, p_scelta)` | Solo un giocatore. Il chooser lo decide oggi il client: il server verifica solo la partecipazione e il formato (`level` fra i valori ammessi, `p_scelta` di forma `rN`) |
| Uscita | `partita_esci(…, p_match_id)` | Solo un giocatore. Imposta `ended_at`/`ended_by` (il proprio id pubblico, con coalesce come oggi). La cancellazione della riga resta differita: avviene con la pulizia, così l'altro lato vede `ended_at` e non una riga sparita di colpo. Va bene anche chiamata con `fetch keepalive` alla chiusura della scheda |
| Chat: scrivi | `chat_scrivi(…, p_match_id, p_testo)` | Solo un giocatore di una partita aperta. Il `sender_name` lo mette il server, dal nickname verificato. Lunghezza del testo limitata (il limite lo fissa il piano, guardando l'app) |
| Chat: leggi | `chat_leggi(…, p_match_id)` | Solo un giocatore. Messaggi in ordine di `created_at`, con le stesse colonne che l'app usa oggi |

**Vista filtrata** di una partita: le colonne che l'app usa oggi (id, created_at, user1/2_id, nickname, ruolo, level, round_count, level_change_choice_sender, sender_symbol, receiver_guess, ended_at, ended_by, giocato, da_invito). Unica eccezione: **`sender_symbol` vale `null` per chi indovina nel round corrente finché `receiver_guess` è vuoto**. A chi manda e, dopo la risposta, a entrambi arriva il valore vero. `checkSenderSent` oggi legge proprio il simbolo per sbloccare la griglia: la vista aggiunge quindi un booleano `simbolo_inviato`, e l'app nuova usa quello.

**Pulizia.** Le tre pulizie che oggi fa `findPartner` sulle partite di chiunque (chiuse da più di 60 s, ferme da 10 minuti, mai giocate da più di 5 minuti) le fanno le RPC stesse (`partita_mia`, `partita_crea_da_coda`), come già fa `coda_leggi` con la coda. Non si aggiungono job cron. Se nessuno gioca, una partita chiusa e la sua chat restano finché arriva il prossimo giocatore: dopo 39b sono comunque illeggibili da fuori, quindi va bene.

**Chat legata alla partita.** In 39a si cancellano i messaggi orfani, `telepathy_chat.match_id` diventa `uuid` e si aggiunge una FK verso `telepathy_matches(id)` **ON DELETE CASCADE**. Le app vecchie inviano `match_id` come stringa uuid: PostgREST la converte, quindi continuano a funzionare.

## App (stesso rilascio di 39a)

- Tutti gli accessi diretti a `telepathy_matches` e `telepathy_chat` in `src/app.jsx` passano alle RPC qui sopra, compresi il DELETE `keepalive` di `beforeunload` (→ `partita_esci`) e le cancellazioni di chat e partita in `endSession`/`resetTelepathy` (→ `partita_esci`; la cancellazione la fa il server). Al rilascio di 39a nel codice non deve restare **nessun** `from('telepathy_matches')` o `from('telepathy_chat')`.
- `end_telepathy_match` non si chiama più: al suo posto c'è `partita_esci`.
- In `accettaInvito` l'insert della partita sparisce: si chiama `respond_telepathy_invite` senza `p_match_id` e si usa la partita restituita.
- Il balletto anti-doppione di `findPartner` (insert fallito, «vince la più vecchia», delete dei duplicati) sparisce: ci pensa `partita_crea_da_coda`.
- La logica di gioco e i tempi restano invariati.

## Chiusura (39b, almeno 10 minuti dopo il rilascio dell'app)

- `telepathy_matches`: si tolgono le due policy `Allow all` e si fa REVOKE ALL ad anon e authenticated. RLS resta accesa, senza policy.
- `telepathy_chat`: si tolgono le tre policy `auth.uid()`, si accende la RLS e si fa REVOKE ALL ad anon e authenticated.
- `end_telepathy_match`: REVOKE EXECUTE ad anon e authenticated (resta solo per il server).
- `respond_telepathy_invite`: il ramo con `p_match_id` passato dal client non si accetta più.
- Effetto accettato: chi ha l'app aperta da prima del rilascio trova la telepatia ferma finché non ricarica (stesso compromesso di 36b/37b).

Ogni migration ha il suo `_ritorno.sql`: 39b_ritorno riapre i privilegi e le policy di oggi, 39a_ritorno toglie le RPC nuove e rimette `match_id` a text senza FK.

## Verifica (criteri di «fatto»)

1. **PGlite** (`scripts/pg-locale.js`, nuovo `test-motore-telepatia-sql.js`): un estraneo non ottiene niente da nessuna RPC. Turni rispettati. Simbolo nascosto a chi indovina fino alla risposta. Simbolo non modificabile dopo la risposta, né risposta prima del simbolo. `partita_avanza` idempotente. Due `partita_crea_da_coda` concorrenti producono una partita sola. Blocco rispettato. Chat cancellata a cascata. `sender_name` imposto dal server. Pulizie. Invito senza `p_match_id` crea la partita. Dopo 39b: anon riceve 42501 su entrambe le tabelle e su `end_telepathy_match`.
2. **App locale**, Playwright con due Chrome nascosti (`NODE_OPTIONS="--require ./scripts/test-silenzioso.js"`): `test-telepathy.js` (partita completa, chat compresa), `test-telepathy-gating.js`, `test-telepathy-session-end.js` adeguato, `test-inviti-telepatia.js`, `test-inviti-offline-ui.js`, tutti verdi. Le pulizie dei test usano la chiave di servizio.
3. **Sito vero dopo 39a**: le stesse prove UI contro il sito (preload in scratchpad), e una nuova `scripts/sonda-telepatia.js`. Con la chiave pubblica prova SELECT, INSERT, UPDATE, DELETE e TRUNCATE (via REST) su partite e chat, e `end_telepathy_match` su una partita altrui: prima di 39b le falle escono come ⏳ note.
4. **Sito vero dopo 39b**: `sonda-telepatia.js --dopo-39b` con zero falle. Prove UI di telepatia, inviti, presenze e rituali verdi. `sonda-chiavi --dopo-37b` e `sonda-community --dopo-38` ancora verdi.
5. **Revisione indipendente** con un agente separato prima del merge: 0 Critical/Important aperti.
6. **Controllo finale nel Chrome di Irene** (estensione): si apre il sito vero e si guarda che la telepatia si carichi e parta con un secondo giocatore pilotato da un Chrome nascosto. Si usa un account di prova, mai l'account di Irene, e non si invia nulla a persone vere.

## Fuori scopo

- Il registro dei tentativi dell'indagine (`log_telepathy_trial`) resta scritto dal client di chi indovina: chi vuole falsificarlo deliberatamente può ancora farlo. Passo successivo naturale: farlo scrivere a `partita_ipotesi`.
- La logica di tempo e di abbinamento resta lato client. Niente realtime.
- Nickname libero nei post della Community e commenti senza FK sul post (annotati il 12/10).
- `apply_level_change_if_both_agree` (03), non più usata: si lascia com'è, se ne valuta la rimozione a parte.
- Nessun refactor di `app.jsx` oltre agli accessi elencati.
