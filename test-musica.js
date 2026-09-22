/**
 * Musica dei rituali — Global Awakening. node test-musica.js (server su :4321)
 *
 * Il brano parte solo quando una sessione è davvero in corso. Questi test coprono
 * quello che è deterministico senza toccare il database: presenza e configurazione
 * dell'elemento audio, silenzio quando non c'è nulla in corso, credito all'autore,
 * e soprattutto che il file NON finisca nella cache offline (pesa 18 MB).
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:4321';
const FILE = 'assets/meditation-music-rockot.mp3';
let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };

(async () => {
  // 1. il file è servito
  const r = await fetch(`${BASE}/${FILE}`, { method: 'HEAD' });
  if (r.ok) pass('il brano è raggiungibile via HTTP');
  else fail(`il brano risponde HTTP ${r.status}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 20000 });

  // 2. schermata di ingresso: nessun audio. Chi non è ancora entrato non deve scaricare 18 MB.
  if (await page.locator('audio').count() === 0) pass('sulla schermata di ingresso non c\'è nessun elemento audio');
  else fail('la schermata di ingresso carica già l\'audio');

  // entro come ospite
  await page.locator('button', { hasText: /^Guest$|^Ospite$/ }).first().click();
  await page.locator('input[placeholder*="username"], input[placeholder*="Choose"]').first().fill('TestMusica' + (Date.now() % 100000));
  await page.locator('button', { hasText: /Enter as Guest|Entra come Ospite/ }).first().click();
  await page.locator('audio, .main-nav-bottom, .app-shell').first().waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 3. dentro l'app l'elemento c'è, ma configurato per non scaricare nulla finché non serve
  const audio = page.locator('audio').first();
  if (await audio.count() > 0) pass('dentro l\'app l\'elemento audio esiste');
  else fail('dentro l\'app manca l\'elemento audio');
  const preload = await audio.getAttribute('preload').catch(() => null);
  if (preload === 'none') pass('preload="none": il brano non si scarica da solo');
  else fail(`preload è ${JSON.stringify(preload)}, dovrebbe essere "none"`);
  const src = await audio.getAttribute('src').catch(() => null);
  if (src && src.indexOf('meditation-music-rockot') !== -1) pass('l\'elemento audio punta al brano giusto');
  else fail(`src inatteso: ${JSON.stringify(src)}`);
  const loop = await audio.getAttribute('loop').catch(() => null);
  if (loop !== null) pass('il brano è in loop');
  else fail('il brano non è in loop');

  // 3-bis. MusicHelpers deve essere caricato dalla pagina. Se lo <script> sparisse, l'app
  // tornerebbe muta sui telefoni senza che nessun test se ne accorga: il codice che riprova
  // dopo il rifiuto del browser gira solo dentro un rituale live, dove i test non arrivano.
  const helpersCaricati = await page.evaluate(() => !!(window.MusicHelpers
    && typeof window.MusicHelpers.avviaMusica === 'function'
    && typeof window.MusicHelpers.fermaMusica === 'function'));
  if (helpersCaricati) pass('MusicHelpers è caricato nella pagina');
  else fail('MusicHelpers non è caricato: la musica non ripartirebbe dopo un rifiuto del browser');

  // 4. nessuna sessione in corso ⇒ silenzio
  const inPausa = await audio.evaluate((el) => el.paused).catch(() => null);
  if (inPausa === true) pass('senza rituali né sessioni in corso la musica sta zitta');
  else fail('la musica parte anche senza nessuna sessione in corso');

  // 5. il credito all'autore, che la licenza Pixabay chiede di riconoscere
  const creditoRockot = await page.locator('a[href*="rockot"]').first().isVisible().catch(() => false);
  if (creditoRockot) pass('il credito a Rockot è nel footer');
  else fail('manca il credito a Rockot');
  const creditoPixabay = await page.locator('.app-footer a[href*="pixabay.com"]').count();
  if (creditoPixabay >= 1) pass('il footer rimanda a Pixabay');
  else fail('il footer non rimanda a Pixabay');

  // 6. il brano NON deve finire nella cache offline: sono 18 MB sul telefono di chi installa
  // Senza un service worker IN CONTROLLO della pagina questo controllo passerebbe a vuoto:
  // nessuno intercetterebbe la richiesta, e "non è in cache" sarebbe vero per il motivo sbagliato.
  const inCache = await page.evaluate(async (f) => {
    try {
      if (!('serviceWorker' in navigator)) return 'NO_SW_SUPPORT';
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) return 'SW_NON_IN_CONTROLLO';
      await fetch(f);
      await new Promise((r) => setTimeout(r, 1500));
      const m = await caches.match(f);
      return !!m;
    } catch (e) { return 'ERR: ' + e.message; }
  }, FILE);
  if (inCache === false) pass('il brano non viene messo nella cache offline (service worker in controllo)');
  else if (inCache === true) fail('il brano finisce nella cache offline: sono 18 MB sul telefono di chi installa');
  else fail(`controllo cache non valido: ${inCache}`);

  if (errors.length === 0) pass('nessun errore in console');
  else fail('pageerror: ' + errors.join(' | '));

  await browser.close();
  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
