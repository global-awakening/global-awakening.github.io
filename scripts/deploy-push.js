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
 *   node scripts/deploy-push.js                             # pubblica tutte le funzioni e carica i segreti
 *   node scripts/deploy-push.js --solo notify-ritual-start  # una sola funzione
 *   node scripts/deploy-push.js --dry-run [--solo <nome>]   # dice solo cosa farebbe
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

// Le funzioni che questo script sa pubblicare. `--solo <nome>` ne pubblica una sola: il passo 0
// degli inviti telepatia ripubblica SOLO notify-ritual-start (è live, e va provata da sola prima
// di tutto il resto), il passo 1 pubblica SOLO notify-telepathy-invite.
const FUNZIONI = [
  { nome: 'notify-ritual-start', descrizione: 'pubblico il motore delle notifiche dei rituali' },
  { nome: 'alert-cron', descrizione: 'pubblico la sentinella sui guasti' },
  { nome: 'notify-telepathy-invite', descrizione: 'pubblico le push degli inviti telepatia' },
];

function funzioniScelte(argv) {
  const i = argv.indexOf('--solo');
  if (i === -1) return FUNZIONI;
  const nome = argv[i + 1];
  const f = FUNZIONI.find((x) => x.nome === nome);
  if (!f) {
    console.error(`⛔  --solo vuole il nome di una funzione: ${FUNZIONI.map((x) => x.nome).join(', ')}`);
    process.exit(2);
  }
  return [f];
}

function main() {
  // Il nome sbagliato si scopre prima di leggere token e chiavi: è un errore di battitura, non
  // di configurazione, e deve dirlo anche su un computer senza .env.local.
  const scelte = funzioniScelte(process.argv);
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
  console.log(`Funzioni da pubblicare: ${scelte.map((f) => f.nome).join(', ')}`);
  console.log('Segreti da caricare: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT');

  if (prova) {
    console.log('\n🔍 [dry-run] niente è stato pubblicato.');
    return;
  }

  const ambiente = { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN };

  for (const f of scelte) {
    esegui(f.descrizione, ['functions', 'deploy', f.nome, '--project-ref', ref], ambiente);
  }

  esegui('carico i segreti VAPID', [
    'secrets', 'set',
    `VAPID_PUBLIC_KEY=${env.VAPID_PUBLIC_KEY}`,
    `VAPID_PRIVATE_KEY=${env.VAPID_PRIVATE_KEY}`,
    'VAPID_SUBJECT=mailto:global.awakening.app@gmail.com',
    '--project-ref', ref
  ], ambiente);

  console.log('\n✅ Funzioni pubblicate e segreti caricati.');
}

main();
