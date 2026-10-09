/**
 * Chiavi nascoste (36a, poi 36b) — lato SQL, su Postgres locale.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-chiavi-nascoste-sql.js
 *
 * Niente Supabase: PGlite con lo schema del catalogo (scripts/pg-locale.js) e le migration vere.
 * Ogni sezione gira su un database nuovo.
 */
const { creaDbTelepatia, applicaFile, F36A, F36B } = require('./scripts/pg-locale');
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
  // Ruling: id_pubblico è eseguibile dall'app (serve alla vista rituali_pubblici) e non dà nulla
  // di nuovo: lo stesso valore di mio_id_pubblico, NULL per un pub_….
  const m = await comeAnon(db, () => chiama(db, 'mio_id_pubblico', { p_session_id: 'sidB-123' }));
  const mAnon = await comeAnon(db, () => pub(db, 'sidB-123'));
  check(mAnon === m && m === await pub(db, 'sidB-123'), 'anon esegue id_pubblico: stesso valore di mio_id_pubblico', { mAnon, m });
  check(await comeAnon(db, () => pub(db, mAnon)) === null, 'anon: id_pubblico di un pub_… è NULL');
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

sezione('V1. vista rituali_pubblici', async (db) => {
  const rid = (await uno(db, `INSERT INTO rituals (creator, creator_id, name, type, sacred_number, date, time, duration, participants, candles)
    VALUES ('Ada', 'sidA', 'r', 'meditation', 7, to_char(now() + interval '1 day', 'YYYY-MM-DD'), '10:00:00', 3,
            '["sidA","sidB"]'::jsonb, '["sidB","sidA"]'::jsonb) RETURNING id`)).id;
  await db.query(`UPDATE rituals SET candles_nomi = '{"sidA":"Ada","sidB":"Bea"}'::jsonb WHERE id = $1`, [rid]);
  const pA = await pub(db, 'sidA'), pB = await pub(db, 'sidB');
  const [r] = await comeAnon(db, () => righe(db, `SELECT * FROM rituali_pubblici WHERE id = $1`, [rid]));
  check(r.creator_id === pA, 'creator_id pubblico', r.creator_id);
  check(JSON.stringify(r.participants) === JSON.stringify([pA, pB]), 'participants pubblici, stesso ordine', r.participants);
  check(JSON.stringify(r.candles) === JSON.stringify([pB, pA]), 'candles pubbliche, ordine di accensione', r.candles);
  check(r.candles_nomi && r.candles_nomi[pA] === 'Ada' && r.candles_nomi[pB] === 'Bea' && Object.keys(r.candles_nomi).length === 2,
    'candles_nomi con chiavi pubbliche', r.candles_nomi);
  check(nessunSid(r, ['sidA', 'sidB']), 'nessun session_id nella riga', r);
  const colP = (await righe(db, `SELECT column_name FROM information_schema.columns WHERE table_name = 'rituali_pubblici' ORDER BY ordinal_position`)).map((x) => x.column_name);
  const colC = (await righe(db, `SELECT column_name FROM information_schema.columns WHERE table_name = 'rituali_correnti' ORDER BY ordinal_position`)).map((x) => x.column_name);
  check(colC.length > 0 && JSON.stringify(colP) === JSON.stringify(colC), 'stesse colonne di rituali_correnti, stesso ordine', { colP, colC });
  const w = await comeAnon(db, () => errore(db.query(`UPDATE rituali_pubblici SET name = 'x'`)));
  check(w !== null, 'anon non scrive dalla vista', w);
  const priv = await righe(db, `SELECT grantee, privilege_type FROM information_schema.role_table_grants
                                 WHERE table_name = 'rituali_pubblici' AND grantee IN ('anon', 'authenticated', 'PUBLIC') ORDER BY 1, 2`);
  check(JSON.stringify(priv) === JSON.stringify([{ grantee: 'anon', privilege_type: 'SELECT' }, { grantee: 'authenticated', privilege_type: 'SELECT' }]),
    'anon e authenticated: solo SELECT', priv);
  // Ritual vuoto: liste vuote, non NULL.
  const rid2 = (await uno(db, `INSERT INTO rituals (creator, creator_id, name, type, sacred_number, date, time, duration)
    VALUES ('Bea', 'sidB', 'r2', 'meditation', 7, to_char(now() + interval '1 day', 'YYYY-MM-DD'), '11:00:00', 3) RETURNING id`)).id;
  const [r2] = await comeAnon(db, () => righe(db, `SELECT participants, candles, candles_nomi FROM rituali_pubblici WHERE id = $1`, [rid2]));
  check(JSON.stringify(r2) === '{"participants":[],"candles":[],"candles_nomi":{}}', 'rituale senza partecipanti: liste vuote', r2);
});

// ── Inviti e partite ──
const presente = (db, sid, nick) => comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G(sid, nick), p_lat: 0, p_lng: 0 }));
const coppia = async (db) => { await presente(db, 'sidA', 'Ada'); await presente(db, 'sidB', 'Bea'); return { pA: await pub(db, 'sidA'), pB: await pub(db, 'sidB') }; };
const invita = (db, sid, nick, online) => comeAnon(db, () => chiama(db, 'send_telepathy_invite', { ...G(sid, nick), p_session_online: online }));
const mieiInviti = (db, sid) => comeAnon(db, () => chiama(db, 'get_my_telepathy_invites', { p_session_id: sid, p_password_hash: null }));
const unInvito = (db, id, sid) => comeAnon(db, () => chiama(db, 'get_telepathy_invite', { p_invite_id: id, p_session_id: sid, p_password_hash: null }));
const accetta = (db, id, sid, match) => comeAnon(db, () => chiama(db, 'respond_telepathy_invite',
  { p_invite_id: id, p_session_id: sid, p_password_hash: null, p_accept: true, p_match_id: match }));
const partita = async (db, u1, u2) => (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id, da_invito) VALUES ($1, $2, true) RETURNING id`, [u1, u2])).id;
const risolvi = (db, online) => uno(db, `SELECT o_sid, o_nome FROM telepatia_risolvi(NULL::uuid, $1)`, [online]);
const inTraining = (db, sid) => uno(db, `SELECT telepatia_in_training($1) AS t`, [sid]).then((r) => r.t);
// Su un DB nuovo: A invita B (come dice `destinatario`), poi B accetta la partita (u1, u2).
const accettazione = async (destinatario, u1, u2) => {
  const db = await creaDbTelepatia({ con35a: true, con36a: true });
  const ids = await coppia(db);
  const nomi = { pA: ids.pA, pB: ids.pB, sidA: 'sidA', sidB: 'sidB', pC: await pub(db, 'sidC') };
  const inv = await invita(db, 'sidA', 'Ada', nomi[destinatario]);
  const x = inv.ok ? await accetta(db, inv.id, 'sidB', await partita(db, nomi[u1], nomi[u2])) : null;
  return { inv, x };
};

sezione('T1. inviti e partite', async (db) => {
  const { pA, pB } = await coppia(db);
  const nessuno = await invita(db, 'sidA', 'Ada', 'pub_' + '0'.repeat(32));
  check(nessuno.ok === false && nessuno.motivo === 'non_disponibile', 'invito a un id pubblico che non c\'è: non_disponibile', nessuno);
  const inv = await invita(db, 'sidA', 'Ada', pB);
  check(inv.ok === true, 'A invita B con l\'id pubblico di B', inv);
  check((await uno(db, `SELECT to_id FROM telepathy_invites WHERE id = $1`, [inv.id])).to_id === 'sidB', 'l\'invito resta intestato al session_id di B (interno)');
  const miei = await mieiInviti(db, 'sidB');
  check(miei.in_arrivo && miei.in_arrivo.from_id === pA, 'get_my_telepathy_invites: from_id pubblico', miei.in_arrivo);
  check(nessunSid(miei, ['sidA', 'sidB']), 'get_my_telepathy_invites: nessun session_id', miei);
  const uno1 = await unInvito(db, inv.id, 'sidB');
  check(uno1.ok === true && uno1.invito.from_id === pA && nessunSid(uno1, ['sidA', 'sidB']), 'get_telepathy_invite (destinatario): from_id pubblico', uno1);
  const uno2 = await unInvito(db, inv.id, 'sidA');
  check(uno2.ok === true && uno2.invito.from_id === null, 'get_telepathy_invite (mittente): nessun from_id', uno2);
  const xa = await accetta(db, inv.id, 'sidB', await partita(db, pA, pB));
  check(xa.ok === true && xa.status === 'accepted', '(a) partita pubblico/pubblico (app nuove): accettata', xa);
  check(await inTraining(db, 'sidA') === true && await inTraining(db, 'sidB') === true, 'dopo l\'accettazione A e B sono in training (partita con id pubblici)');

  const b = await accettazione('pB', 'pA', 'sidB');
  check(b.inv.ok === true && b.x.ok === true, '(b) partita pubblico/grezzo (B con l\'app vecchia): accettata', b);
  const c = await accettazione('sidB', 'sidA', 'sidB');
  check(c.inv.ok === true, 'invito col session_id grezzo (app vecchia, fino alla 36b): ok', c.inv);
  check(c.x && c.x.ok === true, '(c) partita grezzo/grezzo (app vecchie): accettata', c.x);
  const t = await accettazione('pB', 'pC', 'pB');
  check(t.inv.ok === true && t.x.ok === false && t.x.motivo === 'match_non_valido', 'partita con l\'id pubblico di un terzo: match_non_valido', t);

  const d = await creaDbTelepatia({ con35a: true, con36a: true });
  const m = await partita(d, await pub(d, 'sidA'), 'altro');
  check(await inTraining(d, 'sidA') === false, 'partita pubblica mai giocata, senza invito: non è un training');
  await d.query(`UPDATE telepathy_matches SET giocato = true WHERE id = $1`, [m]);
  check(await inTraining(d, 'sidA') === true, 'partita pubblica viva e giocata: sidA in training');
  check(await inTraining(d, 'sidB') === false, 'gli altri no');
});

sezione('T2. un ospite che si chiama pub_<id di B>', async (db) => {
  const { pB } = await coppia(db);
  const l = await presente(db, pB, 'Eco');
  check(!l.some((u) => u.nickname === 'Eco'), 'aggiorna_presenza col session_id pub_… non scrive', l);
  check((await righe(db, `SELECT 1 FROM online_users WHERE id = $1`, [pB])).length === 0, 'nessuna riga pub_… in online_users');
  let r = await risolvi(db, pB);
  check(r.o_sid === 'sidB', 'telepatia_risolvi(pub(B)) risolve ancora sidB', r);
  // Fino alla 36b online_users è scrivibile direttamente (app vecchia): l'impostore ci prova da lì.
  await comeAnon(db, () => db.query(`INSERT INTO online_users (id, nickname, last_seen) VALUES ($1, 'Eco', now())`, [pB]));
  r = await risolvi(db, pB);
  check(r.o_sid === 'sidB', 'anche con una riga pub_… scritta a mano, risolve sidB', r);
  await db.query(`UPDATE online_users SET last_seen = now() - interval '31 seconds' WHERE id = 'sidB'`);
  r = await risolvi(db, pB);
  check(r.o_sid === null, 'B non più online: nessuno, e non l\'impostore', r);
  const x = await invita(db, 'sidA', 'Ada', pB);
  check(x.ok === false && x.motivo === 'non_disponibile', 'l\'invito a pub(B) non arriva all\'impostore', x);
  check(await inTraining(db, 'sidB') === false, 'sanità: B non in training');
});

// Fix round 1: l'impostore riceve un invito intestato al suo session_id «pub(B)» (da una
// disponibilità o da una scrittura diretta dell'app vecchia) e prova a farsi valere come B.
sezione('T3. l\'impostore pub(B) non valida partite di B', async (db) => {
  const { pA, pB } = await coppia(db);
  const inv = (await uno(db, `INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, expires_at)
    VALUES ('sidA', 'Ada', $1, 'Eco', 'pending', now() + interval '45 seconds') RETURNING id`, [pB])).id;
  const m = await partita(db, pA, pB);
  const x = await accetta(db, inv, pB, m);
  check(x.ok === false && x.motivo === 'match_non_valido', 'l\'impostore non accetta con la partita pub(A)/pub(B)', x);
  check(await inTraining(db, 'sidB') === false, 'telepatia_in_training(sidB) resta false (nessun invito accettato a nome di B)');
  await db.query(`UPDATE telepathy_matches SET giocato = true WHERE id = $1`, [m]);
  check(await inTraining(db, pB) === false, 'telepatia_in_training col sid pub(B) non vede la partita di B');
  await db.query(`DELETE FROM telepathy_matches`);
  await db.query(`UPDATE telepathy_invites SET status = 'cancelled', responded_at = now() WHERE id = $1`, [inv]);
  // Ruoli scambiati: B come user1, A come user2.
  const inv2 = await invita(db, 'sidA', 'Ada', pB);
  check(inv2.ok === true, 'invito vero di A a B', inv2);
  const y = await accetta(db, inv2.id, 'sidB', await partita(db, pB, pA));
  check(y.ok === false && y.motivo === 'match_non_valido', 'partita coi lati scambiati: match_non_valido', y);
});

const RITORNO = 'supabase/sql/36a_ritorno.sql';
// I blocchi del catalogo live (testo di pg_get_functiondef), per nome di funzione.
const catalogo = () => {
  const t = require('fs').readFileSync(require('path').join(__dirname, 'docs/superpowers/plans/catalogo-chiavi-36.txt'), 'utf8').replace(/\r/g, '');
  const m = {};
  for (const b of t.split(/^-- ===== /m).slice(1)) m[b.slice(0, b.indexOf('('))] = b.slice(b.indexOf('\n') + 1).trim();
  return m;
};
const CINQUE = ['telepatia_risolvi', 'telepatia_in_training', 'respond_telepathy_invite', 'get_my_telepathy_invites', 'get_telepathy_invite'];
const definizione = (db, fn) => uno(db, `SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p WHERE p.proname = $1 AND p.pronamespace = 'public'::regnamespace`, [fn])
  .then((r) => r.d.replace(/\r/g, '').trim());

sezione('R1. 36a_ritorno', async (db) => {
  check(!(await errore(applicaFile(db, F36A))), 'la 36a si applica due volte di fila senza errori');
  await coppia(db);
  const inv = await invita(db, 'sidA', 'Ada', 'sidB');
  check(inv.ok === true, 'invito prima del ritorno', inv);
  const e1 = await errore(applicaFile(db, RITORNO));
  check(!e1, 'il ritorno si applica', e1);
  const via = await uno(db, `SELECT to_regclass('public.rituali_pubblici') AS v, to_regprocedure('public.id_pubblico(text)') AS f,
    (SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN
      ('mio_id_pubblico', 'aggiorna_presenza', 'esci_presenza', 'presenza_di', 'coda_entra', 'coda_esci', 'coda_leggi',
       'chiavi_chi_sono', 'chiavi_sid_valido', 'id_pubblico')) AS n,
    (SELECT count(*)::int FROM app_secrets WHERE nome = 'id_pubblico_salt') AS sale`);
  check(via.v === null && via.f === null && via.n === 0 && via.sale === 0, 'vista, funzioni nuove e sale tolti', via);
  const miei = await mieiInviti(db, 'sidB');
  check(miei.in_arrivo && miei.in_arrivo.from_id === 'sidA', 'get_my_telepathy_invites dà di nuovo il from_id grezzo', miei.in_arrivo);
  const cat = catalogo();
  const diversi = [];
  for (const fn of CINQUE) if ((await definizione(db, fn)) !== cat[fn]) diversi.push(fn);
  for (const fn of ['toggle_ritual_candle', 'get_my_messages']) if ((await definizione(db, fn)) !== cat[fn]) diversi.push(fn);
  check(diversi.length === 0, 'le sette funzioni sono identiche al catalogo live', diversi);
  const pa = await righe(db, `SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('toggle_ritual_candle', 'get_my_messages')`);
  check(pa.length === 2 && pa.every((p) => p.anon), 'toggle_ritual_candle e get_my_messages restano eseguibili da anon', pa);
  const priv = await righe(db, `SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1) ORDER BY 1`, [CINQUE]);
  const atteso = { telepatia_risolvi: false, telepatia_in_training: false, respond_telepathy_invite: true, get_my_telepathy_invites: true, get_telepathy_invite: true };
  check(priv.length === 5 && priv.every((p) => p.anon === atteso[p.proname] && p.auth === atteso[p.proname]), 'privilegi come prima della 36a', priv);
  const e2 = await errore(applicaFile(db, RITORNO));
  check(!e2, 'il ritorno si applica una seconda volta', e2);
  const e3 = await errore(applicaFile(db, F36A));
  check(!e3, 'dopo il ritorno la 36a si riapplica', e3);
  const dopo = await mieiInviti(db, 'sidB');
  check(dopo.in_arrivo && dopo.in_arrivo.from_id === await pub(db, 'sidA'), 'e il from_id torna pubblico', dopo.in_arrivo);
});

// ── Candela e messaggi: le risposte non portano session_id (sezioni F e G della 36a) ──
const MINUTO = 60000;
const ritualeVivo = async (db, sid) => (await uno(db, `SELECT * FROM create_ritual('Ada', $1, 'Candela', '', 'consciousness', 11, $2, $3, 30, NULL)`,
  [sid, new Date(Date.now() - 5 * MINUTO).toISOString().slice(0, 10), new Date(Date.now() - 5 * MINUTO).toISOString().slice(11, 16)])).id;
const candela = (db, id, sid, nome) => comeAnon(db, () => righe(db, `SELECT * FROM toggle_ritual_candle($1, $2, $3, NULL)`, [id, sid, nome]));
const provaCandela = async (db) => {
  const id = await ritualeVivo(db, 'sidA');
  await comeAnon(db, () => chiama(db, 'join_ritual', { p_ritual_id: id, p_session_id: 'sidB' })).catch(() => null);
  await comeAnon(db, () => db.query(`SELECT segna_presenza_rituale($1, 'sidB')`, [id]));
  const r = await candela(db, id, 'sidB', 'Bea');
  check(r.length === 1 && r[0].id === id && r[0].name === 'Candela', 'toggle_ritual_candle: una riga, quella del rituale', r);
  check(nessunSid(r, ['sidA', 'sidB']), 'toggle_ritual_candle: nessun session_id nella risposta', r);
  check(r[0].creator_id === '' && JSON.stringify(r[0].participants) === '[]' && JSON.stringify(r[0].candles) === '[]'
    && JSON.stringify(r[0].candles_nomi) === '{}', 'creator_id, participants, candles e candles_nomi vuoti', r[0]);
  const vera = await uno(db, `SELECT candles, candles_nomi FROM rituals WHERE id = $1`, [id]);
  check(JSON.stringify(vera.candles) === '["sidB"]' && vera.candles_nomi.sidB === 'Bea', 'la candela è accesa davvero nella tabella', vera);
  const spenta = await candela(db, id, 'sidB', 'Bea');
  check(spenta.length === 1 && nessunSid(spenta, ['sidA', 'sidB']), 'spegnere: una riga, nessun session_id', spenta);
  const e1 = await comeAnon(db, () => errore(candela(db, id, 'sidC', 'Cia')));
  check(/not_present/.test(e1 || ''), 'senza presenza: not_present come prima', e1);
  const futuro = (await uno(db, `SELECT * FROM create_ritual('Ada', 'sidA', 'Dopo', '', 'consciousness', 11, $1, '10:00', 30, NULL)`,
    [new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)])).id;
  const e2 = await comeAnon(db, () => errore(candela(db, futuro, 'sidB', 'Bea')));
  check(/not_live/.test(e2 || ''), 'fuori orario: not_live come prima', e2);
  const e3 = await comeAnon(db, () => errore(candela(db, id, '', 'Bea')));
  check(/session_required/.test(e3 || ''), 'senza session_id: session_required come prima', e3);
};
const provaMessaggi = async (db) => {
  await iscritto(db, 'sidR', 'Rosa', 'h1');
  await iscritto(db, 'sidS', 'Sole', 'h2');
  await comeAnon(db, () => chiama(db, 'send_private_message',
    { p_sender_id: 'sidR', p_sender_name: 'Rosa', p_receiver_name: 'Sole', p_content: 'ciao', p_sender_password_hash: 'h1' }));
  const m = await comeAnon(db, () => righe(db, `SELECT * FROM get_my_messages('Sole', 'h2')`));
  check(m.length === 1 && m[0].content === 'ciao' && m[0].sender_name === 'Rosa' && m[0].receiver_name === 'Sole' && m[0].is_read === false,
    'get_my_messages: il messaggio arriva, colonne come prima', m);
  check(m[0].sender_id === await pub(db, 'sidR'), 'sender_id è l\'id pubblico del mittente', m[0].sender_id);
  check(nessunSid(m, ['sidR', 'sidS']), 'get_my_messages: nessun session_id', m);
  const col = Object.keys(m[0]).join(',');
  check(col === 'id,sender_id,sender_name,receiver_name,content,is_read,created_at', 'colonne nell\'ordine della tabella', col);
  const e = await comeAnon(db, () => errore(righe(db, `SELECT * FROM get_my_messages('Sole', 'sbagliata')`)));
  check(/Auth failed/.test(e || ''), 'password sbagliata: Auth failed come prima', e);
};
sezione('K1. candela (36a)', provaCandela);
sezione('K2. candela (dopo la 36b)', provaCandela, { con35a: true, con36a: true, con36b: true });
sezione('M1. messaggi (36a)', provaMessaggi);
sezione('M2. messaggi (dopo la 36b)', provaMessaggi, { con35a: true, con36a: true, con36b: true });

// ── 36b: chiusura ──
const comeRuolo = async (db, ruolo, fn) => { await db.query(`SET ROLE ${ruolo}`); try { return await fn(); } finally { await db.query('RESET ROLE'); } };
const CHIUSE = ['online_users', 'telepathy_queue', 'rituals', 'rituali_correnti'];
const QUATTRO = ['telepatia_risolvi', 'telepatia_in_training', 'respond_telepathy_invite', 'aggiorna_presenza'];
const politiche = (db) => righe(db, `SELECT tablename AS t, policyname AS p, cmd, roles::text AS r, qual, with_check AS w FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('online_users', 'telepathy_queue', 'rituals') ORDER BY 1, 2`);
const privilegi = (db) => righe(db, `SELECT table_name AS t, grantee AS g, string_agg(privilege_type, ',' ORDER BY privilege_type) AS p
  FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = ANY($1)
   AND grantee IN ('anon', 'authenticated', 'PUBLIC') GROUP BY 1, 2 ORDER BY 1, 2`, [CHIUSE]);
const privFunzioni = (db) => righe(db, `SELECT p.proname AS f, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1) ORDER BY 1`, [QUATTRO]);
const invoker = (db) => uno(db, `SELECT coalesce(array_to_string(reloptions, ','), '') AS o FROM pg_class WHERE relname = 'rituali_correnti'`).then((r) => r.o);
const rituale = (db, sid, nick) => uno(db, `INSERT INTO rituals (creator, creator_id, name, type, sacred_number, date, time, duration, participants)
  VALUES ($2, $1, 'r', 'meditation', 7, to_char(now() + interval '1 day', 'YYYY-MM-DD'), '10:00:00', 3, jsonb_build_array($1::text)) RETURNING id`, [sid, nick]).then((r) => r.id);

sezione('B1. chiusura', async (db) => {
  for (const ruolo of ['anon', 'authenticated']) {
    for (const t of CHIUSE) {
      const e = await comeRuolo(db, ruolo, () => errore(righe(db, `SELECT * FROM ${t}`)));
      check(/permission denied/.test(e || ''), `${ruolo} non legge ${t}`, e);
      const w = await comeRuolo(db, ruolo, () => errore(db.query(`DELETE FROM ${t}`)));
      check(w !== null, `${ruolo} non cancella da ${t}`, w);
    }
    for (const t of ['online_users', 'telepathy_queue']) {
      const i = await comeRuolo(db, ruolo, () => errore(db.query(`INSERT INTO ${t} (id, nickname) VALUES ('sidZ', 'Zed')`)));
      check(/permission denied/.test(i || ''), `${ruolo} non scrive in ${t}`, i);
    }
  }
  check((await politiche(db)).length === 0, 'nessuna policy resta sulle tre tabelle', await politiche(db));
  check((await privilegi(db)).length === 0, 'nessun privilegio ad anon/authenticated/PUBLIC su tabelle e rituali_correnti', await privilegi(db));
  const rls = await righe(db, `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('online_users', 'telepathy_queue', 'rituals') ORDER BY 1`);
  check(rls.length === 3 && rls.every((r) => r.relrowsecurity), 'RLS resta accesa', rls);
  // La vista pubblica gira coi diritti del proprietario: con un rituale vero, anon la legge ancora
  // (comprese le funzioni delle occorrenze, che anon esegue dentro la vista).
  const rid = await rituale(db, 'sidA', 'Ada');
  const vista = await comeAnon(db, () => righe(db, `SELECT * FROM rituali_pubblici`));
  check(vista.length === 1 && vista[0].id === rid && vista[0].creator_id === await pub(db, 'sidA') && vista[0].occorrenza_numero !== undefined,
    'anon legge rituali_pubblici con un rituale vero', vista);
  check(nessunSid(vista, ['sidA']), 'nessun session_id nella vista', vista);
  const vAuth = await comeRuolo(db, 'authenticated', () => righe(db, `SELECT id FROM rituali_pubblici`));
  check(vAuth.length === 1, 'anche authenticated legge rituali_pubblici', vAuth);
  check(await invoker(db) === 'security_invoker=false', 'rituali_correnti gira coi diritti del proprietario (la vista pubblica regge)', await invoker(db));
  const lista = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...G('sidA', 'Ada'), p_lat: 1, p_lng: 1 }));
  check(Array.isArray(lista) && lista.length === 1 && nessunSid(lista, ['sidA']), 'le RPC funzionano a tabelle chiuse (presenze)', lista);
  check(await comeAnon(db, () => chiama(db, 'presenza_di', { p_id_pubblico: lista[0].id })) !== null, 'presenza_di a tabelle chiuse');
  await comeAnon(db, () => chiama(db, 'coda_entra', G('sidA', 'Ada')));
  await comeAnon(db, () => chiama(db, 'coda_entra', G('sidB', 'Bea')));
  const coda = await comeAnon(db, () => chiama(db, 'coda_leggi', { p_session_id: 'sidB' }));
  check(coda.length === 1 && coda[0].nickname === 'Ada' && nessunSid(coda, ['sidA', 'sidB']), 'la coda funziona a tabelle chiuse', coda);
  // Le funzioni delle occorrenze restano eseguibili da anon (servono alla vista).
  const occ = await righe(db, `SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('rituale_occorrenza_corrente', 'rituale_occorrenza_numero', 'rituale_occorrenze', 'rituale_occorrenze_totali', 'rituale_presenti_ora')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')`);
  check(occ.length === 0, 'funzioni delle occorrenze ancora eseguibili da anon', occ);
  // telepathy_matches resta aperta (motore della telepatia, sotto-progetto 2).
  check(!(await comeAnon(db, () => errore(righe(db, `SELECT * FROM telepathy_matches`)))), 'telepathy_matches resta leggibile dall\'app');
  const pf = await privFunzioni(db);
  const atteso = { telepatia_risolvi: false, telepatia_in_training: false, respond_telepathy_invite: true, aggiorna_presenza: true };
  check(pf.length === 4 && pf.every((p) => p.anon === atteso[p.f] && p.auth === atteso[p.f]), 'privilegi delle quattro funzioni come nella 36a', pf);
}, { con35a: true, con36a: true, con36b: true });

sezione('B2. conversione partite e niente più grezzo', async (db) => {
  const P = {};
  for (const s of ['sidA', 'sidB', 'sidC', 'sidD', 'sidE', 'sidF', 'sidG', 'sidH', 'sidI', 'sidJ', 'sidK', 'sidL', 'sidM']) P[s] = await pub(db, s);
  const ins = (u1, u2, extra = '') => uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id, ended_by, ended_at, ultima_attivita)
    VALUES ($1, $2, $3, $4, $5) RETURNING id`, [u1, u2, extra.ended_by || null, extra.ended_at || null, extra.attivita || new Date()]).then((r) => r.id);
  const m1 = await ins('sidA', 'sidB', { ended_by: 'sidA' });                                 // viva, grezza
  const m2 = await ins(P.sidC, P.sidD);                                                        // già pubblica
  const m3 = await ins(P.sidE, 'sidF');                                                        // mista (app vecchia da un lato)
  const m4 = await ins('sidG', 'sidH', { ended_at: new Date(), ended_by: 'sidG' });           // conclusa, grezza…
  const m5 = await ins(P.sidH, P.sidG);                                                        // …e la stessa coppia già pubblica
  const m6 = await ins('sidI', 'sidJ', { attivita: new Date(Date.now() - 60000) });           // viva grezza…
  const m7 = await ins(P.sidJ, P.sidI);                                                        // …e viva pubblica della stessa coppia
  const m8 = await ins('sidK', null);                                                          // un lato vuoto
  const m9 = await ins('sidC', 'sidE', { ended_at: new Date() });                              // conclusa grezza, senza doppione
  const m10 = await ins(P.sidL, P.sidM, { ended_at: new Date() });                            // conclusa già pubblica…
  const m11 = await ins('sidM', 'sidL');                                                       // …e viva grezza della stessa coppia
  const att = async (id) => uno(db, `SELECT ultima_attivita::text AS u, giocato FROM telepathy_matches WHERE id = $1`, [id]);
  const att1 = await att(m1);
  const e1 = await errore(applicaFile(db, F36B));
  check(!e1, 'la 36b si applica su partite grezze, miste e doppie', e1);
  check(JSON.stringify(await att(m1)) === JSON.stringify(att1), 'la conversione non è un\'attività: ultima_attivita e giocato invariati', { prima: att1, dopo: await att(m1) });
  const per = async (id) => uno(db, `SELECT user1_id, user2_id, ended_by FROM telepathy_matches WHERE id = $1`, [id]);
  const r1 = await per(m1);
  check(r1 && r1.user1_id === P.sidA && r1.user2_id === P.sidB && r1.ended_by === P.sidA, 'partita grezza convertita (anche ended_by)', r1);
  const r2 = await per(m2);
  check(r2 && r2.user1_id === P.sidC && r2.user2_id === P.sidD && r2.ended_by === null, 'partita già pubblica: invariata', r2);
  const r3 = await per(m3);
  check(r3 && r3.user1_id === P.sidE && r3.user2_id === P.sidF, 'partita mista convertita', r3);
  check(!(await per(m4)) && !!(await per(m5)), 'conclusa grezza con doppione pubblico: tolta, la pubblica resta (nessun urto sull\'indice)');
  check(!(await per(m6)) && !!(await per(m7)), 'due vive della stessa coppia: resta la pubblica');
  const r8 = await per(m8);
  check(r8 && r8.user1_id === P.sidK && r8.user2_id === null, 'lato vuoto: resta vuoto, l\'altro convertito', r8);
  check(!(await per(m9)), 'le concluse non convertite si tolgono');
  const r11 = await per(m11);
  check(!(await per(m10)) && r11 && r11.user1_id === P.sidM && r11.user2_id === P.sidL, 'conclusa pubblica e viva grezza della stessa coppia: resta la viva, convertita', r11);
  const grezze = await righe(db, `SELECT id FROM telepathy_matches WHERE user1_id NOT LIKE 'pub\\_%' OR user2_id NOT LIKE 'pub\\_%' OR ended_by NOT LIKE 'pub\\_%'`);
  check(grezze.length === 0, 'nessun session_id resta in telepathy_matches', grezze);
  const prima = JSON.stringify(await righe(db, `SELECT id, user1_id, user2_id, ended_by FROM telepathy_matches ORDER BY id`));
  const e2 = await errore(applicaFile(db, F36B));
  check(!e2, 'la 36b si applica una seconda volta', e2);
  const dopo = JSON.stringify(await righe(db, `SELECT id, user1_id, user2_id, ended_by FROM telepathy_matches ORDER BY id`));
  check(prima === dopo && !dopo.includes('pub_pub_'), 'seconda volta: nulla cambia, nessun doppio prefisso');

  // Niente più grezzo: risolvi, in_training, busy, respond.
  await db.query(`DELETE FROM telepathy_matches`);
  const { pA, pB } = await coppia(db);
  let r = await risolvi(db, 'sidB');
  check(r.o_sid === null, 'telepatia_risolvi col session_id grezzo: nessuno', r);
  r = await risolvi(db, pB);
  check(r.o_sid === 'sidB', 'telepatia_risolvi con l\'id pubblico: sidB', r);
  const g = await invita(db, 'sidA', 'Ada', 'sidB');
  check(g.ok === false && g.motivo === 'non_disponibile', 'invito col session_id grezzo: non_disponibile', g);
  const crudo = await partita(db, 'sidA', 'sidB');
  await db.query(`UPDATE telepathy_matches SET giocato = true WHERE id = $1`, [crudo]);
  check(await inTraining(db, 'sidA') === false, 'telepatia_in_training non vede partite col session_id grezzo');
  const l = await presente(db, 'sidA', 'Ada');
  check(l.find((u) => u.nickname === 'Ada').busy === false, 'busy non conta partite col session_id grezzo', l);
  const inv = await invita(db, 'sidA', 'Ada', pB);
  check(inv.ok === true, 'invito con l\'id pubblico', inv);
  await db.query(`UPDATE telepathy_matches SET giocato = false WHERE id = $1`, [crudo]);
  const x = await accetta(db, inv.id, 'sidB', crudo);
  check(x.ok === false && x.motivo === 'match_non_valido', 'respond con partita a lati grezzi: match_non_valido', x);
  await db.query(`DELETE FROM telepathy_matches`);
  const y = await accetta(db, inv.id, 'sidB', await partita(db, pA, pB));
  check(y.ok === true && y.status === 'accepted', 'respond con partita pubblica: accettata', y);
  check(await inTraining(db, 'sidA') === true, 'dopo l\'accettazione sidA è in training (partita pubblica)');
  const l2 = await presente(db, 'sidA', 'Ada');
  check(l2.find((u) => u.nickname === 'Ada').busy === true, 'busy con la partita pubblica', l2);
}, { con35a: true, con36a: true });

const RITORNO_B = 'supabase/sql/36b_ritorno.sql';
sezione('R2. 36b_ritorno', async (db) => {
  // Riferimento: un DB con la sola 36a (stato da ripristinare).
  const rif = await creaDbTelepatia({ con35a: true, con36a: true });
  // Le policy di produzione (catalogo 09/10) che il DB locale non ha: si aggiungono al riferimento.
  await rif.exec(`CREATE POLICY "Enable all for users" ON online_users FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Enable all for telepathy" ON telepathy_queue FOR ALL TO public USING (true) WITH CHECK (true);`);
  const defRif = {};
  for (const fn of QUATTRO) defRif[fn] = await definizione(rif, fn);
  const invRif = await invoker(rif);
  const polRif = await politiche(rif), privRif = await privilegi(rif), pfRif = await privFunzioni(rif);

  await presente(db, 'sidA', 'Ada');
  const m = await partita(db, await pub(db, 'sidA'), await pub(db, 'sidB'));
  const e1 = await errore(applicaFile(db, RITORNO_B));
  check(!e1, 'il ritorno si applica', e1);
  const diversi = [];
  for (const fn of QUATTRO) if ((await definizione(db, fn)) !== defRif[fn]) diversi.push(fn);
  check(diversi.length === 0, 'le quattro funzioni tornano identiche alla 36a', diversi);
  check(JSON.stringify(await politiche(db)) === JSON.stringify(polRif), 'policy come prima della 36b', { ora: await politiche(db), prima: polRif });
  // Presenze e coda: come il DB locale prima della 36b. rituals e rituali_correnti: come il DB vero
  // (catalogo 09/10, default di Supabase: tutti i privilegi), che lo schema locale non riproduce.
  const tutti = 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE';
  const privOra = await privilegi(db);
  const soloCoda = (l) => JSON.stringify(l.filter((p) => p.t === 'online_users' || p.t === 'telepathy_queue'));
  check(soloCoda(privOra) === soloCoda(privRif) && privRif.filter((p) => p.t === 'online_users' || p.t === 'telepathy_queue').length === 4, 'privilegi su presenze e coda come prima della 36b', { ora: privOra, prima: privRif });
  const privRit = JSON.stringify(privOra.filter((p) => p.t === 'rituals' || p.t === 'rituali_correnti'));
  const attesoRit = JSON.stringify(['rituali_correnti', 'rituals'].flatMap((t) => ['anon', 'authenticated'].map((g) => ({ t, g, p: tutti }))));
  check(privRit === attesoRit, 'rituals e rituali_correnti: tutti i privilegi ad anon/authenticated, come sul DB vero', privRit);
  check(await invoker(db) === invRif, 'rituali_correnti torna security_invoker', { ora: await invoker(db), prima: invRif });
  check(JSON.stringify(await privFunzioni(db)) === JSON.stringify(pfRif), 'privilegi delle funzioni come prima', await privFunzioni(db));
  check(Array.isArray(await comeAnon(db, () => righe(db, `SELECT * FROM online_users`))), 'anon rilegge online_users');
  await rituale(db, 'sidA', 'Ada');
  check((await comeAnon(db, () => righe(db, `SELECT * FROM rituals`))).length === 1, 'anon rilegge rituals');
  check((await comeAnon(db, () => righe(db, `SELECT * FROM rituali_correnti`))).length === 1, 'anon rilegge rituali_correnti');
  check(!(await comeAnon(db, () => errore(db.query(`INSERT INTO online_users (id, nickname, last_seen) VALUES ('sidV', 'Vec', now())`)))), 'anon riscrive online_users (app vecchia)');
  check((await risolvi(db, 'sidA')).o_sid === 'sidA', 'telepatia_risolvi riaccetta il grezzo');
  const pm = await uno(db, `SELECT user1_id FROM telepathy_matches WHERE id = $1`, [m]);
  check(pm.user1_id === await pub(db, 'sidA'), 'le partite convertite restano pubbliche', pm);
  const e2 = await errore(applicaFile(db, RITORNO_B));
  check(!e2, 'il ritorno si applica una seconda volta', e2);
  check(JSON.stringify(await politiche(db)) === JSON.stringify(polRif), 'seconda volta: policy invariate (nessun doppione)');
  const e3 = await errore(applicaFile(db, F36B));
  check(!e3, 'dopo il ritorno la 36b si riapplica', e3);
  check(/permission denied/.test(await comeAnon(db, () => errore(righe(db, `SELECT * FROM online_users`))) || ''), 'e richiude');
  const e4 = await errore(applicaFile(db, RITORNO_B));
  const e5 = await errore(applicaFile(db, RITORNO));
  check(!e4 && !e5, 'catena 36b_ritorno → 36a_ritorno senza errori', { e4, e5 });
}, { con35a: true, con36a: true, con36b: true });

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
