/**
 * test-profili-chiave-sql.js — 37a/37b: profiles.session_id non si legge più con la chiave pubblica.
 *
 * Niente Supabase: PGlite con lo schema del catalogo (scripts/pg-locale.js) e le migration vere.
 * Esecuzione: node test-profili-chiave-sql.js
 */
const { creaDbTelepatia, applicaFile } = require('./scripts/pg-locale');

const F37A = 'supabase/sql/37a_profilo_mio.sql';
const F37A_R = 'supabase/sql/37a_ritorno.sql';
const F37B = 'supabase/sql/37b_chiudi_profili.sql';
const F37B_R = 'supabase/sql/37b_ritorno.sql';

let passati = 0, falliti = 0;
const check = (c, m, d) => { if (c) { console.log(`  ✅ ${m}`); passati++; } else { console.log(`  ❌ ${m}${d === undefined ? '' : ' — ' + JSON.stringify(d)}`); falliti++; process.exitCode = 1; } };
const comeAnon = async (db, fn) => { await db.query('SET ROLE anon'); try { return await fn(); } finally { await db.query('RESET ROLE'); } };
const prova = async (db, sql) => comeAnon(db, async () => { try { return { righe: (await db.query(sql)).rows }; } catch (e) { return { errore: e.code || e.message }; } });

(async () => {
  const db = await creaDbTelepatia({ con36a: true, con36b: true });
  // Le colonne e i privilegi di profiles come sul DB vero (27_).
  await db.exec(`
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS starseed_type text, ADD COLUMN IF NOT EXISTS avatar text,
      ADD COLUMN IF NOT EXISTS interests text[], ADD COLUMN IF NOT EXISTS experience_level text,
      ADD COLUMN IF NOT EXISTS telepathy_score integer, ADD COLUMN IF NOT EXISTS telepathy_best integer,
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(), ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS profiles_lettura_pubblica ON profiles;
    CREATE POLICY profiles_lettura_pubblica ON profiles FOR SELECT USING (true);
    REVOKE ALL ON profiles FROM PUBLIC, anon, authenticated;
    GRANT SELECT (session_id, nickname, bio, starseed_type, avatar, country, interests,
                  experience_level, telepathy_score, telepathy_best, show_telepathy_score, created_at, updated_at)
      ON profiles TO anon, authenticated;
    INSERT INTO profiles (session_id, nickname, email, password_hash, bio, country)
      VALUES ('sid-iscritta-segreto', 'Iscritta', 'iscritta@example.com', 'hash-segreto', 'ciao', 'IT');
  `);

  console.log('— Prima della 37 —');
  check(((await prova(db, `SELECT session_id FROM profiles`)).righe || []).length === 1, 'anon legge session_id (la falla di oggi)');

  console.log('— 37a —');
  await applicaFile(db, F37A);
  await applicaFile(db, F37A);   // idempotente
  const mio = await prova(db, `SELECT mio_profilo('sid-iscritta-segreto') AS p`);
  const p = mio.righe && mio.righe[0] && mio.righe[0].p;
  check(p && p.nickname === 'Iscritta' && p.bio === 'ciao' && p.country === 'IT', 'mio_profilo restituisce il proprio profilo', mio);
  const testo = JSON.stringify(p || {});
  check(!testo.includes('sid-iscritta-segreto') && !testo.includes('iscritta@example.com') && !testo.includes('hash-segreto'),
    'mio_profilo non restituisce session_id, email né hash', p);
  const nulla = await prova(db, `SELECT mio_profilo('sconosciuto') AS p`);
  check(nulla.righe && nulla.righe[0].p === null, 'mio_profilo di un session_id sconosciuto: null', nulla);
  const nullo = await prova(db, `SELECT mio_profilo(NULL) AS p`);
  check(nullo.righe && nullo.righe[0].p === null, 'mio_profilo(NULL): null', nullo);
  check(((await prova(db, `SELECT session_id FROM profiles`)).righe || []).length === 1, 'la 37a non toglie niente: l\'app vecchia legge ancora');

  console.log('— 37b —');
  await applicaFile(db, F37B);
  await applicaFile(db, F37B);   // idempotente
  const sid = await prova(db, `SELECT session_id FROM profiles`);
  check(sid.errore === '42501', 'anon non legge più session_id', sid);
  const filtro = await prova(db, `SELECT nickname FROM profiles WHERE session_id = 'sid-iscritta-segreto'`);
  check(filtro.errore === '42501', 'anon non filtra su session_id', filtro);
  const pub = await prova(db, `SELECT nickname, bio, starseed_type, avatar, country, interests, experience_level,
                                      telepathy_score, telepathy_best, show_telepathy_score FROM profiles`);
  check(pub.righe && pub.righe.length === 1, 'le colonne pubbliche (quelle dell\'app nuova) restano leggibili', pub);
  const mio2 = await prova(db, `SELECT mio_profilo('sid-iscritta-segreto') AS p`);
  check(mio2.righe && mio2.righe[0].p && mio2.righe[0].p.nickname === 'Iscritta', 'dopo la 37b mio_profilo funziona ancora', mio2);
  const auth = await (async () => { await db.query('SET ROLE authenticated'); try { await db.query('SELECT session_id FROM profiles'); return 'letto'; } catch (e) { return e.code; } finally { await db.query('RESET ROLE'); } })();
  check(auth === '42501', 'nemmeno authenticated legge session_id', auth);

  console.log('— Ritorni —');
  await applicaFile(db, F37B_R);
  check(((await prova(db, `SELECT session_id FROM profiles`)).righe || []).length === 1, '37b_ritorno: anon rilegge session_id come prima');
  await applicaFile(db, F37A_R);
  const via = await prova(db, `SELECT mio_profilo('sid-iscritta-segreto') AS p`);
  check(via.errore === '42883', '37a_ritorno: mio_profilo non c\'è più', via);
  await applicaFile(db, F37A);
  await applicaFile(db, F37B);
  check((await prova(db, `SELECT session_id FROM profiles`)).errore === '42501', 'riapplicate dopo i ritorni: di nuovo chiusa');

  console.log(`\nRisultato: ${passati} passati, ${falliti} falliti`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
