/**
 * Test GDPR export + eliminazione account — Global Awakening
 *
 * Copre:
 *   - export_my_account: auth ok ritorna tutte le sezioni; auth errata -> Auth failed
 *   - delete_my_account: anonimizza i contenuti pubblici, cancella privati+profilo;
 *     auth errata -> Auth failed
 *
 * Esecuzione: node test-account-gdpr.js
 * Prerequisito: aver applicato supabase/sql/06_account_gdpr.sql in Studio.
 */
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS    = Date.now();
const NICK  = `Gdpr_${TS}`;
const EMAIL = `gdpr_${TS}@test.com`;
const SID   = `gdpr-sid-${TS}`;
const HASH  = `hash-${TS}`;
const OTHER = `GdprOther_${TS}`;

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

async function seed() {
  await sb('profiles', { method: 'POST', body: JSON.stringify({
    session_id: SID, nickname: NICK, email: EMAIL, password_hash: HASH,
    bio: 'test', country: '', interests: [], telepathy_score: 0, telepathy_best: 0,
    show_telepathy_score: true }) });
  await sb('consciousness_posts', { method: 'POST', body: JSON.stringify({ author_nickname: NICK, content: 'post di test' }) });
  await sb('private_messages', { method: 'POST', body: JSON.stringify({ sender_id: SID, sender_name: NICK, receiver_name: OTHER, content: 'ciao', is_read: false }) });
}

async function cleanup() {
  await sb(`profiles?email=eq.${encodeURIComponent(EMAIL)}`, { method: 'DELETE' });
  await sb(`consciousness_posts?author_nickname=eq.${encodeURIComponent(NICK)}`, { method: 'DELETE' });
  await sb(`consciousness_posts?author_nickname=eq.${encodeURIComponent('Utente eliminato')}&content=eq.${encodeURIComponent('post di test')}`, { method: 'DELETE' });
  await sb(`private_messages?sender_name=eq.${encodeURIComponent(NICK)}`, { method: 'DELETE' });
}

(async () => {
  console.log('— Setup —');
  await cleanup();
  await seed();

  console.log('— Export —');
  const exp = await rpc('export_my_account', { p_nickname: NICK, p_password_hash: HASH });
  if (exp && exp.profile && exp.profile.nickname === NICK) pass('export ritorna il profilo');
  else fail(`export profilo mancante: ${JSON.stringify(exp)}`);
  if (exp && exp.profile && exp.profile.password_hash === undefined) pass('export NON contiene password_hash');
  else fail('export espone password_hash');
  if (exp && Array.isArray(exp.private_messages) && exp.private_messages.length >= 1) pass('export include i messaggi privati');
  else fail('export messaggi privati mancanti');
  if (exp && Array.isArray(exp.consciousness_posts) && exp.consciousness_posts.length >= 1) pass('export include i post');
  else fail('export post mancanti');

  const expBad = await rpc('export_my_account', { p_nickname: NICK, p_password_hash: 'sbagliato' });
  if (expBad && /Auth failed/.test(JSON.stringify(expBad))) pass('export con hash errato -> Auth failed');
  else fail(`export hash errato non rifiutato: ${JSON.stringify(expBad)}`);

  console.log('— Delete —');
  const delBad = await rpc('delete_my_account', { p_nickname: NICK, p_password_hash: 'sbagliato' });
  if (delBad && /Auth failed/.test(JSON.stringify(delBad))) pass('delete con hash errato -> Auth failed');
  else fail(`delete hash errato non rifiutato: ${JSON.stringify(delBad)}`);

  await rpc('delete_my_account', { p_nickname: NICK, p_password_hash: HASH });
  const prof = await sb(`profiles?nickname=eq.${encodeURIComponent(NICK)}&select=nickname`);
  if (Array.isArray(prof) && prof.length === 0) pass('delete rimuove la riga profiles');
  else fail(`profiles ancora presente: ${JSON.stringify(prof)}`);

  const msgs = await sb(`private_messages?sender_name=eq.${encodeURIComponent(NICK)}&select=id`);
  if (Array.isArray(msgs) && msgs.length === 0) pass('delete rimuove i messaggi privati');
  else fail(`messaggi ancora presenti: ${JSON.stringify(msgs)}`);

  const posts = await sb(`consciousness_posts?content=eq.${encodeURIComponent('post di test')}&select=author_nickname`);
  if (Array.isArray(posts) && posts.length >= 1 && posts[0].author_nickname === 'Utente eliminato') pass('delete anonimizza i post pubblici');
  else fail(`post non anonimizzato: ${JSON.stringify(posts)}`);

  console.log('— Teardown —');
  await cleanup();
  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
