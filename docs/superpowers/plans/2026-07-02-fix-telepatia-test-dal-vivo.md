# Fix telepatia (test dal vivo Claudio) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Risolvere i 9 problemi emersi nel test dal vivo con Claudio (stallo/desync sessione, statistiche profilo incoerenti, layout desktop, notifica EXPIRED), senza far restare bloccato nessun utente e con statistiche vere e coerenti ovunque.

**Architecture:** App React single-file (`src/app.jsx` → build `app.js` via `build.js`), Supabase (RPC SECURITY DEFINER + RLS, pattern "trustful" con `session_id`), GitHub Pages. La radice dei bug critici è che la fine sessione non è uno stato condiviso su DB: si introduce un flag `ended_at`/`ended_by` su `telepathy_matches` letto dal polling già esistente, più uscite/timeout sempre disponibili. Le statistiche passano a una fonte unica (`telepathy_scores`) anche per i profili altrui, via nuova RPC pubblica.

**Tech Stack:** React 18 (JSX single-file), Supabase JS + PostgREST/RPC, Playwright (test E2E in `test-*.js`, runner node con `test-helpers.js`), build custom `build.js`.

## Global Constraints

- **Nessuna modifica al DB (migration/RPC) applicata in Supabase Studio senza OK esplicito dell'utente.** Il codice SQL si scrive nei file, ma l'applicazione è gated. Fino ad applicazione, il codice client che dipende dal nuovo schema deve degradare in modo sicuro (nessun crash se la colonna/RPC non esiste).
- Sorgente da editare: **`src/app.jsx`**; dopo ogni modifica al sorgente rigenerare con `node build.js` prima di ogni verifica (l'app servita è `app.js`).
- File SQL nuovi in `supabase/sql/`, numerazione progressiva: prossimo libero = **`14_`** (esistono già `01_`…`13_`). NON usare `11_` (la spec era datata).
- Pattern sicurezza: niente nuove `SELECT` pubbliche larghe; le letture cross-utente passano da RPC `SECURITY DEFINER` che ritornano solo i campi necessari. Rispettare i pattern di `04_`…`13_`.
- Niente PII (nickname/email) nei `console.*` (regola D4 del progetto).
- Non pushare/deployare senza richiesta esplicita.
- Confini: nessun refactor non collegato ai 9 punti; nessuna riscrittura auth JWT; non toccare le meccaniche di gioco o `telepathy_trials` oltre allo stretto necessario.

## File Structure

- `src/app.jsx` — tutte le modifiche client (stato sessione, uscite, gating, accept, stats, toggle, layout, notifica). File monolitico esistente: si seguono i pattern in essere, nessuna ristrutturazione.
- `supabase/sql/14_telepathy_session_end.sql` — **nuovo**: colonne `ended_at`/`ended_by` su `telepathy_matches` + RPC `end_telepathy_match` (A1).
- `supabase/sql/15_public_telepathy_stats.sql` — **nuovo**: RPC `get_public_telepathy_stats(p_nickname)` (B1 lettura altrui).
- `test-telepathy-session-end.js` — **nuovo**: flag ended letto da entrambi i lati (A1) + accept post-sessione (A5).
- `test-telepathy-gating.js` — **nuovo**: gating griglia receiver dall'inizio (A4).
- `test-telepathy-stats.js` — **nuovo**: fonte unica statistiche + RPC pubblica (B1).
- Test esistenti da mantenere verdi: `test-telepathy.js`, `test-inviti-telepatia.js`, `test-telepathy-role-rotation.js`, `test-telepathy-livelli-scala.js`.

## Decisioni prese (default consigliati — confermabili dall'utente)

- **A3 soglia auto-timeout:** 90s di inattività del partner atteso (generosa, coerente con l'expiry inviti 45s ma meno aggressiva per non chiudere sessioni lente).
- **B1 lettura stats altrui:** nuova RPC `get_public_telepathy_stats(p_nickname)` SECURITY DEFINER che legge da `telepathy_scores` (fonte unica), **anziché** continuare a fidarsi di `profiles.telepathy_score/best` (desincronizzati). Motivo: elimina la classe di bug alla radice invece di rincorrere la sincronizzazione.
- **B1 utente corrente:** Edit Profile è già corretto (round + match% da `totalRounds/totalMatches`). Si corregge solo la coerenza guest e le etichette dove fuorvianti.

---

## Fase 0 — Baseline

### Task 0: Registrare la baseline dei test

**Files:**
- Nessuna modifica; solo esecuzione.

- [ ] **Step 1: Eseguire la suite telepatia esistente e annotarne l'esito**

Run:
```bash
cd "global-awakening"
node test-telepathy.js
node test-inviti-telepatia.js
node test-telepathy-role-rotation.js
node test-telepathy-livelli-scala.js
```
Expected: annotare pass/fail per ciascuno. **Atteso rosso noto e NON regressione:** `test-inviti-telepatia.js` "Test 7 campanella" (flusso superato da polling/modal). Qualsiasi altro rosso è pre-esistente da capire prima di procedere.

- [ ] **Step 2: Verificare che la build sia allineata**

Run: `node build.js`
Expected: build senza errori; `app.js` rigenerato. (Se il diff di `app.js` è vuoto, il sorgente era già allineato.)

---

## Filone A — Stato sessione (CRITICO)

### Task A1: Flag "ended" condiviso su DB (bug 9 — desync)

**Files:**
- Create: `supabase/sql/14_telepathy_session_end.sql`
- Modify: `src/app.jsx` — `endSession` (~r.2263-2308), `resetTelepathy` (~r.2025-2059), `pollResult` (~r.1793-1877), `checkPartnerLeft` (~r.1895-1917), `acceptInvite` (~r.2113 insert).
- Test: `test-telepathy-session-end.js` (parte flag; l'accept post-sessione è in A5).

**Interfaces:**
- Produces (SQL): colonne `telepathy_matches.ended_at timestamptz`, `telepathy_matches.ended_by text`; RPC `end_telepathy_match(p_match_id uuid, p_ended_by text) returns void`.
- Produces (client): entrambi i client, nel polling 2s già esistente, se leggono `ended_at IS NOT NULL` chiudono in modo identico → `setSessionEnded(true)`, `setShowResult(false)`, `setWaitingForPartner(false)`; se `ended_by !== <mio session_id/email>` marcano `setPartnerDisconnected`-equivalente ("il partner ha chiuso").

- [ ] **Step 1: Scrivere la migration SQL (NON applicarla ancora)**

Create `supabase/sql/14_telepathy_session_end.sql`:
```sql
-- 14: fine sessione telepatia come stato condiviso su DB.
-- Prima d'ora ogni client deduceva la fine dal polling (match cancellato / last_seen stale),
-- causando desync (uno vede "ended", l'altro resta bloccato). Ora la fine è un flag esplicito.

alter table public.telepathy_matches
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by text;

-- RPC trustful (pattern del progetto): chiunque conosca il match_id puo' marcarlo terminato.
-- Non cancella il record subito: lascia che l'altro lato lo rilevi via polling prima del cleanup.
create or replace function public.end_telepathy_match(p_match_id uuid, p_ended_by text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.telepathy_matches
     set ended_at = coalesce(ended_at, now()),
         ended_by = coalesce(ended_by, p_ended_by)
   where id = p_match_id;
$$;

grant execute on function public.end_telepathy_match(uuid, text) to anon, authenticated;
```
Expected: file scritto. **Applicazione in Studio SOLO dopo OK utente** (vedi Global Constraints).

- [ ] **Step 2: Client — marcare la fine invece di (solo) cancellare il match**

In `endSession` (`src/app.jsx` ~r.2297-2302), PRIMA della delete del match, marcare il flag (best-effort, degrada se la RPC non esiste ancora):
```js
if (matchId) {
  try {
    await supabase.rpc('end_telepathy_match', { p_match_id: matchId, p_ended_by: (userEmail || sessionId) });
  } catch (e) { /* RPC non ancora applicata: si continua col vecchio path (delete) */ }
  // Ritardare la delete del match cosi' l'altro lato fa in tempo a leggere ended_at nel polling.
  await supabase.from('telepathy_chat').delete().eq('match_id', matchId);
  setTimeout(() => { supabase.from('telepathy_matches').delete().eq('id', matchId); }, 6000);
}
```
Nota: l'attuale delete immediata resta la ragione per cui l'altro lato "a volte" rileva la fine (match sparito). Col flag + delete ritardata il rilevamento diventa deterministico.

- [ ] **Step 3: Client — leggere il flag nel polling esistente**

In `pollResult` (~r.1803, subito dopo `const match = data[0];`) e in `checkPartnerLeft` (~r.1899, cambiare la select a `select('id, ended_at, ended_by')`), aggiungere:
```js
if (match.ended_at) {
  if (match.ended_by && match.ended_by !== (userEmail || sessionId)) setPartnerDisconnected(true);
  setSessionEnded(true);
  setShowResult(false);
  setWaitingForPartner(false);
  return;
}
```
Expected: ogni lato rileva la fine entro ≤1 ciclo (2s) in modo identico.

- [ ] **Step 4: Reset del flag all'ingresso in una nuova sessione**

In `acceptInvite` l'insert (~r.2113-2122) non setta i nuovi campi → restano NULL (corretto). Verificare che non venga copiato `ended_at` da stato vecchio. In `resetTelepathy` non serve nulla lato DB (il record viene ricreato). Nessun codice aggiuntivo, solo verifica.

- [ ] **Step 5: Test — lettura flag da entrambi i lati**

Create `test-telepathy-session-end.js` (seguire il pattern di `test-inviti-telepatia.js` / `test-helpers.js`): crea un match tra due session simulate, chiama `end_telepathy_match`, verifica che una SELECT successiva veda `ended_at != null` e `ended_by` corretto da entrambe le prospettive.
```
Assert: dopo end_telepathy_match(matchId, 'A'), la lettura del match da 'A' e da 'B' vede ended_at valorizzato; ended_by === 'A'.
```

- [ ] **Step 6: Run test**

Run: `node test-telepathy-session-end.js`
Expected: PASS **se** la migration è stata applicata; se non applicata, il test deve esplicitare "SKIP: RPC non applicata" e non fallire silenziosamente. (Gate DB.)

- [ ] **Step 7: Commit**
```bash
git add supabase/sql/14_telepathy_session_end.sql src/app.jsx app.js test-telepathy-session-end.js
git commit -m "feat(telepatia): flag ended condiviso su DB per fine sessione deterministica (A1)"
```

### Task A2: Bottone "Esci" sempre visibile nelle attese (bug 5 — stallo)

**Files:**
- Modify: `src/app.jsx` — vista Telepathy, blocchi di attesa (~r.3711-3736) e schermate scelta livello/modalità.

**Interfaces:**
- Consumes: `resetTelepathy()` (~r.2025) e — se A1 applicata — `end_telepathy_match`.

- [ ] **Step 1: Handler di uscita unificato**

Aggiungere vicino a `resetTelepathy` un `leaveSession` che marca il flag (se disponibile) e poi resetta:
```js
const leaveSession = async () => {
  if (matchId) {
    try { await supabase.rpc('end_telepathy_match', { p_match_id: matchId, p_ended_by: (userEmail || sessionId) }); }
    catch (e) { /* degrada: resetTelepathy cancella comunque il match */ }
  }
  resetTelepathy();
};
```

- [ ] **Step 2: Rendere il bottone in ogni schermata di attesa**

In ogni blocco della vista partita dove oggi NON c'è uscita (attesa scelta livello `showLevelBanner`, attesa simbolo receiver ~r.3711, `waitingForPartner` ~r.3729), aggiungere un controllo sempre visibile:
```jsx
<button onClick={leaveSession} className="btn-secondary w-full" style={{marginTop: '0.75rem'}}>
  {t.telepathy.leaveSession /* fallback: 'Esci dalla sessione' */}
</button>
```
Aggiungere la chiave i18n `leaveSession` in EN/IT nell'oggetto traduzioni della telepatia.

- [ ] **Step 3: Verifica smoke UI**

Run: build + aprire la vista telepatia in ciascuna fase di attesa (browse/screenshot).
Expected: in ogni schermata di attesa esiste un controllo visibile che riporta in lobby. Criterio di fatto A2 soddisfatto.

- [ ] **Step 4: Commit**
```bash
git add src/app.jsx app.js
git commit -m "feat(telepatia): bottone Esci sempre disponibile nelle attese (A2)"
```

### Task A3: Auto-timeout di inattività

**Files:**
- Modify: `src/app.jsx` — nuovo `useEffect` accanto ai polling esistenti (~dopo r.1917).

**Interfaces:**
- Consumes: `matchId`, `roundCount`, `waitingForPartner`, `leaveSession` (A2).

- [ ] **Step 1: Effect di timeout**

Aggiungere un effect che, quando si è in sessione e in attesa dell'azione del partner, arma un timer di 90s; ogni progresso (cambio `roundCount`, `senderHasSent`, `showResult`) lo ri-arma:
```js
useEffect(() => {
  if (!matchId || sessionEnded) return;
  const timer = setTimeout(() => { leaveSession(); }, 90000);
  return () => clearTimeout(timer);
}, [matchId, roundCount, senderHasSent, showResult, waitingForPartner, sessionEnded]);
```
Nota: `leaveSession` marca `ended_at` → l'altro lato esce anch'esso via A1 (chiusura per entrambi).

- [ ] **Step 2: Verifica manuale**

Simulare inattività: dopo 90s senza progresso, il client esce da solo verso la lobby; con A1 applicata anche il partner esce.
Expected: nessuno resta appeso oltre 90s.

- [ ] **Step 3: Commit**
```bash
git add src/app.jsx app.js
git commit -m "feat(telepatia): auto-timeout inattivita' 90s con chiusura condivisa (A3)"
```

### Task A4: Gating griglia Receiver dall'inizio (bug 4)

**Files:**
- Modify: `src/app.jsx` — reset `senderHasSent` (in `acceptInvite` ~r.2139, in `resetTelepathy` ~r.2056 già presente, all'inizio nuovo round in `pollResult` ~r.2014-2020 auto-avanzamento), gating già presente a r.3718-3725.
- Test: `test-telepathy-gating.js`

**Interfaces:**
- Il gating render (`disabled={!senderHasSent}`, r.3720/3725) è già corretto; il bug è la finestra in cui `senderHasSent` è ancora `true` dal round precedente prima che il polling lo ri-legga.

- [ ] **Step 1: Scrivere il test che fallisce (logica di reset)**

In `test-telepathy-gating.js`, estrarre/replicare la condizione: all'inizio di un round il receiver NON deve poter confermare finché `sender_symbol` non è settato sul DB. Verificare via stato DB: dopo reset simboli (`sender_symbol=null`), il flag derivato dev'essere false.
```
Assert: con sender_symbol=null sul match, checkSenderSent porta senderHasSent=false → griglia/Confirm disabilitati.
```

- [ ] **Step 2: Forzare `senderHasSent=false` all'inizio di ogni round**

Nell'auto-avanzamento (~r.2014-2021) aggiungere `setSenderHasSent(false);` insieme agli altri reset, e in `acceptInvite` (~r.2139) confermare `setSenderHasSent(false)`. Così alla ripartenza la griglia è bloccata finché il polling `checkSenderSent` (~r.1990) non conferma il nuovo `sender_symbol`.

- [ ] **Step 3: Run test**

Run: `node test-telepathy-gating.js`
Expected: PASS — receiver bloccato a inizio round.

- [ ] **Step 4: Verifica no-regressione ruoli**

Run: `node test-telepathy-role-rotation.js`
Expected: PASS (il gating deve valere anche dopo lo swap ruoli ogni 3 round).

- [ ] **Step 5: Commit**
```bash
git add src/app.jsx app.js test-telepathy-gating.js
git commit -m "fix(telepatia): receiver bloccato a inizio round finche' il sender non invia (A4)"
```

### Task A5: Accept da schermata "sessione conclusa" (bug 2)

**Files:**
- Modify: `src/app.jsx` — `acceptInvite` (~r.2101-2143).
- Test: `test-telepathy-session-end.js` (sezione accept post-sessione).

**Interfaces:**
- Consumes: `resetTelepathy()`.

- [ ] **Step 1: Rimuovere il blocco quando la sessione è conclusa**

Causa (r.2104): `if (matchId || partner) return;` scatta anche in "sessione conclusa", dove `partner` è ancora valorizzato ma `sessionEnded === true`. Cambiare il guard così che, se la sessione precedente è conclusa/partner disconnesso, si resetti e si prosegua:
```js
const acceptInvite = async () => {
  if (!incomingInvite) return;
  // Se ero in una sessione ATTIVA (non conclusa) ignoro: non sovrascrivo lo stato vivo.
  if ((matchId || partner) && !sessionEnded && !partnerDisconnected) {
    console.warn('acceptInvite: gia\' in sessione attiva, ignoro invito');
    return;
  }
  // Sessione precedente conclusa/abbandonata: reset completo prima di entrare nella nuova.
  if (matchId || partner) resetTelepathy();
  setSearchingPartner(false);
  ...
};
```
Il resto della funzione resta invariato (già azzera `sessionEnded`, `partnerDisconnected`, ecc.).

- [ ] **Step 2: Scrivere il test**

In `test-telepathy-session-end.js` aggiungere: simulare stato "sessione conclusa" (match con `ended_at` settato), poi un invito entrante; chiamare la logica di accept e verificare che si crei un nuovo match e lo stato punti al nuovo `matchId` (nessun early-return).
```
Assert: con sessionEnded=true + incomingInvite valido, acceptInvite crea un nuovo telepathy_matches e resetta lo stato precedente.
```

- [ ] **Step 3: Run test**

Run: `node test-telepathy-session-end.js`
Expected: PASS (sezione accept post-sessione).

- [ ] **Step 4: Commit**
```bash
git add src/app.jsx app.js test-telepathy-session-end.js
git commit -m "fix(telepatia): Accept invito funziona da schermata sessione conclusa (A5)"
```

---

## Filone B — Profilo & statistiche

### Task B1: Statistiche da fonte unica coerente (bug 6)

**Files:**
- Create: `supabase/sql/15_public_telepathy_stats.sql`
- Modify: `src/app.jsx` — `openProfile` (~r.2319-2359), render modale altrui (~r.4126-4137), etichette.
- Test: `test-telepathy-stats.js`

**Interfaces:**
- Produces (SQL): RPC `get_public_telepathy_stats(p_nickname text) returns table(rounds_count int, matches_count int)`.
- Semantica unica ovunque: **Card 1 = round giocati** (`rounds_count`), **Card 2 = Match %** = `matches_count/rounds_count` arrotondato (0% se 0 round).

- [ ] **Step 1: Scrivere la RPC pubblica (NON applicarla ancora)**

Create `supabase/sql/15_public_telepathy_stats.sql`:
```sql
-- 15: statistiche telepatiche pubbliche di un utente, dalla fonte unica telepathy_scores.
-- Evita di dipendere da profiles.telepathy_score/best (storicamente desincronizzati).
-- Espone SOLO due contatori aggregati (nessuna PII), via SECURITY DEFINER.
create or replace function public.get_public_telepathy_stats(p_nickname text)
returns table(rounds_count int, matches_count int)
language sql
security definer
set search_path = public
as $$
  select coalesce(ts.rounds_count, 0)::int, coalesce(ts.matches_count, 0)::int
    from public.profiles p
    join public.telepathy_scores ts
      on ts.user_id = coalesce(p.email, p.session_id)
   where p.nickname = p_nickname
   limit 1;
$$;

grant execute on function public.get_public_telepathy_stats(text) to anon, authenticated;
```
Nota di verifica per l'esecutore: confermare che `telepathy_scores.user_id` sia `email` per i registrati (endSession usa `userEmail || sessionId`, r.2272). Se il join non trova righe, la RPC ritorna 0/0 (degrado sicuro).
**Applicazione in Studio SOLO dopo OK utente.**

- [ ] **Step 2: `openProfile` legge dalla fonte unica**

In `openProfile` (~r.2322), dopo aver caricato il profilo, chiamare la RPC e usare i suoi valori per le stats (con fallback ai vecchi campi se la RPC non è applicata):
```js
let rounds = 0, matches = 0;
try {
  const { data: st } = await supabase.rpc('get_public_telepathy_stats', { p_nickname: userName });
  if (st && st.length > 0) { rounds = st[0].rounds_count || 0; matches = st[0].matches_count || 0; }
} catch (e) { /* RPC non applicata: fallback sotto */ }
// fallback: se rounds resta 0 e il profilo aveva valori legacy, usarli solo come ultima risorsa
setViewingProfile({
  ...,
  telepathyRounds: rounds || (p.telepathy_score || 0),
  telepathyMatches: matches || (p.telepathy_best || 0),
  showTelepathyScore: p.show_telepathy_score !== false,
  registered: true
});
```

- [ ] **Step 3: Render modale altrui con semantica corretta**

Render (~r.4126-4137): Card 1 = round giocati, Card 2 = match%:
```jsx
{viewingProfile.showTelepathyScore !== false && (
  <div className="grid grid-cols-2 gap-3">
    <div className="bg-glass-dark rounded-xl p-3 text-center">
      <p className="text-secondary text-xs mb-1">{t.social.telepathyScore /* "Round giocati" */}</p>
      <p className="text-2xl font-bold" style={{color: '#fbbf24'}}>{viewingProfile.telepathyRounds}</p>
    </div>
    <div className="bg-glass-dark rounded-xl p-3 text-center">
      <p className="text-secondary text-xs mb-1">{t.social.bestScore /* "Match %" */}</p>
      <p className="text-2xl font-bold" style={{color: '#4ade80'}}>{viewingProfile.telepathyRounds > 0 ? Math.round((viewingProfile.telepathyMatches / viewingProfile.telepathyRounds) * 100) : 0}%</p>
    </div>
  </div>
)}
```
Allineare le etichette i18n `t.social.telepathyScore`/`t.social.bestScore` alla semantica "Round giocati"/"Match %" (EN+IT), coerenti con Edit Profile.

- [ ] **Step 4: Coerenza guest (Edit Profile)**

Verificare che per i guest `totalRounds/totalMatches` riflettano la realtà: se derivano solo da `localStorage` e divergono, allinearli leggendo `telepathy_scores` con `user_id = sessionId` al mount della vista profilo (stesso path dei registrati). Se non allineabile in sicurezza per i guest, documentarlo come limite noto e mostrare 0 anziché un dato falso. (Decisione minima: preferire "vero o zero" a "numero sbagliato".)

- [ ] **Step 5: Test**

Create `test-telepathy-stats.js`: inserire in `telepathy_scores` valori noti per un utente con riga in `profiles`, chiamare `get_public_telepathy_stats(nickname)` e verificare rounds/matches; verificare il calcolo match% (matches/rounds) con casi 0-round e non-zero.
```
Assert: get_public_telepathy_stats ritorna i contatori di telepathy_scores; match% = round(matches/rounds*100); 0% quando rounds=0.
```

- [ ] **Step 6: Run test**

Run: `node test-telepathy-stats.js`
Expected: PASS se RPC applicata; altrimenti SKIP esplicito (gate DB).

- [ ] **Step 7: Commit**
```bash
git add supabase/sql/15_public_telepathy_stats.sql src/app.jsx app.js test-telepathy-stats.js
git commit -m "fix(telepatia): statistiche profilo da fonte unica telepathy_scores + RPC pubblica (B1)"
```

### Task B2: Toggle "Show telepathy score" effettivo e persistente (bug 7)

**Files:**
- Modify: `src/app.jsx` — onClick toggle (~r.3888-3893).

**Interfaces:**
- Consumes: `saveProfile` scrive già `show_telepathy_score` (r.2215); qui si rende la persistenza indipendente dal pulsante "Salva".

- [ ] **Step 1: Persistere il flag al click (localStorage + DB immediato)**

Modificare l'onClick (~r.3889-3893) così che, oltre a stato+localStorage, salvi subito su DB per i registrati:
```js
onClick={async () => {
  const newVal = !showTelepathyScore;
  setShowTelepathyScore(newVal);
  localStorage.setItem('ga_show_telepathy', String(newVal));
  if (!isGuest && sessionId) {
    try { await supabase.from('profiles').update({ show_telepathy_score: newVal }).eq('session_id', sessionId); }
    catch (e) { console.warn('toggle show_telepathy persist failed'); }
  }
}}
```
Nota: il toggle era già funzionante lato stato/localStorage; il difetto percepito ("non fa niente") va verificato — potrebbe essere che la modale profilo pubblico non rispettasse il flag. La modale altrui rispetta `showTelepathyScore !== false` (r.4126): confermare che il valore salvato del proprietario arrivi al visualizzatore (dipende da `profiles.show_telepathy_score`, ora persistito immediatamente). Per i guest: flag locale al dispositivo (limite noto documentato).

- [ ] **Step 2: Verifica manuale**

Toggle → reload → il valore persiste; il profilo pubblico mostra/nasconde le stats coerentemente.
Expected: criterio di fatto B2 soddisfatto.

- [ ] **Step 3: Commit**
```bash
git add src/app.jsx app.js
git commit -m "fix(telepatia): toggle Show score con effetto immediato e persistenza DB (B2)"
```

---

## Filone C — Layout desktop

### Task C1: Telepatia in un viewport senza scroll (migl. 3)

**Files:**
- Modify: `src/app.jsx` — header vista Telepathy, griglia simboli (~r.3700-3706 sender, r.3718-3724 receiver), spaziature.

**Interfaces:**
- Griglia oggi `grid grid-cols-3` fissa. Con 9 simboli (lvl9) sfora sotto su desktop 1366×768.

- [ ] **Step 1: Compattare header + griglia responsive**

Ridurre margini di titolo/sottotitolo della vista Telepathy; rendere la griglia adattiva al numero di simboli mantenendo max 3 colonne ma celle e gap più compatti, e limitando l'altezza:
```jsx
// contenitore griglia (sender e receiver): stessa classe/stile
<div className="grid grid-cols-3" style={{gap: '0.6rem', marginBottom: '1rem'}}>
```
Ridurre `symbol-btn` (dimensione/padding) via stile inline o classe esistente così che 3×3 stia nel viewport. NON toccare la logica, solo dimensioni/spaziature. Verificare che mobile resti usabile (celle non troppo piccole: usare `min()`/clamp se serve).

- [ ] **Step 2: Verifica screenshot desktop**

Run: build + browse a 1366×768 con `currentLevel='lvl9'`.
Expected: header + card partner/stats + griglia 9 simboli + bottone Confirm/Esci visibili senza scroll verticale.

- [ ] **Step 3: Verifica mobile**

Run: browse a 390×844.
Expected: nessuna regressione; celle cliccabili.

- [ ] **Step 4: Commit**
```bash
git add src/app.jsx app.js
git commit -m "style(telepatia): vista di gioco in un viewport desktop senza scroll a 9 simboli (C1)"
```

### Task C2: Griglia avatar responsive in Edit Profile (migl. 8)

**Files:**
- Modify: `src/app.jsx` — griglia avatar (~r.3924).

- [ ] **Step 1: Sostituire la griglia fissa con una responsive**

Cambiare (~r.3924) `gridTemplateColumns: 'repeat(10, 1fr)'` con auto-fill:
```jsx
<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(2.5rem, 1fr))', gap: '0.5rem', maxHeight: '11rem', overflowY: 'auto'}}>
```
Rimuovere eventuale overflow orizzontale della modale contenitore. `maxHeight`+`overflowY` verticale (non orizzontale) come fallback se gli avatar sono molti.

- [ ] **Step 2: Verifica desktop + mobile**

Run: build + browse modale Edit Profile a larghezze da 320px a 1440px.
Expected: nessuno scroll orizzontale; tutti gli avatar visibili/cliccabili; wrap corretto.

- [ ] **Step 3: Commit**
```bash
git add src/app.jsx app.js
git commit -m "style(profilo): griglia avatar responsive senza scroll orizzontale (C2)"
```

---

## Bug 1 — Notifica "EXPIRED" dismissibile al click

**Files:**
- Modify: `src/app.jsx` — card notifica invito (render pannello notifiche, testo ~r.3067; handler `markOneNotifRead` ~r.2395-2406).

- [ ] **Step 1: Dismiss cliccando l'intera card EXPIRED**

Nel pannello notifiche, la card di un invito scaduto deve chiamare `markOneNotifRead(notif)` (che già gestisce `isExpiredInvite` con early-return dopo la dismiss) sull'`onClick` della card stessa, oltre al bottone OK. Individuare il render della singola notifica e aggiungere `onClick={() => markOneNotifRead(notif)}` alla card (mantenendo il bottone OK esistente e usando `stopPropagation` sul bottone se necessario per non doppiare).

- [ ] **Step 2: Verifica manuale**

Cliccare sulla card EXPIRED → scompare e il contatore campanella si aggiorna.
Expected: criterio di fatto Bug 1 soddisfatto.

- [ ] **Step 3: Commit**
```bash
git add src/app.jsx app.js
git commit -m "fix(notifiche): notifica invito EXPIRED chiudibile cliccando la card (Bug 1)"
```

---

## Fase finale — Verifica a 3 livelli

### Task F1: Suite completa + build

- [ ] **Step 1: Rigenerare build e girare tutta la suite telepatia**

Run:
```bash
node build.js
node test-telepathy.js
node test-inviti-telepatia.js
node test-telepathy-role-rotation.js
node test-telepathy-livelli-scala.js
node test-telepathy-session-end.js
node test-telepathy-gating.js
node test-telepathy-stats.js
```
Expected: tutto verde salvo il "Test 7 campanella" noto (baseline Task 0). I test che richiedono DB (A1/B1) devono passare **dopo** l'applicazione delle migration, o dichiarare SKIP prima.

### Task F2: Revisione con agente indipendente

- [ ] **Step 1: Dispatch di un subagent** che verifichi l'implementazione contro i criteri di "fatto" di ogni task e i Confini, senza auto-critica. Riportare gap.

### Task F3: Code review sul diff

- [ ] **Step 1:** eseguire `/code-review` (o `/review`) sul diff, con attenzione a: SQL safety delle migration `14_`/`15_` (SECURITY DEFINER, `search_path`, grant minimi, nessuna PII esposta), confini di sicurezza della RPC stats, assenza di regressioni sul gating ruoli.

### Task F4: Gate DB + deploy (SOLO con OK esplicito)

- [ ] **Step 1:** presentare all'utente le due migration (`14_`, `15_`) per l'applicazione in Supabase Studio. **Non applicare senza OK.**
- [ ] **Step 2:** dopo applicazione, ri-girare i test DB-dipendenti (Task F1).
- [ ] **Step 3:** push/deploy **solo se richiesto esplicitamente**.

---

## Self-Review (coverage spec → task)

| Spec | Task | Coperto |
|---|---|---|
| A1 flag ended | Task A1 | ✅ SQL 14_ + polling read + delete ritardata |
| A2 bottone Esci | Task A2 | ✅ `leaveSession` in ogni attesa |
| A3 auto-timeout | Task A3 | ✅ 90s, chiusura condivisa via A1 |
| A4 gating receiver | Task A4 | ✅ reset `senderHasSent` a inizio round |
| A5 accept post-sessione | Task A5 | ✅ guard rilassato su sessionEnded/partnerDisconnected |
| B1 fonte unica stats | Task B1 | ✅ RPC 15_ + openProfile + render + guest |
| B2 toggle persistente | Task B2 | ✅ persistenza DB immediata |
| C1 no-scroll desktop | Task C1 | ✅ header compatto + griglia compatta |
| C2 avatar responsive | Task C2 | ✅ auto-fill |
| Bug 1 EXPIRED dismiss | Bug 1 | ✅ onClick card |
| Verifica 3 livelli | F1/F2/F3 | ✅ |
| Gate DB | F4 | ✅ |

**Note di consistenza:** nomi RPC usati coerentemente — `end_telepathy_match(uuid,text)` (A1/A2/A3), `get_public_telepathy_stats(text)` (B1). Handler client `leaveSession` definito in A2 e riusato in A3. Campi `viewingProfile.telepathyRounds/telepathyMatches` (nuovi) sostituiscono `telepathyScore/telepathyBest` nel render B1 — l'esecutore deve aggiornare tutti i riferimenti nel blocco render della modale.
