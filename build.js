// build.js — precompila il JSX dell'app e aggiorna la Content-Security-Policy.
// Eseguire: node build.js  (oppure npm run build)
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const crypto = require('crypto');

const ROOT = __dirname;

function buildAppJs() {
  const srcPath = path.join(ROOT, 'src', 'app.jsx');
  const src = fs.readFileSync(srcPath, 'utf8');
  const { code } = babel.transformSync(src, {
    // SOLO preset-react (runtime classic): trasforma il JSX in React.createElement,
    // riferendo i global UMD React/ReactDOM. NIENTE preset-env: i browser target
    // supportano gia' la sintassi usata e down-levellare cambierebbe comportamento.
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    filename: 'app.jsx',
    compact: false,
    comments: false,
    babelrc: false,
    configFile: false,
  });
  fs.writeFileSync(path.join(ROOT, 'app.js'), code, 'utf8');
  console.log(`  ✅ app.js generato (${code.length} byte) da src/app.jsx`);
}

function sha256b64(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('base64');
}

function buildCsp() {
  const htmlPath = path.join(ROOT, 'app.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Hash di ogni <script> INLINE (senza attributo src). La CSP richiede l'hash
  // del contenuto esatto tra i tag. Gli script con src (CDN, app.js) sono esclusi.
  const hashes = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1];
    if (body.trim() === '') continue; // ignora eventuali script vuoti
    // I browser normalizzano i newline (\r\n e \r → \n) nel contenuto inline PRIMA
    // di calcolare l'hash CSP. Su file CRLF (Windows) hashare il grezzo darebbe hash
    // sbagliati → script bloccati. Normalizziamo a LF per combaciare col browser.
    const normalized = body.replace(/\r\n?/g, '\n');
    hashes.push(`'sha256-${sha256b64(normalized)}'`);
  }

  const SUPABASE = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
  const csp = [
    "default-src 'self'",
    `script-src 'self' https://unpkg.com https://cdn.jsdelivr.net ${hashes.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${SUPABASE}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  // Sostituisce SEMPRE il content del meta CSP (idempotente: matcha qualsiasi valore).
  // Se il meta non esiste ancora, l'app.html resta invariato (replace no-op).
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/,
    `$1${csp}$2`
  );
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`  ✅ CSP aggiornata (${hashes.length} hash inline)`);
}

buildAppJs();
buildCsp();
console.log('Build completata.');
