/**
 * test-commento-in-attesa.js — un post o un commento appena scritto non sparisce dallo schermo
 * mentre il server lo sta ancora salvando.
 *
 * Il difetto: il giro di aggiornamento (ogni 10 s) rileggeva l'elenco dal server e lo sostituiva a
 * quello mostrato; se il salvataggio non era ancora arrivato, la riga appena scritta spariva per
 * qualche secondo e poi ricompariva. Qui il salvataggio viene trattenuto 14 s, così il giro passa
 * di sicuro nel mezzo, e si controlla ogni mezzo secondo che la riga resti visibile, una volta sola.
 *
 * Esecuzione: node test-commento-in-attesa.js (app su http://localhost:4321)
 */
const { chromium } = require('playwright');
const { purge, requireServiceKey, SUPABASE_URL } = require('./test-helpers');
requireServiceKey();

const APP_URL = 'http://localhost:4321/app.html';
const TIMEOUT = 20000;
const TS = Date.now();
const NICK = `InAttesa_${TS}`;
const TRATTIENI_MS = 14000;

let passed = 0, failed = 0;
const pass = (m) => { console.log(`  ✅ ${m}`); passed++; };
const fail = (m) => { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; };
const attesa = (ms) => new Promise(r => setTimeout(r, ms));

// Trattiene le sole scritture (POST) sulla tabella: le letture del giro passano subito.
async function trattieniScritture(page, glob) {
  await page.route(glob, async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    await attesa(TRATTIENI_MS);
    return r.continue();
  });
}

// Conta ogni mezzo secondo le righe visibili; restituisce il minimo e il massimo visti.
async function osserva(loc, ms) {
  let min = Infinity, max = 0;
  for (const fine = Date.now() + ms; Date.now() < fine; await attesa(500)) {
    const n = await loc.count();
    min = Math.min(min, n); max = Math.max(max, n);
  }
  return { min, max };
}

async function pulisci() {
  const e = encodeURIComponent;
  await purge(SUPABASE_URL, [
    `consciousness_comments?author_nickname=eq.${e(NICK)}`,
    `consciousness_posts?author_nickname=eq.${e(NICK)}`,
  ], { label: 'commento-in-attesa' });
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  try {
    await page.goto(APP_URL);
    await page.locator('button:has-text("Ospite"), button:has-text("Guest")').first().click({ timeout: TIMEOUT });
    await page.locator('input[placeholder*="username"], input[placeholder*="Username"]').first().fill(NICK);
    await page.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")').click();
    await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
    await page.locator('button').filter({ hasText: /Coscienza|Consciousness/ }).first().click();
    await page.waitForSelector('h2:has-text("Feed Coscienza"), h2:has-text("Consciousness Feed")', { timeout: TIMEOUT });

    console.log('— Post trattenuto —');
    const postTxt = `post in attesa ${TS}`;
    await trattieniScritture(page, '**/rest/v1/consciousness_posts*');
    await page.locator('textarea').first().fill(postTxt);
    await page.locator('button:has-text("Pubblica"), button:has-text("Post")').first().click();
    const postP = page.locator('p.text-white', { hasText: postTxt });
    const vp = await osserva(postP, TRATTIENI_MS + 1000);
    vp.min === 1 ? pass('il post resta visibile mentre si salva') : fail(`il post è sparito durante il salvataggio (visto ${vp.min}–${vp.max} volte)`);
    await page.unroute('**/rest/v1/consciousness_posts*');
    const vp2 = await osserva(postP, 12000);   // almeno un giro dopo il salvataggio
    vp2.min === 1 && vp2.max === 1 ? pass('dopo il salvataggio il post c\'è una volta sola')
      : fail(`post dopo il salvataggio visto ${vp2.min}–${vp2.max} volte`);

    console.log('— Commento trattenuto —');
    const card = page.locator('div.bg-glass').filter({ has: postP }).first();
    await card.locator('button.btn-secondary').filter({ hasText: /commenti|comments/ }).first().click();
    const input = card.locator('input[placeholder*="commento"], input[placeholder*="comment"]').first();
    await input.waitFor({ timeout: TIMEOUT });
    const cmt = `commento in attesa ${TS}`;
    await trattieniScritture(page, '**/rest/v1/consciousness_comments*');
    await input.fill(cmt);
    await input.press('Enter');
    const cmtP = card.locator('p', { hasText: cmt });
    const vc = await osserva(cmtP, TRATTIENI_MS + 1000);
    vc.min === 1 ? pass('il commento resta visibile mentre si salva') : fail(`il commento è sparito durante il salvataggio (visto ${vc.min}–${vc.max} volte)`);
    await page.unroute('**/rest/v1/consciousness_comments*');
    const vc2 = await osserva(cmtP, 12000);
    vc2.min === 1 && vc2.max === 1 ? pass('dopo il salvataggio il commento c\'è una volta sola')
      : fail(`commento dopo il salvataggio visto ${vc2.min}–${vc2.max} volte`);

    console.log('— Lo stesso commento una seconda volta —');
    // Il primo è già sul server: non deve «confermare» il secondo, che è ancora in viaggio.
    await trattieniScritture(page, '**/rest/v1/consciousness_comments*');
    await input.fill(cmt);
    await input.press('Enter');
    const vd = await osserva(cmtP, TRATTIENI_MS + 1000);
    vd.min === 2 ? pass('il commento ripetuto resta visibile mentre si salva') : fail(`commento ripetuto visto ${vd.min}–${vd.max} volte durante il salvataggio`);
    await page.unroute('**/rest/v1/consciousness_comments*');
    const vd2 = await osserva(cmtP, 12000);
    vd2.min === 2 && vd2.max === 2 ? pass('dopo il salvataggio i due commenti uguali ci sono entrambi, una volta ciascuno')
      : fail(`commenti uguali dopo il salvataggio visti ${vd2.min}–${vd2.max} volte`);
  } catch (e) {
    fail('eccezione: ' + e.message);
  } finally {
    await browser.close();
    await pulisci();
    console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  }
})();
