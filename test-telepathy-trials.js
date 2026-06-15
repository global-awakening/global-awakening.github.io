/**
 * Test Fase 2 — raccolta dati telepatia (telepathy_trials).
 *  1) Logica pura: cardCountForLevel (N) e is_hit (target===guess).
 *  2) Integrazione sorgente: src/app.jsx chiama log_telepathy_trial dal lato RICEVENTE,
 *     coi parametri attesi; il file SQL definisce tabella append-only + RLS + RPC SECURITY DEFINER.
 *
 * NB: non esercita il DB (la RPC va applicata in Studio). Verifica logica + wiring.
 * Esecuzione: node test-telepathy-trials.js
 */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const eq = (a, b, m) => {
  if (a === b) { console.log('  ✅ ' + m); passed++; }
  else { console.log(`  ❌ ${m} (atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)})`); failed++; process.exitCode = 1; }
};
const ok = (c, m) => eq(!!c, true, m);

// ── Logica pura (replica 1:1 dell'inline in app.jsx) ──────────────────────────
const N_SYMBOLS = 9, N_NUMBERS = 9, N_WORDS = 6;
const cardCountForLevel = (level) => {
  if (level === 'numbers') return N_NUMBERS;
  if (level === 'words') return N_WORDS;
  const m = /^lvl(\d+)$/.exec(level || '');
  return m ? parseInt(m[1], 10) : N_SYMBOLS;
};
const isHit = (target, guess) => target === guess;

console.log('— cardCountForLevel (N registrato per ogni tentativo) —');
eq(cardCountForLevel('lvl3'), 3, 'lvl3 -> N=3');
eq(cardCountForLevel('lvl5'), 5, 'lvl5 -> N=5');
eq(cardCountForLevel('lvl7'), 7, 'lvl7 -> N=7');
eq(cardCountForLevel('lvl9'), 9, 'lvl9 -> N=9');
eq(cardCountForLevel('numbers'), 9, 'numbers -> N=9');
eq(cardCountForLevel('words'), 6, 'words -> N=6');
eq(cardCountForLevel('shapes'), 9, 'legacy shapes -> N=9');
eq(cardCountForLevel(null), 9, 'null -> N=9 (no crash)');

console.log('— is_hit —');
eq(isHit('star', 'star'), true, 'target==guess -> hit');
eq(isHit('star', 'moon'), false, 'target!=guess -> miss');

console.log('— src/app.jsx: log del tentativo dal lato RICEVENTE —');
const src = fs.readFileSync(path.join(__dirname, 'src', 'app.jsx'), 'utf8');
ok(/cardCountForLevel\s*=\s*\(level\)/.test(src), 'cardCountForLevel definita');
ok(/rpc\('log_telepathy_trial'/.test(src), 'chiama la RPC log_telepathy_trial');
// La chiamata deve stare nel ramo del ricevente (un solo lato scrive)
const recvIdx = src.indexOf("effectiveRole === 'receiver'");
const rpcIdx = src.indexOf("rpc('log_telepathy_trial'");
ok(recvIdx !== -1 && rpcIdx !== -1 && rpcIdx > recvIdx && (rpcIdx - recvIdx) < 600, 'la RPC è nel ramo del ricevente');
for (const p of ['p_match_id', 'p_round', 'p_sender_id', 'p_receiver_id', 'p_mode', 'p_card_count', 'p_target', 'p_guess', 'p_is_hit']) {
  ok(new RegExp(p + ':').test(src), `parametro passato: ${p}`);
}
ok(/p_card_count:\s*cardCountForLevel\(currentLevel\)/.test(src), 'p_card_count = cardCountForLevel(currentLevel)');
ok(/p_receiver_id:\s*userEmail \|\| sessionId/.test(src), 'p_receiver_id = identità affidabile del ricevente');
ok(/p_sender_id:\s*partner\?\.id \|\| null/.test(src), 'p_sender_id = solo partner.id (niente fallback ambiguo user1_id)');
ok(!/p_sender_id:[^\n]*match\.user1_id/.test(src), 'sender_id NON usa match.user1_id (eviterebbe sender==receiver)');

console.log('— supabase/sql/10_telepathy_trials.sql: tabella append-only + RLS + RPC —');
const sql = fs.readFileSync(path.join(__dirname, 'supabase', 'sql', '10_telepathy_trials.sql'), 'utf8');
ok(/CREATE TABLE IF NOT EXISTS telepathy_trials/.test(sql), 'crea tabella telepathy_trials');
ok(/card_count\s+int NOT NULL/.test(sql), 'colonna card_count (N) NOT NULL');
ok(/ENABLE ROW LEVEL SECURITY/.test(sql), 'RLS attiva');
ok(!/CREATE POLICY/i.test(sql), 'nessuna policy → anon non legge/scrive direttamente');
ok(/CREATE OR REPLACE FUNCTION log_telepathy_trial/.test(sql), 'definisce RPC log_telepathy_trial');
ok(/SECURITY DEFINER/.test(sql), 'RPC è SECURITY DEFINER');
ok(/GRANT EXECUTE ON FUNCTION log_telepathy_trial[\s\S]*TO anon/.test(sql), 'GRANT EXECUTE a anon');
ok(/invalid_card_count/.test(sql), 'valida card_count');
ok(/UNIQUE\s*\(match_id,\s*round_number,\s*receiver_id\)/.test(sql), 'vincolo unicità (match_id, round_number, receiver_id)');
ok(/ON CONFLICT[\s\S]*DO NOTHING/.test(sql), 'INSERT idempotente (ON CONFLICT DO NOTHING)');

console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
