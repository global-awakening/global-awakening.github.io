/**
 * send-account-email — Global Awakening
 *
 * 1. Logica pura (email.mjs): validazione e parametri del template. Il link punta SEMPRE alla
 *    base fissa, qualunque cosa mandi il chiamante: un appUrl libero farebbe della funzione una
 *    macchina da phishing con token veri.
 * 2. Smoke sulla funzione pubblicata, solo con un'email NON registrata: risponde ok e non
 *    spedisce niente (la quota EmailJS è piccola; l'arrivo vero si prova dal vivo).
 *
 * Esecuzione: node test-account-email.js            (solo 1)
 *             node test-account-email.js --live     (1 + 2, dopo il deploy)
 */
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, 'supabase/functions/send-account-email/email.mjs')).href);
  const { validaRichiesta, parametriEmail } = mod;

  console.log('\n— validaRichiesta —');
  check(validaRichiesta({ tipo: 'reset', email: ' A@B.it ' }).email === 'a@b.it', 'email normalizzata');
  check(validaRichiesta({ tipo: 'boh', email: 'a@b.it' }).ok === false, 'tipo sconosciuto rifiutato');
  check(validaRichiesta({ tipo: 'magic', email: 'non-email' }).ok === false, 'email malformata rifiutata');
  check(validaRichiesta({ tipo: 'magic', email: 'x'.repeat(250) + '@b.it' }).ok === false, 'email oltre 254 caratteri rifiutata');
  check(validaRichiesta(null).ok === false, 'body nullo rifiutato');
  const conAppUrl = validaRichiesta({ tipo: 'magic', email: 'a@b.it', appUrl: 'https://evil.example' });
  check(conAppUrl.ok === true && !('appUrl' in conAppUrl), 'appUrl del chiamante ignorato');

  console.log('\n— parametriEmail —');
  const r = parametriEmail('reset', 'a@b.it', 'TOK');
  check(r.template_id === 'template_i5i06pl' && r.template_params.reset_url === 'https://global-awakening.github.io/app.html?reset=TOK', 'reset: template e URL fisso', r);
  const m = parametriEmail('magic', 'a@b.it', 'TOK');
  check(m.template_id === 'template_gy8gdkg' && m.template_params.magic_url === 'https://global-awakening.github.io/app.html?magic=TOK', 'magic: template e URL fisso', m);
  check(m.template_params.to_email === 'a@b.it' && m.template_params.footer === 'This link expires in 15 minutes.', 'magic: stessi testi di oggi');
  check(parametriEmail('magic', 'a@b.it', 'a b&c').template_params.magic_url.endsWith('?magic=a%20b%26c'), 'token codificato nell\'URL');

  if (process.argv.includes('--live')) {
    console.log('\n— funzione pubblicata —');
    const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
    const url = 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/send-account-email';
    const h = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Origin: 'http://localhost:4321' };
    const a = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'magic', email: `nessuno-${Date.now()}@test.com` }) });
    check(a.status === 200 && (await a.json()).ok === true, 'email non registrata → 200 {ok:true}', a.status);
    check(a.headers.get('access-control-allow-origin') === 'http://localhost:4321', 'CORS per localhost:4321');
    const b = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'boh', email: 'a@b.it' }) });
    check(b.status === 400, 'tipo non valido → 400', b.status);
    const o = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://global-awakening.github.io', 'Access-Control-Request-Method': 'POST' } });
    check(o.status === 200 && o.headers.get('access-control-allow-origin') === 'https://global-awakening.github.io', 'preflight dal sito vero', o.status);
  }
  console.log(`\n${passed} passati, ${failed} falliti`);
})();
