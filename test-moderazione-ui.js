/**
 * Test interfaccia moderazione — segnalazione e blocco dall'app
 *
 * Copre quello che test-moderazione.js NON vede (quello prova le RPC):
 *   - il menu ⋯ compare sui contenuti altrui e NON sui propri
 *   - il dialog di segnalazione si apre, invia e conferma
 *   - il blocco fa sparire i contenuti del bloccato dal feed
 *   - l'utente bloccato compare nella lista del profilo e si può sbloccare
 *
 * Esecuzione: node test-moderazione-ui.js
 * Prerequisiti: server su http://localhost:4321, 16_moderazione.sql applicato.
 */
const { chromium } = require('playwright');
const { purge } = require('./test-helpers');

const APP_URL      = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT      = 20000;

const TS      = Date.now();
const NICK_A  = `ModUiA_${TS}`;
const NICK_B  = `ModUiB_${TS}`;
const EMAIL_A = `moduia_${TS}@test.com`;
const EMAIL_B = `moduib_${TS}@test.com`;
const PASS    = 'Password123!';
const POST_A  = `post di A ${TS}`;
const POST_B  = `post di B ${TS}`;

let passed = 0, failed = 0;
function pass(m) { console.log(`  ✅ ${m}`); passed++; }
function fail(m) { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; }

async function sbFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
               'Content-Type': 'application/json' }, ...opts });
}

async function cleanup() {
  const e = encodeURIComponent;
  for (const n of [NICK_A, NICK_B]) {
    await sbFetch(`consciousness_posts?author_nickname=eq.${e(n)}`, { method: 'DELETE' });
  }
  for (const m of [EMAIL_A, EMAIL_B]) {
    await sbFetch(`profiles?email=eq.${e(m)}`, { method: 'DELETE' });
  }
  // Senza chiave privilegiata purge() salta in silenzio e lascia righe in
  // content_reports e user_blocks, col test comunque verde. Meglio un rosso onesto.
  const res = await purge(SUPABASE_URL, [
    `user_blocks?blocker_nickname=eq.${e(NICK_A)}`,
    `user_blocks?blocker_nickname=eq.${e(NICK_B)}`,
    `content_reports?reporter_nickname=eq.${e(NICK_A)}`,
    `content_reports?reporter_nickname=eq.${e(NICK_B)}`,
  ], { label: 'moderazione-ui' });
  if (!res.ran) fail('pulizia NON eseguita: SUPABASE_SERVICE_KEY assente, il DB resta sporco');
}

async function register(page, nick, email) {
  await page.goto(APP_URL);
  await page.waitForSelector(':text("Guest")', { timeout: TIMEOUT });
  await page.locator(':text("Register")').first().click();
  await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
  await page.locator('input[type="text"]').fill(nick);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
  await page.locator('button.btn-primary').click();
  await page.waitForSelector(':text("Registered")', { timeout: TIMEOUT });
}

async function goToFeed(page) {
  await page.locator('button').filter({ hasText: /Coscienza|Consciousness/ }).first().click();
  await page.waitForSelector('h2:has-text("Feed Coscienza"), h2:has-text("Consciousness Feed")', { timeout: TIMEOUT });
}

async function publish(page, text) {
  await page.locator('textarea').first().fill(text);
  await page.locator('button:has-text("Pubblica"), button:has-text("Post")').first().click();
  await page.locator(`text=${text}`).first().waitFor({ state: 'visible', timeout: TIMEOUT });
}

/** Card del feed che contiene un certo testo. */
const cardCon = (page, text) =>
  page.locator('div.bg-glass').filter({ hasText: text }).first();

(async () => {
  console.log('— Setup —');
  await cleanup();

  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    await register(pageA, NICK_A, EMAIL_A);
    await register(pageB, NICK_B, EMAIL_B);
    console.log('  (due account registrati)');

    await goToFeed(pageA);
    await publish(pageA, POST_A);
    await goToFeed(pageB);
    await publish(pageB, POST_B);
    console.log('  (un post per ciascuno)');

    // B deve vedere il post di A
    await pageB.reload();
    await goToFeed(pageB);
    await pageB.locator(`text=${POST_A}`).first().waitFor({ state: 'visible', timeout: TIMEOUT });

    // 1) menu ⋯ presente sul contenuto ALTRUI
    const menuAltrui = cardCon(pageB, POST_A).locator('button[aria-label]').filter({ hasText: '⋯' });
    if (await menuAltrui.count() > 0) pass('il menu ⋯ compare sul post di un altro utente');
    else fail('il menu ⋯ NON compare sul post di un altro utente');

    // 2) menu ⋯ ASSENTE sul proprio contenuto
    const menuProprio = cardCon(pageB, POST_B).locator('button[aria-label]').filter({ hasText: '⋯' });
    if (await menuProprio.count() === 0) pass('il menu ⋯ NON compare sul proprio post');
    else fail('il menu ⋯ compare sul proprio post (non dovrebbe)');

    // 3) il dialog di segnalazione si apre
    await menuAltrui.first().click();
    await pageB.locator('button:has-text("Segnala"), button:has-text("Report")').first().click();
    const dialogTitolo = pageB.locator('h3:has-text("Segnala contenuto"), h3:has-text("Report content")');
    try {
      await dialogTitolo.first().waitFor({ state: 'visible', timeout: 8000 });
      pass('il dialog di segnalazione si apre');
    } catch { fail('il dialog di segnalazione non si apre'); }

    // 4) invio della segnalazione con motivazione
    await pageB.locator('input[type="radio"][value="harassment"]').check();
    await pageB.locator('textarea').last().fill('nota di test UI');
    await pageB.locator('button:has-text("Invia segnalazione"), button:has-text("Send report")').first().click();
    try {
      await pageB.locator('text=/Segnalazione inviata|Report sent/').first().waitFor({ state: 'visible', timeout: 8000 });
      pass('la segnalazione viene inviata e confermata');
    } catch { fail('nessuna conferma dopo l\'invio della segnalazione'); }

    // 5) la segnalazione è arrivata nel database (letta con la chiave privilegiata)
    const { getServiceKey } = require('./test-helpers');
    const svc = getServiceKey();
    if (svc) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/content_reports?reporter_nickname=eq.${encodeURIComponent(NICK_B)}&select=reason,content_type,content_snapshot`,
        { headers: { apikey: svc, Authorization: `Bearer ${svc}` } });
      const rows = await res.json().catch(() => null);
      const ok = Array.isArray(rows) && rows.length === 1 &&
                 rows[0].reason === 'harassment' && rows[0].content_type === 'post' &&
                 String(rows[0].content_snapshot).includes(POST_A);
      ok ? pass('la segnalazione è registrata con motivazione, tipo e testo segnalato')
         : fail(`segnalazione non registrata correttamente: ${JSON.stringify(rows)}`);
    } else {
      console.warn('  ⚠️  chiave privilegiata assente: contenuto della segnalazione non verificato.');
    }

    // 6) blocco dal menu ⋯ — passa da un dialog di conferma
    await menuAltrui.first().click();
    await pageB.locator('button:has-text("Blocca"), button:has-text("Block")').first().click();

    const dialogBlocco = pageB.locator('h3:has-text("Vuoi bloccare"), h3:has-text("Block this person")');
    try {
      await dialogBlocco.first().waitFor({ state: 'visible', timeout: 8000 });
      pass('il blocco chiede conferma prima di agire');
    } catch { fail('il blocco avviene senza chiedere conferma'); }

    // conferma: il pulsante dentro il dialog, non la voce di menu
    await pageB.locator('div').filter({ has: dialogBlocco })
      .locator('button:has-text("Blocca"), button:has-text("Block")').last().click();
    try {
      await pageB.locator('text=/Utente bloccato|User blocked/').first().waitFor({ state: 'visible', timeout: 8000 });
      pass('il blocco viene eseguito dopo la conferma');
    } catch { fail('nessuna conferma dopo il blocco'); }

    // 7) il proprio post resta visibile — e serve come PROVA CHE IL FEED È CARICATO.
    //    Va verificato per primo: se si controllasse prima l'assenza del post
    //    bloccato, un feed non ancora caricato farebbe passare quel controllo per
    //    il motivo sbagliato (falso verde).
    await pageB.reload();
    await goToFeed(pageB);
    try {
      await pageB.locator(`text=${POST_B}`).first().waitFor({ state: 'visible', timeout: TIMEOUT });
      pass('il proprio post resta visibile dopo il blocco');
    } catch { fail('anche il proprio post è sparito dopo il blocco'); }

    // 8) ora l'assenza del post del bloccato è significativa
    await pageB.waitForTimeout(2500);   // un ciclo di polling
    if (await pageB.locator(`text=${POST_A}`).count() === 0) pass('dopo il blocco il post del bloccato non è più visibile');
    else fail('dopo il blocco il post del bloccato è ancora visibile');

    // 9) il bloccato compare nella lista del profilo e si può sbloccare
    // Il proprio profilo si apre cliccando il nickname nell'intestazione
    // (src/app.jsx: div con title={t.editProfile}), non da un pulsante di tab.
    await pageB.locator('div[title]').filter({ hasText: NICK_B }).first().click();
    await pageB.locator('text=/Utenti bloccati|Blocked users/').first().waitFor({ state: 'visible', timeout: TIMEOUT });
    if (await pageB.locator(`text=${NICK_A}`).count() > 0) pass('il bloccato compare nella lista del profilo');
    else fail('il bloccato non compare nella lista del profilo');

    await pageB.locator('button:has-text("Sblocca"), button:has-text("Unblock")').first().click();
    try {
      await pageB.locator('text=/Utente sbloccato|User unblocked/').first().waitFor({ state: 'visible', timeout: 8000 });
      pass('lo sblocco funziona dalla lista del profilo');
    } catch { fail('lo sblocco non conferma'); }

  } catch (e) {
    fail(`eccezione: ${e.message}`);
  } finally {
    await browser.close();
    console.log('— Pulizia —');
    await cleanup();
  }

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  if (failed > 0) process.exitCode = 1;
})();
