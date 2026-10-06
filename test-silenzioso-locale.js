// Verifica che scripts/test-silenzioso.js imposti locale en-US quando il test non lo chiede.
const { chromium } = require('playwright');
let passed = 0, failed = 0;
const check = (c, m, d) => { if (c) { passed++; console.log('  ✅ ' + m); } else { failed++; console.log('  ❌ ' + m, d === undefined ? '' : JSON.stringify(d)); } };
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const p1 = await browser.newPage();
    check((await p1.evaluate(() => navigator.language)) === 'en-US', 'newPage senza locale → en-US', await p1.evaluate(() => navigator.language));
    const ctx = await browser.newContext({ locale: 'es-ES' });
    const p2 = await ctx.newPage();
    check((await p2.evaluate(() => navigator.language)) === 'es-ES', 'newContext con locale es-ES → resta es-ES');
    const ctx2 = await browser.newContext({ viewport: { width: 360, height: 700 } });
    const p3 = await ctx2.newPage();
    check((await p3.evaluate(() => navigator.language)) === 'en-US', 'newContext con altre opzioni → en-US');
  } finally { await browser.close(); }
  console.log(`\n${passed} passati, ${failed} falliti`);
  process.exit(failed ? 1 : 0);
})();
