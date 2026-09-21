/**
 * Smoke PWA — Global Awakening. node test-pwa.js (server su :4321)
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:4321';
let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };

(async () => {
  // 1. manifest + icone via HTTP
  const mres = await fetch(`${BASE}/manifest.webmanifest`);
  if (mres.ok) { pass('manifest raggiungibile'); } else { fail(`manifest HTTP ${mres.status}`); }
  let manifest = {};
  try { manifest = await mres.json(); pass('manifest è JSON valido'); } catch { fail('manifest non è JSON'); }
  if (manifest.name && manifest.start_url && Array.isArray(manifest.icons) && manifest.icons.length >= 2) pass('manifest ha name/start_url/icons');
  else fail(`manifest incompleto: ${JSON.stringify(manifest)}`);
  for (const ic of (manifest.icons || [])) {
    const r = await fetch(`${BASE}/${ic.src}`);
    if (r.ok) pass(`icona ${ic.src} 200`); else fail(`icona ${ic.src} HTTP ${r.status}`);
  }
  const swr = await fetch(`${BASE}/sw.js`);
  if (swr.ok) pass('sw.js raggiungibile'); else fail(`sw.js HTTP ${swr.status}`);

  // 2. pagina: no pageerror, link manifest, SW registrato
  const browser = await chromium.launch();

  // Contesto iPhone riusabile. Lo stub su 'beforeinstallprompt' serve perché Safari non
  // emette MAI quell'evento mentre Chromium sì: senza, handleInstall prende l'altro ramo
  // e i test iOS non verificherebbero il percorso vero di un iPhone.
  const openIphone = async (uaSuffix = '') => {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
                 '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' + uaSuffix,
      viewport: { width: 390, height: 844 },
    });
    const iphonePage = await ctx.newPage();
    await iphonePage.addInitScript(() => {
      const orig = window.addEventListener.bind(window);
      window.addEventListener = (type, ...rest) => {
        if (type === 'beforeinstallprompt') return undefined;
        return orig(type, ...rest);
      };
    });
    await iphonePage.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // contesto vergine ⇒ nessun ga_nickname in localStorage ⇒ schermata di ingresso
    await iphonePage.locator('input[type="password"]').first()
      .waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    return { ctx, page: iphonePage };
  };
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(':text("Register"), input', { timeout: 20000 }).catch(() => {});
  const hasManifest = await page.locator('link[rel="manifest"]').count();
  if (hasManifest > 0) pass('<link rel=manifest> presente'); else fail('manca <link rel=manifest>');
  // attende la registrazione del SW (avviene su window load)
  const reg = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    try { const r = await navigator.serviceWorker.ready; return !!r; } catch { return false; }
  }).catch(() => false);
  if (reg) pass('service worker registrato e attivo'); else fail('service worker NON registrato');
  if (errors.length === 0) pass('nessun pageerror'); else fail('pageerror: ' + errors.join(' | '));

  // 3. iOS — il popup "Aggiungi a Home" deve aprirsi ANCHE dalla schermata di ingresso.
  //    È l'unica schermata che un visitatore nuovo vede, e su iPhone non esiste un prompt
  //    automatico: se lì il bottone non fa nulla, l'app in pratica non è installabile.
  const { ctx: iphone, page: ip } = await openIphone();
  if (await ip.locator('input[type="password"]').first().isVisible().catch(() => false))
    pass('iOS: parto dalla schermata di ingresso (visitatore nuovo)');
  else fail('iOS: non sono sulla schermata di ingresso, il test non sarebbe valido');

  const installBtn = ip.locator('.app-footer button', { hasText: '📲' }).first();
  if (await installBtn.isVisible().catch(() => false)) pass('iOS: link "Installa app" nel footer visibile');
  else fail('iOS: link "Installa app" nel footer NON visibile su iPhone');

  await installBtn.click().catch(() => {});
  const popupVisible = await ip.locator('text=/Add to Home Screen|schermata Home/i').first()
    .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (popupVisible) pass('iOS: il link nel footer apre il popup con le istruzioni "Aggiungi a Home"');
  else fail('iOS: il link nel footer non apre nessun popup');
  await iphone.close();

  // 4. iOS — l'invito a installare deve essere visibile senza andarlo a cercare nel footer.
  //    Su iPhone la PWA è l'unico canale di distribuzione: se l'invito non si vede, non si installa.
  const { ctx: iphone2, page: ip2 } = await openIphone();
  const banner = ip2.locator('.install-banner');
  if (await banner.isVisible().catch(() => false)) pass('iOS: banner di installazione visibile dalla schermata di ingresso');
  else fail('iOS: nessun banner di installazione — l\'invito resta nascosto nel footer');

  await banner.locator('button', { hasText: /Install/i }).first().click().catch(() => {});
  const bannerPopup = await ip2.locator('text=/Add to Home Screen|schermata Home/i').first()
    .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (bannerPopup) pass('iOS: il bottone del banner apre il popup con le istruzioni');
  else fail('iOS: il bottone del banner non apre il popup');

  // chiudo prima il popup (copre il banner), poi chiudo il banner con la ✕
  await ip2.locator('.modal-content button').last().click().catch(() => {});
  // senza questo, i due controlli qui sotto passerebbero anche con il banner inesistente
  const closeBtn = banner.locator('button[aria-label]').first();
  const hadCloseBtn = await closeBtn.isVisible().catch(() => false);
  await closeBtn.click().catch(() => {});
  const bannerGone = hadCloseBtn &&
    await banner.waitFor({ state: 'hidden', timeout: 3000 }).then(() => true).catch(() => false);
  if (bannerGone) pass('iOS: la ✕ chiude il banner');
  else fail('iOS: la ✕ non chiude il banner');

  await ip2.reload({ waitUntil: 'domcontentloaded' });
  await ip2.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  if (hadCloseBtn && !(await banner.isVisible().catch(() => false))) pass('iOS: il banner chiuso non ricompare dopo un reload');
  else fail('iOS: il banner ricompare dopo il reload — la chiusura non viene ricordata');
  await iphone2.close();

  // 5. iPhone dentro il browser interno di un social: lì "Aggiungi alla schermata Home"
  //    non esiste proprio, quindi quelle istruzioni sono ineseguibili. L'unica cosa utile
  //    da dire è di riaprire il link in Safari.
  const { ctx: iphone3, page: ip3 } = await openIphone(' Instagram 312.0.0.32.111');
  const bannerBtn = ip3.locator('.install-banner button', { hasText: /Install/i }).first();
  if (await bannerBtn.isVisible().catch(() => false)) pass('iOS in-app: il banner compare anche nel browser di un social');
  else fail('iOS in-app: il banner non compare nel browser di un social');
  await bannerBtn.click().catch(() => {});
  const diceSafari = await ip3.locator('text=/Open in Safari|Apri in Safari/i').first()
    .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (diceSafari) pass('iOS in-app: le istruzioni dicono di riaprire il link in Safari');
  else fail('iOS in-app: non dice di aprire in Safari');
  const diceHome = await ip3.locator('text=/Add to Home Screen|schermata Home/i').first()
    .isVisible().catch(() => false);
  if (!diceHome) pass('iOS in-app: non mostra istruzioni ineseguibili da lì');
  else fail('iOS in-app: mostra ancora "Aggiungi alla schermata Home", che lì non esiste');
  await iphone3.close();
  await browser.close();

  // 5. Notifiche push: il service worker deve dichiarare i tre handler.
  //    Si controlla il sorgente e non il comportamento perché un push vero non si può
  //    innescare da Playwright: senza un servizio push reale non arriva nessun evento.
  //    Questo non prova che le notifiche funzionino — prova che il codice per riceverle
  //    non sia sparito, che è l'unica cosa che un test statico può onestamente garantire.
  const fs = require('fs');
  const swTesto = fs.readFileSync('sw.js', 'utf8');

  for (const evento of ['push', 'notificationclick', 'pushsubscriptionchange']) {
    if (swTesto.includes(`addEventListener('${evento}'`)) pass(`sw.js gestisce l'evento ${evento}`);
    else fail(`sw.js non gestisce l'evento ${evento}`);
  }

  if (swTesto.includes("importScripts('push-helpers.js')")) pass('sw.js carica push-helpers.js');
  else fail('sw.js non carica push-helpers.js');

  // Se push-helpers.js non è nel precache, offline il service worker non parte affatto:
  // importScripts fallisce e con lui tutto il resto, cache compresa.
  const bloccoPrecache = swTesto.match(/PRECACHE\s*=\s*\[[\s\S]*?\]/);
  if (bloccoPrecache && bloccoPrecache[0].includes('push-helpers.js')) pass('push-helpers.js è nel precache');
  else fail('push-helpers.js manca dal PRECACHE: offline il service worker non partirebbe');

  const rPh = await fetch(`${BASE}/push-helpers.js`);
  if (rPh.ok) pass('push-helpers.js raggiungibile via HTTP'); else fail(`push-helpers.js HTTP ${rPh.status}`);

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
