/**
 * Test automatico UI — profilo, cambio password, classifica e totali solo tramite RPC
 * (Task 8 — account lato server)
 *
 * Esecuzione:
 *   node test-account-ui.js
 *
 * Prerequisiti:
 *   - App in esecuzione su http://localhost:4321/app.html
 *   - npx playwright install chromium
 *   - .env.test con SUPABASE_SERVICE_KEY (vedi test-helpers.js)
 *
 * Cosa verifica (Step 1 del brief Task 8):
 *  1. Nessuna richiesta a /rest/v1/profiles con select=* o con email/password_hash nel
 *     select, e nessuna scrittura (POST/PATCH) su /rest/v1/profiles, durante: apertura
 *     profilo proprio, salvataggio del profilo con bio nuova, toggle "mostra punteggio",
 *     apertura del profilo di un altro utente, classifica.
 *  2. Dopo il salvataggio la bio nel DB (via serviceFetch) è quella nuova.
 *  3. Con la credenziale locale (ga_pwhash) rimossa, il salvataggio del profilo mostra
 *     l'errore e NON "salvato".
 *  4. Cambio password dal profilo → logout → login con la password nuova riesce; con
 *     credenziale rimossa, il cambio mostra l'errore.
 *  5. La classifica si carica (righe o "nessun dato") senza richieste a
 *     /rest/v1/telepathy_scores.
 */

const { chromium } = require('playwright');
const {
  requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount,
} = require('./test-helpers');
requireServiceKey();

const APP_URL = 'http://localhost:4321/app.html';
const TIMEOUT = 15000;

const TS = Date.now();
const NICK = `AcctUI_${TS}`;
const EMAIL = `acctui_${TS}@test.com`;
const PASS = 'AcctUiPass123!';
const NEW_PASS = 'AcctUiNewPass456!';
const NEW_PASS2 = 'AcctUiNewPass789!';

const NICK2 = `AcctUI2_${TS}`;
const EMAIL2 = `acctui2_${TS}@test.com`;

let passed = 0;
let failed = 0;
function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; process.exitCode = 1; }

// Stesso formato di deriveStrongHash lato client: "pbkdf2$<iter>$<saltB64>$<hashB64>".
const nodeCrypto = require('crypto');
function pbkdf2Hash(password, iterations = 100000) {
  const salt = nodeCrypto.randomBytes(16);
  const bits = nodeCrypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${salt.toString('base64')}$${bits.toString('base64')}`;
}

async function login(page, email, password) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(':text("Login")', { timeout: TIMEOUT });
  await page.locator(':text("Login")').first().click();
  await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button.btn-primary:not([disabled])').waitFor({ timeout: TIMEOUT });
  await page.locator('button.btn-primary', { hasText: /^Login$|^Accedi$/ }).first().click();
  await page.waitForSelector(':text("Registered"), :text("Registrato")', { timeout: TIMEOUT });
}

async function logout(page) {
  await page.locator(':text("Logout"), :text("Esci")').first().click({ timeout: TIMEOUT });
  await page.locator('.modal-content button.btn-primary').click({ timeout: TIMEOUT });
  await page.waitForSelector(':text("Guest"), :text("Ospite")', { timeout: TIMEOUT });
}

async function openEditProfile(page) {
  await page.locator('[title="Edit Profile"], [title="Modifica Profilo"]').first().click();
  await page.waitForSelector('.modal-content textarea', { timeout: TIMEOUT });
}

async function closeEditProfile(page) {
  await page.locator('.modal-content button[aria-label="Close"], .modal-content button[aria-label="Chiudi"]').first().click();
  await page.waitForSelector('.modal-content', { state: 'detached', timeout: TIMEOUT }).catch(() => {});
}

(async () => {
  console.log('\n═══════════════════════════════════════');
  console.log('  TEST PROFILO / PASSWORD / CLASSIFICA (RPC-only)');
  console.log(`  Utente: ${NICK} <${EMAIL}>`);
  console.log('═══════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Cattura ogni URL /rest/v1/ richiesto dopo il login, per i controlli "nessuna richiesta a".
  const restRequests = [];
  let capturing = false;
  page.on('request', (req) => {
    const url = req.url();
    if (capturing && url.includes('/rest/v1/')) {
      restRequests.push({ url, method: req.method() });
    }
  });

  // Cattura l'ultimo alert() mostrato (usato da saveProfile in caso di errore, per brief).
  let lastDialogMessage = null;
  page.on('dialog', async (dialog) => {
    lastDialogMessage = dialog.message();
    await dialog.accept();
  });

  let onlineUsers2Id = null;

  try {
    // ── Setup: due account di test seminati direttamente in profiles ─────────
    await createTestAccount({
      session_id: `acctui-${TS}`, nickname: NICK, email: EMAIL, password_hash: pbkdf2Hash(PASS),
    });
    await createTestAccount({
      session_id: `acctui2-${TS}`, nickname: NICK2, email: EMAIL2, password_hash: pbkdf2Hash('Whatever123!'),
    });

    // ── Login come account 1 ──────────────────────────────────────────────
    console.log('📋 Setup: login');
    await login(page, EMAIL, PASS);
    pass('Login riuscito');

    capturing = true; // da qui in poi si controllano le richieste /rest/v1/

    // ── Caso 1a: apertura profilo proprio + toggle "mostra punteggio" ───────
    // (il pulsante Salva chiude subito il pannello — chiamando setShowEditProfile(false)
    // in modo sincrono, indipendente dall'esito della RPC — quindi il toggle va fatto
    // PRIMA di salvare, mentre il pannello è ancora aperto.)
    console.log('\n📋 Caso 1: apertura profilo proprio, toggle "mostra punteggio"');
    await openEditProfile(page);
    const toggleBtn = page.getByText(/^Show telepathy score$|^Mostra punteggio telepatia$/).locator('xpath=following-sibling::button');
    await toggleBtn.click();
    await page.waitForTimeout(300); // la RPC è fire-and-forget, non ha un indicatore proprio
    pass('Pannello profilo aperto e toggle azionato');

    // ── Caso 1b: salvataggio con bio nuova ──────────────────────────────────
    console.log('\n📋 Caso 1: salvataggio del profilo con bio nuova');
    const newBio = `Bio aggiornata dal test ${TS}`;
    await page.locator('.modal-content textarea').fill(newBio);
    lastDialogMessage = null;
    await page.locator('.modal-content button.btn-primary').click();
    // Il pulsante chiude il pannello subito: l'unico segnale osservabile qui è l'assenza
    // dell'alert d'errore (la riuscita si verifica sul DB nel Caso 2, sotto).
    await page.waitForTimeout(800);
    if (!lastDialogMessage) pass('Salvataggio con credenziale valida non mostra errori');
    else fail('Un alert inatteso è comparso durante il salvataggio: ' + lastDialogMessage);

    // ── Caso 1c: apertura profilo di un altro utente ─────────────────────
    console.log('\n📋 Caso 1: apertura profilo di un altro utente');
    // Rende NICK2 visibile in Community/Map (tabella online_users, fuori scope Task 8):
    // inseriamo direttamente una riga di presenza per l'account 2.
    onlineUsers2Id = `acctui2-online-${TS}`;
    await serviceFetch('online_users', {
      method: 'POST',
      body: JSON.stringify({ id: onlineUsers2Id, nickname: NICK2, lat: 10, lng: 10, last_seen: new Date().toISOString() }),
    });
    await page.locator('button:has-text("Consciousness"), button:has-text("Coscienza")').first().click();
    await page.waitForSelector(`text=${NICK2}`, { timeout: TIMEOUT });
    await page.getByText(NICK2, { exact: true }).first().click();
    try {
      await page.waitForSelector(`h2:has-text("${NICK2}")`, { timeout: TIMEOUT });
      pass('Profilo di un altro utente aperto correttamente');
    } catch (e) {
      fail('Apertura profilo altrui fallita: ' + e.message);
    }
    await page.locator('.modal-overlay button[aria-label="Close"], .modal-overlay button[aria-label="Chiudi"]').first().click().catch(() => {});

    // ── Caso 5: classifica (righe o "nessun dato"), niente telepathy_scores ──
    console.log('\n📋 Caso 5: classifica telepatia');
    await page.locator('button:has-text("Telepathy"), button:has-text("Telepatia")').first().click();
    try {
      // La sezione classifica è sempre in fondo alla lobby: mostra righe oppure il
      // messaggio "nessun dato" — la sua sola presenza copre entrambi i casi.
      await page.waitForSelector('h3:has-text("Top telepaths"), h3:has-text("Migliori telepati")', { timeout: TIMEOUT });
      pass('Lobby telepatia mostra la sezione classifica (righe o nessun dato)');
    } catch (e) {
      fail('Sezione classifica non trovata: ' + e.message);
    }

    capturing = false; // fine della finestra di osservazione per Step 1

    // ── Verifica sulle richieste raccolte durante il Caso 1 + 5 ─────────────
    console.log('\n📋 Verifica richieste di rete raccolte');
    const profilesWrites = restRequests.filter((r) => r.url.includes('/rest/v1/profiles') && (r.method === 'POST' || r.method === 'PATCH'));
    const profilesBadSelect = restRequests.filter((r) => r.url.includes('/rest/v1/profiles')
      && (r.url.includes('select=*') || /select=[^&]*\b(email|password_hash)\b/.test(r.url)));
    const telepathyScoresReq = restRequests.filter((r) => r.url.includes('/rest/v1/telepathy_scores'));

    if (profilesWrites.length === 0) pass('Nessuna scrittura (POST/PATCH) su /rest/v1/profiles');
    else fail('Scritture dirette su profiles trovate: ' + JSON.stringify(profilesWrites));

    if (profilesBadSelect.length === 0) pass('Nessuna select=* né email/password_hash nel select su /rest/v1/profiles');
    else fail('Select non whitelisted su profiles trovate: ' + JSON.stringify(profilesBadSelect));

    if (telepathyScoresReq.length === 0) pass('Nessuna richiesta a /rest/v1/telepathy_scores');
    else fail('Richieste dirette a telepathy_scores trovate: ' + JSON.stringify(telepathyScoresReq));

    // ── Caso 2: la bio nel DB è quella nuova ────────────────────────────────
    console.log('\n📋 Caso 2: bio persistita nel DB');
    const rowsAfterSave = (await serviceFetch(`profiles?nickname=eq.${encodeURIComponent(NICK)}&select=bio`)).body;
    if (Array.isArray(rowsAfterSave) && rowsAfterSave[0] && rowsAfterSave[0].bio === newBio) {
      pass('La bio nel DB corrisponde a quella salvata dal profilo');
    } else {
      fail('Bio nel DB NON aggiornata: ' + JSON.stringify(rowsAfterSave));
    }

    // ── Caso 3: senza ga_pwhash l'iscritto non resta dentro a metà ────────
    // Prima restava dentro e ogni salvataggio falliva; dalla chiave scaduta (02/10/2026) l'app lo
    // riconosce all'apertura e porta al login col riquadro del link già pronto.
    console.log('\n📋 Caso 3: iscritto senza credenziale locale');
    await page.evaluate(() => localStorage.removeItem('ga_pwhash'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('text=/sign in again|devi rientrare/', { timeout: TIMEOUT });
      pass('Senza credenziale si torna al login con il messaggio «devi rientrare»');
    } catch (e) {
      fail('Senza credenziale NON torna al login con il messaggio: ' + e.message);
    }
    const valoriEmail = await page.locator('input[type="email"]').evaluateAll((els) => els.map((e) => e.value));
    if (valoriEmail.includes(EMAIL)) pass("Il riquadro del link ha già l'email scritta");
    else fail("Il riquadro del link non ha l'email: " + JSON.stringify(valoriEmail));
    const rowsAfter = (await serviceFetch(`profiles?nickname=eq.${encodeURIComponent(NICK)}&select=bio`)).body;
    if (Array.isArray(rowsAfter) && rowsAfter[0] && rowsAfter[0].bio === newBio) pass('Il profilo nel DB è intatto');
    else fail('Il profilo nel DB è cambiato: ' + JSON.stringify(rowsAfter));

    // ── Caso 4a: cambio password con credenziale valida → successo ─────────
    console.log('\n📋 Caso 4: cambio password (percorso positivo)');
    await login(page, EMAIL, PASS); // si è già sul login (Caso 3): ripristina ga_pwhash valido
    await openEditProfile(page);
    await page.locator('input[placeholder="New password..."]').fill(NEW_PASS);
    lastDialogMessage = null;
    await page.locator('.modal-content button:has-text("Change Password"), .modal-content button:has-text("Cambia Password")').click();
    try {
      await page.waitForSelector('text=/^Password set!$|^Password impostata!$/', { timeout: TIMEOUT });
      pass('Cambio password riuscito — messaggio di successo mostrato');
    } catch (e) {
      fail('Cambio password non ha mostrato il successo: ' + e.message);
    }
    await closeEditProfile(page);
    await logout(page);
    await login(page, EMAIL, NEW_PASS);
    pass('Login con la password nuova riuscito dopo il cambio');

    // ── Caso 4b: la chiave cambia sul server mentre si è dentro → al login ─
    // Come la 27b_: il server azzera la credenziale, il telefono non lo sa. Al primo rifiuto
    // (qui il cambio password) l'app deve portare al login, non dire «non è stato possibile».
    console.log('\n📋 Caso 4: chiave ruotata sul server durante l\'uso');
    await serviceFetch(`profiles?email=eq.${encodeURIComponent(EMAIL)}`, { method: 'PATCH', body: JSON.stringify({ password_hash: null }) });
    await openEditProfile(page);
    await page.locator('input[placeholder="New password..."]').fill(NEW_PASS2);
    await page.locator('.modal-content button:has-text("Change Password"), .modal-content button:has-text("Cambia Password")').click();
    try {
      await page.waitForSelector('text=/sign in again|devi rientrare/', { timeout: TIMEOUT });
      pass("Chiave ruotata durante l'uso: si torna al login con il messaggio");
    } catch (e) {
      fail("Chiave ruotata durante l'uso: NON torna al login: " + e.message);
    }
  } catch (err) {
    fail('Eccezione: ' + err.message);
    console.error(err);
  } finally {
    // ── Pulizia ──────────────────────────────────────────────────────────
    await deleteTestAccount(EMAIL);
    await deleteTestAccount(EMAIL2);
    if (onlineUsers2Id) await serviceFetch(`online_users?id=eq.${encodeURIComponent(onlineUsers2Id)}`, { method: 'DELETE' });
    await serviceFetch(`online_users?id=eq.${encodeURIComponent(`acctui-${TS}`)}`, { method: 'DELETE' });
    console.log('\n  (Account e presenza di test rimossi da Supabase)');

    console.log('\n═══════════════════════════════════════');
    const totale = passed + failed;
    console.log(`  ${passed}/${totale} test passati`);
    console.log(process.exitCode === 1 ? '  RISULTATO: ❌ FALLITO' : '  RISULTATO: ✅ PASSATO');
    console.log('═══════════════════════════════════════\n');

    await browser.close();
  }
})();
