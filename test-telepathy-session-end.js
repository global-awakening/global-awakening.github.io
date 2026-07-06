/**
 * Test flag "ended" condiviso su DB — Global Awakening (Task A1)
 *
 * Copre SOLO la parte flag (l'accept da schermata "sessione conclusa" è A5):
 *   1. Crea un match telepathy_matches tra due sessioni simulate (A, B).
 *   2. Chiama la RPC end_telepathy_match(matchId, 'A').
 *   3. Verifica che una SELECT successiva veda ended_at valorizzato e
 *      ended_by === 'A', letta sia "dal lato A" che "dal lato B" (stessa
 *      tabella trustful, nessuna RLS per-utente: la lettura è identica per
 *      entrambi i lati, come nel polling reale pollResult/checkPartnerLeft).
 *
 * Gate DB: la migration 14_telepathy_session_end.sql potrebbe NON essere
 * ancora applicata su Supabase (colonne/RPC assenti). In quel caso il test
 * rileva l'errore "function/column does not exist" e stampa SKIP, uscendo
 * con successo (exit 0) — non è un fallimento del codice, è uno stato atteso
 * finché l'utente non da' l'ok per applicare la migration in Studio.
 *
 * Esecuzione: node test-telepathy-session-end.js
 */

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const SID_A = `TestEndA_${TS}`;
const SID_B = `TestEndB_${TS}`;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; process.exitCode = 1; }

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...opts.headers,
    },
    ...opts,
  });
  let body = null;
  try { body = await res.json(); } catch { /* 204 o vuoto */ }
  return { ok: res.ok, status: res.status, body };
}

/** true se l'errore PostgREST indica funzione/colonna assente (migration non applicata). */
function isMissingSchemaError(body) {
  if (!body) return false;
  const text = JSON.stringify(body).toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('pgrst202') || // function not found nello schema cache
    text.includes('42883') ||    // undefined_function
    text.includes('42703')       // undefined_column
  );
}

async function cleanupMatch(matchId) {
  if (!matchId) return;
  await sbFetch(`telepathy_matches?id=eq.${matchId}`, { method: 'DELETE', prefer: 'return=minimal' });
}

(async () => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  TEST FLAG ENDED — telepathy_matches (Task A1)');
  console.log(`  Sessioni simulate: ${SID_A} ↔ ${SID_B}`);
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

  let matchId = null;

  try {
    // ── Setup: crea un match tra le due sessioni simulate ─────────────────
    const insertRes = await sbFetch('telepathy_matches', {
      method: 'POST',
      body: JSON.stringify({
        user1_id: SID_A,
        user1_nickname: 'TestA',
        user1_role: 'sender',
        user2_id: SID_B,
        user2_nickname: 'TestB',
        user2_role: 'receiver',
        level: 'lvl3',
        round_count: 0,
      }),
    });

    if (!insertRes.ok || !Array.isArray(insertRes.body) || insertRes.body.length === 0) {
      fail(`Impossibile creare il match di test: HTTP ${insertRes.status} — ${JSON.stringify(insertRes.body)}`);
      throw new Error('setup fallito');
    }
    matchId = insertRes.body[0].id;
    console.log(`  Match creato: ${matchId}`);

    // ── Step: chiama la RPC end_telepathy_match ────────────────────────────
    const rpcRes = await sbFetch('rpc/end_telepathy_match', {
      method: 'POST',
      body: JSON.stringify({ p_match_id: matchId, p_ended_by: 'A' }),
    });

    if (!rpcRes.ok) {
      if (isMissingSchemaError(rpcRes.body)) {
        console.log('  ⏭️  SKIP: migration 14_ non applicata (RPC end_telepathy_match assente su Supabase).');
        console.log('     Applicare supabase/sql/14_telepathy_session_end.sql in Studio per eseguire questo test.');
        await cleanupMatch(matchId);
        process.exitCode = 0;
        return;
      }
      fail(`RPC end_telepathy_match fallita: HTTP ${rpcRes.status} — ${JSON.stringify(rpcRes.body)}`);
      throw new Error('rpc fallita');
    }
    console.log('  RPC end_telepathy_match eseguita con successo');

    // ── Verifica: lettura "dal lato A" ──────────────────────────────────────
    const selA = await sbFetch(`telepathy_matches?id=eq.${matchId}&select=id,ended_at,ended_by`, { method: 'GET' });
    if (selA.ok && Array.isArray(selA.body) && selA.body.length === 1 && selA.body[0].ended_at) {
      pass('Lato A: ended_at valorizzato dopo la RPC');
    } else {
      fail(`Lato A: ended_at NON valorizzato — ${JSON.stringify(selA.body)}`);
    }
    if (selA.ok && selA.body[0] && selA.body[0].ended_by === 'A') {
      pass('Lato A: ended_by === "A"');
    } else {
      fail(`Lato A: ended_by inatteso — ${JSON.stringify(selA.body)}`);
    }

    // ── Verifica: lettura "dal lato B" (stessa tabella trustful, stesso dato) ─
    const selB = await sbFetch(`telepathy_matches?id=eq.${matchId}&select=id,ended_at,ended_by`, { method: 'GET' });
    if (selB.ok && Array.isArray(selB.body) && selB.body.length === 1 && selB.body[0].ended_at) {
      pass('Lato B: ended_at valorizzato dopo la RPC (visibile anche dall\'altra prospettiva)');
    } else {
      fail(`Lato B: ended_at NON valorizzato — ${JSON.stringify(selB.body)}`);
    }
    if (selB.ok && selB.body[0] && selB.body[0].ended_by === 'A') {
      pass('Lato B: ended_by === "A" (sa chi ha chiuso, per il messaggio "il partner ha chiuso")');
    } else {
      fail(`Lato B: ended_by inatteso — ${JSON.stringify(selB.body)}`);
    }

    // ── Verifica idempotenza: coalesce non sovrascrive una seconda chiamata ─
    const rpcRes2 = await sbFetch('rpc/end_telepathy_match', {
      method: 'POST',
      body: JSON.stringify({ p_match_id: matchId, p_ended_by: 'B' }),
    });
    if (rpcRes2.ok) {
      const selAfter2 = await sbFetch(`telepathy_matches?id=eq.${matchId}&select=ended_by`, { method: 'GET' });
      if (selAfter2.ok && selAfter2.body[0] && selAfter2.body[0].ended_by === 'A') {
        pass('Idempotenza: seconda chiamata (ended_by=B) non sovrascrive il primo chiudente (coalesce)');
      } else {
        fail(`Idempotenza: ended_by e' stato sovrascritto — ${JSON.stringify(selAfter2.body)}`);
      }
    } else {
      fail(`Seconda chiamata RPC (idempotenza) fallita inaspettatamente: HTTP ${rpcRes2.status}`);
    }

  } catch (err) {
    if (failed === 0) fail(`Errore imprevisto: ${err.message}`);
  } finally {
    await cleanupMatch(matchId);

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
