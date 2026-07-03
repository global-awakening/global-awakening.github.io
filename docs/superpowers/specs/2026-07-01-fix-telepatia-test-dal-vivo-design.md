# Spec — Fix bug telepatia dal test dal vivo (2026-07-01)

**Data:** 2026-07-01
**Origine:** test dal vivo con Claudio (fratello, secondo tester). 9 problemi raccolti durante la sessione.
**Stack:** React single-file (`src/app.jsx` → build `app.js`), Supabase (RPC + RLS), GitHub Pages.

## Obiettivo

Risolvere i 9 problemi emersi nel test, raggruppati in 3 filoni + 1 notifica. Priorità assoluta: **nessun utente deve restare bloccato in una sessione di telepatia**, e **le statistiche del profilo devono essere vere e coerenti** ovunque vengano mostrate.

I fix sono ordinati per priorità: prima i critici di stallo/desync (Filone A), poi profilo/statistiche (Filone B), poi layout (Filone C), infine la notifica (Bug 1).

## Contesto codice (fondato sul sorgente reale)

Riferimenti a `src/app.jsx` al 2026-07-01 (le righe possono spostarsi con le modifiche):

- Stato sessione: `partner` (r.728), `role` (r.729), `effectiveRole` = `roleForRound(role, roundCount)` (r.752, swap ogni 3 round), `roundCount` (r.747), `sessionMatches` (r.753), `matchId` (r.738), `sessionEnded` (r.781), `partnerDisconnected` (r.782), `senderHasSent` (r.784).
- Ingresso sessione: `acceptInvite()` (r.2101-2143) crea record `telepathy_matches`.
- Uscita/reset: `endSession()` (r.2263-2308, idempotente), `resetTelepathy()` (r.2025-2055).
- Inviti: `sendDirectInvite()` (r.2061-2089), auto-expiry 45s (r.1970), `declineInvite()` (r.2145-2154). Toast invito (r.4235-4268).
- Rilevamento fine sessione: `pollResult()` ogni 2s (r.1793-1877), `checkPartnerLeft()` ogni 2s (r.1897-1917, stale a >35s). **Nessun flag "ended" esplicito su DB — ogni client decide da solo.**
- Gating griglia receiver: r.3711-3727; `disabled={!senderHasSent}` (r.3720); polling `sender_symbol` (r.1987-2000).
- Modale profilo: `openProfile()` (r.2319-2359); stats da `profiles.telepathy_score`/`telepathy_best` (r.2333-2334); render (r.4126-4137, "Rounds Played" = `telepathyScore`, "Match %" = `telepathyBest/telepathyScore`).
- Totali storici: `telepathy_scores` (`rounds_count`/`matches_count`), letti al login (r.1004-1005), aggiornati via RPC `increment_telepathy_score` a fine sessione (r.2276). **Fonte diversa da quella della modale profilo → discrepanza.**
- Toggle show score: stato `showTelepathyScore` da `localStorage.ga_show_telepathy` (r.938-941); onClick salva solo in localStorage (r.3888-3893); va su DB solo con `saveProfile()` (r.2215). Modale rispetta `showTelepathyScore !== false` (r.4126).
- Griglia avatar: `gridTemplateColumns: repeat(10, 1fr)` fissa (r.3924), non responsive.

---

## Filone A — Stato sessione telepatia (bug 2, 4, 5, 9) — CRITICO

**Radice comune:** la fine sessione non è uno stato condiviso; ogni client la deduce via polling, quindi i due possono divergere e uno resta appeso senza via d'uscita.

### A1. Flag "ended" condiviso sul DB (bug 9 — desync)
- **Cambiamento:** aggiungere a `telepathy_matches` le colonne `ended_at timestamptz` ed `ended_by text` (session_id di chi ha chiuso). Chi esce o termina imposta il flag; entrambi i client, nel polling già esistente (`pollResult`/`checkPartnerLeft`, 2s), rilevano `ended_at` non nullo e chiudono la sessione in modo identico.
- **DB:** migration SQL (nuovo file `migrations/11_*.sql`) + eventuale RPC per settare il flag rispettando il pattern SECURITY DEFINER / trustful già usato (session_id). **Da applicare in Supabase Studio solo dopo ok esplicito dell'utente.**
- **Criterio di fatto:** simulando la chiusura da un lato, l'altro client rileva la fine entro ≤1 ciclo di polling e torna in stato usabile (lobby). Test automatico che verifica lettura del flag da entrambi i lati.

### A2. Bottone "Esci" sempre visibile (bug 5 — stallo)
- **Cambiamento:** in tutte le fasi di attesa (waiting for level choice, choosing game mode, waiting for symbol; r.3711-3727) rendere sempre un pulsante "Esci"/"Abbandona" che chiama `resetTelepathy()` (+ marca `ended_at` via A1). Oggi in quelle fasi non esiste alcuna uscita.
- **Criterio di fatto:** in ogni schermata della vista Telepathy esiste un controllo visibile che riporta alla lobby; verificato manualmente e con smoke test UI.

### A3. Auto-timeout di inattività
- **Cambiamento:** se la sessione non progredisce entro una soglia (proposta: 60–90s senza azione del partner atteso), chiuderla automaticamente per entrambi (usando A1). Coerente con l'auto-expiry inviti a 45s.
- **Criterio di fatto:** dopo la soglia senza attività, entrambi i client escono dalla sessione senza intervento manuale.

### A4. Gating griglia Receiver dall'inizio (bug 4)
- **Cambiamento:** garantire che `senderHasSent` sia `false` all'inizio di ogni round/sessione e che la griglia (r.3718-3720) resti bloccata finché il polling (r.1987) non conferma `sender_symbol`. Eliminare la finestra iniziale in cui il Receiver può cliccare (reset esplicito di `senderHasSent` all'entrata in sessione/nuovo round, prima che parta il polling).
- **Criterio di fatto:** da Receiver, appena entrato in un round, i simboli e il pulsante Confirm sono disabilitati; si abilitano solo dopo l'invio del Sender. Test role-aware.

### A5. Accept da schermata "sessione conclusa" (bug 2)
- **Cambiamento:** `acceptInvite()` (r.2101) deve eseguire il reset completo dello stato precedente (equivalente a "Back to lobby"/`resetTelepathy`) **prima** di creare/entrare nella nuova sessione, così l'accettazione funziona anche dalla schermata "X ended the session".
- **Criterio di fatto:** dalla schermata di sessione conclusa, premere Accept su un nuovo invito porta direttamente nella nuova sessione senza dover passare da "Back to lobby". Test sul flusso invito→accept post-sessione.

---

## Filone B — Profilo & statistiche (bug 6, 7)

### B1. Statistiche da un'unica fonte coerente (bug 6)
- **Decisione di prodotto:** Card 1 = **Round giocati** (`telepathy_scores.rounds_count`), Card 2 = **Match %** reale (`matches_count / rounds_count`, arrotondato; 0% se 0 round). Stessa fonte e stessa semantica ovunque.
- **Cambiamento:** modale profilo (`openProfile`, r.2319-2359; render r.4126-4137) ed Edit Profile (r.3876-3883) leggono entrambe da `telepathy_scores`. Correggere le etichette (oggi "Rounds Played" mostra `telepathy_score`). Dismettere l'uso incoerente di `profiles.telepathy_score`/`telepathy_best` per queste due card.
- **Lettura stats altrui:** per la modale profilo di un altro utente serve poter leggere `rounds_count`/`matches_count` di quell'utente. Da definire nel piano: RPC dedicata (es. `get_public_telepathy_stats(nickname)` SECURITY DEFINER) oppure vista/colonne pubbliche su `profiles` mantenute in sync. Rispettare il pattern sicurezza esistente (no SELECT pubbliche larghe).
- **Criterio di fatto:** i numeri mostrati nella modale profilo e in Edit Profile coincidono tra loro e con i totali reali del giocatore; Match % = matches/rounds. Test dedicato sulla fonte unica.

### B2. Toggle "Show telepathy score" effettivo e persistente (bug 7)
- **Cambiamento:** il toggle (r.3888-3893) deve avere effetto immediato e persistito in modo affidabile (localStorage per feedback immediato + salvataggio su DB del flag `show_telepathy_score`, senza dipendere dal fatto che l'utente prema "Salva profilo"). La modale profilo (r.4126) deve rispettare il flag per gli utenti registrati; per i guest chiarire il comportamento (flag locale al dispositivo, accettato come limite noto se non sincronizzabile).
- **Criterio di fatto:** attivando/disattivando il toggle, la visibilità delle statistiche nel profilo pubblico cambia coerentemente e persiste al reload. Verifica manuale + test dove applicabile.

---

## Filone C — Layout desktop (migl. 3, 8)

### C1. Telepatia in un viewport senza scroll (migl. 3)
- **Cambiamento:** compattare la vista Telepathy (titolo "Telepathy Training" + sottotitolo, spaziature, dimensione celle) così che header + card partner/stats + griglia simboli (fino a **9**) stiano in un viewport desktop senza scroll verticale. Griglia responsive che si adatta al numero di simboli (3/5/7/9). Non rompere il mobile.
- **Criterio di fatto:** su desktop (risoluzione tipica ~1366×768 e superiori), a 9 simboli tutta l'area di gioco è visibile senza scrollare. Verifica con screenshot.

### C2. Griglia avatar responsive in Edit Profile (migl. 8)
- **Cambiamento:** sostituire `gridTemplateColumns: repeat(10, 1fr)` (r.3924) con layout responsive (`repeat(auto-fill, minmax(…))` o flex-wrap) e rimuovere l'overflow orizzontale della modale, così tutti gli avatar sono visibili senza scroll laterale. Verifica desktop + mobile.
- **Criterio di fatto:** nessuno scroll orizzontale nella modale Edit Profile; tutti gli avatar visibili e cliccabili a larghezze da mobile stretto a desktop.

---

## Bug 1 — Notifica "EXPIRED" dismissibile al click

- **Cambiamento:** la card notifica di invito scaduto (`isExpiredInvite`, r.2404; testo r.3067) deve essere chiudibile **cliccando sulla card stessa**, non solo tramite il pulsante OK. Aggiungere l'handler di dismiss sull'onClick della card (mantenendo anche OK).
- **Criterio di fatto:** cliccando sulla notifica EXPIRED, questa scompare e il contatore campanella si aggiorna. Verifica manuale.

---

## Strategia di verifica (3 livelli)

1. **Test automatici (io):**
   - Prima di toccare, registrare la **baseline** dei test telepatia (`test-telepathy.js`, `test-inviti-telepatia.js`, `test-telepathy-role-rotation.js`, ecc.). Nota: **Test 7 "campanella" è già rosso/obsoleto** (flusso superato da polling/modal) → non è una regressione.
   - Aggiungere/estendere test per: gating receiver iniziale (A4), accept post-sessione (A5), lettura flag `ended` da entrambi i lati (A1), fonte unica statistiche (B1).
   - Criterio: suite verde (salvo il Test 7 noto) prima di considerare completo.
2. **Revisione di un agente indipendente:** un subagent separato (non auto-critica) verifica l'implementazione contro i criteri di "fatto" di questa spec e i confini.
3. **Code review post-implementazione:** `/code-review` (o `/review`) sul diff prima del merge, con attenzione a SQL safety della migration A1 e ai confini di sicurezza (RPC stats B1).

## Confini (cosa NON fare)

- Nessun refactor non collegato a questi 9 punti.
- Nessuna riscrittura dell'auth JWT (resta out-of-scope, cfr. B1 storico del progetto).
- Modifiche al DB (A1, e la eventuale RPC di B1) **solo dopo ok esplicito** dell'utente prima di applicare l'SQL in Supabase Studio.
- Non modificare le meccaniche di gioco o `telepathy_trials` oltre a quanto strettamente necessario ai fix.
- Non pushare/deployare senza richiesta esplicita; build (`build.js`) va rigenerata prima di ogni verifica.

## Elenco problemi → fix (tracciabilità)

| # | Problema (test 07-01) | Fix |
|---|---|---|
| 1 | Notifica EXPIRED non si chiude cliccandoci sopra | Bug 1 |
| 2 | Accept non funziona da "sessione conclusa" | A5 |
| 3 | Telepatia desktop richiede scroll | C1 |
| 4 | Receiver: simboli cliccabili all'inizio | A4 |
| 5 | Nessuna uscita in attesa del partner (stallo) | A2 (+A3) |
| 6 | Statistiche profilo non corrispondono | B1 |
| 7 | Toggle "Show telepathy score" non fa nulla | B2 |
| 8 | Avatar non stanno nella finestra | C2 |
| 9 | Desync fine sessione (uno esce, l'altro bloccato) | A1 (+A3) |
