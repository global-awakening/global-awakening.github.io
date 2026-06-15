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
const { purge, loginAsGuest: guestLogin } = require('./test-helpers');

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

// Nickname FISSI del test. La pulizia pre-run azzera lo stato lasciato da un run
// precedente interrotto (code in telepathy_queue, inviti pending, sessioni, presence):
// è la causa più probabile dei "capricci" di questo test. La post-run evita accumulo.
// Usa la service_role key via test-helpers; senza chiave degrada con un warning.
const NICK_A = 'TestUserA';
const NICK_B = 'TestUserB';
// sessionId FISSI dei due ospiti di test (impostati via addInitScript prima del
// caricamento): così i tentativi registrati in telepathy_trials (Fase 2) — che usano
// receiver_id/sender_id = sessionId — sono ripuliti con precisione, senza lasciare
// dati di test nel dataset append-only dell'indagine.
const SID_A = 'test-telepathy-a';
const SID_B = 'test-telepathy-b';

async function cleanupTelepathy(label) {
  const enc = encodeURIComponent;
  const paths = [];
  for (const n of [NICK_A, NICK_B]) {
    paths.push(`online_users?nickname=eq.${enc(n)}`);
    paths.push(`telepathy_queue?nickname=eq.${enc(n)}`);
    paths.push(`telepathy_scores?nickname=eq.${enc(n)}`);
    paths.push(`telepathy_invites?from_name=eq.${enc(n)}`);
    paths.push(`telepathy_invites?to_name=eq.${enc(n)}`);
  }
  for (const s of [SID_A, SID_B]) {
    paths.push(`telepathy_trials?receiver_id=eq.${enc(s)}`);
    paths.push(`telepathy_trials?sender_id=eq.${enc(s)}`);
    paths.push(`telepathy_scores?user_id=eq.${enc(s)}`);
  }
  await purge(SUPABASE_URL, paths, { label: `telepathy-${label}` });
}

async function loginAsGuest(page, nickname) {
  await guestLogin(page, nickname, { appUrl: APP_URL, timeout: TIMEOUT });
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
  // Aspetta che il picker sia pronto (dopo l'auto-avanzamento la schermata può non esserlo ancora)
  await page.waitForSelector('.symbol-btn', { timeout: TIMEOUT });
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

// Attende il completamento dell'auto-avanzamento dopo un risultato (sostituisce le
// vecchie attese fisse da 8s). Picker e schermata risultato sono mutuamente esclusivi
// nell'app (render `!showResult` vs `showResult`): il picker ricompare solo a
// auto-avanzamento avvenuto, quindi è un segnale affidabile. Al 7° round compare invece
// il banner cambio-livello → si accetta l'uno o l'altro. Promise.any: niente rejection
// orfane (ignora il ramo che va in timeout finché l'altro si risolve).
async function waitAutoAdvance(page, timeout = TIMEOUT) {
  await Promise.any([
    page.waitForSelector('.symbol-btn', { state: 'visible', timeout }),
    // Al cambio-modalità (round 7,14,...) il picker è nascosto: appare il banner livello,
    // diverso per chooser ("Choose the new mode") e passivo ("...is choosing...").
    page.waitForSelector('text=/Choose the new mode|Scegli la nuova modalità|is choosing|sta scegliendo/i', { state: 'visible', timeout }),
  ]);
}

async function clickTerminaSessione(page, nickname) {
  // Usa la X sempre presente (aria-label) + conferma modale, NON il bottone testuale
  // della schermata risultato: quello esiste solo durante showResult e l'auto-avanzamento
  // lo rimuove dopo ~4.5s (showResult→false), causando click-timeout intermittenti.
  // La X (app.html:3987) è visibile per tutta la sessione (partner && !sessionEnded) → race-free.
  await page.locator('button[aria-label="Termina Sessione"], button[aria-label="End Session"]').first().click();
  await page.locator('button:has-text("Esci"), button:has-text("Leave")').first().click();
  log(nickname, `Cliccato "Termina Sessione" (X + conferma)`);
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
  // sessionId E codice ospite (Fase 3) fissi per i due ospiti di test (vedi SID_A/SID_B):
  // così receiver_id (codice ospite) e sender_id (sessionId) nei telepathy_trials sono noti
  // e ripulibili con precisione. addInitScript gira prima degli script di pagina.
  await ctxA.addInitScript((s) => { localStorage.setItem('ga_session_id', s); localStorage.setItem('ga_guest_code', s); }, SID_A);
  await ctxB.addInitScript((s) => { localStorage.setItem('ga_session_id', s); localStorage.setItem('ga_guest_code', s); }, SID_B);
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // Intercetta warning/error dai browser per debug
  pageA.on('console', msg => { if (msg.type() === 'warning' || msg.type() === 'error') log('BROWSER-A', `${msg.type()}: ${msg.text()}`); });
  pageB.on('console', msg => { if (msg.type() === 'warning' || msg.type() === 'error') log('BROWSER-B', `${msg.type()}: ${msg.text()}`); });

  try {
    // ── Pre-run: slate pulito (rimuove stato di run precedenti interrotti) ──
    console.log('🧹 Pre-run: pulizia stato residuo di TestUserA/TestUserB');
    await cleanupTelepathy('pre');

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
    // Aspetta che il polling popoli la lista (intervallo 10s): attende il bottone "Proponi"
    // invece di un fisso, così procede appena la lista è pronta (e attende fino a TIMEOUT se lenta).
    try {
      await pageA.waitForSelector('button:has-text("Proponi"), button:has-text("Invite")', { timeout: TIMEOUT });
    } catch { /* se non appare, l'assertion sotto fallisce con messaggio chiaro */ }
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

    // ── Test 6: Auto-avanzamento (no pulsante "Ancora") ────────────────────
    console.log('\n📋 Test 6: Auto-avanzamento dopo il risultato');
    // Il gioco riparte da solo dopo ~4s: niente click, si attende l'auto-avanzamento.
    await pageA.waitForTimeout(8000);
    const symbolsA = await pageA.locator('.symbol-btn').count();
    const waitingA = await pageA.locator(':text("Simbolo inviato"), :text("Aspetta")').count();
    if (symbolsA > 0 || waitingA > 0) {
      pass('TestUserA tornato in gioco da solo (auto-avanzamento)');
    } else {
      fail('TestUserA NON è tornato in gioco dopo l\'auto-avanzamento');
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

    // Aspetta che la lista utenti mostri TestUserB (invece di un fisso da 12s): exact-match
    // sullo stesso span usato dall'evaluate sotto. Procede appena appare, fino a TIMEOUT se lento.
    try {
      await pageA.waitForSelector('span.text-white.text-sm.font-medium:text-is("TestUserB")', { timeout: TIMEOUT });
    } catch { /* se non appare, l'evaluate restituirà "span not found" → fail con messaggio chiaro */ }
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
      await clickTerminaSessione(pageA, 'TestUserA');
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
    await clickTerminaSessione(pageA, 'TestUserA');
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

    // Gioca 7 round — i ruoli si ALTERNANO ogni 3 round (Batch C #5), quindi
    // determiniamo sender/receiver DINAMICAMENTE a ogni round leggendo la UI.
    let roleAtRound1 = null, swapVerified = false;
    for (let i = 1; i <= 7; i++) {
      const roleA = (await pageA.locator('p.text-white.font-bold').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first().textContent()).trim();
      const isSenderA = roleA === 'Sender' || roleA === 'Mittente';
      if (i === 1) roleAtRound1 = roleA;
      if (i === 4 && roleA !== roleAtRound1 && !swapVerified) { pass('Ruoli invertiti al round 4 (alternanza ogni 3 round)'); swapVerified = true; }
      const sp = isSenderA ? pageA : pageB;
      const rp = isSenderA ? pageB : pageA;
      const sName = isSenderA ? 'TestUserA' : 'TestUserB';
      const rName = isSenderA ? 'TestUserB' : 'TestUserA';
      await sendSymbol(sp, sName);
      await guessSymbol(rp, rName);
      await Promise.all([
        waitForResult(pageA, 'TestUserA'),
        waitForResult(pageB, 'TestUserB'),
      ]);
      log('TestUserA', `Round ${i}/7 completato (ruolo A: ${roleA})`);
      // Auto-avanzamento: il gioco riparte da solo (niente click "Ancora"). Al 7° round
      // appare invece il banner cambio livello: si attende il picker O il banner.
      await waitAutoAdvance(pageA);
    }
    if (!swapVerified) fail('Atteso swap dei ruoli al round 4, non rilevato');

    // Al round 7: SOLO il chooser (A = user1) vede i bottoni; il passivo (B) vede l'attesa.
    await pageA.waitForSelector('text=/Choose the new mode|Scegli la nuova modalità/', { timeout: TIMEOUT });
    pass('Chooser (TestUserA) vede i bottoni di scelta modalità');
    await pageB.waitForSelector('text=/is choosing|sta scegliendo/', { timeout: TIMEOUT });
    pass('Passivo (TestUserB) vede "sta scegliendo la nuova modalità"');
    const passiveBtns = await pageB.locator('button').filter({ hasText: /^(🔢 )?(Numeri|Numbers)$/ }).count();
    if (passiveBtns === 0) pass('Passivo non ha i bottoni di scelta'); else fail('Passivo vede ancora i bottoni di scelta');

    // Il chooser sceglie Numeri (scelta unilaterale, si applica subito)
    await pageA.locator('button').filter({ hasText: /^(🔢 )?(Numeri|Numbers)$/ }).first().click();
    log('TestUserA', 'Scelta (chooser): Numeri');

    // Verifica modalità cambiata a Numeri per ENTRAMBI
    await pageA.waitForTimeout(3000); // sync DB/poll
    const levelA = await pageA.locator(':text("Numeri"), :text("Numbers")').count();
    const levelB = await pageB.locator(':text("Numeri"), :text("Numbers")').count();
    if (levelA > 0 && levelB > 0) {
      pass('Modalità cambiata a Numeri per entrambi');
    } else {
      fail(`Modalità non cambiata a Numeri (A:${levelA} B:${levelB})`);
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

    // ── Test 12: Alternanza chooser al round 14 + "Resta così" + passivo non bloccato ──
    console.log('\n📋 Test 12: Alternanza chooser (round 14) + "Resta così"');

    // Veniamo dal Test 11 nella STESSA sessione attiva: mode=Numeri, roundCount=7, chooser@7 = TestUserA.
    // Nel cambio-modalità a turni il chooser è user1/user2 a seconda di levelChangeIndex=floor(round/7):
    //   round 7  → index 1 (dispari) → chooser = user1 = TestUserA (verificato nel Test 11);
    //   round 14 → index 2 (pari)    → chooser = user2 = TestUserB → l'alternanza che vogliamo testare.
    // Per questo NON si fa un re-match (resetterebbe roundCount → di nuovo chooser=user1): si CONTINUA.
    // (Random match: user1 = chi era già in coda = TestUserA, che clicca per primo — vedi app.html ~1680.)

    // Gioca i round 8→14 (role-aware: i ruoli si alternano ogni 3 round)
    for (let i = 8; i <= 14; i++) {
      const roleA = (await pageA.locator('p.text-white.font-bold').filter({ hasText: /^(Sender|Receiver|Mittente|Ricevitore)$/ }).first().textContent()).trim();
      const isSenderA = roleA === 'Sender' || roleA === 'Mittente';
      const sp = isSenderA ? pageA : pageB;
      const rp = isSenderA ? pageB : pageA;
      const sName = isSenderA ? 'TestUserA' : 'TestUserB';
      const rName = isSenderA ? 'TestUserB' : 'TestUserA';
      await sendSymbol(sp, sName);
      await guessSymbol(rp, rName);
      await Promise.all([waitForResult(pageA, 'TestUserA'), waitForResult(pageB, 'TestUserB')]);
      // Auto-avanzamento: per i round 8→13 riappare il picker; al round 14 appare invece il
      // banner cambio-modalità (per il passivo A è "...sta scegliendo..."). waitAutoAdvance accetta entrambi.
      await waitAutoAdvance(pageA);
      log('TestUserA', `Round ${i}/14 completato`);
    }

    // Al round 14 il banner cambio-modalità appare su entrambi. Rileva DINAMICAMENTE i ruoli:
    // il chooser vede levelChooseTitle, il passivo vede levelWaiting (preceduto dal nick del partner).
    await Promise.all([
      pageA.waitForSelector('text=/Choose the new mode|Scegli la nuova modalità|is choosing the new game mode|sta scegliendo la nuova modalità/i', { timeout: TIMEOUT }),
      pageB.waitForSelector('text=/Choose the new mode|Scegli la nuova modalità|is choosing the new game mode|sta scegliendo la nuova modalità/i', { timeout: TIMEOUT }),
    ]);
    const aIsChooser14 = (await pageA.locator('text=/Choose the new mode|Scegli la nuova modalità/').count()) > 0;
    const bIsChooser14 = (await pageB.locator('text=/Choose the new mode|Scegli la nuova modalità/').count()) > 0;

    // Atteso: chooser ALTERNATO → ora TestUserB (user2), non più TestUserA (user1 al round 7).
    if (bIsChooser14 && !aIsChooser14) {
      pass('Chooser alternato al round 14 (ora TestUserB; era TestUserA al round 7) ✅');
    } else {
      fail(`Chooser NON alternato al round 14 (A chooser=${aIsChooser14}, B chooser=${bIsChooser14}; atteso solo B)`);
    }

    // Il passivo (TestUserA) vede il messaggio di attesa e NON ha i bottoni di scelta.
    const aWaiting14 = (await pageA.locator('text=/is choosing the new game mode|sta scegliendo la nuova modalità/').count()) > 0;
    if (aWaiting14) pass('Passivo (TestUserA) vede "sta scegliendo la nuova modalità"');
    else fail('Passivo (TestUserA) non vede il messaggio di attesa');
    const passiveKeepBtn = await pageA.locator('button:has-text("Resta così"), button:has-text("Keep current")').count();
    if (passiveKeepBtn === 0) pass('Passivo non ha i bottoni di scelta modalità');
    else fail('Passivo vede ancora i bottoni di scelta modalità');

    // Il chooser (TestUserB) sceglie "Resta così" (Keep current): la modalità non cambia, si applica subito.
    await pageB.locator('button:has-text("Resta così"), button:has-text("Keep current")').first().click();
    log('TestUserB', 'Scelta (chooser round 14): "Resta così"');

    // Il passivo (TestUserA) deve SBLOCCARSI: pollLevelChange rileva il marcatore → dismette il banner
    // e il gioco riprende (round 15). È il cuore del test: il passivo non resta appeso in attesa.
    await pageA.waitForSelector('text=/is choosing the new game mode|sta scegliendo la nuova modalità/', { state: 'hidden', timeout: TIMEOUT });
    pass('Passivo (TestUserA) sbloccato — banner attesa dismesso dopo la scelta del chooser ✅');
    await pageA.waitForSelector('.symbol-btn', { state: 'visible', timeout: TIMEOUT });
    pass('Il gioco riprende sul passivo (picker round 15 visibile)');

    // "Resta così" mantiene la modalità precedente (Numeri, scelta al round 7).
    const levelKept = await pageA.locator(':text("Numeri"), :text("Numbers")').count();
    if (levelKept > 0) pass('"Resta così" mantiene la modalità Numeri');
    else fail('Modalità cambiata dopo "Resta così" (atteso Numeri invariato)');

    // ── Test 13: Indicatore "training in corso" cross-tab (Batch C #3) ──────
    console.log('\n📋 Test 13: Indicatore training cross-tab (Batch C #3)');

    // Premessa: A e B sono ancora in sessione (vengono dal Test 12, partner attivo, !sessionEnded)
    // 13a: badge .training-badge presente nel bottone tab Telepatia di entrambi i client
    const badgeA = await pageA.locator('.training-badge').count();
    const badgeB = await pageB.locator('.training-badge').count();
    if (badgeA > 0 && badgeB > 0) {
      pass(`Test 13a: badge tab Telepatia visibile su entrambi i client (A=${badgeA}, B=${badgeB})`);
    } else {
      fail(`Test 13a: badge tab Telepatia non trovato (A=${badgeA}, B=${badgeB})`);
    }

    // 13b: cambio tab interno (A → Rituali) — il badge deve restare visibile
    await pageA.locator('button').filter({ hasText: /^(Rituals|Rituali)$/ }).first().click();
    await pageA.waitForTimeout(300);
    const badgeA2 = await pageA.locator('.training-badge').count();
    if (badgeA2 > 0) {
      pass('Test 13b: badge tab Telepatia persiste anche su altro tab interno dell\'app');
    } else {
      fail('Test 13b: badge sparito dopo cambio tab interno');
    }

    // 13c: simula browser tab hidden su A → floating banner deve apparire
    await pageA.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await pageA.waitForTimeout(400);
    const bannerVisible = await pageA.locator('.training-floating-banner').isVisible().catch(() => false);
    if (bannerVisible) {
      pass('Test 13c: floating banner appare quando il tab del browser è hidden');
    } else {
      fail('Test 13c: floating banner non visibile a tab nascosto');
    }

    // 13d: click sul floating banner → setActiveTab('telepathy')
    if (bannerVisible) {
      await pageA.locator('.training-floating-banner').click();
      await pageA.waitForTimeout(300);
    }

    // 13e: restore visibility → floating banner sparisce
    await pageA.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await pageA.waitForTimeout(400);
    const bannerStillVisible = await pageA.locator('.training-floating-banner').isVisible().catch(() => false);
    if (!bannerStillVisible) {
      pass('Test 13d: floating banner sparisce dopo restore visibility');
    } else {
      fail('Test 13d: floating banner ancora visibile dopo restore visibility');
    }

  } catch (err) {
    fail(`Errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    console.log('\n  (Pulizia stato telepatia di test da Supabase...)');
    await cleanupTelepathy('post');

    console.log('\n═══════════════════════════════════════');
    console.log(process.exitCode === 1 ? '  RISULTATO: ❌ FALLITO' : '  RISULTATO: ✅ PASSATO');
    console.log('═══════════════════════════════════════\n');

    await browser.close();
  }
})();
