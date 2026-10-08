/**
 * Notifiche chiuse (35a, poi 35b) — lato SQL, su Postgres locale.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-notifiche-chiuse-sql.js
 *
 * Niente Supabase: PGlite con lo schema del catalogo (scripts/pg-locale.js) e le migration vere.
 * Ogni sezione gira su un database nuovo.
 */
const { creaDbTelepatia, applicaFile, F35A } = require('./scripts/pg-locale');
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
// Una notifica; ritorna l'id. o = { sid, nick, mittSid, mittNick, read, minutiFa }
const notif = async (db, o) => (await uno(db,
  `INSERT INTO notifications (user_nickname, recipient_session_id, sender_session_id, sender_nickname, type, message, read, created_at)
   VALUES ($1, $2, $3, $4, 'comment', $5, $6, now() - make_interval(mins => $7)) RETURNING id`,
  [o.nick || 'x', o.sid || null, o.mittSid || null, o.mittNick || null, o.msg || 'm', o.read || false, o.minutiFa || 0])).id;
const leggi = (db, args) => righe(db,
  `SELECT * FROM get_my_notifications(p_session_id => $1, p_password_hash => $2, p_nickname => $3)`,
  [args.p_session_id, args.p_password_hash, args.p_nickname]);
const msgs = (rs) => rs.map((r) => r.message);

const sezioni = [];
const sezione = (nome, fn, opzioni = { con35a: true }) => sezioni.push([nome, fn, opzioni]);

sezione('L1. ospite: solo le righe del suo telefono', async (db) => {
  await notif(db, { nick: 'Luna', sid: 'sidA', msg: 'per A' });
  await notif(db, { nick: 'Luna', sid: 'sidB', msg: 'per B' });
  await notif(db, { nick: 'Luna', sid: null, msg: 'vecchia per nickname' });
  const a = await leggi(db, G('sidA', 'Luna'));
  check(JSON.stringify(msgs(a)) === '["per A"]', 'A vede solo la sua', msgs(a));
  const b = await leggi(db, G('sidB', 'Luna'));
  check(JSON.stringify(msgs(b)) === '["per B"]', 'B, stesso nickname, vede solo la sua e non quella di A', msgs(b));
  const c = await leggi(db, G('sidC', 'Luna'));
  check(c.length === 0, 'un terzo ospite con lo stesso nickname non vede nulla (nemmeno la riga vecchia per nickname)', msgs(c));
});

sezione('L2. registrato: hash giusto e sbagliato, righe vecchie per nickname', async (db) => {
  await iscritto(db, 'sidR', 'Stella', 'hashOK');
  await notif(db, { nick: 'Stella', sid: 'sidR', msg: 'nuova' });
  await notif(db, { nick: 'Stella', sid: null, msg: 'vecchia' });
  await notif(db, { nick: 'Stella', sid: 'sidAltro', msg: 'di un altro telefono' });
  await notif(db, { nick: 'Altra', sid: null, msg: 'di un\'altra' });
  const r = await leggi(db, G('sidR', 'Stella', 'hashOK'));
  check(JSON.stringify(msgs(r).sort()) === '["nuova","vecchia"]', 'vede le sue, comprese le vecchie per nickname', msgs(r));
  const r2 = await leggi(db, G('sidR', 'NomeInventato', 'hashOK'));
  check(r2.length === 2, 'il nickname passato non conta: vale quello del profilo', msgs(r2));
  const e1 = await errore(leggi(db, G('sidR', 'Stella', 'sbagliato')));
  check(/Auth failed/.test(e1 || ''), 'hash sbagliato: Auth failed', e1);
  const e2 = await errore(leggi(db, G('sidR', 'Stella', null)));
  check(/Auth failed/.test(e2 || ''), 'hash assente: Auth failed', e2);
  const e3 = await errore(leggi(db, G('', 'Stella')));
  check(/session_required/.test(e3 || ''), 'session_id vuoto: session_required', e3);
  const nome = await chiama(db, 'notifica_chi_sono', G('sidR', 'Falso', 'hashOK'));
  check(nome === 'Stella', 'notifica_chi_sono: il nome del profilo', nome);
  const nomeO = await chiama(db, 'notifica_chi_sono', G('sidOspite', 'Luna'));
  check(nomeO === 'Luna', 'notifica_chi_sono: ospite, nome pulito', nomeO);
});

sezione('L3. blocchi: esclude, non cancella', async (db) => {
  await iscritto(db, 'sidR', 'Stella', 'h');
  await notif(db, { nick: 'Stella', sid: 'sidR', mittSid: 'sidM', mittNick: 'Mario', msg: 'da Mario' });
  await notif(db, { nick: 'Stella', sid: 'sidR', mittSid: 'sidN', mittNick: 'Nora', msg: 'da Nora' });
  await notif(db, { nick: 'Stella', sid: 'sidR', msg: 'di sistema' });
  const tutte = async () => msgs(await leggi(db, G('sidR', 'Stella', 'h'))).sort();
  check(JSON.stringify(await tutte()) === '["da Mario","da Nora","di sistema"]', 'senza blocchi le vede tutte', await tutte());
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Stella', 'Mario')`);
  check(JSON.stringify(await tutte()) === '["da Nora","di sistema"]', 'Mario bloccato da me: escluso', await tutte());
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Nora', 'Stella')`);
  check(JSON.stringify(await tutte()) === '["di sistema"]', 'Nora mi ha bloccato: esclusa', await tutte());
  check((await uno(db, `SELECT count(*)::int n FROM notifications`)).n === 3, 'nessuna riga cancellata');
  await db.query(`DELETE FROM user_blocks`);
  check(JSON.stringify(await tutte()) === '["da Mario","da Nora","di sistema"]', 'dopo lo sblocco ricompaiono', await tutte());
  // Blocco per session (telepatia) fra ospiti.
  await notif(db, { nick: 'Luna', sid: 'sidG', mittSid: 'sidH', mittNick: 'Hugo', msg: 'da Hugo' });
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('sidH', 'sidG')`);
  const g = await leggi(db, G('sidG', 'Luna'));
  check(g.length === 0, 'blocco per session in senso inverso: escluso', msgs(g));
  await db.query(`DELETE FROM telepathy_invite_blocks`);
  check((await leggi(db, G('sidG', 'Luna'))).length === 1, 'sbloccato per session: ricompare');
  check(await chiama(db, 'notifica_bloccata', { sid_a: null, nick_a: null, sid_b: null, nick_b: null }) === false, 'notifica_bloccata è null-safe');
});

sezione('L4. solo non lette, ordine, limite 100', async (db) => {
  await notif(db, { sid: 's1', msg: 'letta', read: true });
  await notif(db, { sid: 's1', msg: 'vecchia', minutiFa: 30 });
  await notif(db, { sid: 's1', msg: 'nuova', minutiFa: 1 });
  await notif(db, { sid: 's1', msg: 'media', minutiFa: 10 });
  check(JSON.stringify(msgs(await leggi(db, G('s1', 'x')))) === '["nuova","media","vecchia"]', 'non lette, dalla più recente');
  await db.query(`INSERT INTO notifications (user_nickname, recipient_session_id, type, message)
                  SELECT 'x', 's2', 'comment', 'n' || g FROM generate_series(1, 130) g`);
  check((await leggi(db, G('s2', 'x'))).length === 100, 'al massimo 100');
});

sezione('L5. segna letta: solo la propria', async (db) => {
  await iscritto(db, 'sidR', 'Stella', 'h');
  const mia = await notif(db, { nick: 'Stella', sid: 'sidR' });
  const vecchia = await notif(db, { nick: 'Stella', sid: null });
  const altrui = await notif(db, { nick: 'Luna', sid: 'sidL' });
  const m = (id, sid, nick, h) => chiama(db, 'mark_my_notification_read', { p_id: id, ...G(sid, nick, h) });
  check(await m(mia, 'sidR', 'Stella', 'h') === true, 'propria: true');
  check((await uno(db, `SELECT read FROM notifications WHERE id = $1`, [mia])).read === true, 'e read diventa true');
  check(await m(vecchia, 'sidR', 'Stella', 'h') === true, 'riga vecchia per nickname del registrato: true');
  check(await m(altrui, 'sidR', 'Stella', 'h') === false, 'di un altro: false');
  check((await uno(db, `SELECT read FROM notifications WHERE id = $1`, [altrui])).read === false, 'e la riga resta intatta');
  check(await m(altrui, 'sidX', 'Luna') === false, 'ospite con lo stesso nickname ma altro telefono: false');
  const e = await errore(m(mia, 'sidR', 'Stella', 'sbagliato'));
  check(/Auth failed/.test(e || ''), 'hash sbagliato: Auth failed', e);
  check(await m(altrui, 'sidL', 'Luna') === true, 'ospite sulla sua: true');
});

sezione('P1. privilegi: helper non eseguibili da anon, pubbliche sì', async (db) => {
  const e1 = await comeAnon(db, () => errore(chiama(db, 'notifica_chi_sono', G('s', 'n'))));
  check(/permission denied/.test(e1 || ''), 'anon non esegue notifica_chi_sono', e1);
  const e2 = await comeAnon(db, () => errore(chiama(db, 'notifica_bloccata', { sid_a: 'a', nick_a: 'a', sid_b: 'b', nick_b: 'b' })));
  check(/permission denied/.test(e2 || ''), 'anon non esegue notifica_bloccata', e2);
  await notif(db, { sid: 'sidA', msg: 'm' });
  const r = await comeAnon(db, () => righe(db, `SELECT * FROM get_my_notifications('sidA', null, 'x')`));
  check(r.length === 1, 'anon esegue get_my_notifications');
  const e3 = await comeAnon(db, () => errore(righe(db, `SELECT * FROM consciousness_post_autori`)));
  check(/permission denied/.test(e3 || ''), 'anon non legge consciousness_post_autori', e3);
  const e4 = await comeAnon(db, () => errore(db.query(`INSERT INTO consciousness_post_autori (post_id, session_id) VALUES (gen_random_uuid(), 's')`)));
  check(/permission denied/.test(e4 || ''), 'anon non scrive consciousness_post_autori', e4);
  const rls = await uno(db, `SELECT relrowsecurity FROM pg_class WHERE relname = 'consciousness_post_autori'`);
  check(rls.relrowsecurity === true, 'consciousness_post_autori ha la RLS accesa');
});

sezione('S1. schema: colonne, tabella, cascata', async (db) => {
  const col = (await righe(db, `SELECT column_name FROM information_schema.columns WHERE table_name = 'notifications'
    AND column_name IN ('recipient_session_id','sender_session_id','sender_nickname')`)).length;
  check(col === 3, 'tre colonne nuove su notifications', col);
  const p = await uno(db, `INSERT INTO consciousness_posts (author_nickname) VALUES ('Luna') RETURNING id`);
  await db.query(`INSERT INTO consciousness_post_autori (post_id, session_id) VALUES ($1, 'sidL')`, [p.id]);
  await db.query(`DELETE FROM consciousness_posts WHERE id = $1`, [p.id]);
  check((await uno(db, `SELECT count(*)::int n FROM consciousness_post_autori`)).n === 0, 'cancellare il post cancella l\'autore (CASCADE)');
});

sezione('R1. idempotenza e ritorno', async () => {
  const db = await creaDbTelepatia({ con35a: false });
  await db.query(`INSERT INTO notifications (user_nickname, type, message) VALUES ('Luna', 'comment', 'prima')`);
  check(!(await errore(applicaFile(db, F35A))), '35a si applica');
  check(!(await errore(applicaFile(db, F35A))), '35a applicata due volte: nessun errore');
  check(!(await errore(applicaFile(db, 'supabase/sql/35a_ritorno.sql'))), '35a_ritorno si applica');
  check(!(await errore(applicaFile(db, 'supabase/sql/35a_ritorno.sql'))), '35a_ritorno due volte: nessun errore');
  const f = await righe(db, `SELECT proname FROM pg_proc WHERE proname IN ('notifica_chi_sono','notifica_bloccata','get_my_notifications','mark_my_notification_read')`);
  check(f.length === 0, 'funzioni tolte', f);
  const t = await righe(db, `SELECT 1 FROM pg_tables WHERE tablename = 'consciousness_post_autori'`);
  check(t.length === 0, 'tabella tolta');
  const col = await righe(db, `SELECT column_name FROM information_schema.columns WHERE table_name = 'notifications' ORDER BY ordinal_position`);
  check(JSON.stringify(col.map((c) => c.column_name)) === '["id","user_nickname","type","message","read","created_at"]', 'colonne com\'erano', col);
  const r = await uno(db, `SELECT message FROM notifications`);
  check(r.message === 'prima', 'notifications usabile, dati intatti');
  await db.query(`INSERT INTO notifications (user_nickname, type, message) VALUES ('a', 'b', 'c')`);
  check(!(await errore(applicaFile(db, F35A))), '35a si può rimettere dopo il ritorno');
}, { con35a: false });

sezione('L6. profilo storico senza email né hash', async (db) => {
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('sidV', 'Vecchia', NULL, NULL)`);
  await notif(db, { nick: 'Vecchia', sid: 'sidV', msg: 'nuova' });
  await notif(db, { nick: 'Vecchia', sid: null, msg: 'vecchia' });
  const r = await leggi(db, G('sidV', 'Vecchia', null));
  check(JSON.stringify(msgs(r).sort()) === '["nuova","vecchia"]', 'legge anche con hash null, righe vecchie per nickname comprese', msgs(r));
  const id = await notif(db, { nick: 'Vecchia', sid: 'sidV', msg: 'da segnare' });
  check(await chiama(db, 'mark_my_notification_read', { p_id: id, ...G('sidV', 'Vecchia', null) }) === true, 'segna letta con hash null');
});

// ── esecuzione ──
(async () => {
  for (const [nome, fn, opzioni] of sezioni) {
    console.log(`\n— ${nome} —`);
    try {
      const db = opzioni.con35a === false ? null : await creaDbTelepatia(opzioni);
      await fn(db);
    } catch (e) { check(false, `${nome}: eccezione`, e.message); }
  }
  console.log(`\n${passed} passati, ${failed} falliti`);
})();
