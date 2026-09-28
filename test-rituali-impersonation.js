/**
 * Test anti-impersonazione Rituali Step B — Global Awakening
 *
 * Copre create_ritual / create_ritual_comment (overload con p_password_hash):
 *   - registrato + hash giusto -> ok
 *   - registrato + hash errato/assente -> Auth failed
 *   - guest (nick non in profiles) + hash null -> ok
 *
 * Esecuzione: node test-rituali-impersonation.js
 * Prerequisito: aver applicato il BLOCCO 1 di supabase/sql/07_rituali_step_b.sql.
 */
const { requireServiceKey, createTestAccount, deleteTestAccount } = require('./test-helpers');
requireServiceKey();

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS    = Date.now();
const REG   = `RitB_${TS}`;
const EMAIL = `ritb_${TS}@test.com`;
const SID   = `ritb-sid-${TS}`;
const HASH  = `hash-${TS}`;
const GUEST = `RitGuest_${TS}`;
// Date già scadute (UTC ieri) così cleanup_expired_rituals rimuove i rituali di test.
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
const ritParams = (creator, hash, name) => ({
  p_creator: creator, p_creator_id: SID, p_name: name,
  p_description: 'test', p_type: 'consciousness', p_sacred_number: 11,
  p_date: PAST_DATE, p_time: '12:00:00', p_duration: 5, p_password_hash: hash,
});

async function cleanup() {
  await deleteTestAccount(EMAIL);
  await rpc('cleanup_expired_rituals', {});
}

(async () => {
  console.log('— Setup —');
  await cleanup();
  await createTestAccount({
    session_id: SID, nickname: REG, email: EMAIL, password_hash: HASH,
    bio: '', country: '', interests: [], telepathy_score: 0, telepathy_best: 0, show_telepathy_score: true });

  console.log('— create_ritual —');
  const okReg = await rpc('create_ritual', ritParams(REG, HASH, `R-ok-${TS}`));
  if (Array.isArray(okReg) && okReg[0] && okReg[0].creator === REG) pass('registrato + hash giusto -> rituale creato');
  else fail(`registrato+hash giusto fallito: ${JSON.stringify(okReg)}`);

  const badReg = await rpc('create_ritual', ritParams(REG, 'sbagliato', `R-bad-${TS}`));
  if (badReg && /Auth failed/.test(JSON.stringify(badReg))) pass('registrato + hash errato -> Auth failed');
  else fail(`registrato+hash errato non rifiutato: ${JSON.stringify(badReg)}`);

  const nullReg = await rpc('create_ritual', ritParams(REG, null, `R-null-${TS}`));
  if (nullReg && /Auth failed/.test(JSON.stringify(nullReg))) pass('registrato + hash null -> Auth failed');
  else fail(`registrato+hash null non rifiutato: ${JSON.stringify(nullReg)}`);

  const guestOk = await rpc('create_ritual', ritParams(GUEST, null, `G-ok-${TS}`));
  if (Array.isArray(guestOk) && guestOk[0] && guestOk[0].creator === GUEST) pass('guest (nick libero) + hash null -> rituale creato');
  else fail(`guest non ha potuto creare: ${JSON.stringify(guestOk)}`);

  console.log('— create_ritual_comment —');
  const ritId = (Array.isArray(guestOk) && guestOk[0]) ? guestOk[0].id : (Array.isArray(okReg) && okReg[0] ? okReg[0].id : null);
  if (ritId == null) { fail('nessun ritual_id per testare i commenti'); }
  else {
    const cOk = await rpc('create_ritual_comment', { p_ritual_id: ritId, p_author_nickname: REG, p_content: 'ciao', p_password_hash: HASH });
    if (Array.isArray(cOk) && cOk[0] && cOk[0].author_nickname === REG) pass('commento registrato + hash giusto -> ok');
    else fail(`commento registrato+hash giusto fallito: ${JSON.stringify(cOk)}`);

    const cBad = await rpc('create_ritual_comment', { p_ritual_id: ritId, p_author_nickname: REG, p_content: 'spoof', p_password_hash: 'sbagliato' });
    if (cBad && /Auth failed/.test(JSON.stringify(cBad))) pass('commento registrato + hash errato -> Auth failed');
    else fail(`commento impersonato non rifiutato: ${JSON.stringify(cBad)}`);

    const cGuest = await rpc('create_ritual_comment', { p_ritual_id: ritId, p_author_nickname: GUEST, p_content: 'guest', p_password_hash: null });
    if (Array.isArray(cGuest) && cGuest[0] && cGuest[0].author_nickname === GUEST) pass('commento guest (nick libero) -> ok');
    else fail(`commento guest fallito: ${JSON.stringify(cGuest)}`);
  }

  console.log('— Teardown —');
  await cleanup();
  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
