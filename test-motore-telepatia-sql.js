/**
 * Motore della telepatia chiuso (39a, poi 39b) — lato SQL, su Postgres locale.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-motore-telepatia-sql.js
 *
 * Niente Supabase: PGlite con lo schema del catalogo (scripts/pg-locale.js) e le migration vere.
 * Ogni sezione gira su un database nuovo.
 */
const { creaDbTelepatia, applicaFile, F39A, F39B } = require('./scripts/pg-locale');
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
const pub = (db, sid) => uno(db, `SELECT id_pubblico($1) AS r`, [sid]).then((r) => r.r);

const sezioni = [];
const sezione = (nome, fn, opzioni = { con35a: true, con36a: true, con36b: true, con39a: true }) => sezioni.push([nome, fn, opzioni]);

const IO = (sid, pw = null) => ({ p_session_id: sid, p_password_hash: pw });
// Una partita scritta direttamente (come farebbe un'app vecchia), con gli id pubblici.
const partita = async (db, sidA, sidB, campi = {}) => {
  const c = { user1_id: await pub(db, sidA), user1_nickname: 'Ada', user1_role: 'sender',
              user2_id: await pub(db, sidB), user2_nickname: 'Bea', user2_role: 'receiver', level: 'lvl3', round_count: 0, ...campi };
  const k = Object.keys(c);
  return (await uno(db, `INSERT INTO telepathy_matches (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, k.map((x) => c[x]))).id;
};

sezione('F1. chat legata alla partita', async (db) => {
  await db.query(`INSERT INTO telepathy_chat (match_id, sender_name, content) VALUES ('non-un-uuid', 'X', 'a'), (gen_random_uuid()::text, 'Y', 'b')`);
  await applicaFile(db, 'supabase/sql/14_telepathy_session_end.sql');
  await applicaFile(db, F39A);
  check((await righe(db, `SELECT 1 FROM telepathy_chat`)).length === 0, 'la 39a toglie i messaggi orfani (anche con match_id non uuid)');
  check(!(await errore(applicaFile(db, F39A))), 'la 39a si riapplica senza errori');
  const m = await partita(db, 'sidA', 'sidB');
  await db.query(`INSERT INTO telepathy_chat (match_id, sender_name, content) VALUES ($1, 'Ada', 'ciao')`, [m]);
  await db.query(`DELETE FROM telepathy_matches WHERE id = $1`, [m]);
  check((await righe(db, `SELECT 1 FROM telepathy_chat`)).length === 0, 'cancellando la partita sparisce anche la chat');
  const tipo = await uno(db, `SELECT data_type FROM information_schema.columns WHERE table_name = 'telepathy_chat' AND column_name = 'match_id'`);
  check(tipo.data_type === 'uuid', 'match_id è uuid', tipo);
  const e = await comeAnon(db, () => errore(db.query(`INSERT INTO telepathy_chat (match_id, sender_name, content) VALUES (gen_random_uuid(), 'X', 'y')`)));
  check(e !== null, 'non si scrive chat per una partita inesistente', e);
}, { con35a: true, con36a: true, con36b: true, con39a: false });

sezione('F2. vista: simbolo nascosto a chi indovina', async (db) => {
  const m = await partita(db, 'sidA', 'sidB', { sender_symbol: 'stella' });   // round 0: A manda, B indovina
  const vA = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidA'), p_match_id: m }));
  const vB = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidB'), p_match_id: m }));
  check(vA.sender_symbol === 'stella', 'chi manda vede il proprio simbolo', vA);
  check(vB.sender_symbol === null && vB.simbolo_inviato === true, 'chi indovina: simbolo nascosto, ma sa che è stato inviato', vB);
  await db.query(`UPDATE telepathy_matches SET receiver_guess = 'luna' WHERE id = $1`, [m]);
  const vB2 = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidB'), p_match_id: m }));
  check(vB2.sender_symbol === 'stella' && vB2.receiver_guess === 'luna', 'dopo la risposta il simbolo arriva a entrambi', vB2);
  // Round 3: i ruoli si scambiano. Ora B manda, A indovina.
  await db.query(`UPDATE telepathy_matches SET round_count = 3, sender_symbol = 'sole', receiver_guess = NULL WHERE id = $1`, [m]);
  const vA3 = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidA'), p_match_id: m }));
  const vB3 = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidB'), p_match_id: m }));
  check(vA3.sender_symbol === null && vB3.sender_symbol === 'sole', 'round 3: ruoli scambiati, nascosto ad A', { vA3, vB3 });
  // Round 2 (ultimo del primo blocco): ancora A manda.
  await db.query(`UPDATE telepathy_matches SET round_count = 2 WHERE id = $1`, [m]);
  const vB2b = await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidB'), p_match_id: m }));
  check(vB2b.sender_symbol === null, 'round 2: B indovina ancora', vB2b);
  const chiavi = Object.keys(vA).sort().join(',');
  check(chiavi === 'created_at,da_invito,ended_at,ended_by,giocato,id,level,level_change_choice_sender,receiver_guess,round_count,sender_symbol,simbolo_inviato,user1_id,user1_nickname,user1_role,user2_id,user2_nickname,user2_role',
    "la vista ha esattamente le colonne dell'app più simbolo_inviato", chiavi);
});

sezione('F3. estranei e identità', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  check(await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidC'), p_match_id: m })) === null, 'un estraneo non vede la partita');
  check(await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidA'), p_match_id: '00000000-0000-0000-0000-000000000000' })) === null, 'partita inesistente: stessa risposta');
  const pubA = await pub(db, 'sidA');
  check(await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO(pubA), p_match_id: m })) === null, 'un id pubblico al posto del session_id non vale');
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('sidR', 'Rosa', 'r@test.com', 'h1')`);
  const mR = await partita(db, 'sidR', 'sidB');
  check(await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidR', 'sbagliata'), p_match_id: mR })) === null, 'iscritta con password sbagliata: null, nessun errore');
  check((await comeAnon(db, () => chiama(db, 'partita_stato', { ...IO('sidR', 'h1'), p_match_id: mR }))).id === mR, 'iscritta con password giusta: vede');
});

sezione('F4. partita_mia e pulizia', async (db) => {
  check(await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidA'))) === null, 'nessuna partita: null');
  const m = await partita(db, 'sidA', 'sidB');
  check((await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidB')))).id === m, 'B trova la partita creata per lui');
  // Il trigger della 32a rimette giocato = true a ogni update: per simulare l'orfano lo si spegne un attimo.
  await db.query(`ALTER TABLE telepathy_matches DISABLE TRIGGER telepathy_matches_attivita`);
  await db.query(`UPDATE telepathy_matches SET da_invito = true, giocato = false WHERE id = $1`, [m]);
  await db.query(`ALTER TABLE telepathy_matches ENABLE TRIGGER telepathy_matches_attivita`);
  check(await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidB'))) === null, "un orfano d'invito mai giocato non è «la mia partita»");
  await db.query(`DELETE FROM telepathy_matches`);
  const chiusa = await partita(db, 'sidA', 'sidB');
  await db.query(`UPDATE telepathy_matches SET ended_at = now() - interval '61 seconds' WHERE id = $1`, [chiusa]);
  const ferma = await partita(db, 'sidC', 'sidD');
  await db.query(`ALTER TABLE telepathy_matches DISABLE TRIGGER telepathy_matches_attivita`);
  await db.query(`UPDATE telepathy_matches SET ultima_attivita = now() - interval '11 minutes', giocato = true WHERE id = $1`, [ferma]);
  const orfana = await partita(db, 'sidE', 'sidF');
  await db.query(`UPDATE telepathy_matches SET created_at = now() - interval '6 minutes', giocato = false WHERE id = $1`, [orfana]);
  const lunga = await partita(db, 'sidG', 'sidH');
  await db.query(`UPDATE telepathy_matches SET created_at = now() - interval '20 minutes', giocato = true WHERE id = $1`, [lunga]);
  await db.query(`ALTER TABLE telepathy_matches ENABLE TRIGGER telepathy_matches_attivita`);
  await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidZ')));
  const resta = (await righe(db, `SELECT id FROM telepathy_matches`)).map((r) => r.id);
  check(JSON.stringify(resta) === JSON.stringify([lunga]), 'pulizia: via chiuse >60 s, ferme >10 min, orfane >5 min; resta il training lungo ma attivo', resta);
});

const inCoda = (db, sid, nick, secondiFa = 0) => db.query(
  `INSERT INTO telepathy_queue (id, nickname, timestamp) VALUES ($1, $2, (extract(epoch FROM clock_timestamp()) * 1000)::bigint - $3)`,
  [sid, nick, secondiFa * 1000]);
const crea = (db, sid, nick, altroSid) => pub(db, altroSid).then((altro) =>
  comeAnon(db, () => chiama(db, 'partita_crea_da_coda', { ...IO(sid), p_nickname: nick, p_altro: altro })));

sezione('N1. abbinamento dalla coda', async (db) => {
  await inCoda(db, 'sidA', 'Ada');
  const r = await crea(db, 'sidB', 'Bea', 'sidA');
  check(r.ok === true && r.partita.user1_id === await pub(db, 'sidA') && r.partita.user2_id === await pub(db, 'sidB'), 'B abbina A: user1 = chi era in coda', r);
  check(r.partita.user1_nickname === 'Ada' && r.partita.user2_nickname === 'Bea', 'nickname verificati', r.partita);
  check(new Set([r.partita.user1_role, r.partita.user2_role]).size === 2 && ['sender', 'receiver'].includes(r.partita.user1_role), 'ruoli opposti', r.partita);
  check(r.partita.level === 'lvl3' && r.partita.round_count === 0 && r.partita.giocato === false, 'parte da lvl3, round 0, non giocata', r.partita);
  check((await righe(db, `SELECT 1 FROM telepathy_queue`)).length === 0, 'tutti e due escono dalla coda');
  const r2 = await crea(db, 'sidB', 'Bea', 'sidA');
  check(r2.ok === true && r2.partita.id === r.partita.id, 'un secondo giro restituisce la stessa partita (niente doppioni)', r2);
  check((await comeAnon(db, () => chiama(db, 'partita_mia', IO('sidA')))).id === r.partita.id, 'A la trova con partita_mia');
});

sezione('N2. abbinamento rifiutato', async (db) => {
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'non_in_coda', 'chi non è in coda non si abbina');
  await inCoda(db, 'sidA', 'Ada', 61);
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'non_in_coda', 'riga di coda vecchia di 61 s: non vale');
  await db.query(`DELETE FROM telepathy_queue`);
  await inCoda(db, 'sidA', 'Ada');
  await partita(db, 'sidA', 'sidC');
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'occupato', 'A è già in partita con C: occupato');
  await db.query(`DELETE FROM telepathy_matches`);
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Ada', 'Bea')`);
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'bloccato', 'blocco fra i due: niente partita');
  await db.query(`DELETE FROM user_blocks`);
  check((await crea(db, 'sidA', 'Ada', 'sidA')).motivo === 'dati_non_validi', 'non ci si abbina con sé stessi');
  check((await comeAnon(db, () => chiama(db, 'partita_crea_da_coda', { ...IO('sidB'), p_nickname: 'Bea', p_altro: null }))).motivo === 'dati_non_validi', 'altro mancante');
});

sezione('N3. stessa coppia subito dopo una partita chiusa', async (db) => {
  const vecchia = await partita(db, 'sidA', 'sidB');
  await db.query(`UPDATE telepathy_matches SET ended_at = now() WHERE id = $1`, [vecchia]);
  await inCoda(db, 'sidA', 'Ada');
  const r = await crea(db, 'sidB', 'Bea', 'sidA');
  check(r.ok === true && r.partita.id !== vecchia, 'la partita chiusa da pochi secondi non blocca la nuova', r);
});

const invita = async (db, daSid, daNome, aSid, aNome) => (await uno(db,
  `INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, expires_at) VALUES ($1, $2, $3, $4, 'pending', now() + interval '45 seconds') RETURNING id`,
  [daSid, daNome, aSid, aNome])).id;

sezione('N4. invito accettato: la partita la crea il server', async (db) => {
  const inv = await invita(db, 'sidA', 'Ada', 'sidB', 'Bea');
  const r = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv, ...IO('sidB') }));
  check(r.ok === true && r.status === 'accepted' && r.partita && r.partita.da_invito === true, 'accettato, partita da invito', r);
  check(r.partita.user1_id === await pub(db, 'sidA') && r.partita.user2_nickname === 'Bea', 'user1 = chi invita, user2 = chi accetta', r.partita);
  const i = await uno(db, `SELECT status, match_id FROM telepathy_invites WHERE id = $1`, [inv]);
  check(i.status === 'accepted' && i.match_id === r.partita.id, 'l\'invito punta alla partita', i);
  const e = await comeAnon(db, () => chiama(db, 'partita_entra', { ...IO('sidA'), p_match_id: r.partita.id }));
  check(e.ok === true && e.partita.giocato === true, 'chi ha invitato entra: la partita risulta giocata', e);
  check((await comeAnon(db, () => chiama(db, 'partita_entra', { ...IO('sidC'), p_match_id: r.partita.id }))).ok === false, 'un estraneo non entra');
});

sezione('N5. invito non più valido: nessuna partita resta', async (db) => {
  const inv = await invita(db, 'sidA', 'Ada', 'sidB', 'Bea');
  await db.query(`UPDATE telepathy_invites SET status = 'cancelled' WHERE id = $1`, [inv]);
  const r = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv, ...IO('sidB') }));
  check(r.ok === false && r.motivo === 'annullato', 'invito annullato: il motivo lo dice respond_telepathy_invite', r);
  check((await righe(db, `SELECT 1 FROM telepathy_matches`)).length === 0, 'nessuna partita rimasta');
  const inv2 = await invita(db, 'sidA', 'Ada', 'sidB', 'Bea');
  const r2 = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv2, ...IO('sidC') }));
  check(r2.ok === false && r2.motivo === 'non_trovato', 'un invito non mio: non_trovato', r2);
  // Il trigger della 32a mette giocato = false a ogni INSERT: si segna giocata con un UPDATE.
  const mD = await partita(db, 'sidA', 'sidD');
  await db.query(`UPDATE telepathy_matches SET giocato = true WHERE id = $1`, [mD]);
  const r3 = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv2, ...IO('sidB') }));
  check(r3.ok === false && r3.motivo === 'in_match', 'chi ha invitato è in training: in_match, e la partita appena creata sparisce', r3);
  check((await righe(db, `SELECT 1 FROM telepathy_matches WHERE da_invito`)).length === 0, 'nessun orfano d\'invito');
});

sezione('N6. coda e invito non si sovrappongono', async (db) => {
  await inCoda(db, 'sidD', 'Dea');
  const r = await crea(db, 'sidC', 'Cia', 'sidD');
  check(r.ok === true, 'D–C nasce dalla coda', r);
  const inv = await invita(db, 'sidA', 'Ada', 'sidC', 'Cia');
  const a = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv, ...IO('sidC') }));
  check(a.ok === false && a.motivo === 'in_match', 'C è già in partita dalla coda: in_match', a);
  check((await righe(db, `SELECT 1 FROM telepathy_matches`)).length === 1, 'nessuna partita in più');
  await db.query(`DELETE FROM telepathy_matches`);
  await db.query(`DELETE FROM telepathy_invites`);
  const inv2 = await invita(db, 'sidA', 'Ada', 'sidC', 'Cia');
  const b = await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv2, ...IO('sidC') }));
  check(b.ok === true, 'A–C da invito accettato (A non è ancora entrato)', b);
  await inCoda(db, 'sidC', 'Cia');
  check((await crea(db, 'sidB', 'Bea', 'sidC')).motivo === 'occupato', 'B non si abbina a C: occupato');
  await inCoda(db, 'sidE', 'Eva');
  check((await crea(db, 'sidC', 'Cia', 'sidE')).motivo === 'occupato', 'C non si abbina a E: occupato');
  await inCoda(db, 'sidA', 'Ada');
  check((await crea(db, 'sidB', 'Bea', 'sidA')).motivo === 'occupato', 'B non si abbina a chi ha invitato: occupato');
});

const mossa = (db, fn, sid, m, extra = {}) => comeAnon(db, () => chiama(db, fn, { ...IO(sid), p_match_id: m, ...extra }));

sezione('M1. turni del round', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');   // round 0: A manda, B indovina
  check((await mossa(db, 'partita_simbolo', 'sidB', m, { p_simbolo: 'x', p_livello: 'lvl3' })).motivo === 'non_tocca_a_te', 'chi indovina non manda il simbolo');
  check((await mossa(db, 'partita_ipotesi', 'sidB', m, { p_ipotesi: 'x' })).motivo === 'simbolo_mancante', 'niente risposta prima del simbolo');
  check((await mossa(db, 'partita_simbolo', 'sidC', m, { p_simbolo: 'x', p_livello: 'lvl3' })).motivo === 'non_trovata', 'un estraneo: non_trovata');
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'x', p_livello: 'boh' })).motivo === 'dati_non_validi', 'livello sconosciuto: rifiutato');
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'y'.repeat(65), p_livello: 'lvl3' })).motivo === 'dati_non_validi', 'simbolo oltre 64 caratteri: rifiutato');
  const s = await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'stella', p_livello: 'lvl5' });
  check(s.ok === true && s.partita.sender_symbol === 'stella' && s.partita.level === 'lvl5', 'A manda il simbolo (e il livello)', s);
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'luna', p_livello: 'lvl5' })).motivo === 'gia_inviato', 'il simbolo non si cambia');
  check((await mossa(db, 'partita_avanza', 'sidA', m, { p_round_atteso: 0 })).motivo === 'round_incompleto', 'non si avanza senza risposta');
  const g = await mossa(db, 'partita_ipotesi', 'sidB', m, { p_ipotesi: 'luna' });
  check(g.ok === true && g.partita.sender_symbol === 'stella' && g.partita.receiver_guess === 'luna', 'B risponde e vede il simbolo', g);
  check((await mossa(db, 'partita_ipotesi', 'sidB', m, { p_ipotesi: 'sole' })).motivo === 'gia_risposto', 'una sola risposta per round');
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'sole', p_livello: 'lvl5' })).motivo === 'gia_inviato', 'dopo la risposta il simbolo resta quello');
  check((await mossa(db, 'partita_avanza', 'sidB', m, { p_round_atteso: 0 })).motivo === 'non_tocca_a_te', 'avanza solo chi manda');
  const a = await mossa(db, 'partita_avanza', 'sidA', m, { p_round_atteso: 0 });
  check(a.ok === true && a.partita.round_count === 1 && a.partita.sender_symbol === null && a.partita.receiver_guess === null, 'round 1, simboli azzerati', a);
  const a2 = await mossa(db, 'partita_avanza', 'sidA', m, { p_round_atteso: 0 });
  check(a2.ok === true && a2.gia_avanzato === true, 'un doppio invio non salta un round', a2);
  check((await uno(db, `SELECT round_count FROM telepathy_matches WHERE id = $1`, [m])).round_count === 1, 'sul DB resta round 1');
  await db.query(`UPDATE telepathy_matches SET round_count = 3 WHERE id = $1`, [m]);
  check((await mossa(db, 'partita_simbolo', 'sidB', m, { p_simbolo: 'x', p_livello: 'lvl5' })).ok === true, 'round 3: ora manda B');
});

sezione('M2. livello e uscita', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  check((await mossa(db, 'partita_livello', 'sidB', m, { p_livello: 'words', p_scelta: 'r7' })).ok === true, 'un giocatore cambia livello');
  check((await uno(db, `SELECT level, level_change_choice_sender AS c FROM telepathy_matches WHERE id = $1`, [m])).c === 'r7', 'marcatore scritto');
  check((await mossa(db, 'partita_livello', 'sidB', m, { p_livello: 'words', p_scelta: 'x7' })).motivo === 'dati_non_validi', 'marcatore malformato: rifiutato');
  check((await mossa(db, 'partita_livello', 'sidC', m, { p_livello: 'words', p_scelta: 'r7' })).motivo === 'non_trovata', 'un estraneo no');
  await mossa(db, 'partita_esci', 'sidC', m);
  check((await uno(db, `SELECT ended_at FROM telepathy_matches WHERE id = $1`, [m])).ended_at === null, 'un estraneo non chiude la partita');
  await mossa(db, 'partita_esci', 'sidA', m);
  await mossa(db, 'partita_esci', 'sidB', m);
  const e = await uno(db, `SELECT ended_at, ended_by FROM telepathy_matches WHERE id = $1`, [m]);
  check(e.ended_at !== null && e.ended_by === await pub(db, 'sidA'), 'chiude chi esce per primo; il secondo non riscrive ended_by', e);
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'x', p_livello: 'lvl3' })).motivo === 'chiusa', 'partita chiusa: niente mosse');
});

sezione('C1. chat', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  check((await mossa(db, 'chat_scrivi', 'sidA', m, { p_testo: '  ciao  ' })).ok === true, 'A scrive');
  check((await mossa(db, 'chat_scrivi', 'sidC', m, { p_testo: 'intruso' })).ok === false, 'un estraneo non scrive');
  check((await mossa(db, 'chat_scrivi', 'sidA', m, { p_testo: 'z'.repeat(501) })).ok === false, 'oltre 500 caratteri: rifiutato');
  check((await mossa(db, 'chat_scrivi', 'sidA', m, { p_testo: '   ' })).ok === false, 'testo vuoto: rifiutato');
  await mossa(db, 'chat_scrivi', 'sidB', m, { p_testo: 'eccomi' });
  const l = await mossa(db, 'chat_leggi', 'sidB', m);
  check(Array.isArray(l) && l.length === 2 && l[0].content === 'ciao' && l[0].sender_name === 'Ada' && l[1].sender_name === 'Bea', 'B legge in ordine, testo ripulito, nomi messi dal server', l);
  check(JSON.stringify(Object.keys(l[0]).sort()) === JSON.stringify(['content', 'created_at', 'id', 'sender_name']), 'solo le colonne che servono', Object.keys(l[0]));
  check(await mossa(db, 'chat_leggi', 'sidC', m) === null, 'un estraneo non legge');
  await mossa(db, 'partita_esci', 'sidA', m);
  check((await mossa(db, 'chat_scrivi', 'sidB', m, { p_testo: 'dopo' })).ok === false, 'a partita chiusa non si scrive');
  check((await mossa(db, 'chat_leggi', 'sidB', m)).length === 2, 'ma si rilegge');
});

sezione('R1. 39a_ritorno', async (db) => {
  const e = await errore(applicaFile(db, 'supabase/sql/39a_ritorno.sql'));
  check(!e, 'il ritorno si applica', e);
  const f = await righe(db, `SELECT proname FROM pg_proc WHERE proname LIKE 'partita%' OR proname LIKE 'chat\\_%' OR proname = 'accetta_invito_partita' OR proname = 'partite_pulizia'`);
  check(f.length === 0, 'nessuna funzione nuova rimasta', f);
  const t = await uno(db, `SELECT data_type FROM information_schema.columns WHERE table_name = 'telepathy_chat' AND column_name = 'match_id'`);
  check(t.data_type === 'text', 'match_id torna text', t);
  const p = await righe(db, `SELECT policyname FROM pg_policies WHERE tablename = 'telepathy_chat' AND policyname LIKE 'Solo i partecipanti%'`);
  check(p.length === 3, 'le tre policy della chat sono tornate', p);
  check(!(await errore(applicaFile(db, 'supabase/sql/39a_ritorno.sql'))), 'il ritorno si riapplica');
  check(!(await errore(applicaFile(db, F39A))), 'dopo il ritorno la 39a si riapplica');
});

const negato = (e) => /permission denied/.test(e || '');
sezione('Z1. dopo la 39b: tabelle chiuse, RPC vive', async (db) => {
  const m = await partita(db, 'sidA', 'sidB');
  for (const sql of [`SELECT * FROM telepathy_matches`, `SELECT * FROM telepathy_chat`,
                     `INSERT INTO telepathy_matches (user1_id) VALUES ('x')`, `UPDATE telepathy_matches SET level = 'lvl9'`,
                     `DELETE FROM telepathy_matches`, `TRUNCATE telepathy_matches`, `TRUNCATE telepathy_chat`,
                     `INSERT INTO telepathy_chat (match_id, sender_name, content) VALUES ('${m}', 'X', 'y')`]) {
    check(negato(await comeAnon(db, () => errore(db.query(sql)))), `anon: ${sql.slice(0, 40)} → negato`);
  }
  check(negato(await comeAnon(db, () => errore(chiama(db, 'end_telepathy_match', { p_match_id: m, p_ended_by: 'x' })))), 'end_telepathy_match non più chiamabile');
  check((await mossa(db, 'partita_simbolo', 'sidA', m, { p_simbolo: 'stella', p_livello: 'lvl3' })).ok === true, 'le mosse passano dalle RPC');
  check((await mossa(db, 'chat_scrivi', 'sidB', m, { p_testo: 'ciao' })).ok === true, 'la chat passa dalle RPC');
  check((await mossa(db, 'chat_leggi', 'sidA', m)).length === 1, 'e si rilegge');
  await inCoda(db, 'sidC', 'Cia');
  check((await crea(db, 'sidD', 'Dea', 'sidC')).ok === true, 'l\'abbinamento funziona');
  const inv = await invita(db, 'sidE', 'Eva', 'sidF', 'Fra');
  check((await comeAnon(db, () => chiama(db, 'accetta_invito_partita', { p_invite_id: inv, ...IO('sidF') }))).ok === true, 'l\'invito funziona');
  const pres = await comeAnon(db, () => chiama(db, 'aggiorna_presenza', { ...IO('sidA'), p_nickname: 'Ada', p_lat: 1, p_lng: 1 }));
  check(pres.find((u) => u.nickname === 'Ada').busy === true, 'aggiorna_presenza vede ancora le partite (busy)', pres);
}, { con35a: true, con36a: true, con36b: true, con39a: true, con39b: true });

sezione('Z2. 39b_ritorno', async (db) => {
  check(!(await errore(applicaFile(db, 'supabase/sql/39b_ritorno.sql'))), 'il ritorno si applica');
  check(!(await comeAnon(db, () => errore(db.query(`SELECT * FROM telepathy_matches`)))), 'anon rilegge le partite');
  check(!(await comeAnon(db, () => errore(db.query(`SELECT * FROM telepathy_chat`)))), 'anon rilegge la chat');
  const rls = await uno(db, `SELECT relrowsecurity AS r FROM pg_class WHERE relname = 'telepathy_chat'`);
  check(rls.r === false, 'chat: RLS di nuovo spenta, com\'era', rls);
  const pol = (await righe(db, `SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('telepathy_matches','telepathy_chat') ORDER BY 1, 2`)).map((p) => p.policyname);
  check(pol.length === 5, 'le cinque policy di prima', pol);
  check(!(await comeAnon(db, () => errore(chiama(db, 'end_telepathy_match', { p_match_id: '00000000-0000-0000-0000-000000000000', p_ended_by: 'x' })))), 'end_telepathy_match di nuovo chiamabile');
  check(!(await errore(applicaFile(db, 'supabase/sql/39b_ritorno.sql'))), 'il ritorno si riapplica');
  check(!(await errore(applicaFile(db, F39B))), 'dopo il ritorno la 39b si riapplica');
  check(negato(await comeAnon(db, () => errore(db.query(`SELECT * FROM telepathy_matches`)))), 'e richiude');
  check(!(await errore(applicaFile(db, 'supabase/sql/39b_ritorno.sql'))) && !(await errore(applicaFile(db, 'supabase/sql/39a_ritorno.sql'))), 'catena 39b_ritorno → 39a_ritorno senza errori');
}, { con35a: true, con36a: true, con36b: true, con39a: true, con39b: true });

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
