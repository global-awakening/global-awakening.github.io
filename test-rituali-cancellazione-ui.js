/**
 * Cancellazione del rituale, lato interfaccia. node test-rituali-cancellazione-ui.js (server su :4321)
 *
 * La sicurezza vera sta nel database ed è provata da test-rituali-cancellazione.js: qui si
 * prova la promessa fatta a chi guarda lo schermo, cioè che il cestino compaia dove deve e
 * solo dove deve. Sono due cose diverse: un pulsante nascosto non protegge niente, e un
 * database blindato con un pulsante nel posto sbagliato resta un'app confusa.
 *
 * L'identificativo di sessione lo fissiamo noi prima che l'app parta, cosi' sappiamo con quale
 * creator_id creare i rituali di prova invece di doverlo indovinare dopo.
 */
const { chromium } = require('playwright');
const { loginAsGuest, purge } = require('./test-helpers');

const BASE = 'http://localhost:4321';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const MIO = `CancUI_mio_${TS}`;
const ALTRUI = `CancUI_altrui_${TS}`;
const NICK = `CancUI_${TS}`.slice(0, 20);

let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };

const rpc = (fn, params) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
             'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(params)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const creaRituale = (creator, creatorId, nome, minuti) => {
  const quando = new Date(Date.now() + minuti * 60000);
  return rpc('create_ritual', {
    p_creator: creator, p_creator_id: creatorId, p_name: nome,
    p_description: 'prova cancellazione UI', p_type: 'consciousness', p_sacred_number: 11,
    p_date: quando.toISOString().slice(0, 10), p_time: quando.toISOString().slice(11, 16),
    p_duration: 30, p_password_hash: ''
  });
};

// Il cestino dentro la scheda che porta questo nome.
const cestinoDi = (page, nome) => page
  .locator('.ritual-card')
  .filter({ hasText: nome })
  .locator('[data-test="delete-ritual"]');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erroriPagina = [];
  page.on('pageerror', (e) => erroriPagina.push(e.message));

  // L'identificativo di sessione lo fissiamo noi PRIMA che l'app parta: l'app lo legge da
  // localStorage all'avvio (src/app.jsx:996). Cosi' sappiamo con quale creator_id creare i
  // rituali di prova, senza doverlo indovinare dopo.
  const sid = `canc-ui-${TS}`;
  await page.addInitScript((v) => { try { localStorage.setItem('ga_session_id', v); } catch (_) {} }, sid);

  await loginAsGuest(page, NICK, { appUrl: `${BASE}/app.html` });
  const sidInUso = await page.evaluate(() => localStorage.getItem('ga_session_id'));
  if (sidInUso === sid) pass('ospite entrato con l\'identificativo di sessione atteso');
  else fail(`l'app usa un identificativo diverso (${sidInUso}): il resto del test non varrebbe`);

  await creaRituale(NICK, sid, MIO, 120);
  await creaRituale(`Altro_${TS}`, `altro-sid-${TS}`, ALTRUI, 120);

  // Ricarico: la lista si aggiorna da sola ogni 10s, ma aspettarli allunga il test per niente.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.ritual-card').filter({ hasText: MIO }).first()
    .waitFor({ state: 'visible', timeout: 30000 });

  if (await cestinoDi(page, MIO).count() === 1) pass('il cestino c\'è sul proprio rituale futuro');
  else fail('il cestino manca sul proprio rituale futuro');

  if (await cestinoDi(page, ALTRUI).count() === 0) pass('il cestino NON c\'è sul rituale di un altro');
  else fail('il cestino compare sul rituale di un altro');

  // Chiede conferma, e se dico di no non cancella niente: una cancellazione a un tocco solo,
  // su una cosa che altri hanno già visto, è troppo facile da fare per sbaglio.
  await cestinoDi(page, MIO).click();
  const annulla = page.locator('[data-test="delete-ritual-cancel"]');
  if (await annulla.isVisible().catch(() => false)) pass('chiede conferma prima di cancellare');
  else fail('cancella senza chiedere conferma');
  await annulla.click();
  await page.waitForTimeout(500);
  if (await page.locator('.ritual-card').filter({ hasText: MIO }).count() === 1) {
    pass('dicendo di no il rituale resta');
  } else {
    fail('ha cancellato anche dicendo di no');
  }

  await cestinoDi(page, MIO).click();
  await page.locator('[data-test="delete-ritual-confirm"]').click();
  await page.locator('.ritual-card').filter({ hasText: MIO })
    .waitFor({ state: 'detached', timeout: 15000 })
    .then(() => pass('confermando, il rituale sparisce dalla lista'))
    .catch(() => fail('dopo la conferma il rituale è ancora nella lista'));

  if (erroriPagina.length === 0) pass('nessun errore in console');
  else fail('errori in console: ' + erroriPagina.join(' | '));

  await browser.close();

  console.log('\n— Pulizia —');
  await purge(SUPABASE_URL, [
    `rituals?creator=eq.${encodeURIComponent(NICK)}`,
    `rituals?creator=eq.${encodeURIComponent('Altro_' + TS)}`,
    `profiles?nickname=eq.${encodeURIComponent(NICK)}`,
  ], { label: 'rituali-cancellazione-ui' });

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
