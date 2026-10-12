/**
 * Test tab Coscienza — Global Awakening
 *
 * Copre:
 *   - Apertura tab Coscienza e titolo feed
 *   - Pubblicazione post e visibilità immediata (A)
 *   - Visibilità post da parte di B (via polling ~10s)
 *   - Apertura commenti su un post
 *   - Commento di B e visibilità immediata in UI di B
 *   - A vede il commento di B (fresh SELECT)
 *   - Verifica in Supabase di post e commenti
 *   - Sezione Mappa (Global Network) visibile
 *   - Community list mostra utenti online
 *
 * Esecuzione: node test-coscienza.js
 * Prerequisiti: app su http://localhost:4321/app.html, npx playwright install chromium
 */

const { chromium } = require('playwright');
const { purge, requireServiceKey } = require("./test-helpers");
requireServiceKey();

const APP_URL      = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT      = 20000;
const POLL_WAIT    = 13000;

const TS      = Date.now();
const NICK_A  = `CosA_${TS}`;
const NICK_B  = `CosB_${TS}`;

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
  if (res.status === 204) return null;
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

async function goToConsciousness(page, nick) {
  await page.locator('button').filter({ hasText: /Coscienza|Consciousness/ }).first().click();
  await page.waitForSelector('h2:has-text("Feed Coscienza"), h2:has-text("Consciousness Feed")', { timeout: TIMEOUT });
  log(nick, 'Tab Coscienza aperto');
}

async function cleanup() {
  try {
    // Dalla 38 post e commenti non si cancellano con la chiave pubblica: pulizia con quella di servizio.
    const e = encodeURIComponent;
    await purge(SUPABASE_URL, [
      `consciousness_comments?author_nickname=eq.${e(NICK_A)}`,
      `consciousness_comments?author_nickname=eq.${e(NICK_B)}`,
      `consciousness_posts?author_nickname=eq.${e(NICK_A)}`,
      `consciousness_posts?author_nickname=eq.${e(NICK_B)}`,
    ], { label: 'coscienza' });
  } catch (e) {
    console.warn('  Cleanup parzialmente fallito:', e.message);
  }
}

// ── Test guasto rete su pubblica post → toast, rollback, testo ripristinato ──
// Caso indipendente: abilita l'abort sulle insert dei post, pubblica, e verifica
// toast + rollback + testo ripristinato. NON richiede il backend live (abort).
async function testNetworkErrorOnPublish() {
  console.log('\n📋 Test 10: Guasto rete su pubblica post → toast + rollback + testo ripristinato');
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();
  let ok = true;
  const okPass = (m) => { pass(m); };
  const okFail = (m) => { fail(m); ok = false; };
  try {
    // Login ospite (stesso flow di loginAsGuest)
    await page.goto(APP_URL);
    await page.waitForSelector('button:has-text("Ospite"), button:has-text("Guest")', { timeout: TIMEOUT });
    await page.locator('button:has-text("Ospite"), button:has-text("Guest")').first().click();
    await page.locator('input[placeholder*="username"], input[placeholder*="Username"]').first().fill(`NetTestPost_${TS}`);
    await page.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")').click();
    await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
    // Tab Coscienza
    await page.locator('button').filter({ hasText: /Coscienza|Consciousness/ }).first().click();
    await page.waitForSelector('h2:has-text("Feed Coscienza"), h2:has-text("Consciousness Feed")', { timeout: TIMEOUT });

    const txt = 'POST NETFAIL ' + Date.now();
    // Blocca le insert dei post (anche le SELECT del poll, ma il caso valuta solo il fallimento dell'insert)
    await page.route('**/consciousness_posts*', r => r.abort());
    await page.locator('textarea').first().fill(txt);
    await page.locator('button:has-text("Pubblica"), button:has-text("Post")').first().click();

    // Toast appare
    try {
      await page.locator('text=/Problema di connessione|Connection problem/').first().waitFor({ state: 'visible', timeout: 6000 });
      okPass('Toast d\'errore mostrato su guasto rete in pubblicazione');
    } catch {
      okFail('Toast d\'errore NON mostrato su guasto rete in pubblicazione');
    }

    // Il post NON resta nel feed (rollback). Il contenuto dei post è reso come
    // <p class="text-white">{post.content}</p> nelle card; la textarea col testo
    // ripristinato NON è un <p>, quindi filtriamo sui paragrafi del feed.
    const ghostInFeed = await page.locator('p.text-white').filter({ hasText: txt }).count();
    if (ghostInFeed === 0) okPass('Post ottimistico rimosso (rollback)');
    else okFail('Post fantasma rimasto nel feed dopo errore');

    // Testo ripristinato nella textarea
    const restored = await page.locator('textarea').first().inputValue();
    if (restored === txt) okPass('Testo ripristinato nella textarea');
    else okFail('Testo NON ripristinato (era: "' + restored + '")');

    await page.unroute('**/consciousness_posts*');
  } catch (e) {
    okFail('Eccezione nel test guasto rete: ' + e.message);
  } finally {
    await browser.close();
  }
  return ok;
}

// ── Test guasto rete su commento post → toast, rollback, input ripristinato ──
// Caso indipendente: pubblica un post (serve backend live), espande i commenti
// (la SELECT deve riuscire), POI abilita l'abort sulle insert dei commenti e invia
// il commento → toast + rollback ottimistico + testo ripristinato nell'input.
async function testNetworkErrorOnComment() {
  console.log('\n📋 Test 11: Guasto rete su commento post → toast + rollback + input ripristinato');
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();
  let ok = true;
  const okPass = (m) => { pass(m); };
  const okFail = (m) => { fail(m); ok = false; };
  try {
    // Login ospite (stesso flow di loginAsGuest)
    await page.goto(APP_URL);
    await page.waitForSelector('button:has-text("Ospite"), button:has-text("Guest")', { timeout: TIMEOUT });
    await page.locator('button:has-text("Ospite"), button:has-text("Guest")').first().click();
    await page.locator('input[placeholder*="username"], input[placeholder*="Username"]').first().fill(`NetTestCmt_${TS}`);
    await page.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")').click();
    await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
    // Tab Coscienza
    await page.locator('button').filter({ hasText: /Coscienza|Consciousness/ }).first().click();
    await page.waitForSelector('h2:has-text("Feed Coscienza"), h2:has-text("Consciousness Feed")', { timeout: TIMEOUT });

    // Pubblica un post (serve backend live) per avere qualcosa da commentare
    const postTxt = 'POST per commento NETFAIL ' + Date.now();
    await page.locator('textarea').first().fill(postTxt);
    await page.locator('button:has-text("Pubblica"), button:has-text("Post")').first().click();
    const postCard = page.locator('div.bg-glass').filter({
      has: page.locator('p.text-white', { hasText: postTxt })
    }).first();
    await postCard.waitFor({ state: 'visible', timeout: 8000 });

    // Espandi i commenti del post (la SELECT su consciousness_comments deve riuscire ORA)
    const commentsToggle = postCard.locator('button.btn-secondary').filter({ hasText: /commenti|comments/ }).first();
    await commentsToggle.click();
    const cmtInput = postCard.locator('input[placeholder*="commento"], input[placeholder*="comment"]').first();
    await cmtInput.waitFor({ timeout: TIMEOUT });

    const cmt = 'COMMENTO NETFAIL ' + Date.now();
    // ORA blocca le insert dei commenti (la SELECT di espansione è già avvenuta)
    await page.route('**/consciousness_comments*', r => r.abort());
    await cmtInput.fill(cmt);
    await cmtInput.press('Enter');

    // Toast appare
    try {
      await page.locator('text=/Problema di connessione|Connection problem/').first().waitFor({ state: 'visible', timeout: 6000 });
      okPass('Toast d\'errore mostrato su guasto rete in commento');
    } catch {
      okFail('Toast d\'errore NON mostrato su guasto rete in commento');
    }

    // Commento ottimistico rimosso (rollback). Il commento è reso come <p> nella card;
    // l'input ripristinato non è un <p>, quindi filtriamo sui paragrafi della card.
    const ghost = await postCard.locator('p').filter({ hasText: cmt }).count();
    if (ghost === 0) okPass('Commento ottimistico rimosso (rollback)');
    else okFail('Commento fantasma rimasto');

    // Testo ripristinato nell'input commento
    const restored = await cmtInput.inputValue();
    if (restored === cmt) okPass('Testo ripristinato nell\'input commento');
    else okFail('Testo NON ripristinato (era: "' + restored + '")');

    await page.unroute('**/consciousness_comments*');
  } catch (e) {
    okFail('Eccezione nel test guasto rete commento: ' + e.message);
  } finally {
    await browser.close();
  }
  return ok;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  TEST COSCIENZA — Global Awakening');
  console.log(`  Utenti: ${NICK_A} ↔ ${NICK_B}`);
  console.log('══════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  for (const [p, label] of [[pageA, 'BROWSER-A'], [pageB, 'BROWSER-B']]) {
    p.on('console', msg => { if (msg.type() === 'error') log(label, `error: ${msg.text()}`); });
  }

  const POST_TEXT    = `Post di test da ${NICK_A} — ${TS}`;
  const COMMENT_TEXT = `Commento di ${NICK_B} — ${TS}`;

  try {
    // ── Setup ──────────────────────────────────────────────────────────────
    console.log('📋 Setup: login e navigazione');
    await Promise.all([
      loginAsGuest(pageA, NICK_A),
      loginAsGuest(pageB, NICK_B),
    ]);
    await Promise.all([
      goToConsciousness(pageA, NICK_A),
      goToConsciousness(pageB, NICK_B),
    ]);

    // ── Test 1: Titolo e struttura tab ────────────────────────────────────
    console.log('\n📋 Test 1: Titolo tab Coscienza visibile per entrambi');
    const titleA = await pageA.locator('h2').filter({ hasText: /Feed Coscienza|Consciousness Feed/ }).count();
    const titleB = await pageB.locator('h2').filter({ hasText: /Feed Coscienza|Consciousness Feed/ }).count();
    if (titleA > 0 && titleB > 0) {
      pass('Titolo "Feed Coscienza" visibile per entrambi');
    } else {
      fail(`Titolo mancante — A:${titleA} B:${titleB}`);
    }

    // Verifica textarea e bottone "Pubblica" presenti
    const textareaA = await pageA.locator('textarea').count();
    const publishBtn = await pageA.locator('button:has-text("Pubblica"), button:has-text("Post")').first().count();
    if (textareaA > 0 && publishBtn > 0) {
      pass('Textarea e bottone "Pubblica" presenti');
    } else {
      fail(`Form post mancante — textarea:${textareaA} btn:${publishBtn}`);
    }

    // ── Test 2: Bottone "Pubblica" disabilitato con textarea vuota ─────────
    console.log('\n📋 Test 2: Bottone "Pubblica" disabilitato se textarea vuota');
    const btnDisabled = await pageA.locator('button:has-text("Pubblica"), button:has-text("Post")').first().isDisabled();
    if (btnDisabled) {
      pass('Bottone "Pubblica" disabilitato con textarea vuota');
    } else {
      fail('Bottone "Pubblica" NON disabilitato con textarea vuota');
    }

    // ── Test 3: A pubblica un post → appare subito in UI ──────────────────
    console.log('\n📋 Test 3: A pubblica un post');
    await pageA.locator('textarea').first().fill(POST_TEXT);
    const btnEnabled = await pageA.locator('button:has-text("Pubblica"), button:has-text("Post")').first().isEnabled();
    if (btnEnabled) {
      pass('Bottone "Pubblica" si abilita dopo aver scritto');
    } else {
      fail('Bottone "Pubblica" rimane disabilitato dopo input');
    }

    await pageA.locator('button:has-text("Pubblica"), button:has-text("Post")').first().click();
    log(NICK_A, `Post pubblicato: "${POST_TEXT.substring(0, 40)}..."`);

    // Post deve apparire subito (fix .select() aggiunto)
    try {
      await pageA.locator('div.bg-glass').filter({ hasText: POST_TEXT.substring(0, 30) }).waitFor({ timeout: 5000 });
      pass('Post appare subito in UI di A (aggiornamento locale)');
    } catch {
      fail('Post NON appare entro 5s in UI di A');
    }

    // Textarea deve essere vuota dopo invio (polling sul DOM per evitare race con React)
    const textareaCleared = await pageA.waitForFunction(
      () => { const ta = document.querySelector('textarea'); return ta && ta.value === ''; },
      { timeout: 3000 }
    ).then(() => true).catch(() => false);
    if (textareaCleared) {
      pass('Textarea svuotata dopo pubblicazione');
    } else {
      fail('Textarea non svuotata dopo pubblicazione');
    }

    // ── Test 4: B vede il post di A ───────────────────────────────────────
    console.log('\n📋 Test 4: B vede il post di A');
    log(NICK_B, `Aspetto il post di ${NICK_A} (max ${POLL_WAIT / 1000}s)...`);
    try {
      await pageB.locator('div.bg-glass').filter({ hasText: POST_TEXT.substring(0, 30) }).waitFor({ timeout: POLL_WAIT });
      pass(`${NICK_B} vede il post di ${NICK_A}`);
    } catch {
      fail(`${NICK_B} NON vede il post di ${NICK_A} dopo ${POLL_WAIT / 1000}s`);
    }

    // Verifica DB
    await pageA.waitForTimeout(1000);
    const postsDB = await sbFetch(`consciousness_posts?author_nickname=eq.${encodeURIComponent(NICK_A)}&select=id,content`);
    let postId = null;
    if (postsDB && postsDB.length > 0) {
      postId = postsDB[0].id;
      pass(`Post trovato in DB — id: ${postId}`);
    } else {
      fail('Post NON trovato in Supabase');
    }

    // ── Test 5: B apre commenti e scrive un commento ──────────────────────
    console.log('\n📋 Test 5: B apre commenti e scrive un commento');
    const postCardB = pageB.locator('div.bg-glass').filter({ hasText: POST_TEXT.substring(0, 30) }).first();
    const commentsToggleB = postCardB.locator('button.btn-secondary').filter({ hasText: /commenti|comments/ }).first();
    await commentsToggleB.click();
    log(NICK_B, 'Sezione commenti aperta');

    const commentInputB = postCardB.locator('input[placeholder*="commento"], input[placeholder*="comment"]').first();
    await commentInputB.waitFor({ timeout: TIMEOUT });
    await commentInputB.fill(COMMENT_TEXT);
    await commentInputB.press('Enter');
    log(NICK_B, `Commento inviato: "${COMMENT_TEXT}"`);

    // Commento deve apparire subito in UI di B (fix .select() aggiunto)
    await pageB.waitForTimeout(1500);
    const commentInB = await postCardB.locator('p').filter({ hasText: COMMENT_TEXT.substring(0, 20) }).count();
    if (commentInB > 0) {
      pass('Commento appare subito in UI di B');
    } else {
      fail('Commento NON appare in UI di B dopo invio');
    }

    // Input svuotato
    const commentInputValue = await commentInputB.inputValue();
    if (!commentInputValue) {
      pass('Input commento svuotato dopo invio');
    } else {
      fail('Input commento non svuotato dopo invio');
    }

    // ── Test 6: Verifica commento in Supabase ─────────────────────────────
    console.log('\n📋 Test 6: Commento salvato in Supabase');
    const commentsDB = await sbFetch(`consciousness_comments?author_nickname=eq.${encodeURIComponent(NICK_B)}&select=content,post_id`);
    if (commentsDB && commentsDB.length > 0) {
      pass(`Commento trovato in DB: "${commentsDB[0].content.substring(0, 40)}"`);
    } else {
      fail('Commento NON trovato in Supabase');
    }

    // ── Test 7: A vede il commento di B ───────────────────────────────────
    console.log('\n📋 Test 7: A vede il commento di B');
    // Usa locator con has: per trovare la card del post specifico di A
    const postCardA = pageA.locator('div.bg-glass').filter({
      has: pageA.locator('p.text-white', { hasText: POST_TEXT.substring(0, 25) })
    }).first();
    // Prendi il primo btn-secondary nella card (è sempre il toggle commenti)
    const commentsToggleA = postCardA.locator('button.btn-secondary').first();
    await pageA.waitForTimeout(500); // stabilizza dopo poll
    await commentsToggleA.click();
    log(NICK_A, 'Sezione commenti aperta');

    // Fresh SELECT da DB — deve trovare il commento di B
    await pageA.waitForTimeout(2000);
    const commentInA = await postCardA.locator('p').filter({ hasText: COMMENT_TEXT.substring(0, 20) }).count();
    if (commentInA > 0) {
      pass(`${NICK_A} vede il commento di ${NICK_B}`);
    } else {
      fail(`${NICK_A} NON vede il commento di ${NICK_B}`);
    }

    // Verifica counter commenti nel bottone toggle
    await commentsToggleA.click(); // chiudi
    await pageA.waitForTimeout(500);
    await commentsToggleA.click(); // riapri — ora deve mostrare count
    await pageA.waitForTimeout(1000);
    const toggleText = await commentsToggleA.textContent();
    if (toggleText && toggleText.includes('(')) {
      pass(`Bottone toggle mostra counter commenti: "${toggleText.trim()}"`);
    } else {
      fail(`Bottone toggle non mostra counter — testo: "${toggleText?.trim()}"`);
    }

    // ── Test 8: Sezione Mappa (Global Network) visibile ───────────────────
    console.log('\n📋 Test 8: Sezione Mappa (Global Network)');
    const mapTitleA = await pageA.locator('h2').filter({ hasText: /Rete Globale|Global Network/ }).count();
    if (mapTitleA > 0) {
      pass('Sezione "Rete Globale" visibile nel tab Coscienza');
    } else {
      fail('Sezione "Rete Globale" NON trovata');
    }

    // Mappa SVG presente
    const mapContainer = await pageA.locator('.map-container').count();
    if (mapContainer > 0) {
      pass('Mappa SVG (.map-container) presente');
    } else {
      fail('Mappa SVG (.map-container) non trovata');
    }

    // ── Test 9: Community list visibile ───────────────────────────────────
    console.log('\n📋 Test 9: Community list visibile');
    const communityLabel = await pageA.locator('h3').filter({ hasText: /Community|Comunita/ }).count();
    if (communityLabel > 0) {
      pass('Label "Community" visibile nella sezione mappa');
    } else {
      fail('Label "Community" non trovata');
    }

    // Contatore starseeds presenti
    const starseedsText = await pageA.locator('span').filter({ hasText: /starseeds/ }).count();
    if (starseedsText > 0) {
      pass('Contatore starseeds visibili presente');
    } else {
      fail('Contatore starseeds non trovato');
    }

  } catch (err) {
    fail(`Errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    // Caso guasto rete (browser dedicato, non richiede backend live)
    try {
      await testNetworkErrorOnPublish();
    } catch (e) {
      fail(`Errore nel caso guasto rete: ${e.message}`);
    }

    // Caso guasto rete su commento (richiede backend live per post + SELECT iniziale)
    try {
      await testNetworkErrorOnComment();
    } catch (e) {
      fail(`Errore nel caso guasto rete commento: ${e.message}`);
    }

    console.log('\n  (Pulizia post e commenti test da Supabase...)');
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
