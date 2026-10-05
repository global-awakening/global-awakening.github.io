/**
 * Test della chiave scaduta — Global Awakening
 *
 * Chi era dentro prima della 27b_ ha in memoria una credenziale che il server non riconosce più.
 * L'app deve accorgersene da sola all'apertura e portare al login col riquadro del link già
 * pronto, e NON deve far uscire nessuno per sbaglio: chiave buona, ospite, rete giù, una chiamata
 * rifiutata mentre la chiave è buona, accesso col link con in memoria la chiave di un altro.
 *
 * Prerequisiti: server `npx serve -l 4321 .` (verificare «Accepting connections at
 * http://localhost:4321»), SUPABASE_SERVICE_KEY in .env.test.
 */
const { chromium } = require('playwright');
const { requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount } = require('./test-helpers');
requireServiceKey();

const APP_URL = 'http://localhost:4321/app.html';
const TS = Date.now();
const EMAIL = `chiave_${TS}@test.com`;
const NICK = `Chiave_${TS}`;
const SID = `chiave-${TS}`;
const HASH = 'pbkdf2$prova$' + TS;   // la credenziale «vera» dell'account di prova
const EMAIL_B = `chiaveb_${TS}@test.com`;
const NICK_B = `ChiaveB_${TS}`;
const SID_B = `chiaveb-${TS}`;

let passed = 0;
let failed = 0;
const pass = (m) => { console.log(`  ✅ ${m}`); passed++; };
const fail = (m) => { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; };

// Apre l'app come se il telefono avesse già in memoria questi dati.
async function apri(browser, memoria, { reteGiu = false, rifiutaMessaggi = false, url = APP_URL } = {}) {
  const ctx = await browser.newContext();
  await ctx.addInitScript((m) => {
    if (sessionStorage.getItem('__seminato')) return;   // solo al primo caricamento
    sessionStorage.setItem('__seminato', '1');
    for (const [k, v] of Object.entries(m)) localStorage.setItem(k, v);
  }, memoria);
  if (reteGiu) await ctx.route(/supabase\.co\/rest\/v1\/rpc\//, (r) => r.abort());
  // Un rifiuto «Auth failed» finto mentre la chiave è buona: come una chiamata partita con la
  // chiave di un attimo prima. La controprova deve accorgersene e non far uscire nessuno.
  if (rifiutaMessaggi) await ctx.route(/\/rpc\/get_my_messages/, (r) => r.fulfill({
    status: 400, contentType: 'application/json',
    body: JSON.stringify({ code: 'P0001', details: null, hint: null, message: 'Auth failed' }),
  }));
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
}
const registrato = (hash) => ({
  ga_nickname: NICK, ga_email: EMAIL, ga_session_id: SID, ga_is_guest: 'false',
  ...(hash === undefined ? {} : { ga_pwhash: hash }),
});
const sulLogin = (page) => page.locator('input[aria-label="Password"]').isVisible();

async function attendiLogin(page, ms) {
  try { await page.locator('input[aria-label="Password"]').waitFor({ state: 'visible', timeout: ms }); return true; }
  catch { return false; }
}

async function controllaRientro(page, nome) {
  if (!await attendiLogin(page, 15000)) return fail(`${nome}: resta dentro, il login non compare`);
  const corpo = await page.locator('body').innerText();
  if (!/sign in again|devi rientrare/i.test(corpo)) return fail(`${nome}: manca il messaggio «devi rientrare»`);
  const valori = await page.locator('input[type="email"]').evaluateAll((els) => els.map((e) => e.value));
  if (!valori.includes(EMAIL)) return fail(`${nome}: l'email non è già scritta nel riquadro del link (${JSON.stringify(valori)})`);
  const memoria = await page.evaluate(() => ({ pw: localStorage.getItem('ga_pwhash'), nick: localStorage.getItem('ga_nickname') }));
  if (memoria.pw || memoria.nick) return fail(`${nome}: la credenziale vecchia resta in memoria`);
  pass(`${nome}: esce, messaggio chiaro, riquadro del link con l'email già scritta`);
}

async function controllaDentro(page, nome, ms = 12000, nick = null) {
  await page.waitForTimeout(ms);
  if (await sulLogin(page)) return fail(`${nome}: è stato fatto uscire per sbaglio`);
  const dentro = await page.evaluate(() => localStorage.getItem('ga_nickname'));
  if (!dentro || (nick && dentro !== nick)) return fail(`${nome}: in memoria c'è «${dentro}» invece di «${nick || 'qualcuno'}»`);
  pass(`${nome}: resta dentro`);
}

(async () => {
  const browser = await chromium.launch();
  try {
    console.log('\n🔑 Chiave scaduta\n');
    await createTestAccount({ email: EMAIL, nickname: NICK, session_id: SID, password_hash: HASH });

    let p = await apri(browser, registrato('credenziale-vecchia-' + TS));
    await controllaRientro(p.page, 'chiave vecchia');
    await p.ctx.close();

    p = await apri(browser, registrato(undefined));
    await controllaRientro(p.page, 'iscritto senza credenziale in memoria');
    await p.ctx.close();

    p = await apri(browser, registrato(HASH));
    await controllaDentro(p.page, 'chiave buona', 12000, NICK);
    await p.ctx.close();

    p = await apri(browser, registrato('credenziale-vecchia-' + TS), { reteGiu: true });
    await controllaDentro(p.page, 'chiave vecchia ma rete giù (un errore di rete non fa uscire)', 12000, NICK);
    await p.ctx.close();

    p = await apri(browser, registrato(HASH), { rifiutaMessaggi: true });
    await controllaDentro(p.page, 'chiave buona ma una chiamata rifiutata (controprova)', 20000, NICK);
    await p.ctx.close();

    // Link via email aperto su un telefono che ha ancora la chiave vecchia di un ALTRO account
    // (iPhone: il link si apre in Safari, che ha la sua memoria). Si entra con l'account del link.
    await createTestAccount({ email: EMAIL_B, nickname: NICK_B, session_id: SID_B, password_hash: null });
    const tok = await serviceFetch('rpc/crea_token_account', { method: 'POST', body: JSON.stringify({ p_tipo: 'magic', p_email: EMAIL_B }) });
    // serve rimanda /app.html → /app perdendo la query: si va diretti su /app.
    p = await apri(browser, registrato('credenziale-vecchia-' + TS), { url: APP_URL.replace(/\.html$/, '') + '?magic=' + tok.body });
    await controllaDentro(p.page, 'link via email con la chiave vecchia di un altro account in memoria', 15000, NICK_B);
    await p.ctx.close();

    p = await apri(browser, { ga_nickname: `Ospite_${TS}`, ga_session_id: `ospite-${TS}`, ga_is_guest: 'true' });
    await controllaDentro(p.page, 'ospite');
    await p.ctx.close();
  } catch (e) {
    fail('errore: ' + e.message);
  } finally {
    await browser.close();
    await Promise.allSettled([deleteTestAccount(EMAIL), deleteTestAccount(EMAIL_B)]);
    for (const id of [SID, SID_B, `ospite-${TS}`]) {
      await serviceFetch(`online_users?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }
    console.log(`\n${passed} passati, ${failed} falliti`);
  }
})();
