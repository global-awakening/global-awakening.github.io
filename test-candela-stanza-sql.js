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
const accendi = (db, id, sid, nome) =>
  db.query(`SELECT * FROM toggle_ritual_candle($1, $2, $3)`, [id, sid, nome]).then(r => r.rows[0]);
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
  r = await accendi(db, c.id, 'reg1', 'Impostore');
  check(r.candles_nomi.reg1 === 'Aurora', 'registrato: il nome viene dal profilo, non dall\'app', r.candles_nomi);
  r = await accendi(db, c.id, 'lungo', 'x'.repeat(80));
  check(r.candles_nomi.lungo === 'x'.repeat(50), 'ospite con nome lungo: 50 caratteri', r.candles_nomi.lungo);
  r = await accendi(db, c.id, 'vuoto', '   ');
  check(r.candles_nomi.vuoto === 'Anonymous', 'nome vuoto: Anonymous', r.candles_nomi.vuoto);
  // La chiamata delle app vecchie: due parametri per nome (come fa PostgREST).
  r = (await db.query(`SELECT * FROM toggle_ritual_candle(p_ritual_id => $1, p_session_id => 'vecchia')`, [c.id])).rows[0];
  check(r.candles.includes('vecchia') && r.candles_nomi.vecchia === 'Anonymous', 'chiamata a due parametri per nome: funziona', r);
  r = await accendi(db, c.id, 'ospite1', 'Luce');
  check(!r.candles.includes('ospite1') && !('ospite1' in r.candles_nomi), 'spegne: via candela e nome', r);
  check(r.candles.length === 4 && Object.keys(r.candles_nomi).length === 4, 'le altre candele restano, coi loro nomi', r);
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

  console.log('\n— rilancio —');
  check(!(await errore(applicaFile(db, 'supabase/sql/30_candela_nella_stanza.sql'))), '30_ si rilancia (idempotente)');
  const inOrdine = await errore((async () => {
    for (const f of ['28_rituali_ricorrenti', '29_tetto_occorrenze', '30_candela_nella_stanza']) await applicaFile(db, `supabase/sql/${f}.sql`);
  })());
  check(!inOrdine, '28_ + 29_ + 30_ rilanciate in ordine: nessun errore', inOrdine);
  const firme = (await db.query(`SELECT pg_get_function_identity_arguments(oid) a FROM pg_proc WHERE proname = 'toggle_ritual_candle'`)).rows.map(x => x.a);
  check(firme.length === 1 && /p_nickname/.test(firme[0]), 'dopo il rilancio resta una sola firma (tre parametri)', firme);
  const mDopo = await errore(db.query(`SELECT * FROM toggle_ritual_candle(p_ritual_id => $1, p_session_id => 'dopo')`, [c.id]));
  check(!mDopo, 'dopo il rilancio la chiamata a due parametri funziona ancora', mDopo);
  const vd = await vista(db, c.id);
  check(vd.candles_nomi.nuovo === 'Oggi' && vd.candles_nomi.dopo === 'Anonymous', 'dopo il rilancio la vista ha ancora i nomi', vd.candles_nomi);

  console.log(`\n${passed} passati, ${failed} falliti`);
})().catch(e => { console.log('  ❌ eccezione: ' + e.message); process.exitCode = 1; });
