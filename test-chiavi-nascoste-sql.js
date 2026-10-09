/**
 * Chiavi nascoste (36a, poi 36b) — lato SQL, su Postgres locale.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-chiavi-nascoste-sql.js
 *
 * Niente Supabase: PGlite con lo schema del catalogo (scripts/pg-locale.js) e le migration vere.
 * Ogni sezione gira su un database nuovo.
 */
const { creaDbTelepatia } = require('./scripts/pg-locale');
let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };
const errore = async (p) => { try { await p; return null; } catch (e) { return e.message; } };
const righe = (db, sql, p = []) => db.query(sql, p).then((r) => r.rows);
const uno = async (db, sql, p = []) => (await righe(db, sql, p))[0];
// Chiamata per nome dei parametri, come fa PostgREST.
const chiama = (db, fn, args = {}) => {
  const k = Object.keys(args);
  return uno(db, `SELECT ${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) AS r`, k.map((x) => args[x])).then((r) => r.r);
};
const comeAnon = async (db, fn) => { await db.query('SET ROLE anon'); try { return await fn(); } finally { await db.query('RESET ROLE'); } };

const G = (sid, nick, hash = null) => ({ p_session_id: sid, p_password_hash: hash, p_nickname: nick });
const iscritto = (db, sid, nick, pw) => db.query(
  `INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ($1, $2, lower($2) || '@test.com', $3)`, [sid, nick, pw]);

const pub = (db, sid) => uno(db, `SELECT id_pubblico($1) AS r`, [sid]).then((r) => r.r);
const nessunSid = (valore, sids) => sids.every((s) => !JSON.stringify(valore).includes(s));

const sezioni = [];
const sezione = (nome, fn, opzioni = { con35a: true, con36a: true }) => sezioni.push([nome, fn, opzioni]);

sezione('I1. id_pubblico', async (db) => {
  const a = await pub(db, 'sidA-123'), b = await pub(db, 'sidA-123');
  check(/^pub_[0-9a-f]{32}$/.test(a), 'formato pub_ + 32 esadecimali', a);
  check(a === b, 'deterministica');
  check(a !== await pub(db, 'sidB-123'), 'sid diversi, id diversi');
  check(await pub(db, null) === null, 'NULL → NULL');
  check(await pub(db, a) === null, 'un valore pub_… dà NULL (non è un session_id)');
  await db.query(`UPDATE app_secrets SET valore = '\\x00' WHERE nome = 'id_pubblico_salt'`);
  check(await pub(db, 'sidA-123') !== a, 'cambia col segreto');
  const e = await comeAnon(db, () => errore(pub(db, 'x')));
  check(/permission denied/.test(e || ''), 'anon non esegue id_pubblico', e);
  const m = await comeAnon(db, () => chiama(db, 'mio_id_pubblico', { p_session_id: 'sidB-123' }));
  check(m === await pub(db, 'sidB-123'), 'mio_id_pubblico per anon = id_pubblico');
  const e2 = await comeAnon(db, () => errore(chiama(db, 'mio_id_pubblico', { p_session_id: a })));
  check(e2 !== null, 'mio_id_pubblico rifiuta pub_…', e2);
});

sezione('P1. presenze', async (db) => {
  await iscritto(db, 'sidR', 'Rosa', 'h1');
  const lista = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidL', 'Luna'), p_lat: 10, p_lng: 20 }));
  check(lista.length === 1 && lista[0].nickname === 'Luna' && lista[0].id === await pub(db, 'sidL'), 'scrivo la mia riga, esco con id pubblico', lista);
  const l2 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidR', 'Rosa', 'h1'), p_lat: 1, p_lng: 2 }));
  check(l2.length === 2 && nessunSid(l2, ['sidL', 'sidR']), 'due presenti, nessun session_id in uscita', l2);
  const l3 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidX', 'Rosa'), p_lat: 1, p_lng: 2 }));
  const pX = await pub(db, 'sidX');
  const rigaX = l3.find((u) => u.id === pX);
  check(rigaX && rigaX.nickname === 'Anonymous', 'ospite col nome di un registrato → Anonymous', l3);
  const l4 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidR', 'Rosa', 'sbagliata'), p_lat: 1, p_lng: 2 }));
  check(Array.isArray(l4), 'password sbagliata: nessun errore, la lista arriva', l4);
  const l5 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('pub_abc', 'Eco'), p_lat: 1, p_lng: 2 }));
  check(!l5.some((u) => u.nickname === 'Eco'), 'session_id pub_… non scrive', l5);
  const l6 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidK', 'Kai'), p_lat: 999, p_lng: -999 }));
  const kai = l6.find((u) => u.nickname === 'Kai');
  check(kai && kai.lat === null && kai.lng === null, 'coordinate fuori scala → null', kai);
  await db.query(`UPDATE online_users SET last_seen = now() - interval '3 minutes' WHERE id = 'sidL'`);
  const l7 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidK', 'Kai'), p_lat: 1, p_lng: 1 }));
  check(!l7.some((u) => u.nickname === 'Luna'), 'pulizia oltre 2 minuti', l7);
  await db.query(`INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ($1, 'altro')`, [await pub(db, 'sidK')]);
  const l8 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidK', 'Kai'), p_lat: 1, p_lng: 1 }));
  check(l8.find((u) => u.nickname === 'Kai').busy === true, 'busy da partita viva con id pubblico', l8);
  await db.query(`DELETE FROM telepathy_matches`);
  await db.query(`INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ('sidK', 'altro')`);
  const l9 = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidK', 'Kai'), p_lat: 1, p_lng: 1 }));
  check(l9.find((u) => u.nickname === 'Kai').busy === true, 'busy anche con partita col session_id grezzo (app vecchia)', l9);
  check(await comeAnon(db, () => chiama(db, 'presenza_di', { p_id_pubblico: l9[0].id })) !== null, 'presenza_di trova chi è online');
  check(await comeAnon(db, () => chiama(db, 'presenza_di', { p_id_pubblico: 'sidK' })) === null, 'presenza_di non accetta session_id');
  await comeAnon(db, () => chiama(db, 'esci_presenza', { p_session_id: 'sidK', p_password_hash: null }));
  check((await righe(db, `SELECT 1 FROM online_users WHERE id = 'sidK'`)).length === 0, 'esci_presenza toglie la mia riga');
  await comeAnon(db, () => chiama(db, 'esci_presenza', { p_session_id: 'sidR', p_password_hash: 'sbagliata' }));
  check((await righe(db, `SELECT 1 FROM online_users WHERE id = 'sidR'`)).length === 1, 'esci_presenza con password sbagliata non toglie nulla');
});

sezione('C1. coda', async (db) => {
  check(await comeAnon(db, () => chiama(db, 'coda_entra', G('sidA', 'Ada'))) === true, 'entro in coda');
  await comeAnon(db, () => chiama(db, 'coda_entra', G('sidB', 'Bea')));
  const vista = await comeAnon(db, () => chiama(db, 'coda_leggi', { p_session_id: 'sidA' }));
  check(vista.length === 1 && vista[0].nickname === 'Bea' && vista[0].id === await pub(db, 'sidB') && nessunSid(vista, ['sidA', 'sidB']), 'vedo gli altri, con id pubblico', vista);
  check(await comeAnon(db, () => chiama(db, 'coda_entra', G('pub_x', 'Eco'))) === false, 'pub_… non entra');
  await db.query(`UPDATE telepathy_queue SET timestamp = timestamp - 61000 WHERE id = 'sidB'`);
  check((await comeAnon(db, () => chiama(db, 'coda_leggi', { p_session_id: 'sidA' }))).length === 0, 'oltre 60 s si esce');
  await comeAnon(db, () => chiama(db, 'coda_esci', { p_session_id: 'sidA', p_password_hash: null }));
  check((await righe(db, `SELECT 1 FROM telepathy_queue WHERE id = 'sidA'`)).length === 0, 'coda_esci');
});

// ── esecuzione ──
(async () => {
  for (const [nome, fn, opzioni] of sezioni) {
    console.log(`\n— ${nome} —`);
    try {
      const db = await creaDbTelepatia(opzioni);
      await fn(db);
    } catch (e) { check(false, `${nome}: eccezione`, e.message); }
  }
  console.log(`\n${passed} passati, ${failed} falliti`);
})();
