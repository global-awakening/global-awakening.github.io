/**
 * Test Rituali — Global Awakening
 *
 * Copre:
 *   - Apertura tab Rituali e titolo
 *   - Creazione Test Ritual (LIVE immediato via bottone ⚡)
 *   - Visibilità rituale per secondo utente (polling ~10s)
 *   - Join rituale e verifica partecipanti in DB
 *   - Invio energia su LIVE (verifica in Supabase)
 *   - Commento su rituale e visibilità da parte di B
 *   - Creazione rituale via modal (data futura, verifica status)
 *
 * Esecuzione: node test-rituali.js
 * Prerequisiti: app su http://localhost:4321/app.html, npx playwright install chromium
 *
 * Note implementative:
 *   - createTestRitual e createRitual non aggiornano lo stato locale (solo INSERT in DB)
 *     → serve attendere il poll (10s) o real-time per vedere la card
 *   - createRitualComment non chiama .select() → data è null → UI di A non si aggiorna
 *     → il commento viene verificato via Supabase e tramite B (che fa fresh SELECT)
 */

const { chromium } = require('playwright');

const APP_URL      = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT      = 20000;
const POLL_WAIT    = 13000; // Leggermente sopra il poll interval da 10s

const TS     = Date.now();
const NICK_A = `RitA_${TS}`;
const NICK_B = `RitB_${TS}`;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; process.exitCode = 1; }
function log(who, msg) {
  const ts = new Date().toLocaleTimeString('it-IT');
  console.log(`[${ts}] [${who}] ${msg}`);
}

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...opts.headers,
    },
    ...opts,
  });
  if (res.status === 204 || res.status === 200 && res.headers.get('content-length') === '0') return null;
  try { return await res.json(); } catch { return null; }
}

async function loginAsGuest(page, nick) {
  await page.goto(APP_URL);
  await page.waitForSelector('button:has-text("Ospite"), button:has-text("Guest")', { timeout: TIMEOUT });
  await page.locator('button:has-text("Ospite"), button:has-text("Guest")').first().click();
  await page.locator('input[placeholder*="username"], input[placeholder*="Username"]').first().fill(nick);
  await page.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")').click();
  await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
  log(nick, 'Login come ospite completato');
}

async function goToRituals(page, nick) {
  await page.locator('button').filter({ hasText: /Rituali|Rituals/ }).first().click();
  await page.waitForSelector('h2:has-text("Rituali Globali"), h2:has-text("Global Rituals")', { timeout: TIMEOUT });
  log(nick, 'Tab Rituali aperto');
}

async function cleanup() {
  try {
    await sbFetch(`rituals?creator=eq.${encodeURIComponent(NICK_A)}`, { method: 'DELETE' });
    await sbFetch(`rituals?creator=eq.${encodeURIComponent(NICK_B)}`, { method: 'DELETE' });
    await sbFetch(`ritual_comments?author_nickname=eq.${encodeURIComponent(NICK_A)}`, { method: 'DELETE' });
    await sbFetch(`ritual_comments?author_nickname=eq.${encodeURIComponent(NICK_B)}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('  Cleanup parzialmente fallito:', e.message);
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  TEST RITUALI — Global Awakening');
  console.log(`  Utenti: ${NICK_A} ↔ ${NICK_B}`);
  console.log('══════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // Logga errori browser
  for (const [p, label] of [[pageA, 'BROWSER-A'], [pageB, 'BROWSER-B']]) {
    p.on('console', msg => { if (msg.type() === 'error') log(label, `error: ${msg.text()}`); });
  }

  let testRitualId = null; // ID del Test Ritual di A (rilevato da Supabase)

  try {
    // ── Setup: login + navigazione ─────────────────────────────────────────
    console.log('📋 Setup: login e navigazione');
    await Promise.all([
      loginAsGuest(pageA, NICK_A),
      loginAsGuest(pageB, NICK_B),
    ]);
    await Promise.all([
      goToRituals(pageA, NICK_A),
      goToRituals(pageB, NICK_B),
    ]);

    // ── Test 1: Titolo tab ─────────────────────────────────────────────────
    console.log('\n📋 Test 1: Titolo tab Rituali visibile per entrambi');
    const titleA = await pageA.locator('h2').filter({ hasText: /Rituali Globali|Global Rituals/ }).count();
    const titleB = await pageB.locator('h2').filter({ hasText: /Rituali Globali|Global Rituals/ }).count();
    if (titleA > 0 && titleB > 0) {
      pass('Titolo "Rituali Globali" visibile per entrambi');
    } else {
      fail(`Titolo mancante — A:${titleA} B:${titleB}`);
    }

    // ── Test 2: Creazione Test Ritual (LIVE immediato) ─────────────────────
    console.log('\n📋 Test 2: Creazione Test Ritual (⚡ LIVE)');
    await pageA.locator('button').filter({ hasText: /Test.*3.*min/ }).first().click();
    log(NICK_A, 'Cliccato "⚡ Test (3 min)"');

    // Aspetta che la card di A appaia (real-time o poll)
    log(NICK_A, `Aspetto la ritual card (max ${POLL_WAIT / 1000}s)...`);
    try {
      await pageA.locator('.ritual-card').filter({ hasText: NICK_A }).waitFor({ timeout: POLL_WAIT });
      pass('Ritual card appare nella lista di A');
    } catch {
      fail(`Ritual card NON appare dopo ${POLL_WAIT / 1000}s`);
    }

    // Verifica status LIVE
    const cardA = pageA.locator('.ritual-card').filter({ hasText: NICK_A }).first();
    const isLiveA = await cardA.locator('span').filter({ hasText: /IN DIRETTA|LIVE NOW/ }).count();
    if (isLiveA > 0) {
      pass('Rituale ha status LIVE per A');
    } else {
      fail('Rituale NON ha status LIVE per A');
    }

    // Recupera ID rituale da Supabase per verifiche successive
    await pageA.waitForTimeout(1000);
    const ritualsDB = await sbFetch(`rituals?creator=eq.${encodeURIComponent(NICK_A)}&select=id,participants,energy`);
    if (ritualsDB && ritualsDB.length > 0) {
      testRitualId = ritualsDB[0].id;
      log('DB', `Test Ritual ID: ${testRitualId}`);
    }

    // ── Test 3: B vede il rituale di A ────────────────────────────────────
    console.log('\n📋 Test 3: B vede il rituale di A');
    log(NICK_B, `Aspetto la ritual card di ${NICK_A} (max ${POLL_WAIT / 1000}s)...`);
    try {
      await pageB.locator('.ritual-card').filter({ hasText: NICK_A }).waitFor({ timeout: POLL_WAIT });
      pass(`${NICK_B} vede il rituale di ${NICK_A}`);
    } catch {
      fail(`${NICK_B} NON vede nessuna card con "${NICK_A}" dopo ${POLL_WAIT / 1000}s`);
    }

    const cardB = pageB.locator('.ritual-card').filter({ hasText: NICK_A }).first();

    // ── Test 4: B joinisce il rituale ─────────────────────────────────────
    console.log('\n📋 Test 4: B joinisce il rituale di A');
    const joinBtn = cardB.locator('button').filter({ hasText: /Unisciti|Join/ }).first();
    const joinVisible = await joinBtn.count();
    if (joinVisible > 0) {
      await joinBtn.click();
      log(NICK_B, 'Cliccato "Unisciti/Join"');
    } else {
      fail('Bottone "Unisciti/Join" non trovato in UI di B');
    }

    // Verifica in Supabase: participants ora = 2
    await pageB.waitForTimeout(2000);
    if (testRitualId) {
      const afterJoin = await sbFetch(`rituals?id=eq.${testRitualId}&select=participants`);
      if (afterJoin && afterJoin[0]) {
        const parts = afterJoin[0].participants;
        if (Array.isArray(parts) && parts.length >= 2) {
          pass(`Partecipanti in DB: ${parts.length} (B ha joinato correttamente)`);
        } else {
          fail(`Partecipanti in DB ancora ${parts ? parts.length : '?'} dopo join di B`);
        }
      } else {
        fail('Rituale non trovato in Supabase per verifica partecipanti');
      }
    }

    // Aspetta il poll per verificare UI di B (bottone diventa "Unito/Joined")
    log(NICK_B, `Aspetto UI update del bottone (max ${POLL_WAIT / 1000}s)...`);
    try {
      await cardB.locator('button').filter({ hasText: /Unito|Joined/ }).waitFor({ timeout: POLL_WAIT });
      pass('Bottone diventa "Unito/Joined" dopo il poll');
    } catch {
      fail('Bottone "Unito/Joined" non appare dopo il poll');
    }

    // ── Test 5: Verifica bottone energia visibile su LIVE ─────────────────
    console.log('\n📋 Test 5: Bottone energia visibile e click');
    // Il bottone energia mostra "⚡ {energia}" — presente solo su rituali LIVE
    const energyBtn = cardA.locator('button').filter({ hasText: /⚡\s*\d/ }).first();
    const energyBtnCount = await energyBtn.count();
    if (energyBtnCount > 0) {
      pass('Bottone energia (⚡) visibile su LIVE ritual');
      await energyBtn.click();
      log(NICK_A, 'Energia inviata');

      // Verifica incremento in Supabase (non aspettiamo il poll)
      await pageA.waitForTimeout(2000);
      if (testRitualId) {
        const afterEnergy = await sbFetch(`rituals?id=eq.${testRitualId}&select=energy`);
        if (afterEnergy && afterEnergy[0] && afterEnergy[0].energy >= 10) {
          pass(`Energia in DB: ${afterEnergy[0].energy} (incrementata di 10)`);
        } else {
          fail(`Energia non incrementata in DB: ${afterEnergy ? afterEnergy[0]?.energy : 'N/A'}`);
        }
      }
    } else {
      fail('Bottone energia NON visibile su LIVE ritual');
    }

    // ── Test 6: A scrive un commento ─────────────────────────────────────
    console.log('\n📋 Test 6: A scrive un commento sul rituale');
    const commentsToggleA = cardA.locator('button.btn-secondary').filter({ hasText: /commenti|comments/ }).first();
    await commentsToggleA.click();
    log(NICK_A, 'Sezione commenti aperta');

    const commentInput = cardA.locator('input[placeholder*="commento"], input[placeholder*="comment"]').first();
    await commentInput.waitFor({ timeout: TIMEOUT });

    const COMMENT_TEXT = `Test commento da ${NICK_A}`;
    await commentInput.fill(COMMENT_TEXT);
    await commentInput.press('Enter');
    log(NICK_A, `Commento inviato: "${COMMENT_TEXT}"`);

    // Verifica salvataggio in Supabase (la UI di A non si aggiorna per bug .select() mancante)
    await pageA.waitForTimeout(2000);
    const commentsDB = await sbFetch(`ritual_comments?author_nickname=eq.${encodeURIComponent(NICK_A)}&select=content`);
    if (commentsDB && commentsDB.length > 0) {
      pass(`Commento salvato in DB: "${commentsDB[0].content.substring(0, 40)}"`);
    } else {
      fail('Commento NON trovato in Supabase — possibile RLS su ritual_comments');
    }

    // ── Test 7: B vede il commento di A ───────────────────────────────────
    console.log('\n📋 Test 7: B vede il commento di A');
    const commentsToggleB = cardB.locator('button.btn-secondary').filter({ hasText: /commenti|comments/ }).first();
    await commentsToggleB.click();
    log(NICK_B, 'Sezione commenti aperta (fresh SELECT da DB)');

    // Aspetta caricamento commenti da DB
    await pageB.waitForTimeout(3000);
    const commentVisibleB = await cardB.locator('p').filter({ hasText: COMMENT_TEXT.substring(0, 20) }).count();
    if (commentVisibleB > 0) {
      pass(`${NICK_B} vede il commento di ${NICK_A}`);
    } else {
      fail(`${NICK_B} NON vede il commento di ${NICK_A}`);
    }

    // ── Test 8: Creazione rituale via modal (data futura) ─────────────────
    console.log('\n📋 Test 8: Creazione rituale via modal con data futura');
    await pageA.locator('button:has-text("Proponi Rituale"), button:has-text("Propose Ritual")').first().click();
    await pageA.locator('input[type="date"]').waitFor({ timeout: TIMEOUT });
    log(NICK_A, 'Modal creazione rituale aperto');

    // Data domani in formato YYYY-MM-DD
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const MODAL_RITUAL_NAME = `Rituale Modal ${TS}`;
    await pageA.locator('input[placeholder="e.g., Full Moon Meditation"]').fill(MODAL_RITUAL_NAME);
    await pageA.locator('input[type="date"]').fill(dateStr);
    await pageA.locator('input[type="time"]').fill('10:00');

    // Click "Crea Rituale" (l'ultimo bottone nel modal, per evitare il bottone esterno)
    await pageA.locator('button:has-text("Crea Rituale"), button:has-text("Create Ritual")').last().click();
    log(NICK_A, `Rituale "${MODAL_RITUAL_NAME}" inviato via modal`);

    // Modal deve chiudersi
    await pageA.locator('input[type="date"]').waitFor({ state: 'hidden', timeout: TIMEOUT });
    pass('Modal chiuso dopo creazione');

    // Aspetta che la card appaia nella lista (real-time o poll)
    log(NICK_A, `Aspetto card "${MODAL_RITUAL_NAME.substring(0, 20)}" (max ${POLL_WAIT / 1000}s)...`);
    try {
      await pageA.locator('.ritual-card').filter({ hasText: MODAL_RITUAL_NAME }).waitFor({ timeout: POLL_WAIT });
      pass(`Rituale "${MODAL_RITUAL_NAME.substring(0, 30)}" appare in lista`);

      // Verifica status futuro ("Inizia tra" / "Starts in")
      const futureCard = pageA.locator('.ritual-card').filter({ hasText: MODAL_RITUAL_NAME }).first();
      const futureStatus = await futureCard.locator('span').filter({ hasText: /Inizia tra|Starts in/ }).count();
      if (futureStatus > 0) {
        pass('Rituale futuro mostra status "Inizia tra..."');
      } else {
        fail('Status futuro "Inizia tra..." non trovato nel pannello');
      }
    } catch {
      fail(`Card rituale modal NON appare dopo ${POLL_WAIT / 1000}s`);
    }

  } catch (err) {
    fail(`Errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    console.log('\n  (Pulizia rituali e commenti test da Supabase...)');
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
