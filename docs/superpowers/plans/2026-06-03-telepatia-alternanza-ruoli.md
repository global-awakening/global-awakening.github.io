# Alternanza ruoli telepatia ogni 3 round (Batch C #5) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Alternare ruolo sender/receiver ogni 3 round, derivandolo da `roundCount` (no DB, no race).

**Architecture:** `role` resta il ruolo base; `effectiveRole = roleForRound(role, roundCount)` (blocco di 3) sostituisce `role` nella logica di gioco e UI. Banner di avviso al cambio blocco. Solo `app.html` + test. Nessuna modifica DB.

**Tech Stack:** React UMD inline in `app.html`, Node per il test della formula.

---

## Task 1: Helper, effectiveRole, state e i18n

**Files:** Modify `app.html`

- [ ] **Step 1**: dopo `const [roundCount, setRoundCount] = useState(0);` (~1221) aggiungere lo state notice + gli helper + la derivata:
```javascript
          const [roleSwapNotice, setRoleSwapNotice] = useState(null);
          const swapRole = (r) => r === 'sender' ? 'receiver' : 'sender';
          // round 0-based: 0,1,2 -> base; 3,4,5 -> swap; ... (alternanza ogni 3 round)
          const roleForRound = (baseRole, round) =>
            (Math.floor(round / 3) % 2 === 0) ? baseRole : swapRole(baseRole);
          const effectiveRole = role ? roleForRound(role, roundCount) : role;
```

- [ ] **Step 2**: i18n EN (vicino a `yourRole: "Your role",` ~863, blocco telepathy EN):
```javascript
              roleSwappedSender: "🔄 Roles swapped! You are now the Sender",
              roleSwappedReceiver: "🔄 Roles swapped! You are now the Receiver",
```
i18n IT (blocco telepathy IT, stessa posizione relativa):
```javascript
              roleSwappedSender: "🔄 Ruoli invertiti! Ora sei il Mittente",
              roleSwappedReceiver: "🔄 Ruoli invertiti! Ora sei il Ricevente",
```

- [ ] **Step 3**: Commit (`feat(telepatia): helper effectiveRole + state/i18n cambio ruolo`).

---

## Task 2: Sostituire role→effectiveRole nella logica di gioco

**Files:** Modify `app.html`. Per ciascun punto: leggere il blocco, sostituire `role` con `effectiveRole` SOLO nelle letture indicate.

- [ ] **Step 1** ~2177: `p_role: role` → `p_role: effectiveRole`.
- [ ] **Step 2** ~2192-2193: `role === 'sender'` → `effectiveRole === 'sender'` (entrambe le righe myChoice/theirChoice).
- [ ] **Step 3** ~2241: `setPartnerSymbol(role === 'sender' ? ...)` → `effectiveRole === 'sender'`.
- [ ] **Step 4** ~2254: `if (role === 'sender')` (chi scrive il DB) → `if (effectiveRole === 'sender')`.
- [ ] **Step 5** ~2375: `role !== 'receiver'` → `effectiveRole !== 'receiver'`; e aggiungere `roundCount` alle deps dell'effect (~2387): `[matchId, role, waitingForPartner, showResult]` → `[matchId, role, effectiveRole, waitingForPartner, showResult]`.
- [ ] **Step 6** ~2602 (`getPartnerStatus`): `if (role === 'sender')` → `effectiveRole`.
- [ ] **Step 7** ~2614-2615 (`isMyTurn`): `role === 'sender'`/`role === 'receiver'` → `effectiveRole`.
- [ ] **Step 8** pollResult deps (~2274): aggiungere `effectiveRole` a `[matchId, waitingForPartner, role, currentLevel]` → `[matchId, waitingForPartner, role, effectiveRole, currentLevel]`.
- [ ] **Step 9**: Commit (`feat(telepatia): usa effectiveRole nella logica di gioco`).

> Nota: includere `effectiveRole` nelle deps (oltre a `role`) cattura sia il cambio di base sia il cambio di round, evitando closure stale.

---

## Task 3: Sostituire role→effectiveRole nella UI

**Files:** Modify `app.html`

- [ ] **Step 1** ~3929 (label ruolo): `role === 'sender'` → `effectiveRole === 'sender'`.
- [ ] **Step 2** ~3994 (`role === 'sender' && !waitingForPartner`): → `effectiveRole === 'sender'`.
- [ ] **Step 3** ~4008 (`role === 'receiver' && !waitingForPartner`): → `effectiveRole === 'receiver'`.
- [ ] **Step 4** ~4030 (`role === 'sender' ? senderWaiting : receiverWaiting`): → `effectiveRole`.
- [ ] **Step 5** ~4047 (`role === 'sender' ? selectedSymbol : partnerSymbol`): → `effectiveRole`.
- [ ] **Step 6** ~4051 (`role === 'receiver' ? guessedSymbol : partnerSymbol`): → `effectiveRole`.
- [ ] **Step 7**: Commit (`feat(telepatia): UI usa effectiveRole`).

---

## Task 4: Banner di cambio ruolo

**Files:** Modify `app.html`

- [ ] **Step 1**: in `pollResult`, dopo `setRoundCount(newRound);` (~2248), aggiungere:
```javascript
                if (newRound % 3 === 0) {
                  const nextRole = roleForRound(role, newRound);
                  setRoleSwapNotice(nextRole);
                  setTimeout(() => setRoleSwapNotice(null), 6000);
                }
```

- [ ] **Step 2**: render del banner nell'area telepatia attiva (dopo il banner di `levelDisagreement`, o vicino allo status). Inserire un blocco:
```javascript
                        {roleSwapNotice && (
                          <div role="status" style={{
                            background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.5)',
                            borderRadius: '0.75rem', padding: '0.6rem 0.9rem', marginBottom: '0.75rem',
                            color: '#fff', fontSize: '0.9rem', textAlign: 'center'
                          }}>
                            {roleSwapNotice === 'sender' ? t.telepathy.roleSwappedSender : t.telepathy.roleSwappedReceiver}
                          </div>
                        )}
```
Posizione esatta: subito prima del blocco SINISTRA/area di gioco attiva (individuare in esecuzione il contenitore della sessione attiva e inserirlo in cima).

- [ ] **Step 3**: Verifica montaggio JSX (Playwright headless, no pageerror).

- [ ] **Step 4**: Commit (`feat(telepatia): banner avviso cambio ruolo ogni 3 round`).

---

## Task 5: Test + non-regressione + deploy

**Files:** Create `test-telepathy-role-rotation.js`

- [ ] **Step 1**: test della formula (Node puro, replica 1:1 della logica inline):
```javascript
const swapRole = (r) => r === 'sender' ? 'receiver' : 'sender';
const roleForRound = (b, n) => (Math.floor(n / 3) % 2 === 0) ? b : swapRole(b);
let passed = 0, failed = 0;
const eq = (a, b, m) => { if (a === b) { console.log('  ✅ ' + m); passed++; } else { console.log(`  ❌ ${m} (atteso ${b}, ottenuto ${a})`); failed++; process.exitCode = 1; } };
// base = sender
for (const n of [0,1,2]) eq(roleForRound('sender', n), 'sender', `round ${n} -> sender (blocco 0)`);
for (const n of [3,4,5]) eq(roleForRound('sender', n), 'receiver', `round ${n} -> receiver (blocco 1)`);
for (const n of [6,7,8]) eq(roleForRound('sender', n), 'sender', `round ${n} -> sender (blocco 2)`);
for (const n of [9,10,11]) eq(roleForRound('sender', n), 'receiver', `round ${n} -> receiver (blocco 3)`);
// i due partner restano sempre opposti
for (const n of [0,1,3,5,6,8,11]) eq(roleForRound('sender', n) === roleForRound('receiver', n), false, `round ${n}: ruoli opposti`);
console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
```

- [ ] **Step 2**: Run `node test-telepathy-role-rotation.js` → tutti ✅.

- [ ] **Step 3**: Non-regressione `node test-telepathy.js` (rilanciare 1-2 volte se flaky; i primi round usano il baseRole → comportamento invariato).

- [ ] **Step 4**: Smoke E2E best-effort a 2 browser (≥4 round) se fattibile; altrimenti documentare il limite.

- [ ] **Step 5**: Commit test, push `main`, verifica deploy live (`roleForRound` / `roleSwapped` presenti), aggiornare memoria.

---

## Self-review

- **Copertura spec:** helper+derivata+i18n+notice (Task 1), logica (Task 2), UI (Task 3), banner (Task 4), test+deploy (Task 5). ✔
- **Coerenza:** `effectiveRole`/`roleForRound`/`swapRole`/`roleSwapNotice` usati coerentemente; deps array aggiornate (2274, 2387).
- **Timing risultato:** il mapping (~2241) usa `effectiveRole` con `roundCount` pre-incremento → ruolo del round appena giocato. ✔
- **Rischio:** modifica su codice fragile; mitigazione = formula pura testata + sostituzioni puntuali + non-regressione. Nessuna modifica DB.
