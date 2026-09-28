/**
 * Test Reset Password — Global Awakening (flow "password lato server", Task 7)
 *
 * Il token e l'invio email sono ora fatti dal server (Edge Function send-account-email +
 * RPC reset_password/crea_token_account, Task 5/3). Questo test copre lo schermo "password
 * dimenticata" lato client:
 *
 *   1. Con un'email NON registrata mostra lo stesso messaggio di successo di una registrata
 *      (non deve rivelare chi è iscritto).
 *   2. Intercettando `**\/functions/v1/send-account-email` (senza chiamare la funzione vera)
 *      verifica che la richiesta parta con body {tipo:'reset', email} corretto.
 *   3. Nessuna chiamata a api.emailjs.com deve partire (l'invio è tutto lato server).
 *
 * Il flow "clic sul link → nuova password" è coperto da test-reset-password-bug.js (token
 * vero via crea_token_account). Qui l'Edge Function è intercettata: non viene mai chiamata
 * davvero, quindi non consuma i tetti email (1/min, 5/ora, 30/ora globali).
 *
 * Esecuzione: node test-reset-password.js
 * Prerequisiti: app su http://localhost:4321/app.html, npx playwright install chromium
 */

const { chromium } = require('playwright');
const crypto = require('crypto');
const { requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount } = require('./test-helpers');
requireServiceKey();

const APP_URL = 'http://localhost:4321/app.html';
const TIMEOUT = 20000;

const TS                = Date.now();
const NICK              = `ResetUser_${TS}`;
const EMAIL_REGISTERED  = `reset_${TS}@test.ga`;
const EMAIL_UNREGISTERED = `reset-unreg_${TS}@test.ga`;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; process.exitCode = 1; }
function log(msg) {
  const ts = new Date().toLocaleTimeString('it-IT');
  console.log(`[${ts}] ${msg}`);
}

function pbkdf2Hash(password, saltB64 = crypto.randomBytes(16).toString('base64'), iter = 100000) {
  const bits = crypto.pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), iter, 32, 'sha256');
  return `pbkdf2$${iter}$${saltB64}$${bits.toString('base64')}`;
}

async function cleanup() {
  try {
    await deleteTestAccount(EMAIL_REGISTERED);
    await deleteTestAccount(EMAIL_UNREGISTERED);
  } catch (e) {
    console.warn('  Cleanup parzialmente fallito:', e.message);
  }
}

// Attende che l'array `arr` raggiunga almeno `n` elementi (poll), senza affidarsi ai tempi di
// un messaggio UI che potrebbe restare visibile da una submit precedente.
async function waitForLength(arr, n, timeout = TIMEOUT) {
  const start = Date.now();
  while (arr.length < n) {
    if (Date.now() - start > timeout) {
      throw new Error(`timeout: atteso ${n} elementi, arrivati ${arr.length}`);
    }
    await new Promise(r => setTimeout(r, 50));
  }
}

(async () => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  TEST RESET PASSWORD — Global Awakening');
  console.log(`  Registrato: ${EMAIL_REGISTERED} — non registrato: ${EMAIL_UNREGISTERED}`);
  console.log('══════════════════════════════════════════════════\n');

  await cleanup();
  await createTestAccount({
    session_id: `reset-${TS}`,
    nickname: NICK,
    email: EMAIL_REGISTERED,
    password_hash: pbkdf2Hash('Password123!'),
  });

  const browser = await chromium.launch({ headless: true });
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error') log(`browser error: ${msg.text()}`); });

  // Intercetta la vera chiamata alla Edge Function: non deve mai partire davvero.
  const funzioneChiamate = [];
  await page.route('**/functions/v1/send-account-email', async route => {
    let body = null;
    try { body = route.request().postDataJSON(); } catch { body = null; }
    funzioneChiamate.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Nessuna richiesta deve mai partire verso EmailJS: l'invio è tutto lato server ora.
  const emailjsRichieste = [];
  page.on('request', req => {
    if (/api\.emailjs\.com/.test(req.url())) emailjsRichieste.push(req.url());
  });

  try {
    // ── Step 1: apre l'app e va al form "password dimenticata" ───────────────
    console.log('📋 Step 1: apertura form "Password dimenticata?"');
    await page.goto(APP_URL);
    await page.waitForSelector('button:has-text("Accedi"), button:has-text("Login")', { timeout: TIMEOUT });
    await page.locator('button:has-text("Accedi"), button:has-text("Login")').first().click();
    const forgotLink = page.locator('p').filter({ hasText: /Password dimenticata|Forgot password/ });
    await forgotLink.waitFor({ timeout: TIMEOUT });
    await forgotLink.click();
    const resetTitle = await page.locator('p').filter({ hasText: /Reimposta Password|Reset Password/ }).count();
    if (resetTitle > 0) {
      pass('Form "Password dimenticata" aperto');
    } else {
      fail('Form reset non visibile');
    }

    // ── Step 2: email NON registrata → messaggio di successo generico ────────
    console.log('\n📋 Step 2: email NON registrata → stesso messaggio di successo');
    await page.locator('input[type="email"]').first().fill(EMAIL_UNREGISTERED);
    await page.locator('button').filter({ hasText: /Reimposta|Reset Password/ }).click();

    await waitForLength(funzioneChiamate, 1);
    const successMsg = page.locator('text=/If the address is registered|Se l\'indirizzo è registrato/');
    try {
      await successMsg.waitFor({ timeout: TIMEOUT });
      pass('Messaggio "se l\'indirizzo è registrato" mostrato per email NON registrata');
    } catch {
      fail('Messaggio generico NON mostrato per email non registrata');
    }
    const call1 = funzioneChiamate[0];
    if (call1 && call1.tipo === 'reset' && call1.email === EMAIL_UNREGISTERED) {
      pass(`Richiesta a send-account-email corretta per email non registrata: ${JSON.stringify(call1)}`);
    } else {
      fail(`Body della richiesta inatteso: ${JSON.stringify(call1)}`);
    }

    // ── Step 3: email REGISTRATA → stesso messaggio di successo (nessuna differenza) ──
    console.log('\n📋 Step 3: email registrata → stesso messaggio di successo');
    await page.locator('input[type="email"]').first().fill(EMAIL_REGISTERED);
    await page.locator('button').filter({ hasText: /Reimposta|Reset Password/ }).click();

    await waitForLength(funzioneChiamate, 2);
    try {
      await page.locator('text=/If the address is registered|Se l\'indirizzo è registrato/').first().waitFor({ timeout: TIMEOUT });
      pass('Messaggio "se l\'indirizzo è registrato" mostrato anche per email registrata (identico)');
    } catch {
      fail('Messaggio generico NON mostrato per email registrata');
    }
    const call2 = funzioneChiamate[1];
    if (call2 && call2.tipo === 'reset' && call2.email === EMAIL_REGISTERED) {
      pass(`Richiesta a send-account-email corretta per email registrata: ${JSON.stringify(call2)}`);
    } else {
      fail(`Body della richiesta inatteso: ${JSON.stringify(call2)}`);
    }

    // ── Step 4: la Edge Function vera non è mai stata chiamata (era intercettata) ──
    console.log('\n📋 Step 4: verifica che non ci siano state chiamate extra o a EmailJS');
    if (funzioneChiamate.length === 2) {
      pass('Esattamente 2 richieste a send-account-email (una per submit)');
    } else {
      fail(`Numero di richieste inatteso: ${funzioneChiamate.length}`);
    }
    if (emailjsRichieste.length === 0) {
      pass('Nessuna richiesta a api.emailjs.com (invio interamente lato server)');
    } else {
      fail(`Richieste inattese a EmailJS: ${JSON.stringify(emailjsRichieste)}`);
    }

  } catch (err) {
    fail(`Errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    console.log('\n  (Pulizia profili test da Supabase...)');
    await cleanup();

    console.log('\n══════════════════════════════════════════════════');
    const totale = passed + failed;
    console.log(`  ${passed}/${totale} test passati`);
    console.log(process.exitCode === 1
      ? '  RISULTATO: ❌ FALLITO'
      : '  RISULTATO: ✅ PASSATO');
    console.log('══════════════════════════════════════════════════\n');

    await browser.close();
  }
})();
