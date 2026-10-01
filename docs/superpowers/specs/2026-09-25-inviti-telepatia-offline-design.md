# Inviti a un training telepatico anche a chi non è collegato — design

*Aggiornata il 30/09/2026 dopo revisione indipendente.*
*Aggiornata di nuovo il 30/09/2026 dopo la seconda revisione indipendente e le risposte di Irene.*
*Aggiornata una terza volta il 30/09/2026 dopo la terza revisione indipendente (finestra della
32a, scadenza a 14 giorni, match «mai giocati», nomi degli ospiti nei blocchi).*
*Aggiornata il 01/10/2026 con le divergenze decise durante l'implementazione: sono segnate nel
testo con «Deciso in implementazione (01/10/2026)» (§2.5, §4.1, §4.2, §4.4, §5).*

**Data:** 2026-09-25 (prima stesura), 2026-09-30 (tre aggiornamenti)
**Stato:** spec rivista tre volte; piano in `docs/superpowers/plans/2026-09-30-inviti-telepatia-offline.md`
**Ramo:** `feat/inviti-telepatia-offline`
**Decisioni di prodotto:** prese da Irene nel brainstorming del 24/09/2026 e completate il 30/09/2026

---

## 1. Il problema

La telepatia è **sincrona**: servono due persone nello stesso momento. Oggi si può invitare solo
chi è online in quel momento (`online_users`, presenza ogni 4 secondi) e l'invito dura
**45 secondi**. Al lancio gli utenti saranno pochi, quindi quasi nessuno si incrocerà.

L'obiettivo è poter invitare chi ha **scelto** di essere raggiungibile, anche se ha l'app chiusa:
gli arriva una notifica sul telefono, la tocca, accetta, e il training parte.

**Successo** = due persone che non erano online nello stesso momento riescono a fare un training
entro 10 minuti dall'invito, senza accordarsi fuori dall'app.

## 2. Decisioni di prodotto

### 2.1 Decise il 24/09

| Tema | Decisione |
|---|---|
| Chi compare | Solo chi accende l'interruttore **«Ricevi inviti anche quando non sei collegata/o»**, spento di default. Sta in Telepatia **e** in Impostazioni. Accenderlo chiede il permesso notifiche. |
| Ospiti | **Sì**, anche gli ospiti possono accenderlo ed essere invitati. |
| La lista | Semplice lista di nomi in Telepatia, **sotto** chi è online, titolo **«Disponibili su invito»**. Niente filtri, niente ricerca. |
| La scheda | Toccando un nome: nickname, paese, bio, numero di prove, percentuale di indovinate. Pulsante **«Invita a un training»**. |
| Push | Parte **subito**, non al giro del cron. |
| Ritorni | Chi invita vede un conto alla rovescia e può chiudere l'app. Push di ritorno su **accettato** («Ha accettato, entra!»), **rifiutato**, **scaduto**. |
| Protezioni | Blocchi validi **nei due sensi**, sia nella lista sia nell'invio, **controllati dal server**. Anti-disturbo: 1 invito aperto per mittente (che include la coppia) e **10 inviti all'ora** per mittente. |
| Esclusi | Appuntamenti a orario, filtri, ricerca. |

### 2.2 Decise il 30/09 (primo giro)

| Tema | Decisione |
|---|---|
| Durata | **10 minuti** se il destinatario è offline; **45 secondi** (come oggi) se è online in quel momento (visto negli ultimi 30 s). La decide il server all'invio e la scrive in `expires_at`. |
| Ospiti che non vogliono più inviti | Anche un ospite può dire **«Non voglio più inviti da questa persona»**, dalla notifica e dalla scheda. È un blocco lato server per `session_id` (non per nickname), valido **nei due sensi** per gli inviti. Vale anche per gli iscritti, accanto al blocco normale. |
| Scadenza della disponibilità | Dopo **14 giorni** senza aprire l'app la persona **sparisce dalla lista**; alla prima riapertura **torna disponibile da sola** (terzo giro: decisione di Irene), perché ogni apertura rinnova la disponibilità. La scadenza la fa il filtro «disponibile» su `rinnovata_il`, non una cancellazione: la riga si cancella fisicamente solo dopo **90 giorni** senza aperture, e da lì l'interruttore va riacceso. |
| Doppio invito allo stesso destinatario | **Al massimo 1 invito aperto per destinatario.** Il secondo mittente riceve «È già stato invitato, riprova fra poco». |

### 2.3 Decise il 30/09 (secondo giro)

| Tema | Decisione |
|---|---|
| Online senza interruttore | A chi è online ma **non** ha acceso l'interruttore arriva **solo l'avviso dentro l'app, nessuna push**. La push parte solo se il destinatario ha una riga in `telepathy_availability`. Per chi è online senza riga: niente `push_saltata`, niente messaggio al mittente, niente conteggio nel tetto per destinatario. |
| Durata di un training | Un training dura **finché i due giocano**: si chiude solo per **inattività**, non più a 5 minuti dalla nascita. Soglia proposta: **10 minuti senza nessun aggiornamento del match** (vedi §4.1, `ultima_attivita`). |
| Rilascio | **In due tempi, senza interruzioni**: prima tutto il nuovo accanto al vecchio, poi, dopo almeno un giorno, la chiusura dell'accesso diretto. Passi e ritorni indietro in §8. |

### 2.4 Default scelti per Irene (li può cambiare)

- Chi ha un invito in corso **non può invitare altri** finché quello non finisce (accettato,
  rifiutato, annullato o scaduto).
- Il punteggio nascosto (`profiles.show_telepathy_score = false`) **resta nascosto** anche nella
  scheda.
- Chi accetta aspetta chi ha invitato **al massimo 3 minuti**.
- Accanto all'interruttore la frase **«Il tuo nome sarà visibile a tutti quelli che usano
  l'app.»**
- Soglia d'inattività di un training: **10 minuti** (secondo giro).
- Tetti per destinatario: **6 push d'invito all'ora**, **1 per coppia ogni 15 minuti**.

### 2.5 Confermate da Irene il 01/10

**Deciso in implementazione (01/10/2026).** Due scelte che l'implementazione ha fatto emergere,
confermate da Irene («k andiamo pure avanti»):

1. **Un solo abbonamento per telefono.** Accendere «Ricevi inviti anche quando non sei
   collegata/o» riaccende anche le notifiche dei rituali, se erano spente; e, all'inverso,
   spegnere le notifiche dei rituali spegne anche la disponibilità agli inviti (§4.4).
2. **Toccare un nome nella lista «Online» della telepatia apre la scheda d'invito** e non più il
   profilo. Il profilo resta raggiungibile dagli altri punti dell'app in cui si apre oggi.

## 3. Cosa c'è oggi (verificato su `main` = `996f8c9`, 30/09)

**Inviti** (`src/app.jsx`)
- `sendDirectInvite` (r. 2518) cancella e poi inserisce direttamente dal client in
  `telepathy_invites` e in `notifications`, senza RPC. `cancelDirectInvite` (r. 2551) cancella
  con un `delete` diretto.
- `acceptInvite` (r. 2558): il destinatario **prima** crea il match con un insert diretto in
  `telepathy_matches` (`user1_id = from_id` dell'invito, `user2_id` = sé stesso), **poi** mette
  l'invito a `accepted` con un update diretto, e usa `from_id` come `partner.id`.
- `declineInvite` (r. 2624): update diretto a `declined` e riga in `notifications` scritta dal
  client.
- L'invitante aspetta con `pollForMatch` (r. 2351–2375): ogni 2 s legge **tutta**
  `telepathy_matches` e prende il primo match attivo in cui compare; dopo **45 s** cancella
  l'invito e si arrende.
- `playAgainSamePartner` (r. 2635–2649) controlla che il partner sia visto online negli ultimi
  **60 s** e rimanda un invito con `sendDirectInvite`.
- Il loop presenze (r. 1470–1484) legge gli inviti `pending` a me indirizzati e **cancella quelli
  più vecchi di 2 minuti** (r. 1482).
- `markOneNotifRead` (r. 2941–2948) legge anche lui direttamente `telepathy_invites` quando si
  tocca una notifica d'invito nella campanella.
- `beforeunload` (r. 1348–1365) alla chiusura dell'app manda `fetch(... keepalive)` che
  cancellano: il match corrente e la sua chat, la mia riga in `telepathy_queue` e **tutti i miei
  inviti in uscita** (r. 1360). `resetTelepathy` (r. 2443) fa lo stesso sugli inviti in uscita
  (r. 2454). Oggi chiudere l'app ritira l'invito.
- La campanella considera scaduto un invito dopo **120 s dal `created_at` della notifica**, in due
  punti: r. 2916 (`markOneNotifRead`) e r. 4036 (lista delle notifiche).
- Il filtro blocchi è **solo lato client e a senso unico** (`isBlocked(from_name)`): un utente
  bloccato può ancora invitare, la riga arriva comunque nel database.
- Durante un match, `checkPartnerLeft` (r. 2276, ogni 2 s) dà il partner per disconnesso se il
  match sparisce, se ha `ended_at`, o se il partner non è visto in `online_users` da **più di
  35 s**. Il timeout di inattività A3 (r. 2505–2514) chiude la sessione dopo **90 s** di attesa
  del partner.
- `?ritual=<id>` **viene letto** (r. 1100–1108): uno `useState` lo legge all'avvio, lo toglie
  subito dall'indirizzo con `history.replaceState` (come `reset` e `magic`, r. 1088–1099), lo
  valida (`/^\d+$/`) e lo tiene in `ritualeDaAprire` finché i rituali non sono caricati, anche
  dopo un'eventuale entrata come ospite. È il modello per `?invito=`.
- Cambi d'identità: login con password (r. 1802, `setSessionId(existing.session_id)`), link
  magico (r. ~1998–2003, stesso cambio), iscrizione (r. 1874, `session_id` nuovo), logout (r.
  2047, `spegniPushAlLogout()` cancella l'abbonamento push del telefono).

**Match** (`telepathy_matches`, aperta a tutti in lettura e scrittura)
- Chiave `uuid` (`end_telepathy_match(p_match_id uuid, …)`, 14_), colonne `created_at`,
  `ended_at`/`ended_by` (14_), `round_count`, simboli e livello. Nessuna colonna di «ultima
  attività».
- Ogni round aggiorna il match con update diretti: `sendSymbol` (r. 2125), `submitGuess`
  (r. 2135), cambio livello (r. 2148), fine round (r. 2237).
- `findPartner` (r. 1556): a ogni giro **cancella ogni match creato più di 5 minuti fa** (r.
  1559), anche se i due stanno giocando; poi (r. 1561–1566) **entra in qualunque match attivo in
  cui compare il mio `session_id`**, senza chiedersi da dove venga. Il «TTL di 5 minuti» sta solo
  qui, nel client: la 06_ lo cita in un commento (r. 102) ma non lo impone.

**Tabella `telepathy_invites`** (letta dal catalogo il 25/09)
- Non ha un `CREATE TABLE` nelle migration: è nata dallo Studio.
- Colonne: `id uuid`, `created_at`, `from_id`, `from_name`, `to_id`, `to_name`, `status` (default
  `'pending'`). Nessun indice oltre la chiave primaria, nessun trigger. 22 righe al 25/09.
- RLS attiva, ma le policy sono di fatto **aperte** (`Allow all`, `Enable all for users`, `anon can
  insert/select/delete`): chiunque con la chiave pubblica può scrivere, leggere e cancellare
  qualunque invito.
- `delete_my_account` cancella già gli inviti dell'utente (`from_id` o `to_id` = il suo
  `session_id`): c'è dalla 06_ ed è ancora nel corpo della 30_ e della 31_.

**Push** (costruite il 21/09 per i rituali, provate dal vivo il 22/09)
- `push_subscriptions` (19_): una riga per telefono, chiave `session_id`, RLS senza policy.
- `register_push_subscription` (21_/24_): host del servizio push in whitelist, tetto 10 per
  `session_id`. **Non prova l'identità**: chiunque può registrare un abbonamento sotto un
  `session_id` altrui.
- Motore: Edge Function `notify-ritual-start`, **live**, svegliata ogni minuto dal job pg_cron
  `notify-ritual-start` (23_) con `net.http_post`; `esito.mjs` (nella cartella della funzione)
  decide quando un abbonamento va cancellato; dedup con prenotazione prima dell'invio; TTL 300/900
  s, `urgency: 'high'`; risponde 500 quando ci sono errori o guasti.
- Pubblicazione: `scripts/deploy-push.js` pubblica **solo** `notify-ritual-start` e `alert-cron`
  (r. 76–87) e vuole in `.env.local` un token Supabase con il permesso **Edge Functions** (r.
  52–55 lo dice quando manca).
- Sentinella `alert-cron` + `controlla_salute_cron` (23_): conta i job falliti **e tutte le
  risposte HTTP non 2xx** in `net._http_response` negli ultimi 20 minuti, di qualunque chiamata
  `net.http_post`. Copre già anche le chiamate che partiranno dalle RPC nuove, senza estenderla —
  a patto che la funzione nuova risponda 2xx quando non c'è niente da fare.
- `sw.js` (cache `ga-pwa-v11`): `importScripts('push-helpers.js')`; handler `push` /
  `notificationclick` / `pushsubscriptionchange`. Il `push` mostra **sempre** una notifica
  (`userVisibleOnly: true`) e, se `PushHelpers` manca, un ripiego che parla di rituali. Il
  `notificationclick` mette a fuoco una finestra aperta e ci fa `navigate()` (cioè la ricarica),
  altrimenti ne apre una. `push-helpers.js` non è fra i file «freschi» del gestore `fetch`.
- `push-helpers.js`: `costruisciNotifica` conosce solo `reminder` e `start`; **qualunque altro
  tipo diventa `start`**, cioè un testo «sta iniziando ora» di un rituale.

**Profilo, statistiche e credenziali**
- Dalla **27_/27b (applicate il 29/09)** `profiles` è leggibile da anon solo nelle colonne
  pubbliche (`session_id, nickname, bio, starseed_type, avatar, country, interests,
  experience_level, telepathy_score, telepathy_best, show_telepathy_score, created_at,
  updated_at`): niente `password_hash`, niente `email`. La 27b ha azzerato le credenziali degli
  iscritti.
- `telepathy_scores`: dalla 27_ anon legge solo `nickname, sessions_count, matches_count,
  rounds_count, updated_at` — **non `user_id`**. Per un iscritto `user_id` è l'email, per un
  ospite il `session_id`.
- `get_public_telepathy_stats(p_nickname)` (15_) passa da `profiles`: per gli ospiti torna vuoto.
- Il cancello d'identità per chi chiama con un `session_id` è quello di `leave_ritual` e
  `toggle_ritual_candle` (30_): se esiste un profilo **con email** per quel `session_id`, serve
  `p_password_hash` uguale a quello del profilo, altrimenti `Auth failed`; per un ospite il
  `session_id` resta l'unica prova. Il nome di un iscritto viene dal profilo; quello di un ospite
  viene ripulito (NFKC, via invisibili e caratteri di controllo, spazi Unicode normalizzati, max
  50 caratteri, `'Anonymous'` se vuoto o uguale al nickname di un altro profilo). Oggi quella
  pulizia è scritta **dentro** `toggle_ritual_candle`, non in una funzione a sé.
- **Iscrizione di un ospite**: `register_account` (26_) salva il `session_id` che riceve, ma l'app
  (r. 1874) gliene passa uno **nuovo** (`Date.now() + '-' + Math.random()`), non quello
  dell'ospite; al login si prende il `session_id` del profilo. Il `session_id` dell'ospite quindi
  **non si conserva**.

**Blocchi** (16_/18_): `user_blocks(blocker_nickname, blocked_nickname)`. Bloccare richiede un
account (nickname + `password_hash`): **oggi un ospite non può bloccare, ma può essere bloccato.**

**Migration**: su `main` l'ultima è la 30_; la **31_** (`31_account_cancellato_rituali.sql`,
ramo `fix/account-cancellato-rituali`) ridefinisce `delete_my_account` togliendo l'utente anche da
`rituals.participants` e `ritual_presence`. `export_my_account` è stata ridefinita per l'ultima
volta nella **24_**.

**Test che toccano direttamente `telepathy_invites` sul database vero**:
`test-inviti-telepatia.js` (pulizia, r. 76–77), `test-telepathy.js` (pulizia, r. 50–51, e lettura
di debug, r. 406).

## 4. Architettura

Tre pezzi nuovi e un giro esistente da raddrizzare.

```
  App (chi invita)                  Database                       Edge Function
  ───────────────                  ────────                        ─────────────
  «Invita» ──RPC send_telepathy_invite──▶ identità, blocchi, tetti, disponibilità
                                         insert invito (expires_at = +45 s o +10 min)
                                         se ha la riga di disponibilità:
                                         pg_net ─────────────────▶ notify-telepathy-invite
                                                                    {invito, tipo:'invito'}
                                                                    └─▶ push al destinatario
  App (chi riceve) ◀── tocca la notifica: app.html?invito=<id>
  «Accetta» ── crea il match (insert diretto, come oggi, con from_id dall'invito)
            ──RPC respond_telepathy_invite(accept, match_id)──▶ status = accepted, match_id
                                              pg_net ─────────────▶ push «Ha accettato, entra!»
  App (chi invita) ◀── get_my_telepathy_invites / ?invito=<id> ──▶ entra nel match_id
                                                                   (id del partner dal match)
  job cron esistente (ogni minuto) ─────────────────────────────▶ {tipo:'scadenze'} → push «scaduto»
```

### 4.1 Database — migration `32a_inviti_telepatia_offline.sql` e `32b_chiudi_inviti_diretti.sql`

Tutto versionato, niente Studio (lezione del cron fantasma). Idempotenti, ciascuna in una
transazione. Si applicano **dopo la 31_**, in due tempi (§8): la **32a** aggiunge tutto il nuovo
**lasciando aperte le policy vecchie**; la **32b**, almeno un giorno dopo il rilascio dell'app,
chiude l'accesso diretto. Salvo dove è detto «32b», tutto quello che segue sta nella 32a.

1. **Funzioni interne condivise** (`REVOKE ALL ... FROM PUBLIC, anon, authenticated`):
   - `telepatia_verifica_identita(p_session_id, p_password_hash)` — stesso cancello di
     `leave_ritual`/`toggle_ritual_candle` (30_): `session_id` obbligatorio e ≤ 255 caratteri; se
     esiste un profilo con email per quel `session_id` e l'hash non coincide, `Auth failed`.
   - `nome_pubblico(p_session_id, p_nome)` — la logica del nome della 30_, identica: nickname del
     profilo se c'è; altrimenti il nome mandato, ripulito (NFKC, invisibili, spazi, 50 caratteri);
     `'Anonymous'` se vuoto o se è il nickname di un altro profilo. `toggle_ritual_candle` **non**
     si ridefinisce (vedi §9): la 32a non entra nella catena 28_ → 31_. Un test controlla che le
     due versioni diano lo stesso risultato sugli stessi input.
   - `telepatia_in_training(p_session_id)` — la **sola definizione** di «sta già facendo un
     training», usata da invio, risposta e disponibilità: esiste un match con quel `session_id`,
     senza `ended_at`, con `ultima_attivita` negli ultimi 10 minuti, **e** che è legato a un invito
     `accepted` (`telepathy_invites.match_id`) **oppure** ha `giocato = true` (aggiornato almeno
     una volta dopo la creazione, vedi punto 2). Così un match orfano, appena inserito e mai
     giocato, non tiene nessuno «occupato». (Terzo giro: niente confronto `ultima_attivita =
     created_at`, fragile — il tipo di `created_at` andrebbe letto dal catalogo e il client fatto a
     mano sa filtrare solo con `.eq`/`.neq`/`.lt` —, al suo posto una colonna booleana.)
   - `telepatia_online(p_session_id)` — la sola definizione di «visto online negli ultimi 30 s»
     (`online_users.last_seen`), usata da lista, scheda, invio, blocco e durata dell'invito.
   - `telepatia_bloccati(sid_a, nome_a, sid_b, nome_b)` — la sola definizione di «c'è un blocco
     fra i due, in un senso o nell'altro»: `user_blocks` sui nomi, `telepathy_invite_blocks` sui
     `session_id`.
2. **`telepathy_matches`: l'attività** (secondo giro, decisione 2; colonne rifinite al terzo)
   - `ADD COLUMN IF NOT EXISTS ultima_attivita timestamptz NOT NULL DEFAULT now()`;
   - `ADD COLUMN IF NOT EXISTS giocato boolean NOT NULL DEFAULT false`: le righe già presenti al
     momento della migration si segnano `true` (sono sessioni vere, non orfani);
   - `ADD COLUMN IF NOT EXISTS da_invito boolean NOT NULL DEFAULT false`: la scrive `true` solo
     l'app nuova quando crea il match accettando un invito (§4.4). Serve a `findPartner` per
     riconoscere un orfano d'invito **senza** saltare i match casuali appena nati (vedi §4.4:
     saltare tutti i match «mai giocati» romperebbe l'abbinamento casuale, in cui chi è in coda
     scopre il match creato dall'altro prima che nessuno abbia giocato);
   - trigger `BEFORE INSERT OR UPDATE`: all'insert `ultima_attivita = now()` e `giocato = false`;
     a ogni update `ultima_attivita = now()` e `giocato = true`. Ogni round, ogni simbolo, ogni
     cambio livello già oggi è un update (r. 2125, 2135, 2148, 2237), quindi il trigger vede
     l'attività **anche dalle app vecchie**, senza toccarle;
   - l'arrivo di chi ha invitato nel match fa un update (§4.4) e quindi lo rinfresca.
   Nessun'altra modifica alla tabella: resta aperta come oggi (fuori scope, §9).
3. **`telepathy_availability`** — chi ha acceso l'interruttore.
   `id uuid PK DEFAULT gen_random_uuid()` (l'**identificativo opaco** che vede l'app),
   `session_id text UNIQUE NOT NULL`, `nickname text NOT NULL` (già passato da `nome_pubblico`),
   `enabled_at timestamptz`, `rinnovata_il timestamptz NOT NULL DEFAULT now()`. RLS senza policy,
   nessun privilegio ad anon: ci si arriva solo dalle RPC.
4. **`telepathy_invite_blocks`** — «Non voglio più inviti da questa persona».
   `(blocker_session text, blocked_session text, created_at)`, PK composta. RLS senza policy.
   Vale nei due sensi per gli inviti: né lista, né scheda, né invio fra le due persone.
5. **`telepathy_invites`, messa in ordine** — la tabella entra finalmente nelle migration:
   - `ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '45
     seconds'` (il valore vero lo scrive sempre la RPC; il default vale per gli insert delle app
     vecchie durante la tenuta), `match_id uuid`, `push_saltata boolean NOT NULL DEFAULT false`,
     `con_push boolean NOT NULL DEFAULT false` (vero se è partita la richiesta di push),
     `responded_at timestamptz`, `via_diretta boolean NOT NULL DEFAULT false` (la scrive il trigger
     qui sotto: dice che la riga è stata scritta o cambiata senza passare dalle RPC, ed è il segnale
     per capire quando le app vecchie sono sparite, §8 passo 4);
   - **prima dell'indice**, normalizzare: **tutti** i `pending` esistenti → `expired` (non solo i
     vecchi: due `pending` per lo stesso destinatario farebbero fallire l'indice unico e con lui
     tutta la migration), stati sconosciuti → `expired`; poi `CHECK` su `status IN
     ('pending','accepted','declined','cancelled','expired')`. Gli stati che scrivono le app
     vecchie (`pending`, `accepted`, `declined`) sono tutti ammessi. Su un **rilancio** della 32a
     (indice unico già presente) si segnano `expired` solo i `pending` già scaduti: rilanciarla non
     deve chiudere gli inviti vivi;
   - **Deciso in implementazione (01/10/2026) — come si riconosce la «prima applicazione».** Non
     dall'assenza dell'indice unico, come scritto sopra, ma dall'**assenza della colonna
     `expires_at`**, letta prima dell'`ALTER` e tenuta in un'impostazione valida solo per la
     transazione (`set_config(..., true)`). Il motivo: lo script di ritorno indietro
     (`32a_ritorno.sql`) toglie gli indici unici, e un rilancio della 32a dopo un ritorno indietro
     si crederebbe una prima applicazione, chiudendo tutti gli inviti vivi. Alla prima applicazione,
     prima della normalizzazione, `expires_at` delle righe già presenti si riporta a `created_at +
     45 s` (altrimenti, col default «adesso + 45 s», inviti vecchi di giorni sembrerebbero da 10
     minuti e i mittenti riceverebbero vere push «scaduto»). A ogni rilancio si tolgono anche i
     `pending` doppi per mittente o destinatario (resta il più recente), che dopo un ritorno
     indietro le app vecchie possono aver scritto;
   - **Deciso in implementazione (01/10/2026) — `status` obbligatorio.** Il `CHECK` da solo lascia
     passare `NULL`; dopo la normalizzazione (che porta a `expired` anche gli stati `NULL`)
     `telepathy_invites.status` diventa `NOT NULL`. Le app vecchie scrivono sempre uno stato
     esplicito (`pending` all'invio);
   - **trigger di guardia `BEFORE INSERT OR UPDATE`** (terzo giro: chiude la finestra della 32a).
     Con le policy ancora aperte chiunque, con la chiave pubblica, potrebbe scrivere le colonne
     nuove: un invito con `con_push = true` seguito da una chiamata alla Edge Function (una push che
     salta blocchi, tetti e consenso), un `accepted` con un `match_id` inventato, un `pending` con
     `expires_at` fra un anno che blocca qualcuno con `gia_invitato`. Il trigger distingue chi
     scrive da `current_user`: dentro le RPC `SECURITY DEFINER` è il proprietario delle funzioni;
     una scrittura diretta da PostgREST è `anon` o `authenticated`. Per queste ultime:
     - **insert**: `status = 'pending'`, `created_at = now()`, `expires_at = now() + 45 s`,
       `con_push = false`, `push_saltata = false`, `match_id = NULL`, `responded_at = NULL`,
       `via_diretta = true`, qualunque cosa mandi il client;
     - **update**: cambia solo `status` (tutte le altre colonne tornano al valore di prima, quindi
       `match_id` non si scrive), `responded_at = now()` quando lo stato esce da `pending`,
       `via_diretta = true`.
       **Deciso in implementazione (01/10/2026):** lo stato, da fuori, può fare **solo** il
       passaggio `pending` → `accepted` o `declined`, cioè quello che fanno davvero le app vecchie.
       Ogni altro cambio di stato (`pending` → `expired`/`cancelled`, o rianimare un invito già
       chiuso) viene rifiutato con un errore: altrimenti chiunque, con la chiave pubblica, potrebbe
       chiudere o riaprire gli inviti degli altri (§6 vince).
     Per le RPC il trigger si limita a riempire `responded_at` se una RPC lo dimentica uscendo da
     `pending`. Le app vecchie non se ne accorgono: scrivono solo `pending`/`accepted`/`declined` e
     non leggono le colonne nuove;
   - **indici unici parziali**, con nome fisso: `telepathy_invites_un_pending_mittente ON (from_id)
     WHERE status = 'pending'` e `telepathy_invites_un_pending_destinatario ON (to_id) WHERE status
     = 'pending'`. Siccome `now()` non può stare nel predicato, le RPC prima di scrivere segnano
     `expired` i `pending` già scaduti delle persone coinvolte;
   - indici su `(to_id, status)`, `(from_id, created_at)`, `(match_id)`;
   - **32b**: si chiude tutto l'accesso diretto — via tutte le policy, `REVOKE ALL` da anon e
     authenticated, **anche la SELECT**. La lettura passa da `get_my_telepathy_invites` e
     `get_telepathy_invite` (motivo in §6). Prima di chiudere, la 32b **rinormalizza i
     `pending`**: segna `expired` quelli già scaduti e quelli con una scadenza impossibile (oltre
     10 minuti da adesso), per il caso in cui qualcosa sia sfuggito al trigger di guardia. Il
     trigger resta anche dopo la 32b (non costa niente e copre un'eventuale riapertura).
6. **`telepathy_invite_pushes`** — dedup delle push, stesso schema di `ritual_notifications_sent`:
   `(invite_id → telepathy_invites ON DELETE CASCADE, subscription_id → push_subscriptions ON
   DELETE CASCADE, kind IN ('invito','accettato','rifiutato','scaduto'), sent_at)`, PK composta su
   `(invite_id, subscription_id, kind)`.
7. **RPC `SECURITY DEFINER`** (`SET search_path = public, pg_temp`), input validati come le
   21_/24_/30_. **Tutte quelle chiamate con un `session_id` hanno `p_password_hash` e passano da
   `telepatia_verifica_identita`.** I nomi di mittente e destinatario vengono sempre dal server
   (profilo per gli iscritti, `nome_pubblico` per gli ospiti), mai dal client. Risposte
   `jsonb {ok, motivo, ...}` come `register_account` (26_), così l'app traduce il motivo in un
   messaggio chiaro; `Auth failed` resta un'eccezione come nelle altre RPC.

   **Come si indica un'altra persona**: sempre con **due parametri distinti**, uno solo dei due
   valorizzato — `p_disponibilita_id uuid` (l'identificativo opaco della lista «Disponibili su
   invito») oppure `p_session_online text` (il `session_id` di chi sta nella lista Online, che
   l'app conosce già da `online_users`). Il secondo **vale solo se quella persona è stata vista in
   `online_users` negli ultimi 30 s**; altrimenti la persona risulta «non trovata». Mai un solo
   parametro che accetta l'uno o l'altro: il server deve sapere per quale strada si arriva.

   **Chi è «disponibile»** (una sola definizione, usata da lista, scheda e invio): ha una riga in
   `telepathy_availability` con `rinnovata_il` negli ultimi 14 giorni **e** almeno un abbonamento
   in `push_subscriptions`, **oppure** è stato visto in `online_users` negli ultimi 30 s. In
   entrambi i casi **non** deve essere già in un training (`telepatia_in_training`). È questo
   filtro a far «scadere» la disponibilità dopo 14 giorni: la riga resta, e alla prima riapertura
   `renew_telepathy_availability` riporta `rinnovata_il` a oggi (§2.2).

   **Il nome di chi chiama, per i blocchi** (terzo giro). `user_blocks` è per nickname, e un
   ospite non ha un profilo da cui leggerlo. Scelta: **lo passa l'app** (`p_nickname`) e il server
   lo fa passare da `nome_pubblico`, esattamente come in `send_telepathy_invite`. Così il nome su
   cui si controllano i blocchi è **lo stesso** che l'altra persona vedrebbe nell'invito; per un
   iscritto conta comunque il nickname del profilo. Ricavarlo da `online_users` o dalla riga di
   disponibilità non sarebbe più affidabile (anche quelle le scrive il client, e `online_users` è
   aperta) e mancherebbe a chi non ha acceso l'interruttore. Il nome dell'**altra** persona invece
   viene sempre dal server: nickname della riga di disponibilità, oppure di `online_users`, passato
   da `nome_pubblico` (profilo, se c'è).

   - `set_telepathy_availability(p_session_id, p_password_hash, p_nickname, p_enabled)` — **solo
     da un gesto della persona** (l'interruttore). Accendere richiede almeno una riga in
     `push_subscriptions` per quel `session_id` (senza, comparire in lista sarebbe una promessa
     falsa: `motivo = 'nessun_abbonamento'`); fa upsert, aggiorna nome e `rinnovata_il`. **Spegnere
     cancella la riga.** Torna lo stato vero (`acceso: true/false`).
   - `renew_telepathy_availability(p_session_id, p_password_hash)` — chiamata a ogni apertura
     dell'app. Aggiorna `rinnovata_il` **solo se la riga esiste già**, non la crea mai, e torna lo
     stato vero: `acceso`, oppure `spento`, oppure `senza_abbonamento` (riga presente ma nessun
     abbonamento vivo, per esempio perché la push è stata cancellata da `esito.mjs`). È il server a
     decidere com'è l'interruttore: un'app su un altro telefono che l'ha spento vince sul rinnovo
     di questa.
   - `get_invitable_users(p_session_id, p_password_hash, p_nickname)` — le righe di
     `telepathy_availability` disponibili, **esclusi** me stesso, chiunque sia in un blocco con me
     in un senso o nell'altro (`user_blocks` sui nomi dati dal server, `telepathy_invite_blocks`
     sui `session_id`), chi è già in un training e **chi è stato visto online negli ultimi 30 s**
     (sta già nella lista Online: la deduplica la fa il server, non l'app confrontando nickname).
     Torna **solo `id` (l'identificativo opaco) e `nickname`**, mai il `session_id`.
   - `get_invite_card(p_session_id, p_password_hash, p_nickname, p_disponibilita_id,
     p_session_online)` — torna
     nickname, paese, bio (da `profiles`, vuoti per gli ospiti), prove e indovinate da
     `telepathy_scores` con `user_id = coalesce(email, session_id)` — **mai `user_id`, mai
     `session_id`, mai l'email**. Se il profilo ha `show_telepathy_score = false`, prove e
     indovinate tornano `null` e la scheda non le mostra. Rispetta i blocchi: chi è in un blocco
     con me risulta «non trovato».
   - `send_telepathy_invite(p_session_id, p_password_hash, p_nickname, p_disponibilita_id,
     p_session_online)` — rifiuta con un motivo se: il destinatario non è disponibile, è in un
     blocco nei due sensi o **è già in un training** (`non_disponibile`, stesso motivo per tutti e
     tre, per non rivelare il blocco); sono io (`dati_non_validi`); il mittente ha già un invito
     `pending` non scaduto (`invito_in_corso`); il destinatario ha già un invito `pending` non
     scaduto da chiunque (`gia_invitato` → «È già stato invitato, riprova fra poco»); il mittente
     ha mandato **10 inviti nell'ultima ora** (`troppi_inviti`); il mittente è in un training
     (`in_match`). Poi:
     - `expires_at` = +45 s se il destinatario è stato visto online negli ultimi 30 s, altrimenti
       +10 minuti;
     - scrive l'invito (con i nomi dal server) e la riga in `notifications` (non più dal client).
       Se l'insert urta uno dei due indici unici (23505, due invii nello stesso istante), la RPC
       **cattura l'errore e lo traduce per indice**: `telepathy_invites_un_pending_mittente` →
       `invito_in_corso`, `telepathy_invites_un_pending_destinatario` → `gia_invitato`;
     - **la push, solo se il destinatario ha una riga in `telepathy_availability`** (decisione del
       secondo giro). Chi è online senza riga riceve solo l'avviso dentro l'app: niente push,
       niente `push_saltata`, niente messaggio al mittente, niente conteggio nel tetto;
     - **tetto per destinatario** (solo per chi ha la riga): se ha già ricevuto **6 inviti con push
       nell'ultima ora** (`con_push = true`), o un invito con push **da questo stesso mittente
       negli ultimi 15 minuti**, l'invito si scrive lo stesso con `push_saltata = true` e **senza
       push**; il mittente lo sa («Non gli arriverà una notifica ora: lo vedrà se apre l'app entro
       la scadenza»);
     - altrimenti `con_push = true` e `net.http_post` verso la Edge Function, **solo dopo che
       l'insert è riuscito**, anche se il destinatario è online (la notifica la sopprime il service
       worker, §4.3).
     Torna `id` ed `expires_at` dell'invito.
   - `respond_telepathy_invite(p_invite_id, p_session_id, p_password_hash, p_accept, p_match_id)` —
     solo il destinatario, solo se `pending` e non scaduto; il passaggio di stato è un `UPDATE ...
     WHERE status = 'pending' AND expires_at > now()` atomico, che scrive anche `responded_at`. Con
     `p_accept = true`:
     - `p_match_id` è obbligatorio e deve essere un match esistente, senza `ended_at`, con
       `user1_id = from_id` e `user2_id = to_id` dell'invito; si salva in
       `telepathy_invites.match_id`;
     - rifiuta con `in_match` se chi accetta, o chi ha invitato, è già in un **altro** training
       (`telepatia_in_training`, escluso `p_match_id`);
     - **annulla sul server gli inviti in uscita di chi accetta** (`cancelled`), così nessuno può
       più accettare un invito di una persona che sta già giocando con un'altra;
     - avvisa il mittente con la push `accettato` (anche per gli inviti da 45 s: chi ha invitato
       può aver posato il telefono).
     Con `p_accept = false` → `declined`, riga in `notifications` per il mittente (non più dal
     client) e push `rifiutato` **solo per gli inviti da 10 minuti**: per quelli da 45 s chi ha
     invitato è online e lo vede nell'app.
     **Deciso in implementazione (01/10/2026) — doppia accettazione.** Se l'invito è già
     `accepted` (la stessa persona ha accettato da un altro telefono o da un'altra scheda), la RPC
     risponde `gia_accettato` e **non tocca nessun match**: quello eventualmente indicato è di norma
     proprio il match dell'invito. Il caso lo gestisce l'app (§4.4, «Accettazione»).
   - `cancel_telepathy_invite(p_invite_id, p_session_id, p_password_hash)` — solo il mittente, solo
     se `pending` → `cancelled`, nessuna push.
   - `get_my_telepathy_invites(p_session_id, p_password_hash)` — la lettura degli inviti al posto
     delle SELECT dirette: l'invito `pending` non scaduto a me indirizzato (al massimo uno) e il mio
     invito in uscita più recente delle ultime 24 ore, ciascuno con id, nome dell'altra persona,
     `status`, `expires_at`, `responded_at`, `match_id`, `push_saltata`. **Il `session_id`
     dell'altra persona torna in un solo caso**: `from_id` dell'invito `pending` a me indirizzato,
     perché chi accetta deve creare il match con `user1_id = from_id` e usarlo come `partner.id`
     per l'attesa e per `checkPartnerLeft`. Non è un'informazione nuova per chi la riceve (chi
     invita è per forza online in quel momento, quindi già in `online_users`, e finirà comunque in
     `telepathy_matches`). **Chi invita non riceve mai il `to_id`**: l'id del partner lo prende dal
     match (`user2_id`) quando ci entra. Segna `expired` gli scaduti che trova (così la risposta
     non mente anche se il cron è in ritardo). Torna anche `adesso` (l'ora del server), da cui
     l'app calcola i conti alla rovescia senza dipendere dall'orologio del telefono. L'invito in
     arrivo da una persona con cui nel frattempo c'è un blocco non torna.
   - `get_telepathy_invite(p_invite_id, p_session_id, p_password_hash)` — lo stato di **un** invito
     mio (da mittente o da destinatario) per id, con gli stessi campi e la stessa regola sul
     `session_id`. Serve a chi arriva dalla notifica: distingue scaduto, rifiutato, annullato,
     accettato (con `match_id`) e ancora aperto. Per un invito non mio: «non trovato».
   - `block_telepathy_inviter(p_session_id, p_password_hash, p_invite_id, p_disponibilita_id,
     p_session_online)` — «Non voglio più inviti da questa persona». Uno solo dei tre parametri:
     - **l'invito**: accettato **solo da chi ne è il destinatario** (`to_id = p_session_id`, con il
       cancello della credenziale per gli iscritti); blocca il mittente e, se l'invito è
       `pending`, lo chiude come `declined` senza push;
     - **l'identificativo opaco**, dalla scheda della lista «Disponibili su invito»;
     - **il `session_id` di chi è nella lista Online**, dalla scheda aperta da quella lista: vale
       solo se la persona è stata vista online negli ultimi 30 s, come per l'invio.
     Risolve il `session_id` sul server e scrive in `telepathy_invite_blocks`. Aperta a ospiti e
     iscritti.
   - `expire_telepathy_invites()` — segna `expired` i `pending` scaduti; restituisce gli id degli
     inviti **da 10 minuti** diventati `expired` negli ultimi 10 minuti (`responded_at`), **da
     chiunque siano stati segnati** (anche da `get_my_telepathy_invites` di chi ha riaperto l'app:
     altrimenti la push «scaduto» si perderebbe proprio quando il destinatario apre tardi). La
     stessa riga può tornare in più giri: la dedup di `telepathy_invite_pushes` evita i doppioni.
     Cancella le righe chiuse più vecchie di 1 giorno e le righe di `telepathy_availability` con
     `rinnovata_il` più vecchia di **90 giorni** (§2.2: a 14 giorni si sparisce solo dalla lista).
     **Solo per il ruolo di servizio** (`REVOKE` da anon): la chiama la Edge Function.
8. **`delete_my_account`**: si parte dal **corpo della 31_** (l'ultima che la ridefinisce; se al
   momento del piano non è ancora su `main`, dal ramo `fix/account-cancellato-rituali`, file
   `supabase/sql/31_account_cancellato_rituali.sql`), identico, più un blocco «NUOVO (32)» dentro
   `IF v_sid`: `DELETE FROM telepathy_availability WHERE session_id = v_sid` e `DELETE FROM
   telepathy_invite_blocks WHERE blocker_session = v_sid`. Quelli subiti restano, come per
   `user_blocks` (18_): cancellare l'account non deve diventare un modo per farsi sbloccare. Gli
   inviti li cancella già (vedi §3) e con loro, a cascata, `telepathy_invite_pushes`.
   ⚠️ Da scrivere in testa: se si rilancia la 30_ o la 31_, rilanciare subito dopo anche la 32a.
9. **`export_my_account`**: si parte dal **corpo della 24_**, identico, più tre voci:
   `telepathy_invites` (inviati e ricevuti, `from_id` o `to_id` = `v_sid`),
   `telepathy_availability` (la mia riga) e `telepathy_invite_blocks` (quelli impostati da me).
   Senza i `session_id` delle altre persone (§6: chi invita non riceve mai il `to_id`, e l'export
   non deve diventare la strada per averlo): degli inviti si esportano ruolo, nome dell'altra
   persona, stato e date; dei blocchi solo la data.
10. **Cron**: **nessun job nuovo.** Il job esistente `notify-ritual-start` (23_) viene ridefinito
    con lo stesso nome, lo stesso orario e lo stesso comando, più una seconda `net.http_post` verso
    `notify-telepathy-invite` con `{tipo:'scadenze'}`. Una sola cosa da sorvegliare, e la
    sentinella la vede già. Il comando non contiene altro che la chiave pubblica, come nella 23_.
    ⚠️ Da scrivere in testa: se si rilancia la 23_, rilanciare subito anche la 32a (la 23_ rimette
    il comando senza la seconda chiamata e le push «scaduto» smettono di partire senza errori).
    La funzione `notify-telepathy-invite` deve essere **già pubblicata** quando si applica la 32a
    (§8, passo 1), altrimenti ogni minuto il job riceve un 404 e la sentinella scatta.
11. `NOTIFY pgrst, 'reload schema'` in coda a entrambe.

**Perché le push partono dalla RPC con `pg_net` e non dal client**: il client potrebbe saltare la
chiamata, o chiamarla per inviti che non esistono. Dentro la RPC la push parte solo dopo che
l'invito è stato scritto e ha superato i controlli. `net.http_post` è transazionale (la richiesta
entra in coda solo al commit) e non aspetta la risposta. Il prezzo è che un errore della Edge
Function non torna alla RPC: lo vede la sentinella `alert-cron`, che conta ogni risposta non 2xx
in `net._http_response`.

### 4.2 Edge Function `notify-telepathy-invite`

- Riceve `{invito, tipo}` (tipo ∈ `invito`, `accettato`, `rifiutato`) oppure `{tipo:'scadenze'}`.
- **Non si fida di chi la chiama**: rilegge l'invito dal database e manda una push solo se lo
  stato lo giustifica. Chi la invoca a caso con la chiave pubblica ottiene al massimo un controllo
  in più, mai una notifica non dovuta (stessa posizione di `alert-cron`).
  - `invito` → solo se `pending`, non scaduto, `con_push = true` **e il destinatario ha ancora una
    riga in `telepathy_availability`** (terzo giro: nella finestra della 32a `con_push` non si può
    più scrivere dal client grazie al trigger di guardia, e questo secondo controllo copre il caso
    in cui la riga sia sparita fra l'invio e la push) → abbonamenti del destinatario;
  - `accettato` → solo se `accepted` con `match_id` → abbonamenti del mittente;
  - `rifiutato` → solo se `declined` e l'invito era da 10 minuti → abbonamenti del mittente;
  - `scadenze` → `expire_telepathy_invites()` → push «scaduto» ai mittenti, **solo per gli inviti
    da 10 minuti** (per quelli da 45 s chi ha invitato era online e ha visto scadere il conto alla
    rovescia).
- Il payload porta `tipo`, `invito` (id), `nome` (dell'altra persona, letto dal database),
  `locale` dell'abbonamento.
- **TTL e urgenza**: `invito` → TTL = secondi mancanti a `expires_at` (minimo 1), `urgency:
  'high'`: una notifica d'invito consegnata dopo la scadenza è solo rumore. `accettato` → TTL 180 s
  (l'attesa massima di chi accetta), `high`. `rifiutato` / `scaduto` → TTL 3600 s, `normal`.
- Dedup: prenota su `telepathy_invite_pushes` **prima** di spedire, libera solo su un «non
  consegnato» esplicito. Stessa regola di `notify-ritual-start`, stesso motivo: una doppia
  vibrazione costa più di una notifica persa.
- **Risposte**: 200 quando ha fatto il suo lavoro **o quando non c'era niente da fare** (invito non
  trovato, stato che non giustifica la push, corpo storto: `{ignorato: true}`). 500 solo per un
  guasto vero (lettura del database fallita, prenotazione fallita con un codice diverso da 23505,
  errore di invio non classificato), come `notify-ritual-start`. Mai 4xx: altrimenti chiunque la
  chiami a caso farebbe partire l'email della sentinella.
  **Deciso in implementazione (01/10/2026)**, due correzioni alla frase qui sopra:
  - un **errore d'invio non classificato** risponde **200**, non 500: la prenotazione resta (la
    push si considera persa, non si ritenta) e il conto finisce nella risposta, esattamente come fa
    già `notify-ritual-start`. Vince il codice esistente: costa al più un nuovo tentativo di
    `pg_net` in meno;
  - una prenotazione che fallisce con **23503** (l'invito o l'abbonamento sono spariti fra la
    lettura e la prenotazione: account cancellato, app vecchie che cancellano, abbonamento morto
    tolto da `notify-ritual-start`) si tratta come il 23505: **saltata**, niente 500. Per un invito
    cancellato nessuno vuole un'email d'allarme, e su quella tabella non ci sono altre chiavi
    esterne che possano rompersi davvero. Resta 500 ogni altro codice.
- **Deciso in implementazione (01/10/2026) — niente push di ritorno per gli inviti
  `via_diretta`.** Per un invito scritto o cambiato dalle app vecchie (`via_diretta = true`) la
  funzione non manda `accettato`, `rifiutato` né `scaduto`: il service worker vecchio (v11)
  mostrerebbe quelle push come «Un rituale sta iniziando ora». La funzione legge `via_diretta`
  insieme al resto dell'invito; al rilascio della Fase C va ripubblicata.
- `esito.mjs` si sposta in `supabase/functions/_shared/` e lo importano entrambe le funzioni. Non
  si copia: due copie della logica che cancella gli abbonamenti divergerebbero. Spostarlo obbliga
  a ripubblicare `notify-ritual-start`, che è live: è il **passo 0** del rilascio (§8), fatto da
  solo e provato prima di tutto il resto.
- Versioni `npm:` fissate (lezione del 22/09), le stesse di `notify-ritual-start`.
- **Pubblicazione**: `scripts/deploy-push.js` oggi pubblica solo `notify-ritual-start` e
  `alert-cron`; va esteso a `notify-telepathy-invite` (stessi segreti VAPID). Il token in
  `.env.local` deve avere il permesso **Edge Functions**: da controllare prima del passo 0, perché
  senza non si può ripubblicare nemmeno la funzione dei rituali.

### 4.3 Service worker e testi

- `push-helpers.js`: `costruisciNotifica` impara quattro tipi nuovi, it/en, sempre con un ripiego
  per ogni campo:
  - `invito` → «*Nome* ti invita a un training telepatico» / «Tocca per rispondere.» (nessun
    numero di minuti: la durata dipende da com'era il destinatario, e il tempo scorre mentre la
    notifica aspetta);
  - `accettato` → «*Nome* ha accettato, entra!»
  - `rifiutato` → «*Nome* non può ora»
  - `scaduto` → «L'invito a *Nome* è scaduto»

  Stesso `tag` (`invito-<id>`) per tutti i messaggi di un invito, così ognuno sostituisce il
  precedente invece di impilarsi. `url` = `app.html?invito=<id>`. La notifica `invito` porta
  un'azione **«Non voglio più inviti da questa persona»** che apre
  `app.html?invito=<id>&azione=blocca` (il service worker non chiama RPC: non ha e non deve avere
  la credenziale di un iscritto; conferma e blocco li fa l'app). Dove le azioni non esistono
  (iPhone) la stessa scelta sta nella schermata dell'invito.
- **Tipi sconosciuti**: oggi tutto ciò che non è `reminder` diventa `start`, cioè il testo di un
  rituale. Da qui: `reminder` e `start` come oggi (li manda sempre `notify-ritual-start`), i
  quattro tipi nuovi, e **qualunque altro tipo** → testo neutro («Global Awakening» / «Apri l'app»)
  con `url` = `app.html`. Anche il ripiego assoluto di `sw.js` diventa neutro per i tipi d'invito.
- `sw.js`, handler `push`: per i quattro tipi d'invito, se c'è una finestra dell'app **visibile**
  (`clients.matchAll({type:'window'})`, `visibilityState === 'visible'`), la notifica **non si
  mostra** e il service worker manda alla finestra un `postMessage({tipo, invito})`: l'app
  aggiorna subito il banner o l'attesa. Chrome tollera la push senza notifica quando il sito è in
  primo piano; **Safari/iOS no** (conta le push silenziose e può togliere il permesso): lì la
  notifica si mostra sempre, e lo stesso `tag` evita doppioni. I rituali non cambiano.
- `sw.js`, handler `notificationclick`, per i tipi d'invito: se c'è già una finestra dell'app la si
  mette a fuoco e le si manda `postMessage({tipo:'apri-invito', invito, azione})` con un
  `MessageChannel`; **se l'app non conferma la ricezione entro ~1 s** (app vecchia senza il
  gestore, pagina bloccata), si ripiega su `navigate(url)` come oggi. Senza finestre,
  `openWindow(url)`. I rituali restano con `navigate()`.
- **Tocco durante un training**: l'app non interrompe la sessione. Mostra un avviso non bloccante
  («*Nome* ti ha invitato: sei già in un training») con solo «Rifiuta»; accettare sarebbe comunque
  rifiutato dal server (`in_match`). Succede di rado, perché l'invio verso chi è già in un training
  è rifiutato (`non_disponibile`).
- **Aggiornamento di `push-helpers.js`**: il service worker lo carica con `importScripts`, che
  passa dalla cache HTTP del browser (fino a `max-age=600`) e non dal gestore `fetch`. Per essere
  sicuri che i telefoni prendano i testi nuovi insieme al service worker nuovo: `importScripts('push-
  helpers.js?v=12')` e la stessa voce nel `PRECACHE`.
- Bump cache **`ga-pwa-v12`** (oggi `v11`), senza il quale le app già installate terrebbero testi
  e handler vecchi.

### 4.4 App (`src/app.jsx`)

- **Interruttore** in Telepatia e in Impostazioni, stesso stato, con accanto «Il tuo nome sarà
  visibile a tutti quelli che usano l'app.». Accenderlo riusa il flusso push dei rituali (domanda
  nostra → permesso del browser → `register_push_subscription`) e poi chiama
  `set_telepathy_availability`. Se il permesso è negato o l'iscrizione fallisce, l'interruttore
  **resta spento e lo dice**: niente verde finto (rilievo della review del 21/09). Su iPhone senza
  app installata vale la guardia esistente. Spegnerlo chiama la RPC con `false` (la riga sparisce).
- **Lo stato lo decide il server**: all'apertura l'app chiama `renew_telepathy_availability` e
  mostra l'interruttore come dice la risposta, non come ricorda `localStorage`. Con
  `senza_abbonamento` l'app prova una volta a riregistrare l'abbonamento del telefono (se il
  permesso c'è ancora) e poi a rinnovare; se non ci riesce, mostra l'interruttore spento con «Le
  notifiche di questo telefono non sono più attive: riaccendi per ricevere inviti». Da
  `set_telepathy_availability` con `nessun_abbonamento` vale lo stesso messaggio.
- **Deciso in implementazione (01/10/2026) — interruttore e notifiche dei rituali (M4).** Il
  telefono ha **un solo abbonamento**, per rituali e inviti insieme (decisione di Irene, §2.5).
  Quindi: accendere l'interruttore riaccende anche le notifiche dei rituali; **spegnere le
  notifiche dei rituali spegne anche la disponibilità agli inviti** (restare in «Disponibili su
  invito» senza abbonamento sarebbe una promessa falsa); e il rinnovo all'apertura **rispetta la
  scelta esplicita di aver spento le notifiche** (`ga_push_spento`): non riregistra da solo
  l'abbonamento, anche se il permesso del browser c'è ancora. Il rinnovo parte anche quando l'app
  installata torna in primo piano, al massimo una volta all'ora.
- **Lista «Disponibili su invito»** sotto «Online», da `get_invitable_users`. La lista non ripete
  chi è online perché lo esclude già il server. Toccando un nome si apre la **scheda**
  (`get_invite_card` con `p_disponibilita_id`) con «Invita a un training» e «Non voglio più inviti
  da questa persona». Toccando un nome nella lista **Online** si apre la stessa scheda con
  `p_session_online`, con gli stessi due pulsanti.
  **Deciso in implementazione (01/10/2026):** Irene ha confermato che il tocco su un nome in
  «Online» apre la scheda d'invito **al posto del profilo** (§2.5); il profilo si apre dagli
  altri punti dell'app.
- **Deciso in implementazione (01/10/2026) — «online» dipende dall'orologio del telefono (M3,
  rischio accettato).** `telepatia_online` guarda `online_users.last_seen`, che scrive il client
  con l'ora del proprio telefono. Un telefono con l'orologio indietro di oltre 30 s risulta non
  online per il server: non è invitabile dalla lista Online (resta invitabile da «Disponibili su
  invito», se ha l'interruttore acceso), e la durata del suo invito si decide come per chi è
  offline. I telefoni prendono di norma l'ora dalla rete e scarti così grandi sono rari; un
  `last_seen` scritto dal server (trigger) è fuori scope. Lo stesso limite vale per l'attesa di chi
  accetta, che riconosce l'arrivo dell'altro da una presenza vista dopo l'accettazione.
- **Invio**: `sendDirectInvite` passa da `send_telepathy_invite`, **anche per gli inviti a chi è
  online** (con `p_session_online`): una sola strada, un solo insieme di controlli. Spariscono i
  `delete`/`insert` diretti su `telepathy_invites` e l'insert in `notifications`. I motivi della RPC
  diventano messaggi chiari («Hai già un invito in corso», «È già stato invitato, riprova fra
  poco», «Hai mandato troppi inviti, riprova più tardi», «Non è più disponibile»).
  `playAgainSamePartner` passa dalla stessa strada e usa la stessa soglia del server: **30 s**
  (oggi 60 s), così non promette un invito che il server rifiuterebbe. **Prima** del nuovo invito
  chiude il match appena finito con `end_telepathy_match` e **aspetta** la risposta (terzo giro):
  la cancellazione di `resetTelepathy` parte senza attesa, e un match ancora senza `ended_at`,
  giocato da meno di 10 minuti, farebbe rispondere al server `in_match` per il mittente e
  `non_disponibile` per il partner.
- **Attesa di chi invita**: conto alla rovescia calcolato da `expires_at` (45 s o 10 minuti), non
  da un timer locale, quindi resta giusto dopo una riapertura. `pollForMatch` non legge più tutta
  `telepathy_matches`: ogni 2 s chiama `get_my_telepathy_invites` e, quando il mio invito è
  `accepted`, entra **solo nel `match_id`** scritto lì; l'id e il nome del partner li prende dal
  match (`user2_id`, `user2_nickname`). Entrando fa un update del match (per esempio `round_count`
  invariato), che per il trigger vale come attività. Il `setTimeout` di 45 s che cancellava
  l'invito sparisce: a `expires_at` l'app mostra «Scaduto» e libera il pulsante. «Annulla»
  (`cancelDirectInvite`) chiama `cancel_telepathy_invite`.
- **`beforeunload` e `resetTelepathy`**: si toglie **solo** la cancellazione degli inviti in
  uscita (r. 1360 e r. 2454). Chiudere l'app **non ritira più** l'invito. Il resto di
  `beforeunload` resta com'è: cancella il match corrente e la sua chat e la riga in
  `telepathy_queue`. Conseguenza voluta: se chi ha accettato chiude l'app mentre aspetta, il match
  sparisce e chi ha invitato, arrivando dalla notifica, trova il messaggio «L'altra persona non c'è
  più» invece di un match vuoto. `resetTelepathy`, se c'è un invito in uscita `pending`, chiama
  `cancel_telepathy_invite` (uscire volontariamente dalla telepatia ritira l'invito; chiudere l'app
  no).
- **Apertura con `?invito=<id>`**, sul modello di `?ritual=` (r. 1100–1108): **un solo
  `useState`** legge insieme `invito` e `azione`, **poi** toglie l'indirizzo con
  `history.replaceState` (leggerli in due punti farebbe perdere il secondo, già cancellato dal
  primo), valida l'id (forma di uuid) e `azione` (solo `blocca`), e li tiene finché l'identità non
  è pronta (può servire un'entrata come ospite). Lo stesso gestore riceve il `postMessage`
  `apri-invito` del service worker e ne conferma la ricezione. Poi `get_telepathy_invite`:
  - se sono il destinatario e l'invito è `pending` → Accetta / Rifiuta / «Non voglio più inviti da
    questa persona» (con `azione=blocca` si apre direttamente la conferma del blocco);
  - se sono il mittente e l'invito è `accepted` con un `match_id` ancora attivo → **entro in quel
    match**;
  - altrimenti un messaggio che dice **quale** dei casi è: «L'invito è scaduto», «*Nome* non può
    ora», «L'invito è stato ritirato», «L'altra persona non c'è più» — non una schermata vuota.
- **Rientro nel match all'avvio**: anche senza toccare la notifica, se all'apertura
  `get_my_telepathy_invites` dice che il mio invito in uscita è `accepted` da meno di 3 minuti
  (`responded_at`, ora del server) con un `match_id` ancora attivo, ci entro. **Solo in quello**:
  nessuna ricerca di «un match qualunque in cui compaio».
- **Chi accetta aspetta chi ha invitato**: dopo l'accettazione vede «In attesa che *Nome*
  entri…» finché l'altro non compare in `online_users`, **al massimo 3 minuti da `responded_at`**
  (ora del server: una riapertura non riparte da zero, e un test può spostarla). Poi il match si
  chiude con `end_telepathy_match` e si torna alla lobby con un messaggio. In questa attesa **non
  partono né il timeout di inattività A3 (90 s) né il controllo di `checkPartnerLeft` sul
  `last_seen` del partner (35 s)**: chi ha invitato è offline per definizione, e con quel controllo
  l'attesa finirebbe dopo 35 s. Resta attivo il controllo «il match è sparito o ha `ended_at`».
  Appena il partner compare, tornano entrambi i controlli normali.
- **Pulizia dei match in `findPartner`** (r. 1559, secondo giro): non si cancellano più i match
  creati da più di 5 minuti. Si cancellano solo quelli **chiusi** (`ended_at` valorizzato da più di
  un minuto, per lasciare il tempo alla schermata finale) o **inattivi** (`ultima_attivita` più
  vecchia di 10 minuti), oppure **mai giocati** (`giocato = false`) e creati da più di **5
  minuti** — l'attesa massima di chi accetta è 3 minuti, e 5 lasciano un margine per orologi e
  giri di polling (terzo giro): sono gli orfani. Sono tre `delete` separati, ciascuno con i soli
  filtri che il client fatto a mano conosce (`.eq('giocato', false).lt('created_at', …)`,
  `.lt('ended_at', …)`, `.lt('ultima_attivita', …)`). Il passo 1 di `findPartner` (r.
  1561–1566), che entra in qualunque match attivo in cui compaio, **salta i match nati da un
  invito e mai giocati** (`da_invito && !giocato`): così un orfano d'invito non mi risucchia
  mentre cerco un partner. **Non** salta i match casuali mai giocati: nell'abbinamento casuale
  chi è in coda scopre proprio così il match appena creato dall'altro (prima che nessuno abbia
  giocato), e saltarli romperebbe l'abbinamento. Resta vero che un match attivo e già giocato in
  cui compaio mi riprende: è il comportamento di oggi.
- **Il loop presenze** (r. 1470–1484) smette di leggere `telepathy_invites` e di cancellare gli
  inviti vecchi di 2 minuti: legge l'invito in arrivo da `get_my_telepathy_invites`. Lo stesso per
  **`markOneNotifRead`** (r. 2941–2948), che oggi legge direttamente la tabella. La pulizia la fa
  il server.
- **Campanella** (r. 2916 e r. 4036): la costante di 120 s sparisce. Una notifica
  `telepathy_invite` è «viva» solo se `get_my_telepathy_invites` ha un invito in arrivo `pending`
  con `expires_at` nel futuro (ce n'è al massimo uno, §2.2); altrimenti è scaduta e toccarla la
  chiude soltanto. `notifications` non ha l'id dell'invito, per cui non si tenta un collegamento
  riga per riga.
- **Accettazione** (`acceptInvite`): l'ordine resta quello di oggi — **prima** il match (insert
  diretto con `user1_id = from_id` restituito da `get_my_telepathy_invites` e `da_invito: true`;
  fuori scope rifarlo),
  **poi** `respond_telepathy_invite(…, true, match_id)`. Se la RPC rifiuta (scaduto, annullato, già
  accettato da un altro telefono, `in_match`), l'app cancella il match che ha appena creato e
  mostra il motivo. Se l'app si chiude in mezzo, il match resta **orfano**: non è innocuo di per
  sé (il passo 1 di `findPartner` di oggi ci farebbe entrare chiunque dei due), ma con le regole
  sopra non tiene nessuno «in training», non viene preso da `findPartner` e sparisce dopo 5
  minuti.
  **Deciso in implementazione (01/10/2026) — doppia accettazione, lato app.** Se la stessa
  persona accetta da due telefoni o due schede, il secondo insert del match di norma fallisce già
  sul vincolo di coppia: l'app allora chiede lo stato a `get_telepathy_invite` e dice il motivo
  vero («L'invito è già stato accettato») invece di un errore generico. Se invece il match nasce e
  la RPC risponde `gia_accettato`, l'app cancella il match che ha appena creato, come per ogni
  altro rifiuto. Un errore di rete sulla risposta non vale «rifiutato»: prima di cancellare il
  match l'app rilegge l'invito, e se risulta accettato con quel match prosegue. Se qualcosa
  sfugge, il match orfano lo toglie la pulizia dei 5 minuti.
- **Cambi d'identità di un ospite con l'interruttore acceso**: prima di passare al `session_id`
  dell'account — iscrizione (r. 1874), login con password (r. 1802), link magico (r. ~1998) —
  l'app chiama `set_telepathy_availability(vecchio_sid, …, false)` (per un ospite il `session_id`
  basta). Al **logout** (r. 2047, accanto a `spegniPushAlLogout()`) fa lo stesso con il
  `session_id` e la credenziale di chi esce, **prima** di cancellarli: il telefono smette di
  ricevere push, e restare in lista sarebbe una promessa falsa. Se una di queste chiamate fallisce,
  la riga vecchia sparisce comunque dalla lista appena muore il suo abbonamento, o dopo 14 giorni
  senza aperture, e dal database dopo 90.

## 5. Casi limite e comportamento atteso

| Caso | Cosa succede |
|---|---|
| Il destinatario ha bloccato il mittente (o viceversa), con `user_blocks` o con «Non voglio più inviti» | Non compaiono a vicenda nella lista, la scheda risulta non trovata, la RPC rifiuta l'invio anche se il client la chiama lo stesso. |
| Un ospite tocca «Non voglio più inviti da questa persona» sulla notifica | Si apre l'app sulla conferma; confermato, l'invito si chiude come rifiutato senza push, e da lì in poi i due non si vedono più per gli inviti. |
| Qualcuno prova a bloccare usando l'id di un invito non suo | Rifiutato: con l'invito blocca solo il destinatario. |
| Invito a chi è online senza interruttore | Dura 45 s, arriva solo come avviso nell'app, nessuna push e nessun messaggio al mittente. |
| Invito a chi è online con l'interruttore acceso | Dura 45 s; la push parte e, se l'app è in primo piano su Android, il service worker la sopprime. |
| Due persone invitano la stessa destinataria nello stesso istante | Vince la prima (indice unico parziale); la RPC della seconda cattura il conflitto e risponde «È già stato invitato, riprova fra poco». |
| Il destinatario è già in un training | «Non è più disponibile»: l'invito non parte. |
| Il destinatario spegne l'interruttore con un invito aperto | La riga di disponibilità sparisce; l'invito resta valido fino alla scadenza; non ne arrivano di nuovi. |
| L'interruttore è stato spento da un altro telefono | All'apertura il server risponde `spento` e l'app lo mostra spento: il rinnovo non lo riaccende. |
| Il destinatario non apre l'app da 14 giorni | Sparisce dalla lista (filtro su `rinnovata_il`); alla prima riapertura torna disponibile da solo, senza toccare l'interruttore. |
| Il destinatario non apre l'app da 90 giorni | La sua riga si cancella: alla riapertura l'interruttore risulta spento e va riacceso. |
| Qualcuno scrive direttamente in `telepathy_invites` con la chiave pubblica (fra 32a e 32b) | Il trigger di guardia riporta la riga a un invito da 45 s senza push, senza `match_id` e segnato `via_diretta`; la Edge Function non manda niente per quell'invito. |
| Accettato da un'app vecchia (senza `match_id`), fra 32a e 32b | Chi ha invitato con l'app nuova entra nel match attivo in cui è `user1_id`, creato dopo l'invito; funziona solo se ha l'app aperta (nessuna push «accettato» senza `match_id`). |
| Il destinatario accetta dopo la scadenza | La RPC rifiuta: «L'invito è scaduto». L'app cancella il match appena creato. |
| Due accettazioni quasi contemporanee (due telefoni) | La seconda trova `accepted` e viene rifiutata: il passaggio di stato è atomico (e l'insert del secondo match di solito fallisce già sul vincolo di coppia). La RPC risponde `gia_accettato` senza toccare il match e l'app dice «L'invito è già stato accettato». *Deciso in implementazione (01/10/2026).* |
| Chi accetta ha un proprio invito in uscita aperto | La RPC lo annulla sul server; chi l'aveva ricevuto trova «L'invito è stato ritirato». |
| Chi accetta o chi ha invitato è già in un altro training | La RPC rifiuta con `in_match`: nessuno si ritrova in due sessioni. |
| Troppe push allo stesso destinatario (6/ora, o stessa coppia entro 15 minuti) | L'invito si scrive ma senza push; il mittente lo sa. |
| Il mittente disinstalla, o l'abbonamento è morto | La push «accettato» non arriva; chi ha accettato esce dall'attesa dopo 3 minuti. |
| Invito da 45 s rifiutato o scaduto | Nessuna push di ritorno: chi ha invitato era online e lo vede nell'app. |
| Notifica toccata con l'app già aperta | L'app viene messa a fuoco e riceve l'invito per messaggio, senza ricaricarsi; se non risponde entro ~1 s, la pagina viene ricaricata sull'invito. |
| Notifica toccata durante un training | Il training continua; compare un avviso con solo «Rifiuta». |
| Chi ha accettato chiude l'app mentre aspetta | `beforeunload` cancella il match; chi ha invitato, arrivando, legge «L'altra persona non c'è più». |
| Un training lungo | Continua finché i due giocano: nessuno lo cancella più a 5 minuti dalla nascita. Si chiude dopo 10 minuti senza nessun aggiornamento. |
| App vecchia in cache, fra la 32a e la 32b | Continua a funzionare come oggi con le policy aperte (vedi §8, passo 2). |
| App vecchia in cache, dopo la 32b | Letture e scritture dirette su `telepathy_invites` falliscono o tornano vuote: l'app vecchia non vede e non manda inviti finché non si aggiorna (~10 minuti + chiudi e riapri). Accettato. |
| Invito di un'app vecchia (`via_diretta`) accettato, rifiutato o scaduto | Nessuna push di ritorno: il service worker vecchio la mostrerebbe come un rituale. *Deciso in implementazione (01/10/2026).* |
| Un'app vecchia prova a chiudere o riaprire un invito con una scrittura diretta | Il trigger di guardia lo rifiuta: da fuori vale solo `pending` → `accepted`/`declined`. *Deciso in implementazione (01/10/2026).* |
| Spengo le notifiche dei rituali | Si spegne anche la disponibilità agli inviti (un solo abbonamento per telefono), e il rinnovo all'apertura non la riaccende. *Deciso in implementazione (01/10/2026).* |
| Il telefono di chi è online ha l'orologio indietro di oltre 30 s | Il server non lo vede online: non è invitabile da «Online», resta invitabile da «Disponibili su invito» se ha l'interruttore acceso. Rischio accettato. *Deciso in implementazione (01/10/2026).* |
| Ospite con l'interruttore acceso che crea l'account, fa login o logout | La disponibilità del `session_id` vecchio viene spenta dall'app prima del cambio; va riaccesa dall'account. I «Non voglio più inviti» impostati da ospite restano legati al vecchio `session_id` e non seguono l'account. Stesso limite già scritto per le push dei rituali. |

## 6. Sicurezza — cosa si chiude e cosa resta aperto

**Si chiude (con la 32b)**
- Scritture **e letture** dirette su `telepathy_invites`: solo RPC. La lettura passa da
  `get_my_telepathy_invites` e `get_telepathy_invite` e non da una SELECT aperta perché la tabella
  lega nomi e `session_id` (`to_id`): lasciarla leggibile trasformerebbe ogni invito in una mappa
  «nome → `session_id`» e renderebbe inutile l'identificativo opaco della lista. Le due RPC
  restituiscono un `session_id` altrui in **un solo caso**: `from_id` dell'invito `pending`
  indirizzato a chi chiede, che serve a creare il match e che quella persona vede comunque in
  `online_users` e poi nel match.

**Si chiude (già con la 32a)**
- Impersonazione di un iscritto: ogni RPC chiamata con un `session_id` vuole la sua credenziale
  (stesso cancello della 30_) e i nomi vengono dal profilo.
- Evasione del blocco via invito, nei due sensi, lato server, e ora anche per gli ospiti. Il
  blocco tramite un invito lo può fare solo chi l'ha ricevuto.
- Spam di inviti: 1 aperto per mittente, 1 aperto per destinatario, 10 all'ora per mittente, e
  per chi ha l'interruttore al massimo 6 push d'invito all'ora e 1 per coppia ogni 15 minuti.
- Notifiche `telepathy_invite` e `telepathy_declined` scritte dall'app nuova: le scrive la RPC.
- La lista «Disponibili su invito» non espone `session_id`, e la scheda non espone mai `user_id`
  (che per un iscritto è l'email): dalla 27_ anon non legge più `telepathy_scores.user_id`, e la
  scheda passa da una RPC `SECURITY DEFINER` che non lo restituisce. Il percorso con il `session_id`
  vale solo per chi è online da meno di 30 s: con un `session_id` qualunque non si leggono schede e
  non si mandano inviti a persone offline.

**Chiuso nel frattempo (non più un rischio di questo lavoro)**
- L'esposizione di `profiles` segnalata nella prima stesura (policy `Allow all` e
  `password_hash` leggibile da anon) è **chiusa dalla 27_/27b, applicate il 29/09**: la policy è
  stata sostituita da una lettura pubblica delle sole colonne pubbliche, `password_hash` ed
  `email` non sono più leggibili, e la 27b ha azzerato le credenziali degli iscritti (gli iscritti
  veri erano 3 e sono stati avvisati).

**Resta aperto, scritto e non nascosto**
- **Ospiti: il `session_id` resta l'unica prova d'identità (rischio accettato, come nella 28_ e
  nella 30_).** Chi conosce il `session_id` di un ospite può mandare inviti, rispondere, accendere
  o spegnere la disponibilità e impostare «Non voglio più inviti» a suo nome. I `session_id` sono
  ancora leggibili da chiunque in `online_users`, `telepathy_matches` e `rituals.candles`:
  l'identificativo opaco della lista toglie l'elenco comodo «chi è raggiungibile → come
  impersonarlo», non rende segreto il `session_id`. Un ospite non può però usare il nome di un
  iscritto (`nome_pubblico` lo trasforma in `'Anonymous'`), salvo gli omoglifi, come nella 30_.
- **Il collegamento opaco ↔ `session_id` quando la persona è online**: chi è online sparisce da
  «Disponibili su invito» e compare in «Online» con il suo `session_id` (da `online_users`, aperta).
  Guardando le due liste nel tempo, lo stesso nickname collega l'identificativo opaco al
  `session_id`. L'identificativo opaco protegge quindi chi resta offline, non chi entra nell'app.
- **I payload delle push viaggiano verso chiunque abbia registrato un abbonamento sotto quel
  `session_id`**: `register_push_subscription` (24_) non prova l'identità. Chi registra un
  abbonamento sotto il `session_id` di un altro riceve gli inviti destinati a lui, con **id
  dell'invito e nome di chi invita**. Con l'id e lo stesso `session_id` può anche rispondere, se la
  vittima è un ospite (per un iscritto serve la credenziale). Stesso limite già accettato per le
  push dei rituali, qui con dati un po' più personali.
- **`telepathy_matches` resta aperta a tutti**: chiunque può inserire un match finto con il
  `session_id` di un altro e tenerlo «vivo» con degli update. Effetti: con le regole nuove il match
  finto conta come training (dopo il primo update) e fa rispondere `non_disponibile` / `in_match`
  per quella persona finché resta attivo; il passo 1 di `findPartner` la fa entrare in quel match
  quando cerca un partner (come oggi). Senza il limite fisso dei 5 minuti, un match finto tenuto
  aggiornato dura quanto vuole chi lo aggiorna. Il danno è un disturbo (niente dati letti), e si
  chiude solo chiudendo `telepathy_matches`, fuori scope (§9).
- Il blocco `user_blocks` si fa sul nickname: un ospite bloccato così può ricomparire con un altro
  nickname. «Non voglio più inviti» si fa sul `session_id`: un ospite può ricomparire con un
  `session_id` nuovo. I tetti ne limitano l'uso su scala.
- `notifications` e `online_users` restano aperte a tutti: fuori scope.
- La Edge Function è invocabile con la chiave pubblica: rilegge sempre lo stato, quindi il danno
  possibile è solo carico, e risponde 2xx a chi la chiama a vuoto.
- Fra la 32a e la 32b l'accesso diretto a `telepathy_invites` resta aperto per le app vecchie:
  si possono ancora **leggere** tutti gli inviti (la mappa nome → `session_id` che la 32b chiude),
  scrivere inviti da 45 s senza push e cambiarne lo stato (per esempio chiudere l'invito di un
  altro). Quello che la finestra **non** permette più, grazie al trigger di guardia (§4.1 punto
  5): far partire una push, scrivere un `match_id`, allungare una scadenza, segnare un invito come
  già avvisato o già saltato. La tenuta resta breve (§8).

## 7. Test

Gli stessi tipi di prova dei lavori del 17, del 21 e del 29/09. **Ogni test si lancia con
`NODE_OPTIONS="--require ./scripts/test-silenzioso.js"`.**

- **Baseline prima di toccare il codice** (lezione del 03/06): si misura lo stato di
  `test-inviti-telepatia.js` (rosso preesistente) e di tutta la regressione qui sotto.
- **`test-inviti-offline-sql.js`** — le RPC in locale con `scripts/pg-locale.js` (PGlite), senza
  toccare Supabase. Lo schema minimo si estende con:
  - `telepathy_invites` (colonne del catalogo), `telepathy_matches` (con `created_at`, `ended_at`,
    `round_count`), `user_blocks`, `online_users`, `telepathy_scores`, `notifications` e le
    **colonne vere di `profiles`**;
  - **tutte le tabelle toccate da `delete_my_account` ed `export_my_account`** (anche
    `consciousness_posts`, `consciousness_comments`, `ritual_comments`, `private_messages`,
    `magic_links`, `password_resets`, `telepathy_queue`, `ritual_presence`, `content_reports`),
    altrimenti le due funzioni non si possono eseguire;
  - uno schema **`net`** finto con una `http_post` che registra le chiamate in una tabella, per
    contare le push chieste; uno schema **`cron`** finto (`cron.job`, `cron.schedule`,
    `cron.unschedule`) perché la 32a possa ridefinire il job;
  - la catena 28_ → 32a → 32b caricata dai file veri.
  Casi, uno o più per ogni rilievo:
  - identità: un iscritto senza credenziale o con quella sbagliata riceve `Auth failed` da ogni
    RPC nuova; un ospite passa con il solo `session_id`; i nomi scritti negli inviti sono quelli
    del profilo anche se il client ne manda un altro; un ospite che si dà il nome di un iscritto
    diventa `'Anonymous'`; `nome_pubblico` e la pulizia dentro `toggle_ritual_candle` danno lo
    stesso risultato su una batteria di nomi (invisibili, NFKC, spazi, 50 caratteri);
  - identificativi: `p_session_online` di chi non è visto da più di 30 s → non trovato, per
    scheda, invio e blocco; `p_disponibilita_id` inesistente → non trovato; entrambi valorizzati →
    `dati_non_validi`;
  - lista e scheda: nessuna delle due restituisce `session_id`, `user_id` o email; la lista
    esclude me, i blocchi nei due sensi (`user_blocks` e `telepathy_invite_blocks`), chi non ha
    abbonamenti, chi non rinnova da più di 14 giorni, chi è online, chi è in un training; la
    scheda di un ospite funziona; con `show_telepathy_score = false` prove e indovinate sono
    `null`;
  - disponibilità: accendere senza abbonamento → `nessun_abbonamento`; spegnere cancella la riga;
    `renew` aggiorna `rinnovata_il` solo se la riga c'è, non la crea mai, e risponde `spento` /
    `senza_abbonamento` quando serve;
  - invio: rifiutato per blocco, verso chi non è disponibile, verso chi è in un training
    (`non_disponibile`), verso me stesso, con un invito aperto del mittente, con un invito aperto
    verso il destinatario (`gia_invitato`), oltre i 10/ora, con il mittente in un training;
    `expires_at` = 45 s se il destinatario è online, 10 minuti se no; **online senza riga di
    disponibilità → nessuna chiamata a `net.http_post`, `push_saltata = false`, non conta nel
    tetto**; con la riga: oltre 6 push/ora o entro 15 minuti per la stessa coppia l'invito si
    scrive con `push_saltata` e nessuna chiamata, altrimenti esattamente una chiamata; la riga in
    `notifications` la scrive la RPC;
  - conflitto 23505: la vera concorrenza in PGlite non si prova. Si prova la **traduzione**
    dell'errore con un inserimento forzato — un trigger di test che, subito prima dell'insert
    della RPC, scrive la riga in conflitto — per ciascuno dei due indici (`invito_in_corso`,
    `gia_invitato`), e che in quel caso **non** parte nessuna `http_post`. Il trigger di test è
    **protetto con `pg_trigger_depth()`** (agisce solo a profondità 1): il suo stesso insert
    altrimenti lo rifarebbe scattare all'infinito;
  - migration: con due `pending` per lo stesso destinatario già presenti, la 32a passa (li
    normalizza tutti) e l'indice si crea; rilanciata con un invito vivo, non lo chiude;
  - trigger di guardia: da `anon`, un insert con `con_push = true`, `match_id`, `expires_at` fra un
    anno, `status = 'accepted'` diventa un `pending` da 45 s, senza push, senza `match_id`,
    `via_diretta = true`; un update da `anon` cambia solo lo stato e riempie `responded_at`; un
    update da `anon` che prova a scrivere `match_id` lo lascia com'era; le RPC scrivono tutte le
    colonne normalmente;
  - Edge Function (logica pura, in Node): la decisione «invito» senza riga di disponibilità del
    destinatario non manda niente;
  - accesso diretto, dopo la 32b: insert, update, delete **e select** di anon su
    `telepathy_invites` rifiutati o vuoti; prima della 32b, ancora permessi (la tenuta);
    `expire_telepathy_invites` mai eseguibile da anon;
  - risposta: solo il destinatario, solo entro la scadenza, una volta sola; `accept` senza
    `match_id` valido o con un match di un'altra coppia rifiutato; `accept` salva `match_id` e
    `responded_at`, annulla gli inviti in uscita di chi accetta, rifiuta con `in_match`; `decline`
    scrive la notifica e chiede la push `rifiutato` solo per un invito da 10 minuti;
  - training e orfani: `telepatia_in_training` è falso per un match mai aggiornato e non legato a
    un invito, vero dopo un update o con un invito `accepted`, falso dopo 10 minuti senza update o
    con `ended_at`; il trigger aggiorna `ultima_attivita` a ogni update, mette `giocato = false`
    all'insert (anche se il client manda `true`) e `true` al primo update; le righe già presenti
    prima della migration risultano `giocato = true`;
  - `get_my_telepathy_invites` / `get_telepathy_invite`: `from_id` solo al destinatario
    dell'invito `pending`, **mai il `to_id` al mittente**, nessun `session_id` altrui negli altri
    casi; un invito non mio è «non trovato»; gli scaduti vengono segnati `expired`;
  - annullamento solo dal mittente; «Non voglio più inviti» con l'invito solo dal destinatario (dal
    mittente o da un terzo: rifiutato), con l'identificativo opaco e con il `session_id` di chi è
    online, anche per un ospite, efficace nei due sensi;
  - scadenze: `expire_telepathy_invites` segna gli scaduti, restituisce quelli da 10 minuti
    (anche se segnati da `get_my_telepathy_invites`), pulisce le righe chiuse di più di un giorno
    e le disponibilità di più di 90 giorni; una disponibilità di 20 giorni resta nel database,
    non compare in lista e `renew` la riporta in lista;
  - `delete_my_account` porta via disponibilità e blocchi impostati da me (non quelli subiti) e
    continua a fare tutto ciò che faceva la 31_; `export_my_account` contiene inviti, disponibilità
    e blocchi.
- **`test-push-helpers.js`** esteso: i quattro tipi nuovi in it/en, ripieghi su payload storti,
  tipo sconosciuto → testo neutro (non più un testo di rituale), `reminder`/`start` invariati,
  `tag` e `url`.
- **`test-push-esito.js`** aggiornato al nuovo percorso `_shared/esito.mjs`, stessi casi (passo 0).
- **`test-inviti-offline-ui.js`** (browser, due sessioni, **contro produzione** come gli altri test
  UI): interruttore che resta spento se il permesso è negato e che segue lo stato del server; frase
  sul nome visibile; lista e scheda (anche dalla lista Online); conto alla rovescia da `expires_at`
  (45 s con destinatario online); apertura con `?invito=` dal lato di chi riceve (Accetta, e
  `azione=blocca`) e dal lato di chi ha invitato (entra nel `match_id`, con l'id del partner preso
  dal match); chi accetta resta in attesa oltre i 35 s e i 90 s senza essere buttato fuori, ed esce
  a 3 minuti; messaggi distinti per scaduto, rifiutato, annullato; campanella che segue
  `expires_at`; un training che supera i 5 minuti non viene cancellato.
  - **I tempi del server si spostano dal test**, non si aspettano: con la chiave di servizio (da
    `.env.local`, mai nel repo) il test porta indietro `expires_at` e `responded_at` delle proprie
    righe e `ultima_attivita` dei propri match. Tre minuti e dieci minuti diventano pochi secondi.
  - **Rischio dichiarato: il test gira sul database e sulla Edge Function veri.** Per il tempo del
    test le sue righe di disponibilità sono **visibili a utenti veri** nella lista «Disponibili su
    invito», che possono perfino invitarle. Contromisure: nickname di test riconoscibili (prefisso
    fisso, come negli altri test), disponibilità accese solo per i passi che servono e **pulizia
    immediata** (in un `finally`, con la chiave di servizio) di disponibilità, inviti, match,
    blocchi, notifiche e abbonamenti di test; il test si lancia in orari tranquilli. Le push
    passano dalla Edge Function vera verso gli abbonamenti del browser di test; un abbonamento di
    test che il servizio push rifiuta viene cancellato da `esito.mjs`, che è il comportamento
    previsto.
- **Test esistenti da riscrivere dopo la 32b**: `test-inviti-telepatia.js` (pulizia diretta,
  r. 76–77) e `test-telepathy.js` (pulizia diretta, r. 50–51; lettura di debug, r. 406) leggono e
  cancellano `telepathy_invites` con la chiave pubblica: dopo la 32b non funzionano più. Si
  riscrivono con la chiave di servizio per la pulizia e con le RPC per le letture, nello stesso
  lavoro della 32b.
- **Regressione**: `test-rituali-*.js`, `test-candela-stanza-sql.js`, `test-push-esito.js`,
  `test-push-*.js`, `test-inviti-telepatia.js`, `test-telepathy*.js`, `test-moderazione*.js`,
  `test-account-gdpr.js`, `test-account-rpc.js`.
- **Non automatizzabile, dal vivo**:
  - dopo la ripubblicazione di `notify-ritual-start` (passo 0), la prova delle notifiche dei
    rituali: promemoria e avvio arrivano e aprono il rituale giusto;
  - la consegna vera delle push d'invito, con due telefoni, uno con l'app chiusa: invito,
    accettato, rifiutato, scaduto; l'app aperta in primo piano non mostra la notifica su Android;
    l'azione «Non voglio più inviti» sulla notifica; il tocco sulla notifica con l'app aperta.

## 8. Rilascio in due tempi (decisione di Irene, 30/09)

Obiettivo: nessun momento in cui gli inviti smettono di funzionare, né per chi ha l'app nuova né
per chi ha ancora quella vecchia in cache. Le migration le lancia Irene
(`node scripts/apply-sql.js`); le Edge Function si pubblicano con `scripts/deploy-push.js`.

**Passo 0 — spostare `esito.mjs` e ripubblicare `notify-ritual-start`.**
Da solo, prima di tutto il resto: `esito.mjs` in `supabase/functions/_shared/`, import aggiornato
in `notify-ritual-start`, `test-push-esito.js` aggiornato e verde, token con il permesso Edge
Functions controllato, pubblicazione, poi **prova dal vivo di un rituale** (promemoria e avvio
arrivano e aprono il rituale giusto) e nessun avviso della sentinella nei 20 minuti dopo.
*Ritorno indietro*: ripubblicare la versione precedente di `notify-ritual-start` (il commit prima
dello spostamento) con lo stesso script.

**Passo 1 — pubblicare `notify-telepathy-invite`.**
`scripts/deploy-push.js` esteso alla funzione nuova. Nessuno la chiama ancora: pubblicarla prima
della 32a evita che il job del cron riceva 404. Prova: una chiamata a vuoto risponde 200
`{ignorato:true}`.
*Ritorno indietro*: nessun effetto sugli utenti; si ripubblica o si lascia lì inerte.

**Passo 2 — migration 32a** (tabelle, colonne, indici, trigger, RPC, cron, `delete_my_account`,
`export_my_account`), **con le policy vecchie di `telepathy_invites` ancora aperte**.
Da qui al passo 4 c'è la **tenuta**, da tenere breve (un giorno o poco più). Cosa fanno in quel
tempo le app vecchie:
- mandano inviti con insert diretti: funzionano come oggi, con `expires_at` di default a 45 s e
  senza push. Se il mittente o il destinatario ha già un invito aperto l'insert urta l'indice unico
  e fallisce: l'app vecchia libera il pulsante senza dirlo (oggi l'avrebbe duplicato);
- **cancellano gli inviti a sé indirizzati più vecchi di 2 minuti** (r. 1482): se una persona ha
  ancora l'app vecchia aperta, un invito da 10 minuti arrivato per lei sparisce dopo 2 minuti. Di
  solito non succede, perché la disponibilità si accende solo dall'app nuova e chi è online riceve
  inviti da 45 s;
- **cancellano i propri inviti in uscita alla chiusura** (r. 1360) e a `resetTelepathy` (r. 2454):
  riguarda solo inviti mandati da loro stesse, quindi niente cambia rispetto a oggi;
- accettano con un update diretto **senza `match_id`**: chi ha invitato con l'app nuova vede
  `accepted` senza `match_id`. Solo durante la tenuta l'app nuova, in quel caso, entra nel
  **match attivo (senza `ended_at`) con `user1_id` = il proprio `session_id`, creato dopo
  l'invito** (`created_at` del match ≥ `created_at` dell'invito): l'app vecchia crea il match con
  `user1_id = from_id`, e chi ha invitato non conosce il `to_id`. Il ripiego **funziona solo con
  l'app di chi ha invitato aperta**: un'app vecchia vede e accetta solo inviti mentre è aperta
  (quindi, di norma, inviti da 45 s), e la push «accettato» non parte senza `match_id`. Dichiarato,
  non risolto: chi ha chiuso l'app ritrova l'invito come «accettato» ma non entra. Il ripiego si
  toglie con la 32b.
- il nuovo trigger su `telepathy_matches` e la pulizia per inattività non cambiano niente per loro,
  salvo che la loro `findPartner` continua a cancellare i match più vecchi di 5 minuti: finché ci
  sono app vecchie in giro, un training lungo può ancora essere interrotto da loro.
*Ritorno indietro*: rilanciare la 23_ (il job torna com'era, senza la seconda chiamata); se gli
indici unici o il `CHECK` danno problemi alle app vecchie, toglierli con uno script già pronto
(`32a_ritorno.sql`, scritto nel piano ma non applicato); tabelle, colonne e RPC nuove si possono
lasciare, sono inerti senza l'app nuova.

**Passo 3 — test e rilascio dell'app** (app.jsx, `push-helpers.js`, `sw.js` con `ga-pwa-v12` e
`push-helpers.js?v=12`).
Test di §7 verdi (quelli SQL con la 32a e la 32b in locale), merge della MR, attesa dei ~10 minuti
della cache più chiudi e riapri, poi prova dal vivo con due telefoni.
*Ritorno indietro*: MR di revert su `main` **con un nuovo bump della cache (`ga-pwa-v13`)**,
altrimenti le app installate resterebbero sul codice ritirato. Il database resta alla 32a e l'app
vecchia continua a funzionare grazie alle policy aperte.

**Passo 4 — migration 32b, almeno un giorno dopo il passo 3**: chiude l'accesso diretto a
`telepathy_invites`, dopo aver rinormalizzato i `pending` (§4.1 punto 5). Si applica quando
**nelle ultime 24 ore non c'è nessuna riga con `via_diretta = true`** (la query è nel piano): è il
segno che le app vecchie non scrivono più. Nello stesso lavoro: via il ripiego «accettato senza
`match_id`» dall'app e riscrittura di `test-inviti-telepatia.js` e `test-telepathy.js`.
*Ritorno indietro*: `32b_ritorno.sql`, scritto nel piano e non applicato, che rimette le policy e
i privilegi di prima (li abbiamo letti dal catalogo il 25/09).

## 9. Fuori scope

- Appuntamenti a orario, filtri, ricerca (decisione di Irene).
- Rifare la creazione dei match (`telepathy_matches`) con una RPC, e chiudere `telepathy_matches`.
  **Nello scope** entrano solo la colonna `ultima_attivita` con il suo trigger e la regola di
  pulizia di `findPartner` (decisione 2 del secondo giro).
- Chiudere `notifications`, `online_users` (anche queste aperte a tutti).
- Ridefinire `toggle_ritual_candle` perché usi `nome_pubblico`: rientrare nella catena 28_ → 31_
  per un cambio che non modifica il comportamento non vale il rischio in questo lavoro. Finché non
  si fa, le due copie sono tenute uguali dal test di §7.
- Far provare l'identità a `register_push_subscription` (limite della 24_, §6).
- Una lista «persone da cui non voglio inviti» con la possibilità di toglierle (vedi §10).

## 10. Punti ancora aperti

- **Togliere un «Non voglio più inviti»**: oggi non c'è un posto dove rivederli e annullarli, per
  gli ospiti nemmeno in futuro senza un'interfaccia nuova. Da decidere con Irene se serve per il
  lancio.
- **Valori proposti da confermare con Irene**: tetti per destinatario (6 push all'ora, 1 per
  coppia ogni 15 minuti) e soglia d'inattività di un training (10 minuti).
- ~~**Durata della tenuta**~~ — deciso al terzo giro: almeno un giorno dopo il passo 3 **e**
  nessuna riga `via_diretta = true` nelle ultime 24 ore (§8 passo 4).
- **Testo della sentinella**: l'email di `alert-cron` parla solo di «notifiche di avvio rituale»;
  con due chiamate nello stesso job varrebbe la pena renderlo generico (una riga, fuori da queste
  migration).
