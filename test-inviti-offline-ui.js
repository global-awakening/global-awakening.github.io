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

// ════ Task 19: attesa di chi invita ════════════════════════════════════════
// Questi due scenari dipendono da acceptInvite del Task 20 (match_id scritto nell'invito):
// si verificano al Task 20 (ruling B1).
scenario('attesa_di_chi_invita', async (browser) => {
  const A = await entra(browser, 'A2');
  const B = await entra(browser, 'B2');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await sposta('telepathy_invites', `id=eq.${inv.id}`, { expires_at: faSecondi(1) });
  await A.page.locator('[data-test="conto-invito"]').waitFor({ state: 'detached', timeout: 10000 });
  ok('a expires_at (ora del server) l\'invito si chiude e il pulsante torna, senza timer locale');
  await rigaOnline(A, B).locator('button').click();
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 15000 });
  await A.page.locator('[data-test="partner-nome"]').filter({ hasText: B.nick }).waitFor({ timeout: 15000 });
  ok('B accetta: A entra nel match, col nome del partner preso dal match');
  const m = (await leggi('telepathy_matches', `user1_id=eq.${q(A.sid)}&select=user2_id,da_invito,giocato`))[0];
  check(!!m && m.user2_id === B.sid && m.da_invito === true && m.giocato === true,
    'è il match dell\'invito, e l\'arrivo di A conta come attività (giocato)', m);
});

scenario('rientro_all_avvio', async (browser) => {
  const A = await entra(browser, 'A3');
  const B = await entra(browser, 'B3');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  // runBeforeUnload (ruling m1): la chiusura vera, con beforeunload, come sul telefono.
  await A.page.close({ runBeforeUnload: true });
  await servizio(`online_users?id=eq.${q(A.sid)}`, { method: 'DELETE' });   // A risulta offline
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 15000 });
  const pA = await A.ctx.newPage();
  // Riapre dalla notifica «accettato» (?invito=<id>): entra nel match_id dell'invito. Senza il parametro
  // lo farebbe lo stesso il rientro all'avvio; con, si prova anche la strada di chi arriva dalla notifica.
  await pA.goto(`${APP_URL}?invito=${inv.id}`);
  await pA.locator('[data-test="partner-nome"]').filter({ hasText: B.nick }).waitFor({ timeout: 25000 });
  ok('A riapre l\'app entro 3 minuti ed entra da sola/o nel match accettato');
});

// ════ Task 20: chi riceve ══════════════════════════════════════════════════
scenario('attesa_di_chi_accetta', async (browser) => {
  const A = await entra(browser, 'A4');
  const B = await entra(browser, 'B4');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  // runBeforeUnload (ruling m1): la chiusura vera, con beforeunload, come sul telefono.
  await A.page.close({ runBeforeUnload: true });
  await servizio(`online_users?id=eq.${q(A.sid)}`, { method: 'DELETE' });
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 15000 });
  await B.page.locator('[data-test="attesa-invitante"]').waitFor({ timeout: 10000 });
  ok('chi accetta vede «In attesa che … entri»');
  await pausa(95000);   // oltre i 35 s di checkPartnerLeft e i 90 s del timeout A3
  check(await B.page.locator('[data-test="attesa-invitante"]').isVisible(), 'dopo 95 s è ancora in attesa (spenti i controlli dei 35 s e dei 90 s)');
  await sposta('telepathy_invites', `id=eq.${inv.id}`, { responded_at: faSecondi(181) });
  await B.page.locator('[data-test="avviso-inviti"]').filter({ hasText: A.nick }).waitFor({ timeout: 10000 });
  const m = (await leggi('telepathy_matches', `user2_id=eq.${q(B.sid)}&select=ended_at`))[0];
  check(!m || !!m.ended_at, 'a 3 minuti dall\'accettazione (ora del server) il match si chiude e si torna alla lobby', m);
});

scenario('rifiuto_e_due_schede', async (browser) => {
  const A = await entra(browser, 'A5');
  const B = await entra(browser, 'B5');
  const B2 = await B.ctx.newPage();   // la stessa persona su una seconda scheda
  await B2.goto(APP_URL);
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  await B.page.locator('.invite-toast').waitFor({ timeout: 15000 });
  await B2.locator('.invite-toast').waitFor({ timeout: 15000 });
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click();
  await B2.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 5000 }).catch(() => {});
  const secondo = await attendi(async () => (await B2.locator('[data-test="avviso-inviti"]').count()) > 0
    || (await B2.locator('.invite-toast').count()) === 0, 10000);
  check(!!secondo, 'la seconda scheda non entra in un secondo training: messaggio o banner sparito', null);
  const aperti = await leggi('telepathy_matches', `user2_id=eq.${q(B.sid)}&ended_at=is.null&select=id`);
  check(aperti.length === 1, 'resta un match solo (quello della seconda scheda si cancella)', aperti);
  await B.page.locator('[data-test="partner-nome"]').waitFor({ timeout: 10000 }).catch(() => {});
  const C = await entra(browser, 'C5');
  await aTelepatia(C);
  const D = await entra(browser, 'D5');
  await rigaOnline(C, D).waitFor({ timeout: 20000 });
  await rigaOnline(C, D).locator('button').click();
  await D.page.locator('.invite-toast [data-test="btn-rifiuta"]').click({ timeout: 15000 });
  await C.page.locator('[data-test="avviso-inviti"]').filter({ hasText: /non può ora|can't right now/ }).waitFor({ timeout: 10000 });
  ok('D rifiuta: C legge «… non può ora»');
});

scenario('campanella_e_training', async (browser) => {
  const A = await entra(browser, 'A6');
  const B = await entra(browser, 'B6');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await sposta('telepathy_invites', `id=eq.${inv.id}`, { expires_at: faSecondi(1) });
  await B.page.locator('.invite-toast').waitFor({ state: 'detached', timeout: 15000 });
  ok('scaduto sul server, il banner di chi riceve sparisce (niente più soglia dei 120 s)');
  // Un invito mentre si gioca: lo scrive il test col ruolo di servizio (il server, giustamente,
  // rifiuta di invitare chi è in un training).
  const C = await entra(browser, 'C6');
  await aTelepatia(C);
  await rigaOnline(C, B).waitFor({ timeout: 20000 });
  await rigaOnline(C, B).locator('button').click();
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 15000 });
  await B.page.locator('[data-test="partner-nome"]').waitFor({ timeout: 15000 });
  await servizio('telepathy_invites', { method: 'POST', body: JSON.stringify({
    from_id: A.sid, from_name: A.nick, to_id: B.sid, to_name: B.nick, status: 'pending',
    expires_at: new Date(Date.now() + 600000).toISOString() }) });
  await B.page.locator('[data-test="invito-durante-training"]').waitFor({ timeout: 15000 });
  check(await B.page.locator('[data-test="invito-durante-training"] [data-test="btn-accetta"]').count() === 0,
    'durante un training l\'invito mostra solo «Rifiuta»');
  check(await B.page.locator('[data-test="partner-nome"]').isVisible(), 'e il training continua');
});

// Fix round 1: chi invita posa il telefono e la sua riga di presenza resta lì, fresca ma più
// vecchia dell'accettazione (nessuno la cancella quando il telefono si blocca). Non deve contare
// come «è arrivato»: chi ha accettato resta in attesa oltre i 35 s di checkPartnerLeft.
scenario('attesa_con_presenza_vecchia', async (browser) => {
  const A = await entra(browser, 'A9');
  const B = await entra(browser, 'B9');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  await attendi(() => pendingDa(A));
  await A.page.close({ runBeforeUnload: true });   // la riga in online_users resta (last_seen di pochi secondi fa)
  // Doppio tocco su «Accetta»: il secondo, col primo in volo, si ignora.
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').dblclick({ timeout: 15000 });
  await B.page.locator('[data-test="attesa-invitante"]').waitFor({ timeout: 10000 });
  const aperti = await leggi('telepathy_matches', `user2_id=eq.${q(B.sid)}&ended_at=is.null&select=id`);
  check(aperti.length === 1 && (await B.page.locator('[data-test="avviso-inviti"]').count()) === 0,
    'doppio tocco su «Accetta»: un match solo e nessun messaggio d\'errore', aperti);
  const riga = (await leggi('online_users', `id=eq.${q(A.sid)}&select=last_seen`))[0];
  check(!!riga, 'la presenza di chi ha invitato è rimasta (come un telefono posato)', riga);
  await pausa(45000);   // oltre i 35 s del controllo sul last_seen
  check(await B.page.locator('[data-test="attesa-invitante"]').isVisible(),
    'una presenza vista prima dell\'accettazione non chiude l\'attesa: dopo 45 s è ancora in attesa');
  const pA = await A.ctx.newPage();   // chi ha invitato arriva davvero (rientro all'avvio)
  await pA.goto(APP_URL);
  await pA.locator('[data-test="partner-nome"]').filter({ hasText: B.nick }).waitFor({ timeout: 25000 });
  await B.page.locator('[data-test="attesa-invitante"]').waitFor({ state: 'detached', timeout: 15000 });
  check(await B.page.locator('[data-test="partner-nome"]').isVisible(), 'quando arriva davvero l\'attesa finisce e il training resta');
});

// Ruling m9 (prove poco costose): la campanella segue il server e chi invita legge «scaduto».
// «Annullato» non ha una prova UI qui: chi riceve vede solo sparire il banner, e il messaggio
// compare solo se tocca «Accetta» nei ≤4 s fra il ritiro e il giro successivo (corsa).
scenario('campanella_e_scaduto', async (browser) => {
  const A = await entra(browser, 'A8');
  const B = await entra(browser, 'B8');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await B.page.locator('.invite-toast').waitFor({ timeout: 15000 });
  // Il banner d'invito sta sopra la campanella (stesso angolo): il clic si consegna all'elemento.
  await B.page.locator('button[aria-label="Notifications"], button[aria-label="Notifiche"]').first().dispatchEvent('click');
  const riga = B.page.locator('[data-test="notifica"]').filter({ hasText: A.nick });
  await riga.waitFor({ timeout: 20000 });
  check(await riga.locator('button').filter({ hasText: 'Vai' }).count() === 1, 'invito aperto sul server: la campanella mostra «Vai»');
  await sposta('telepathy_invites', `id=eq.${inv.id}`, { expires_at: faSecondi(1) });
  await A.page.locator('[data-test="avviso-inviti"]').filter({ hasText: /scaduto|expired/ }).waitFor({ timeout: 10000 });
  ok('chi invita legge «L\'invito è scaduto»');
  await riga.locator('button').filter({ hasText: 'OK' }).waitFor({ timeout: 15000 });
  check(/scaduto|expired/i.test(await riga.innerText()), 'scaduto sul server: la stessa notifica diventa «Scaduto» con «OK» (niente soglia dei 120 s)', await riga.innerText());
  await riga.locator('button').filter({ hasText: 'OK' }).dispatchEvent('click');
  await pausa(1000);
  check(await B.page.locator('.invite-toast').count() === 0, 'toccarla la chiude soltanto: nessun banner d\'invito');
});

// ════ Task 21: ?invito= e blocco ═══════════════════════════════════════════
// Il server locale `serve` risponde a app.html?… con un 301 verso /app che PERDE la query: con
// APP_URL ?invito= non arriverebbe mai all'app (e «si toglie dall'indirizzo» passerebbe per
// costruzione). /app è la stessa pagina, come in test-rituali-ricorrenti-ui.js per ?ritual=.
const APP_NOTIFICA = 'http://localhost:4321/app';
scenario('apri_da_notifica', async (browser) => {
  const A = await entra(browser, 'A7');
  const B = await entra(browser, 'B7');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await B.page.goto(`${APP_NOTIFICA}?invito=${inv.id}`);
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').waitFor({ timeout: 15000 });
  check(!(await B.page.evaluate(() => location.search)).includes('invito'), '?invito= si toglie subito dall\'indirizzo e apre l\'invito');
  // Il tocco con l'app aperta: il service worker manda «apri-invito» e aspetta la conferma.
  const conferma = await B.page.evaluate(async (id) => {
    const canale = new MessageChannel();
    const risposta = new Promise((r) => { canale.port1.onmessage = (e) => r(e.data); setTimeout(() => r(null), 1500); });
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'apri-invito', invito: id, azione: 'blocca' }, ports: [canale.port2] }));
    return risposta;
  }, inv.id);
  check(!!conferma && conferma.ok === true, 'l\'app conferma al service worker di aver ricevuto l\'invito', conferma);
  await B.page.locator('[data-test="conferma-blocco"]').waitFor({ timeout: 10000 });
  await B.page.locator('[data-test="btn-conferma-blocco"]').click();
  const blocco = await attendi(async () => (await leggi('telepathy_invite_blocks', `blocker_session=eq.${q(B.sid)}&blocked_session=eq.${q(A.sid)}&select=created_at`))[0]);
  check(!!blocco, 'azione «blocca»: dopo la conferma il blocco è sul server', blocco);
  const st = (await leggi('telepathy_invites', `id=eq.${inv.id}&select=status`))[0];
  check(!!st && st.status === 'declined', 'e l\'invito aperto si chiude come rifiutato', st);
  await B.page.goto(`${APP_NOTIFICA}?invito=00000000-0000-4000-8000-000000000000`);
  await B.page.locator('[data-test="avviso-inviti"]').filter({ hasText: /non trovato|not found/ }).waitFor({ timeout: 15000 });
  ok('un invito che non è mio (o di un\'identità persa): «Invito non trovato su questo dispositivo»');
});

// Plan Review Focus #4: la notifica aperta in un browser che non ha l'identità del destinatario
// (altro browser, dati cancellati). Si entra come ospite partendo dall'indirizzo della notifica:
// l'invito resta in attesa dell'identità e poi si legge «non trovato», mai una schermata vuota.
// Più l'apertura senza «blocca» con l'app aperta, e il «blocca» dall'indirizzo con «Annulla».
scenario('apri_senza_identita', async (browser) => {
  const A = await entra(browser, 'A10');
  const B = await entra(browser, 'B10');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  // B è online: l'invito durerebbe 45 s, meno di questo scenario. Si allunga sul server.
  await sposta('telepathy_invites', `id=eq.${inv.id}`, { expires_at: faSecondi(-600) });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const C = { ctx, page, nick: nick('C10') };
  tutte.push(C); attive.push(C);
  await loginAsGuest(page, C.nick, { appUrl: `${APP_NOTIFICA}?invito=${inv.id}&azione=blocca` });
  C.sid = await page.evaluate(() => localStorage.getItem('ga_session_id'));
  await page.locator('[data-test="avviso-inviti"]').filter({ hasText: /non trovato|not found/ }).waitFor({ timeout: 15000 });
  check(await page.locator('[data-test="conferma-blocco"]').count() === 0, 'browser senza l\'identità: dopo l\'entrata come ospite «non trovato», nessuna conferma di blocco');
  // B: «apri-invito» senza azione con l'app aperta → conferma sulla porta, nessuna ricarica, banner.
  await B.page.evaluate(() => { window.__nonRicaricata = true; });
  const conferma = await B.page.evaluate(async (id) => {
    const canale = new MessageChannel();
    const risposta = new Promise((r) => { canale.port1.onmessage = (e) => r(e.data); setTimeout(() => r(null), 1500); });
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'apri-invito', invito: id, azione: null }, ports: [canale.port2] }));
    return risposta;
  }, inv.id);
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').waitFor({ timeout: 15000 });
  check(!!conferma && conferma.ok === true && await B.page.evaluate(() => window.__nonRicaricata === true),
    'tocco senza «blocca» con l\'app aperta: conferma, nessuna ricarica, banner con «Accetta»', conferma);
  await B.page.goto(`${APP_NOTIFICA}?invito=${inv.id}&azione=blocca`);
  await B.page.locator('[data-test="conferma-blocco"]').waitFor({ timeout: 15000 });
  check(!(await B.page.evaluate(() => location.search)).includes('azione'), '?invito=…&azione=blocca: conferma del blocco, indirizzo ripulito');
  await B.page.locator('[data-test="btn-annulla-blocco"]').click();
  await pausa(1500);
  const blocchi = await leggi('telepathy_invite_blocks', `blocker_session=eq.${q(B.sid)}&select=created_at`);
  const st = (await leggi('telepathy_invites', `id=eq.${inv.id}&select=status`))[0];
  check(blocchi.length === 0 && !!st && st.status === 'pending', '«Annulla» non blocca e l\'invito resta aperto', { blocchi, st });
  // Dal banner: «Non voglio più inviti da questa persona» → conferma → blocco, banner chiuso.
  await B.page.locator('.invite-toast [data-test="btn-blocca-da-invito"]').click();
  await B.page.locator('[data-test="btn-conferma-blocco"]').click();
  await B.page.locator('[data-test="avviso-inviti"]').filter({ hasText: /Non riceverai più|no longer receive/ }).waitFor({ timeout: 10000 });
  const bl = await attendi(async () => (await leggi('telepathy_invite_blocks', `blocker_session=eq.${q(B.sid)}&blocked_session=eq.${q(A.sid)}&select=created_at`))[0]);
  check(!!bl && await B.page.locator('.invite-toast').count() === 0, 'dal banner: conferma, blocco sul server, banner chiuso', bl);
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
