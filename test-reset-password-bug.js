/**
 * Test Reset Password — verifica fix bug UI + bug "Set new password" non funziona
 *
 * Strategia: bypassa l'invio email reale generando il token direttamente in Supabase
 * e navigando alla URL ?reset=TOKEN come farebbe l'utente cliccando il link email.
 *
 * Esecuzione: node test-reset-password-bug.js
 * Prerequisito: server statico attivo su http://localhost:4321
 */

const { chromium } = require('playwright');
const crypto = require('crypto');

const APP_URL      = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT      = 20000;

const TS    = Date.now();
const NICK  = `ResetBug_${TS}`;
const EMAIL = `resetbug_${TS}@test.ga`;
const PW1   = 'Vecchia123!';
const PW2   = 'NuovaPassword456!';

let passed = 0, failed = 0;
const pass = m => { console.log(`  PASS  ${m}`); passed++; };
const fail = m => { console.log(`  FAIL  ${m}`); failed++; process.exitCode = 1; };
const log  = m => console.log(`[${new Date().toLocaleTimeString('it-IT')}] ${m}`);

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...opts.headers,
    },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function cleanup() {
  try {
    await sb(`profiles?email=eq.${encodeURIComponent(EMAIL)}`, { method: 'DELETE' });
    await sb(`password_resets?email=eq.${encodeURIComponent(EMAIL)}`, { method: 'DELETE' });
  } catch (e) { console.warn('cleanup warn:', e.message); }
}

(async () => {
  console.log('\n==================================================');
  console.log('  TEST RESET PASSWORD BUG FIX');
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

  try {
    // Step 1 — Registrazione
    console.log('Step 1: Registrazione utente');
    await page.goto(APP_URL);
    await page.waitForSelector('button:has-text("Register"), button:has-text("Registrati")', { timeout: TIMEOUT });
    await page.locator('button:has-text("Register"), button:has-text("Registrati")').first().click();
    await page.locator('input[placeholder*="username" i]').first().fill(NICK);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PW1);
    await page.locator('button:has-text("Register"), button:has-text("Registrati")').last().click();
    await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
    pass('registrazione completata');

    // Step 2 — Logout
    console.log('\nStep 2: Logout');
    await page.locator('button:has-text("Logout"), button:has-text("Esci")').click();
    await page.locator('.modal-content button.btn-primary').click({ timeout: TIMEOUT });
    await page.waitForSelector('button:has-text("Guest"), button:has-text("Ospite")', { timeout: TIMEOUT });
    pass('logout completato');

    // Step 3 — Inietta token reset direttamente in Supabase (simula click sul link email)
    console.log('\nStep 3: Inietta token reset in Supabase');
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const ins = await sb('password_resets', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, token, expires_at: expiresAt }),
    });
    if (!ins.ok) {
      fail(`insert password_resets fallita: ${ins.status} ${JSON.stringify(ins.data)}`);
      throw new Error('cannot proceed');
    }
    pass(`token creato: ${token.slice(0, 8)}...`);

    // Step 4 — Naviga a ?reset=TOKEN come dal link email
    console.log('\nStep 4: Naviga a URL con ?reset=TOKEN');
    // serve fa redirect /app.html → /app perdendo la query string, quindi usiamo direttamente /app
    const RESET_URL = APP_URL.replace(/\.html$/, '') + `?reset=${token}`;
    await page.goto(RESET_URL);
    await page.waitForTimeout(800);

    // Step 5 — Bug 1: solo il form "Set new password" deve essere visibile, no Guest/Login/Register tabs
    console.log('\nStep 5 (Bug 1): tabs Guest/Login/Register non devono essere visibili');
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

    // Step 6 — Bug 2: inserisci nuova password e clicca "Set new password"
    console.log('\nStep 6 (Bug 2): inserisci nuova password e submit');
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

    // Step 7 — Verifica che il token sia stato cancellato dal DB
    console.log('\nStep 7: verifica token cancellato da password_resets');
    const checkToken = await sb(`password_resets?token=eq.${token}&select=email`);
    if (checkToken.ok && Array.isArray(checkToken.data) && checkToken.data.length === 0) {
      pass('token rimosso da password_resets dopo il reset');
    } else {
      fail(`token ancora presente: ${JSON.stringify(checkToken.data)}`);
    }

    // Step 8 — Verifica che la password sia stata effettivamente cambiata
    console.log('\nStep 8: verifica login con nuova password');
    await page.waitForTimeout(3000);  // Aspetta redirect a login (2.5s in code)
    // Possiamo essere già sul tab login o no
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

    // Step 9 — Console errors check
    console.log('\nStep 9: verifica nessun errore JS in console (es. "single is not a function")');
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
