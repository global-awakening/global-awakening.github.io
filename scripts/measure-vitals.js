/**
 * Misura Core Web Vitals del sito live (LCP, FCP, CLS, TTFB) con Playwright +
 * PerformanceObserver. Confronto con la baseline 2026-06-01 (LCP ~3.9s, quando il
 * JSX era compilato in-browser da @babel/standalone). Ora app.js è precompilato.
 *
 * Uso: node scripts/measure-vitals.js [url]
 * Default URL: https://global-awakening.github.io/app.html
 */
const { chromium } = require('playwright');

const URL_TARGET = process.argv[2] || 'https://global-awakening.github.io/app.html';
const RUNS = 3;

async function measureOnce(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL_TARGET, { waitUntil: 'load', timeout: 60000 });
  // Lascia stabilizzare LCP/CLS (osservatori) qualche secondo dopo il load.
  await page.waitForTimeout(5000);
  const vitals = await page.evaluate(() => new Promise((resolve) => {
    const out = { lcp: 0, cls: 0 };
    // LCP: ultimo entry osservato
    try {
      new PerformanceObserver((list) => {
        const es = list.getEntries();
        out.lcp = es[es.length - 1].renderTime || es[es.length - 1].loadTime || out.lcp;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    // CLS: somma degli shift non-input
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) out.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0;
      resolve({
        ttfb: Math.round(nav.responseStart || 0),
        fcp: Math.round(fcp),
        lcp: Math.round(out.lcp),
        cls: Number(out.cls.toFixed(4)),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        load: Math.round(nav.loadEventEnd || 0),
      });
    }, 500);
  }));
  await ctx.close();
  return vitals;
}

(async () => {
  console.log(`\n📊 Core Web Vitals — ${URL_TARGET}\n   (baseline 2026-06-01: LCP ~3900ms con Babel in-browser)\n`);
  const browser = await chromium.launch({ headless: true });
  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    const v = await measureOnce(browser);
    runs.push(v);
    console.log(`Run ${i}: TTFB ${v.ttfb}ms | FCP ${v.fcp}ms | LCP ${v.lcp}ms | CLS ${v.cls} | DCL ${v.domContentLoaded}ms | load ${v.load}ms`);
  }
  await browser.close();
  const med = (k) => { const s = runs.map(r => r[k]).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const lcp = med('lcp');
  console.log(`\nMediana: TTFB ${med('ttfb')}ms | FCP ${med('fcp')}ms | LCP ${lcp}ms | CLS ${med('cls')} | load ${med('load')}ms`);
  const verdict = (label, val, good) => console.log(`  ${val <= good ? '✅' : '❌'} ${label}: ${val} (target ≤ ${good})`);
  console.log('\nValutazione Core Web Vitals:');
  verdict('LCP (ms)', lcp, 2500);
  verdict('CLS', med('cls'), 0.1);
  verdict('FCP (ms)', med('fcp'), 1800);
})();
