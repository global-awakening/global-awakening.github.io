/**
 * Rituali che si ripetono, lato SQL (Postgres locale PGlite) — Global Awakening
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali-ricorrenti-sql.js
 */
const { creaDbLocale, RUOLO_SERVIZIO } = require('./scripts/pg-locale');
let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };

const iso = (t) => new Date(t).toISOString();
const crea = (db, { giorni = null, fino = null, fuso = null, data, ora, durata = 30, creatore = 's1' }) =>
  db.query(`SELECT * FROM create_ritual('Ospite',$1,'Preghiera','riga uno\nriga due','consciousness',11,$2,$3,$4,NULL,$5,$6,$7)`,
    [creatore, data, ora, durata, giorni, fino, fuso]);
const occorrenze = async (db, id) => (await db.query(`SELECT o FROM get_ritual_occurrences($1) o`, [id])).rows.map(r => iso(r.o));
const errore = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

async function parteA(db) {
  console.log('\n— regola, appuntamenti, vista, create_ritual —');
  // Ora legale: ogni giorno alle 07:00 di Roma dal 23 al 27/10/2026. Il modulo manda l'istante UTC
  // del primo giorno (05:00Z = 07:00 CEST).
  const dst = (await crea(db, { giorni: [1,2,3,4,5,6,7], fino: '2026-10-27', fuso: 'Europe/Rome', data: '2026-10-23', ora: '05:00' })).rows[0];
  check((await occorrenze(db, dst.id)).join() === ['2026-10-23T05:00:00.000Z','2026-10-24T05:00:00.000Z','2026-10-25T06:00:00.000Z','2026-10-26T06:00:00.000Z','2026-10-27T06:00:00.000Z'].join(),
    'Europe/Rome: le 07:00 restano le 07:00 dopo il 25/10 (05Z → 06Z)', await occorrenze(db, dst.id));
  check(dst.ora_locale === '07:00:00' && iso(dst.data_inizio_locale).slice(0, 10) === '2026-10-23', 'ora e giorno locali calcolati dal server', dst);

  // America/New_York: domeniche alle 07:00 dal 25/10 all'8/11/2026. Lì l'ora solare torna il 1/11,
  // una settimana dopo l'Europa: 07:00 EDT = 11:00Z, 07:00 EST = 12:00Z.
  const ny = (await crea(db, { giorni: [7], fino: '2026-11-08', fuso: 'America/New_York', data: '2026-10-25', ora: '11:00' })).rows[0];
  check((await occorrenze(db, ny.id)).join() === ['2026-10-25T11:00:00.000Z','2026-11-01T12:00:00.000Z','2026-11-08T12:00:00.000Z'].join(),
    "America/New_York: 07:00 locali ogni domenica, anche dopo il suo cambio d'ora del 1/11", await occorrenze(db, ny.id));

  // Giorni scelti e data del modulo che non è un giorno scelto: lunedì 5/10/2026 con Mer+Ven.
  const mv = (await crea(db, { giorni: [3,5], fino: '2026-10-16', fuso: 'Europe/Rome', data: '2026-10-05', ora: '05:00' })).rows[0];
  check(mv.date === '2026-10-07' && mv.time === '05:00:00', 'date/time riscritti sul primo giorno scelto (mer 7/10)', mv);
  check((await occorrenze(db, mv.id)).length === 4, 'mer/ven dal 5 al 16/10 inclusi = 4 appuntamenti');

  // Errori.
  const base = { fuso: 'Europe/Rome', data: '2026-10-05', ora: '05:00' };
  const casi = [
    [{ ...base, giorni: [1], fino: null }, 'recurrence_incomplete'],
    [{ ...base, giorni: [], fino: '2026-10-10' }, 'recurrence_days_invalid'],
    [{ ...base, giorni: [8], fino: '2026-10-10' }, 'recurrence_days_invalid'],
    [{ ...base, giorni: [1,1], fino: '2026-10-10' }, 'recurrence_days_invalid'],
    [{ ...base, giorni: [1], fino: '2026-10-10', fuso: 'Marte/Olympus' }, 'timezone_invalid'],
    [{ ...base, giorni: [1], fino: '2026-10-04' }, 'recurrence_end_invalid'],
    [{ ...base, giorni: [1], fino: '2027-10-07' }, 'recurrence_end_invalid'],
    [{ ...base, giorni: [1], fino: '2026-10-10', durata: 721 }, 'recurrence_duration_too_long'],
    [{ ...base, giorni: [7], fino: '2026-10-10' }, 'recurrence_empty'],
  ];
  for (const [arg, atteso] of casi) {
    const m = await errore(crea(db, { ...arg, creatore: 'err' + atteso }));
    check(m && m.includes(atteso), `rifiuto ${atteso}`, m);
  }
  // Tetto: 10 cicli attivi per creatore (il rate-limit di 5/10 min si aggira con created_at indietro).
  for (let i = 0; i < 10; i++) {
    await crea(db, { giorni: [1], fino: '2026-12-31', fuso: 'UTC', data: '2026-10-05', ora: '07:00', creatore: 'tetto' });
    await db.query(`UPDATE rituals SET created_at = now() - interval '1 hour' WHERE creator_id = 'tetto'`);
  }
  const m11 = await errore(crea(db, { giorni: [1], fino: '2026-12-31', fuso: 'UTC', data: '2026-10-05', ora: '07:00', creatore: 'tetto' }));
  check(m11 && m11.includes('recurrence_limit'), "l'11° ciclo attivo dello stesso creatore è rifiutato", m11);

  // Rituale singolo: la chiamata di oggi (10 parametri per nome) funziona ancora e la vista è identica.
  const s = (await db.query(`SELECT * FROM create_ritual(p_creator=>'Ospite',p_creator_id=>'sing',p_name=>'Singolo',p_description=>'',p_type=>'consciousness',p_sacred_number=>11,p_date=>'2026-10-05',p_time=>'05:00',p_duration=>3,p_password_hash=>NULL)`)).rows[0];
  const vs = (await db.query(`SELECT * FROM rituali_correnti WHERE id = $1`, [s.id])).rows[0];
  check(vs.date === s.date && vs.time === s.time && vs.occorrenza_numero === 1 && vs.occorrenze_totali === 1,
    'rituale singolo: vista uguale alla tabella, giorno 1 di 1', vs);
  // Righe malformate (da vecchie scritture dirette, o regole rotte): la vista non deve esplodere.
  // Si selezionano le colonne calcolate vere: con count(*) il planner le salterebbe.
  await db.query(`INSERT INTO rituals (creator, creator_id, name, type, sacred_number, date, time, duration) VALUES ('x','x','rotto','consciousness',11,'non-una-data','boh',3)`);
  await db.query(`INSERT INTO rituals (creator, creator_id, name, type, sacred_number, date, time, duration, ripeti_giorni, ripeti_fino, fuso, ora_locale, data_inizio_locale)
                  VALUES ('x','x','rotto-ric','consciousness',11,'2026-10-05','05:00:00',30,'{1}','2026-10-30','Marte/X','07:00','2026-10-05')`);
  const mal = await errore(db.query(`SELECT id, date, time, candles, occorrenza_numero, occorrenze_totali, presenti_ora FROM rituali_correnti`));
  check(!mal, 'righe malformate (singola e ricorrente) non spengono la vista', mal);
  // Via subito: la pulizia di oggi (e quella nuova, per i singoli) fa date::date e su queste esploderebbe.
  await db.query(`DELETE FROM rituals WHERE name IN ('rotto','rotto-ric')`);

  // «Fino al» a +366 giorni esatti dal primo giorno: accettato.
  const l366 = await errore(crea(db, { giorni: [1], fino: '2027-10-06', fuso: 'Europe/Rome', data: '2026-10-05', ora: '05:00', creatore: 'l366' }));
  check(!l366, 'fino al = primo giorno + 366 è accettato', l366);
  // Buco dell'ora legale: ogni giorno alle 02:30 di Roma (01:30Z il 27/03) attraversa il 29/03/2026,
  // quando quell'ora locale non esiste. Si crea e non esplode.
  const buco = await errore(crea(db, { giorni: [1,2,3,4,5,6,7], fino: '2026-03-31', fuso: 'Europe/Rome', data: '2026-03-27', ora: '01:30', creatore: 'buco' }));
  check(!buco, "ora inesistente per il salto dell'ora legale: creazione senza errori", buco);
  const bucoId = (await db.query(`SELECT id FROM rituals WHERE creator_id = 'buco'`)).rows[0];
  const nBuco = bucoId ? (await occorrenze(db, bucoId.id)).length : -1;
  check(nBuco === 5, 'buco ora legale: 5 appuntamenti dal 27 al 31/03', nBuco);

  // Vista su un ciclo in corso: ogni giorno in UTC, partito 2 giorni fa, alle (adesso - 1 minuto).
  const t0 = new Date(Date.now() - 60000);
  const dueGiorniFa = new Date(t0.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const fino = new Date(t0.getTime() + 5 * 86400000).toISOString().slice(0, 10);
  const oraT0 = t0.toISOString().slice(11, 16);
  const c = (await crea(db, { giorni: [1,2,3,4,5,6,7], fino, fuso: 'UTC', data: dueGiorniFa, ora: oraT0, creatore: 'ciclo' })).rows[0];
  const vc = (await db.query(`SELECT * FROM rituali_correnti WHERE id = $1`, [c.id])).rows[0];
  check(vc.date === t0.toISOString().slice(0, 10) && vc.time === oraT0 + ':00', 'vista: date/time = appuntamento di oggi, formati di sempre', vc);
  check(vc.prima_date === dueGiorniFa && vc.occorrenza_numero === 3 && vc.occorrenze_totali === 8, 'vista: prima data originale, giorno 3 di 8', vc);

  // Permessi: anon legge la vista, non la tabella delle presenze.
  await db.query(`SET ROLE anon`);
  const vistaAnon = await errore(db.query(`SELECT id, date, presenti_ora FROM rituali_correnti LIMIT 1`));
  const presAnon = await errore(db.query(`SELECT * FROM ritual_presence LIMIT 1`));
  await db.query(`RESET ROLE`);
  check(!vistaAnon, 'anon legge rituali_correnti', vistaAnon);
  check(presAnon && /permission denied/.test(presAnon), 'anon NON legge ritual_presence', presAnon);
  return { c, s };
}

async function parteB(db, { c, s }) {
  console.log('\n— lasciare, fermare, candele, presenze, pulizia, notifiche —');
  const vista = async (id) => (await db.query(`SELECT * FROM rituali_correnti WHERE id = $1`, [id])).rows[0];

  // leave_ritual.
  await db.query(`SELECT join_ritual($1, 'ospite2')`, [c.id]);
  await db.query(`SELECT leave_ritual($1, 'ospite2', NULL)`, [c.id]);
  check(!(await vista(c.id)).participants.includes('ospite2'), 'un ospite lascia il ciclo');
  check((await errore(db.query(`SELECT leave_ritual($1, 'ciclo', NULL)`, [c.id]))).includes('creator_cannot_leave'), 'il creatore non può lasciare');
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('reg1','Reg1','r@test.com','pbkdf2$1$a$b')`);
  await db.query(`SELECT join_ritual($1, 'reg1')`, [c.id]);
  check((await errore(db.query(`SELECT leave_ritual($1, 'reg1', 'sbagliato')`, [c.id]))).includes('Auth failed'), 'registrato: serve la credenziale per lasciare');
  await db.query(`SELECT leave_ritual($1, 'reg1', 'pbkdf2$1$a$b')`, [c.id]);
  check(!(await vista(c.id)).participants.includes('reg1'), 'registrato con credenziale: lascia');

  // Candele per appuntamento: una candela di ieri non vale oggi.
  const ieri = new Date(Date.now() - 86400000 - 60000).toISOString();
  await db.query(`UPDATE rituals SET candles = '["vecchia"]', candles_occorrenza = $2 WHERE id = $1`, [c.id, ieri]);
  check((await vista(c.id)).candles.length === 0, 'vista: la candela di ieri non si vede oggi');
  await db.query(`SELECT * FROM toggle_ritual_candle($1, 'nuova')`, [c.id]);
  check(JSON.stringify((await vista(c.id)).candles) === '["nuova"]', 'toggle: azzera ieri e accende oggi');
  // Rituale singolo esistente (candles_occorrenza NULL): le candele degli altri restano.
  await db.query(`UPDATE rituals SET candles = '["a"]', candles_occorrenza = NULL WHERE id = $1`, [s.id]);
  await db.query(`SELECT * FROM toggle_ritual_candle($1, 'b')`, [s.id]);
  check(JSON.stringify((await vista(s.id)).candles) === '["a","b"]', 'singolo: la candela di un altro non si spegne');

  // Presenze.
  check((await db.query(`SELECT segna_presenza_rituale($1, 'p1') AS n`, [c.id])).rows[0].n === 1, 'presenza: 1 persona qui adesso');
  check((await db.query(`SELECT segna_presenza_rituale($1, 'p1') AS n`, [c.id])).rows[0].n === 1, 'presenza: idempotente');
  await db.query(`UPDATE ritual_presence SET visto_il = now() - interval '2 minutes' WHERE session_id = 'p1'`);
  check((await vista(c.id)).presenti_ora === 0, 'presenza: dopo 60 s senza segni non conta più');
  check((await errore(db.query(`SELECT segna_presenza_rituale($1, 'p1')`, [s.id]))).includes('not_live'), 'presenza: rifiutata se l\'appuntamento non è in corso');

  // ferma_rituale.
  const futuro = (await crea(db, { giorni: [1,2,3,4,5,6,7], fino: '2026-12-31', fuso: 'UTC', data: '2026-12-01', ora: '07:00', creatore: 'fermo' })).rows[0];
  check((await errore(db.query(`SELECT ferma_rituale($1, 'fermo', NULL)`, [futuro.id]))).includes('not_started'), 'fermare prima dell\'inizio: si usa Cancella');
  check((await errore(db.query(`SELECT ferma_rituale($1, 'altro', NULL)`, [c.id]))).includes('not_creator'), 'solo il creatore ferma');
  check((await errore(db.query(`SELECT ferma_rituale($1, 'sing', NULL)`, [s.id]))).includes('not_recurring'), 'un rituale singolo non si ferma');
  const primaDi = (await db.query(`SELECT count(*)::int n FROM get_ritual_occurrences($1)`, [c.id])).rows[0].n;
  await db.query(`SELECT ferma_rituale($1, 'ciclo', NULL)`, [c.id]);
  const dopo = (await db.query(`SELECT count(*)::int n FROM get_ritual_occurrences($1)`, [c.id])).rows[0].n;
  check(primaDi === 8 && dopo === 3, 'fermato: restano solo gli appuntamenti già iniziati (quello in corso finisce)', { primaDi, dopo });
  check((await errore(db.query(`SELECT ferma_rituale($1, 'ciclo', NULL)`, [c.id]))).includes('already_stopped'), 'non si ferma due volte');

  // Pulizia: non tocca un ciclo con appuntamenti futuri; cancella uno finito.
  const finito = (await crea(db, { giorni: [1,2,3,4,5,6,7], fino: '2026-09-02', fuso: 'UTC', data: '2026-09-01', ora: '07:00', creatore: 'finito' })).rows[0];
  await db.query(`SELECT cleanup_expired_rituals()`);
  const ids = (await db.query(`SELECT id FROM rituals`)).rows.map(r => Number(r.id));
  check(!ids.includes(Number(finito.id)) && ids.includes(Number(futuro.id)), 'pulizia: via il ciclo finito, resta quello futuro');

  // Notifiche: dedup per appuntamento, e la riga «epoch» della funzione vecchia diventa l'appuntamento corrente.
  const sub = (await db.query(`INSERT INTO push_subscriptions (session_id) VALUES ('x') RETURNING id`)).rows[0].id;
  await db.query(`INSERT INTO ritual_notifications_sent (ritual_id, subscription_id, kind) VALUES ($1, $2, 'start')`, [futuro.id, sub]);
  const occ = (await db.query(`SELECT occorrenza FROM ritual_notifications_sent WHERE ritual_id = $1`, [futuro.id])).rows[0].occorrenza;
  check(iso(occ) === '2026-12-01T07:00:00.000Z', 'riga senza occorrenza: il trigger mette l\'appuntamento corrente', iso(occ));
  check(!!(await errore(db.query(`INSERT INTO ritual_notifications_sent (ritual_id, subscription_id, kind, occorrenza) VALUES ($1, $2, 'start', '2026-12-01T07:00:00Z')`, [futuro.id, sub]))), 'stesso appuntamento: conflitto (niente doppione)');
  check(!(await errore(db.query(`INSERT INTO ritual_notifications_sent (ritual_id, subscription_id, kind, occorrenza) VALUES ($1, $2, 'start', '2026-12-02T07:00:00Z')`, [futuro.id, sub]))), 'appuntamento dopo: la notifica riparte');
}

(async () => {
  const db = await creaDbLocale();
  const ctx = await parteA(db);
  await parteB(db, ctx);
  const { applicaFile } = require('./scripts/pg-locale');
  check(!(await errore(applicaFile(db, 'supabase/sql/28_rituali_ricorrenti.sql'))), '28_ si rilancia senza errori (idempotente)');
  console.log(`\n${passed} passati, ${failed} falliti`);
})().catch(e => { console.log('  ❌ eccezione: ' + e.message); process.exitCode = 1; });
