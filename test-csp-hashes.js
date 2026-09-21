/**
 * Test dello strumento che tiene allineati gli hash CSP di app.html.
 *
 * Perche' esiste: la CSP di app.html elenca un 'sha256-...' per ogni <script> inline. Se si
 * modifica anche un solo carattere dentro uno di quegli script senza aggiornare l'hash, il
 * browser rifiuta di eseguirlo e la pagina resta BIANCA in produzione.
 *
 * Esecuzione: node test-csp-hashes.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

function run(args) {
  return execFileSync('node', ['scripts/csp-hashes.js', ...args], { encoding: 'utf8' });
}

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };

const originale = fs.readFileSync('app.html', 'utf8');

try {
  // 1. su app.html integro, --check passa
  try { run(['--check']); ok('--check passa su app.html integro'); }
  catch (e) { ko('--check passa su app.html integro', (e.stdout || '') + (e.stderr || '')); }

  // 2. sporcando uno script inline, --check deve fallire
  fs.writeFileSync('app.html', originale.replace('const SUPABASE_URL', 'const SUPABASE_URL_X'), 'utf8');
  let haFallito = false;
  try { run(['--check']); } catch { haFallito = true; }
  haFallito ? ok('--check vede uno script inline modificato')
            : ko('--check vede uno script inline modificato', 'non ha segnalato nulla');

  // 3. --fix rimette a posto gli hash, e dopo --check passa
  try { run(['--fix']); run(['--check']); ok('--fix aggiorna la CSP'); }
  catch (e) { ko('--fix aggiorna la CSP', (e.stdout || '') + (e.stderr || '')); }
} finally {
  fs.writeFileSync('app.html', originale, 'utf8');
}

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
