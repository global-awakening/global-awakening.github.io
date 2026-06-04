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
 * Soluzione: la pulizia usa la service_role key (bypassa RLS). La key NON è
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

/** Ritorna la service_role key se disponibile (env o .env.test), altrimenti null. */
function getServiceKey() {
  loadTestEnv();
  return process.env.SUPABASE_SERVICE_KEY || null;
}

/**
 * Esegue DELETE reali sulle tabelle protette da RLS usando la service_role key.
 *
 * @param {string} supabaseUrl   es. 'https://xxx.supabase.co'
 * @param {string[]} paths       percorsi REST con filtro, es. 'private_messages?sender_name=eq.X'
 * @param {object} [opts]
 * @param {string} [opts.label]  etichetta per i log
 * @returns {Promise<{ran:boolean, deleted:number|null, reason?:string}>}
 *
 * I filtri DEVONO essere specifici (nickname/email con timestamp del run): la
 * service_role key bypassa RLS, quindi una query senza filtro cancellerebbe dati veri.
 */
async function purge(supabaseUrl, paths, { label = 'cleanup' } = {}) {
  const key = getServiceKey();
  if (!key) {
    console.warn(`  ⚠️  [${label}] SUPABASE_SERVICE_KEY non impostata: pulizia SALTATA.`);
    console.warn(`     I dati di test resteranno nel DB. Per pulire in automatico:`);
    console.warn(`     copia .env.test.example in .env.test e incolla la service_role key`);
    console.warn(`     (Supabase Dashboard → Project Settings → API → service_role).`);
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

module.exports = { loadTestEnv, getServiceKey, purge, loginAsGuest };
