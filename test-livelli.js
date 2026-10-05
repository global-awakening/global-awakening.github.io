/**
 * Test cambio livello telepatia — Global Awakening
 *
 * Copre 3 scenari post-7-round:
 *   Scenario 1: Accordo       — entrambi scelgono Numeri → livello cambia
 *   Scenario 2: Disaccordo    — A=Parole, B=Numeri       → livello rimane
 *   Scenario 3: Continua      — entrambi scelgono Continua → livello rimane
 *
 * Esecuzione: node test-livelli.js
 * Prerequisiti: app su http://localhost:4321/app.html, npx playwright install chromium
 */

const { chromium } = require('playwright');

const APP_URL  = 'http://localhost:4321/app.html';
const TIMEOUT  = 30000;

function log(user, msg) {
  const ts = new Date().toLocaleTimeString('it-IT');
  console.log(`[${ts}] [${user}] ${msg}`);
}
function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); process.exitCode = 1; }

// ── helpers ──────────────────────────────────────────────────────────────────

async function loginAsGuest(page, nickname) {
  await page.goto(APP_URL);
  // La UI parte in EN; il test usa selettori italiani → scelgo IT dal menu della lingua
  await page.locator('select[data-test="lingua"]').first().selectOption('it');
  await page.waitForSelector('select[data-test="lingua"] >> nth=0', { timeout: TIMEOUT });
  await page.waitForSelector('button:has-text("Ospite"), button:has-text("Guest")', { timeout: TIMEOUT });
  await page.locator('button:has-text("Ospite"), button:has-text("Guest")').first().click();
  await page.locator('input[placeholder*="username"], input[placeholder*="Username"], input[placeholder*="Nickname"], input[placeholder*="nickname"]').first().fill(nickname);
  await page.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")').click();
  await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout: TIMEOUT });
  log(nickname, 'Login come ospite completato');
}

async function goToTelepathy(page, nickname) {
  await page.locator('button').filter({ hasText: /Telepatia|Telepathy/ }).first().click();
  await page.waitForSelector(':text("Telepathy Training"), :text("Allenamento Telepatico")', { timeout: TIMEOUT });
  log(nickname, 'Tab Telepatia aperto');
}

async function clickFindPartner(page, nickname) {
  await page.locator('button:has-text("Abbinamento Random"), button:has-text("Random Match")').first().click();
  log(nickname, 'Cliccato "Random Match"');
}

async function waitForPartnerFound(page, nickname) {
  await page.waitForSelector('text=/Il tuo ruolo|Your role/', { timeout: TIMEOUT });
  log(nickname, 'Partner trovato!');
}

// Ritorna 'sender' | 'receiver'
async function getRole(page) {
  const el = page.locator('p.text-white.font-bold').filter({ hasText: /^Sender$|^Receiver$|^Mittente$|^Ricevitore$/ }).first();
  const txt = (await el.textContent({ timeout: TIMEOUT })).trim().toLowerCase();
  // Normalizza in 'sender'/'receiver' (codice valuta su questo)
  if (txt === 'mittente') return 'sender';
  if (txt === 'ricevitore') return 'receiver';
  return txt;
}

async function sendSymbol(page, label) {
  await page.locator('.symbol-btn').first().click();
  log(label, 'Simbolo selezionato');
  await page.locator('button:has-text("Invia Telepaticamente")').click();
  log(label, 'Simbolo inviato');
}

async function guessSymbol(page, label) {
  await page.waitForSelector('.symbol-btn', { timeout: TIMEOUT });
  await page.locator('.symbol-btn').first().click();
  log(label, 'Simbolo indovinato (tentativo)');
  await page.locator('button:has-text("Conferma")').click();
  log(label, 'Risposta inviata');
}

async function waitForResult(page, label) {
  await Promise.race([
    page.waitForSelector(':text("MATCH TELEPATICO")', { timeout: TIMEOUT }),
    page.waitForSelector(':text("Non questa volta")',  { timeout: TIMEOUT }),
  ]);
  const matched = (await page.locator(':text("MATCH TELEPATICO")').count()) > 0;
  log(label, `Risultato: ${matched ? '✨ MATCH' : 'No match'}`);
}

// Gioca N round completi con Ancora tra uno e l'altro.
// Ritorna senza cliccare Ancora dopo l'ultimo round (il 7°).
async function playRounds(pageA, pageB, n, labelS, labelR) {
  for (let i = 1; i <= n; i++) {
    // Sender invia, receiver indovina
    await sendSymbol(pageA, labelS);
    await guessSymbol(pageB, labelR);
    await Promise.all([
      waitForResult(pageA, 'A'),
      waitForResult(pageB, 'B'),
    ]);
    log('TEST', `Round ${i}/${n} completato`);
    if (i < n) {
      // Clicca Ancora tra i round (non dopo l'ultimo)
      await Promise.all([
        pageA.locator('button:has-text("Ancora")').click(),
        pageB.locator('button:has-text("Ancora")').click(),
      ]);
      // Aspetta che il DB aggiorni round_count (4s delay nel codice app)
      await pageA.waitForTimeout(5000);
    }
  }
}

// Aspetta che il banner di cambio livello sia visibile e clicca Ancora sull'ultimo round
async function clickAncoraAndWaitBanner(pageA, pageB) {
  await Promise.all([
    pageA.locator('button:has-text("Ancora")').click(),
    pageB.locator('button:has-text("Ancora")').click(),
  ]);
  await pageA.waitForTimeout(5000); // attendi DB sync
  await Promise.all([
    pageA.waitForSelector(':text("Vuoi cambiare tipo di telepatia")', { timeout: TIMEOUT }),
    pageB.waitForSelector(':text("Vuoi cambiare tipo di telepatia")', { timeout: TIMEOUT }),
  ]);
  pass('Banner cambio livello apparso dopo 7 round');
}

// Legge il testo del primo .symbol-btn visibile nella pagina
async function getFirstSymbolText(page) {
  await page.waitForSelector('.symbol-btn', { timeout: TIMEOUT });
  return (await page.locator('.symbol-btn').first().textContent()).trim();
}

// Legge il valore del livello dal pannello sessione ("Figure" | "Numeri" | "Parole")
async function getLevelLabel(page) {
  // "Livello" è la label, il valore è nel span successivo nello stesso flex row
  const el = page.locator('span.text-secondary.text-xs:has-text("Livello")');
  const parent = el.locator('..');
  const valueSpan = parent.locator('span.text-white.text-sm.font-bold');
  return (await valueSpan.textContent({ timeout: TIMEOUT })).trim();
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST CAMBIO LIVELLO — Global Awakening Telepatia');
  console.log('═══════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  pageA.on('console', msg => {
    if (msg.type() === 'error') log('BROWSER-A', `error: ${msg.text()}`);
  });
  pageB.on('console', msg => {
    if (msg.type() === 'error') log('BROWSER-B', `error: ${msg.text()}`);
  });

  try {
    // ── Setup: login e tab telepatia ────────────────────────────────────────
    console.log('📋 Setup: login e navigazione');
    await Promise.all([
      loginAsGuest(pageA, 'LevelA'),
      loginAsGuest(pageB, 'LevelB'),
    ]);
    await Promise.all([
      goToTelepathy(pageA, 'LevelA'),
      goToTelepathy(pageB, 'LevelB'),
    ]);

    // ── Avvia sessione ──────────────────────────────────────────────────────
    await clickFindPartner(pageA, 'LevelA');
    await pageA.waitForTimeout(500);
    await clickFindPartner(pageB, 'LevelB');
    await Promise.all([
      waitForPartnerFound(pageA, 'LevelA'),
      waitForPartnerFound(pageB, 'LevelB'),
    ]);

    // Determina chi è sender (pageA o pageB)
    const roleA = await getRole(pageA);
    const isSenderA = roleA === 'sender';
    const senderPage  = isSenderA ? pageA : pageB;
    const receiverPage = isSenderA ? pageB : pageA;
    const senderLabel  = isSenderA ? 'LevelA' : 'LevelB';
    const receiverLabel = isSenderA ? 'LevelB' : 'LevelA';
    log('TEST', `Ruoli: ${senderLabel}=Sender, ${receiverLabel}=Receiver`);

    // ── Scenario 1: Accordo (Figure → Numeri) ───────────────────────────────
    console.log('\n📋 Scenario 1: Accordo cambio livello (Figure → Numeri)');
    log('TEST', 'Gioco 7 round per attivare il banner...');

    await playRounds(senderPage, receiverPage, 7, senderLabel, receiverLabel);
    await clickAncoraAndWaitBanner(pageA, pageB);

    // Entrambi scelgono "Numeri"
    await Promise.all([
      pageA.locator('button').filter({ hasText: 'Numeri' }).first().click(),
      pageB.locator('button').filter({ hasText: 'Numeri' }).first().click(),
    ]);
    log('TEST', 'Entrambi hanno scelto Numeri');

    // Aspetta sync DB e verifica livello
    await pageA.waitForTimeout(4000);

    // Il banner deve essere sparito
    const bannerGone = (await pageA.locator(':text("Vuoi cambiare tipo di telepatia")').count()) === 0;
    if (bannerGone) {
      pass('Banner scomparso dopo la scelta');
    } else {
      fail('Banner ancora visibile dopo la scelta');
    }

    // Verifica livello nel pannello sessione
    let livello = await getLevelLabel(pageA);
    if (livello === 'Numeri') {
      pass(`Pannello sessione mostra: ${livello}`);
    } else {
      fail(`Livello nel pannello: "${livello}" (atteso: "Numeri")`);
    }

    // Verifica che i simboli siano cifre (1-9)
    const firstSym1 = await getFirstSymbolText(senderPage);
    const isDigit = /^[1-9]$/.test(firstSym1);
    if (isDigit) {
      pass(`Simboli sono numeri — primo simbolo: "${firstSym1}"`);
    } else {
      fail(`Simboli NON sono numeri — primo simbolo: "${firstSym1}"`);
    }

    // Gioca 1 round al livello Numeri per confermare che funziona
    await sendSymbol(senderPage, senderLabel);
    await guessSymbol(receiverPage, receiverLabel);
    await Promise.all([
      waitForResult(pageA, 'A'),
      waitForResult(pageB, 'B'),
    ]);
    pass('Round giocato con successo al livello Numeri');

    // ── Scenario 2: Disaccordo (A=Parole, B=Numeri → rimane Numeri) ─────────
    console.log('\n📋 Scenario 2: Disaccordo (A=Parole, B=Numeri → rimane Numeri)');

    // Clicca Ancora per tornare in gioco
    await Promise.all([
      pageA.locator('button:has-text("Ancora")').click(),
      pageB.locator('button:has-text("Ancora")').click(),
    ]);
    await pageA.waitForTimeout(5000);

    log('TEST', 'Gioco 7 round per attivare il secondo banner...');
    await playRounds(senderPage, receiverPage, 7, senderLabel, receiverLabel);
    await clickAncoraAndWaitBanner(pageA, pageB);

    // A sceglie "Parole", B sceglie "Numeri" → disaccordo
    await pageA.locator('button').filter({ hasText: 'Parole' }).first().click();
    await pageB.locator('button').filter({ hasText: 'Numeri' }).first().click();
    log('TEST', 'LevelA=Parole, LevelB=Numeri (disaccordo)');

    // Aspetta sync DB e verifica
    await pageA.waitForTimeout(4000);

    const bannerGone2 = (await pageA.locator(':text("Vuoi cambiare tipo di telepatia")').count()) === 0;
    if (bannerGone2) {
      pass('Banner scomparso dopo disaccordo');
    } else {
      fail('Banner ancora visibile dopo disaccordo');
    }

    // Livello deve essere rimasto "Numeri"
    livello = await getLevelLabel(pageA);
    if (livello === 'Numeri') {
      pass(`Livello rimasto invariato: ${livello}`);
    } else {
      fail(`Livello cambiato erroneamente a: "${livello}" (atteso: "Numeri")`);
    }

    // Verifica simboli ancora cifre
    const firstSym2 = await getFirstSymbolText(senderPage);
    if (/^[1-9]$/.test(firstSym2)) {
      pass(`Simboli ancora numeri dopo disaccordo — primo: "${firstSym2}"`);
    } else {
      fail(`Simboli cambiati inaspettatamente — primo: "${firstSym2}"`);
    }

    // Gioca 1 round per confermare
    await sendSymbol(senderPage, senderLabel);
    await guessSymbol(receiverPage, receiverLabel);
    await Promise.all([
      waitForResult(pageA, 'A'),
      waitForResult(pageB, 'B'),
    ]);
    pass('Round giocato con successo dopo disaccordo');

    // ── Scenario 3: Continua (entrambi → livello invariato) ─────────────────
    console.log('\n📋 Scenario 3: "Continua" (entrambi → livello rimane Numeri)');

    await Promise.all([
      pageA.locator('button:has-text("Ancora")').click(),
      pageB.locator('button:has-text("Ancora")').click(),
    ]);
    await pageA.waitForTimeout(5000);

    log('TEST', 'Gioco 7 round per attivare il terzo banner...');
    await playRounds(senderPage, receiverPage, 7, senderLabel, receiverLabel);
    await clickAncoraAndWaitBanner(pageA, pageB);

    // Entrambi scelgono "Continua"
    await Promise.all([
      pageA.locator('button:has-text("Continua")').click(),
      pageB.locator('button:has-text("Continua")').click(),
    ]);
    log('TEST', 'Entrambi hanno scelto Continua');

    await pageA.waitForTimeout(4000);

    const bannerGone3 = (await pageA.locator(':text("Vuoi cambiare tipo di telepatia")').count()) === 0;
    if (bannerGone3) {
      pass('Banner scomparso dopo "Continua"');
    } else {
      fail('Banner ancora visibile dopo "Continua"');
    }

    // Livello rimane "Numeri"
    livello = await getLevelLabel(pageA);
    if (livello === 'Numeri') {
      pass(`Livello rimasto invariato: ${livello}`);
    } else {
      fail(`Livello cambiato erroneamente a: "${livello}" (atteso: "Numeri")`);
    }

    // Verifica simboli ancora cifre
    const firstSym3 = await getFirstSymbolText(senderPage);
    if (/^[1-9]$/.test(firstSym3)) {
      pass(`Simboli ancora numeri dopo "Continua" — primo: "${firstSym3}"`);
    } else {
      fail(`Simboli cambiati inaspettatamente — primo: "${firstSym3}"`);
    }

    // Gioca 1 round finale per confermare
    await sendSymbol(senderPage, senderLabel);
    await guessSymbol(receiverPage, receiverLabel);
    await Promise.all([
      waitForResult(pageA, 'A'),
      waitForResult(pageB, 'B'),
    ]);
    pass('Round finale giocato con successo');

  } catch (err) {
    fail(`Errore imprevisto: ${err.message}`);
    console.error(err);
  } finally {
    console.log('\n═══════════════════════════════════════════════════');
    console.log(process.exitCode === 1
      ? '  RISULTATO: ❌ FALLITO'
      : '  RISULTATO: ✅ PASSATO');
    console.log('═══════════════════════════════════════════════════\n');
    await browser.close();
  }
})();
