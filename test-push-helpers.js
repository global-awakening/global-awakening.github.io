/**
 * Test delle funzioni pure delle notifiche push.
 *
 * Dentro un service worker non si testa niente, e questa è la parte che decide cosa legge la
 * persona sul telefono: vive fuori, in push-helpers.js, proprio per poter essere provata.
 *
 * Esecuzione: node test-push-helpers.js
 */
const { costruisciNotifica } = require('./push-helpers.js');

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const uguale = (n, a, b) => (a === b ? ok(n) : ko(n, `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`));

// --- Promemoria -------------------------------------------------------------
const p = costruisciNotifica({ tipo: 'reminder', rituale: 'Luna piena', ritualeId: 42, locale: 'it' });
uguale('promemoria it: titolo', p.titolo, 'Luna piena sta per iniziare');
uguale('promemoria: destinazione', p.url, 'app.html?ritual=42');

// Nessun numero di minuti: chi si iscrive cinque minuti prima dell'inizio è ancora dentro la
// soglia del promemoria, e «inizia tra 15 minuti» sarebbe semplicemente falso.
/\d+\s*minut/i.test(p.titolo + p.corpo)
  ? ko('promemoria senza numero di minuti', p.titolo + ' / ' + p.corpo)
  : ok('promemoria senza numero di minuti');

// --- Avvio ------------------------------------------------------------------
const a = costruisciNotifica({ tipo: 'start', rituale: 'Luna piena', ritualeId: 42, locale: 'it' });
uguale('avvio it: titolo', a.titolo, 'Luna piena sta iniziando ora');

const e = costruisciNotifica({ tipo: 'start', rituale: 'Full moon', ritualeId: 7, locale: 'en' });
uguale('avvio en: titolo', e.titolo, 'Full moon is starting now');

// Il centro notifiche del telefono sostituisce le notifiche con lo stesso tag: se promemoria e
// avvio condividessero il tag, l'avvio cancellerebbe il promemoria invece di affiancarlo.
p.tag !== a.tag ? ok('promemoria e avvio hanno tag diversi') : ko('promemoria e avvio hanno tag diversi', p.tag);

// --- Robustezza -------------------------------------------------------------
const x = costruisciNotifica({ tipo: 'start', rituale: 'X', ritualeId: 1, locale: 'de' });
uguale('lingua sconosciuta ripiega su en', x.titolo, 'X is starting now');

const h = costruisciNotifica({ tipo: 'start', rituale: '<img src=x onerror=alert(1)>', ritualeId: 1, locale: 'it' });
h.titolo.includes('<img src=x onerror=alert(1)>')
  ? ok('il nome del rituale resta testo, non viene interpretato')
  : ko('il nome del rituale resta testo', h.titolo);

// Un payload vuoto o rotto non deve far esplodere il service worker: `userVisibleOnly` ci
// obbliga a mostrare SEMPRE una notifica, e se non ne mostriamo il browser ne mostra una
// generica di sistema — e a forza di quelle ci toglie il permesso.
let vuoto;
try { vuoto = costruisciNotifica({}); ok('payload vuoto non solleva eccezioni'); }
catch (err) { ko('payload vuoto non solleva eccezioni', err.message); }
if (vuoto && typeof vuoto.titolo === 'string' && vuoto.titolo.length > 0) ok('payload vuoto produce comunque un titolo');
else ko('payload vuoto produce comunque un titolo', JSON.stringify(vuoto));

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
