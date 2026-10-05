/**
 * Push in quattro lingue (33_, poi 33_ritorno) — lato SQL, su Postgres locale (PGlite).
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-lingue-push-sql.js
 *
 * Niente Supabase: la 24_ è l'ultima versione di register_push_subscription oggi online; la 33_
 * allarga solo la lista delle lingue, il ritorno la rimette com'era e riporta a «en» le righe es/fr.
 */
const { creaDbTelepatia, applicaFile } = require('./scripts/pg-locale');
let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };
const errore = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

const F24 = 'supabase/sql/24_push_hardening.sql';
const F33 = 'supabase/sql/33_lingue_push.sql';
const F33R = 'supabase/sql/33_ritorno.sql';

// Host accettato dalla 24_: fcm.googleapis.com.
const registra = (db, n, locale) => db.query(
  `SELECT public.register_push_subscription($1, $2, 'k', 'a', $3)`,
  ['sess-prova', 'https://fcm.googleapis.com/fcm/send/prova_' + n, locale]);
const lingue = async (db) => (await db.query(`SELECT endpoint, locale FROM push_subscriptions ORDER BY endpoint`)).rows;

(async () => {
  const db = await creaDbTelepatia({ con32a: false });
  await applicaFile(db, F24);

  console.log('Prima della 33_');
  check(/locale non valido/.test(await errore(registra(db, 'es0', 'es')) || ''), 'es rifiutato con «locale non valido»');
  check(/locale non valido/.test(await errore(registra(db, 'fr0', 'fr')) || ''), 'fr rifiutato');
  check(await errore(registra(db, 'it0', 'it')) === null, 'it accettato');

  console.log('Con la 33_');
  await applicaFile(db, F33);
  check(await errore(registra(db, 'es1', 'es')) === null, 'es accettato');
  check(await errore(registra(db, 'fr1', 'fr')) === null, 'fr accettato');
  check(await errore(registra(db, 'en1', 'en')) === null, 'en accettato');
  const salvate = await lingue(db);
  check(salvate.find((r) => r.endpoint.endsWith('es1'))?.locale === 'es', 'es salvato in locale');
  check(salvate.find((r) => r.endpoint.endsWith('fr1'))?.locale === 'fr', 'fr salvato in locale');
  check(/locale non valido/.test(await errore(registra(db, 'de1', 'de')) || ''), 'de ancora rifiutato');
  check(/locale non valido/.test(await errore(registra(db, 'nul', null)) || ''), 'locale null ancora rifiutato');
  check(/endpoint non riconosciuto/.test(await errore(db.query(
    `SELECT public.register_push_subscription('sess-prova', 'https://cattivo.example/x', 'k', 'a', 'es')`)) || ''),
    'i controlli della 24_ restano (host sconosciuto rifiutato)');
  check(await errore(applicaFile(db, F33)) === null, 'rilancio della 33_ senza errori');
  check(await errore(registra(db, 'es2', 'es')) === null, 'dopo il rilancio es è ancora accettato');

  console.log('Con il ritorno');
  check(await errore(applicaFile(db, F33R)) === null, 'la 33_ritorno gira');
  check(/locale non valido/.test(await errore(registra(db, 'es3', 'es')) || ''), 'es di nuovo rifiutato');
  check(/locale non valido/.test(await errore(registra(db, 'fr3', 'fr')) || ''), 'fr di nuovo rifiutato');
  check(await errore(registra(db, 'it3', 'it')) === null, 'it ancora accettato');
  const dopo = await lingue(db);
  check(dopo.every((r) => ['it', 'en'].includes(r.locale)), 'nessuna riga resta es/fr', dopo);
  check(dopo.find((r) => r.endpoint.endsWith('es1'))?.locale === 'en', 'la riga es è diventata en');
  check(dopo.find((r) => r.endpoint.endsWith('fr1'))?.locale === 'en', 'la riga fr è diventata en');
  check(dopo.find((r) => r.endpoint.endsWith('it0'))?.locale === 'it', 'la riga it è rimasta it');
  check(await errore(applicaFile(db, F33R)) === null, 'ritorno rilanciato senza errori');

  console.log(`\n${passed} passati, ${failed} falliti`);
})().catch((e) => { console.error(e); process.exit(1); });
