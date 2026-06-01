/**
 * Test Magic Link — verifica il flow di login via ?magic=TOKEN.
 *
 * Strategia: bypassa l'invio email reale generando il token direttamente in Supabase
 * e navigando a /app?magic=TOKEN come farebbe l'utente cliccando il link email.
 * Isola la fase "click + login automatico" dalla fase "invio email" via EmailJS.
 *
 * Esecuzione: node test-magic-link-bug.js
 * Prerequisito: server statico su http://localhost:4321
 */

const { chromium } = require('playwright');
const crypto = require('crypto');

const APP_URL      = 'http://localhost:4321/app';  // /app per evitare il redirect 301 di `serve`
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT      = 20000;

const TS    = Date.now();
const NICK  = `MagicBug_${TS}`;
const EMAIL = `magicbug_${TS}@test.ga`;
const PW    = 'TestPassword123!';

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
    await sb(`magic_links?email=eq.${encodeURIComponent(EMAIL)}`, { method: 'DELETE' });
  } catch (e) { console.warn('cleanup warn:', e.message); }
}

(async () => {
  console.log('\n==================================================');
  console.log('  TEST MAGIC LINK — flow ?magic=TOKEN');
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
    // Step 1 — Registrazione (così l'email esiste in profiles)
    console.log('Step 1: Registrazione utente');
    await page.goto(APP_URL);
    await page.waitForSelector('button:has-text("Register"), button:has-text("Registrati")', { timeout: TIMEOUT });
    await page.locator('button:has-text("Register"), button:has-text("Registrati")').first().click();
    await page.locator('input[placeholder*="username" i]').first().fill(NICK);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PW);
    await page.locator('button:has-text("Register"), button:has-text("Registrati")').last().click();
    await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
    pass('registrazione completata');

    // Step 2 — Logout (così non c'è sessione attiva)
    console.log('\nStep 2: Logout');
    await page.locator('button:has-text("Logout"), button:has-text("Esci")').click();
    await page.locator('.modal-content button.btn-primary').click({ timeout: TIMEOUT });
    await page.waitForSelector('button:has-text("Guest"), button:has-text("Ospite")', { timeout: TIMEOUT });
    pass('logout completato');

    // Step 3 — Inietta token magic link in Supabase (simula il click sul link email)
    console.log('\nStep 3: Inietta token magic link');
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const ins = await sb('magic_links', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, token, expires_at: expiresAt }),
    });
    if (!ins.ok) {
      fail(`insert magic_links fallita: ${ins.status} ${JSON.stringify(ins.data)}`);
      throw new Error('cannot proceed');
    }
    pass(`token creato: ${token.slice(0, 8)}...`);

    // Step 4 — Naviga a ?magic=TOKEN come dal link email
    console.log('\nStep 4: Naviga a URL con ?magic=TOKEN');
    await page.goto(`${APP_URL}?magic=${token}`);

    // Step 5 — Atteso: login automatico → bottone Logout visibile
    console.log('\nStep 5: verifica login automatico');
    try {
      await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
      pass('login automatico riuscito (bottone Logout visibile)');
    } catch {
      // Cerco eventuale errore visibile per capire perché ha fallito
      const errLoc = page.locator('p[style*="fb923c"]');
      let errTxt = '';
      if (await errLoc.count() > 0) errTxt = (await errLoc.first().textContent()) || '';
      fail(`login automatico fallito. Errore visibile: "${errTxt}"`);
    }

    // Step 6 — Verifica che il token sia stato consumato (cancellato dal DB)
    console.log('\nStep 6: verifica token consumato');
    const checkToken = await sb(`magic_links?token=eq.${token}&select=email`);
    if (checkToken.ok && Array.isArray(checkToken.data) && checkToken.data.length === 0) {
      pass('token rimosso da magic_links dopo il login');
    } else {
      fail(`token ancora presente: ${JSON.stringify(checkToken.data)}`);
    }

    // Step 7 — Console errors
    console.log('\nStep 7: verifica nessun errore JS in console');
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
