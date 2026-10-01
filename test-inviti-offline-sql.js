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

// ════ B. Funzioni interne (Task 8) ═════════════════════════════════════════
sezione('B1. identità', async (db) => {
  await iscritto(db, 'reg1', 'Aurora', 'h1');
  const id = (sid, pw) => errore(db.query(`SELECT telepatia_verifica_identita($1, $2)`, [sid, pw]));
  let m = await id('reg1', null);
  check(!!m && m.includes('Auth failed'), 'iscritto senza credenziale: Auth failed', m);
  m = await id('reg1', 'sbagliata');
  check(!!m && m.includes('Auth failed'), 'iscritto con credenziale sbagliata: Auth failed', m);
  check(!(await id('reg1', 'h1')), 'iscritto con la sua credenziale: passa');
  check(!(await id('ospite1', null)), 'ospite: basta il session_id');
  m = await id('', null);
  check(!!m && m.includes('session_required'), 'session_id vuoto: session_required', m);
  m = await id('x'.repeat(256), null);
  check(!!m && m.includes('session_id_too_long'), 'session_id oltre 255: session_id_too_long', m);
});

sezione('B2. nome_pubblico uguale alla pulizia della candela (30_)', async (db) => {
  await iscritto(db, 'reg1', 'Aurora', 'h1');
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('reg3', 'Luna Nuova', 'l@test.com', 'hl')`);
  const t = Date.now() - 60000;
  const rit = await uno(db, `SELECT * FROM create_ritual('Ospite', 'prova', 'Candela', '', 'consciousness', 11, $1, $2, 30, NULL)`,
    [new Date(t).toISOString().slice(0, 10), new Date(t).toISOString().slice(11, 16)]);
  // Gli stessi casi di test-candela-stanza-sql.js, scritti con gli escape per non perderli.
  const nomi = ['  Luce  ', 'aURORA', '\u200BAurora\u202E', ' \u200BLu\u200Fc\u2066e\u0007\u001b ', '\u200B\u200D\u202A\u2069\u0001',
    '\u200B'.repeat(10) + 'y'.repeat(60), 'Luna Nuova', 'Luna\u3000Nuova', '\uFF21\uFF55\uFF52\uFF4F\uFF52\uFF41',
    'Luna \u3000Piena', '   ', 'x'.repeat(80), 'Au\u00ADrora', 'Normale'];
  let uguali = 0;
  for (let i = 0; i < nomi.length; i++) {
    const sid = 'np' + i;
    await db.query(`SELECT segna_presenza_rituale($1, $2)`, [rit.id, sid]);
    const r = await uno(db, `SELECT * FROM toggle_ritual_candle($1, $2, $3, NULL)`, [rit.id, sid, nomi[i]]);
    const np = (await uno(db, `SELECT nome_pubblico($1, $2) AS n`, [sid, nomi[i]])).n;
    if (r.candles_nomi[sid] === np) uguali++; else console.log('    diverso:', JSON.stringify(nomi[i]), r.candles_nomi[sid], np);
  }
  check(uguali === nomi.length, `nome_pubblico e toggle_ritual_candle: stesso nome su ${nomi.length} casi`, uguali);
  check((await uno(db, `SELECT nome_pubblico('reg1', 'Impostore') AS n`)).n === 'Aurora', 'iscritto: il nome viene dal profilo');
  // C12: ogni carattere invisibile della classe viene tolto, e ogni spazio speciale diventa uno spazio.
  const np = async (s) => (await uno(db, `SELECT nome_pubblico('ospx', $1) AS n`, [s])).n;
  const invisibili = { U202E: '\u202E', U202A: '\u202A', U2069: '\u2069', U200B: '\u200B', U200F: '\u200F', U2060: '\u2060',
    U2064: '\u2064', UFEFF: '\uFEFF', U00AD: '\u00AD', U034F: '\u034F', U061C: '\u061C', U180E: '\u180E',
    U115F: '\u115F', U1160: '\u1160', U3164: '\u3164', UFFA0: '\uFFA0', U0007: '\u0007' };
  const tenuti = [];
  for (const [k, c] of Object.entries(invisibili)) if ((await np(`Lu${c}na`)) !== 'Luna') tenuti.push(k);
  check(tenuti.length === 0, 'nome_pubblico toglie ogni carattere invisibile/direzionale della classe', tenuti);
  const spazi = { U2028: '\u2028', U2029: '\u2029', U00A0: '\u00A0', U1680: '\u1680', U2003: '\u2003', U202F: '\u202F', U205F: '\u205F', U3000: '\u3000' };
  const nonSpazi = [];
  for (const [k, c] of Object.entries(spazi)) if ((await np(`Luna${c}${c}Piena`)) !== 'Luna Piena') nonSpazi.push(k);
  check(nonSpazi.length === 0, 'nome_pubblico riduce ogni spazio Unicode speciale a uno spazio solo', nonSpazi);
});

sezione('B3. in training', async (db) => {
  const inTr = async (sid, escludi = null) => (await uno(db, `SELECT telepatia_in_training($1, $2) AS t`, [sid, escludi])).t;
  const m1 = (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ('t1', 't2') RETURNING id`)).id;
  check(await inTr('t1') === false, 'match appena nato, mai giocato, senza invito: non è un training');
  await db.query(`UPDATE telepathy_matches SET round_count = 1 WHERE id = $1`, [m1]);
  check(await inTr('t1') === true && await inTr('t2') === true, 'dopo un update: training per entrambi');
  await db.query(`UPDATE telepathy_matches SET ultima_attivita = now() - interval '11 minutes' WHERE id = $1`, [m1]);
  check(await inTr('t1') === false, 'dieci minuti senza aggiornamenti: non più in training');
  const m2 = (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id, da_invito) VALUES ('t3', 't4', true) RETURNING id`)).id;
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, match_id, responded_at)
                  VALUES ('t3', 'T3', 't4', 'T4', 'accepted', $1, now())`, [m2]);
  check(await inTr('t3') === true, 'mai giocato ma legato a un invito accettato: training');
  check(await inTr('t3', m2) === false, 'il match escluso non conta');
  await db.query(`UPDATE telepathy_matches SET ended_at = now() WHERE id = $1`, [m2]);
  check(await inTr('t3') === false, 'match con ended_at: non è un training');
});

sezione('B4. online e blocchi', async (db) => {
  await online(db, 'o1', 'Uno');
  await online(db, 'o2', 'Due', 31);
  check((await uno(db, `SELECT telepatia_online('o1') AS t`)).t === true, 'visto adesso: online');
  check((await uno(db, `SELECT telepatia_online('o2') AS t`)).t === false, 'visto 31 s fa: non online');
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Uno', 'Due')`);
  check((await uno(db, `SELECT telepatia_bloccati('o2', 'Due', 'o1', 'Uno') AS b`)).b === true, 'user_blocks vale nei due sensi');
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('s1', 's2')`);
  check((await uno(db, `SELECT telepatia_bloccati('s2', 'X', 's1', 'Y') AS b`)).b === true, 'telepathy_invite_blocks vale nei due sensi');
  check((await uno(db, `SELECT telepatia_bloccati('s3', 'X', 's1', 'Y') AS b`)).b === false, 'senza blocchi: falso');
});

sezione('B5. funzioni interne chiuse all\'app, motore chiamato bene', async (db) => {
  for (const q of [`SELECT telepatia_verifica_identita('a', NULL)`, `SELECT nome_pubblico('a', 'b')`,
                   `SELECT telepatia_in_training('a')`, `SELECT telepatia_online('a')`,
                   `SELECT telepatia_bloccati('a', 'b', 'c', 'd')`, `SELECT telepatia_chiama_motore('{}'::jsonb)`,
                   `SELECT telepatia_disponibile('a')`, `SELECT * FROM telepatia_risolvi(NULL, 'a')`]) {
    const m = await errore(comeAnon(db, () => db.query(q)));
    check(!!m && /permission denied/i.test(m), `anon non esegue: ${q.slice(0, 45)}`, m);
  }
  await db.query(`SELECT telepatia_chiama_motore('{"tipo":"prova"}'::jsonb)`);
  const c = await uno(db, `SELECT url, body, headers FROM net.chiamate ORDER BY id DESC LIMIT 1`);
  const ruolo = JSON.parse(Buffer.from(c.headers.Authorization.split('.')[1], 'base64').toString()).role;
  check(c.url.endsWith('/functions/v1/notify-telepathy-invite') && c.body.tipo === 'prova' && ruolo === 'anon',
    'telepatia_chiama_motore: una chiamata alla funzione giusta, con la chiave pubblica', c.url);
  // C: il corpo che l'Edge Function sa leggere (leggiRichiesta in decisioni.mjs) passa com'è.
  const uuid = '11111111-2222-3333-4444-555555555555';
  await db.query(`SELECT telepatia_chiama_motore(jsonb_build_object('tipo', 'invito', 'invito', $1::text))`, [uuid]);
  const c2 = await uno(db, `SELECT body FROM net.chiamate ORDER BY id DESC LIMIT 1`);
  check(c2.body.tipo === 'invito' && c2.body.invito === uuid, 'corpo {tipo, invito:uuid} arriva com\'è', c2.body);
});

// Piccole funzioni pure e di scelta (disponibile, risolvi, motivo, soglia dei 10 minuti).
sezione('B6. disponibile, risolvi, motivo, soglia', async (db) => {
  const q = async (sql, p = []) => (await uno(db, sql, p)).v;
  check(await q(`SELECT telepatia_motivo_stato('accepted') AS v`) === 'gia_accettato'
     && await q(`SELECT telepatia_motivo_stato('declined') AS v`) === 'rifiutato'
     && await q(`SELECT telepatia_motivo_stato('cancelled') AS v`) === 'annullato'
     && await q(`SELECT telepatia_motivo_stato('expired') AS v`) === 'scaduto'
     && await q(`SELECT telepatia_motivo_stato(NULL) AS v`) === 'scaduto', 'telepatia_motivo_stato: i quattro motivi');
  check(await q(`SELECT telepatia_era_da_dieci(now(), now() + interval '45 seconds') AS v`) === false
     && await q(`SELECT telepatia_era_da_dieci(now(), now() + interval '10 minutes') AS v`) === true, 'telepatia_era_da_dieci: 45 s no, 10 minuti sì');
  await online(db, 'd1', 'Uno');
  check(await q(`SELECT telepatia_disponibile('d1') AS v`) === true, 'online e libero: disponibile');
  await db.query(`INSERT INTO telepathy_availability (session_id, nickname) VALUES ('d2', 'Due')`);
  check(await q(`SELECT telepatia_disponibile('d2') AS v`) === false, 'riga di disponibilità senza abbonamento e non online: no');
  await abbonamento(db, 'd2');
  check(await q(`SELECT telepatia_disponibile('d2') AS v`) === true, 'riga recente con abbonamento: disponibile');
  await db.query(`UPDATE telepathy_availability SET rinnovata_il = now() - interval '15 days' WHERE session_id = 'd2'`);
  check(await q(`SELECT telepatia_disponibile('d2') AS v`) === false, 'rinnovata 15 giorni fa: fuori lista');
  const gioc = await giocato(db, 'd1', 'dx');
  check(await q(`SELECT telepatia_disponibile('d1') AS v`) === false, 'online ma in un training: non disponibile', gioc);
  const id2 = await idDisp(db, 'd2');
  await db.query(`UPDATE telepathy_availability SET rinnovata_il = now() WHERE session_id = 'd2'`);
  let r = await uno(db, `SELECT * FROM telepatia_risolvi($1, NULL)`, [id2]);
  check(r.o_sid === 'd2' && r.o_nome === 'Due', 'risolvi da identificativo opaco', r);
  await online(db, 'd3', '\u200BTre\u202E');
  r = await uno(db, `SELECT * FROM telepatia_risolvi(NULL, 'd3')`);
  check(r.o_sid === 'd3' && r.o_nome === 'Tre', 'risolvi da lista Online: nome ripulito dal server', r);
  await online(db, 'd4', 'Quattro', 40);
  r = await uno(db, `SELECT * FROM telepatia_risolvi(NULL, 'd4')`);
  check(r.o_sid === null && r.o_nome === null, 'risolvi: chi non è online da 30 s non si trova', r);
  r = await uno(db, `SELECT * FROM telepatia_risolvi('99999999-9999-9999-9999-999999999999', NULL)`);
  check(r.o_sid === null, 'risolvi: identificativo sconosciuto: niente', r);
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
