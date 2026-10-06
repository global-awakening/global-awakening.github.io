// Estrae l'oggetto `translations` da src/app.jsx (tra i marcatori TRADUZIONI) e lo restituisce
// già valutato. Serve ai test (parità delle lingue, prova dal browser) senza passare dal build.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function leggiTraduzioni(file = path.join(__dirname, '..', 'src', 'app.jsx')) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/\/\/ ==== TRADUZIONI: INIZIO ====\n([\s\S]*?)\n\s*\/\/ ==== TRADUZIONI: FINE ====/);
  if (!m) throw new Error('marcatori TRADUZIONI non trovati');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(m[1].replace(/const translations\s*=/, 'translations ='), ctx);
  return ctx.translations;
}

module.exports = { leggiTraduzioni };
