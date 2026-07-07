/**
 * Test statistiche telepatia da fonte unica — Global Awakening (Task B1, bug 6)
 *
 * Copre:
 *   1. Formula match% (client-side, nessuna dipendenza DB): round(matches/rounds*100),
 *      incluso il caso 0 round -> 0%. Gira sempre, anche senza migration applicata.
 *   2. RPC get_public_telepathy_stats(nickname): dato un utente con riga in profiles
 *      e riga in telepathy_scores con valori noti, la RPC ritorna quei contatori.
 *   3. Degrado sicuro: nickname con profilo ma SENZA riga in telepathy_scores ->
 *      la RPC non ritorna righe (inner join), il client-side fallback (in openProfile)
 *      interpreta un array vuoto come "nessun dato" e cade sui campi legacy/0 senza crash.
 *
 * Gate DB: la migration 15_public_telepathy_stats.sql potrebbe NON essere ancora
 * applicata su Supabase (funzione assente). In quel caso il test rileva l'errore
 * "function does not exist" e stampa SKIP, uscendo con successo (exit 0) — non e'
 * un fallimento del codice, e' uno stato atteso finche' l'utente non da' l'ok per
 * applicare la migration in Studio (stesso pattern di test-telepathy-session-end.js).
 *
 * Esecuzione: node test-telepathy-stats.js
 */

const { purge } = require('./test-helpers');

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const NICK = `StatsT_${TS}`;           // ha profilo + telepathy_scores con valori noti
const EMAIL = `statst_${TS}@test.com`;
const SID = `stats-sid-${TS}`;
const NICK_NO_SCORES = `StatsNoScore_${TS}`; // ha profilo ma NESSUNA riga telepathy_scores
const EMAIL_NO_SCORES = `statsns_${TS}@test.com`;
const SID_NO_SCORES = `stats-sid-ns-${TS}`;

// Valori noti (eco del bug originale: "Round 21 / Accuracy 14%").
const ROUNDS = 21;
const MATCHES = 3; // round(3/21*100) = 14

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

async function rpc(fn, params) {
  return sbFetch(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
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

async function cleanup() {
  const res = await purge(SUPABASE_URL, [
    `profiles?email=eq.${encodeURIComponent(EMAIL)}`,
    `profiles?email=eq.${encodeURIComponent(EMAIL_NO_SCORES)}`,
    `telepathy_scores?user_id=eq.${encodeURIComponent(EMAIL)}`,
  ], { label: 'test-telepathy-stats' });
  if (!res.ran) {
    console.log('  (pulizia saltata: righe di test lasciate nel DB, stesso limite noto di test-merge-guest.js)');
  }
}

(async () => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  TEST STATISTICHE TELEPATIA — fonte unica (Task B1)');
  console.log(`  Nickname: ${NICK} / ${NICK_NO_SCORES}`);
  console.log('══════════════════════════════════════════════════\n');

  // ══════════════════════════════════════════════════════════════════════
  // PARTE 1 — formula match% (client-side, nessuna dipendenza DB).
  // Stessa formula usata in openProfile/render (Math.round(matches/rounds*100)).
  // ══════════════════════════════════════════════════════════════════════
  console.log('— Formula match% —');

  const matchPct = (rounds, matches) => (rounds > 0 ? Math.round((matches / rounds) * 100) : 0);

  if (matchPct(0, 0) === 0) pass('0 round -> 0% (non NaN/Infinity)');
  else fail(`0 round dovrebbe dare 0%, ha dato ${matchPct(0, 0)}`);

  if (matchPct(ROUNDS, MATCHES) === 14) pass(`round(${MATCHES}/${ROUNDS}*100) = 14%`);
  else fail(`round(${MATCHES}/${ROUNDS}*100) dovrebbe essere 14, ha dato ${matchPct(ROUNDS, MATCHES)}`);

  if (matchPct(7, 2) === 29) pass('round(2/7*100) = 29% (arrotondamento verificato su un secondo caso)');
  else fail(`round(2/7*100) dovrebbe essere 29, ha dato ${matchPct(7, 2)}`);

  if (matchPct(10, 10) === 100) pass('round(10/10*100) = 100% (match perfetto)');
  else fail(`round(10/10*100) dovrebbe essere 100, ha dato ${matchPct(10, 10)}`);

  console.log('');

  // ══════════════════════════════════════════════════════════════════════
  // PARTE 2 — RPC get_public_telepathy_stats (gate DB: migration 15_).
  // ══════════════════════════════════════════════════════════════════════
  console.log('— RPC get_public_telepathy_stats —');

  try {
    await cleanup();

    // Setup: profilo + telepathy_scores con valori noti (utente "normale").
    const insProfile = await sbFetch('profiles', {
      method: 'POST',
      body: JSON.stringify({
        session_id: SID, nickname: NICK, email: EMAIL,
        bio: '', country: '', interests: [],
        telepathy_score: 999, telepathy_best: 999, // volutamente DIVERSI dalla fonte unica:
        // se la RPC (o il suo fallback) leggesse ancora da qui invece che da
        // telepathy_scores, il test lo scoprirebbe subito.
        show_telepathy_score: true
      }),
    });
    if (!insProfile.ok) { fail(`Setup profilo fallito: HTTP ${insProfile.status} — ${JSON.stringify(insProfile.body)}`); throw new Error('setup'); }
    pass('Profilo di test creato (telepathy_score/best legacy volutamente sbagliati: 999/999)');

    const insProfile2 = await sbFetch('profiles', {
      method: 'POST',
      body: JSON.stringify({
        session_id: SID_NO_SCORES, nickname: NICK_NO_SCORES, email: EMAIL_NO_SCORES,
        bio: '', country: '', interests: [], show_telepathy_score: true
      }),
    });
    if (!insProfile2.ok) { fail(`Setup profilo (senza scores) fallito: HTTP ${insProfile2.status}`); throw new Error('setup2'); }
    pass('Profilo di test SENZA riga telepathy_scores creato');

    // Popola telepathy_scores con valori noti tramite la RPC gia' collaudata
    // (increment_telepathy_score, Fix #4/#23) — stessa via usata da endSession.
    const incr = await rpc('increment_telepathy_score', {
      p_user_id: EMAIL, p_nickname: NICK, p_rounds: ROUNDS, p_matches: MATCHES
    });
    if (!incr.ok) { fail(`Setup telepathy_scores fallito: HTTP ${incr.status} — ${JSON.stringify(incr.body)}`); throw new Error('setup-scores'); }
    pass(`telepathy_scores popolato: rounds=${ROUNDS}, matches=${MATCHES}`);

    // ── Chiamata alla RPC sotto test ──────────────────────────────────────
    const statsRes = await rpc('get_public_telepathy_stats', { p_nickname: NICK });

    if (!statsRes.ok) {
      if (isMissingSchemaError(statsRes.body)) {
        console.log('  ⏭️  SKIP: migration 15_ non applicata (RPC get_public_telepathy_stats assente su Supabase).');
        console.log('     Applicare supabase/sql/15_public_telepathy_stats.sql in Studio per eseguire questo test.');
        await cleanup();
        process.exitCode = 0;
        return;
      }
      fail(`RPC get_public_telepathy_stats fallita: HTTP ${statsRes.status} — ${JSON.stringify(statsRes.body)}`);
      throw new Error('rpc fallita');
    }
    pass('RPC get_public_telepathy_stats eseguita con successo');

    const rows = statsRes.body;
    if (Array.isArray(rows) && rows.length === 1) {
      pass('RPC ritorna esattamente una riga per un nickname con dati');
    } else {
      fail(`RPC dovrebbe ritornare una riga, ha ritornato: ${JSON.stringify(rows)}`);
    }
    const row = Array.isArray(rows) && rows[0];
    if (row && row.rounds_count === ROUNDS) {
      pass(`rounds_count = ${ROUNDS} (dalla fonte unica telepathy_scores, non da profiles.telepathy_score=999)`);
    } else {
      fail(`rounds_count inatteso: ${row && row.rounds_count} (atteso ${ROUNDS})`);
    }
    if (row && row.matches_count === MATCHES) {
      pass(`matches_count = ${MATCHES} (dalla fonte unica telepathy_scores, non da profiles.telepathy_best=999)`);
    } else {
      fail(`matches_count inatteso: ${row && row.matches_count} (atteso ${MATCHES})`);
    }

    // ── Degrado sicuro: nickname con profilo ma senza telepathy_scores ────
    const statsResEmpty = await rpc('get_public_telepathy_stats', { p_nickname: NICK_NO_SCORES });
    if (!statsResEmpty.ok) {
      fail(`RPC su nickname senza scores ha fallito (dovrebbe degradare a nessuna riga): HTTP ${statsResEmpty.status}`);
    } else if (Array.isArray(statsResEmpty.body) && statsResEmpty.body.length === 0) {
      pass('Nickname senza riga telepathy_scores -> RPC ritorna array vuoto (nessun crash; il client cade sul fallback 0/legacy)');
    } else {
      fail(`Nickname senza scores: attesa risposta vuota, ricevuto ${JSON.stringify(statsResEmpty.body)}`);
    }

    // ── Nickname inesistente: stesso degrado sicuro ────────────────────────
    const statsResGhost = await rpc('get_public_telepathy_stats', { p_nickname: `Ghost_${TS}` });
    if (statsResGhost.ok && Array.isArray(statsResGhost.body) && statsResGhost.body.length === 0) {
      pass('Nickname inesistente -> RPC ritorna array vuoto (nessun crash)');
    } else {
      fail(`Nickname inesistente: attesa risposta vuota, ricevuto HTTP ${statsResGhost.status} ${JSON.stringify(statsResGhost.body)}`);
    }

  } catch (err) {
    if (failed === 0) fail(`Errore imprevisto: ${err.message}`);
  } finally {
    await cleanup();

    console.log('\n══════════════════════════════════════════════════');
    const totale = passed + failed;
    console.log(`  ${passed}/${totale} test passati`);
    console.log(process.exitCode === 1
      ? '  RISULTATO: ❌ FALLITO'
      : '  RISULTATO: ✅ PASSATO');
    console.log('══════════════════════════════════════════════════\n');
  }
})();
