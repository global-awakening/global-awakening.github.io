/**
 * Test fine sessione condivisa su DB — Global Awakening (Task A1, riscritto per le RPC della 39a)
 *
 * Dopo la 39b le tabelle della telepatia non sono più accessibili con la chiave pubblica: tutto
 * passa dalle RPC. Scenario:
 *   1. La chiave di servizio crea una partita fra due ospiti di prova (A manda, B indovina).
 *   2. A esce con rpc/partita_esci.
 *   3. B legge ended_at / ended_by con rpc/partita_stato: ended_by deve essere l'id pubblico di A.
 *   4. La seconda uscita (di B) non riscrive ended_by (coalesce).
 *   5. Un estraneo che chiama partita_esci su un'altra partita aperta non la chiude.
 * Pulizia con la chiave di servizio, anche se un controllo fallisce.
 *
 * Gate DB: se la 39a non è ancora applicata (RPC assenti) il test stampa SKIP ed esce con 0.
 *
 * Esecuzione: node test-telepathy-session-end.js   (serve SUPABASE_SERVICE_KEY, env o .env.test)
 */
const { SUPABASE_URL, requireServiceKey, getServiceKey } = require('./test-helpers');

const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const SID_A = `TestEndA_${TS}`;
const SID_B = `TestEndB_${TS}`;
const SID_X = `TestEndX_${TS}`;
const NICK_A = `TestEndA_${TS}`;
const NICK_B = `TestEndB_${TS}`;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; process.exitCode = 1; }

async function rest(chiave, path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: chiave, Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...opts.headers,
    },
  });
  const testo = await res.text();
  let body = testo; try { body = JSON.parse(testo); } catch { /* testo o vuoto */ }
  return { ok: res.ok, status: res.status, body };
}
const rpc = (chiave, fn, params) => rest(chiave, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });

/** true se l'errore PostgREST indica funzione assente (migration non applicata). */
function isMissingSchemaError(body) {
  if (!body) return false;
  const text = JSON.stringify(body).toLowerCase();
  return text.includes('does not exist') || text.includes('pgrst202') || text.includes('42883');
}

(async () => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  TEST FINE SESSIONE — RPC partita_esci / partita_stato');
  console.log(`  Sessioni simulate: ${SID_A} ↔ ${SID_B} (estraneo ${SID_X})`);
  console.log('══════════════════════════════════════════════════\n');

  // ══════════════════════════════════════════════════════════════════════
  // PARTE A5 — logica "accept da schermata sessione conclusa" (bug 2).
  // Sempre eseguita (non dipende dalla migration): è logica client-side.
  // ══════════════════════════════════════════════════════════════════════
  console.log('— A5: guard acceptInvite (accept da sessione conclusa) —');

  // Replica 1:1 del guard inline in src/app.jsx (non importabile dal monolite):
  // true = accept BLOCCATO (early return). Deve bloccare SOLO una sessione ATTIVA.
  const acceptBlocked = ({ matchId, partner, sessionEnded, partnerDisconnected }) =>
    !!(matchId || partner) && !sessionEnded && !partnerDisconnected;

  if (acceptBlocked({ matchId: 'm', partner: { id: 'p' }, sessionEnded: false, partnerDisconnected: false }) === true)
    pass('sessione ATTIVA: accept bloccato (non sovrascrive lo stato vivo)');
  else fail('sessione attiva: accept dovrebbe essere bloccato');

  if (acceptBlocked({ matchId: 'm', partner: { id: 'p' }, sessionEnded: true, partnerDisconnected: false }) === false)
    pass('sessione CONCLUSA: accept NON bloccato (bug 2 chiuso)');
  else fail('sessione conclusa: accept NON deve essere bloccato');

  if (acceptBlocked({ matchId: 'm', partner: { id: 'p' }, sessionEnded: false, partnerDisconnected: true }) === false)
    pass('partner DISCONNESSO: accept NON bloccato');
  else fail('partner disconnesso: accept NON deve essere bloccato');

  if (acceptBlocked({ matchId: null, partner: null, sessionEnded: false, partnerDisconnected: false }) === false)
    pass('nessuna sessione: accept NON bloccato');
  else fail('nessuna sessione: accept NON deve essere bloccato');

  // Source-analysis: la truth-table sopra deve corrispondere al codice reale.
  const fs = require('fs');
  const path = require('path');
  const appSrc = fs.readFileSync(path.join(__dirname, 'src', 'app.jsx'), 'utf8');
  const aiStart = appSrc.indexOf('const acceptInvite = async');
  const aiEnd = appSrc.indexOf('const declineInvite', aiStart);
  const ai = (aiStart >= 0 && aiEnd >= 0) ? appSrc.slice(aiStart, aiEnd) : '';
  if (/&& !sessionEnded && !partnerDisconnected/.test(ai))
    pass('src: guard acceptInvite rilassato su sessionEnded/partnerDisconnected');
  else fail('src: guard acceptInvite NON rilassato (bug 2 ancora presente)');
  if (/resetTelepathy\(\)/.test(ai))
    pass('src: acceptInvite resetta la sessione precedente prima di entrare nella nuova');
  else fail('src: acceptInvite non chiama resetTelepathy prima di entrare');

  console.log('');

  requireServiceKey();
  const SVC = getServiceKey();
  const e = encodeURIComponent;
  let matchId = null;
  let matchX = null;

  try {
    // ── Setup: id pubblici e partita di prova (chiave di servizio) ────────
    const ia = await rpc(SVC, 'id_pubblico', { p_sid: SID_A });
    const ib = await rpc(SVC, 'id_pubblico', { p_sid: SID_B });
    const PUB_A = ia.body, PUB_B = ib.body;
    if (!ia.ok || !ib.ok || typeof PUB_A !== 'string' || typeof PUB_B !== 'string') {
      fail(`id_pubblico non disponibile: HTTP ${ia.status}/${ib.status}`);
      throw new Error('setup fallito');
    }
    const crea = (u1, n1, u2, n2) => rest(SVC, 'telepathy_matches', {
      method: 'POST',
      body: JSON.stringify({ user1_id: u1, user1_nickname: n1, user1_role: 'sender',
        user2_id: u2, user2_nickname: n2, user2_role: 'receiver', level: 'lvl3', round_count: 0 }),
    });
    const insertRes = await crea(PUB_A, NICK_A, PUB_B, NICK_B);
    if (!insertRes.ok || !Array.isArray(insertRes.body) || insertRes.body.length === 0) {
      fail(`Impossibile creare il match di test: HTTP ${insertRes.status} — ${JSON.stringify(insertRes.body)}`);
      throw new Error('setup fallito');
    }
    matchId = insertRes.body[0].id;
    console.log(`  Match creato: ${matchId}`);

    // ── Step: A esce con partita_esci ─────────────────────────────────────
    const esciA = await rpc(SUPABASE_KEY, 'partita_esci', { p_session_id: SID_A, p_password_hash: null, p_match_id: matchId });
    if (!esciA.ok) {
      if (isMissingSchemaError(esciA.body)) {
        console.log('  ⏭️  SKIP: migration 39a non applicata (RPC partita_esci assente su Supabase).');
        process.exitCode = 0;
        return;
      }
      fail(`RPC partita_esci fallita: HTTP ${esciA.status} — ${JSON.stringify(esciA.body)}`);
      throw new Error('rpc fallita');
    }
    console.log('  A è uscito con partita_esci');

    // ── Verifica: B legge lo stato con partita_stato ──────────────────────
    const statoB = await rpc(SUPABASE_KEY, 'partita_stato', { p_session_id: SID_B, p_password_hash: null, p_match_id: matchId });
    const vb = statoB.body;
    if (statoB.ok && vb && vb.ended_at) pass('Lato B: ended_at valorizzato dopo l\'uscita di A');
    else fail(`Lato B: ended_at NON valorizzato — ${JSON.stringify(statoB.body)}`);
    if (vb && vb.ended_by === PUB_A) pass('Lato B: ended_by è l\'id pubblico di A (sa chi ha chiuso, per "il partner ha chiuso")');
    else fail(`Lato B: ended_by inatteso — ${JSON.stringify(vb && vb.ended_by)} (atteso ${PUB_A})`);

    // ── Verifica lato A (stessa vista, altra prospettiva) ─────────────────
    const statoA = await rpc(SUPABASE_KEY, 'partita_stato', { p_session_id: SID_A, p_password_hash: null, p_match_id: matchId });
    if (statoA.ok && statoA.body && statoA.body.ended_at && statoA.body.ended_by === PUB_A)
      pass('Lato A: vede la stessa chiusura (ended_at, ended_by = A)');
    else fail(`Lato A: chiusura non visibile — ${JSON.stringify(statoA.body)}`);

    // ── Idempotenza: la seconda uscita (B) non riscrive ended_by ──────────
    const esciB = await rpc(SUPABASE_KEY, 'partita_esci', { p_session_id: SID_B, p_password_hash: null, p_match_id: matchId });
    if (esciB.ok) {
      const dopo = await rpc(SUPABASE_KEY, 'partita_stato', { p_session_id: SID_B, p_password_hash: null, p_match_id: matchId });
      if (dopo.body && dopo.body.ended_by === PUB_A)
        pass('Idempotenza: la seconda uscita (B) non sovrascrive il primo chiudente (coalesce)');
      else fail(`Idempotenza: ended_by è stato sovrascritto — ${JSON.stringify(dopo.body && dopo.body.ended_by)}`);
    } else {
      fail(`Seconda chiamata partita_esci fallita inaspettatamente: HTTP ${esciB.status}`);
    }

    // ── Un estraneo non chiude una partita aperta ─────────────────────────
    const idB = PUB_B;
    const apertaRes = await crea(`${idB.slice(0, 8)}x_${TS}`, `${NICK_A}_x1`, `${idB.slice(0, 8)}y_${TS}`, `${NICK_B}_x2`);
    matchX = Array.isArray(apertaRes.body) && apertaRes.body[0] && apertaRes.body[0].id;
    if (!matchX) {
      fail(`Impossibile creare la partita aperta per il test dell'estraneo: HTTP ${apertaRes.status}`);
    } else {
      await rpc(SUPABASE_KEY, 'partita_esci', { p_session_id: SID_X, p_password_hash: null, p_match_id: matchX });
      const vera = await rest(SVC, `telepathy_matches?id=eq.${matchX}&select=ended_at,ended_by`);
      if (vera.body && vera.body[0] && vera.body[0].ended_at === null && vera.body[0].ended_by === null)
        pass('Un estraneo non chiude la partita (partita_esci non fa nulla)');
      else fail(`L'estraneo ha chiuso la partita — ${JSON.stringify(vera.body)}`);
    }
  } catch (err) {
    if (failed === 0) fail(`Errore imprevisto: ${err.message}`);
  } finally {
    // Pulizia con la chiave di servizio (la chat, se c'è, va via in cascata).
    for (const id of [matchId, matchX]) {
      if (id) await rest(SVC, `telepathy_matches?id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
    }
    await rest(SVC, `telepathy_matches?user1_nickname=like.${e(`TestEnd`)}*_${TS}*`, { method: 'DELETE' }).catch(() => {});

    console.log('\n══════════════════════════════════════════════════');
    const totale = passed + failed;
    if (totale > 0) {
      console.log(`  ${passed}/${totale} test passati`);
      console.log(process.exitCode === 1
        ? '  RISULTATO: ❌ FALLITO'
        : '  RISULTATO: ✅ PASSATO');
    }
    console.log('══════════════════════════════════════════════════\n');
  }
})();
