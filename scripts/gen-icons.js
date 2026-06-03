// Genera le icone PWA (stella su tondo viola) con Playwright. Niente tool grafici.
// Uso: node scripts/gen-icons.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const STAR = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <polygon points="50,8 61,38 93,38 67,57 77,90 50,70 23,90 33,57 7,38 39,38"
           fill="url(#g)" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linejoin="round"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#fef9c3"/><stop offset="100%" stop-color="#fbbf24"/>
  </linearGradient></defs></svg>`;

function page(sizePx, starScalePct) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0}
    .bg{width:${sizePx}px;height:${sizePx}px;display:flex;align-items:center;justify-content:center;
        background:radial-gradient(circle at 50% 40%, #7c3aed 0%, #4c1d95 100%)}
    .star{width:${starScalePct}%;height:${starScalePct}%;filter:drop-shadow(0 6px 18px rgba(0,0,0,0.35))}
  </style></head><body><div class="bg"><div class="star">${STAR}</div></div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ deviceScaleFactor: 1 });
  const out = path.join(__dirname, '..', 'icons');
  fs.mkdirSync(out, { recursive: true });

  // any 512
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(page(512, 78));
  await p.locator('.bg').screenshot({ path: path.join(out, 'icon-512.png') });

  // any 192
  await p.setViewportSize({ width: 192, height: 192 });
  await p.setContent(page(192, 78));
  await p.locator('.bg').screenshot({ path: path.join(out, 'icon-192.png') });

  // maskable 512 (stella piccola per la safe-zone Android)
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(page(512, 52));
  await p.locator('.bg').screenshot({ path: path.join(out, 'icon-maskable-512.png') });

  await browser.close();
  console.log('Icone generate in icons/');
})();
