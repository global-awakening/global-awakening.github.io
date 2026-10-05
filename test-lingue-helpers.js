const L = require('./lingue-helpers.js');
let passed = 0, failed = 0;
const uguale = (m, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) { passed++; console.log('  ✅ ' + m); } else { failed++; console.log('  ❌ ' + m, JSON.stringify(a), '≠', JSON.stringify(b)); } };

uguale('quattro lingue', L.LINGUE, ['en', 'it', 'es', 'fr']);
// lingua iniziale
uguale('salvata valida vince sul telefono', L.linguaIniziale('fr', ['es-ES']), 'fr');
uguale('salvata spazzatura → telefono', L.linguaIniziale('xx', ['es-ES']), 'es');
uguale('salvata null → telefono', L.linguaIniziale(null, ['it-IT', 'en-US']), 'it');
uguale('prima supportata in ordine', L.linguaIniziale(null, ['de-DE', 'fr-FR']), 'fr');
uguale('maiuscole e trattino basso', L.linguaIniziale(null, ['ES_mx']), 'es');
uguale('nessuna supportata → en', L.linguaIniziale(null, ['de-DE', 'pt-BR', 'zh-Hans-CN']), 'en');
uguale('lista vuota → en', L.linguaIniziale(null, []), 'en');
uguale('undefined → en', L.linguaIniziale(undefined, undefined), 'en');
uguale('voci non stringa ignorate', L.linguaIniziale(null, [null, 42, 'fr']), 'fr');
// storage
const mem = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };
const s = mem(); L.salvaLingua(s, 'es');
uguale('salva e rilegge', L.leggiLinguaSalvata(s), 'es');
const rotto = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
uguale('storage che solleva: lettura → null', L.leggiLinguaSalvata(rotto), null);
uguale('storage che solleva: scrittura non solleva', (() => { L.salvaLingua(rotto, 'it'); return 'ok'; })(), 'ok');
uguale('storage assente', L.leggiLinguaSalvata(null), null);
uguale('non salva una lingua non supportata', (() => { const m = mem(); L.salvaLingua(m, 'de'); return L.leggiLinguaSalvata(m); })(), null);
// fusione
const base = { a: 'A', g: { x: 'X', y: 'Y' }, arr: [1, 2, 3], f: (n) => 'en' + n };
const sopra = { g: { x: 'X2' }, arr: [9], f: (n) => 'es' + n };
const r = L.fondi(base, sopra);
uguale('chiave mancante → base', r.a, 'A');
uguale('oggetto annidato fuso', r.g, { x: 'X2', y: 'Y' });
uguale('array sostituito per intero', r.arr, [9]);
uguale('funzione sostituita', r.f(1), 'es1');
uguale('base intatta', base.g, { x: 'X', y: 'Y' });
uguale('sopra assente → copia della base', L.fondi(base, undefined).g.y, 'Y');
// locale ed etichette
uguale('locale es', L.locale('es'), 'es-ES');
uguale('locale sconosciuto → en-GB', L.locale('de'), 'en-GB');
uguale('etichetta fr', L.etichetta('fr'), 'FR · Français');

console.log(`\n${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
