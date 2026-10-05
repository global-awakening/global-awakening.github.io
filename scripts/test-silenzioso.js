/**
 * test-silenzioso.js — i browser dei test partono senza audio.
 *
 * Perché esiste: una ventina di test aprono Chromium con una finestra vera (headless: false)
 * e la musica dei rituali esce dalle casse di chi li lancia. Invece di toccare ogni
 * `chromium.launch(...)`, questo file si carica prima del test e aggiunge `--mute-audio` a
 * ogni avvio. I test non cambiano: finestre, tempi e comportamento restano quelli di sempre.
 *
 * Imposta anche locale en-US su ogni newContext/newPage che non ne chiede un altro (il PC è «it»).
 *
 * Uso:
 *   NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali.js
 */
const playwright = require('playwright');

// I browser di prova prendono la lingua del sistema (su questo PC «it»). Dal 2026-10 l'app
// sceglie la lingua del telefono, e i test che cercano testi inglesi partirebbero in italiano:
// qui si fissa en-US a ogni contesto che non ne chiede un'altra, in un punto solo.
const conLocale = (opzioni) => (opzioni && opzioni.locale ? opzioni : { ...(opzioni || {}), locale: 'en-US' });

const avvio = playwright.chromium.launch.bind(playwright.chromium);
playwright.chromium.launch = async (opzioni = {}) => {
  const browser = await avvio({ ...opzioni, args: [...(opzioni.args || []), '--mute-audio'] });
  const nuovoContesto = browser.newContext.bind(browser);
  const nuovaPagina = browser.newPage.bind(browser);
  browser.newContext = (o) => nuovoContesto(conLocale(o));
  browser.newPage = (o) => nuovaPagina(conLocale(o));
  return browser;
};
