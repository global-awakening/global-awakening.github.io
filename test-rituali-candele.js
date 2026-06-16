/**
 * Test candela rituali (Batch D #10) — Global Awakening
 *
 * Copre toggle_ritual_candle: accendi (count+1, presente), spegni (count-1, assente),
 * indipendenza tra session_id diversi.
 *
 * Esecuzione: node test-rituali-candele.js
 * Prerequisito: aver applicato supabase/sql/09_ritual_candles.sql.
 */
const { purge } = require('./test-helpers');

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS  = Date.now();
const CREATOR = `CandGuest_${TS}`;
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
    p_creator: CREATOR, p_creator_id: SID1, p_name: `Candela-${TS}`,
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
  // Pulizia DETERMINISTICA del rituale di questo run: purge filtra esattamente sul
  // creator del run via service_role key → cancella sempre, indipendentemente dalla
  // logica di scadenza di cleanup_expired_rituals (che resta nel Setup come igiene
  // iniziale). Cancellando il rituale spariscono anche le candele (JSONB su rituals).
  // Vedi test-helpers.js.
  await purge(SUPABASE_URL, [
    `rituals?creator=eq.${encodeURIComponent(CREATOR)}`,
  ], { label: 'rituali-candele' });
  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
