/**
 * Inviti a un training anche a chi non è collegato — nel browser, con più persone.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js [scenario ...]
 *
 * Prerequisiti: 32a applicata, notify-telepathy-invite pubblicata, server `npx serve -l 4321 .`
 * (verificare «Accepting connections at http://localhost:4321»), SUPABASE_SERVICE_KEY in .env.test.
 *
 * ⚠️ Gira sul database e sulla Edge Function VERI. Per la durata del test le disponibilità di
 * prova sono visibili a utenti veri in «Disponibili su invito»: nickname con prefisso GAInv_,
 * interruttori accesi solo dove serve, pulizia nel finally. Lanciarlo in un orario tranquillo.
 * I tempi del server non si aspettano: si spostano con la chiave di servizio (expires_at,
 * responded_at, created_at delle righe di prova).
 * Le push vanno a indirizzi finti (stub di PushManager, come test-push-ui.js): il servizio push li
 * rifiuta e esito.mjs può cancellarli, che è il comportamento previsto.
 */
const { chromium } = require('playwright');
const { getServiceKey, purge, loginAsGuest } = require('./test-helpers');

const APP_URL = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const KEY = getServiceKey();
const TS = Date.now();
const nick = (x) => `GAInv_${x}_${TS}`;

let passati = 0, falliti = 0;
const ok = (m) => { console.log('  ✅ ' + m); passati++; };
const ko = (m, x) => { console.log('  ❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); falliti++; process.exitCode = 1; };
const check = (c, m, x) => (c ? ok(m) : ko(m, x));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function attendi(fn, ms = 15000) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) { const v = await fn(); if (v) return v; await pausa(500); }
  return null;
}

// Stub delle push, come test-push-ui.js: Chromium di test non ha un servizio push vero.
const STUB = `
  window.__permesso = 'default';
  if (typeof Notification !== 'undefined') {
    Object.defineProperty(Notification, 'permission', { get: () => window.__permesso, configurable: true });
    Notification.requestPermission = async () => { window.__permesso = window.__rispostaPermesso || 'granted'; return window.__permesso; };
  }
  if (typeof PushManager !== 'undefined') {
    window.__subFinta = null;
    PushManager.prototype.getSubscription = async function () { return window.__subFinta; };
    PushManager.prototype.subscribe = async function () {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/gainv_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      window.__subFinta = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh_finta', auth: 'auth_finta' } }),
                            unsubscribe: async () => { window.__subFinta = null; return true; } };
      return window.__subFinta;
    };
  }
`;

async function servizio(percorso, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${percorso}`, { ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) } });
  const t = await r.text();
  try { return JSON.parse(t); } catch (_) { return t; }
}
const q = (s) => encodeURIComponent(s);
const leggi = async (tabella, filtro) => { const r = await servizio(`${tabella}?${filtro}`); return Array.isArray(r) ? r : []; };
const sposta = (tabella, filtro, campi) => servizio(`${tabella}?${filtro}`, { method: 'PATCH', body: JSON.stringify(campi) });
const faSecondi = (s) => new Date(Date.now() - s * 1000).toISOString();

const tutte = [];   // per la pulizia finale
let attive = [];    // contesti da chiudere a fine scenario
async function entra(browser, etichetta, { permesso = 'granted' } = {}) {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:4321' });
  await ctx.addInitScript(`window.__rispostaPermesso = ${JSON.stringify(permesso)};` + STUB);
  const page = await ctx.newPage();
  const p = { ctx, page, nick: nick(etichetta) };
  await loginAsGuest(page, p.nick);
  p.sid = await page.evaluate(() => localStorage.getItem('ga_session_id'));
  tutte.push(p); attive.push(p);
  return p;
}
async function aTelepatia(p, page = p.page) {
  await page.locator('button').filter({ hasText: /Telepatia|Telepathy/ }).first().click();
  await page.waitForSelector('text=Telepathy Training', { timeout: 20000 });
}
const rigaOnline = (p, di) => p.page.locator('[data-test="riga-online"]').filter({ hasText: di.nick });
const pendingDa = async (p) => (await leggi('telepathy_invites', `from_id=eq.${q(p.sid)}&status=eq.pending&select=*`))[0] || null;

async function pulizia() {
  const sids = tutte.map((p) => p.sid).filter(Boolean);
  if (sids.length === 0) return;
  const inS = q(`(${sids.map((s) => `"${s}"`).join(',')})`);
  const inN = q(`(${tutte.map((p) => `"${p.nick}"`).join(',')})`);
  await purge(SUPABASE_URL, [
    `telepathy_invites?from_id=in.${inS}`, `telepathy_invites?to_id=in.${inS}`,
    `telepathy_matches?user1_id=in.${inS}`, `telepathy_matches?user2_id=in.${inS}`,
    `telepathy_availability?session_id=in.${inS}`,
    `telepathy_invite_blocks?blocker_session=in.${inS}`, `telepathy_invite_blocks?blocked_session=in.${inS}`,
    `push_subscriptions?session_id=in.${inS}`, `online_users?id=in.${inS}`, `telepathy_queue?id=in.${inS}`,
    `notifications?user_nickname=in.${inN}`,
  ], { label: 'inviti-ui' });
}

const scenari = [];
const scenario = (nome, fn) => scenari.push([nome, fn]);

// ════ Task 18: invio ═══════════════════════════════════════════════════════
scenario('invio_online', async (browser) => {
  const A = await entra(browser, 'A');
  const B = await entra(browser, 'B');
  const C = await entra(browser, 'C');
  await aTelepatia(A); await aTelepatia(C);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const conto = A.page.locator('[data-test="conto-invito"]');
  await conto.waitFor({ timeout: 10000 });
  check(/0:(4\d|3\d)/.test(await conto.innerText()), 'chi invita vede il conto alla rovescia da 45 s', await conto.innerText());
  const inv = await attendi(() => pendingDa(A));
  check(!!inv && inv.con_push === false && inv.from_name === A.nick && inv.to_id === B.sid && inv.via_diretta === false,
    'l\'invito passa dalla RPC: nomi dal server, niente push (B non ha l\'interruttore)', inv);
  await B.page.locator('.invite-toast').waitFor({ timeout: 15000 });
  ok('B vede l\'invito');
  await rigaOnline(C, B).waitFor({ timeout: 20000 });
  await rigaOnline(C, B).locator('button').click();
  await C.page.locator('[data-test="avviso-inviti"]').filter({ hasText: /già stato invitato|Already invited/ }).waitFor({ timeout: 10000 });
  ok('un secondo mittente legge «È già stato invitato, riprova fra poco»');
  await A.page.locator('[data-test="annulla-invito"]').click();
  await B.page.locator('.invite-toast').waitFor({ state: 'detached', timeout: 15000 });
  const annullato = (await leggi('telepathy_invites', `id=eq.${inv.id}&select=status`))[0];
  check(!!annullato && annullato.status === 'cancelled', '«Annulla» passa dalla RPC: cancelled', annullato);
  await rigaOnline(A, B).locator('button').click();
  const secondo = await attendi(() => pendingDa(A));
  // runBeforeUnload: altrimenti beforeunload non parte e il controllo passerebbe per costruzione.
  await A.page.close({ runBeforeUnload: true });
  await pausa(2000);
  const dopo = (await leggi('telepathy_invites', `id=eq.${secondo.id}&select=status`))[0];
  check(!!dopo && dopo.status === 'pending', 'chiudere l\'app non ritira più l\'invito', dopo);
});

// ── esecuzione ──
(async () => {
  if (!KEY) { console.log('⛔ serve SUPABASE_SERVICE_KEY in .env.test (spostare i tempi e ripulire): non parto.'); process.exit(2); }
  const scelti = process.argv.slice(2);
  const browser = await chromium.launch({ headless: false });
  try {
    for (const [nome, fn] of scenari) {
      if (scelti.length && !scelti.includes(nome)) continue;
      console.log(`\n— ${nome} —`);
      try { await fn(browser); } catch (e) { ko(`${nome}: eccezione`, e.message); }
      for (const p of attive) await p.ctx.close().catch(() => {});
      attive = [];
    }
  } finally {
    await pulizia();
    await browser.close();
  }
  console.log(`\n${passati} passati, ${falliti} falliti`);
})();
