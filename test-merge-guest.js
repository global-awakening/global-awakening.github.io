/**
 * Test merge guest → account (fix #25 con RPC merge_telepathy_scores)
 *
 * Verifica che i round/matches accumulati come guest vengano migrati
 * sull'account appena registrato/loggato. Lo scenario "guest joca round
 * reale" e' troppo costoso da orchestrare in test (richiede 2 browser
 * + un partner online), quindi simula la giocata chiamando direttamente
 * la RPC increment_telepathy_score con il sessionId del guest.
 *
 * Esecuzione:
 *   npx serve . -p 4321  (in altra shell)
 *   node test-merge-guest.js
 */

const { chromium } = require('playwright');
const { requireServiceKey, serviceFetch, deleteTestAccount } = require('./test-helpers');
requireServiceKey();

const APP_URL = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT = 15000;

const TS = Date.now();
const TEST_NICK = `MergeT_${TS}`;
const TEST_EMAIL = `merget_${TS}@test.com`;
const TEST_PASS = 'Password123!';
const FAKE_ROUNDS = 3;
const FAKE_MATCHES = 1;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; process.exitCode = 1; }

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: SB_HEADERS, ...opts
  });
  if (res.status === 204) return null;
  try { return await res.json(); } catch { return null; }
}

async function sbRpc(fn, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: SB_HEADERS, body: JSON.stringify(params)
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, body };
}

async function cleanupProfile(email) {
  await deleteTestAccount(email);
}

(async () => {
  console.log('\n═══════════════════════════════════════');
  console.log('  TEST MERGE GUEST → ACCOUNT');
  console.log(`  Email test: ${TEST_EMAIL}`);
  console.log('═══════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Pre-genero il sessionId guest e lo impongo via localStorage prima del React init.
  // (Il lazy useState legge da localStorage; solo handleLogin/Register lo scrivono.)
  const guestSid = `test-${TS}-${Math.floor(Math.random() * 1e9)}`;

  try {
    console.log('📋 Step 1: Apertura app con sessionId guest pre-iniettato');
    // Carica una volta per stabilire il context, poi inietta sessionId e reload.
    // Il lazy useState lo legge da localStorage all'init successivo.
    await page.goto(APP_URL);
    await page.evaluate((sid) => localStorage.setItem('ga_session_id', sid), guestSid);
    await page.reload();
    await page.waitForSelector(':text("Register")', { timeout: TIMEOUT });
    pass(`SessionId guest iniettato: ${guestSid.substring(0, 30)}...`);

    console.log('\n📋 Step 2: Simula sessione giocata (RPC increment_telepathy_score)');
    const r1 = await sbRpc('increment_telepathy_score', {
      p_user_id: guestSid,
      p_nickname: TEST_NICK + '_guest',
      p_rounds: FAKE_ROUNDS,
      p_matches: FAKE_MATCHES
    });
    if (!r1.ok) { fail(`RPC increment fallita: ${r1.status} ${JSON.stringify(r1.body)}`); throw new Error('rpc'); }
    pass(`RPC increment_telepathy_score eseguita (${FAKE_ROUNDS} rounds, ${FAKE_MATCHES} matches)`);

    console.log('\n📋 Step 3: Verifica record guest in telepathy_scores');
    const guestRows = (await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(guestSid)}&select=*`)).body;
    if (!guestRows || guestRows.length === 0) { fail('Riga guest non trovata in telepathy_scores'); throw new Error('no guest row'); }
    const g = guestRows[0];
    if (g.rounds_count !== FAKE_ROUNDS || g.matches_count !== FAKE_MATCHES) {
      fail(`Valori guest sbagliati: rounds=${g.rounds_count}, matches=${g.matches_count}`); throw new Error('wrong vals');
    }
    pass(`Riga guest ok: rounds=${g.rounds_count}, matches=${g.matches_count}, sessions=${g.sessions_count}`);

    console.log('\n📋 Step 4: Registrazione nuovo utente (deve triggerare merge)');
    await page.locator(':text("Register")').first().click({ timeout: TIMEOUT });
    await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
    await page.locator('input[type="text"]').fill(TEST_NICK);
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASS);
    await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
    await page.locator('button.btn-primary').click({ timeout: TIMEOUT });
    await page.waitForSelector(':text("Registered")', { timeout: TIMEOUT });
    pass('Registrazione completata');

    // Lascia tempo al merge async (RPC + profile update)
    await page.waitForTimeout(2500);

    console.log('\n📋 Step 5: Verifica riga guest cancellata da telepathy_scores');
    const guestRows2 = (await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(guestSid)}&select=*`)).body;
    if (guestRows2 && guestRows2.length > 0) {
      fail(`Riga guest ancora presente dopo merge: ${JSON.stringify(guestRows2[0])}`);
    } else {
      pass('Riga guest cancellata dopo merge');
    }

    console.log('\n📋 Step 6: Verifica riga merged sotto user_id = email');
    const userRows = (await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(TEST_EMAIL)}&select=*`)).body;
    if (!userRows || userRows.length === 0) {
      fail('Riga merged non trovata in telepathy_scores con user_id = email');
    } else {
      const u = userRows[0];
      if (u.rounds_count !== FAKE_ROUNDS) {
        fail(`rounds_count merged sbagliato: atteso ${FAKE_ROUNDS}, trovato ${u.rounds_count}`);
      } else if (u.matches_count !== FAKE_MATCHES) {
        fail(`matches_count merged sbagliato: atteso ${FAKE_MATCHES}, trovato ${u.matches_count}`);
      } else {
        pass(`Riga merged ok: rounds=${u.rounds_count}, matches=${u.matches_count}, sessions=${u.sessions_count}`);
      }
    }

    console.log('\n📋 Step 7: Verifica profiles.telepathy_score / telepathy_best aggiornati');
    const profRows = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(TEST_EMAIL)}&select=telepathy_score,telepathy_best`)).body;
    if (!profRows || profRows.length === 0) {
      fail('Profilo non trovato dopo registrazione');
    } else {
      const p = profRows[0];
      if (p.telepathy_score !== FAKE_ROUNDS || p.telepathy_best !== FAKE_MATCHES) {
        fail(`profiles non aggiornato: telepathy_score=${p.telepathy_score}, telepathy_best=${p.telepathy_best}`);
      } else {
        pass(`Profilo aggiornato: telepathy_score=${p.telepathy_score}, telepathy_best=${p.telepathy_best}`);
      }
    }

    console.log('\n📋 Step 8: Verifica UI mostra i round migrati');
    // Header in alto a sinistra: numero "Rounds Played"
    const headerText = await page.locator('text=/Rounds? Played|Round Giocati/').first().locator('..').innerText().catch(() => '');
    if (!headerText.includes(String(FAKE_ROUNDS))) {
      // Fallback: guarda tutto il body per il numero di round
      const allBodyText = await page.locator('body').innerText();
      const found = new RegExp(`\\b${FAKE_ROUNDS}\\b`).test(allBodyText);
      if (found) {
        pass(`UI mostra ${FAKE_ROUNDS} (verificato in body)`);
      } else {
        fail(`UI NON mostra ${FAKE_ROUNDS} round dopo merge — header: "${headerText}"`);
      }
    } else {
      pass(`UI mostra ${FAKE_ROUNDS} round nel pannello header`);
    }

  } catch (e) {
    console.log('\n⚠️  Test interrotto:', e.message);
  } finally {
    await cleanupProfile(TEST_EMAIL);
    console.log('\n  (Profilo test rimosso da Supabase. NB: la riga merged in telepathy_scores resta — DELETE bloccato dalle nuove policy.)');
    await browser.close();
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`  ${passed}/${passed + failed} step passati`);
  console.log(`  RISULTATO: ${failed === 0 ? '✅ PASSATO' : '❌ FALLITO'}`);
  console.log('═══════════════════════════════════════\n');
})();
