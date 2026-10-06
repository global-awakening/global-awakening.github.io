// Parità delle traduzioni: ogni lingua ha le stesse foglie di «en», con lo stesso tipo,
// stesse lunghezze degli array, funzioni che rispondono con una stringa non vuota.
const { leggiTraduzioni } = require('./scripts/leggi-traduzioni');
let T;
try { T = leggiTraduzioni(); } catch (e) { console.log('❌ ' + e.message); process.exit(1); }
let passed = 0, failed = 0;
const check = (c, msg, d) => { if (c) passed++; else { failed++; console.log('  ❌ ' + msg, d === undefined ? '' : JSON.stringify(d)); } };

// Argomenti tipici per le funzioni, per nome di chiave, con le firme vere di src/app.jsx:
// dayOf(n, m) è «giorno n di m»; descCounter(n) riceve solo i caratteri rimasti.
const ARGOMENTI = { dayOf: [3, 7], peopleHere: [2], descCounter: [488], whenAt: ['lun 6 ott', '21:00'],
  levelShapesN: [5], partnerOfflineN: ['Ale'], waiting: [3] };
function foglie(o, pre, out) {
  for (const k of Object.keys(o)) {
    const v = o[k]; const p = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) foglie(v, p, out); else out[p] = v;
  }
  return out;
}
const en = foglie(T.en, '', {});
for (const l of ['it', 'es', 'fr']) {
  check(!!T[l], `${l}: blocco presente`);
  if (!T[l]) continue;
  const f = foglie(T[l], '', {});
  for (const k of Object.keys(en)) {
    const a = en[k], b = f[k];
    check(k in f, `${l}: manca ${k}`);
    if (!(k in f)) continue;
    check(typeof a === typeof b && Array.isArray(a) === Array.isArray(b), `${l}: tipo diverso per ${k}`, [typeof a, typeof b]);
    if (typeof b === 'string') check(b.trim().length > 0, `${l}: stringa vuota ${k}`);
    if (Array.isArray(a) && Array.isArray(b)) check(a.length === b.length, `${l}: lunghezza diversa per ${k}`, [a.length, b.length]);
    if (typeof b === 'function') {
      const nome = k.split('.').pop();
      // Stessi parametri dichiarati di «en»: chi chiama la funzione passa gli stessi argomenti.
      check(typeof a === 'function' && b.length === a.length, `${l}: ${k}() ha un numero di parametri diverso`, [a.length, b.length]);
      const r = b(...(ARGOMENTI[nome] || [1]));
      // «undefined»/«NaN» nel testo = argomento atteso ma non usato bene (es. dayOf senza il totale).
      check(typeof r === 'string' && r.trim().length > 0 && !/undefined|NaN/.test(r), `${l}: ${k}() non restituisce testo pulito`, r);
    }
  }
  for (const k of Object.keys(f)) check(k in en, `${l}: chiave in più ${k}`);
}
console.log(`\n${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
