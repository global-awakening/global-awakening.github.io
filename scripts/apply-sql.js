#!/usr/bin/env node
/**
 * apply-sql.js — applica un file SQL al database Supabase senza passare dallo Studio.
 *
 * Perché esiste: fino a oggi ogni migration in supabase/sql/ andava copiata a mano
 * nel SQL Editor del dashboard. Questo script fa lo stesso lavoro dal terminale,
 * così una migration si applica e si testa nello stesso giro.
 *
 * Uso:
 *   node scripts/apply-sql.js supabase/sql/16_moderazione.sql
 *   node scripts/apply-sql.js supabase/sql/16_moderazione.sql --dry-run
 *
 * Credenziale: un token Supabase con **ambito ristretto** (prefisso `sbp_fc`),
 * limitato al solo progetto Global Awakening e al solo permesso Database
 * read-write. Si crea da https://supabase.com/dashboard/account/tokens e si
 * incolla in `.env.local` (escluso da git) come:
 *   SUPABASE_ACCESS_TOKEN=sbp_fc...
 *
 * Il project ref NON è hardcodato: viene letto da supabase/.temp/project-ref,
 * scritto dalla CLI quando il progetto è stato collegato. Se un domani cambia,
 * lo script lo segue senza modifiche (stessa scelta fatta per il keepalive).
 *
 * Endpoint: POST https://api.supabase.com/v1/projects/{ref}/database/query
 * (Management API, in beta secondo la documentazione Supabase.)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://api.supabase.com';

/**
 * Mini-parser di .env.local, stesso approccio di test-helpers.js (niente dotenv).
 *
 * Accetta due formati, perché incollare il solo token è l'errore naturale da fare:
 *   SUPABASE_ACCESS_TOKEN=sbp_fc...   (forma canonica)
 *   sbp_fc...                         (token nudo su una riga, riconosciuto dal prefisso)
 */
function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;

    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) {
      if (!(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // Riga senza "=": se ha la forma di un token Supabase, la usiamo come tale.
    const nudo = line.trim().replace(/^["']|["']$/g, '');
    if (/^sbp_/.test(nudo) && !process.env.SUPABASE_ACCESS_TOKEN) {
      process.env.SUPABASE_ACCESS_TOKEN = nudo;
    }
  }
}

function getToken() {
  loadLocalEnv();
  const tok = process.env.SUPABASE_ACCESS_TOKEN;
  if (!tok) {
    console.error('❌ SUPABASE_ACCESS_TOKEN non impostata.');
    console.error('');
    console.error('   1. apri https://supabase.com/dashboard/account/tokens');
    console.error('   2. crea un token con ambito ristretto: solo il progetto');
    console.error('      Global Awakening, solo permesso Database → Read-write');
    console.error('   3. copia .env.local.example in .env.local e incolla il token');
    process.exit(1);
  }
  return tok;
}

function getProjectRef() {
  const refPath = path.join(ROOT, 'supabase', '.temp', 'project-ref');
  if (!fs.existsSync(refPath)) {
    console.error(`❌ project ref non trovato in ${refPath}`);
    console.error('   Il progetto non risulta collegato: esegui prima `supabase link`.');
    process.exit(1);
  }
  return fs.readFileSync(refPath, 'utf8').trim();
}

async function runQuery(ref, token, sql) {
  const res = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const files = args.filter(a => !a.startsWith('--'));

  if (files.length === 0) {
    console.error('Uso: node scripts/apply-sql.js <file.sql> [altri.sql ...] [--dry-run]');
    process.exit(1);
  }

  for (const f of files) {
    const abs = path.isAbsolute(f) ? f : path.join(ROOT, f);
    if (!fs.existsSync(abs)) {
      console.error(`❌ file non trovato: ${f}`);
      process.exit(1);
    }
  }

  const ref = getProjectRef();
  const token = dryRun ? null : getToken();

  console.log(`Progetto Supabase: ${ref}`);

  for (const f of files) {
    const abs = path.isAbsolute(f) ? f : path.join(ROOT, f);
    const sql = fs.readFileSync(abs, 'utf8');
    const righe = sql.split(/\r?\n/).length;

    if (dryRun) {
      console.log(`\n🔍 [dry-run] ${f} — ${righe} righe, non applicato.`);
      continue;
    }

    console.log(`\n▶  applico ${f} (${righe} righe)…`);
    const { ok, status, body } = await runQuery(ref, token, sql);

    if (ok) {
      console.log(`✅ ${f} applicato (HTTP ${status}).`);
      if (Array.isArray(body) && body.length > 0) {
        console.log('   righe restituite:', JSON.stringify(body).slice(0, 500));
      }
    } else {
      console.error(`❌ ${f} NON applicato (HTTP ${status}).`);
      console.error('   ', typeof body === 'string' ? body.slice(0, 1000) : JSON.stringify(body, null, 2).slice(0, 1000));
      process.exitCode = 1;
      // Si ferma al primo errore: applicare i file successivi su uno stato
      // parziale renderebbe più difficile capire cosa è andato storto.
      break;
    }
  }
})();
