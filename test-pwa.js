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
  const iphone = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
               '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  });
  const ip = await iphone.newPage();
  // Safari non emette MAI 'beforeinstallprompt'. Chromium sì, e in quel caso handleInstall
  // prende l'altro ramo: senza questo stub il test non verificherebbe il percorso iPhone.
  await ip.addInitScript(() => {
    const orig = window.addEventListener.bind(window);
    window.addEventListener = (type, ...rest) => {
      if (type === 'beforeinstallprompt') return undefined;
      return orig(type, ...rest);
    };
  });
  await ip.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // contesto vergine ⇒ nessun ga_nickname in localStorage ⇒ schermata di ingresso
  const onLanding = await ip.locator('input[type="password"]').first()
    .waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  if (onLanding) pass('iOS: parto dalla schermata di ingresso (visitatore nuovo)');
  else fail('iOS: non sono sulla schermata di ingresso, il test non sarebbe valido');

  const installBtn = ip.locator('button', { hasText: '📲' }).first();
  if (await installBtn.isVisible().catch(() => false)) pass('iOS: bottone "Installa app" visibile');
  else fail('iOS: bottone "Installa app" NON visibile su iPhone');

  await installBtn.click().catch(() => {});
  const popupVisible = await ip.locator('text=/Add to Home Screen|schermata Home/i').first()
    .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (popupVisible) pass('iOS: il bottone apre il popup con le istruzioni "Aggiungi a Home"');
  else fail('iOS: il bottone non apre nessun popup — su iPhone non si capisce come installare');
  await iphone.close();

  await browser.close();
  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
