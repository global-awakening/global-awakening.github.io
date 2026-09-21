/**
 * Verifica lo stato dei job pg_cron delle notifiche push.
 *
 * Non li esegue: controlla che esistano, che siano attivi, che l'estensione che serve sia
 * davvero installata e — soprattutto — che NON stiano fallendo. È il controllo che è mancato
 * per cinque mesi, durante i quali un cron ha fallito 33.615 volte senza che nessuno lo sapesse.
 *
 * Esecuzione: node test-push-cron.js
 * Prerequisiti: 23_cron_push.sql applicata, Edge Function notify-ritual-start pubblicata.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function interroga(sql) {
  const f = path.join(os.tmpdir(), `cronq_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql, { encoding: 'utf8' });
  try {
    const out = execFileSync('node', ['scripts/apply-sql.js', f], { encoding: 'utf8' });
    const m = out.match(/righe restituite: (.*)/);
    return m ? JSON.parse(m[1]) : [];
  } finally {
    try { fs.unlinkSync(f); } catch (_) {}
  }
}

let passati = 0, falliti = 0;
const ok = (n) => { console.log('  ✅ ' + n); passati++; };
const ko = (n, d) => { console.log('  ❌ ' + n + (d ? ' — ' + d : '')); falliti++; process.exitCode = 1; };

const job = interroga('select jobname, schedule, active from cron.job order by jobname;');

const motore = job.find((j) => j.jobname === 'notify-ritual-start');
motore ? ok('il job del motore esiste') : ko('il job del motore esiste', 'assente');
if (motore) {
  motore.schedule === '* * * * *' ? ok('il motore gira ogni minuto') : ko('il motore gira ogni minuto', motore.schedule);
  motore.active ? ok('il job del motore è attivo') : ko('il job del motore è attivo', 'spento');
}

const allarme = job.find((j) => j.jobname === 'allarme-cron-falliti');
allarme && allarme.active
  ? ok('la sentinella sui fallimenti è attiva')
  : ko('la sentinella sui fallimenti è attiva', allarme ? 'spenta' : 'assente');

const vecchio = job.find((j) => j.jobname === 'notify-ritual-participants');
!vecchio || !vecchio.active
  ? ok('il vecchio job rotto è spento')
  : ko('il vecchio job rotto è spento', 'ancora attivo');

// pg_net deve essere INSTALLATA, non solo disponibile: senza, net.http_post non esiste e il
// cron fallisce a ogni giro. È uno dei tre bug che si nascondevano dietro il primo.
const est = interroga("select extname from pg_extension where extname = 'pg_net';");
est.length === 1 ? ok('pg_net è installata') : ko('pg_net è installata', 'assente: il cron non può chiamare nulla');

// Il controllo che conta: nessun fallimento recente.
const recenti = interroga(`
  select coalesce(count(*), 0)::int as n
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
   where j.jobname in ('notify-ritual-start', 'allarme-cron-falliti')
     and d.status = 'failed'
     and d.start_time > now() - interval '24 hours';
`);
const n = recenti[0] ? recenti[0].n : 0;
if (n === 0) {
  ok('nessun fallimento nelle ultime 24 ore');
} else {
  const perche = interroga(`
    select left(d.return_message, 200) as errore, count(*)::int as n
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where j.jobname in ('notify-ritual-start', 'allarme-cron-falliti')
       and d.status = 'failed'
       and d.start_time > now() - interval '24 hours'
     group by 1 order by 2 desc limit 3;
  `);
  ko('nessun fallimento nelle ultime 24 ore', `${n} fallimenti — ${JSON.stringify(perche)}`);
}

console.log(`\nRisultato: ${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
