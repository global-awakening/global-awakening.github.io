#!/usr/bin/env node
/**
 * deploy-push.js — pubblica la Edge Function delle notifiche e carica le chiavi VAPID.
 *
 * Perché esiste: sia il deploy sia il caricamento dei segreti vogliono il token Supabase e le
 * chiavi VAPID, che stanno in `.env.local` (escluso da git). Invece di far copiare valori a
 * mano — dove un carattere di troppo non dà nessun errore comprensibile — li legge da lì e li
 * passa alla CLI come variabili d'ambiente. Nessun valore viene mai stampato a schermo.
 *
 * Uso:
 *   node scripts/deploy-push.js            # pubblica la funzione e carica i segreti
 *   node scripts/deploy-push.js --dry-run  # dice solo cosa farebbe
 *
 * Il project ref viene letto da supabase/.temp/project-ref, come fa apply-sql.js.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

/** Mini-parser di .env.local, stesso approccio di apply-sql.js (niente dotenv). */
function leggiEnvLocale() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const riga of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(riga) || !riga.trim()) continue;
    const m = riga.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    else if (/^sbp_/.test(riga.trim())) out.SUPABASE_ACCESS_TOKEN = riga.trim();
  }
  return out;
}

function projectRef() {
  const p = path.join(ROOT, 'supabase', '.temp', 'project-ref');
  if (!fs.existsSync(p)) {
    console.error('⛔  Non trovo supabase/.temp/project-ref: il progetto non risulta collegato.');
    process.exit(2);
  }
  return fs.readFileSync(p, 'utf8').trim();
}

function esegui(descrizione, argomenti, env) {
  console.log(`\n▶  ${descrizione}…`);
  const r = spawnSync('npx', ['--yes', 'supabase', ...argomenti], {
    cwd: ROOT, env, stdio: 'inherit', shell: true
  });
  if (r.status !== 0) {
    console.error(`\n⛔  ${descrizione}: non riuscito.`);
    console.error('    Se l\'errore parla di permessi o di token, il token in .env.local ha');
    console.error('    l\'ambito ristretto al solo Database. Per pubblicare una Edge Function');
    console.error('    serve un token con anche il permesso "Edge Functions":');
    console.error('      https://supabase.com/dashboard/account/tokens');
    process.exit(1);
  }
}

function main() {
  const prova = process.argv.includes('--dry-run');
  const env = leggiEnvLocale();
  const ref = projectRef();

  const mancanti = ['SUPABASE_ACCESS_TOKEN', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
    .filter((k) => !env[k]);
  if (mancanti.length > 0) {
    console.error(`⛔  Mancano in .env.local: ${mancanti.join(', ')}`);
    if (mancanti.includes('VAPID_PUBLIC_KEY')) {
      console.error('    Le chiavi VAPID si generano con:  node scripts/gen-vapid.js');
    }
    process.exit(2);
  }

  console.log(`Progetto Supabase: ${ref}`);
  console.log('Funzione da pubblicare: notify-ritual-start');
  console.log('Segreti da caricare: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT');

  if (prova) {
    console.log('\n🔍 [dry-run] niente è stato pubblicato.');
    return;
  }

  const ambiente = { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN };

  esegui('pubblico la Edge Function', ['functions', 'deploy', 'notify-ritual-start', '--project-ref', ref], ambiente);

  esegui('carico i segreti VAPID', [
    'secrets', 'set',
    `VAPID_PUBLIC_KEY=${env.VAPID_PUBLIC_KEY}`,
    `VAPID_PRIVATE_KEY=${env.VAPID_PRIVATE_KEY}`,
    'VAPID_SUBJECT=mailto:global.awakening.app@gmail.com',
    '--project-ref', ref
  ], ambiente);

  console.log('\n✅ Funzione pubblicata e segreti caricati.');
  console.log('   Prossimo passo: i due segreti nel Vault, poi 23_cron_push.sql.');
}

main();
