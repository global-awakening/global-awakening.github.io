/**
 * Verifica lo stato dei job pg_cron delle notifiche push.
 *
 * Non li esegue: controlla che esistano, che siano attivi, che l'estensione che serve sia
 * davvero installata e — soprattutto — che non stia fallendo niente. È il controllo che è
 * mancato per cinque mesi, durante i quali un cron ha fallito 33.615 volte senza che nessuno
 * lo sapesse.
 *
 * Guarda DUE cose diverse, e la seconda è quella che serve davvero:
 *   - `cron.job_run_details`: i job che pg_cron dichiara falliti (errori di sintassi SQL,
 *     permessi). È la classe a cui apparteneva il guasto di aprile;
 *   - `net._http_response`: l'esito vero delle chiamate HTTP. `net.http_post` non aspetta la
 *     risposta, quindi un job che chiama una Edge Function che risponde 401 o 404 risulta
 *     `succeeded`. Senza questo secondo controllo, il guasto più probabile di oggi sarebbe
 *     invisibile esattamente come quello di aprile.
 *
 * Esecuzione: node test-push-cron.js
 * Prerequisiti: 23_cron_push.sql applicata, Edge Function notify-ritual-start pubblicata.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * apply-sql.js stampa il risultato TRONCATO a 500 caratteri. Ogni interrogazione qui deve
 * quindi restituire una riga sola e stretta; se il troncamento colpisce lo stesso, si dice
 * invece di esplodere con un JSON.parse incomprensibile.
 */
function interroga(sql) {
  const f = path.join(os.tmpdir(), `cronq_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql, { encoding: 'utf8' });
  try {
    const out = execFileSync('node', ['scripts/apply-sql.js', f], { encoding: 'utf8' });
    const m = out.match(/righe restituite: (.*)/);
    if (!m) return [];
    try {
      return JSON.parse(m[1]);
    } catch (_) {
      throw new Error('risultato troncato da apply-sql.js (500 caratteri): restringi la query — ' + m[1].slice(0, 120));
    }
  } finally {
    try { fs.unlinkSync(f); } catch (_) {}
  }
}

let passati = 0, falliti = 0;
const ok = (n) => { console.log('  ✅ ' + n); passati++; };
const ko = (n, d) => { console.log('  ❌ ' + n + (d ? ' — ' + d : '')); falliti++; process.exitCode = 1; };

try {
  // --- i job, uno alla volta, per non far crescere il risultato ---
  const motore = interroga("select schedule, active from cron.job where jobname = 'notify-ritual-start';");
  if (motore.length === 0) {
    ko('il job del motore esiste', 'assente');
  } else {
    ok('il job del motore esiste');
    motore[0].schedule === '* * * * *' ? ok('il motore gira ogni minuto') : ko('il motore gira ogni minuto', motore[0].schedule);
    motore[0].active ? ok('il job del motore è attivo') : ko('il job del motore è attivo', 'spento');
  }

  const sentinella = interroga("select active from cron.job where jobname = 'controllo-salute-cron';");
  sentinella.length === 1 && sentinella[0].active
    ? ok('la sentinella sulla salute è attiva')
    : ko('la sentinella sulla salute è attiva', sentinella.length ? 'spenta' : 'assente');

  const vecchio = interroga("select active from cron.job where jobname = 'notify-ritual-participants';");
  vecchio.length === 0 || !vecchio[0].active
    ? ok('il vecchio job rotto è spento')
    : ko('il vecchio job rotto è spento', 'ancora attivo');

  // pg_net deve essere INSTALLATA, non solo disponibile: senza, net.http_post non esiste e il
  // cron fallisce a ogni giro. Era uno dei tre bug che si nascondevano dietro il primo.
  const est = interroga("select extname from pg_extension where extname = 'pg_net';");
  est.length === 1 ? ok('pg_net è installata') : ko('pg_net è installata', 'assente: il cron non può chiamare nulla');

  const fn = interroga("select proname from pg_proc where proname = 'controlla_salute_cron';");
  fn.length === 1 ? ok('la funzione di controllo esiste') : ko('la funzione di controllo esiste', 'assente');

  // --- i due controlli che contano ---
  // Solo i job ATTIVI: i fallimenti storici di un job che è stato spento apposta non sono
  // azionabili, e lascerebbero il test rosso per 24 ore dopo ogni spegnimento. Chi spegne un
  // job lo sta facendo di proposito.
  const jobFalliti = interroga(`
    select count(*)::int as n
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where d.status = 'failed' and d.start_time > now() - interval '24 hours' and j.active;
  `);
  const nJob = jobFalliti[0] ? jobFalliti[0].n : 0;
  nJob === 0
    ? ok('nessuna esecuzione di cron fallita nelle ultime 24 ore')
    : ko('nessuna esecuzione di cron fallita nelle ultime 24 ore', `${nJob} fallimenti — guarda cron.job_run_details.return_message`);

  if (est.length === 1) {
    const risposte = interroga(`
      select count(*)::int as n from net._http_response
       where created > now() - interval '24 hours'
         and (error_msg is not null or status_code is null or status_code < 200 or status_code >= 300);
    `);
    const nHttp = risposte[0] ? risposte[0].n : 0;
    nHttp === 0
      ? ok('nessuna risposta HTTP non riuscita nelle ultime 24 ore')
      : ko('nessuna risposta HTTP non riuscita nelle ultime 24 ore', `${nHttp} risposte — guarda net._http_response.status_code`);
  }
} catch (e) {
  ko('il test è arrivato in fondo', e.message);
}

console.log(`\nRisultato: ${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
