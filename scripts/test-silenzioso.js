/**
 * test-silenzioso.js — i browser dei test partono senza audio.
 *
 * Perché esiste: una ventina di test aprono Chromium con una finestra vera (headless: false)
 * e la musica dei rituali esce dalle casse di chi li lancia. Invece di toccare ogni
 * `chromium.launch(...)`, questo file si carica prima del test e aggiunge `--mute-audio` a
 * ogni avvio. I test non cambiano: finestre, tempi e comportamento restano quelli di sempre.
 *
 * Uso:
 *   NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali.js
 */
const playwright = require('playwright');

const avvio = playwright.chromium.launch.bind(playwright.chromium);
playwright.chromium.launch = (opzioni = {}) =>
  avvio({ ...opzioni, args: [...(opzioni.args || []), '--mute-audio'] });
