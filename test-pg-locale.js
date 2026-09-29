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
  console.log(`\n${passed} passati, ${failed} falliti`);
})().catch(e => { console.log('  ❌ eccezione: ' + e.message); process.exitCode = 1; });
