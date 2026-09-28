/**
 * Test Reset Password — verifica il flow "Set new password" con token creato dal server.
 *
 * Strategia: bypassa l'invio email reale creando il token con la RPC di servizio
 * `crea_token_account` (come fa davvero l'Edge Function `send-account-email`) e navigando
 * alla URL ?reset=TOKEN come farebbe l'utente cliccando il link email. Dopo il reset,
 * verifica il login via UI con la password nuova.
 *
 * Esecuzione: node test-reset-password-bug.js
 * Prerequisito: server statico attivo su http://localhost:4321
 */

const { chromium } = require('playwright');
const crypto = require('crypto');
const { requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount } = require('./test-helpers');
requireServiceKey();

const APP_URL = 'http://localhost:4321/app.html';
const TIMEOUT = 20000;

const TS    = Date.now();
const NICK  = `ResetBug_${TS}`;
const EMAIL = `resetbug_${TS}@test.ga`;
const PW1   = 'Vecchia123!';
const PW2   = 'NuovaPassword456!';

// Stessa derivazione di deriveStrongHash in src/app.jsx (vedi test-account-rpc.js).
function pbkdf2Hash(password, saltB64 = crypto.randomBytes(16).toString('base64'), iter = 100000) {
  const bits = crypto.pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), iter, 32, 'sha256');
  return `pbkdf2$${iter}$${saltB64}$${bits.toString('base64')}`;
}

let passed = 0, failed = 0;
const pass = m => { console.log(`  PASS  ${m}`); passed++; };
const fail = m => { console.log(`  FAIL  ${m}`); failed++; process.exitCode = 1; };
const log  = m => console.log(`[${new Date().toLocaleTimeString('it-IT')}] ${m}`);

async function cleanup() {
  try {
    await deleteTestAccount(EMAIL); // cancella profilo + password_resets (+ magic_links ecc.)
  } catch (e) { console.warn('cleanup warn:', e.message); }
}

(async () => {
  console.log('\n==================================================');
  console.log('  TEST RESET PASSWORD BUG FIX (token dal server)');
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
    // Step 1 — Crea l'account di test (con una password iniziale qualsiasi)
    console.log('Step 1: crea account di test');
    await createTestAccount({
      session_id: `resetbug-${TS}`,
      nickname: NICK,
      email: EMAIL,
      password_hash: pbkdf2Hash(PW1),
    });
    pass('account creato');

    // Step 2 — Genera il token reset con la RPC di servizio (come fa davvero l'Edge Function)
    console.log('\nStep 2: genera token reset con crea_token_account');
    const tokenRes = await serviceFetch('rpc/crea_token_account', {
      method: 'POST',
      body: JSON.stringify({ p_tipo: 'reset', p_email: EMAIL }),
    });
    token = tokenRes.body;
    if (typeof token !== 'string' || token.length < 20) {
      fail(`crea_token_account non ha restituito un token valido: ${JSON.stringify(tokenRes)}`);
      throw new Error('cannot proceed');
    }
    pass(`token creato: ${token.slice(0, 8)}...`);

    // Step 3 — Naviga a ?reset=TOKEN come dal link email
    console.log('\nStep 3: Naviga a URL con ?reset=TOKEN');
    // serve fa redirect /app.html → /app perdendo la query string, quindi usiamo direttamente /app
    const RESET_URL = APP_URL.replace(/\.html$/, '') + `?reset=${token}`;
    await page.goto(RESET_URL);
    await page.waitForTimeout(800);

    // Step 4 — Bug 1: solo il form "Set new password" deve essere visibile, no Guest/Login/Register tabs
    console.log('\nStep 4 (Bug 1): tabs Guest/Login/Register non devono essere visibili');
    const tabsVisible = await page.locator('button:has-text("Guest"), button:has-text("Ospite")').count();
    if (tabsVisible === 0) {
      pass('tab Guest non visibile (corretto)');
    } else {
      fail(`tab Guest ancora visibile (count=${tabsVisible}) — bug 1 NON fixato`);
    }

    const enterAsGuestBtn = await page.locator('button:has-text("Enter as Guest"), button:has-text("Entra come ospite")').count();
    if (enterAsGuestBtn === 0) {
      pass('bottone "Enter as Guest" non visibile (corretto)');
    } else {
      fail(`bottone "Enter as Guest" ancora visibile (count=${enterAsGuestBtn}) — bug 1 NON fixato`);
    }

    const setNewPwTitle = await page.locator('p:has-text("Set new password"), p:has-text("Imposta nuova password")').count();
    if (setNewPwTitle > 0) {
      pass('titolo "Set new password" visibile');
    } else {
      fail('titolo "Set new password" non visibile');
    }

    // Step 5 — Bug 2: inserisci nuova password e clicca "Set new password"
    console.log('\nStep 5 (Bug 2): inserisci nuova password e submit');
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill(PW2);
    await pwInputs.nth(1).fill(PW2);
    await page.locator('button:has-text("Set new password"), button:has-text("Imposta nuova password")').last().click();

    // Aspetta messaggio di successo OPPURE errore esplicito
    let successSeen = false, errorSeen = false, errorText = '';
    try {
      await page.locator('p').filter({ hasText: /aggiornata|updated/i }).waitFor({ timeout: 8000 });
      successSeen = true;
    } catch {
      const errLoc = page.locator('p[style*="fb923c"]');
      if (await errLoc.count() > 0) {
        errorText = (await errLoc.first().textContent()) || '';
        errorSeen = true;
      }
    }

    if (successSeen) {
      pass('messaggio di successo "password aggiornata" visibile — bug 2 FIXATO');
    } else if (errorSeen) {
      fail(`messaggio di errore mostrato: "${errorText}" — bug 2 sblocca la silent failure ma update fallisce`);
    } else {
      fail('NESSUN messaggio (successo o errore) — bug 2 NON fixato (silent failure persiste)');
    }

    // Step 6 — Verifica che il token sia stato cancellato dal DB
    console.log('\nStep 6: verifica token cancellato da password_resets');
    const checkToken = await serviceFetch(`password_resets?token=eq.${token}&select=email`);
    if (checkToken.status >= 200 && checkToken.status < 300 && Array.isArray(checkToken.body) && checkToken.body.length === 0) {
      pass('token rimosso da password_resets dopo il reset');
    } else {
      fail(`token ancora presente: ${JSON.stringify(checkToken.body)}`);
    }

    // Step 7 — Verifica che la password sia stata effettivamente cambiata, via login UI
    console.log('\nStep 7: verifica login con nuova password');
    await page.waitForTimeout(3000);  // Aspetta redirect a login (2.5s in code)
    const loginTab = page.locator('button:has-text("Login"), button:has-text("Accedi")').first();
    if (await loginTab.count() > 0) await loginTab.click();
    await page.waitForTimeout(500);
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(EMAIL);
      await page.locator('input[type="password"]').first().fill(PW2);
      await page.locator('button:has-text("Login"), button:has-text("Accedi")').last().click();
      try {
        await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
        pass('login con nuova password riuscito');
      } catch {
        fail('login con nuova password FALLITO — l\'UPDATE su profiles non è andato a buon fine');
      }
    } else {
      fail('input email non trovato dopo reset — UI non è tornata al login');
    }

    // Step 8 — Console errors check
    console.log('\nStep 8: verifica nessun errore JS in console (es. "single is not a function")');
    const singleErr = consoleErrors.find(e => /single.*is not a function/i.test(e));
    if (singleErr) {
      fail(`TypeError ".single is not a function" rilevato: ${singleErr}`);
    } else {
      pass('nessun TypeError ".single is not a function"');
    }

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
