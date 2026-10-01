/**
 * Inviti telepatia anche a chi non è collegato (32a, poi 32b) — lato SQL, su Postgres locale.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-sql.js
 *
 * Niente Supabase: PGlite con lo schema del catalogo (scripts/pg-locale.js) e le migration vere.
 * Ogni sezione gira su un database nuovo. Tutte le date sono relative ad adesso.
 * pg_net è finto: net.chiamate conta le push chieste alla Edge Function.
 */
const { creaDbTelepatia, applicaFile, F32A, F32B } = require('./scripts/pg-locale');
let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };
const errore = async (p) => { try { await p; return null; } catch (e) { return e.message; } };
const righe = (db, sql, p = []) => db.query(sql, p).then((r) => r.rows);
const uno = async (db, sql, p = []) => (await righe(db, sql, p))[0];
// Chiamata per nome dei parametri, come fa PostgREST: chiama(db, 'fn', { p_a: 1, p_b: null }).
const chiama = (db, fn, args = {}) => {
  const k = Object.keys(args);
  return uno(db, `SELECT ${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) AS r`, k.map((x) => args[x])).then((r) => r.r);
};
const comeAnon = async (db, fn) => { await db.query('SET ROLE anon'); try { return await fn(); } finally { await db.query('RESET ROLE'); } };

// Persone e situazioni.
const G = (sid, nick) => ({ p_session_id: sid, p_password_hash: null, p_nickname: nick });
const online = (db, sid, nick, secondiFa = 0) => db.query(
  `INSERT INTO online_users (id, nickname, last_seen) VALUES ($1, $2, now() - make_interval(secs => $3))
   ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, last_seen = EXCLUDED.last_seen`, [sid, nick, secondiFa]);
const abbonamento = (db, sid) => db.query(
  `INSERT INTO push_subscriptions (session_id, endpoint, p256dh, auth, locale)
   VALUES ($1, 'https://fcm.googleapis.com/fcm/send/prova_' || $1, 'k', 'a', 'it') ON CONFLICT (endpoint) DO NOTHING`, [sid]);
const iscritto = (db, sid, nick, pw) => db.query(
  `INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ($1, $2, lower($2) || '@test.com', $3)`, [sid, nick, pw]);
const disp = async (db, sid, nick) => { await abbonamento(db, sid); return chiama(db, 'set_telepathy_availability', { ...G(sid, nick), p_enabled: true }); };
const idDisp = async (db, sid) => (await uno(db, `SELECT id FROM telepathy_availability WHERE session_id = $1`, [sid])).id;
const invia = (db, sid, nick, dest) => chiama(db, 'send_telepathy_invite',
  { ...G(sid, nick), p_disponibilita_id: dest.disp || null, p_session_online: dest.online || null });
// Un match già giocato (un update dopo l'insert) fra u1 e u2.
const giocato = async (db, u1, u2) => {
  const id = (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ($1, $2) RETURNING id`, [u1, u2])).id;
  await db.query(`UPDATE telepathy_matches SET round_count = 1 WHERE id = $1`, [id]);
  return id;
};
const chiamateMotore = async (db) => (await uno(db, `SELECT count(*)::int n FROM net.chiamate WHERE url LIKE '%/notify-telepathy-invite'`)).n;

const sezioni = [];
const sezione = (nome, fn, opzioni = { con32a: true }) => sezioni.push([nome, fn, opzioni]);

// ════ A. Tabelle e colonne (Task 7) ════════════════════════════════════════
sezione('A1. match: attività e giocato', async (db) => {
  const m = await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id, giocato) VALUES ('a', 'b', true) RETURNING *`);
  check(m.giocato === false, 'insert: giocato sempre false, anche se il client manda true', m.giocato);
  await db.query(`UPDATE telepathy_matches SET ultima_attivita = now() - interval '20 minutes' WHERE id = $1`, [m.id]);
  let r = await uno(db, `SELECT ultima_attivita < now() - interval '19 minutes' AS vecchia FROM telepathy_matches WHERE id = $1`, [m.id]);
  check(r.vecchia === true, 'migration e ruolo di servizio possono spostare ultima_attivita (serve ai test)', r);
  await comeAnon(db, () => db.query(`UPDATE telepathy_matches SET round_count = 1 WHERE id = $1`, [m.id]));
  const fresca = `SELECT ultima_attivita > now() - interval '5 seconds' AS fresca, giocato FROM telepathy_matches WHERE id = $1`;
  r = await uno(db, fresca, [m.id]);
  check(r.fresca === true && r.giocato === true, 'update dall\'app: ultima_attivita = adesso e giocato = true', r);
  await comeAnon(db, () => db.query(`UPDATE telepathy_matches SET ultima_attivita = now() - interval '1 hour', giocato = false WHERE id = $1`, [m.id]));
  r = await uno(db, fresca, [m.id]);
  check(r.fresca === true && r.giocato === true, 'dall\'app non si sposta indietro l\'attività né si toglie giocato', r);
});

sezione('A2. prima applicazione e rilancio', async () => {
  const db = await creaDbTelepatia({ con32a: false });
  const vecchio = await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ('x', 'y') RETURNING id`);
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status) VALUES
    ('p1', 'P1', 'dest', 'D', 'pending'), ('p2', 'P2', 'dest', 'D', 'pending'), ('p3', 'P3', 'altro', 'A', 'boh')`);
  const mPrima = await errore(applicaFile(db, F32A));
  check(!mPrima, 'la 32a passa anche con due pending per lo stesso destinatario', mPrima);
  check((await uno(db, `SELECT giocato FROM telepathy_matches WHERE id = $1`, [vecchio.id])).giocato === true,
    'i match già presenti risultano giocati (sessioni vere, non orfani)');
  const nuovo = await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ('x2', 'y2') RETURNING giocato, da_invito`);
  check(nuovo.giocato === false && nuovo.da_invito === false, 'dopo la 32a i match nuovi nascono non giocati e non da invito', nuovo);
  const st = await righe(db, `SELECT status, count(*)::int n FROM telepathy_invites GROUP BY 1 ORDER BY 1`);
  check(JSON.stringify(st) === '[{"status":"expired","n":3}]', 'prima applicazione: pending e stati sconosciuti diventano expired', st);
  const idx = await righe(db, `SELECT indexname FROM pg_indexes WHERE tablename = 'telepathy_invites' AND indexname LIKE 'telepathy_invites_un_pending_%'`);
  check(idx.length === 2, 'i due indici unici parziali esistono', idx);
  // Nomi validi: from_name/to_name sono NOT NULL nel catalogo vero, così fallisce solo il CHECK.
  const mCheck = await errore(db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status) VALUES ('q', 'Q', 'r', 'R', 'inventato')`));
  check(!!mCheck && /telepathy_invites_stato_valido/.test(mCheck), 'uno stato sconosciuto è rifiutato dal CHECK telepathy_invites_stato_valido', mCheck);
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, expires_at) VALUES
    ('vivo', 'V', 'dv', 'DV', now() + interval '5 minutes'), ('morto', 'M', 'dm', 'DM', now() - interval '1 second')`);
  const mRil = await errore(applicaFile(db, F32A));
  check(!mRil, 'la 32a si rilancia senza errori', mRil);
  const dopo = await righe(db, `SELECT from_id, status FROM telepathy_invites WHERE from_id IN ('vivo', 'morto') ORDER BY 1`);
  check(dopo[0].status === 'expired' && dopo[1].status === 'pending', 'rilancio: chiude solo i pending già scaduti, non quelli vivi', dopo);
}, { con32a: false });

// Ruling C3: i vecchi inviti non devono sembrare inviti da 10 minuti (niente push «scaduto» a persone vere).
sezione('A2b. inviti vecchi alla prima applicazione', async () => {
  const db = await creaDbTelepatia({ con32a: false });
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, created_at)
    VALUES ('vecchio', 'V', 'dv', 'DV', 'pending', now() - interval '3 days')`);
  const m = await errore(applicaFile(db, F32A));
  check(!m, 'la 32a passa con un invito vecchio di tre giorni', m);
  const r = await uno(db, `SELECT status, con_push, push_saltata, extract(epoch FROM expires_at - created_at)::int AS s,
                                  created_at < now() - interval '2 days' AS vecchio
                           FROM telepathy_invites WHERE from_id = 'vecchio'`);
  check(r.status === 'expired' && r.vecchio === true, 'l\'invito vecchio è expired e conserva il created_at', r);
  check(r.s === 45, 'expires_at - created_at = 45 s: non è un invito da 10 minuti, nessuna push «scaduto»', r);
  check(r.con_push === false && r.push_saltata === false, 'nessun con_push: l\'invito vecchio non genera push', r);
}, { con32a: false });

sezione('A3. guardia sulle scritture dirette', async (db) => {
  const ins = await comeAnon(db, () => uno(db, `INSERT INTO telepathy_invites
      (from_id, from_name, to_id, to_name, status, expires_at, con_push, push_saltata, match_id, responded_at, created_at)
    VALUES ('ga', 'GA', 'gb', 'GB', 'accepted', now() + interval '1 year', true, true, gen_random_uuid(), now(), now() - interval '1 day')
    RETURNING *`));
  check(ins.status === 'pending', 'insert diretto: lo stato è sempre pending', ins.status);
  const d = await uno(db, `SELECT extract(epoch FROM expires_at - created_at)::int s, created_at > now() - interval '5 seconds' AS adesso
                           FROM telepathy_invites WHERE id = $1`, [ins.id]);
  check(d.s === 45 && d.adesso === true, 'insert diretto: 45 s da adesso, created_at non si inventa', d);
  check(ins.con_push === false && ins.push_saltata === false && ins.match_id === null && ins.responded_at === null,
    'insert diretto: niente push, niente match_id, niente responded_at', ins);
  check(ins.via_diretta === true, 'insert diretto: segnato via_diretta', ins.via_diretta);
  await comeAnon(db, () => db.query(`UPDATE telepathy_invites SET status = 'accepted', match_id = '11111111-1111-1111-1111-111111111111',
    expires_at = now() + interval '1 year', to_id = 'altro', con_push = true WHERE id = $1`, [ins.id]));
  const up = await uno(db, `SELECT * FROM telepathy_invites WHERE id = $1`, [ins.id]);
  check(up.status === 'accepted', 'update diretto: lo stato cambia (le app vecchie accettano così)', up.status);
  check(up.match_id === null && up.to_id === 'gb' && up.con_push === false, 'update diretto: match_id, destinatario e con_push restano com\'erano', up);
  check(up.responded_at !== null, 'update diretto: uscendo da pending, responded_at lo scrive il server', up.responded_at);
  const priv = await uno(db, `INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, con_push, expires_at)
    VALUES ('pa', 'PA', 'pb', 'PB', true, now() + interval '10 minutes')
    RETURNING con_push, via_diretta, extract(epoch FROM expires_at - created_at)::int s`);
  check(priv.con_push === true && priv.via_diretta === false && priv.s >= 599, 'scrittura privilegiata (RPC, servizio): le colonne restano quelle scritte', priv);
});

sezione('A4. tabelle nuove chiuse ad anon', async (db) => {
  for (const t of ['telepathy_availability', 'telepathy_invite_blocks', 'telepathy_invite_pushes']) {
    const m = await errore(comeAnon(db, () => db.query(`SELECT * FROM ${t}`)));
    check(!!m && /permission denied/i.test(m), `${t}: anon non legge`, m);
  }
});

// ── esecuzione ──
(async () => {
  for (const [nome, fn, opzioni] of sezioni) {
    console.log(`\n— ${nome} —`);
    try {
      const db = opzioni.con32a === false ? null : await creaDbTelepatia(opzioni);
      await fn(db);
    } catch (e) { check(false, `${nome}: eccezione`, e.message); }
  }
  console.log(`\n${passed} passati, ${failed} falliti`);
})();
