// build.js — precompila il JSX dell'app e (Milestone 2) aggiorna la CSP.
// Eseguire: node build.js
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

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

buildAppJs();
console.log('Build completata.');
