/**
 * Test automatico di Registrazione e Login — Global Awakening
 *
 * Esecuzione:
 *   node test-auth.js
 *
 * Prerequisiti:
 *   - App in esecuzione su http://localhost:4321/app.html
 *   - npx playwright install chromium
 */

const { chromium } = require('playwright');

const APP_URL = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT = 15000;

// Credenziali uniche per ogni run (evita conflitti con run precedenti)
const TS = Date.now();
const TEST_NICK = `TestReg_${TS}`;
const TEST_EMAIL = `testreg_${TS}@test.com`;
const TEST_PASS = 'Password123!';

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ✅ ${msg}`);
  passed++;
}

function fail(msg) {
  console.log(`  ❌ ${msg}`);
  failed++;
  process.exitCode = 1;
}

async function sbFetch(path, opts = {}) {
  const { headers: optHeaders, ...rest } = opts; // estrai headers: altrimenti ...rest sovrascriverebbe l'oggetto headers (perdendo apikey)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...optHeaders,
    },
    ...rest,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null; // tollera body vuoto (es. return=minimal)
}

async function cleanupProfile(email) {
  await sbFetch(`profiles?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' });
}

// Test: guasto di rete sul login → messaggio di connessione, NON "nessun account"
async function testNetworkErrorOnLogin() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let ok = true;
  const failLocal = (m) => { console.log('  ✗ ' + m); ok = false; };
  const passLocal = (m) => console.log('  ✓ ' + m);
  try {
    await page.goto('http://localhost:4321/app', { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: /^Login$|^Accedi$/ }).first().click().catch(() => {});
    await page.route('**/rest/v1/**', route => route.abort());
    await page.locator('input[type=email]').first().fill('chiunque@test.com');
    await page.locator('input[type=password]').first().fill('qualsiasi');
    // NB: il submit è il button.btn-primary; senza il filtro .btn-primary
    // il regex /^Login$/ matcherebbe anche il TAB "Login" (primo nel DOM)
    // e il click non invocherebbe handleLogin.
    await page.locator('button.btn-primary', { hasText: /^Login$|^Accedi$/ }).first().click();
    const errBox = page.locator('text=/Problema di connessione|Connection problem/');
    await errBox.waitFor({ state: 'visible', timeout: 6000 });
    passLocal('Mostra messaggio di connessione su guasto di rete');
    const wrongMsg = await page.locator('text=/Nessun account|No account found/').count();
    if (wrongMsg === 0) passLocal('NON mostra "nessun account" su guasto di rete');
    else failLocal('Mostra ancora "nessun account" su guasto di rete');
    await page.unroute('**/rest/v1/**');
  } catch (e) {
    failLocal('Eccezione: ' + e.message);
  } finally {
    await browser.close();
  }
  return ok;
}

const nodeCrypto = require('crypto');
const sha256hex = (s) => nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex'); // = hashPassword legacy

// C1: account legacy (hash SHA-256) → login deve riuscire (dual-path) e migrare a PBKDF2
async function testLegacyMigration() {
  const ts = Date.now();
  const nick = `LegacyMig_${ts}`;
  const email = `legacymig_${ts}@test.com`;
  const pass = 'LegacyPass123!';
  const legacyHash = sha256hex(pass);
  let ok = true;
  const passL = (m) => console.log('  ✓ ' + m);
  const failL = (m) => { console.log('  ✗ ' + m); ok = false; };
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    // Semina un profilo legacy nel DB (hash SHA-256, formato vecchio)
    const seedResp = await sbFetch('profiles', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        session_id: `legacy-${ts}`, nickname: nick, email, password_hash: legacyHash,
        bio: '', starseed_type: '', avatar: '', country: '', interests: [],
        experience_level: '', telepathy_score: 0, telepathy_best: 0, show_telepathy_score: true
      })
    });
    // Verifica che il seed sia andato (sbFetch non controlla res.ok → potrebbe aver fallito)
    const seeded = await sbFetch(`profiles?email=eq.${encodeURIComponent(email)}&select=email,password_hash`);
    if (!Array.isArray(seeded) || seeded.length === 0) {
      failL('Seed INSERT fallito → ' + JSON.stringify(seedResp));
      return ok;
    }
    // Login via UI con la password legacy
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(':text("Login")', { timeout: TIMEOUT });
    await page.locator(':text("Login")').first().click();
    await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(pass);
    await page.locator('button.btn-primary', { hasText: /^Login$|^Accedi$/ }).first().click();
    try {
      await page.waitForSelector(':text("Logout"), :text("Esci")', { timeout: TIMEOUT });
    } catch (e) {
      const onscreen = await page.locator('.result-try-again, [class*="result"]').allInnerTexts().catch(() => []);
      failL('Login legacy NON completato. Errore a schermo: ' + JSON.stringify(onscreen));
      return ok;
    }
    passL('Login con account legacy (SHA-256) riuscito');
    // Verifica migrazione: il password_hash memorizzato ora è PBKDF2
    await page.waitForTimeout(1500); // attendi l'UPDATE di migrazione
    const rows = await sbFetch(`profiles?email=eq.${encodeURIComponent(email)}&select=password_hash`);
    const stored = rows && rows[0] && rows[0].password_hash;
    if (stored && stored.indexOf('pbkdf2$') === 0) passL('Hash migrato a PBKDF2 dopo il login');
    else failL('Hash NON migrato (ancora: ' + (stored ? String(stored).substring(0, 12) : 'null') + ')');
  } catch (e) {
    failL('Eccezione: ' + e.message);
  } finally {
    await sbFetch(`profiles?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' });
    await browser.close();
  }
  return ok;
}

/** Apre l'app e porta la schermata di auth alla tab indicata ('register'|'login') */
async function openAuthTab(page, tab) {
  await page.goto(APP_URL);
  // La lingua default è 'en' — i tab sono "Guest", "Login", "Register"
  await page.waitForSelector(':text("Guest")', { timeout: TIMEOUT });
  if (tab === 'register') {
    await page.locator(':text("Register")').first().click({ timeout: TIMEOUT });
    await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
  } else if (tab === 'login') {
    await page.locator(':text("Login")').first().click({ timeout: TIMEOUT });
    await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
  }
}

(async () => {
  console.log('\n═══════════════════════════════════════');
  console.log('  TEST REGISTRAZIONE / LOGIN');
  console.log(`  Utente: ${TEST_NICK} <${TEST_EMAIL}>`);
  console.log('═══════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {

    // ── Test 1: Registrazione nuovo utente ───────────────────────────────
    console.log('📋 Test 1: Registrazione nuovo utente');
    await openAuthTab(page, 'register');

    await page.locator('input[type="text"]').fill(TEST_NICK);
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASS);
    // Aspetta che il bottone sia abilitato (React state aggiornato)
    await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
    await page.locator('button.btn-primary').click({ timeout: TIMEOUT });

    // Dopo la registrazione la schermata auth scompare e appare la app principale
    // con il badge "Registered" nell'header
    await page.waitForSelector(':text("Registered")', { timeout: TIMEOUT });
    pass('Registrazione completata — badge "Registered" visibile nella app');

    // ── Test 2: Profilo salvato in Supabase ──────────────────────────────
    console.log('\n📋 Test 2: Profilo salvato in Supabase');
    await page.waitForTimeout(2000);
    const profiles = await sbFetch(`profiles?email=eq.${encodeURIComponent(TEST_EMAIL)}&select=nickname,email`);
    if (profiles && profiles.length > 0 && profiles[0].nickname === TEST_NICK) {
      pass(`Profilo trovato in DB — nickname: ${profiles[0].nickname}`);
    } else {
      fail('Profilo NON trovato in Supabase dopo registrazione');
    }

    // ── Test 3: Badge "Registered" visibile nell'app ────────────────────
    console.log('\n📋 Test 3: Badge "Registered" visibile');
    const badgeCount = await page.locator(':text("Registered")').count();
    if (badgeCount > 0) {
      pass('Badge "Registered" presente nell\'app');
    } else {
      fail('Badge "Registered" NON trovato');
    }

    // ── Test 4: Logout ───────────────────────────────────────────────────
    console.log('\n📋 Test 4: Logout');
    await page.locator(':text("Logout")').first().click({ timeout: TIMEOUT });
    await page.locator('.modal-content button.btn-primary').click({ timeout: TIMEOUT });
    await page.waitForSelector(':text("Guest")', { timeout: TIMEOUT });
    pass('Logout eseguito — schermata auth di nuovo visibile');

    // ── Test 5: Login con credenziali corrette ───────────────────────────
    console.log('\n📋 Test 5: Login con credenziali corrette');
    await page.locator(':text("Login")').first().click({ timeout: TIMEOUT });
    await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASS);
    await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
    await page.locator('button.btn-primary').click({ timeout: TIMEOUT });

    // Dopo login l'app si apre — badge "Registered" visibile
    await page.waitForSelector(':text("Registered")', { timeout: TIMEOUT });
    pass('Login corretto — app aperta come utente registrato');

    // ── Test 6: Login con password errata ───────────────────────────────
    console.log('\n📋 Test 6: Login con password errata');
    await page.locator(':text("Logout")').first().click({ timeout: TIMEOUT });
    await page.locator('.modal-content button.btn-primary').click({ timeout: TIMEOUT });
    await page.waitForSelector(':text("Guest")', { timeout: TIMEOUT });
    await page.locator(':text("Login")').first().click({ timeout: TIMEOUT });
    await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill('PasswordSbagliata99');
    await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
    await page.locator('button.btn-primary').click({ timeout: TIMEOUT });

    await page.waitForSelector(':text("Wrong password")', { timeout: TIMEOUT });
    pass('Errore corretto — "Wrong password" mostrato');

    // ── Test 7: Login con email non esistente ────────────────────────────
    console.log('\n📋 Test 7: Login con email inesistente');
    await page.locator('input[type="email"]').fill('nonesisteproprioquestamail@test.com');
    await page.locator('input[type="password"]').fill(TEST_PASS);
    await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
    await page.locator('button.btn-primary').click({ timeout: TIMEOUT });

    await page.waitForSelector(':text("No account found")', { timeout: TIMEOUT });
    pass('Errore corretto — "No account found" mostrato');

    // ── Test 8: Registrazione con email già usata ────────────────────────
    console.log('\n📋 Test 8: Registrazione con email già registrata');
    await page.locator(':text("Register")').first().click({ timeout: TIMEOUT });
    await page.waitForSelector('input[type="text"]', { timeout: TIMEOUT });
    await page.locator('input[type="text"]').fill('AltroNickname');
    await page.locator('input[type="email"]').fill(TEST_EMAIL); // stessa email
    await page.locator('input[type="password"]').fill('AltroPass123!');
    await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
    await page.locator('button.btn-primary').click({ timeout: TIMEOUT });

    await page.waitForSelector(':text("already registered")', { timeout: TIMEOUT });
    pass('Errore corretto — email duplicata bloccata');

    // ── Test 9: Registrazione con nickname già usato ─────────────────────
    console.log('\n📋 Test 9: Registrazione con nickname già usato');
    await page.locator('input[type="text"]').fill(TEST_NICK); // stesso nick
    await page.locator('input[type="email"]').fill(`altro_${TS}@test.com`);
    await page.locator('input[type="password"]').fill('AltroPass123!');
    await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
    await page.locator('button.btn-primary').click({ timeout: TIMEOUT });

    // Cerca errore nickname
    await page.waitForSelector(':text("already")', { timeout: TIMEOUT });
    pass('Errore corretto — nickname duplicato bloccato');

  } catch (err) {
    fail(`Errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    // Pulizia profilo test da Supabase
    await cleanupProfile(TEST_EMAIL);
    console.log(`\n  (Profilo test rimosso da Supabase)`);

    // ── Test 10: Guasto di rete sul login → messaggio di connessione ─────
    console.log('\n📋 Test 10: Guasto di rete sul login (browser indipendente)');
    const netOk = await testNetworkErrorOnLogin();
    if (netOk) {
      pass('Guasto di rete → messaggio di connessione, non "nessun account"');
    } else {
      fail('Guasto di rete NON gestito correttamente');
    }

    // ── Test 11: Migrazione legacy SHA-256 → PBKDF2 al login (C1) ─────────
    console.log('\n📋 Test 11: Account legacy SHA-256 → login + migrazione PBKDF2 (C1)');
    const migOk = await testLegacyMigration();
    if (migOk) {
      pass('Account legacy migrato a PBKDF2 al primo login');
    } else {
      fail('Migrazione legacy NON funzionante (rischio lock-out / mancata migrazione)');
    }

    console.log('\n═══════════════════════════════════════');
    const totale = passed + failed;
    console.log(`  ${passed}/${totale} test passati`);
    console.log(process.exitCode === 1 ? '  RISULTATO: ❌ FALLITO' : '  RISULTATO: ✅ PASSATO');
    console.log('═══════════════════════════════════════\n');

    await browser.close();
  }
})();
