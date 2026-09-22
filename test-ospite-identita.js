/**
 * L'identità di un ospite deve sopravvivere alla chiusura dell'app.
 * node test-ospite-identita.js (server su :4321)
 *
 * Scoperto il 22/09/2026 scrivendo il test della cancellazione: `handleEnterGuest` salvava
 * nickname e stato ospite, ma NON l'identificativo di sessione. A ogni riapertura ne veniva
 * generato uno nuovo, e per l'app l'ospite diventava un'altra persona: fuori dai rituali a cui
 * aveva aderito, non più creatore dei propri, con la candela accesa da uno sconosciuto e i
 * punteggi di telepatia azzerati.
 *
 * Non è un dettaglio da poco al lancio: alla prima ondata quasi tutti entreranno come ospiti.
 *
 * Il test guarda la conseguenza, non l'implementazione: un ospite che aderisce a un rituale,
 * chiude e riapre, deve risultare ancora dentro.
 */
const { chromium } = require('playwright');
const { loginAsGuest, purge } = require('./test-helpers');

const BASE = 'http://localhost:4321';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const NICK = `OspIde_${TS}`.slice(0, 20);
const AUTORE = `OspIdeAutore_${TS}`;
const RITUALE = `OspIde_rituale_${TS}`;

let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };

const rpc = (fn, params) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
             'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(params)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const quando = new Date(Date.now() + 120 * 60000);
  const creato = await rpc('create_ritual', {
    p_creator: AUTORE, p_creator_id: `ospide-autore-${TS}`, p_name: RITUALE,
    p_description: 'prova identità ospite', p_type: 'consciousness', p_sacred_number: 11,
    p_date: quando.toISOString().slice(0, 10), p_time: quando.toISOString().slice(11, 16),
    p_duration: 30, p_password_hash: ''
  });
  if (creato.status < 200 || creato.status >= 300) {
    console.error('non sono riuscita a creare il rituale di prova:', creato.status, creato.body);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await loginAsGuest(page, NICK, { appUrl: `${BASE}/app.html` });
  const primo = await page.evaluate(() => localStorage.getItem('ga_session_id'));
  if (primo) pass('entrando come ospite l\'identificativo viene salvato');
  else fail('entrando come ospite l\'identificativo NON viene salvato');

  const scheda = page.locator('.ritual-card').filter({ hasText: RITUALE });
  await scheda.first().waitFor({ state: 'visible', timeout: 30000 });
  await scheda.locator('[data-test="join-ritual"]').click();
  await page.waitForTimeout(1500);

  let dentroPrima = false;
  for (let i = 0; i < 25 && !dentroPrima; i++) {
    await page.waitForTimeout(1000);
    dentroPrima = await page.locator('.ritual-card').filter({ hasText: RITUALE })
      .locator('[data-test="join-ritual"]').isDisabled().catch(() => false);
  }
  if (dentroPrima) pass('dopo aver aderito il rituale risulta già unito');
  else fail('l\'adesione non è stata registrata: il resto del test non varrebbe');

  // Chiudere e riaprire l'app: e' quello che fa chiunque.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.ritual-card').filter({ hasText: RITUALE }).first()
    .waitFor({ state: 'visible', timeout: 30000 });

  const secondo = await page.evaluate(() => localStorage.getItem('ga_session_id'));
  if (secondo && secondo === primo) pass('riaprendo, l\'ospite ha lo stesso identificativo');
  else fail(`riaprendo, l'identificativo è cambiato (${primo} → ${secondo}): per l'app è un'altra persona`);

  const dentroDopo = await page.locator('.ritual-card').filter({ hasText: RITUALE })
    .locator('[data-test="join-ritual"]').isDisabled().catch(() => false);
  if (dentroDopo) pass('riaprendo, l\'ospite risulta ancora dentro il rituale');
  else fail('riaprendo, l\'ospite non risulta più dentro il rituale a cui aveva aderito');

  await browser.close();

  console.log('\n— Pulizia —');
  await purge(SUPABASE_URL, [
    `rituals?creator=eq.${encodeURIComponent(AUTORE)}`,
    `profiles?nickname=eq.${encodeURIComponent(NICK)}`,
  ], { label: 'ospite-identita' });

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
