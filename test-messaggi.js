/**
 * Test messaggistica privata — Global Awakening
 *
 * Copre:
 *   - Registrazione e login di due utenti distinti
 *   - Visibilità reciproca nella community list
 *   - Apertura profilo e invio messaggio
 *   - Ricezione messaggio dal partner
 *   - Risposta e verifica bidirezionale
 *   - Badge messaggi non letti
 *
 * Esecuzione: node test-messaggi.js
 * Prerequisiti: app su http://localhost:4321/app.html, npx playwright install chromium
 */

const { chromium } = require('playwright');

const APP_URL      = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT      = 20000;

const TS      = Date.now();
const NICK_A  = `MsgA_${TS}`;
const EMAIL_A = `msga_${TS}@test.com`;
const NICK_B  = `MsgB_${TS}`;
const EMAIL_B = `msgb_${TS}@test.com`;
const PASS    = 'Password123!';
const GUEST_A = `GMsgA_${TS}`;
const GUEST_B = `GMsgB_${TS}`;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; process.exitCode = 1; }
function log(user, msg) {
  const ts = new Date().toLocaleTimeString('it-IT');
  console.log(`[${ts}] [${user}] ${msg}`);
}

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    ...opts,
  });
  if (res.status === 204) return null;
  return res.json();
}

async function cleanup() {
  await sbFetch(`profiles?email=eq.${encodeURIComponent(EMAIL_A)}`, { method: 'DELETE' });
  await sbFetch(`profiles?email=eq.${encodeURIComponent(EMAIL_B)}`, { method: 'DELETE' });
  await sbFetch(`private_messages?sender_name=eq.${encodeURIComponent(NICK_A)}`, { method: 'DELETE' });
  await sbFetch(`private_messages?sender_name=eq.${encodeURIComponent(NICK_B)}`, { method: 'DELETE' });
  await sbFetch(`private_messages?sender_name=eq.${encodeURIComponent(GUEST_A)}`, { method: 'DELETE' });
  await sbFetch(`private_messages?sender_name=eq.${encodeURIComponent(GUEST_B)}`, { method: 'DELETE' });
  await sbFetch(`online_users?nickname=eq.${encodeURIComponent(NICK_A)}`, { method: 'DELETE' });
  await sbFetch(`online_users?nickname=eq.${encodeURIComponent(NICK_B)}`, { method: 'DELETE' });
  await sbFetch(`online_users?nickname=eq.${encodeURIComponent(GUEST_A)}`, { method: 'DELETE' });
  await sbFetch(`online_users?nickname=eq.${encodeURIComponent(GUEST_B)}`, { method: 'DELETE' });
}

/** Registra un nuovo utente e aspetta il badge "Registered" */
async function register(page, nick, email, pass) {
  await page.goto(APP_URL);
  await page.waitForSelector(':text("Guest")', { timeout: TIMEOUT });
  await page.locator(':text("Register")').first().click();
  await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
  await page.locator('input[type="text"]').fill(nick);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(pass);
  await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
  await page.locator('button.btn-primary').click();
  await page.waitForSelector(':text("Registered")', { timeout: TIMEOUT });
  log(nick, 'Registrazione completata');
}

/** Naviga al tab Telepatia */
async function goToTelepathy(page, nick) {
  await page.locator('button').filter({ hasText: /Telepatia|Telepathy/ }).first().click();
  await page.waitForSelector('text=Telepathy Training', { timeout: TIMEOUT });
  log(nick, 'Tab Telepatia aperto');
}

/** Apre il profilo di un utente dalla community list */
async function openProfileOf(page, targetNick) {
  // Clicca lo span con il nickname nella community list (onClick bubbla al div padre)
  const nick = page.locator('span.text-white.font-medium').filter({ hasText: targetNick }).first();
  await nick.waitFor({ timeout: TIMEOUT });
  await nick.click();
  // Aspetta apertura modal profilo
  await page.waitForSelector('.modal-content', { timeout: TIMEOUT });
}

/** Invia un messaggio privato nel modal profilo aperto */
async function sendMessage(page, text) {
  const input = page.locator('input[placeholder="Type a message..."]');
  await input.waitFor({ timeout: TIMEOUT });
  await input.fill(text);
  await input.press('Enter');
  // Piccola attesa per l'aggiornamento UI
  await page.waitForTimeout(500);
}

/** Chiude il modal profilo */
async function closeModal(page) {
  await page.locator('.modal-content button').first().click();
  await page.waitForSelector('.modal-content', { state: 'hidden', timeout: TIMEOUT });
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n═══════════════════════════════════════════');
  console.log('  TEST MESSAGGISTICA PRIVATA — Global Awakening');
  console.log(`  Utenti: ${NICK_A} ↔ ${NICK_B}`);
  console.log('═══════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    // ── Setup: registrazione entrambi ──────────────────────────────────────
    console.log('📋 Setup: registrazione utenti');
    await Promise.all([
      register(pageA, NICK_A, EMAIL_A, PASS),
      register(pageB, NICK_B, EMAIL_B, PASS),
    ]);
    pass(`${NICK_A} e ${NICK_B} registrati e loggati`);

    // ── Test 1: Badge "Registered" visibile per entrambi ──────────────────
    console.log('\n📋 Test 1: Badge "Registered" per entrambi');
    const badgeA = await pageA.locator(':text("Registered")').count();
    const badgeB = await pageB.locator(':text("Registered")').count();
    if (badgeA > 0 && badgeB > 0) {
      pass('Badge "Registered" visibile per entrambi gli utenti');
    } else {
      fail(`Badge mancante — A:${badgeA} B:${badgeB}`);
    }

    // ── Test 2: Entrambi nella community list ──────────────────────────────
    console.log('\n📋 Test 2: Visibilità reciproca nella community list');
    await Promise.all([
      goToTelepathy(pageA, NICK_A),
      goToTelepathy(pageB, NICK_B),
    ]);
    // Aspetta che la community list si popoli per entrambi (polling online_users ~5s)
    await Promise.all([
      pageA.waitForSelector(`span.text-white.font-medium:has-text("${NICK_B}")`, { timeout: TIMEOUT }),
      pageB.waitForSelector(`span.text-white.font-medium:has-text("${NICK_A}")`, { timeout: TIMEOUT }),
    ]);

    const seesB = (await pageA.locator(`span.text-white.font-medium:has-text("${NICK_B}")`).count()) > 0;
    const seesA = (await pageB.locator(`span.text-white.font-medium:has-text("${NICK_A}")`).count()) > 0;
    if (seesB) {
      pass(`${NICK_A} vede ${NICK_B} nella community list`);
    } else {
      fail(`${NICK_A} NON vede ${NICK_B} nella community list`);
    }
    if (seesA) {
      pass(`${NICK_B} vede ${NICK_A} nella community list`);
    } else {
      fail(`${NICK_B} NON vede ${NICK_A} nella community list`);
    }

    // ── Test 3: Apertura profilo ───────────────────────────────────────────
    console.log('\n📋 Test 3: Apertura profilo');
    await openProfileOf(pageA, NICK_B);
    const modalVisible = (await pageA.locator('.modal-content').count()) > 0;
    if (modalVisible) {
      pass(`${NICK_A} ha aperto il profilo di ${NICK_B}`);
    } else {
      fail('Modal profilo non appare');
    }

    // ── Test 4: Invio messaggio ────────────────────────────────────────────
    console.log('\n📋 Test 4: Invio messaggio');
    const MSG_A = `Ciao ${NICK_B}! Messaggio dal test automatico.`;
    await sendMessage(pageA, MSG_A);
    log(NICK_A, `Messaggio inviato: "${MSG_A}"`);

    // Aspetta polling (4s) + verifica che il messaggio appaia nella UI di A
    await pageA.waitForTimeout(5000);
    const msgInA = (await pageA.locator(`.modal-content :text("${MSG_A.substring(0, 20)}")`).count()) > 0;
    if (msgInA) {
      pass('Messaggio appare nella conversazione del mittente');
    } else {
      fail('Messaggio NON visibile nella UI del mittente dopo il poll');
    }

    // ── Test 5: Privacy Step B — i messaggi NON sono leggibili via SELECT diretta anon ──
    // (Prima di Step B questa SELECT esponeva i messaggi in chiaro = VULN-1. Ora RLS la blocca:
    //  la lettura legittima passa solo da get_my_messages. La persistenza è coperta da Test 6/8.)
    console.log('\n📋 Test 5: Privacy — SELECT diretta anon non espone i messaggi (Step B)');
    const leaked = await sbFetch(`private_messages?sender_name=eq.${encodeURIComponent(NICK_A)}&receiver_name=eq.${encodeURIComponent(NICK_B)}&select=content`);
    if (Array.isArray(leaked) && leaked.length === 0) {
      pass('SELECT diretta anon ritorna 0 righe — lettura pubblica chiusa (VULN-1)');
    } else {
      fail(`SELECT diretta anon espone ancora ${leaked ? leaked.length : '?'} messaggi — VULN-1 NON chiusa`);
    }

    await closeModal(pageA);

    // ── Test 6: User B riceve il messaggio ────────────────────────────────
    console.log('\n📋 Test 6: Ricezione messaggio da parte di B');

    // Badge messaggi non letti su B prima di aprire il profilo
    await pageB.waitForTimeout(5000); // aspetta polling
    const unreadBadge = await pageB.locator(':text("💬")').count();
    if (unreadBadge > 0) {
      pass(`${NICK_B} ha badge messaggi non letti`);
    } else {
      fail(`${NICK_B} NON ha badge messaggi non letti`);
    }

    // B apre il profilo di A
    await openProfileOf(pageB, NICK_A);
    log(NICK_B, `Profilo di ${NICK_A} aperto`);

    // Aspetta che il poll carichi i messaggi
    await pageB.waitForTimeout(5000);
    const msgInB = (await pageB.locator(`.modal-content :text("${MSG_A.substring(0, 20)}")`).count()) > 0;
    if (msgInB) {
      pass(`${NICK_B} vede il messaggio di ${NICK_A}`);
    } else {
      fail(`${NICK_B} NON vede il messaggio di ${NICK_A}`);
    }

    // ── Test 7: B risponde ad A ────────────────────────────────────────────
    console.log('\n📋 Test 7: Risposta di B ad A');
    const MSG_B = `Ciao ${NICK_A}! Risposta dal test.`;
    await sendMessage(pageB, MSG_B);
    log(NICK_B, `Risposta inviata: "${MSG_B}"`);
    await closeModal(pageB);

    // ── Test 8: A vede la risposta di B ───────────────────────────────────
    console.log('\n📋 Test 8: A vede la risposta di B');
    await pageA.waitForTimeout(5000); // aspetta polling
    await openProfileOf(pageA, NICK_B);
    await pageA.waitForTimeout(5000);
    const replyInA = (await pageA.locator(`.modal-content :text("${MSG_B.substring(0, 20)}")`).count()) > 0;
    if (replyInA) {
      pass(`${NICK_A} vede la risposta di ${NICK_B}`);
    } else {
      fail(`${NICK_A} NON vede la risposta di ${NICK_B}`);
    }
    await closeModal(pageA);

    // ── Test 9: Logout e login ─────────────────────────────────────────────
    console.log('\n📋 Test 9: Logout e re-login');
    await pageA.locator(':text("Logout")').first().click();
    await pageA.locator('.modal-content button.btn-primary').click({ timeout: TIMEOUT });
    await pageA.waitForSelector(':text("Guest")', { timeout: TIMEOUT });
    log(NICK_A, 'Logout eseguito');

    // Re-login
    await pageA.locator(':text("Login")').first().click();
    await pageA.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
    await pageA.locator('input[type="email"]').fill(EMAIL_A);
    await pageA.locator('input[type="password"]').fill(PASS);
    await pageA.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
    await pageA.locator('button.btn-primary').click();
    await pageA.waitForSelector(':text("Registered")', { timeout: TIMEOUT });
    pass('Logout + re-login come utente registrato');

    // Verifica che i messaggi precedenti siano ancora accessibili dopo re-login
    await goToTelepathy(pageA, NICK_A);
    await pageA.waitForTimeout(3000);
    await openProfileOf(pageA, NICK_B);
    await pageA.waitForTimeout(5000);
    const historyOk = (await pageA.locator(`.modal-content :text("${MSG_A.substring(0, 20)}")`).count()) > 0;
    if (historyOk) {
      pass('Storico messaggi mantenuto dopo logout/re-login');
    } else {
      fail('Storico messaggi perso dopo logout/re-login');
    }

    // ── Test 10: Step B — i guest NON possono usare i messaggi privati ─────
    console.log('\n📋 Test 10: Guest → prompt registrazione (Step B, messaggi solo registrati)');
    // Nuovi context per due guest separati
    const ctxGuestA = await browser.newContext();
    const ctxGuestB = await browser.newContext();
    const pageGA = await ctxGuestA.newPage();
    const pageGB = await ctxGuestB.newPage();

    async function loginGuest(p, nick) {
      await p.goto(APP_URL);
      await p.waitForSelector('button:has-text("Ospite"), button:has-text("Guest")', { timeout: TIMEOUT });
      await p.locator('button:has-text("Ospite"), button:has-text("Guest")').first().click();
      await p.locator('input[placeholder*="username"], input[placeholder*="Username"]').first().fill(nick);
      await p.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")').click();
      await p.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
      log(nick, 'Login guest ok');
    }

    await Promise.all([loginGuest(pageGA, GUEST_A), loginGuest(pageGB, GUEST_B)]);

    // Naviga a Coscienza dove c'è la community list
    await Promise.all([
      pageGA.locator('button').filter({ hasText: /Coscienza|Consciousness/ }).first().click(),
      pageGB.locator('button').filter({ hasText: /Coscienza|Consciousness/ }).first().click(),
    ]);
    // Aspetta che il polling popoli online_users
    await pageGA.waitForTimeout(11000);

    // GuestA apre il profilo di GuestB
    await openProfileOf(pageGA, GUEST_B);
    log(GUEST_A, `Aperto profilo di ${GUEST_B}`);

    // Step B: i guest NON possono usare i messaggi privati → prompt registrazione, niente casella
    const promptVisible = await pageGA.locator('.modal-content').locator('text=/Registrati|Register/').count();
    const inputVisible = await pageGA.locator('input[placeholder="Type a message..."], input[placeholder="Scrivi un messaggio..."]').count();
    if (promptVisible > 0) {
      pass('Guest vede il prompt "Registrati per inviare messaggi privati"');
    } else {
      fail('Guest NON vede il prompt di registrazione (gating Step B mancante)');
    }
    if (inputVisible === 0) {
      pass('Guest NON ha la casella messaggi (invio/lettura riservati ai registrati)');
    } else {
      fail('Guest vede ancora la casella messaggi — gating Step B mancante');
    }

    await ctxGuestA.close();
    await ctxGuestB.close();

  } catch (err) {
    fail(`Errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    console.log('\n  (Pulizia profili e messaggi test da Supabase...)');
    await cleanup();

    console.log('\n═══════════════════════════════════════════');
    const totale = passed + failed;
    console.log(`  ${passed}/${totale} test passati`);
    console.log(process.exitCode === 1
      ? '  RISULTATO: ❌ FALLITO'
      : '  RISULTATO: ✅ PASSATO');
    console.log('═══════════════════════════════════════════\n');

    await browser.close();
  }
})();
