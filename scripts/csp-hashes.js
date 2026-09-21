#!/usr/bin/env node
/**
 * csp-hashes.js — tiene allineati gli hash sha256 degli script inline con la CSP di app.html.
 *
 * Perché esiste: la CSP di app.html elenca un 'sha256-...' per ogni <script> inline. Se si
 * modifica anche un solo carattere dentro uno di quegli script senza aggiornare l'hash, il
 * browser rifiuta di eseguirlo e la pagina resta BIANCA in produzione. In locale spesso non
 * si vede, perché la CSP servita da un server statico può non mordere allo stesso modo.
 *
 * Fino a oggi gli hash erano calcolati a mano. Con le notifiche push bisogna aggiungere una
 * costante dentro uno di quegli script, quindi lo strumento nasce qui.
 *
 * Uso:
 *   node scripts/csp-hashes.js --check   # esce 1 se un hash non corrisponde
 *   node scripts/csp-hashes.js --fix     # riscrive la <meta> con gli hash giusti
 */
const fs = require('fs');
const crypto = require('crypto');

const FILE = 'app.html';

/**
 * Gli hash attesi, uno per ogni <script> inline (cioè senza attributo src).
 * Il browser calcola l'hash sul contenuto grezzo fra i tag, byte per byte.
 *
 * I terminatori di riga si normalizzano a LF, e non è un dettaglio: su Windows il file in
 * copia di lavoro ha CRLF, ma git lo conserva con LF ed è la versione con LF che GitHub Pages
 * serve al browser. Calcolando sull'originale CRLF questo strumento dichiarava «disallineata»
 * una CSP perfettamente corretta in produzione — e, peggio, un `--fix` avrebbe scritto hash
 * validi solo sulla macchina di chi l'ha lanciato, rompendo la pagina per tutti gli altri.
 * È la stessa classe di problema del `\r` che ha tenuto rotto il cron per cinque mesi.
 */
function hashesInline(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const servito = m[1].replace(/\r\n/g, '\n');
    out.push('sha256-' + crypto.createHash('sha256').update(servito, 'utf8').digest('base64'));
  }
  return out;
}

function main() {
  const modo = process.argv[2];
  if (modo !== '--check' && modo !== '--fix') {
    console.error('Uso: node scripts/csp-hashes.js --check | --fix');
    process.exit(2);
  }

  const html = fs.readFileSync(FILE, 'utf8');
  const attesi = hashesInline(html);

  const metaRe = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
  const meta = html.match(metaRe);
  if (!meta) {
    console.error(`CSP non trovata in ${FILE}`);
    process.exit(2);
  }

  const presenti = (meta[2].match(/'sha256-[A-Za-z0-9+/=]+'/g) || []).map((s) => s.slice(1, -1));
  const mancanti = attesi.filter((h) => !presenti.includes(h));
  const avanzati = presenti.filter((h) => !attesi.includes(h));

  if (modo === '--check') {
    if (mancanti.length === 0 && avanzati.length === 0) {
      console.log(`✅ CSP allineata: ${attesi.length} script inline, ${attesi.length} hash.`);
      return;
    }
    console.error('❌ CSP disallineata.');
    mancanti.forEach((h) => console.error(`   manca nella CSP: ${h}`));
    avanzati.forEach((h) => console.error(`   nella CSP ma nessuno script corrisponde: ${h}`));
    console.error('   Rimedio: node scripts/csp-hashes.js --fix');
    process.exit(1);
  }

  // --fix: toglie tutti i vecchi hash e rimette quelli giusti dentro script-src,
  // lasciando intatto il resto della direttiva (connect-src, img-src, ...).
  let nuovaCsp = meta[2].replace(/\s*'sha256-[A-Za-z0-9+/=]+'/g, '');
  nuovaCsp = nuovaCsp.replace(/(script-src[^;]*)/, (s) => s + ' ' + attesi.map((h) => `'${h}'`).join(' '));
  fs.writeFileSync(FILE, html.replace(metaRe, `$1${nuovaCsp}$3`), 'utf8');
  console.log(`✅ CSP aggiornata con ${attesi.length} hash.`);
}

main();
