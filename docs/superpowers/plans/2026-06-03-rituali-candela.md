# Candela per i rituali (Batch D #10) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere a ogni utente di accendere/spegnere una candela simbolica per un rituale, con contatore sulla card.

**Architecture:** Colonna `rituals.candles jsonb` (array di session_id, come `participants`). RPC `toggle_ritual_candle` SECURITY DEFINER fa toggle atomico. Client: bottone 🕯️ sempre visibile sulla card. Additivo, non-breaking.

**Tech Stack:** PostgreSQL/Supabase (RPC + jsonb), React UMD inline in `app.html`, Node per i test.

---

## File Structure

- `supabase/sql/09_ritual_candles.sql` — **Create**: `ALTER TABLE` colonna `candles` + RPC `toggle_ritual_candle`.
- `app.html` — **Modify**: i18n (~755/1024), handler `toggleCandle` (dopo `sendEnergy` ~2927), variabili render + bottone candela nella card (~3506 / ~3556).
- `test-rituali-candele.js` — **Create**: test toggle via RPC.

Ordine: SQL (Task 1) + client (Task 2) + test (Task 3) committati; poi utente applica l'SQL, si testa, push (Task 4).

---

## Task 1: SQL — colonna + RPC toggle

**Files:**
- Create: `supabase/sql/09_ritual_candles.sql`

- [ ] **Step 1: Scrivere il file SQL**

```sql
-- ============================================================================
-- Candela per i rituali (Batch D #10) — 2026-06-03
-- Riferimento: docs/superpowers/specs/2026-06-03-rituali-candela-design.md
-- Additivo, non-breaking, idempotente. candles = array jsonb di session_id
-- (stesso pattern di participants). RPC toggle SECURITY DEFINER (trustful,
-- come join_ritual: usa session_id opaco, niente hash).
-- ============================================================================

ALTER TABLE rituals ADD COLUMN IF NOT EXISTS candles jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION toggle_ritual_candle(
  p_ritual_id  bigint,
  p_session_id text
)
RETURNS SETOF rituals
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'session_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rituals WHERE id = p_ritual_id) THEN
    RAISE EXCEPTION 'ritual_not_found';
  END IF;

  RETURN QUERY
    UPDATE rituals
       SET candles = CASE
         WHEN candles @> to_jsonb(array[p_session_id]) THEN
           coalesce(
             (SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
               WHERE e <> to_jsonb(p_session_id)),
             '[]'::jsonb)
         ELSE
           candles || to_jsonb(p_session_id)
       END
     WHERE id = p_ritual_id
     RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION toggle_ritual_candle(bigint,text) TO anon;

-- Verifica post-apply (da REST anon):
--   POST /rpc/toggle_ritual_candle {p_ritual_id:<X>, p_session_id:'s1'} -> candles contiene 's1'
--   ripetere -> candles NON contiene 's1'
```

- [ ] **Step 2: Commit**

```bash
git add supabase/sql/09_ritual_candles.sql
git commit -m "feat(sql): colonna candles + RPC toggle_ritual_candle (Batch D #10)"
```

> Applicazione in Studio: Task 4 (gate utente).

---

## Task 2: Client — i18n, handler e bottone candela

**Files:**
- Modify: `app.html`

- [ ] **Step 1: i18n EN** — dopo `sendEnergy: "Send Energy",` (~755-761, blocco `rituals` EN)

Cercare:
```javascript
              sendEnergy: "Send Energy",
```
Sostituire con:
```javascript
              sendEnergy: "Send Energy",
              candleLight: "Light a candle",
              candleExtinguish: "Extinguish your candle",
```

- [ ] **Step 2: i18n IT** — dopo `sendEnergy: "Invia Energia",` (~1024-1030, blocco `rituals` IT)

Cercare:
```javascript
              sendEnergy: "Invia Energia",
```
Sostituire con:
```javascript
              sendEnergy: "Invia Energia",
              candleLight: "Accendi una candela",
              candleExtinguish: "Spegni la tua candela",
```

- [ ] **Step 3: Handler `toggleCandle`** — subito dopo la chiusura di `sendEnergy` (~2927)

Cercare:
```javascript
          const sendEnergy = async (ritualId) => {
            const ritual = rituals.find(r => r.id === ritualId);
            if (!ritual) return;
            await supabase.rpc('send_ritual_energy', { p_ritual_id: ritualId, p_amount: 10 });
          };
```
Sostituire con (aggiunta del nuovo handler dopo):
```javascript
          const sendEnergy = async (ritualId) => {
            const ritual = rituals.find(r => r.id === ritualId);
            if (!ritual) return;
            await supabase.rpc('send_ritual_energy', { p_ritual_id: ritualId, p_amount: 10 });
          };

          const toggleCandle = async (ritualId) => {
            const { data, error } = await supabase.rpc('toggle_ritual_candle', {
              p_ritual_id: ritualId,
              p_session_id: sessionId
            });
            if (error || !data || data.length === 0) { showErrorToast(); return; }
            setRituals(prev => prev.map(r => r.id === ritualId ? data[0] : r));
          };
```

- [ ] **Step 4: Variabili render** — dopo `const isJoined = ritual.participants.includes(sessionId);` (~3506)

Cercare:
```javascript
                        const isJoined = ritual.participants.includes(sessionId);
```
Sostituire con:
```javascript
                        const isJoined = ritual.participants.includes(sessionId);
                        const candleCount = (ritual.candles || []).length;
                        const isCandleLit = (ritual.candles || []).includes(sessionId);
```

- [ ] **Step 5: Bottone candela** — nella riga bottoni, dopo il blocco `{isLive && (...)}` dell'energia (~3555)

Cercare:
```javascript
                              {isLive && (
                                <button onClick={() => sendEnergy(ritual.id)} className="btn-secondary px-4">
                                  ⚡ {ritual.energy}
                                </button>
                              )}
                            </div>
```
Sostituire con:
```javascript
                              {isLive && (
                                <button onClick={() => sendEnergy(ritual.id)} className="btn-secondary px-4">
                                  ⚡ {ritual.energy}
                                </button>
                              )}
                              <button
                                onClick={() => toggleCandle(ritual.id)}
                                className="px-4"
                                aria-label={isCandleLit ? t.rituals.candleExtinguish : t.rituals.candleLight}
                                title={isCandleLit ? t.rituals.candleExtinguish : t.rituals.candleLight}
                                style={{
                                  borderRadius: '0.75rem',
                                  border: isCandleLit ? '1px solid rgba(251,191,36,0.7)' : '1px solid rgba(255,255,255,0.2)',
                                  background: isCandleLit ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.06)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <span style={{filter: isCandleLit ? 'none' : 'grayscale(1) opacity(0.6)'}}>🕯️</span> {candleCount}
                              </button>
                            </div>
```

- [ ] **Step 6: Verifica montaggio JSX**

Run: con server su `http://localhost:4321`, caricare `app.html` in Playwright headless e controllare `pageerror`/`console.error`.
Expected: nessun errore, React monta, la card rituale mostra il bottone 🕯️.

- [ ] **Step 7: Commit**

```bash
git add app.html
git commit -m "feat(rituali): bottone candela 🕯️ con toggle (Batch D #10)"
```

---

## Task 3: Test toggle candela

**Files:**
- Create: `test-rituali-candele.js`

- [ ] **Step 1: Scrivere il test**

```javascript
/**
 * Test candela rituali (Batch D #10) — Global Awakening
 *
 * Copre toggle_ritual_candle: accendi (count+1, presente), spegni (count-1, assente),
 * indipendenza tra session_id diversi.
 *
 * Esecuzione: node test-rituali-candele.js
 * Prerequisito: aver applicato supabase/sql/09_ritual_candles.sql.
 */
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS  = Date.now();
const SID1 = `candle-s1-${TS}`;
const SID2 = `candle-s2-${TS}`;
const PAST_DATE = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

let passed = 0, failed = 0;
function pass(m) { console.log(`  ✅ ${m}`); passed++; }
function fail(m) { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; }

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers },
    ...opts,
  });
  if (res.status === 204) return null;
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return txt; }
}
async function rpc(fn, params) {
  return sb(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
}
const candlesOf = (row) => (row && row[0] && Array.isArray(row[0].candles)) ? row[0].candles : null;

(async () => {
  console.log('— Setup —');
  await rpc('cleanup_expired_rituals', {});
  const created = await rpc('create_ritual', {
    p_creator: `CandGuest_${TS}`, p_creator_id: SID1, p_name: `Candela-${TS}`,
    p_description: 'test', p_type: 'consciousness', p_sacred_number: 11,
    p_date: PAST_DATE, p_time: '12:00:00', p_duration: 5, p_password_hash: null,
  });
  const ritId = Array.isArray(created) && created[0] ? created[0].id : null;
  if (ritId == null) { fail(`setup: create_ritual fallito: ${JSON.stringify(created)}`); console.log(`\nRisultato: ${passed} passati, ${failed} falliti`); return; }
  pass('rituale di test creato');

  console.log('— Toggle —');
  let r = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID1 });
  let c = candlesOf(r);
  if (c && c.includes(SID1) && c.length === 1) pass('accendi -> candela presente, count 1');
  else fail(`accendi fallito: ${JSON.stringify(r)}`);

  r = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID1 });
  c = candlesOf(r);
  if (c && !c.includes(SID1) && c.length === 0) pass('rispegni -> candela assente, count 0');
  else fail(`spegni fallito: ${JSON.stringify(r)}`);

  await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID1 });
  r = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID2 });
  c = candlesOf(r);
  if (c && c.includes(SID1) && c.includes(SID2) && c.length === 2) pass('due utenti -> count 2');
  else fail(`due utenti fallito: ${JSON.stringify(r)}`);

  r = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID1 });
  c = candlesOf(r);
  if (c && !c.includes(SID1) && c.includes(SID2) && c.length === 1) pass('spegni uno -> resta l\'altro, count 1');
  else fail(`indipendenza fallita: ${JSON.stringify(r)}`);

  console.log('— Teardown —');
  await rpc('cleanup_expired_rituals', {});
  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
```

- [ ] **Step 2: Commit**

```bash
git add test-rituali-candele.js
git commit -m "test(rituali): toggle candela (Batch D #10)"
```

---

## Task 4: Applicazione DB + verifica + deploy (gate utente)

**Files:** nessuna modifica codice.

- [ ] **Step 1: Far applicare `supabase/sql/09_ritual_candles.sql` in Studio**

Chiedere all'utente di eseguire l'`ALTER TABLE` + `CREATE FUNCTION` (additivo, non-breaking). Confermare successo.

- [ ] **Step 2: Eseguire il test candela**

Run: `node test-rituali-candele.js`
Expected: tutte `✅`, `0 falliti`.

- [ ] **Step 3: Non-regressione + smoke UI**

Avviare server se non attivo. Run: `node test-rituali.js` → 18/18.
Smoke: caricare l'app, aprire il tab Rituali, verificare che il bottone 🕯️ appaia sulle card e che il click incrementi il contatore.

- [ ] **Step 4: Push + verifica deploy live + memoria**

Push `main`, verifica GitHub Pages (`toggle_ritual_candle` presente nel client live), aggiornare `project_global_awakening.md` + `MEMORY.md` (Batch D #10 fatto) e marcare il candidato nel backlog.

---

## Note di verifica del piano (self-review)

- **Copertura spec:** colonna+RPC toggle (Task 1), handler+bottone+i18n (Task 2), test (Task 3), apply+deploy (Task 4). ✔
- **Coerenza nomi:** RPC `toggle_ritual_candle(bigint,text)`, colonna `candles`, handler `toggleCandle`, var `candleCount`/`isCandleLit`, i18n `t.rituals.candleLight`/`candleExtinguish`. Usati in modo identico tra i task.
- **Robustezza:** client usa `(ritual.candles || [])` per righe vecchie senza colonna (anche se l'ALTER popola tutte con `'[]'`).
- **jsonb:** rimozione elemento via `jsonb_agg ... WHERE e <> to_jsonb(p_session_id)` con fallback `'[]'`; append via `candles || to_jsonb(p_session_id)`. `@>` per il check di presenza.
- **Trustful coerente:** niente hash (come join/energy); session_id opaco, no impersonazione identità.
