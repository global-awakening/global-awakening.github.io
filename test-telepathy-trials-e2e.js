/**
 * E2E Fase 2: verifica che ogni round venga registrato in telepathy_trials.
 * Gioca alcuni round tra due ospiti, poi legge la tabella con la service_role key
 * (RLS la nasconde all'anon) e controlla i campi. Infine pulisce i dati di test.
 *
 * Prerequisiti: app su :4321, chromium, SQL 10_telepathy_trials.sql applicato,
 * .env.test con SUPABASE_SERVICE_KEY.
 * Esecuzione: node test-telepathy-trials-e2e.js
 */
const { chromium } = require('playwright');
const { loginAsGuest: guestLogin, getServiceKey, purge } = require('./test-helpers');

const APP_URL = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const T = 25000;
const ROUNDS = 3;

let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };

async function goTele(p) {
  await p.locator('button').filter({ hasText: /Telepatia|Telepathy/ }).first().click();
  await p.waitForSelector(':text("Telepathy Training"), :text("Allenamento Telepatico")', { timeout: T });
}
async function find(p) { await p.locator('button:has-text("Abbinamento Random"), button:has-text("Random Match")').first().click(); }
async function roleOf(p) {
  const t = (await p.locator('p.text-white.font-bold').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first().textContent()).trim();
  return (t === 'Sender' || t === 'Mittente') ? 'sender' : 'receiver';
}
async function send(p) {
  await p.waitForSelector('.symbol-btn', { timeout: T });
  await p.locator('.symbol-btn').first().click();
  await p.locator('button:has-text("Invia Telepaticamente"), button:has-text("Send Telepathically")').click();
}
async function guess(p) {
  await p.waitForSelector('.symbol-btn', { timeout: T });
  await p.locator('.symbol-btn').first().click();
  await p.locator('button:has-text("Conferma"), button:has-text("Confirm")').first().click();
}
async function waitResult(p) {
  await Promise.race([
    p.waitForSelector(':text("MATCH TELEPATICO"), :text("TELEPATHIC MATCH")', { timeout: T }),
    p.waitForSelector(':text("Non questa volta"), :text("Not this time")', { timeout: T }),
  ]);
}
async function autoAdv(p) {
  await Promise.any([
    p.waitForSelector('.symbol-btn', { state: 'visible', timeout: T }),
    p.waitForSelector('text=/Choose the new mode|Scegli la nuova modalità|is choosing|sta scegliendo/i', { state: 'visible', timeout: T }),
  ]);
}

(async () => {
  console.log('\n=== E2E telepathy_trials (Fase 2) ===\n');
  const key = getServiceKey();
  if (!key) { fail('SUPABASE_SERVICE_KEY mancante: impossibile leggere la tabella protetta'); process.exit(1); }

  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  // Per un ospite il sessionId è generato in memoria (non in localStorage). Lo fissiamo
  // a un valore noto PRIMA del caricamento (handleEnterGuest non lo rigenera): così
  // receiver_id è prevedibile e possiamo leggere/pulire con precisione i dati di test.
  const sidA = 'trial-e2e-a', sidB = 'trial-e2e-b';
  await ctxA.addInitScript((s) => localStorage.setItem('ga_session_id', s), sidA);
  await ctxB.addInitScript((s) => localStorage.setItem('ga_session_id', s), sidB);
  const pageA = await ctxA.newPage(), pageB = await ctxB.newPage();
  try {
    await Promise.all([guestLogin(pageA, 'TrialA', { appUrl: APP_URL, timeout: T }), guestLogin(pageB, 'TrialB', { appUrl: APP_URL, timeout: T })]);
    await Promise.all([goTele(pageA), goTele(pageB)]);
    console.log(`  • sessionId (fissati): A=${sidA} B=${sidB}`);

    await find(pageA); await pageA.waitForTimeout(500); await find(pageB);
    await Promise.all([
      pageA.waitForSelector('text=/Il tuo ruolo|Your role/', { timeout: T }),
      pageB.waitForSelector('text=/Il tuo ruolo|Your role/', { timeout: T }),
    ]);
    console.log('  • match trovato');

    for (let i = 1; i <= ROUNDS; i++) {
      const aSender = (await roleOf(pageA)) === 'sender';
      const sp = aSender ? pageA : pageB, rp = aSender ? pageB : pageA;
      await send(sp); await guess(rp);
      await Promise.all([waitResult(pageA), waitResult(pageB)]);
      await autoAdv(pageA);
      console.log(`  • round ${i}/${ROUNDS}`);
    }
    await pageA.waitForTimeout(1500); // lascia completare l'ultima RPC best-effort

    // Legge la tabella protetta con la service_role key (anon non può).
    const inList = `(${sidA},${sidB})`;
    const url = `${SUPABASE_URL}/rest/v1/telepathy_trials?receiver_id=in.${encodeURIComponent(inList)}&order=created_at.desc&select=*`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const rows = await res.json();
    console.log(`  • righe lette da telepathy_trials: ${Array.isArray(rows) ? rows.length : 'errore'}`);

    if (!Array.isArray(rows) || rows.length === 0) {
      fail('nessuna riga registrata in telepathy_trials (atteso >= 1)');
    } else {
      pass(`tentativi registrati: ${rows.length} (atteso ~${ROUNDS})`);
      const r = rows[0];
      (r.card_count === 3) ? pass(`card_count = ${r.card_count} (lvl3 → N=3)`) : fail(`card_count = ${r.card_count} (atteso 3)`);
      (r.mode === 'lvl3') ? pass(`mode = ${r.mode}`) : fail(`mode = ${r.mode} (atteso lvl3)`);
      (typeof r.is_hit === 'boolean') ? pass(`is_hit booleano (${r.is_hit})`) : fail(`is_hit non booleano: ${r.is_hit}`);
      (r.target_symbol && r.guess_symbol) ? pass(`target='${r.target_symbol}' guess='${r.guess_symbol}'`) : fail('target/guess mancanti');
      ([sidA, sidB].includes(r.receiver_id)) ? pass('receiver_id = identità del percipiente') : fail(`receiver_id inatteso: ${r.receiver_id}`);
      (r.is_hit === (r.target_symbol === r.guess_symbol)) ? pass('is_hit coerente con target==guess') : fail('is_hit incoerente');
    }

    // Verifica che l'anon NON possa leggere la tabella (RLS senza policy).
    const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
    const anonRes = await fetch(`${SUPABASE_URL}/rest/v1/telepathy_trials?select=*&limit=5`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    const anonRows = await anonRes.json().catch(() => null);
    (Array.isArray(anonRows) && anonRows.length === 0) ? pass('anon NON legge i dati (RLS senza policy)') : fail(`anon ha letto ${Array.isArray(anonRows) ? anonRows.length : '?'} righe (atteso 0)`);
  } catch (err) {
    fail(`errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    // Pulizia dati di test (append-only → cancello solo le righe dei due ospiti di test).
    if (sidA && sidB) {
      const enc = encodeURIComponent;
      await purge(SUPABASE_URL, [
        `telepathy_trials?receiver_id=in.(${enc(sidA)},${enc(sidB)})`,
        `telepathy_trials?sender_id=in.(${enc(sidA)},${enc(sidB)})`,
        `telepathy_scores?user_id=in.(${enc(sidA)},${enc(sidB)})`,
      ], { label: 'trials-e2e' });
    }
    console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
    await browser.close();
  }
})();
