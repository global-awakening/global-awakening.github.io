/**
 * Test scala di difficoltà telepatia (per numero di card) + set di 9 simboli.
 *
 * Due livelli di verifica:
 *  1) Logica pura cardCountForLevel/symbolsForLevel — replica 1:1 dell'inline in
 *     app.jsx (il monolite non è importabile), come test-telepathy-role-rotation.js.
 *  2) Integrazione col sorgente: legge src/app.jsx e verifica che il set abbia
 *     davvero 9 simboli (inclusi i nuovi) e che l'infinito sia schiarito.
 *
 * Esecuzione: node test-telepathy-livelli-scala.js
 */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const eq = (a, b, m) => {
  if (a === b) { console.log('  ✅ ' + m); passed++; }
  else { console.log(`  ❌ ${m} (atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)})`); failed++; process.exitCode = 1; }
};
const ok = (c, m) => eq(!!c, true, m);

// ── Logica pura (replica 1:1 di getCurrentSymbols inline in app.jsx) ──────────
const symbolsForLevel = (level, allSymbols, numbers, words) => {
  if (level === 'numbers') return numbers;
  if (level === 'words') return words;
  const m = /^lvl(\d+)$/.exec(level || '');
  return m ? allSymbols.slice(0, parseInt(m[1], 10)) : allSymbols;
};

console.log('— symbolsForLevel: primi N del set, in ordine —');
const fake = Array.from({ length: 9 }, (_, i) => ({ id: 's' + i }));
for (const [lvl, n] of [['lvl3', 3], ['lvl5', 5], ['lvl7', 7], ['lvl9', 9]]) {
  const r = symbolsForLevel(lvl, fake, [], []);
  eq(r.length, n, `${lvl} -> ${n} card`);
  eq(r[0].id, 's0', `${lvl} parte dal primo simbolo`);
}
eq(symbolsForLevel('numbers', fake, [{ id: 'n1' }], []).length, 1, 'numbers usa l\'array numeri');
eq(symbolsForLevel('words', fake, [], [{ id: 'A' }]).length, 1, 'words usa l\'array lettere');
eq(symbolsForLevel('shapes', fake, [], []).length, 9, 'legacy shapes -> set intero (9)');
eq(symbolsForLevel(null, fake, [], []).length, 9, 'null -> set intero (no crash)');

console.log('— src/app.jsx: set di 9 simboli (con i nuovi) + infinito schiarito —');
const src = fs.readFileSync(path.join(__dirname, 'src', 'app.jsx'), 'utf8');
const symBlock = (src.match(/const telepathySymbols = \[([\s\S]*?)\n\s*\];/) || [])[1] || '';
for (const id of ['star', 'sun', 'moon', 'heart', 'eye', 'infinity', 'water', 'fire', 'crystalball']) {
  ok(new RegExp(`id:\\s*'${id}'`).test(symBlock), `simbolo presente nel set: ${id}`);
}
eq((symBlock.match(/id:\s*'/g) || []).length, 9, 'telepathySymbols ha esattamente 9 elementi');

console.log('— simboli-testo (numeri/lettere/∞) schiariti via CSS .symbol-btn —');
const html = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');
const btnRule = (html.match(/\.symbol-btn\s*\{([\s\S]*?)\}/) || [])[1] || '';
ok(/color:\s*#e9d5ff/i.test(btnRule), '.symbol-btn ha color #e9d5ff (numeri/lettere/∞ leggibili)');

console.log('— src/app.jsx: getCurrentSymbols gestisce la scala lvlN —');
ok(/lvl\(\\d\+\)|lvl\(\\\\d\+\)|\^lvl/.test(src) || /slice\(0,/.test(src), 'getCurrentSymbols usa slice(0, N) per i livelli scala');

console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
