/**
 * La candela si accende solo durante l'appuntamento, e ricorda chi l'ha accesa (30_) — lato SQL,
 * su Postgres locale (PGlite).
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-candela-stanza-sql.js
 *
 * File a parte da test-rituali-ricorrenti-sql.js: quello prova la 28_/29_ e a metà rilancia la
 * 28_ (che rimette la candela senza cancello); qui serve un database con la 30_ sopra, dall'inizio
 * alla fine. Tutte le date sono relative ad adesso: il cancello dipende da now().
 */
const { creaDbLocale, applicaFile } = require('./scripts/pg-locale');
let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };
const errore = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

const GIORNO = 86400000;
const data = (t) => new Date(t).toISOString().slice(0, 10);
const ora = (t) => new Date(t).toISOString().slice(11, 16);
const singolo = (db, creatore, t, durata = 30) =>
  db.query(`SELECT * FROM create_ritual('Ospite',$1,'Candela','','consciousness',11,$2,$3,$4,NULL)`,
    [creatore, data(t), ora(t), durata]).then(r => r.rows[0]);
const ciclo = (db, creatore, t0) =>
  db.query(`SELECT * FROM create_ritual('Ospite',$1,'Ciclo','','consciousness',11,$2,$3,30,NULL,$4,$5,'UTC')`,
    [creatore, data(t0 - 2 * GIORNO), ora(t0), [1, 2, 3, 4, 5, 6, 7], data(t0 + 5 * GIORNO)]).then(r => r.rows[0]);
// Come fa l'app: prima si segna la presenza nella stanza (senza, la candela è rifiutata), poi si
// accende. Se la presenza fallisce (es. not_live) decide la candela: è lei che si sta provando.
const presente = (db, id, sid) => db.query(`SELECT segna_presenza_rituale($1, $2)`, [id, sid]).catch(() => null);
const accendi = async (db, id, sid, nome, { pw = null, presenza = true } = {}) => {
  if (presenza) await presente(db, id, sid);
  return db.query(`SELECT * FROM toggle_ritual_candle($1, $2, $3, $4)`, [id, sid, nome, pw]).then(r => r.rows[0]);
};
const firmeCandela = (db) => db.query(`SELECT pg_get_function_identity_arguments(oid) a FROM pg_proc WHERE proname = 'toggle_ritual_candle'`)
  .then(r => r.rows.map(x => x.a));
const vista = (db, id) => db.query(`SELECT * FROM rituali_correnti WHERE id = $1`, [id]).then(r => r.rows[0]);

(async () => {
  const db = await creaDbLocale();

  console.log('\n— quando: solo durante l\'appuntamento —');
  const domani = await singolo(db, 'futuro', Date.now() + GIORNO);
  const passato = await singolo(db, 'passato', Date.now() - 2 * 3600000);  // 30 minuti, finito da 1h30
  const m1 = await errore(accendi(db, domani.id, 'x', 'X'));
  check(m1 && m1.includes('not_live'), 'prima dell\'appuntamento: not_live', m1);
  const m2 = await errore(accendi(db, passato.id, 'x', 'X'));
  check(m2 && m2.includes('not_live'), 'dopo l\'appuntamento: not_live', m2);
  // Un ciclo tra un appuntamento e l'altro (ieri fatto, oggi fra un'ora): non si accende.
  const traDue = await ciclo(db, 'tradue', Date.now() + 3600000);
  const m3 = await errore(accendi(db, traDue.id, 'x', 'X'));
  check(m3 && m3.includes('not_live'), 'ciclo fra due appuntamenti: not_live', m3);
  check((await vista(db, domani.id)).candles.length === 0, 'il rifiuto non accende niente');

  console.log('\n— chi: il nome di chi accende —');
  const t0 = Date.now() - 60000;
  const c = await ciclo(db, 'ciclo', t0);
  let r = await accendi(db, c.id, 'ospite1', '  Luce  ');
  check(JSON.stringify(r.candles) === '["ospite1"]' && r.candles_nomi.ospite1 === 'Luce', 'in corso: accende e salva il nome (senza spazi)', r);
  check((await vista(db, c.id)).candles_nomi.ospite1 === 'Luce', 'la vista mostra il nome');
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('reg1','Aurora','a@test.com','h')`);
  r = await accendi(db, c.id, 'reg1', 'Impostore', { pw: 'h' });
  check(r.candles_nomi.reg1 === 'Aurora', 'registrato: il nome viene dal profilo, non dall\'app', r.candles_nomi);

  console.log('\n— 1. un registrato non si impersona —');
  const firme0 = await firmeCandela(db);
  check(firme0.length === 1 && /p_password_hash/.test(firme0[0]), 'dopo 28_+29_+30_ una sola firma, con p_password_hash', firme0);
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('reg2','Stella','s@test.com','hs')`);
  const mSenza = await errore(accendi(db, c.id, 'reg2', 'x'));
  check(mSenza && mSenza.includes('Auth failed'), 'registrato senza credenziale: Auth failed', mSenza);
  const mSbagliata = await errore(accendi(db, c.id, 'reg2', 'x', { pw: 'sbagliata' }));
  check(mSbagliata && mSbagliata.includes('Auth failed'), 'registrato con credenziale sbagliata: Auth failed', mSbagliata);
  const mVecchiaReg = await errore((async () => {
    await presente(db, c.id, 'reg2');
    return db.query(`SELECT * FROM toggle_ritual_candle(p_ritual_id => $1, p_session_id => 'reg2')`, [c.id]);
  })());
  check(mVecchiaReg && mVecchiaReg.includes('Auth failed'), 'app vecchia (2 parametri) per un registrato: Auth failed', mVecchiaReg);
  check(!(await vista(db, c.id)).candles.includes('reg2'), 'i rifiuti non accendono la candela del registrato');
  r = await accendi(db, c.id, 'reg1', null, { pw: 'h' });
  check(!r.candles.includes('reg1'), 'registrato con credenziale: spegne', r.candles);
  r = await accendi(db, c.id, 'reg1', null, { pw: 'h' });
  check(r.candles.includes('reg1'), 'registrato con credenziale: riaccende', r.candles);

  console.log('\n— 2a. un ospite non prende il nome di un registrato —');
  r = await accendi(db, c.id, 'finto1', 'aURORA');
  check(r.candles_nomi.finto1 === 'Anonymous', 'nome di un registrato (maiuscole diverse): Anonymous', r.candles_nomi.finto1);
  r = await accendi(db, c.id, 'finto2', '​Aurora‮');
  check(r.candles_nomi.finto2 === 'Anonymous', 'nome di un registrato mascherato da caratteri invisibili: Anonymous', r.candles_nomi.finto2);

  console.log('\n— 2d. pulizia del nome —');
  r = await accendi(db, c.id, 'pulito', ' ​Lu‏c⁦e\u0007\u001b ');
  check(r.candles_nomi.pulito === 'Luce', 'via controllo, larghezza zero e direzione del testo', r.candles_nomi.pulito);
  r = await accendi(db, c.id, 'invisibile', '​‍‪⁩\u0001');
  check(r.candles_nomi.invisibile === 'Anonymous', 'nome fatto solo di invisibili: Anonymous', r.candles_nomi.invisibile);
  r = await accendi(db, c.id, 'lungo2', '​'.repeat(10) + 'y'.repeat(60));
  check(r.candles_nomi.lungo2 === 'y'.repeat(50), 'si pulisce prima di tagliare a 50', r.candles_nomi.lungo2);
  for (const sid of ['finto1', 'finto2', 'pulito', 'invisibile', 'lungo2']) await accendi(db, c.id, sid, null);

  console.log('\n— 2c. la candela si accende solo da presenti —');
  const mAssente = await errore(accendi(db, c.id, 'assente', 'A', { presenza: false }));
  check(mAssente && mAssente.includes('not_present'), 'mai entrato nella stanza: not_present', mAssente);
  await presente(db, c.id, 'tardi');
  await db.query(`UPDATE ritual_presence SET visto_il = now() - interval '2 minutes' WHERE session_id = 'tardi'`);
  const mTardi = await errore(accendi(db, c.id, 'tardi', 'T', { presenza: false }));
  check(mTardi && mTardi.includes('not_present'), 'visto più di 60 s fa: not_present', mTardi);
  const occC = (await db.query(`SELECT rituale_occorrenza_corrente(r) o FROM rituals r WHERE id = $1`, [c.id])).rows[0].o;
  await db.query(`INSERT INTO ritual_presence (ritual_id, occorrenza, session_id) VALUES ($1, $2::timestamptz - interval '1 day', 'ieri')`, [c.id, occC]);
  const mIeri = await errore(accendi(db, c.id, 'ieri', 'I', { presenza: false }));
  check(mIeri && mIeri.includes('not_present'), 'presente a un altro appuntamento: not_present', mIeri);
  const altro = await singolo(db, 'altro', Date.now() - 60000);
  await presente(db, altro.id, 'altrove');
  const mAltrove = await errore(accendi(db, c.id, 'altrove', 'Al', { presenza: false }));
  check(mAltrove && mAltrove.includes('not_present'), 'presente in un altro rituale: not_present', mAltrove);
  check((await vista(db, c.id)).candles.every(x => !['assente', 'tardi', 'ieri', 'altrove'].includes(x)), 'i rifiuti non accendono niente');
  r = await accendi(db, c.id, 'lungo', 'x'.repeat(80));
  check(r.candles_nomi.lungo === 'x'.repeat(50), 'ospite con nome lungo: 50 caratteri', r.candles_nomi.lungo);
  r = await accendi(db, c.id, 'vuoto', '   ');
  check(r.candles_nomi.vuoto === 'Anonymous', 'nome vuoto: Anonymous', r.candles_nomi.vuoto);
  // La chiamata delle app vecchie: due parametri per nome (come fa PostgREST).
  await presente(db, c.id, 'vecchia');
  r = (await db.query(`SELECT * FROM toggle_ritual_candle(p_ritual_id => $1, p_session_id => 'vecchia')`, [c.id])).rows[0];
  check(r.candles.includes('vecchia') && r.candles_nomi.vecchia === 'Anonymous', 'chiamata a due parametri per nome: funziona', r);
  r = await accendi(db, c.id, 'ospite1', 'Luce');
  check(!r.candles.includes('ospite1') && !('ospite1' in r.candles_nomi), 'spegne: via candela e nome', r);
  check(r.candles.length === 4 && Object.keys(r.candles_nomi).length === 4, 'le altre candele restano, coi loro nomi', r);
  check(JSON.stringify(r.candles) === '["reg1","lungo","vuoto","vecchia"]', 'candles tiene l\'ordine di accensione', r.candles);
  // Anon può chiamarla (è la chiave dell'app).
  await db.query(`SET ROLE anon`);
  const mAnon = await errore(accendi(db, c.id, 'anon1', 'Anon'));
  await db.query(`RESET ROLE`);
  check(!mAnon, 'anon può accendere', mAnon);

  console.log('\n— leave_ritual toglie il nome —');
  await db.query(`SELECT join_ritual($1, 'lungo')`, [c.id]);
  await db.query(`SELECT leave_ritual($1, 'lungo', NULL)`, [c.id]);
  const vl = await vista(db, c.id);
  check(!vl.candles.includes('lungo') && !('lungo' in vl.candles_nomi), 'chi lascia il ciclo porta via candela e nome', vl);

  console.log('\n— appuntamento nuovo: si riparte da zero —');
  const ieri = new Date(t0 - GIORNO).toISOString();
  await db.query(`UPDATE rituals SET candles = '["vecchio"]', candles_nomi = '{"vecchio":"Ieri"}', candles_occorrenza = $2 WHERE id = $1`, [c.id, ieri]);
  const vi = await vista(db, c.id);
  check(vi.candles.length === 0 && JSON.stringify(vi.candles_nomi) === '{}', 'vista: candele e nomi di ieri non si vedono oggi', vi);
  r = await accendi(db, c.id, 'nuovo', 'Oggi');
  check(JSON.stringify(r.candles) === '["nuovo"]' && JSON.stringify(r.candles_nomi) === '{"nuovo":"Oggi"}', 'toggle: azzera candele e nomi di ieri, accende oggi', r);

  // Rituale singolo in corso nato prima della 28_ (candles_occorrenza NULL): le candele altrui restano.
  const s = await singolo(db, 'sing', Date.now() - 60000);
  await db.query(`UPDATE rituals SET candles = '["a"]', candles_occorrenza = NULL WHERE id = $1`, [s.id]);
  r = await accendi(db, s.id, 'b', 'Bi');
  check(JSON.stringify(r.candles) === '["a","b"]' && r.candles_nomi.b === 'Bi', 'singolo in corso: la candela di un altro non si spegne', r);

  console.log('\n— 2b. tetto di 500 candele per appuntamento —');
  const pieno = await singolo(db, 'pieno', Date.now() - 60000);
  await accendi(db, pieno.id, 'primo', 'Primo');
  await db.query(`UPDATE rituals SET candles = candles || (SELECT jsonb_agg('c' || i) FROM generate_series(2, 500) i) WHERE id = $1`, [pieno.id]);
  const mPieno = await errore(accendi(db, pieno.id, 'cinquecentouno', 'X'));
  check(mPieno && mPieno.includes('too_many_candles'), 'la 501ª candela: too_many_candles', mPieno);
  r = await accendi(db, pieno.id, 'primo', null);
  check(r.candles.length === 499, 'col tetto raggiunto si può ancora spegnere', r.candles.length);
  r = await accendi(db, pieno.id, 'cinquecentouno', 'X');
  check(r.candles.length === 500 && r.candles.includes('cinquecentouno'), 'liberato un posto, si accende', r.candles.length);

  console.log('\n— 3. cancellare l\'account toglie candele e nomi —');
  // Le tabelle che delete_my_account (22_, ridefinita nella 30_) tocca e lo schema locale non ha.
  await db.exec(`
    CREATE TABLE consciousness_posts (author_nickname text); CREATE TABLE consciousness_comments (author_nickname text);
    CREATE TABLE notifications (user_nickname text); CREATE TABLE telepathy_scores (user_id text);
    CREATE TABLE magic_links (email text); CREATE TABLE password_resets (email text);
    CREATE TABLE online_users (id text); CREATE TABLE telepathy_queue (id text);
    CREATE TABLE telepathy_invites (from_id text, to_id text);
    CREATE TABLE user_blocks (blocker_nickname text, blocked_nickname text);
    CREATE TABLE content_reports (reporter_nickname text);`);
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('via1','Partente','p@test.com','hp')`);
  await accendi(db, c.id, 'via1', null, { pw: 'hp' });
  // Un secondo rituale con candela e nome (scritti a mano: basta che ci siano).
  await db.query(`UPDATE rituals SET candles = candles || '["via1"]', candles_nomi = candles_nomi || '{"via1":"Partente"}' WHERE id = $1`, [s.id]);
  check((await vista(db, c.id)).candles_nomi.via1 === 'Partente', 'prima: candela e nome di chi se ne andrà');
  await db.query(`SELECT delete_my_account('Partente', 'hp')`);
  const restanti = (await db.query(`SELECT id FROM rituals WHERE candles @> '["via1"]' OR candles_nomi ? 'via1'`)).rows;
  check(restanti.length === 0, 'dopo delete_my_account nessun rituale ha la sua candela o il suo nome', restanti);
  const vc = await vista(db, c.id), vs = await vista(db, s.id);
  check(vc.candles.includes('nuovo') && vc.candles_nomi.nuovo === 'Oggi' && vs.candles.includes('a'), 'le candele degli altri restano', { c: vc.candles, s: vs.candles });
  check((await db.query(`SELECT 1 FROM profiles WHERE session_id = 'via1'`)).rows.length === 0, 'e il profilo non c\'è più');

  console.log('\n— rilancio —');
  check(!(await errore(applicaFile(db, 'supabase/sql/30_candela_nella_stanza.sql'))), '30_ si rilancia (idempotente)');
  const inOrdine = await errore((async () => {
    for (const f of ['28_rituali_ricorrenti', '29_tetto_occorrenze', '30_candela_nella_stanza']) await applicaFile(db, `supabase/sql/${f}.sql`);
  })());
  check(!inOrdine, '28_ + 29_ + 30_ rilanciate in ordine: nessun errore', inOrdine);
  const firme = await firmeCandela(db);
  check(firme.length === 1 && /p_nickname/.test(firme[0]) && /p_password_hash/.test(firme[0]), 'dopo il rilancio resta una sola firma (quattro parametri)', firme);
  await presente(db, c.id, 'dopo');
  const mDopo = await errore(db.query(`SELECT * FROM toggle_ritual_candle(p_ritual_id => $1, p_session_id => 'dopo')`, [c.id]));
  check(!mDopo, 'dopo il rilancio la chiamata a due parametri da ospite funziona ancora', mDopo);
  const mTre = await errore((async () => {
    await presente(db, c.id, 'tre');
    return db.query(`SELECT * FROM toggle_ritual_candle(p_ritual_id => $1, p_session_id => 'tre', p_nickname => 'Tre')`, [c.id]);
  })());
  check(!mTre, 'la chiamata a tre parametri per nome (app del commit precedente) funziona', mTre);
  const vd = await vista(db, c.id);
  check(vd.candles_nomi.nuovo === 'Oggi' && vd.candles_nomi.dopo === 'Anonymous', 'dopo il rilancio la vista ha ancora i nomi', vd.candles_nomi);

  console.log(`\n${passed} passati, ${failed} falliti`);
})().catch(e => { console.log('  ❌ eccezione: ' + e.message); process.exitCode = 1; });
