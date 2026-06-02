// test-privacy.js — E2E privacy policy (footer + modale bilingue)
const { chromium } = require('playwright');

const BASE = 'http://localhost:4321/app';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let failures = 0;
  const check = (cond, msg) => { if (cond) { console.log('  ✓ ' + msg); } else { console.log('  ✗ ' + msg); failures++; } };

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const link = page.locator('footer button', { hasText: /Privacy/i });
    await link.waitFor({ state: 'visible', timeout: 8000 });
    check(await link.isVisible(), 'Link Privacy visibile nel footer');

    await link.click();
    const titleEn = page.locator('text=Privacy Policy');
    await titleEn.waitFor({ state: 'visible', timeout: 4000 });
    check(await titleEn.isVisible(), 'Modale aperto con titolo EN "Privacy Policy"');

    await page.keyboard.press('Escape');
    await titleEn.waitFor({ state: 'hidden', timeout: 4000 });
    check(!(await titleEn.isVisible()), 'Esc chiude il modale');

    await page.locator('button', { hasText: '🌐 EN' }).first().click();
    await page.locator('footer button', { hasText: /Privacy/i }).click();
    const titleIt = page.locator('text=Informativa sulla privacy');
    await titleIt.waitFor({ state: 'visible', timeout: 4000 });
    check(await titleIt.isVisible(), 'Modale tradotto in IT "Informativa sulla privacy"');

    await page.mouse.click(5, 5);
    await titleIt.waitFor({ state: 'hidden', timeout: 4000 });
    check(!(await titleIt.isVisible()), 'Click overlay chiude il modale');

  } catch (e) {
    console.log('  ✗ Eccezione: ' + e.message);
    failures++;
  } finally {
    await browser.close();
  }

  console.log(failures === 0 ? '\nPRIVACY: TUTTI VERDI' : `\nPRIVACY: ${failures} FALLITI`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
