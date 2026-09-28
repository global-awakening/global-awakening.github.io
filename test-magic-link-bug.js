/**
 * Test Magic Link — verifica il flow di login via ?magic=TOKEN (token creato dal server).
 *
 * Strategia: bypassa l'invio email reale creando il token con la RPC di servizio
 * `crea_token_account` (come fa davvero l'Edge Function `send-account-email`) e navigando
 * a /app?magic=TOKEN come farebbe l'utente cliccando il link email.
 * Isola la fase "click + login automatico" dalla fase "invio email".
 *
 * L'account di test è creato SENZA password_hash: verifica che il login col link crei e
 * salvi una credenziale casuale (26_) — senza, messaggi e profilo resterebbero chiusi a chi
 * è entrato col link.
 *
 * Esecuzione: node test-magic-link-bug.js
 * Prerequisito: server statico su http://localhost:4321
 */

const { chromium } = require('playwright');
const { requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount } = require('./test-helpers');
requireServiceKey();

const APP_URL = 'http://localhost:4321/app';  // /app per evitare il redirect 301 di `serve`
const TIMEOUT = 20000;

const TS    = Date.now();
const NICK  = `MagicBug_${TS}`;
const EMAIL = `magicbug_${TS}@test.ga`;

let passed = 0, failed = 0;
const pass = m => { console.log(`  PASS  ${m}`); passed++; };
const fail = m => { console.log(`  FAIL  ${m}`); failed++; process.exitCode = 1; };
const log  = m => console.log(`[${new Date().toLocaleTimeString('it-IT')}] ${m}`);

async function cleanup() {
  try {
    await deleteTestAccount(EMAIL); // cancella profilo + magic_links (+ password_resets ecc.)
  } catch (e) { console.warn('cleanup warn:', e.message); }
}

(async () => {
  console.log('\n==================================================');
  console.log('  TEST MAGIC LINK — flow ?magic=TOKEN (token dal server)');
  console.log(`  Utente: ${NICK} / ${EMAIL}`);
  console.log('==================================================\n');

  await cleanup();

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      log(`[console error] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    log(`[page error] ${err.message}`);
  });

  let token = null;

  try {
    // Step 1 — Crea l'account di test SENZA password_hash (via ruolo di servizio)
    console.log('Step 1: crea account di test senza password_hash');
    await createTestAccount({
      session_id: `magicbug-${TS}`,
      nickname: NICK,
      email: EMAIL,
      password_hash: null,
    });
    pass('account creato senza password_hash');

    // Step 2 — Genera il token magic con la RPC di servizio (come fa davvero l'Edge Function)
    console.log('\nStep 2: genera token magic con crea_token_account');
    const tokenRes = await serviceFetch('rpc/crea_token_account', {
      method: 'POST',
      body: JSON.stringify({ p_tipo: 'magic', p_email: EMAIL }),
    });
    token = tokenRes.body;
    if (typeof token !== 'string' || token.length < 20) {
      fail(`crea_token_account non ha restituito un token valido: ${JSON.stringify(tokenRes)}`);
      throw new Error('cannot proceed');
    }
    pass(`token creato: ${token.slice(0, 8)}...`);

    // Step 3 — Naviga a ?magic=TOKEN come dal link email
    console.log('\nStep 3: Naviga a URL con ?magic=TOKEN');
    await page.goto(`${APP_URL}?magic=${token}`);

    // Step 4 — Atteso: login automatico → bottone Logout visibile
    console.log('\nStep 4: verifica login automatico');
    try {
      await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
      pass('login automatico riuscito (bottone Logout visibile)');
    } catch {
      const errLoc = page.locator('p[style*="fb923c"]');
      let errTxt = '';
      if (await errLoc.count() > 0) errTxt = (await errLoc.first().textContent()) || '';
      fail(`login automatico fallito. Errore visibile: "${errTxt}"`);
    }

    // Step 5 — L'account non aveva password_hash: verifica che il login abbia creato e
    // salvato in localStorage una credenziale pbkdf2$ (26_: account senza hash → hash casuale)
    console.log('\nStep 5: verifica credenziale pbkdf2$ salvata in localStorage');
    const pwHash = await page.evaluate(() => localStorage.getItem('ga_pwhash'));
    if (typeof pwHash === 'string' && pwHash.startsWith('pbkdf2$')) {
      pass(`ga_pwhash valorizzato correttamente: ${pwHash.slice(0, 16)}...`);
    } else {
      fail(`ga_pwhash non è un hash pbkdf2$ valido: ${JSON.stringify(pwHash)}`);
    }

    // Step 6 — Verifica che il token sia stato consumato (cancellato dal DB)
    console.log('\nStep 6: verifica token consumato');
    const checkToken = await serviceFetch(`magic_links?token=eq.${token}&select=email`);
    if (checkToken.status >= 200 && checkToken.status < 300 && Array.isArray(checkToken.body) && checkToken.body.length === 0) {
      pass('token rimosso da magic_links dopo il login');
    } else {
      fail(`token ancora presente: ${JSON.stringify(checkToken.body)}`);
    }

    // Step 7 — Riapertura dello STESSO link in una seconda pagina → deve essere rifiutato.
    // Contesto browser NUOVO (non la stessa `ctx`): la sessione vive in localStorage, che è
    // condiviso fra le pagine dello stesso contesto — riusare `ctx` mostrerebbe l'utente già
    // loggato dal primo click invece di far consumare di nuovo il token al link.
    console.log('\nStep 7: riapertura dello stesso link (uso singolo), da un browser "diverso"');
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(`${APP_URL}?magic=${token}`);
    try {
      await page2.waitForSelector('text=/invalid or expired|non valido o scaduto/i', { timeout: TIMEOUT });
      pass('secondo utilizzo dello stesso link rifiutato (token_non_valido)');
    } catch {
      fail('secondo utilizzo dello stesso link NON rifiutato — messaggio di errore non mostrato');
    }
    await ctx2.close();

    // Step 8 — Console errors
    console.log('\nStep 8: verifica nessun errore JS in console');
    const fatal = consoleErrors.find(e => /TypeError|is not a function|Uncaught/i.test(e));
    if (fatal) fail(`errore JS: ${fatal}`);
    else pass('nessun errore JS critico');

  } catch (err) {
    fail(`errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    console.log('\n  (cleanup profilo + token...)');
    await cleanup();
    console.log('\n==================================================');
    const tot = passed + failed;
    console.log(`  ${passed}/${tot} test passati`);
    console.log(process.exitCode === 1 ? '  RISULTATO: FALLITO' : '  RISULTATO: PASSATO');
    console.log('==================================================\n');
    await browser.close();
  }
})();
