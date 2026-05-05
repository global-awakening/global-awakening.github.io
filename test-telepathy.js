/**
 * Test automatico della funzionalità Telepatia
 * Usa Playwright per simulare due utenti in parallelo.
 *
 * Esecuzione:
 *   node test-telepathy.js
 *
 * Prerequisiti:
 *   - App in esecuzione su http://localhost:4321/app.html
 *   - npx playwright install chromium
 */

const { chromium } = require('playwright');

const APP_URL = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TIMEOUT = 25000;

function log(user, msg) {
  const ts = new Date().toLocaleTimeString('it-IT');
  console.log(`[${ts}] [${user}] ${msg}`);
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); process.exitCode = 1; }

async function loginAsGuest(page, nickname) {
  await page.goto(APP_URL);
  await page.waitForSelector('button:has-text("Ospite"), button:has-text("Guest")', { timeout: TIMEOUT });

  // Clicca tab Ospite (potrebbe già essere attivo)
  const guestTab = page.locator('button:has-text("Ospite"), button:has-text("Guest")').first();
  await guestTab.click();

  // Inserisci nickname
  await page.locator('input[placeholder*="username"], input[placeholder*="Username"]').first().fill(nickname);

  // Entra
  await page.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")').click();

  // Aspetta che la schermata di login sparisca
  await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
  log(nickname, `Login come ospite completato`);
}

async function goToTelepathy(page, nickname) {
  const tab = page.locator('button').filter({ hasText: /Telepatia|Telepathy/ }).first();
  await tab.click();
  await page.waitForSelector('text=Telepathy Training', { timeout: TIMEOUT });
  log(nickname, `Tab Telepatia aperto`);
}

async function clickFindPartner(page, nickname) {
  const btn = page.locator('button:has-text("Abbinamento Random"), button:has-text("Random Match"), button:has-text("Find Partner")').first();
  await btn.click();
  log(nickname, `Cliccato "Abbinamento Random"`);
}

async function waitForPartnerFound(page, nickname) {
  await page.waitForSelector('text=/Il tuo ruolo|Your role/', { timeout: TIMEOUT });
  log(nickname, `Partner trovato!`);
}

async function getRole(page) {
  await page.waitForSelector('text=/Il tuo ruolo|Your role/', { timeout: TIMEOUT });
  // Il ruolo è nel paragrafo immediatamente dopo "Il tuo ruolo"
  const roleEl = page.locator('p.text-white.font-bold').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first();
  const text = await roleEl.textContent({ timeout: TIMEOUT });
  return text.trim();
}

async function sendSymbol(page, nickname) {
  // Sceglie il primo simbolo disponibile
  const symbols = page.locator('.symbol-btn').first();
  await symbols.click();
  log(nickname, `Simbolo selezionato`);

  await page.locator('button:has-text("Invia Telepaticamente"), button:has-text("Send Telepathically")').click();
  log(nickname, `Simbolo inviato`);
}

async function guessSymbol(page, nickname) {
  // Indovina il primo simbolo (potrebbe essere sbagliato, ma testa il flusso)
  await page.waitForSelector('.symbol-btn', { timeout: TIMEOUT });
  const symbols = page.locator('.symbol-btn').first();
  await symbols.click();
  log(nickname, `Simbolo indovinato (tentativo)`);

  await page.locator('button:has-text("Conferma"), button:has-text("Confirm")').first().click();
  log(nickname, `Risposta inviata`);
}

async function waitForResult(page, nickname) {
  await Promise.race([
    page.waitForSelector(':text("MATCH TELEPATICO"), :text("TELEPATHIC MATCH")', { timeout: TIMEOUT }),
    page.waitForSelector(':text("Non questa volta"), :text("Not this time")', { timeout: TIMEOUT }),
  ]);
  const matched = (await page.locator(':text("MATCH TELEPATICO"), :text("TELEPATHIC MATCH")').count()) > 0;
  log(nickname, `Risultato: ${matched ? '✨ MATCH TELEPATICO!' : 'Non questa volta'}`);
  return matched;
}

async function clickAncora(page, nickname) {
  await page.locator('button:has-text("Ancora"), button:has-text("Again")').first().click();
  log(nickname, `Cliccato "Ancora"`);
}

async function clickTerminaSessione(page, nickname) {
  await page.locator('button:has-text("Termina Sessione"), button:has-text("End Session")').first().click();
  log(nickname, `Cliccato "Termina Sessione"`);
}

async function waitForLobby(page, nickname) {
  await page.waitForSelector('button:has-text("Abbinamento Random"), button:has-text("Random Match"), button:has-text("Find Partner")', { timeout: TIMEOUT });
  log(nickname, `Tornato in lobby`);
}

// Usata quando l'utente deve prima vedere il banner "partner ha terminato" e cliccare "Torna alla lobby"
async function waitForLobbyAfterPartnerLeft(page, nickname) {
  // Aspetta il banner di disconnessione e clicca "Torna alla lobby"
  await page.waitForSelector(':text("ha terminato la sessione"), :text("ended the session")', { timeout: TIMEOUT });
  log(nickname, `Banner disconnessione ricevuto`);
  await page.locator('button:has-text("Torna alla lobby"), button:has-text("Back to lobby")').first().click();
  await waitForLobby(page, nickname);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n═══════════════════════════════════════');
  console.log('  TEST TELEPATIA — Global Awakening');
  console.log('═══════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 300 });

  // Due contesti separati = due "utenti" indipendenti
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // Intercetta warning/error dai browser per debug
  pageA.on('console', msg => { if (msg.type() === 'warning' || msg.type() === 'error') log('BROWSER-A', `${msg.type()}: ${msg.text()}`); });
  pageB.on('console', msg => { if (msg.type() === 'warning' || msg.type() === 'error') log('BROWSER-B', `${msg.type()}: ${msg.text()}`); });

  try {
    // ── Test 1: Login ──────────────────────────────────────────────────────
    console.log('📋 Test 1: Login come ospite');
    await Promise.all([
      loginAsGuest(pageA, 'TestUserA'),
      loginAsGuest(pageB, 'TestUserB'),
    ]);
    pass('Entrambi gli utenti hanno fatto login');

    // ── Test 2: Navigazione Telepatia ──────────────────────────────────────
    console.log('\n📋 Test 2: Apertura tab Telepatia');
    await Promise.all([
      goToTelepathy(pageA, 'TestUserA'),
      goToTelepathy(pageB, 'TestUserB'),
    ]);
    pass('Entrambi nel tab Telepatia');

    // ── Test 3: Lista utenti online ────────────────────────────────────────
    console.log('\n📋 Test 3: Lista utenti online');
    // Aspetta che il polling popoli la lista (10s intervallo)
    await pageA.waitForTimeout(11000);
    const onlineList = await pageA.locator('button:has-text("Proponi"), button:has-text("Invite")').count();
    if (onlineList > 0) {
      pass(`TestUserA vede ${onlineList} utente/i con bottone "Proponi"`);
    } else {
      fail('TestUserA non vede nessun utente con bottone "Proponi"');
    }

    // ── Test 4: Abbinamento random ─────────────────────────────────────────
    console.log('\n📋 Test 4: Abbinamento random (Find Partner)');
    await clickFindPartner(pageA, 'TestUserA');
    await pageA.waitForTimeout(500);
    await clickFindPartner(pageB, 'TestUserB');

    await Promise.all([
      waitForPartnerFound(pageA, 'TestUserA'),
      waitForPartnerFound(pageB, 'TestUserB'),
    ]);
    pass('Match trovato — entrambi vedono il partner');

    // ── Test 4b: Banda status partner visibile e prominente ─────────────────
    console.log('\n📋 Test 4b: Banda status partner');
    const statusBandA = pageA.locator('p').filter({ hasText: /(aspetta|waiting|sta scegliendo|is choosing|is guessing|sta indovinando|simbolo inviato|symbol sent)/i }).first();
    await statusBandA.waitFor({ timeout: 8000 });
    const fontSize = await statusBandA.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    if (fontSize >= 16) {
      pass(`Status banner ben visibile (font ${fontSize}px ≥ 16px)`);
    } else {
      fail(`Status banner troppo piccolo (font ${fontSize}px < 16px)`);
    }

    // ── Test 5: Gioco (sender invia, receiver indovina) ───────────────────
    console.log('\n📋 Test 5: Round di telepatia');

    // Determina chi è sender e chi receiver
    // Sender/Receiver in EN, Mittente/Ricevitore in IT — l'app default e' EN
    const roleA = await pageA.locator('p').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first().textContent();
    const isSenderA = roleA.includes('Sender') || roleA.includes('Mittente');
    log('TestUserA', `Ruolo: ${isSenderA ? 'Sender' : 'Receiver'}`);
    log('TestUserB', `Ruolo: ${isSenderA ? 'Receiver' : 'Sender'}`);

    const senderPage = isSenderA ? pageA : pageB;
    const receiverPage = isSenderA ? pageB : pageA;
    const senderName = isSenderA ? 'TestUserA' : 'TestUserB';
    const receiverName = isSenderA ? 'TestUserB' : 'TestUserA';

    await sendSymbol(senderPage, senderName);
    await guessSymbol(receiverPage, receiverName);

    const [matchA] = await Promise.all([
      waitForResult(pageA, 'TestUserA'),
      waitForResult(pageB, 'TestUserB'),
    ]);
    pass('Entrambi vedono il risultato del round');

    // ── Test 6: Ancora ─────────────────────────────────────────────────────
    console.log('\n📋 Test 6: Pulsante "Ancora"');
    await clickAncora(pageA, 'TestUserA');
    await clickAncora(pageB, 'TestUserB');

    // Dopo "Ancora" entrambi devono tornare al gioco (sender picker o receiver wait)
    await pageA.waitForTimeout(3000);
    const symbolsA = await pageA.locator('.symbol-btn').count();
    const waitingA = await pageA.locator(':text("Simbolo inviato"), :text("Aspetta")').count();
    if (symbolsA > 0 || waitingA > 0) {
      pass('TestUserA tornato in gioco dopo "Ancora"');
    } else {
      fail('TestUserA NON è tornato in gioco dopo "Ancora"');
    }

    // ── Test 7: Termina Sessione ───────────────────────────────────────────
    console.log('\n📋 Test 7: "Termina Sessione"');

    // Prima invia un nuovo simbolo per avere il bottone Termina Sessione
    await sendSymbol(senderPage, senderName);
    await guessSymbol(receiverPage, receiverName);
    await waitForResult(pageA, 'TestUserA');

    await clickTerminaSessione(pageA, 'TestUserA');
    await pageA.waitForSelector('text=/Sessione Completata|Session Complete/', { timeout: TIMEOUT });
    pass('TestUserA vede la schermata "Sessione Completata"');

    // TestUserB vede il banner "partner ha terminato" e clicca "Torna alla lobby"
    await waitForLobbyAfterPartnerLeft(pageB, 'TestUserB');
    pass('TestUserB tornato in lobby dopo aver cliccato "Torna alla lobby"');

    // ── Test 7b: X termina sessione DURANTE un round (prima del risultato) ──
    console.log('\n📋 Test 7b: X termina durante round attivo');
    // pageA è ancora su "Sessione Completata": prima riportala in lobby
    try {
      await pageA.locator('button:has-text("Torna alla Lobby"), button:has-text("Back to Lobby")').click({ timeout: 5000 });
    } catch { /* già in lobby */ }
    await waitForLobby(pageA, 'TestUserA');
    await clickFindPartner(pageA, 'TestUserA');
    await pageA.waitForTimeout(500);
    await clickFindPartner(pageB, 'TestUserB');
    await Promise.all([
      waitForPartnerFound(pageA, 'TestUserA'),
      waitForPartnerFound(pageB, 'TestUserB'),
    ]);
    pass('Re-match per test 7b ok');

    // Click X (senza inviare simboli) su pageA
    const xBtnA = pageA.locator(`button[aria-label="Termina Sessione"], button[aria-label="End Session"]`).first();
    await xBtnA.click();
    await pageA.waitForSelector('text=/Uscire dalla sessione|Leave session/', { timeout: 5000 });
    pass('Modale conferma apparso');

    await pageA.locator('button:has-text("Esci"), button:has-text("Leave")').first().click();
    await pageA.waitForSelector('text=/Sessione Completata|Session Complete/', { timeout: TIMEOUT });
    pass('TestUserA fuori sessione tramite X durante round attivo');

    await waitForLobbyAfterPartnerLeft(pageB, 'TestUserB');
    pass('TestUserB notificato di uscita partner');

    // Riporta TestUserA in lobby per i test successivi
    try {
      await pageA.locator('button:has-text("Torna alla Lobby"), button:has-text("Back to Lobby")').click({ timeout: 5000 });
    } catch { /* già in lobby */ }
    await waitForLobby(pageA, 'TestUserA');

    // ── Test 8: Invito diretto ────────────────────────────────────────────
    console.log('\n📋 Test 8: Invito diretto (Proponi → Accetta)');

    // TestUserA torna in lobby (potrebbe essere in "Sessione Completata" o già in lobby)
    try {
      await pageA.locator('button:has-text("Torna alla Lobby"), button:has-text("Back to Lobby")').click({ timeout: 5000 });
    } catch { /* già in lobby */ }
    await waitForLobby(pageA, 'TestUserA');

    // Aspetta che la lista utenti si aggiorni (fino a 12s)
    await pageA.waitForTimeout(12000);
    // Trova e clicca il bottone Proponi per TestUserB
    // Usiamo dispatchEvent con MouseEvent (bubbles:true) per triggerare React event delegation
    const clickResult = await pageA.evaluate((targetNick) => {
      const spans = [...document.querySelectorAll('span.text-white.text-sm.font-medium')];
      const nickSpan = spans.find(s => s.textContent.trim() === targetNick);
      if (!nickSpan) return `span "${targetNick}" not found`;
      const infoDiv = nickSpan.parentElement;
      const rowDiv = infoDiv?.parentElement;
      if (!rowDiv) return 'no rowDiv';
      const btn = rowDiv.querySelector('button');
      if (!btn) return `no button in row for ${targetNick}`;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return `clicked Proponi for ${targetNick}`;
    }, 'TestUserB');
    log('DEBUG', `clickResult: ${clickResult}`);
    const proponiCount = clickResult.startsWith('clicked') ? 1 : 0;
    if (proponiCount === 0) {
      fail(`TestUserA non vede il bottone "Proponi" per TestUserB: ${clickResult}`);
    } else {
      log('TestUserA', 'Click su Proponi eseguito');

      // Verifica che React abbia ricevuto il click (appare "Invito inviato..." nella riga)
      try {
        await pageA.waitForSelector(':text("Invito inviato"), :text("Invite sent")', { timeout: 5000 });
        log('TestUserA', 'React ha ricevuto il click — stato UI aggiornato');
      } catch {
        // Logga il contenuto attuale della lista utenti per debug
        const debugText = await pageA.evaluate(() => {
          const container = document.querySelector('[class*="telepathy"]') || document.body;
          return container.innerText.substring(0, 500);
        });
        log('DEBUG', `Pagina A dopo click: ${debugText.replace(/\n/g, ' | ')}`);
        fail('TestUserA: "Invito inviato..." non apparso dopo il click su Proponi');
      }

      log('TestUserA', 'Invito diretto inviato a TestUserB');
      await pageA.waitForTimeout(2000);

      // Debug: verifica invito nel DB
      const invResp = await fetch(`${SUPABASE_URL}/rest/v1/telepathy_invites?select=*&status=eq.pending&order=created_at.desc&limit=5`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      const invites = await invResp.json();
      log('DEBUG', `Inviti pending nel DB: ${JSON.stringify(invites.map(i => ({ from: i.from_name, to: i.to_name, to_id: i.to_id })))}`);

      // Debug: sessionId di TestUserB dal browser B
      const sessionIdB = await pageB.evaluate(() => localStorage.getItem('ga_session_id') || 'no_ga_session_id');
      log('DEBUG', `sessionId di TestUserB (browser B): ${sessionIdB}`);

      // Debug: stato di TestUserB nel DB
      const ouResp = await fetch(`${SUPABASE_URL}/rest/v1/online_users?select=id,nickname&nickname=eq.TestUserB`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      const ouData = await ouResp.json();
      log('DEBUG', `TestUserB in online_users: ${JSON.stringify(ouData)}`);

      // TestUserB vede il banner nell'updatePresence (ogni 10s) — timeout esteso
      await pageB.waitForSelector(':text("ti vuole fare training telepatico"), :text("wants to do telepathy training")', { timeout: 35000 });
      log('TestUserB', 'Banner invito ricevuto');
      await pageB.locator('button:has-text("Accetta"), button:has-text("Accept")').first().click();
      log('TestUserB', 'Invito accettato');

      // Entrambi devono essere in sessione
      await Promise.all([
        pageA.waitForSelector('text=/Il tuo ruolo|Your role/', { timeout: TIMEOUT }),
        pageB.waitForSelector('text=/Il tuo ruolo|Your role/', { timeout: TIMEOUT }),
      ]);
      pass('Invito diretto funziona — entrambi in sessione');

      // Pulisci: gioca un round e termina la sessione
      const roleA2 = await pageA.locator('p.text-white.font-bold').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first().textContent();
      const isSenderA2 = roleA2.trim() === 'Sender' || roleA2.trim() === 'Mittente';
      await sendSymbol(isSenderA2 ? pageA : pageB, 'S2');
      await guessSymbol(isSenderA2 ? pageB : pageA, 'R2');
      await Promise.all([waitForResult(pageA, 'TestUserA'), waitForResult(pageB, 'TestUserB')]);
      await pageA.locator('button:has-text("Termina Sessione"), button:has-text("End Session")').first().click();
      await Promise.all([
        pageA.waitForSelector('text=/Sessione Completata|Session Complete/', { timeout: TIMEOUT }),
        waitForLobbyAfterPartnerLeft(pageB, 'TestUserB'),
      ]);
    }

    // ── Test 9: Chat durante sessione ────────────────────────────────────
    console.log('\n📋 Test 9: Chat durante sessione');

    // Assicura che entrambi siano in lobby
    try { await pageA.locator('button:has-text("Torna alla Lobby"), button:has-text("Back to Lobby")').click({ timeout: 3000 }); } catch {}
    await waitForLobby(pageA, 'TestUserA');

    // Avvia nuova sessione random
    await clickFindPartner(pageA, 'TestUserA');
    await pageA.waitForTimeout(500);
    await clickFindPartner(pageB, 'TestUserB');
    await Promise.all([
      waitForPartnerFound(pageA, 'TestUserA'),
      waitForPartnerFound(pageB, 'TestUserB'),
    ]);

    // Invia un messaggio dalla chat
    const chatMsg = 'Ciao dal test automatico!';
    await pageA.locator('input[placeholder="Scrivi..."], input[placeholder="Type..."]').first().fill(chatMsg);
    await pageA.locator('button:has-text("➤")').click();
    log('TestUserA', `Messaggio inviato: "${chatMsg}"`);

    // TestUserB deve vedere il messaggio entro qualche secondo (polling chat)
    await pageB.waitForSelector(`:text("${chatMsg}")`, { timeout: TIMEOUT });
    pass('Chat funziona — messaggio ricevuto dal partner');

    // ── Test 10: Score persistente in Supabase ───────────────────────────
    console.log('\n📋 Test 10: Score persistente in Supabase');

    // Gioca un round e termina la sessione per triggerare endSession
    const roleA3 = await pageA.locator('p.text-white.font-bold').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first().textContent();
    const isSenderA3 = roleA3.trim() === 'Sender' || roleA3.trim() === 'Mittente';
    const sp3 = isSenderA3 ? pageA : pageB;
    const rp3 = isSenderA3 ? pageB : pageA;
    await sendSymbol(sp3, 'S3');
    await guessSymbol(rp3, 'R3');
    await waitForResult(pageA, 'TestUserA');
    await pageA.locator('button:has-text("Termina Sessione"), button:has-text("End Session")').first().click();
    await pageA.waitForSelector('text=/Sessione Completata|Session Complete/', { timeout: TIMEOUT });

    // Controlla Supabase via fetch
    await pageA.waitForTimeout(2000); // attendi che il DB sia scritto
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/telepathy_scores?select=*&order=updated_at.desc&limit=5`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const scores = await resp.json();
    if (scores && scores.length > 0) {
      pass(`Score salvato in Supabase — ${scores.length} record trovati (ultimo: ${scores[0].nickname}, sessioni: ${scores[0].sessions_count})`);
    } else {
      fail('Nessun record trovato in telepathy_scores dopo endSession');
    }

    // ── Test 11: Cambio livello dopo 7 round ────────────────────────────
    console.log('\n📋 Test 11: Cambio livello dopo 7 round');

    // Nuova sessione per TestUserB (che deve cliccare Torna alla lobby)
    await waitForLobbyAfterPartnerLeft(pageB, 'TestUserB');
    await pageA.locator('button:has-text("Torna alla Lobby"), button:has-text("Back to Lobby")').click();
    await waitForLobby(pageA, 'TestUserA');

    await clickFindPartner(pageA, 'TestUserA');
    await pageA.waitForTimeout(500);
    await clickFindPartner(pageB, 'TestUserB');
    await Promise.all([
      waitForPartnerFound(pageA, 'TestUserA'),
      waitForPartnerFound(pageB, 'TestUserB'),
    ]);
    log('TestUserA', 'Sessione avviata per test cambio livello (7 round)');

    const roleA4 = await pageA.locator('p.text-white.font-bold').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first().textContent();
    const isSenderA4 = roleA4.trim() === 'Sender' || roleA4.trim() === 'Mittente';
    const sp4 = isSenderA4 ? pageA : pageB;
    const rp4 = isSenderA4 ? pageB : pageA;
    const sName4 = isSenderA4 ? 'TestUserA' : 'TestUserB';
    const rName4 = isSenderA4 ? 'TestUserB' : 'TestUserA';

    // Gioca 7 round
    for (let i = 1; i <= 7; i++) {
      await sendSymbol(sp4, sName4);
      await guessSymbol(rp4, rName4);
      await Promise.all([
        waitForResult(pageA, 'TestUserA'),
        waitForResult(pageB, 'TestUserB'),
      ]);
      log('TestUserA', `Round ${i}/7 completato`);
      // Clicca "Ancora" dopo ogni round (anche il 7°) per tornare alla schermata di gioco
      await Promise.all([
        pageA.locator('button:has-text("Ancora"), button:has-text("Again")').first().click(),
        pageB.locator('button:has-text("Ancora"), button:has-text("Again")').first().click(),
      ]);
      // Attendi che il DB venga aggiornato (clear simboli + round_count avanzato dopo 4s)
      await pageA.waitForTimeout(5000);
    }

    // Dopo il 7° round + "Ancora" il banner deve essere visibile (showLevelBanner=true, showResult=false)
    await Promise.all([
      pageA.waitForSelector(':text("Vuoi cambiare tipo di telepatia"), :text("Want to change telepathy mode")', { timeout: TIMEOUT }),
      pageB.waitForSelector(':text("Vuoi cambiare tipo di telepatia"), :text("Want to change telepathy mode")', { timeout: TIMEOUT }),
    ]);
    pass('Banner cambio livello apparso dopo 7 round');

    // Entrambi scelgono "Numeri"
    await Promise.all([
      pageA.locator('button').filter({ hasText: /^(🔢 )?(Numeri|Numbers)$/ }).first().click(),
      pageB.locator('button').filter({ hasText: /^(🔢 )?(Numeri|Numbers)$/ }).first().click(),
    ]);
    log('TestUserA', 'Scelta: Numeri');
    log('TestUserB', 'Scelta: Numeri');

    // Verifica che il livello sia cambiato a "Numeri"
    // Dopo la scelta il banner scompare e si è direttamente in gioco (nessun "Ancora")
    await pageA.waitForTimeout(3000); // attendi sync DB
    const livelloText = await pageA.locator(':text("Numeri"), :text("Numbers")').count();
    if (livelloText > 0) {
      pass('Livello cambiato a "Numeri" con successo');
    } else {
      fail('Livello NON cambiato a Numeri');
    }

    // ── Test 11b: roundCount sopravvive al cambio livello (#11) ─────────────
    // Il counter Round nella card sx deve essere ancora 7 (non resettato a 0).
    const roundLabelLocator = pageA.locator('span').filter({ hasText: /^(Round|Round)$/ }).first();
    const roundValueLocator = roundLabelLocator.locator('xpath=following-sibling::span[1]');
    const roundCountAfter = parseInt((await roundValueLocator.textContent()).trim(), 10);
    if (roundCountAfter === 7) {
      pass(`roundCount sopravvive al cambio livello (= ${roundCountAfter}) ✅`);
    } else {
      fail(`roundCount resettato dopo cambio livello: visto ${roundCountAfter}, atteso 7`);
    }

    // ── Test 12: Mismatch su cambio livello → disagreement (#6) ─────────────
    console.log('\n📋 Test 12: Mismatch livello (RPC apply_level_change_if_both_agree)');

    // Riporta entrambi in lobby
    const xBtnEnd = pageA.locator(`button[aria-label="Termina Sessione"], button[aria-label="End Session"]`).first();
    await xBtnEnd.click();
    await pageA.locator('button:has-text("Esci"), button:has-text("Leave")').first().click();
    await pageA.waitForSelector('text=/Sessione Completata|Session Complete/', { timeout: TIMEOUT });
    try {
      await pageA.locator('button:has-text("Torna alla Lobby"), button:has-text("Back to Lobby")').click({ timeout: 5000 });
    } catch { /* già in lobby */ }
    await waitForLobby(pageA, 'TestUserA');
    await waitForLobbyAfterPartnerLeft(pageB, 'TestUserB');

    // Re-match
    await clickFindPartner(pageA, 'TestUserA');
    await pageA.waitForTimeout(500);
    await clickFindPartner(pageB, 'TestUserB');
    await Promise.all([
      waitForPartnerFound(pageA, 'TestUserA'),
      waitForPartnerFound(pageB, 'TestUserB'),
    ]);

    const roleA5 = await pageA.locator('p.text-white.font-bold').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first().textContent();
    const isSenderA5 = roleA5.trim() === 'Sender' || roleA5.trim() === 'Mittente';
    const sp5 = isSenderA5 ? pageA : pageB;
    const rp5 = isSenderA5 ? pageB : pageA;
    const sName5 = isSenderA5 ? 'TestUserA' : 'TestUserB';
    const rName5 = isSenderA5 ? 'TestUserB' : 'TestUserA';

    // Gioca 7 round per far apparire il banner cambio livello
    for (let i = 1; i <= 7; i++) {
      await sendSymbol(sp5, sName5);
      await guessSymbol(rp5, rName5);
      await Promise.all([waitForResult(pageA, 'TestUserA'), waitForResult(pageB, 'TestUserB')]);
      await Promise.all([
        pageA.locator('button:has-text("Ancora"), button:has-text("Again")').first().click(),
        pageB.locator('button:has-text("Ancora"), button:has-text("Again")').first().click(),
      ]);
      await pageA.waitForTimeout(5000);
    }

    await Promise.all([
      pageA.waitForSelector(':text("Vuoi cambiare tipo di telepatia"), :text("Want to change telepathy mode")', { timeout: TIMEOUT }),
      pageB.waitForSelector(':text("Vuoi cambiare tipo di telepatia"), :text("Want to change telepathy mode")', { timeout: TIMEOUT }),
    ]);
    pass('Banner cambio livello apparso (Test 12)');

    // A clicca Numeri (1°), B clicca Parole (2° → vede mismatch via RPC)
    await pageA.locator('button').filter({ hasText: /^(🔢 )?(Numeri|Numbers)$/ }).first().click();
    log('TestUserA', 'Scelta: Numeri');
    await pageA.waitForTimeout(500); // assicura che la RPC di A sia processata prima
    await pageB.locator('button').filter({ hasText: /^(💬 )?(Parole|Words)$/ }).first().click();
    log('TestUserB', 'Scelta: Parole');

    // B (che ha cliccato 2° e visto il mismatch) vede il banner di disaccordo
    await pageB.waitForSelector('text=/Avete scelto livelli diversi|Different choices/i', { timeout: 10000 });
    pass('B vede banner disagreement (RPC ha rilevato mismatch)');

    // A: il banner cambio livello deve essere dismissed dal polling, livello invariato (Forme/Shapes)
    await pageA.waitForTimeout(3000); // attendi 1 ciclo di polling
    const livelloDopoMismatch = await pageA.locator('span.text-white.text-sm.font-bold').filter({ hasText: /^(Forme|Shapes|Numeri|Numbers|Parole|Words)$/ }).first().textContent();
    if (/^(Forme|Shapes)$/.test(livelloDopoMismatch.trim())) {
      pass(`A: livello invariato dopo mismatch (= ${livelloDopoMismatch.trim()}) ✅`);
    } else {
      fail(`A: livello cambiato a "${livelloDopoMismatch}", atteso Forme/Shapes`);
    }

  } catch (err) {
    fail(`Errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    console.log('\n═══════════════════════════════════════');
    console.log(process.exitCode === 1 ? '  RISULTATO: ❌ FALLITO' : '  RISULTATO: ✅ PASSATO');
    console.log('═══════════════════════════════════════\n');

    await browser.close();
  }
})();
