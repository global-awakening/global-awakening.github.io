/**
 * Test dell'occhietto sui campi password — Global Awakening
 *
 * Ogni campo password deve avere un pulsante che mostra e rinasconde quello che si è scritto,
 * senza perdere il testo né il fuoco. Prova i cinque campi: login, registrazione, le due
 * caselle della password nuova (link di reset) e il cambio password dal profilo.
 *
 * Prerequisiti: server `npx serve -l 4321 .` (verificare «Accepting connections at
 * http://localhost:4321»), SUPABASE_SERVICE_KEY in .env.test (per cancellare l'account di prova).
 */
const { chromium } = require('playwright');
const { requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount } = require('./test-helpers');
requireServiceKey();

const APP_URL = 'http://localhost:4321/app.html';
const TIMEOUT = 15000;
const TS = Date.now();
const EMAIL = `occhietto_${TS}@test.com`;
const NICK = `Occhietto_${TS}`;
const PASS = 'Password123!';

let passed = 0;
let failed = 0;
const pass = (m) => { console.log(`  ✅ ${m}`); passed++; };
const fail = (m) => { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; };

// Prova un campo: nascosto all'inizio, l'occhietto lo mostra con lo stesso testo, e lo rinasconde.
async function provaCampo(page, campo, nome, testo) {
  await campo.fill(testo);
  const pulsante = campo.locator('xpath=following-sibling::button[1]');
  if (await campo.getAttribute('type') !== 'password') return fail(`${nome}: non parte nascosto`);
  if (await pulsante.count() !== 1) return fail(`${nome}: occhietto assente`);
  const etichetta = await pulsante.getAttribute('aria-label');
  await pulsante.click();
  if (await campo.getAttribute('type') !== 'text') return fail(`${nome}: l'occhietto non mostra la password`);
  if (await campo.inputValue() !== testo) return fail(`${nome}: il testo cambia quando si mostra`);
  const etichettaDopo = await pulsante.getAttribute('aria-label');
  if (!etichetta || !etichettaDopo || etichetta === etichettaDopo) return fail(`${nome}: etichetta dell'occhietto non cambia (${etichetta} / ${etichettaDopo})`);
  // Scrivere dopo averla mostrata: il campo non deve essere ricreato a ogni lettera.
  await campo.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('xy');
  if (await campo.inputValue() !== testo + 'xy') return fail(`${nome}: scrivendo il campo perde il fuoco o il testo`);
  await pulsante.click();
  if (await campo.getAttribute('type') !== 'password') return fail(`${nome}: non si rinasconde`);
  pass(`${nome}: mostra e rinasconde (${etichetta} → ${etichettaDopo})`);
}

(async () => {
  const browser = await chromium.launch();
  try {
    console.log('\n🔐 Occhietto sui campi password\n');

    // 1. Login
    let page = await browser.newPage();
    await page.goto(APP_URL);
    await page.waitForSelector('input[aria-label="Password"]', { timeout: TIMEOUT });
    await provaCampo(page, page.locator('input[aria-label="Password"]').first(), 'login', 'segreta1');

    // 2. Password nuova dal link di reset: serve un token vero, quindi prima un account di prova
    await createTestAccount({ email: EMAIL + '.r', nickname: NICK + 'r', session_id: 'occhietto-r-' + TS });
    await page.close();
    page = await browser.newPage();
    // serve rimanda /app.html → /app perdendo la query: si va diretti su /app (come test-reset-password-bug).
    const tok = await serviceFetch('rpc/crea_token_account', { method: 'POST', body: JSON.stringify({ p_tipo: 'reset', p_email: EMAIL + '.r' }) });
    await page.goto(APP_URL.replace(/\.html$/, '') + '?reset=' + tok.body);
    await page.waitForFunction(() => document.querySelectorAll('input[type="password"]').length === 2, null, { timeout: TIMEOUT }).catch(() => {});
    const reset = page.locator('input[type="password"]');
    const nReset = await reset.count();
    if (nReset !== 2) fail(`reset: attesi 2 campi password, trovati ${nReset}`);
    else {
      // Per etichetta, non per tipo: mostrando la password il tipo cambia e `nth` scivolerebbe.
      const [e1, e2] = [await reset.nth(0).getAttribute('aria-label'), await reset.nth(1).getAttribute('aria-label')];
      await provaCampo(page, page.locator(`input[aria-label="${e1}"]`), 'reset — password nuova', 'nuova123');
      await provaCampo(page, page.locator(`input[aria-label="${e2}"]`), 'reset — conferma', 'nuova123');
    }

    // 3. Registrazione, poi cambio password dal profilo
    await page.close();
    page = await browser.newPage();
    await page.goto(APP_URL);
    await page.locator('button', { hasText: /^Registrati$|^Register$/ }).first().click();
    await page.locator('input[placeholder*="sername"], input[placeholder*="ickname"]').first().fill(NICK);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    const reg = page.locator('input[aria-label="Password"]').first();
    await provaCampo(page, reg, 'registrazione', PASS);
    await reg.fill(PASS);
    await page.locator('button.btn-primary', { hasText: /^Registrati$|^Register$/ }).first().click();
    await page.waitForSelector('input[placeholder="Password"]', { state: 'detached', timeout: TIMEOUT });
    await page.locator('[title="Edit Profile"], [title="Modifica Profilo"]').first().click();
    const prof = page.locator('input[placeholder="New password..."]');
    await prof.waitFor({ timeout: TIMEOUT });
    await provaCampo(page, prof, 'profilo — cambio password', 'cambiata9');
  } catch (e) {
    fail('errore: ' + e.message);
  } finally {
    await browser.close();
    // Ognuna per conto suo: se la prima fallisce (rete), la seconda si fa lo stesso.
    await Promise.allSettled([deleteTestAccount(EMAIL), deleteTestAccount(EMAIL + '.r')]);
    console.log(`\n${passed} passati, ${failed} falliti`);
  }
})();
