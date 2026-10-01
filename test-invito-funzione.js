/**
 * Sonda sulla Edge Function notify-telepathy-invite PUBBLICATA. Non manda push: ogni chiamata
 * qui non trova niente da fare, ed è proprio questo che si controlla (sempre 200, mai 4xx: con
 * un 4xx chiunque la chiami a caso farebbe scattare l'email della sentinella).
 *
 *   NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-funzione.js
 *       → prima della 32a: solo corpi che non toccano il database
 *   NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-funzione.js --dopo-32a
 *       → anche un invito inesistente e il giro delle scadenze
 */
const URL_F = 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-telepathy-invite';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const { randomUUID } = require('crypto');

let passati = 0, falliti = 0;
const check = (c, m, x) => { if (c) { console.log('  ✅ ' + m); passati++; } else { console.log('  ❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); falliti++; process.exitCode = 1; } };

async function chiama(corpo) {
  const r = await fetch(URL_F, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON, apikey: ANON },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { stato: r.status, j };
}

(async () => {
  let r = await chiama({});
  check(r.stato === 200 && r.j && r.j.ignorato === true, 'corpo vuoto: 200 ignorato', r);
  r = await chiama('non è json');
  check(r.stato === 200 && r.j && r.j.ignorato === true, 'corpo storto: 200 ignorato', r);
  r = await chiama({ tipo: 'invito', invito: 'x' });
  check(r.stato === 200 && r.j && r.j.ignorato === true, 'id storto: 200 ignorato', r);
  if (process.argv.includes('--dopo-32a')) {
    r = await chiama({ tipo: 'invito', invito: randomUUID() });
    check(r.stato === 200 && r.j && r.j.ignorato === true, 'invito inesistente: 200 ignorato', r);
    r = await chiama({ tipo: 'scadenze' });
    check(r.stato === 200 && r.j && typeof r.j.inviate === 'number', 'giro scadenze: 200 con i conti', r);
  }
  console.log(`\n${passati} passati, ${falliti} falliti`);
})();
