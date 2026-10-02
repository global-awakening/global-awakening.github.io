/**
 * Il service worker davanti alle push d'invito, in una sandbox vm di Node (dentro un browser
 * vero non si prova niente di tutto questo).
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-sw-inviti.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passati = 0, falliti = 0;
const check = (c, m, x) => { if (c) { console.log('  ✅ ' + m); passati++; } else { console.log('  ❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); falliti++; process.exitCode = 1; } };
const ID = '3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c';
const UA_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function caricaSW({ userAgent, finestre = [] }) {
  const ascoltatori = {};
  const mostrate = [];
  const aperte = [];
  const self = {
    navigator: { userAgent },
    addEventListener: (tipo, fn) => { ascoltatori[tipo] = fn; },
    registration: { showNotification: async (titolo, opzioni) => { mostrate.push({ titolo, opzioni }); } },
    clients: { matchAll: async () => finestre, openWindow: async (u) => { aperte.push(u); }, claim: async () => {} },
    skipWaiting: () => {},
  };
  const contesto = {
    self, console, URL, MessageChannel, setTimeout, clearTimeout, Promise,
    caches: { open: async () => ({ add: async () => {}, put: async () => {}, match: async () => null }), keys: async () => [], delete: async () => true, match: async () => null },
    fetch: async () => { throw new Error('rete finta'); }, Request: function () {}, Response: function () {},
  };
  contesto.importScripts = (u) => vm.runInContext(fs.readFileSync(path.join(__dirname, u.split('?')[0]), 'utf8'), contesto);
  vm.createContext(contesto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8'), contesto);
  return { ascoltatori, mostrate, aperte, self };
}
function finestra({ visibile = true, risponde = true } = {}) {
  const f = {
    url: 'http://localhost:4321/app.html', visibilityState: visibile ? 'visible' : 'hidden',
    messaggi: [], navigata: null, focus: async () => {}, navigate: async (u) => { f.navigata = u; },
    postMessage: (m, porte) => { f.messaggi.push(m); if (risponde && porte && porte[0]) porte[0].postMessage({ ok: true }); },
  };
  return f;
}
async function push(sw, payload) {
  const attese = [];
  sw.ascoltatori.push({ data: { json: () => payload }, waitUntil: (p) => attese.push(p) });
  await Promise.all(attese);
}
async function tocca(sw, data, action = '') {
  const attese = [];
  sw.ascoltatori.notificationclick({ action, notification: { data, close: () => {} }, waitUntil: (p) => attese.push(p) });
  await Promise.all(attese);
}
const invito = { tipo: 'invito', invito: ID, nome: 'Aurora', locale: 'it' };

(async () => {
  let f = finestra();
  let sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await push(sw, invito);
  check(sw.mostrate.length === 0 && f.messaggi.length === 1 && f.messaggi[0].invito === ID, 'Chrome, app in primo piano: niente notifica, l\'app riceve l\'invito', { m: sw.mostrate, f: f.messaggi });

  f = finestra();
  sw = caricaSW({ userAgent: UA_IPHONE, finestre: [f] });
  await push(sw, invito);
  check(sw.mostrate.length === 1, 'iPhone, app in primo piano: la notifica si mostra lo stesso (Safari conta le push silenziose)', sw.mostrate.length);

  f = finestra({ visibile: false });
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await push(sw, invito);
  const o = sw.mostrate[0] && sw.mostrate[0].opzioni;
  check(!!o && o.tag === 'invito-' + ID && o.actions.length === 1 && o.data.url === 'app.html?invito=' + ID && o.data.invito === ID,
    'app in secondo piano: notifica con tag, azione «blocca» e destinazione', o);

  f = finestra();
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await push(sw, { tipo: 'start', rituale: 'Luna', ritualeId: 4, locale: 'it' });
  check(sw.mostrate.length === 1 && sw.mostrate[0].titolo === 'Luna sta iniziando ora', 'i rituali non cambiano: si mostrano anche con l\'app aperta', sw.mostrate);

  f = finestra();
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await tocca(sw, { url: 'app.html?invito=' + ID, tipo: 'invito', invito: ID });
  check(f.messaggi.length === 1 && f.messaggi[0].tipo === 'apri-invito' && f.navigata === null, 'tocco con l\'app aperta che risponde: invito per messaggio, nessuna ricarica', f);

  f = finestra({ risponde: false });
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  const t0 = Date.now();
  await tocca(sw, { url: 'app.html?invito=' + ID, tipo: 'invito', invito: ID });
  check(f.navigata === 'app.html?invito=' + ID && Date.now() - t0 >= 900, 'app aperta che non risponde (vecchia o bloccata): dopo ~1 s ricarica sull\'invito', { navigata: f.navigata, ms: Date.now() - t0 });

  f = finestra({ risponde: false });
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await tocca(sw, { url: 'app.html?invito=' + ID, tipo: 'invito', invito: ID }, 'blocca');
  check(f.navigata === 'app.html?invito=' + ID + '&azione=blocca', 'azione «blocca»: la ricarica porta anche azione=blocca', f.navigata);

  sw = caricaSW({ userAgent: UA_CHROME, finestre: [] });
  await tocca(sw, { url: 'app.html?invito=' + ID, tipo: 'invito', invito: ID });
  check(sw.aperte[0] === 'app.html?invito=' + ID, 'nessuna finestra: se ne apre una sull\'invito', sw.aperte);

  f = finestra();
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await tocca(sw, { url: 'app.html?ritual=4' });
  check(f.messaggi.length === 0 && f.navigata === 'app.html?ritual=4', 'tocco su un rituale: navigate come oggi', f);

  f = finestra({ visibile: false });
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  delete sw.self.PushHelpers;
  await push(sw, invito);
  check(sw.mostrate.length === 1 && sw.mostrate[0].titolo === 'Global Awakening' && !/rituale/i.test(sw.mostrate[0].opzioni.body),
    'senza PushHelpers, per un invito il ripiego è neutro (non parla di rituali)', sw.mostrate);

  console.log(`\n${passati} passati, ${falliti} falliti`);
})();
