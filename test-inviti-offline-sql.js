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

// Revisione finale (M1 e status NULL): da una scrittura diretta lo stato si sposta solo come lo
// spostano le app vecchie, da pending ad accepted o declined. Ogni altro passaggio farebbe
// partire una push al mittente (expired → «scaduto») o riaprirebbe un invito chiuso.
sezione('A5. guardia: passaggi di stato ammessi alle scritture dirette', async (db) => {
  let n = 0;
  // Scrittura privilegiata (come le RPC): ogni invito con il suo mittente e destinatario.
  const nuovo = async (status) => {
    n++;
    return (await uno(db, `INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status)
      VALUES ($1, 'M', $2, 'D', $3) RETURNING id`, [`m${n}`, `d${n}`, status])).id;
  };
  const stato = async (id) => (await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [id])).status;
  const anonStato = (id, s) => errore(comeAnon(db, () => db.query(`UPDATE telepathy_invites SET status = $2 WHERE id = $1`, [id, s])));

  const col = await uno(db, `SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'telepathy_invites' AND column_name = 'status'`);
  check(col.is_nullable === 'NO', 'status è NOT NULL dopo la 32a', col);
  let id = await nuovo('pending');
  let m = await anonStato(id, null);
  check(!!m && (await stato(id)) === 'pending', 'anon: UPDATE status = NULL rifiutato, l\'invito resta pending', m);
  m = await errore(db.query(`UPDATE telepathy_invites SET status = NULL WHERE id = $1`, [id]));
  check(!!m && /null/i.test(m), 'anche dalle RPC status = NULL è rifiutato (NOT NULL)', m);

  id = await nuovo('pending');
  m = await anonStato(id, 'accepted');
  check(!m && (await stato(id)) === 'accepted', 'anon: pending → accepted ammesso (app vecchia che accetta)', m);
  id = await nuovo('pending');
  m = await anonStato(id, 'declined');
  check(!m && (await stato(id)) === 'declined', 'anon: pending → declined ammesso (app vecchia che rifiuta)', m);

  const vietati = [['pending', 'expired'], ['pending', 'cancelled'], ['declined', 'pending'], ['expired', 'pending'],
    ['accepted', 'pending'], ['accepted', 'declined'], ['declined', 'accepted'], ['expired', 'accepted'], ['declined', 'expired'],
    ['cancelled', 'declined']];
  for (const [da, a] of vietati) {
    id = await nuovo(da);
    m = await anonStato(id, a);
    check(!!m && /solo da pending ad accepted o declined/.test(m) && (await stato(id)) === da,
      `anon: ${da} → ${a} rifiutato con un errore chiaro, lo stato resta ${da}`, m);
  }
  check((await chiamateMotore(db)) === 0, 'nessuna push chiesta alla Edge Function da questi update');

  // Gli update che non toccano lo stato restano come prima: nessun errore, nessun effetto.
  id = await nuovo('declined');
  m = await errore(comeAnon(db, () => db.query(`UPDATE telepathy_invites SET to_name = 'Altro', status = 'declined' WHERE id = $1`, [id])));
  const r = await uno(db, `SELECT status, to_name FROM telepathy_invites WHERE id = $1`, [id]);
  check(!m && r.status === 'declined' && r.to_name === 'D', 'anon: update senza cambio di stato su un invito chiuso, ignorato come prima', { m, r });

  // La strada privilegiata non ha la regola: le RPC e la migration scrivono ogni passaggio.
  id = await nuovo('pending');
  m = await errore(db.query(`UPDATE telepathy_invites SET status = 'expired' WHERE id = $1`, [id]));
  check(!m && (await stato(id)) === 'expired', 'privilegiato: pending → expired ammesso', m);
  m = await errore(db.query(`UPDATE telepathy_invites SET status = 'cancelled' WHERE id = $1`, [id]));
  check(!m && (await stato(id)) === 'cancelled', 'privilegiato: expired → cancelled ammesso', m);
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

// ════ C. Interruttore, lista, scheda (Task 9) ══════════════════════════════
sezione('C1. interruttore', async (db) => {
  const set = (sid, nick, on, pw = null) => chiama(db, 'set_telepathy_availability', { p_session_id: sid, p_password_hash: pw, p_nickname: nick, p_enabled: on });
  const renew = (sid) => chiama(db, 'renew_telepathy_availability', { p_session_id: sid, p_password_hash: null });
  const riga = (sid) => uno(db, `SELECT nickname FROM telepathy_availability WHERE session_id = $1`, [sid]);
  let r = await set('d1', 'Dora', true);
  check(r.ok === false && r.motivo === 'nessun_abbonamento' && r.acceso === false, 'accendere senza abbonamento: nessun_abbonamento', r);
  await abbonamento(db, 'd1');
  r = await set('d1', ' Dora ', true);
  check(r.ok === true && r.acceso === true, 'con un abbonamento si accende', r);
  check((await riga('d1')).nickname === 'Dora', 'il nome salvato è quello ripulito');
  check((await renew('d1')).stato === 'acceso', 'renew con riga e abbonamento: acceso');
  await db.query(`DELETE FROM push_subscriptions WHERE session_id = 'd1'`);
  check((await renew('d1')).stato === 'senza_abbonamento', 'renew senza abbonamento: senza_abbonamento');
  r = await set('d1', 'Dora', false);
  check(r.ok === true && r.acceso === false && !(await riga('d1')), 'spegnere cancella la riga', r);
  r = await renew('d1');
  check(r.stato === 'spento' && !(await riga('d1')), 'renew senza riga: spento, e non la crea', r);
  await iscritto(db, 'reg1', 'Aurora', 'h1');
  await abbonamento(db, 'reg1');
  const m = await errore(set('reg1', 'X', true));
  check(!!m && m.includes('Auth failed'), 'iscritto senza credenziale: Auth failed', m);
  r = await set('reg1', 'Impostore', true, 'h1');
  check(r.acceso === true && (await riga('reg1')).nickname === 'Aurora', 'iscritto: il nome viene dal profilo', r);
});

sezione('C2. lista «Disponibili su invito»', async (db) => {
  for (const [sid, nick] of [['io', 'Io'], ['ok1', 'Ok'], ['bl1', 'Bloccato'], ['bl2', 'MiBlocca'], ['vecchio', 'Vecchio'], ['onl', 'Online'], ['train', 'Allena']]) {
    await disp(db, sid, nick);
  }
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Io', 'Bloccato')`);
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('bl2', 'io')`);
  await db.query(`INSERT INTO telepathy_availability (session_id, nickname) VALUES ('nosub', 'SenzaAbbonamento')`);
  await db.query(`UPDATE telepathy_availability SET rinnovata_il = now() - interval '20 days' WHERE session_id = 'vecchio'`);
  await online(db, 'onl', 'Online');
  await giocato(db, 'train', 'zz');
  const lista = await righe(db, `SELECT * FROM get_invitable_users('io', NULL, 'Io')`);
  check(JSON.stringify(lista.map((x) => x.nickname)) === '["Ok"]',
    'la lista esclude me, blocchi nei due sensi, senza abbonamento, 14 giorni, online, in training', lista.map((x) => x.nickname));
  check(Object.keys(lista[0]).sort().join(',') === 'id,nickname', 'la lista restituisce solo id opaco e nickname', Object.keys(lista[0]));
  check(lista[0].id !== 'ok1' && /^[0-9a-f-]{36}$/.test(lista[0].id), 'l\'id è quello opaco, non il session_id', lista[0].id);
  await chiama(db, 'renew_telepathy_availability', { p_session_id: 'vecchio', p_password_hash: null });
  const lista2 = await righe(db, `SELECT nickname FROM get_invitable_users('io', NULL, 'Io') ORDER BY nickname`);
  check(JSON.stringify(lista2.map((x) => x.nickname)) === '["Ok","Vecchio"]', 'dopo 20 giorni la riapertura lo rimette in lista da sola', lista2);
  const lista3 = await righe(db, `SELECT nickname FROM get_invitable_users('io', NULL, ' Io ')`);
  check(!lista3.some((x) => x.nickname === 'Bloccato'), 'blocco per nome: il nome mandato dall\'app passa da nome_pubblico', lista3);
});

sezione('C3. scheda', async (db) => {
  const scheda = (disp_, onl) => chiama(db, 'get_invite_card', { ...G('io', 'Io'), p_disponibilita_id: disp_, p_session_online: onl });
  await iscritto(db, 'reg2', 'Stella', 'hs');
  await db.query(`UPDATE profiles SET country = 'IT', bio = 'Ciao', show_telepathy_score = true WHERE session_id = 'reg2'`);
  await db.query(`INSERT INTO telepathy_scores (user_id, nickname, rounds_count, matches_count) VALUES ('stella@test.com', 'Stella', 40, 12)`);
  await abbonamento(db, 'reg2');
  await chiama(db, 'set_telepathy_availability', { p_session_id: 'reg2', p_password_hash: 'hs', p_nickname: null, p_enabled: true });
  const idStella = await idDisp(db, 'reg2');
  let c = await scheda(idStella, null);
  check(c.ok === true && c.scheda.nickname === 'Stella' && c.scheda.country === 'IT' && c.scheda.bio === 'Ciao', 'scheda di un iscritto: nome, paese, bio', c);
  check(c.scheda.prove === 40 && c.scheda.indovinate === 12, 'scheda: prove e indovinate', c.scheda);
  const testo = JSON.stringify(c);
  check(!testo.includes('reg2') && !testo.includes('@test.com') && !('user_id' in c.scheda) && !('session_id' in c.scheda),
    'scheda: niente session_id, user_id, email', testo);
  await db.query(`UPDATE profiles SET show_telepathy_score = false WHERE session_id = 'reg2'`);
  c = await scheda(idStella, null);
  check(c.scheda.prove === null && c.scheda.indovinate === null, 'punteggio nascosto: prove e indovinate null', c.scheda);
  await online(db, 'osp', 'Ospitina');
  await db.query(`INSERT INTO telepathy_scores (user_id, nickname, rounds_count, matches_count) VALUES ('osp', 'Ospitina', 7, 2)`);
  c = await scheda(null, 'osp');
  check(c.ok === true && c.scheda.nickname === 'Ospitina' && c.scheda.prove === 7 && c.scheda.bio === null, 'scheda di un ospite dalla lista Online', c);
  await db.query(`UPDATE online_users SET last_seen = now() - interval '31 seconds' WHERE id = 'osp'`);
  c = await scheda(null, 'osp');
  check(c.ok === false && c.motivo === 'non_trovato', 'p_session_online non visto da 31 s: non trovato', c);
  c = await scheda('22222222-2222-2222-2222-222222222222', null);
  check(c.ok === false && c.motivo === 'non_trovato', 'id opaco inesistente: non trovato', c);
  c = await scheda(idStella, 'osp');
  check(c.ok === false && c.motivo === 'dati_non_validi', 'entrambi i parametri: dati_non_validi', c);
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Stella', 'Io')`);
  c = await scheda(idStella, null);
  check(c.ok === false && c.motivo === 'non_trovato', 'chi mi ha bloccato: la scheda risulta non trovata', c);
});

sezione('C4. credenziale sbagliata: Auth failed (C7)', async (db) => {
  await iscritto(db, 'reg9', 'Nove', 'h9');
  await abbonamento(db, 'reg9');
  const m = (fn, extra = {}) => errore(chiama(db, fn, { p_session_id: 'reg9', p_password_hash: 'sbagliato', ...extra }));
  for (const [fn, extra] of [
    ['set_telepathy_availability', { p_nickname: 'X', p_enabled: true }],
    ['renew_telepathy_availability', {}],
    ['get_invitable_users', { p_nickname: 'X' }],
    ['get_invite_card', { p_nickname: 'X', p_disponibilita_id: null, p_session_online: 'qualcuno' }],
  ]) {
    const e = await m(fn, extra);
    check(!!e && e.includes('Auth failed'), `${fn}: hash sbagliato per un iscritto: Auth failed`, e);
  }
  check(!(await uno(db, `SELECT 1 x FROM telepathy_availability WHERE session_id = 'reg9'`)), 'e nessuna riga creata');
});

// ════ D. Invio (Task 10) ═══════════════════════════════════════════════════
sezione('D1. invio: i rifiuti', async (db) => {
  await disp(db, 'dest', 'Dest');
  const dId = await idDisp(db, 'dest');
  await disp(db, 'blk', 'Blk');
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('blk', 'mitt')`);
  let r = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'blk') });
  check(r.ok === false && r.motivo === 'non_disponibile', 'destinatario che mi ha bloccato: non_disponibile', r);
  await db.query(`INSERT INTO telepathy_availability (session_id, nickname) VALUES ('senza', 'Senza')`);
  r = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'senza') });
  check(r.ok === false && r.motivo === 'non_disponibile', 'destinatario senza abbonamento: non_disponibile', r);
  await disp(db, 'allena', 'Allena');
  await giocato(db, 'allena', 'q');
  r = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'allena') });
  check(r.ok === false && r.motivo === 'non_disponibile', 'destinatario in un training: non_disponibile (stesso motivo del blocco)', r);
  await disp(db, 'mitt', 'Mitt');
  r = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'mitt') });
  check(r.ok === false && r.motivo === 'dati_non_validi', 'invitare sé stessi: dati_non_validi', r);
  r = await invia(db, 'mitt', 'Mitt', { disp: dId, online: 'x' });
  check(r.ok === false && r.motivo === 'dati_non_validi', 'due parametri insieme: dati_non_validi', r);
  await online(db, 'lontano', 'Lontano', 31);
  r = await invia(db, 'mitt', 'Mitt', { online: 'lontano' });
  check(r.ok === false && r.motivo === 'non_disponibile', 'p_session_online visto 31 s fa: non si trova', r);
  const m2 = await giocato(db, 'mitt', 'w');
  r = await invia(db, 'mitt', 'Mitt', { disp: dId });
  check(r.ok === false && r.motivo === 'in_match', 'mittente in un training: in_match', r);
  await db.query(`UPDATE telepathy_matches SET ended_at = now() WHERE id = $1`, [m2]);
  r = await invia(db, 'mitt', 'Mitt', { disp: dId });
  check(r.ok === true && !!r.id, 'finito il training, l\'invito parte', r);
  const r2 = await invia(db, 'mitt', 'Mitt', { disp: dId });
  check(r2.ok === false && r2.motivo === 'invito_in_corso', 'secondo invito dello stesso mittente: invito_in_corso', r2);
  await disp(db, 'altro', 'Altro');
  const r3 = await invia(db, 'altro', 'Altro', { disp: dId });
  check(r3.ok === false && r3.motivo === 'gia_invitato', 'un secondo mittente verso lo stesso destinatario: gia_invitato', r3);
  await db.query(`UPDATE telepathy_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, [r.id]);
  const r4 = await invia(db, 'altro', 'Altro', { disp: dId });
  check(r4.ok === true, 'scaduto l\'invito, il destinatario si libera', r4);
  check((await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [r.id])).status === 'expired', 'e quello vecchio è expired');
});

sezione('D2. invio: 10 all\'ora per mittente', async (db) => {
  await disp(db, 'dd', 'DD');
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, created_at)
                  SELECT 'spam', 'Spam', 'v' || i, 'V', 'cancelled', now() - interval '10 minutes' FROM generate_series(1, 10) i`);
  const r = await invia(db, 'spam', 'Spam', { disp: await idDisp(db, 'dd') });
  check(r.ok === false && r.motivo === 'troppi_inviti', '10 inviti nell\'ultima ora: troppi_inviti', r);
  await db.query(`UPDATE telepathy_invites SET created_at = now() - interval '61 minutes' WHERE from_id = 'spam'`);
  check((await invia(db, 'spam', 'Spam', { disp: await idDisp(db, 'dd') })).ok === true, 'dopo un\'ora si può di nuovo');
});

sezione('D3. invio: durata, push, nomi, campanella', async (db) => {
  const dettagli = (id) => uno(db, `SELECT *, extract(epoch FROM expires_at - created_at)::int s FROM telepathy_invites WHERE id = $1`, [id]);
  await disp(db, 'off', 'Off');
  let n0 = await chiamateMotore(db);
  let r = await invia(db, 'm1', 'M1', { disp: await idDisp(db, 'off') });
  let inv = await dettagli(r.id);
  check(inv.s === 600 && inv.con_push === true && inv.push_saltata === false, 'offline con l\'interruttore: 10 minuti e push', inv);
  check(await chiamateMotore(db) === n0 + 1, 'esattamente una chiamata alla Edge Function');
  const body = (await uno(db, `SELECT body FROM net.chiamate ORDER BY id DESC LIMIT 1`)).body;
  check(body.invito === r.id && body.tipo === 'invito', 'la chiamata porta id e tipo', body);
  check(inv.from_name === 'M1' && inv.to_name === 'Off', 'i nomi li scrive il server', inv);
  const nt = await uno(db, `SELECT message FROM notifications WHERE user_nickname = 'Off' AND type = 'telepathy_invite'`);
  check(!!nt && nt.message === 'M1 ti ha invitato a un training telepatico', 'la notifica della campanella la scrive la RPC', nt);
  await online(db, 'onl', 'Onl');
  n0 = await chiamateMotore(db);
  r = await invia(db, 'm2', 'M2', { online: 'onl' });
  inv = await dettagli(r.id);
  check(inv.s === 45 && inv.con_push === false && inv.push_saltata === false, 'online senza interruttore: 45 s, niente push, niente push_saltata', inv);
  check(await chiamateMotore(db) === n0, 'online senza interruttore: nessuna chiamata');
  await disp(db, 'onl2', 'Onl2');
  await online(db, 'onl2', 'Onl2');
  n0 = await chiamateMotore(db);
  r = await invia(db, 'm3', 'M3', { online: 'onl2' });
  inv = await dettagli(r.id);
  check(inv.s === 45 && inv.con_push === true, 'online con l\'interruttore: 45 s e push (la sopprime il service worker)', inv);
  check(await chiamateMotore(db) === n0 + 1, 'online con l\'interruttore: una chiamata');
  await iscritto(db, 'reg9', 'Nove', 'h9');
  await disp(db, 't9', 'T9');
  r = await chiama(db, 'send_telepathy_invite', { p_session_id: 'reg9', p_password_hash: 'h9', p_nickname: 'Impostore', p_disponibilita_id: await idDisp(db, 't9'), p_session_online: null });
  check(r.ok === true && (await dettagli(r.id)).from_name === 'Nove', 'iscritto: il nome viene dal profilo, non dall\'app', r);
  const mA = await errore(chiama(db, 'send_telepathy_invite', { p_session_id: 'reg9', p_password_hash: 'no', p_nickname: null, p_disponibilita_id: await idDisp(db, 't9'), p_session_online: null }));
  check(!!mA && mA.includes('Auth failed'), 'iscritto con credenziale sbagliata: Auth failed', mA);
  check((await uno(db, `SELECT count(*)::int n FROM telepathy_invites WHERE from_id = 'reg9' AND created_at > now() - interval '1 minute' AND id <> $1`, [r.id])).n === 0, 'e con la credenziale sbagliata non nasce nessun invito (C7)');
  await disp(db, 't10', 'T10');
  r = await invia(db, 'finto', 'nove', { disp: await idDisp(db, 't10') });
  check(r.ok === true && (await dettagli(r.id)).from_name === 'Anonymous', 'ospite col nome di un iscritto: Anonymous', r);
});

sezione('D4. tetti per destinatario', async (db) => {
  await disp(db, 'pop', 'Pop');
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, con_push, created_at)
                  SELECT 'f' || i, 'F', 'pop', 'Pop', 'declined', true, now() - interval '20 minutes' FROM generate_series(1, 6) i`);
  let n0 = await chiamateMotore(db);
  let r = await invia(db, 'nuovo', 'Nuovo', { disp: await idDisp(db, 'pop') });
  check(r.ok === true && r.push_saltata === true, 'settimo invito con push nell\'ora: si scrive, ma senza push', r);
  check(await chiamateMotore(db) === n0, 'e nessuna chiamata');
  const inv = await uno(db, `SELECT con_push, push_saltata FROM telepathy_invites WHERE id = $1`, [r.id]);
  check(inv.con_push === false && inv.push_saltata === true, 'con_push false, push_saltata true', inv);
  await disp(db, 'cop', 'Cop');
  const copId = await idDisp(db, 'cop');
  r = await invia(db, 'amico', 'Amico', { disp: copId });
  check(r.ok === true && r.push_saltata === false, 'primo invito della coppia: con push', r);
  await db.query(`UPDATE telepathy_invites SET status = 'cancelled' WHERE id = $1`, [r.id]);
  n0 = await chiamateMotore(db);
  r = await invia(db, 'amico', 'Amico', { disp: copId });
  check(r.ok === true && r.push_saltata === true && await chiamateMotore(db) === n0, 'stessa coppia entro 15 minuti: senza push', r);
});

sezione('D5. due invii nello stesso istante (23505 tradotto)', async (db) => {
  await disp(db, 'c1', 'C1');
  // La vera concorrenza in PGlite non si prova: un trigger di test scrive la riga in conflitto
  // subito prima dell'insert della RPC. pg_trigger_depth(): agisce solo a profondità 1, perché
  // il suo stesso insert fa scattare di nuovo i trigger della tabella.
  await db.exec(`
    CREATE FUNCTION test_conflitto() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
      IF current_setting('test.conflitto', true) = 'mittente' THEN
        INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name) VALUES (NEW.from_id, 'X', 'terzo', 'T');
      ELSIF current_setting('test.conflitto', true) = 'destinatario' THEN
        INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name) VALUES ('terzo', 'T', NEW.to_id, 'X');
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER zz_test_conflitto BEFORE INSERT ON telepathy_invites FOR EACH ROW EXECUTE FUNCTION test_conflitto();`);
  const n0 = await chiamateMotore(db);
  await db.query(`SELECT set_config('test.conflitto', 'mittente', false)`);
  let r = await invia(db, 'corsa', 'Corsa', { disp: await idDisp(db, 'c1') });
  check(r.ok === false && r.motivo === 'invito_in_corso', '23505 sull\'indice del mittente: invito_in_corso', r);
  await db.query(`SELECT set_config('test.conflitto', 'destinatario', false)`);
  r = await invia(db, 'corsa', 'Corsa', { disp: await idDisp(db, 'c1') });
  check(r.ok === false && r.motivo === 'gia_invitato', '23505 sull\'indice del destinatario: gia_invitato', r);
  check(await chiamateMotore(db) === n0, 'nei conflitti non parte nessuna chiamata');
  check((await uno(db, `SELECT count(*)::int n FROM telepathy_invites WHERE from_id IN ('corsa', 'terzo')`)).n === 0,
    'e non resta nessuna riga (il conflitto annulla anche l\'insert del trigger)');
  await db.query(`SELECT set_config('test.conflitto', '', false)`);
});

// ════ E. Risposta, annullo, letture, blocco (Task 11) ══════════════════════
const rispondi = (db, id, sid, accetta, match = null, pw = null) => chiama(db, 'respond_telepathy_invite',
  { p_invite_id: id, p_session_id: sid, p_password_hash: pw, p_accept: accetta, p_match_id: match });
const nuovoMatch = async (db, u1, u2) => (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id, da_invito) VALUES ($1, $2, true) RETURNING id`, [u1, u2])).id;

sezione('E1. accettare', async (db) => {
  await disp(db, 'ric', 'Ric');
  const { id: idInv } = await invia(db, 'inv', 'Inv', { disp: await idDisp(db, 'ric') });
  let x = await rispondi(db, idInv, 'terzo', false);
  check(x.ok === false && x.motivo === 'non_trovato', 'solo il destinatario risponde', x);
  x = await rispondi(db, idInv, 'ric', true, null);
  check(x.ok === false && x.motivo === 'match_non_valido', 'accettare senza match: match_non_valido', x);
  x = await rispondi(db, idInv, 'ric', true, await nuovoMatch(db, 'inv', 'altro'));
  check(x.ok === false && x.motivo === 'match_non_valido', 'match di un\'altra coppia: match_non_valido', x);
  const giusto = await nuovoMatch(db, 'inv', 'ric');
  await disp(db, 'terza', 'Terza');
  const uscita = await invia(db, 'ric', 'Ric', { disp: await idDisp(db, 'terza') });
  const n0 = await chiamateMotore(db);
  x = await rispondi(db, idInv, 'ric', true, giusto);
  check(x.ok === true && x.status === 'accepted', 'accettare con il match giusto', x);
  const salvato = await uno(db, `SELECT match_id, responded_at FROM telepathy_invites WHERE id = $1`, [idInv]);
  check(salvato.match_id === giusto && salvato.responded_at !== null, 'match_id e responded_at salvati', salvato);
  check((await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [uscita.id])).status === 'cancelled',
    'l\'invito in uscita di chi accetta è annullato sul server');
  const ultima = await uno(db, `SELECT body FROM net.chiamate ORDER BY id DESC LIMIT 1`);
  check(await chiamateMotore(db) === n0 + 1 && ultima.body.tipo === 'accettato' && ultima.body.invito === idInv,
    'push «accettato» chiesta, con il corpo che legge leggiRichiesta', ultima);
  x = await rispondi(db, idInv, 'ric', true, giusto);
  check(x.ok === false && x.motivo === 'gia_accettato', 'una volta sola: la seconda accettazione (altro telefono) è rifiutata', x);
  check(!!(await uno(db, `SELECT 1 AS x FROM telepathy_matches WHERE id = $1`, [giusto])) && await chiamateMotore(db) === n0 + 1,
    'la seconda accettazione non tocca il match e non chiede altre push');
  x = await rispondi(db, idInv, 'ric', false);
  check(x.ok === false && x.motivo === 'gia_accettato', 'dopo l\'accettazione non si può più rifiutare', x);
});

sezione('E2. rifiutare, scadenza, in_match', async (db) => {
  await disp(db, 'r2', 'R2');
  let r = await invia(db, 'i2', 'I2', { disp: await idDisp(db, 'r2') });
  let n0 = await chiamateMotore(db);
  let x = await rispondi(db, r.id, 'r2', false);
  check(x.ok === true && x.status === 'declined', 'rifiutare', x);
  const ult = await uno(db, `SELECT body FROM net.chiamate ORDER BY id DESC LIMIT 1`);
  check(await chiamateMotore(db) === n0 + 1 && ult.body.tipo === 'rifiutato' && ult.body.invito === r.id,
    'invito da 10 minuti rifiutato: push «rifiutato» chiesta, col corpo giusto', ult);
  const nt = await uno(db, `SELECT message FROM notifications WHERE user_nickname = 'I2' AND type = 'telepathy_declined'`);
  check(!!nt && nt.message === 'R2 ha rifiutato il tuo invito al training telepatico', 'la notifica di rifiuto la scrive la RPC', nt);
  await online(db, 'r3', 'R3');
  r = await invia(db, 'i3', 'I3', { online: 'r3' });
  n0 = await chiamateMotore(db);
  x = await rispondi(db, r.id, 'r3', false);
  check(x.ok === true && await chiamateMotore(db) === n0, 'invito da 45 s rifiutato: nessuna push (chi invita è online)', x);
  await online(db, 'r4', 'R4');
  r = await invia(db, 'i4', 'I4', { online: 'r4' });
  await db.query(`UPDATE telepathy_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, [r.id]);
  x = await rispondi(db, r.id, 'r4', true, await nuovoMatch(db, 'i4', 'r4'));
  check(x.ok === false && x.motivo === 'scaduto', 'dopo la scadenza: scaduto', x);
  await online(db, 'r5', 'R5');
  r = await invia(db, 'i5', 'I5', { online: 'r5' });
  const mm = await nuovoMatch(db, 'i5', 'r5');
  await giocato(db, 'r5', 'zzz');
  x = await rispondi(db, r.id, 'r5', true, mm);
  check(x.ok === false && x.motivo === 'in_match', 'chi accetta è già in un altro training: in_match', x);
});

sezione('E3. annullo e letture', async (db) => {
  const leggi = (sid) => chiama(db, 'get_my_telepathy_invites', { p_session_id: sid, p_password_hash: null });
  const unoSolo = (id, sid) => chiama(db, 'get_telepathy_invite', { p_invite_id: id, p_session_id: sid, p_password_hash: null });
  const annulla = (id, sid) => chiama(db, 'cancel_telepathy_invite', { p_invite_id: id, p_session_id: sid, p_password_hash: null });
  await disp(db, 'b', 'B');
  const r = await invia(db, 'a', 'A', { disp: await idDisp(db, 'b') });
  let x = await annulla(r.id, 'b');
  check(x.ok === false && x.motivo === 'non_trovato', 'annulla solo il mittente', x);
  const perB = await leggi('b');
  check(!!perB.in_arrivo && perB.in_arrivo.from_id === 'a' && perB.in_arrivo.nome === 'A', 'il destinatario riceve from_id dell\'invito pending', perB.in_arrivo);
  check('responded_at' in perB.in_arrivo && 'match_id' in perB.in_arrivo && perB.in_arrivo.responded_at === null && perB.in_arrivo.match_id === null,
    'in_arrivo porta anche responded_at e match_id (C10, spec §4.1.7)', perB.in_arrivo);
  const perA = await leggi('a');
  check(!!perA.in_uscita && perA.in_uscita.nome === 'B' && !('to_id' in perA.in_uscita) && !JSON.stringify(perA).includes('"b"'),
    'il mittente non riceve mai il to_id', perA);
  check(typeof perA.adesso === 'string' && !Number.isNaN(Date.parse(perA.adesso)), 'torna l\'ora del server', perA.adesso);
  x = await unoSolo(r.id, 'c');
  check(x.ok === false && x.motivo === 'non_trovato', 'get_telepathy_invite di un invito non mio: non trovato', x);
  x = await unoSolo(r.id, 'b');
  check(x.ok === true && x.invito.ruolo === 'destinatario' && x.invito.from_id === 'a', 'dal destinatario, pending: from_id presente', x);
  x = await unoSolo(r.id, 'a');
  check(x.ok === true && x.invito.ruolo === 'mittente' && x.invito.nome === 'B' && !JSON.stringify(x).includes('"b"') && x.invito.from_id == null,
    'dal mittente: ruolo mittente, nome del destinatario, nessun to_id', x);
  x = await annulla(r.id, 'a');
  check(x.ok === true, 'il mittente annulla', x);
  x = await annulla(r.id, 'a');
  check(x.ok === false && x.motivo === 'non_trovato', 'annullare due volte: non_trovato', x);
  x = await unoSolo(r.id, 'b');
  check(x.invito.status === 'cancelled' && x.invito.from_id == null, 'annullato: niente più from_id', x.invito);
  const r2 = await invia(db, 'a', 'A', { disp: await idDisp(db, 'b') });
  await db.query(`UPDATE telepathy_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, [r2.id]);
  await leggi('a');
  check((await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [r2.id])).status === 'expired', 'get_my segna expired gli scaduti');
  // Accettato: match vivo, poi chiuso.
  await disp(db, 'd', 'D');
  const r3 = await invia(db, 'c2', 'C2', { disp: await idDisp(db, 'd') });
  const m = await nuovoMatch(db, 'c2', 'd');
  await rispondi(db, r3.id, 'd', true, m);
  x = await unoSolo(r3.id, 'c2');
  check(x.invito.status === 'accepted' && x.invito.match_id === m && x.invito.match_attivo === true, 'accettato: match_id e match_attivo', x.invito);
  await db.query(`UPDATE telepathy_matches SET ended_at = now() WHERE id = $1`, [m]);
  x = await unoSolo(r3.id, 'c2');
  check(x.invito.match_attivo === false, 'match chiuso: match_attivo false', x.invito);
});

sezione('E4. «Non voglio più inviti da questa persona»', async (db) => {
  const blocca = (sid, a) => chiama(db, 'block_telepathy_inviter', { p_session_id: sid, p_password_hash: null,
    p_invite_id: a.invito || null, p_disponibilita_id: a.disp || null, p_session_online: a.online || null });
  const bloccoC = (da, a) => uno(db, `SELECT 1 AS x FROM telepathy_invite_blocks WHERE blocker_session = $1 AND blocked_session = $2`, [da, a]);
  await disp(db, 'vit', 'Vit');
  const r = await invia(db, 'dis', 'Dis', { disp: await idDisp(db, 'vit') });
  let x = await blocca('dis', { invito: r.id });
  check(x.ok === false && x.motivo === 'non_trovato', 'con l\'invito non blocca il mittente', x);
  x = await blocca('terzo', { invito: r.id });
  check(x.ok === false && x.motivo === 'non_trovato', 'né un terzo', x);
  const n0 = await chiamateMotore(db);
  x = await blocca('vit', { invito: r.id });
  check(x.ok === true, 'il destinatario blocca dall\'invito', x);
  const st = await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [r.id]);
  check(st.status === 'declined' && await chiamateMotore(db) === n0, 'l\'invito aperto si chiude come rifiutato, senza push', st);
  await disp(db, 'dis', 'Dis');
  const lv = await righe(db, `SELECT nickname FROM get_invitable_users('vit', NULL, 'Vit')`);
  const ld = await righe(db, `SELECT nickname FROM get_invitable_users('dis', NULL, 'Dis')`);
  check(!lv.some((u) => u.nickname === 'Dis') && !ld.some((u) => u.nickname === 'Vit'), 'da lì non si vedono più, nei due sensi', { lv, ld });
  const r3 = await invia(db, 'dis', 'Dis', { disp: await idDisp(db, 'vit') });
  check(r3.ok === false && r3.motivo === 'non_disponibile', 'e non si possono invitare', r3);
  await disp(db, 'z1', 'Z1');
  x = await blocca('osp1', { disp: await idDisp(db, 'z1') });
  check(x.ok === true && !!(await bloccoC('osp1', 'z1')), 'blocco con l\'id opaco, da ospite', x);
  await online(db, 'z2', 'Z2');
  x = await blocca('osp1', { online: 'z2' });
  check(x.ok === true && !!(await bloccoC('osp1', 'z2')), 'blocco con il session_id di chi è online', x);
  await online(db, 'z3', 'Z3', 31);
  x = await blocca('osp1', { online: 'z3' });
  check(x.ok === false && x.motivo === 'non_trovato', 'online da più di 30 s: non trovato', x);
  x = await blocca('osp1', {});
  check(x.ok === false && x.motivo === 'dati_non_validi', 'nessun parametro: dati_non_validi', x);
});

// Ruling C7: ogni RPC con identità respinge la credenziale sbagliata di un iscritto, senza cambiare nulla.
sezione('E5. credenziale sbagliata: Auth failed e nessuna modifica', async (db) => {
  const sbagliata = async (p) => { const m = await errore(p); return !!m && m.includes('Auth failed'); };
  const stato = async (id) => (await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [id])).status;
  // Elena, iscritta, è la destinataria di un invito.
  await iscritto(db, 'regE', 'Elena', 'hE');
  await abbonamento(db, 'regE');
  await chiama(db, 'set_telepathy_availability', { p_session_id: 'regE', p_password_hash: 'hE', p_nickname: null, p_enabled: true });
  const dall = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'regE') });
  check(dall.ok === true, 'invito di prova verso un\'iscritta', dall);
  const mt = await nuovoMatch(db, 'mitt', 'regE');
  check(await sbagliata(rispondi(db, dall.id, 'regE', true, mt, 'xx')), 'respond (accetta): credenziale sbagliata, Auth failed');
  check(await sbagliata(rispondi(db, dall.id, 'regE', false, null, 'xx')), 'respond (rifiuta): credenziale sbagliata, Auth failed');
  check(await stato(dall.id) === 'pending', 'respond: l\'invito resta pending e nessuna push chiesta', await stato(dall.id));
  check(await sbagliata(chiama(db, 'get_my_telepathy_invites', { p_session_id: 'regE', p_password_hash: 'xx' })), 'get_my_telepathy_invites: Auth failed');
  check(await sbagliata(chiama(db, 'get_telepathy_invite', { p_invite_id: dall.id, p_session_id: 'regE', p_password_hash: 'xx' })), 'get_telepathy_invite: Auth failed');
  check(await sbagliata(chiama(db, 'block_telepathy_inviter', { p_session_id: 'regE', p_password_hash: 'xx', p_invite_id: dall.id })), 'block_telepathy_inviter: Auth failed');
  check(!(await uno(db, `SELECT 1 AS x FROM telepathy_invite_blocks WHERE blocker_session = 'regE'`)) && await stato(dall.id) === 'pending',
    'block: nessun blocco scritto, invito invariato');
  // Annullo: Franca, iscritta, è la mittente.
  await iscritto(db, 'regF', 'Franca', 'hF');
  await disp(db, 'dest2', 'Dest2');
  const dalF = await chiama(db, 'send_telepathy_invite', { p_session_id: 'regF', p_password_hash: 'hF', p_nickname: null,
    p_disponibilita_id: await idDisp(db, 'dest2'), p_session_online: null });
  check(dalF.ok === true, 'invito di prova da un\'iscritta', dalF);
  check(await sbagliata(chiama(db, 'cancel_telepathy_invite', { p_invite_id: dalF.id, p_session_id: 'regF', p_password_hash: 'xx' })), 'cancel: Auth failed');
  check(await stato(dalF.id) === 'pending', 'cancel: l\'invito resta pending');
  const ok = await chiama(db, 'cancel_telepathy_invite', { p_invite_id: dalF.id, p_session_id: 'regF', p_password_hash: 'hF' });
  check(ok.ok === true && await stato(dalF.id) === 'cancelled', 'con la credenziale giusta l\'annullo funziona', ok);
});

// ════ F. Scadenze, account, cron, rilancio e ritorno (Task 12) ═════════════
sezione('F1. scadenze e pulizia', async (db) => {
  const scaduti = async () => (await righe(db, `SELECT * FROM expire_telepathy_invites()`)).map((x) => x.invito_id);
  await disp(db, 's1', 'S1');
  await online(db, 's2', 'S2');
  const lungo = await invia(db, 'm1', 'M1', { disp: await idDisp(db, 's1') });
  const breve = await invia(db, 'm2', 'M2', { online: 's2' });
  // Si sposta indietro anche created_at: expires_at - created_at deve restare la durata vera
  // dell'invito (10 minuti / 45 s), è quello che distingue gli inviti che meritano la push «scaduto».
  await db.query(`UPDATE telepathy_invites SET created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' WHERE id = $1`, [lungo.id]);
  await db.query(`UPDATE telepathy_invites SET created_at = now() - interval '46 seconds', expires_at = now() - interval '1 second' WHERE id = $1`, [breve.id]);
  let ids = await scaduti();
  check(ids.includes(lungo.id) && !ids.includes(breve.id), 'restituisce solo gli scaduti da 10 minuti', ids);
  check((await righe(db, `SELECT status FROM telepathy_invites WHERE id IN ($1, $2)`, [lungo.id, breve.id])).every((x) => x.status === 'expired'),
    'e li segna tutti expired');
  await disp(db, 's3', 'S3');
  const altro = await invia(db, 'm3', 'M3', { disp: await idDisp(db, 's3') });
  await db.query(`UPDATE telepathy_invites SET created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' WHERE id = $1`, [altro.id]);
  await chiama(db, 'get_my_telepathy_invites', { p_session_id: 's3', p_password_hash: null });
  ids = await scaduti();
  check(ids.includes(altro.id), 'uno scaduto segnato da get_my torna lo stesso (la push «scaduto» non si perde)', ids);
  // Un invito vivo non si tocca; uno chiuso da più di dieci minuti non torna più.
  await disp(db, 's4', 'S4');
  const vivo = await invia(db, 'm4', 'M4', { disp: await idDisp(db, 's4') });
  await db.query(`UPDATE telepathy_invites SET responded_at = now() - interval '11 minutes' WHERE id = $1`, [altro.id]);
  ids = await scaduti();
  check(!ids.includes(vivo.id) && !ids.includes(altro.id), 'un invito vivo non torna, uno chiuso da più di 10 minuti nemmeno', ids);
  check((await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [vivo.id])).status === 'pending', 'l\'invito vivo resta pending');
  await db.query(`UPDATE telepathy_invites SET responded_at = now() - interval '25 hours' WHERE id = $1`, [breve.id]);
  await db.query(`INSERT INTO telepathy_availability (session_id, nickname, rinnovata_il) VALUES
    ('v20', 'V20', now() - interval '20 days'), ('v91', 'V91', now() - interval '91 days')`);
  await scaduti();
  check(!(await uno(db, `SELECT 1 AS x FROM telepathy_invites WHERE id = $1`, [breve.id])), 'le righe chiuse da più di un giorno si cancellano');
  const rimaste = (await righe(db, `SELECT session_id FROM telepathy_availability WHERE session_id IN ('v20', 'v91')`)).map((x) => x.session_id);
  check(JSON.stringify(rimaste) === '["v20"]', 'disponibilità: a 20 giorni resta (è solo fuori lista), a 91 si cancella', rimaste);
  const mA = await errore(comeAnon(db, () => db.query(`SELECT * FROM expire_telepathy_invites()`)));
  check(!!mA && /permission denied/i.test(mA), 'anon non può chiamare expire_telepathy_invites', mA);
});

sezione('F2. cancellare ed esportare l\'account', async (db) => {
  await iscritto(db, 'via', 'Via', 'hv');
  await abbonamento(db, 'via');
  await chiama(db, 'set_telepathy_availability', { p_session_id: 'via', p_password_hash: 'hv', p_nickname: null, p_enabled: true });
  await disp(db, 'amica', 'Amica');
  const inv = await chiama(db, 'send_telepathy_invite', { p_session_id: 'via', p_password_hash: 'hv', p_nickname: null,
    p_disponibilita_id: await idDisp(db, 'amica'), p_session_online: null });
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('via', 'x1'), ('x2', 'via')`);
  // Quello che la 31_ (e le precedenti) già facevano: lo si prepara qui per provare che c'è ancora.
  await online(db, 'via', 'Via');
  await db.query(`INSERT INTO telepathy_queue (id, nickname) VALUES ('via', 'Via')`);
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Via', 'Altro'), ('Altro', 'Via')`);
  await db.query(`INSERT INTO rituals (creator, creator_id, name, type, sacred_number, date, time, duration, participants, candles)
    VALUES ('Via', 'via', 'R', 'x', 3, '2099-01-01', '10:00', 10, '["via", "resta"]', '["via", "resta"]')`);
  const exp = (await uno(db, `SELECT export_my_account('Via', 'hv') AS e`)).e;
  check(exp.telepathy_invites.length === 1 && exp.telepathy_invites[0].ruolo === 'mittente' && exp.telepathy_invites[0].altra_persona === 'Amica',
    'export: gli inviti, con ruolo e nome dell\'altra persona', exp.telepathy_invites);
  check(!!exp.telepathy_availability && exp.telepathy_availability.nickname === 'Via' && exp.telepathy_invite_blocks.length === 1,
    'export: la disponibilità e i blocchi impostati da me', exp);
  const testo = JSON.stringify({ i: exp.telepathy_invites, b: exp.telepathy_invite_blocks });
  check(!testo.includes('amica') && !testo.includes('x1'), 'export: nessun session_id altrui', testo);
  check(exp.push_subscriptions.length === 1 && exp.rituals_created.length === 1 && !!exp.profile && !('password_hash' in exp.profile),
    'export: le voci di prima ci sono ancora (push, rituali, profilo senza password)', Object.keys(exp));
  const mAF = await errore(db.query(`SELECT export_my_account('Via', 'sbagliata')`));
  check(!!mAF && /Auth failed/.test(mAF), 'export: credenziale sbagliata, Auth failed', mAF);
  await db.query(`SELECT delete_my_account('Via', 'hv')`);
  check(!(await uno(db, `SELECT 1 AS x FROM telepathy_availability WHERE session_id = 'via'`)), 'delete: la disponibilità se ne va');
  const bl = await righe(db, `SELECT blocker_session FROM telepathy_invite_blocks WHERE 'via' IN (blocker_session, blocked_session)`);
  check(JSON.stringify(bl.map((x) => x.blocker_session)) === '["x2"]', 'delete: via i blocchi impostati da me, restano quelli subiti', bl);
  check(!(await uno(db, `SELECT 1 AS x FROM telepathy_invites WHERE id = $1`, [inv.id])), 'delete: gli inviti se ne vanno (come dalla 06_)');
  // Il comportamento di prima (31_ e precedenti) è intatto.
  check(!(await uno(db, `SELECT 1 AS x FROM profiles WHERE session_id = 'via'`)), 'delete: il profilo se ne va');
  check(!(await uno(db, `SELECT 1 AS x FROM push_subscriptions WHERE session_id = 'via'`)), 'delete: gli abbonamenti push se ne vanno (22_)');
  check(!(await uno(db, `SELECT 1 AS x FROM online_users WHERE id = 'via'`)) && !(await uno(db, `SELECT 1 AS x FROM telepathy_queue WHERE id = 'via'`)),
    'delete: via da online e dalla coda');
  const ub = await righe(db, `SELECT blocker_nickname FROM user_blocks`);
  check(JSON.stringify(ub.map((x) => x.blocker_nickname)) === '["Altro"]', 'delete: user_blocks, via i miei e restano i subiti (18_)', ub);
  const r = await uno(db, `SELECT creator, participants, candles FROM rituals`);
  check(r.creator === 'Utente eliminato' && JSON.stringify(r.participants) === '["resta"]' && JSON.stringify(r.candles) === '["resta"]',
    'delete: rituale anonimizzato, via candela e partecipazione, resta chi c\'era (30_/31_)', r);
  const corpo = (await uno(db, `SELECT prosrc FROM pg_proc WHERE proname = 'delete_my_account'`)).prosrc;
  check(corpo.includes('NUOVO (31)') && corpo.includes('DELETE FROM ritual_presence WHERE session_id = v_sid') && corpo.includes('NUOVO (32)'),
    'delete_my_account: il corpo della 31_ più il blocco 32');
});

sezione('F3. un solo job, due chiamate', async (db) => {
  const job = await uno(db, `SELECT schedule, command FROM cron.job WHERE jobname = 'notify-ritual-start'`);
  check(job.schedule === '* * * * *', 'stesso orario', job.schedule);
  check(job.command.includes('/functions/v1/notify-ritual-start') && job.command.includes('/functions/v1/notify-telepathy-invite')
    && job.command.includes('"tipo":"scadenze"'), 'lo stesso job chiama le due funzioni', job.command);
  check(!job.command.includes('\r') && !new RegExp('service.?' + 'role', 'i').test(job.command), 'nessun ritorno a capo di Windows, nessuna chiave privilegiata');
  check((await uno(db, `SELECT count(*)::int n FROM cron.job WHERE jobname = 'notify-ritual-start'`)).n === 1, 'un solo job con quel nome');
  // La prima chiamata è quella della 23_, parola per parola (spazi a parte).
  const f23 = require('fs').readFileSync('supabase/sql/23_cron_push.sql', 'utf8').replace(/\r\n/g, '\n');
  const m23 = f23.match(/'notify-ritual-start',\s*'\* \* \* \* \*',\s*\$job\$([\s\S]*?)\$job\$/);
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  check(!!m23 && norm(job.command).startsWith(norm(m23[1]).replace(/;$/, ';')), 'la chiamata a notify-ritual-start è quella della 23_, invariata');
  // I corpi: {} per il rituale; {"tipo":"scadenze"} per la funzione nuova, come lo legge leggiRichiesta.
  const corpi = [...job.command.matchAll(/body\s*:=\s*'([^']*)'::jsonb/g)].map((x) => JSON.parse(x[1]));
  check(corpi.length === 2 && JSON.stringify(corpi[0]) === '{}' && JSON.stringify(corpi[1]) === '{"tipo":"scadenze"}', 'i due corpi: {} e {"tipo":"scadenze"}', corpi);
  const { leggiRichiesta } = await import('./supabase/functions/notify-telepathy-invite/decisioni.mjs');
  check(JSON.stringify(leggiRichiesta(corpi[1])) === '{"tipo":"scadenze"}', 'leggiRichiesta capisce il corpo del cron');
  // «scaduto» non è un tipo che arriva da fuori: la push ai mittenti nasce solo da {tipo:'scadenze'}, quindi
  // il database non manda mai {tipo:'scaduto', invito} (leggiRichiesta lo scarterebbe).
  check(leggiRichiesta({ tipo: 'scaduto', invito: '11111111-2222-3333-4444-555555555555' }) === null, 'nessuna chiamata per singolo invito «scaduto»: il tipo non esiste per leggiRichiesta');
});

sezione('F4. rilancio e ritorno indietro', async (db) => {
  check(!(await errore(applicaFile(db, F32A))), '32a rilanciata: nessun errore');
  const firme = await righe(db, `SELECT proname, count(*)::int n FROM pg_proc WHERE proname IN ('send_telepathy_invite', 'get_invitable_users',
    'get_invite_card', 'respond_telepathy_invite', 'block_telepathy_inviter', 'set_telepathy_availability', 'renew_telepathy_availability',
    'cancel_telepathy_invite', 'get_my_telepathy_invites', 'get_telepathy_invite', 'expire_telepathy_invites') GROUP BY 1`);
  check(firme.length === 11 && firme.every((f) => f.n === 1), 'undici RPC, una firma ciascuna', firme);
  check((await uno(db, `SELECT count(*)::int n FROM cron.job WHERE jobname = 'notify-ritual-start'`)).n === 1, 'rilancio: sempre un solo job');
  check(!(await errore(applicaFile(db, 'supabase/sql/32a_ritorno.sql'))), '32a_ritorno si applica');
  check(!(await errore(applicaFile(db, 'supabase/sql/32a_ritorno.sql'))), '32a_ritorno si applica anche due volte (idempotente)');
  const nullable = async () => (await uno(db, `SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'telepathy_invites' AND column_name = 'status'`)).is_nullable;
  check((await nullable()) === 'YES', 'il ritorno toglie anche il NOT NULL su status (forma di prima della 32a)');
  await comeAnon(db, () => db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name) VALUES ('old', 'Old', 'dup', 'Dup'), ('old2', 'Old2', 'dup', 'Dup')`));
  check((await uno(db, `SELECT count(*)::int n FROM telepathy_invites WHERE to_id = 'dup' AND status = 'pending'`)).n === 2,
    'dopo il ritorno le app vecchie scrivono come prima della 32a (anche due pending per destinatario)');
  check(!(await errore(applicaFile(db, F32A))), 'dopo il ritorno la 32a si riapplica, normalizzando i doppioni');
  check((await uno(db, `SELECT count(*)::int n FROM telepathy_invites WHERE to_id = 'dup' AND status = 'pending'`)).n === 1,
    'dopo il rilancio resta un solo pending per destinatario (il più recente)');
  const idx = await righe(db, `SELECT indexname FROM pg_indexes WHERE tablename = 'telepathy_invites' AND indexname LIKE 'telepathy_invites_un_pending_%'`);
  check(idx.length === 2, 'gli indici unici sono tornati', idx);
  check((await nullable()) === 'NO', 'dopo il rilancio status è di nuovo NOT NULL');
});

// Pendenza del Task 7: il rilancio dopo il ritorno non è una «prima applicazione».
sezione('F5. rilancio dopo il ritorno: gli inviti vivi restano vivi', async (db) => {
  await disp(db, 'r1', 'R1');
  await online(db, 'm9', 'M9');
  const vivo = await invia(db, 'm9', 'M9', { disp: await idDisp(db, 'r1') });
  const prima = await uno(db, `SELECT status, expires_at::text AS e FROM telepathy_invites WHERE id = $1`, [vivo.id]);
  check(prima.status === 'pending', 'invito da 10 minuti vivo prima del ritorno', prima);
  check(!(await errore(applicaFile(db, 'supabase/sql/32a_ritorno.sql'))), '32a_ritorno applicato');
  check(!(await errore(applicaFile(db, F32A))), '32a riapplicata');
  const dopo = await uno(db, `SELECT status, expires_at::text AS e, extract(epoch FROM expires_at - created_at)::int AS s FROM telepathy_invites WHERE id = $1`, [vivo.id]);
  check(dopo.status === 'pending' && dopo.e === prima.e && dopo.s === 600, 'il rilancio lascia pending e con lo stesso expires_at l\'invito vivo', dopo);
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
