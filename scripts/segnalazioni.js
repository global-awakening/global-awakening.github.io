#!/usr/bin/env node
/**
 * segnalazioni.js — elenca le segnalazioni di contenuto da moderare.
 *
 * content_reports ha RLS attiva senza policy: non è leggibile né dal client né
 * con la anon key (è giusto così, contiene chi ha segnalato chi). Questo script
 * la interroga con lo stesso token ad ambito ristretto di apply-sql.js.
 *
 * Uso:
 *   node scripts/segnalazioni.js              # solo quelle aperte
 *   node scripts/segnalazioni.js --tutte      # anche quelle già trattate
 *   node scripts/segnalazioni.js --chiudi <id> <esito>
 *        esito ∈ reviewed | actioned | dismissed
 *
 * Credenziale: SUPABASE_ACCESS_TOKEN in .env.local (vedi scripts/apply-sql.js).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://api.supabase.com';
const ESITI = ['reviewed', 'actioned', 'dismissed'];

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
    const nudo = line.trim().replace(/^["']|["']$/g, '');
    if (/^sbp_/.test(nudo) && !process.env.SUPABASE_ACCESS_TOKEN) process.env.SUPABASE_ACCESS_TOKEN = nudo;
  }
}

function getToken() {
  loadLocalEnv();
  const tok = process.env.SUPABASE_ACCESS_TOKEN;
  if (!tok) {
    console.error('❌ SUPABASE_ACCESS_TOKEN non impostata in .env.local.');
    console.error('   Vedi le istruzioni in scripts/apply-sql.js.');
    process.exit(1);
  }
  return tok;
}

function getProjectRef() {
  const p = path.join(ROOT, 'supabase', '.temp', 'project-ref');
  if (!fs.existsSync(p)) { console.error(`❌ project ref non trovato in ${p}`); process.exit(1); }
  return fs.readFileSync(p, 'utf8').trim();
}

/** Letterale SQL: raddoppia gli apici. Gli input arrivano dalla riga di comando. */
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

async function query(ref, token, sql) {
  const res = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  if (!res.ok) { console.error(`❌ HTTP ${res.status}`, JSON.stringify(body).slice(0, 600)); process.exit(1); }
  return body;
}

(async () => {
  const args = process.argv.slice(2);
  const ref = getProjectRef();
  const token = getToken();

  const iChiudi = args.indexOf('--chiudi');
  if (iChiudi !== -1) {
    const id = args[iChiudi + 1];
    const esito = args[iChiudi + 2];
    if (!id || !ESITI.includes(esito)) {
      console.error(`Uso: node scripts/segnalazioni.js --chiudi <id> <${ESITI.join('|')}>`);
      process.exit(1);
    }
    const rows = await query(ref, token,
      `update content_reports set status = ${lit(esito)} where id = ${lit(id)} returning id, status;`);
    if (Array.isArray(rows) && rows.length > 0) console.log(`✅ segnalazione ${id} → ${esito}`);
    else console.log(`⚠️  nessuna segnalazione con id ${id}`);
    return;
  }

  const tutte = args.includes('--tutte');
  const where = tutte ? '' : "where status = 'open'";
  const rows = await query(ref, token,
    `select id, created_at, status, reason, content_type, target_nickname,
            reporter_nickname, content_id, content_snapshot, details
       from content_reports ${where}
       order by created_at desc limit 100;`);

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(tutte ? 'Nessuna segnalazione registrata.' : 'Nessuna segnalazione aperta. 🎉');
    return;
  }

  const una = rows.length === 1;
  console.log(`${rows.length} segnalazion${una ? 'e' : 'i'}${tutte ? '' : (una ? ' aperta' : ' aperte')}:\n`);
  for (const r of rows) {
    const quando = new Date(r.created_at).toLocaleString('it-IT');
    console.log(`── ${quando}  [${r.status}]  ${r.reason}  su ${r.content_type}`);
    console.log(`   id        : ${r.id}`);
    console.log(`   autore    : ${r.target_nickname || '(ignoto)'}`);
    console.log(`   segnalato da: ${r.reporter_nickname}`);
    if (r.content_snapshot) console.log(`   testo     : ${String(r.content_snapshot).replace(/\s+/g, ' ').slice(0, 300)}`);
    if (r.details) console.log(`   note      : ${String(r.details).replace(/\s+/g, ' ').slice(0, 300)}`);
    console.log('');
  }
  if (!tutte) console.log('Per chiudere: node scripts/segnalazioni.js --chiudi <id> actioned|dismissed|reviewed');
})();
