/**
 * Test validazione RPC rituali "trustful" (B5) — Global Awakening
 *
 * Verifica l'hardening di supabase/sql/11_rpc_validation_hardening.sql:
 *   join_ritual / send_ritual_energy / toggle_ritual_candle devono ACCETTARE
 *   gli input legittimi e RIFIUTARE quelli illegittimi (session vuoto/enorme,
 *   rituale inesistente, energia fuori range).
 *
 * Esecuzione: node test-rituali-validazione.js
 * NB: ROSSO finché 11_ non è applicato in Supabase SQL Editor (le vecchie
 *     funzioni accettano gli input illegittimi); VERDE dopo l'apply.
 * Auto-pulizia: purge del rituale del run via service_role key (test-helpers).
 */
const { purge } = require('./test-helpers');

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const CREATOR = `ValGuest_${TS}`;
const SID = `val-sess-${TS}`;
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
  let body = null;
  try { body = await res.json(); } catch { /* void/empty */ }
  return { status: res.status, body };
}
const rpc = (fn, params) => sb(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });

const okAccepted = (r, m) => (r.status >= 200 && r.status < 300)
  ? pass(`${m} (HTTP ${r.status})`)
  : fail(`${m}: atteso 2xx, ottenuto ${r.status} ${JSON.stringify(r.body)}`);
const okRejected = (r, m) => (r.status >= 400)
  ? pass(`${m} (rifiutato HTTP ${r.status}: ${r.body && r.body.message})`)
  : fail(`${m}: atteso errore, ottenuto ${r.status} (input NON validato)`);

(async () => {
  console.log('— Setup —');
  const created = await rpc('create_ritual', {
    p_creator: CREATOR, p_creator_id: SID, p_name: `Validazione-${TS}`,
    p_description: 'test b5', p_type: 'consciousness', p_sacred_number: 11,
    p_date: PAST_DATE, p_time: '12:00:00', p_duration: 5, p_password_hash: null,
  });
  const ritId = Array.isArray(created.body) && created.body[0] ? created.body[0].id : null;
  if (ritId == null) { fail(`setup: create_ritual fallito: ${created.status} ${JSON.stringify(created.body)}`); console.log(`\nRisultato: ${passed} passati, ${failed} falliti`); return; }
  pass('rituale di test creato');

  console.log('— Input legittimi: devono essere ACCETTATI —');
  okAccepted(await rpc('join_ritual', { p_ritual_id: ritId, p_session_id: SID }), 'join valido');
  okAccepted(await rpc('send_ritual_energy', { p_ritual_id: ritId, p_amount: 10 }), 'energia valida (10)');
  okAccepted(await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID }), 'candela valida');

  console.log('— Input illegittimi: devono essere RIFIUTATI —');
  okRejected(await rpc('join_ritual', { p_ritual_id: ritId, p_session_id: '' }), 'join: session vuoto');
  okRejected(await rpc('join_ritual', { p_ritual_id: ritId, p_session_id: 'x'.repeat(300) }), 'join: session troppo lungo');
  okRejected(await rpc('join_ritual', { p_ritual_id: 999999999, p_session_id: 's1' }), 'join: rituale inesistente');
  okRejected(await rpc('send_ritual_energy', { p_ritual_id: 999999999, p_amount: 10 }), 'energia: rituale inesistente');
  okRejected(await rpc('send_ritual_energy', { p_ritual_id: ritId, p_amount: 9999 }), 'energia: fuori range (9999)');
  okRejected(await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: 'x'.repeat(300) }), 'candela: session troppo lungo');
  okRejected(await rpc('toggle_ritual_candle', { p_ritual_id: 999999999, p_session_id: 's1' }), 'candela: rituale inesistente');

  // ── B5 round 2: create_ritual / create_ritual_comment (Step B, hash auth) ──
  const mkRitual = (over) => rpc('create_ritual', {
    p_creator: CREATOR, p_creator_id: SID, p_name: `V-${TS}`,
    p_description: 'x', p_type: 'consciousness', p_sacred_number: 11,
    p_date: PAST_DATE, p_time: '12:00:00', p_duration: 5, p_password_hash: null,
    ...over,
  });

  console.log('— create_ritual: input legittimi ACCETTATI —');
  okAccepted(await mkRitual({ p_type: 'ascension', p_sacred_number: 108 }), 'create: type/sacred validi');

  console.log('— create_ritual: input illegittimi RIFIUTATI —');
  okRejected(await mkRitual({ p_type: 'malware' }), 'create: type non in whitelist');
  okRejected(await mkRitual({ p_sacred_number: 999999 }), 'create: sacred_number fuori range');
  okRejected(await mkRitual({ p_name: 'x'.repeat(300) }), 'create: name troppo lungo');
  okRejected(await mkRitual({ p_date: null }), 'create: date mancante');
  okRejected(await rpc('create_ritual_comment', {
    p_ritual_id: ritId, p_author_nickname: 'x'.repeat(300), p_content: 'ok', p_password_hash: null,
  }), 'comment: author troppo lungo');

  // ── B9: rate-limit create_ritual (max 5 / 10 min per creator_id) ──
  // creator_id dedicato per non interferire col budget di SID usato sopra.
  console.log('— Rate-limit (B9): create_ritual max 5 / 10 min per creator_id —');
  const RLCREATOR = `RLGuest_${TS}`;
  const RLSID = `rl-sess-${TS}`;
  const mkRL = () => rpc('create_ritual', {
    p_creator: RLCREATOR, p_creator_id: RLSID, p_name: `RL-${TS}`,
    p_description: 'x', p_type: 'consciousness', p_sacred_number: 11,
    p_date: PAST_DATE, p_time: '12:00:00', p_duration: 5, p_password_hash: null,
  });
  let rlFirstFive = true;
  for (let i = 1; i <= 5; i++) {
    const r = await mkRL();
    if (!(r.status >= 200 && r.status < 300)) { rlFirstFive = false; fail(`rate-limit: create #${i}/5 doveva passare (HTTP ${r.status} ${JSON.stringify(r.body)})`); }
  }
  if (rlFirstFive) pass('rate-limit: i primi 5 create sotto soglia passano');
  okRejected(await mkRL(), 'rate-limit: il 6° create entro la finestra è bloccato');

  console.log('— Teardown —');
  await purge(SUPABASE_URL, [
    `rituals?creator=eq.${encodeURIComponent(CREATOR)}`,
    `rituals?creator=eq.${encodeURIComponent(RLCREATOR)}`,
  ], { label: 'rituali-validazione' });
  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
