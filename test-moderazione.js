/**
 * Test moderazione — segnalazione contenuti e blocco utenti
 *
 * Copre le RPC di supabase/sql/16_moderazione.sql:
 *   block_user / unblock_user / get_my_blocks / report_content
 *   + blocco lato server su send_private_message e get_my_messages
 *   + non-regressione del rate-limit B9 sui messaggi
 *
 * Esecuzione: node test-moderazione.js
 * Prerequisito: aver applicato supabase/sql/16_moderazione.sql in Studio.
 */
const { purge } = require('./test-helpers');

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS       = Date.now();
const NICK_A   = `Mod_A_${TS}`;      // chi blocca / segnala
const NICK_B   = `Mod_B_${TS}`;      // chi viene bloccato
const EMAIL_A  = `mod_a_${TS}@test.com`;
const EMAIL_B  = `mod_b_${TS}@test.com`;
const SID_A    = `mod-sid-a-${TS}`;
const SID_B    = `mod-sid-b-${TS}`;
const HASH_A   = `hash-a-${TS}`;
const HASH_B   = `hash-b-${TS}`;
const BAD_HASH = 'hash-sbagliato';

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
/** true se la risposta della RPC è un errore che contiene `needle`. */
function isError(res, needle) {
  if (!res || typeof res !== 'object') return false;
  const msg = res.message || res.error || res.hint || res.details || '';
  return typeof msg === 'string' && msg.toLowerCase().includes(needle.toLowerCase());
}

async function seed() {
  for (const [sid, nick, email, hash] of [[SID_A, NICK_A, EMAIL_A, HASH_A], [SID_B, NICK_B, EMAIL_B, HASH_B]]) {
    await sb('profiles', { method: 'POST', body: JSON.stringify({
      session_id: sid, nickname: nick, email, password_hash: hash,
      bio: 'test moderazione', country: '', interests: [],
      telepathy_score: 0, telepathy_best: 0, show_telepathy_score: true }) });
  }
}

async function cleanup() {
  const e = encodeURIComponent;
  await sb(`profiles?email=eq.${e(EMAIL_A)}`, { method: 'DELETE' });
  await sb(`profiles?email=eq.${e(EMAIL_B)}`, { method: 'DELETE' });
  await sb(`private_messages?sender_name=eq.${e(NICK_A)}`, { method: 'DELETE' });
  await sb(`private_messages?sender_name=eq.${e(NICK_B)}`, { method: 'DELETE' });
  await sb(`notifications?user_nickname=eq.${e(NICK_A)}`, { method: 'DELETE' });
  await sb(`notifications?user_nickname=eq.${e(NICK_B)}`, { method: 'DELETE' });

  // user_blocks e content_reports hanno RLS ON senza policy: la anon key non cancella
  // nulla (PostgREST risponde comunque 2xx). Serve la chiave privilegiata via purge().
  await purge(SUPABASE_URL, [
    `user_blocks?blocker_nickname=eq.${e(NICK_A)}`,
    `user_blocks?blocker_nickname=eq.${e(NICK_B)}`,
    `content_reports?reporter_nickname=eq.${e(NICK_A)}`,
    `content_reports?reporter_nickname=eq.${e(NICK_B)}`,
  ], { label: 'moderazione' });
}

async function testBlocco() {
  console.log('— Blocco —');

  // 1) auth errata
  let r = await rpc('block_user', { p_nickname: NICK_A, p_password_hash: BAD_HASH, p_blocked_nickname: NICK_B });
  isError(r, 'Auth failed') ? pass('block_user con hash errato → Auth failed')
                            : fail(`block_user con hash errato: atteso Auth failed, ricevuto ${JSON.stringify(r)}`);

  // 2) auto-blocco
  r = await rpc('block_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_A });
  isError(r, 'cannot block yourself') ? pass('auto-blocco rifiutato')
                                      : fail(`auto-blocco: atteso errore, ricevuto ${JSON.stringify(r)}`);

  // 3) idempotenza: due blocchi uguali → una sola riga
  await rpc('block_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });
  await rpc('block_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });
  let blocks = await rpc('get_my_blocks', { p_nickname: NICK_A, p_password_hash: HASH_A });
  const soloB = Array.isArray(blocks) && blocks.filter(x => (x && x.get_my_blocks) === NICK_B || x === NICK_B).length === 1;
  soloB ? pass('block_user è idempotente (una sola riga)')
        : fail(`idempotenza: atteso 1 blocco su ${NICK_B}, ricevuto ${JSON.stringify(blocks)}`);

  // 4) get_my_blocks isola per utente
  blocks = await rpc('get_my_blocks', { p_nickname: NICK_B, p_password_hash: HASH_B });
  (Array.isArray(blocks) && blocks.length === 0)
    ? pass('get_my_blocks ritorna solo i propri blocchi')
    : fail(`get_my_blocks di B: atteso [], ricevuto ${JSON.stringify(blocks)}`);

  // 5) unblock
  await rpc('unblock_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });
  blocks = await rpc('get_my_blocks', { p_nickname: NICK_A, p_password_hash: HASH_A });
  (Array.isArray(blocks) && blocks.length === 0)
    ? pass('unblock_user rimuove il blocco')
    : fail(`dopo unblock: atteso [], ricevuto ${JSON.stringify(blocks)}`);
}

async function testBloccoMessaggi() {
  console.log('— Blocco sui messaggi privati —');

  // B scrive ad A: deve passare (nessun blocco attivo)
  let r = await rpc('send_private_message', {
    p_sender_id: SID_B, p_sender_name: NICK_B, p_receiver_name: NICK_A,
    p_content: 'primo messaggio', p_sender_password_hash: HASH_B });
  if (isError(r, 'blocked')) {
    fail('messaggio bloccato prima ancora che il blocco esistesse');
  }

  // A blocca B
  await rpc('block_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });

  // 6) ora B non riesce più a scrivere ad A
  r = await rpc('send_private_message', {
    p_sender_id: SID_B, p_sender_name: NICK_B, p_receiver_name: NICK_A,
    p_content: 'messaggio dopo il blocco', p_sender_password_hash: HASH_B });
  isError(r, 'Blocked by recipient')
    ? pass('send_private_message da utente bloccato → Blocked by recipient')
    : fail(`invio da bloccato: atteso Blocked by recipient, ricevuto ${JSON.stringify(r)}`);

  // 8) l'inbox di A non mostra più i messaggi di B (nemmeno quello precedente al blocco)
  const inbox = await rpc('get_my_messages', { p_nickname: NICK_A, p_password_hash: HASH_A });
  const daB = Array.isArray(inbox) ? inbox.filter(m => m.sender_name === NICK_B) : [];
  (Array.isArray(inbox) && daB.length === 0)
    ? pass('get_my_messages non restituisce i messaggi di un bloccato')
    : fail(`inbox di A: attesi 0 messaggi da B, ricevuto ${JSON.stringify(inbox).slice(0, 200)}`);

  // 7) dopo lo sblocco l'invio torna possibile
  await rpc('unblock_user', { p_nickname: NICK_A, p_password_hash: HASH_A, p_blocked_nickname: NICK_B });
  r = await rpc('send_private_message', {
    p_sender_id: SID_B, p_sender_name: NICK_B, p_receiver_name: NICK_A,
    p_content: 'messaggio dopo lo sblocco', p_sender_password_hash: HASH_B });
  (r && r.id) ? pass('dopo unblock_user l\'invio riesce di nuovo')
              : fail(`invio dopo sblocco: atteso messaggio creato, ricevuto ${JSON.stringify(r)}`);
}

async function testSegnalazione() {
  console.log('— Segnalazione —');
  const base = {
    p_reporter_nickname: NICK_A, p_password_hash: HASH_A, p_target_nickname: NICK_B,
    p_content_id: 'fake-id-1', p_content_snapshot: 'testo segnalato', p_details: null,
  };

  // 9) content_type fuori dominio
  let r = await rpc('report_content', { ...base, p_content_type: 'inesistente', p_reason: 'spam' });
  isError(r, 'invalid_content_type') ? pass('content_type fuori dominio → invalid_content_type')
                                     : fail(`content_type invalido: ricevuto ${JSON.stringify(r)}`);

  // 10) reason fuori dominio
  r = await rpc('report_content', { ...base, p_content_type: 'post', p_reason: 'perche_si' });
  isError(r, 'invalid_reason') ? pass('reason fuori dominio → invalid_reason')
                               : fail(`reason invalido: ricevuto ${JSON.stringify(r)}`);

  // 11) segnalazione valida
  r = await rpc('report_content', { ...base, p_content_type: 'post', p_reason: 'harassment',
                                    p_details: 'insulti ripetuti' });
  (r && r.id && r.status === 'open')
    ? pass('segnalazione valida creata con status open')
    : fail(`segnalazione valida: ricevuto ${JSON.stringify(r)}`);

  // 12) rate limit: 20 totali nelle 24h, la 21esima fallisce (1 già fatta sopra → altre 19 ok)
  for (let i = 0; i < 19; i++) {
    await rpc('report_content', { ...base, p_content_type: 'post', p_reason: 'spam' });
  }
  r = await rpc('report_content', { ...base, p_content_type: 'post', p_reason: 'spam' });
  isError(r, 'rate_limited') ? pass('21ª segnalazione in 24h → rate_limited')
                             : fail(`rate limit segnalazioni: ricevuto ${JSON.stringify(r)}`);
}

async function testRlsERegressione() {
  console.log('— RLS e non-regressione —');

  // 13) content_reports non leggibile da anon
  let rows = await sb('content_reports?select=*&limit=5');
  (Array.isArray(rows) && rows.length === 0)
    ? pass('content_reports non leggibile via anon')
    : fail(`content_reports via anon: attese 0 righe, ricevuto ${JSON.stringify(rows).slice(0, 200)}`);

  // 14) user_blocks non leggibile da anon
  rows = await sb('user_blocks?select=*&limit=5');
  (Array.isArray(rows) && rows.length === 0)
    ? pass('user_blocks non leggibile via anon')
    : fail(`user_blocks via anon: attese 0 righe, ricevuto ${JSON.stringify(rows).slice(0, 200)}`);

  // 15) non-regressione B9: il rate-limit dei messaggi è ancora vivo dopo il CREATE OR REPLACE
  let last = null;
  for (let i = 0; i < 21; i++) {
    last = await rpc('send_private_message', {
      p_sender_id: SID_B, p_sender_name: NICK_B, p_receiver_name: NICK_A,
      p_content: `rate ${i}`, p_sender_password_hash: HASH_B });
  }
  isError(last, 'rate_limited')
    ? pass('rate-limit B9 sui messaggi ancora attivo dopo 16_')
    : fail(`non-regressione B9: atteso rate_limited alla 21ª, ricevuto ${JSON.stringify(last)}`);
}

(async () => {
  console.log('— Setup —');
  await cleanup();
  await seed();

  await testBlocco();
  await testBloccoMessaggi();
  await testSegnalazione();
  await testRlsERegressione();

  console.log('— Pulizia —');
  await cleanup();

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  if (failed > 0) process.exitCode = 1;
})();
