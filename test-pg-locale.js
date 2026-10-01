/**
 * Il Postgres locale regge le funzioni di oggi — Global Awakening
 * node test-pg-locale.js
 */
const { creaDbLocale } = require('./scripts/pg-locale');
let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };

(async () => {
  const db = await creaDbLocale({ con28: false });
  const r = await db.query(`SELECT id, date, time FROM create_ritual('Ospite','s1','Prova','','consciousness',11,'2026-10-24','05:00',3,NULL)`);
  check(r.rows.length === 1 && r.rows[0].date === '2026-10-24' && r.rows[0].time === '05:00:00',
    'create_ritual di oggi scrive date/time come testo YYYY-MM-DD / HH:MM:SS', r.rows);
  const tz = await db.query(`SELECT ('2026-10-26 07:00'::timestamp AT TIME ZONE 'Europe/Rome') AS t`);
  check(new Date(tz.rows[0].t).toISOString() === '2026-10-26T06:00:00.000Z', 'ora legale: il 26/10 le 07 di Roma sono le 06Z', tz.rows);
  // Schema della telepatia (inviti offline, 32a/32b): tabelle, net e cron finti.
  const { creaDbTelepatia } = require('./scripts/pg-locale');
  const dt = await creaDbTelepatia({ con32a: false });
  const tabelle = (await dt.query(`SELECT string_agg(table_name, ',' ORDER BY table_name) t FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('telepathy_matches','telepathy_invites','online_users','notifications','telepathy_scores','user_blocks','telepathy_queue')`)).rows[0].t;
  check(tabelle === 'notifications,online_users,telepathy_invites,telepathy_matches,telepathy_queue,telepathy_scores,user_blocks', 'schema telepatia: le tabelle ci sono', tabelle);
  await dt.query(`SELECT net.http_post(url := 'https://x/functions/v1/prova', body := '{"a":1}'::jsonb)`);
  const ch = (await dt.query(`SELECT url, body FROM net.chiamate`)).rows;
  check(ch.length === 1 && ch[0].body.a === 1, 'net.http_post finto registra la chiamata', ch);
  const job = (await dt.query(`SELECT command FROM cron.job WHERE jobname = 'notify-ritual-start'`)).rows;
  check(job.length === 1 && job[0].command.includes('notify-ritual-start'), 'cron: c\'è il job della 23_', job);
  const pol = (await dt.query(`SELECT count(*)::int n FROM pg_policies WHERE tablename = 'telepathy_invites'`)).rows[0].n;
  check(pol === 8, 'telepathy_invites ha le 8 policy del catalogo', pol);
  // I test SQL di prima non vedono niente di tutto questo.
  const vecchio = await creaDbLocale();
  const nt = (await vecchio.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_name = 'telepathy_invites'`)).rows[0].n;
  check(nt === 0, 'creaDbLocale resta com\'era (test-candela crea da sé le sue tabelle)', nt);
  console.log(`\n${passed} passati, ${failed} falliti`);
})().catch(e => { console.log('  ❌ eccezione: ' + e.message); process.exitCode = 1; });
