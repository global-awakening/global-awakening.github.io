/**
 * Helper condivisi per i test E2E — Global Awakening
 *
 * Scopo principale: pulizia dati di test sulle tabelle protette da RLS.
 *
 * Dopo Messaggi/Rituali Step B le scritture passano solo da RPC SECURITY DEFINER
 * e le policy pubbliche (incluse DELETE) sono state droppate. Una DELETE via anon
 * key non cancella nulla ma PostgREST risponde comunque 2xx → la vecchia cleanup
 * "sembrava" riuscire e invece lasciava i dati nel DB (purge manuale da Studio).
 *
 * Soluzione: la pulizia usa la chiave di servizio (bypassa RLS). La key NON è
 * versionata: va messa in .env.test (gitignored) o nell'ambiente. Se manca, la
 * pulizia NON finge — stampa un warning onesto e si salta.
 */

const fs = require('fs');
const path = require('path');

let _envLoaded = false;

/** Carica .env.test (se presente) nelle variabili d'ambiente. Mini-parser, niente dotenv. */
function loadTestEnv() {
  if (_envLoaded) return;
  _envLoaded = true;
  const envPath = path.join(__dirname, '.env.test');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

/** Ritorna la chiave di servizio se disponibile (env o .env.test), altrimenti null. */
function getServiceKey() {
  loadTestEnv();
  return process.env.SUPABASE_SERVICE_KEY || null;
}

/**
 * Esegue DELETE reali sulle tabelle protette da RLS usando la chiave di servizio.
 *
 * @param {string} supabaseUrl   es. 'https://xxx.supabase.co'
 * @param {string[]} paths       percorsi REST con filtro, es. 'private_messages?sender_name=eq.X'
 * @param {object} [opts]
 * @param {string} [opts.label]  etichetta per i log
 * @returns {Promise<{ran:boolean, deleted:number|null, reason?:string}>}
 *
 * I filtri DEVONO essere specifici (nickname/email con timestamp del run): la
 * la chiave di servizio bypassa RLS, quindi una query senza filtro cancellerebbe dati veri.
 */
async function purge(supabaseUrl, paths, { label = 'cleanup' } = {}) {
  const key = getServiceKey();
  if (!key) {
    console.warn(`  ⚠️  [${label}] SUPABASE_SERVICE_KEY non impostata: pulizia SALTATA.`);
    console.warn(`     I dati di test resteranno nel DB. Per pulire in automatico:`);
    console.warn(`     copia .env.test.example in .env.test e incolla la chiave di servizio`);
    console.warn(`     (Supabase Dashboard → Project Settings → API → chiave di servizio).`);
    return { ran: false, deleted: null, reason: 'no-service-key' };
  }
  let total = 0;
  for (const p of paths) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${p}`, {
        method: 'DELETE',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation', // il body elenca le righe cancellate → contabili
        },
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (Array.isArray(body)) total += body.length;
      } else {
        console.warn(`  ⚠️  [${label}] DELETE ${p} → HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn(`  ⚠️  [${label}] DELETE ${p} fallita: ${e.message}`);
    }
  }
  console.log(`  🧹 [${label}] righe di test cancellate: ${total}`);
  return { ran: true, deleted: total };
}

/**
 * Login come ospite (guest) — flusso UI condiviso dai test E2E.
 * Estratto dai vari test (loginAsGuest/loginGuest) che lo duplicavano identico.
 * I selettori sono quelli già collaudati; il chiamante aggiunge l'eventuale log.
 *
 * @param {import('playwright').Page} page
 * @param {string} nickname
 * @param {object} [opts]
 * @param {string} [opts.appUrl]   default http://localhost:4321/app.html
 * @param {number} [opts.timeout]  default 20000 ms
 */
async function loginAsGuest(page, nickname, { appUrl = 'http://localhost:4321/app.html', timeout = 20000 } = {}) {
  await page.goto(appUrl);
  await page.waitForSelector('button:has-text("Ospite"), button:has-text("Guest")', { timeout });
  // Il tab Ospite potrebbe già essere attivo: cliccarlo è idempotente.
  await page.locator('button:has-text("Ospite"), button:has-text("Guest")').first().click();
  await page.locator('input[placeholder*="username"], input[placeholder*="Username"]').first().fill(nickname);
  await page.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")').click();
  await page.waitForSelector('button:has-text("Logout"), button:has-text("Esci")', { timeout });
}

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';

/**
 * Come getServiceKey, ma senza chiave il test si FERMA. Senza chiave di servizio un test
 * non può né creare né verificare gli account di prova:
 * lasciarlo proseguire vorrebbe dire vederlo "passare" senza aver controllato nulla.
 */
function requireServiceKey() {
  const key = getServiceKey();
  if (!key) {
    console.error('⛔  SUPABASE_SERVICE_KEY mancante: questo test non può girare senza.');
    console.error('    Copia .env.test.example in .env.test e incolla la chiave di servizio.');
    process.exit(2);
  }
  return key;
}

/** REST con la chiave di servizio (bypassa RLS). Filtri SEMPRE specifici del run. */
async function serviceFetch(p, opts = {}) {
  const key = requireServiceKey();
  const { headers, ...rest } = opts;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...headers,
    },
    ...rest,
  });
  let body = null;
  try { body = await res.json(); } catch { /* vuoto */ }
  return { status: res.status, body };
}

/** Crea un account di test direttamente in profiles, con la chiave di servizio. */
async function createTestAccount(campi) {
  const riga = {
    bio: '', starseed_type: '', avatar: '', country: '', interests: [],
    experience_level: '', telepathy_score: 0, telepathy_best: 0, show_telepathy_score: true,
    ...campi,
  };
  const r = await serviceFetch('profiles', { method: 'POST', body: JSON.stringify(riga) });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`createTestAccount fallito: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return Array.isArray(r.body) ? r.body[0] : r.body;
}

/** Cancella l'account di test e tutto ciò che il flusso account gli ha appeso. */
async function deleteTestAccount(email) {
  const e = encodeURIComponent(email);
  for (const p of [`profiles?email=eq.${e}`, `magic_links?email=eq.${e}`,
                   `password_resets?email=eq.${e}`, `login_attempts?email=eq.${e}`,
                   `account_email_log?email=eq.${e}`]) {
    await serviceFetch(p, { method: 'DELETE' }); // 404 = tabella non ancora creata: va bene
  }
}

module.exports = { loadTestEnv, getServiceKey, purge, loginAsGuest,
  SUPABASE_URL, requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount };
