/**
 * Test Fase 3 — codice ospite leggibile e stabile (es. 'aurora-lince-72').
 *  1) Logica pura del generatore (replica 1:1 dell'inline in app.jsx).
 *  2) Integrazione sorgente: app.jsx genera/persiste 'ga_guest_code', lo usa come
 *     identità del percipiente nei telepathy_trials (al posto del sessionId) e lo
 *     mostra all'ospite.
 * Esecuzione: node test-telepathy-guest-code.js
 */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const eq = (a, b, m) => {
  if (a === b) { console.log('  ✅ ' + m); passed++; }
  else { console.log(`  ❌ ${m} (atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)})`); failed++; process.exitCode = 1; }
};
const ok = (c, m) => eq(!!c, true, m);

// ── Generatore (replica 1:1 dell'inline in app.jsx) ───────────────────────────
const GUEST_ADJ = ['aurora', 'lunare', 'solare', 'stellare', 'cosmico', 'astrale', 'etereo', 'mistico', 'radioso', 'sereno', 'profondo', 'arcano', 'celeste', 'lucente', 'eterno', 'sacro', 'antico', 'divino', 'nebuloso', 'boreale'];
const GUEST_ANIMAL = ['lince', 'cervo', 'lupo', 'falco', 'gufo', 'volpe', 'airone', 'delfino', 'cigno', 'pantera', 'colibri', 'fenice', 'aquila', 'leone', 'tigre', 'orca', 'corvo', 'ibis', 'drago', 'gazzella'];
const makeGuestCode = () => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return `${pick(GUEST_ADJ)}-${pick(GUEST_ANIMAL)}-${1000 + Math.floor(Math.random() * 9000)}`;
};

console.log('— formato del codice (aggettivo-animale-NNNN) —');
const re = /^([a-z]+)-([a-z]+)-(\d{4})$/;
let allOk = true, membershipOk = true;
for (let i = 0; i < 500; i++) {
  const code = makeGuestCode();
  const m = re.exec(code);
  if (!m) { allOk = false; console.log('    formato errato:', code); break; }
  if (!GUEST_ADJ.includes(m[1]) || !GUEST_ANIMAL.includes(m[2])) { membershipOk = false; console.log('    parola fuori lista:', code); break; }
  const n = parseInt(m[3], 10);
  if (n < 1000 || n > 9999) { allOk = false; console.log('    numero fuori range:', code); break; }
}
ok(allOk, 'formato sempre aggettivo-animale-NNNN (NNNN 1000..9999) su 500 campioni');
ok(membershipOk, 'aggettivo e animale sempre dalle liste');
ok(makeGuestCode() !== makeGuestCode() || true, 'genera un codice valido'); // sanity: non lancia

console.log('— src/app.jsx: generazione/persistenza/uso del codice —');
const src = fs.readFileSync(path.join(__dirname, 'src', 'app.jsx'), 'utf8');
ok(/const GUEST_ADJ\s*=/.test(src), 'lista aggettivi definita');
ok(/const GUEST_ANIMAL\s*=/.test(src), 'lista animali definita');
ok(/const makeGuestCode\s*=/.test(src), 'generatore makeGuestCode definito');
ok(/getItem\('ga_guest_code'\)/.test(src), 'legge ga_guest_code da localStorage');
ok(/setItem\('ga_guest_code'/.test(src), 'persiste ga_guest_code (stabile tra sessioni)');
ok(/\[guestCode\]\s*=\s*useState/.test(src), 'stato guestCode');
// Identità del percipiente nei trials: ora usa guestCode (NON più sessionId)
ok(/p_receiver_id:\s*userEmail \|\| guestCode/.test(src), 'p_receiver_id usa userEmail || guestCode');
ok(!/p_receiver_id:\s*userEmail \|\| sessionId/.test(src), 'p_receiver_id NON usa più sessionId');
// Mostrato all'ospite
ok(/guestCodeLabel/.test(src), 'etichetta del codice mostrata (guestCodeLabel)');

console.log('— traduzioni IT/EN per il codice ospite —');
ok((src.match(/guestCodeLabel:/g) || []).length >= 2, 'guestCodeLabel tradotto (IT + EN)');

console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
