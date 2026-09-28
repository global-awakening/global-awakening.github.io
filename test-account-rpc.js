/**
 * RPC d'account lato server — Global Awakening
 *
 * Verifica supabase/sql/26_account_lato_server.sql contro il database vero. Ogni RPC va
 * provata per quello che LASCIA PASSARE e per quello che ferma.
 *
 * Esecuzione:
 *   node test-account-rpc.js
 *
 * Setup e pulizia con la chiave di servizio (test-helpers). Senza chiave il test si ferma.
 */
const crypto = require('crypto');
const { requireServiceKey, serviceFetch, createTestAccount, deleteTestAccount, SUPABASE_URL } = require('./test-helpers');

requireServiceKey();
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TS = Date.now();
const INIZIO = new Date().toISOString();
const EMAILS = [];
const nuovaEmail = (tag) => { const e = `acct-${tag}-${TS}@test.com`; EMAILS.push(e); return e; };

let passed = 0, failed = 0;
const pass = (m) => { console.log(`  ✅ ${m}`); passed++; };
const fail = (m) => { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; };
const check = (cond, m, extra) => cond ? pass(m) : fail(extra ? `${m} — ${JSON.stringify(extra)}` : m);

async function anon(p, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json',
               Prefer: 'return=representation', ...(opts.headers || {}) },
    ...opts,
  });
  let body = null; try { body = await res.json(); } catch { /* vuoto */ }
  return { status: res.status, body };
}
const rpc = (fn, params) => anon(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
async function rpcServizio(fn, params) {
  return serviceFetch(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
}

// Stessa derivazione di deriveStrongHash in src/app.jsx.
function pbkdf2(password, saltB64, iter = 100000) {
  const bits = crypto.pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), iter, 32, 'sha256');
  return `pbkdf2$${iter}$${saltB64}$${bits.toString('base64')}`;
}
const sha256hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const nuovoSale = () => crypto.randomBytes(16).toString('base64');

async function creaAccount(tag, password, { legacy = false, senzaHash = false } = {}) {
  const email = nuovaEmail(tag);
  const nickname = `Acct${tag}_${TS}`.slice(0, 50);
  const password_hash = senzaHash ? null : legacy ? sha256hex(password) : pbkdf2(password, nuovoSale());
  await createTestAccount({ session_id: `acct-${tag}-${TS}`, nickname, email, password_hash });
  return { email, nickname, password_hash, session_id: `acct-${tag}-${TS}` };
}

// Login come lo fa l'app: parametri → hash con quel sale → RPC con entrambi gli hash.
async function login(email, password) {
  const par = (await rpc('get_login_params', { p_email: email })).body;
  const h = pbkdf2(password, par.salt, par.iter);
  const r = await rpc('login_with_password', { p_email: email, p_hash: h, p_legacy_hash: sha256hex(password) });
  return { ...r.body, hash: h };
}

async function testLoginERegistrazione() {
  console.log('\n— get_login_params / login_with_password / register_account —');
  const PW = 'Password123!';
  const a = await creaAccount('pbk', PW);

  // Forma identica per account PBKDF2, account vecchio, email sconosciuta.
  const vecchio = await creaAccount('leg', PW, { legacy: true });
  const pA = (await rpc('get_login_params', { p_email: a.email })).body;
  const pL = (await rpc('get_login_params', { p_email: vecchio.email })).body;
  const pX = (await rpc('get_login_params', { p_email: `nessuno-${TS}@test.com` })).body;
  const chiavi = (o) => Object.keys(o || {}).sort().join(',');
  check(chiavi(pA) === 'iter,salt' && chiavi(pL) === 'iter,salt' && chiavi(pX) === 'iter,salt',
    'get_login_params ha sempre e solo {iter, salt}', { pA, pL, pX });
  check(pA.salt === a.password_hash.split('$')[2], 'account PBKDF2: sale letto dall\'hash salvato');
  const pX2 = (await rpc('get_login_params', { p_email: `nessuno-${TS}@test.com` })).body;
  check(pX.salt === pX2.salt && pX.salt.length === 24, 'email sconosciuta: sale finto stabile tra due chiamate');

  // Login giusto, sbagliato, email con maiuscole e spazi.
  const ok = await login(a.email, PW);
  check(ok.ok === true && ok.profilo && ok.profilo.session_id === a.session_id, 'login con la password giusta', ok);
  check(ok.profilo && !('password_hash' in ok.profilo), 'il profilo restituito non contiene password_hash');
  const ko = await login(a.email, 'sbagliata');
  check(ko.ok === false && ko.motivo === 'credenziali_non_valide', 'password sbagliata rifiutata', ko);
  const maiusc = await login(`  ${a.email.toUpperCase()} `, PW);
  check(maiusc.ok === true, 'email con maiuscole e spazi trova lo stesso account', maiusc);
  const nessuno = await login(`nessuno-${TS}@test.com`, PW);
  check(nessuno.ok === false && nessuno.motivo === 'credenziali_non_valide', 'email sconosciuta: stesso rifiuto');

  // Account vecchio: entra, migra, rientra col sale HMAC salvato.
  const l1 = await login(vecchio.email, PW);
  check(l1.ok === true && l1.migrato === true, 'account SHA-256 entra e viene migrato', l1);
  const salvato = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(vecchio.email)}&select=password_hash`)).body[0].password_hash;
  check(salvato === l1.hash, 'hash salvato = hash PBKDF2 mandato dal client');
  const l2 = await login(vecchio.email, PW);
  check(l2.ok === true && l2.migrato === false && l2.hash === l1.hash, 'account migrato rientra una seconda volta', l2);

  // Account vecchio non ancora migrato: password sbagliata, e p_legacy_hash vuoto (niente match).
  const vecchio2 = await creaAccount('leg2', PW, { legacy: true });
  const kolegacy = await login(vecchio2.email, 'sbagliata');
  check(kolegacy.ok === false && kolegacy.motivo === 'credenziali_non_valide',
    'account vecchio: password sbagliata rifiutata', kolegacy);
  const par2 = (await rpc('get_login_params', { p_email: vecchio2.email })).body;
  const hGiusto2 = pbkdf2(PW, par2.salt, par2.iter);
  const legVuoto = await rpc('login_with_password', { p_email: vecchio2.email, p_hash: hGiusto2, p_legacy_hash: '' });
  check(legVuoto.body && legVuoto.body.motivo === 'credenziali_non_valide',
    'account vecchio: p_legacy_hash vuoto → credenziali_non_valide', legVuoto.body);

  // Account senza hash: nessuna password è buona.
  const senza = await creaAccount('noh', PW, { senzaHash: true });
  const s = await login(senza.email, 'qualunque');
  check(s.ok === false && s.motivo === 'credenziali_non_valide', 'account senza hash: rifiutato con qualunque password', s);

  // Formato hash errato.
  const f = await rpc('login_with_password', { p_email: a.email, p_hash: 'abc', p_legacy_hash: null });
  check(f.body && f.body.motivo === 'dati_non_validi', 'hash malformato → dati_non_validi', f.body);

  // Tetto per email: il rifiuto deve essere CONTATO (niente rollback).
  const t = await creaAccount('tetto', PW);
  for (let i = 0; i < 10; i++) await login(t.email, 'sbagliata');
  const bloccato = await login(t.email, PW);
  check(bloccato.ok === false && bloccato.motivo === 'troppi_tentativi', '11° tentativo (anche giusto) → troppi_tentativi', bloccato);
  const righe = (await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(t.email)}&select=id`)).body;
  check(Array.isArray(righe) && righe.length >= 10, 'le righe dei falliti sopravvivono al rifiuto', righe && righe.length);

  // Login riuscito azzera i falliti.
  const z = await creaAccount('azzera', PW);
  for (let i = 0; i < 3; i++) await login(z.email, 'sbagliata');
  await login(z.email, PW);
  const dopo = (await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(z.email)}&select=id`)).body;
  check(Array.isArray(dopo) && dopo.length === 0, 'login riuscito cancella i falliti di quell\'email', dopo);

  // Tetto per IP: si legge l'IP registrato da un fallito vero e si riempie la finestra.
  const ipRiga = (await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(t.email)}&select=ip&limit=1`)).body;
  const ip = ipRiga && ipRiga[0] && ipRiga[0].ip;
  check(!!ip, 'l\'IP del chiamante viene registrato (cf-connecting-ip)', ipRiga);
  if (ip) {
    const finte = Array.from({ length: 30 }, (_, i) => ({ email: `acct-ipfill-${i}-${TS}@test.com`, ip }));
    await serviceFetch('login_attempts', { method: 'POST', body: JSON.stringify(finte) });
    const fresco = await creaAccount('ipnuovo', PW);
    const r = await login(fresco.email, PW);
    check(r.ok === false && r.motivo === 'troppi_tentativi', '30 falliti dallo stesso IP → anche un\'altra email è bloccata', r);
    await serviceFetch(`login_attempts?email=like.acct-ipfill-*-${TS}@test.com`, { method: 'DELETE' });
    // Ristretto alle righe di QUESTO run (email del pattern di test o NULL, es. i fallimenti di
    // email_in_uso): un fallito vero di un altro utente sulla stessa rete non va cancellato.
    await serviceFetch(
      `login_attempts?ip=eq.${encodeURIComponent(ip)}&created_at=gte.${INIZIO}&or=(email.like.acct-*-${TS}@test.com,email.is.null)`,
      { method: 'DELETE' });
    const sblocco = await login(fresco.email, PW);
    check(sblocco.ok === true, 'svuotata la finestra, lo stesso IP rientra', sblocco);
  }

  // Tetto globale: con l'IP del chiamante noto, NON deve scattare anche con 300+ falliti
  // recenti da altri IP sintetici (fix round 1, ruling controller).
  const glob = await creaAccount('globtest', PW);
  const globali = Array.from({ length: 305 }, (_, i) => ({
    email: `acct-glob-${i}-${TS}@test.com`, ip: `synthetic-glob-${i}-${TS}`,
  }));
  await serviceFetch('login_attempts', { method: 'POST', body: JSON.stringify(globali) });
  const rGlob = await login(glob.email, PW);
  check(rGlob.ok === true, 'IP noto: 300+ falliti da altri IP sintetici non bloccano un login corretto', rGlob);
  await serviceFetch(`login_attempts?email=like.acct-glob-*-${TS}@test.com`, { method: 'DELETE' });

  // Registrazione.
  const email = nuovaEmail('reg');
  const nick = `AcctReg_${TS}`;
  const h = pbkdf2(PW, nuovoSale());
  const reg = await rpc('register_account', { p_session_id: `acct-reg-${TS}`, p_nickname: nick, p_email: ` ${email.toUpperCase()} `, p_hash: h });
  check(reg.body && reg.body.ok === true, 'registrazione riuscita', reg.body);
  const riga = (await serviceFetch(`profiles?session_id=eq.acct-reg-${TS}&select=email,password_hash`)).body[0];
  check(riga && riga.email === email && riga.password_hash === h, 'email salvata normalizzata, hash salvato così com\'è', riga);
  const dupE = await rpc('register_account', { p_session_id: `acct-reg2-${TS}`, p_nickname: `Altro_${TS}`, p_email: email, p_hash: h });
  check(dupE.body && dupE.body.motivo === 'email_in_uso', 'email già usata → email_in_uso', dupE.body);
  const dupN = await rpc('register_account', { p_session_id: `acct-reg3-${TS}`, p_nickname: nick, p_email: nuovaEmail('reg3'), p_hash: h });
  check(dupN.body && dupN.body.motivo === 'nickname_in_uso', 'nickname già usato → nickname_in_uso', dupN.body);
  const malH = await rpc('register_account', { p_session_id: `acct-reg4-${TS}`, p_nickname: `Nuovo_${TS}`, p_email: nuovaEmail('reg4'), p_hash: sha256hex(PW) });
  check(malH.body && malH.body.motivo === 'dati_non_validi', 'hash non PBKDF2 alla registrazione → dati_non_validi', malH.body);
}

async function testLinkResetProfilo() {
  console.log('\n— consume_magic_link / reset_password / change_password / update_my_profile / crea_token_account —');
  const PW = 'Password123!';

  // crea_token_account: solo il ruolo di servizio.
  const a = await creaAccount('link', PW);
  const daAnon = await rpc('crea_token_account', { p_tipo: 'magic', p_email: a.email });
  check(daAnon.status === 401 || (daAnon.body && daAnon.body.code === '42501'),
    'crea_token_account NON è chiamabile con la chiave pubblica', daAnon);
  const t1 = (await rpcServizio('crea_token_account', { p_tipo: 'magic', p_email: ` ${a.email.toUpperCase()}` })).body;
  check(typeof t1 === 'string' && t1.length >= 32, 'la chiave di servizio ottiene un token per un\'email registrata (maiuscole ok)', t1);
  const tX = (await rpcServizio('crea_token_account', { p_tipo: 'magic', p_email: `nessuno-${TS}@test.com` })).body;
  check(tX === null, 'email non registrata → nessun token', tX);
  const tFretta = (await rpcServizio('crea_token_account', { p_tipo: 'magic', p_email: a.email })).body;
  check(tFretta === null, 'seconda richiesta nello stesso minuto → nessun token (tetto 1/min)', tFretta);

  // Tetto giornaliero per email (3/giorno): tre righe sintetiche di 2 ore fa riempiono la
  // finestra di un giorno senza toccare quelle di un minuto e di un'ora.
  const g = await creaAccount('giorno', PW);
  const dueOreFa = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  await serviceFetch('account_email_log', { method: 'POST', body: JSON.stringify(
    Array.from({ length: 3 }, () => ({ email: g.email, tipo: 'reset', created_at: dueOreFa }))) });
  const tGiorno = (await rpcServizio('crea_token_account', { p_tipo: 'reset', p_email: g.email })).body;
  check(tGiorno === null, '3 email nelle ultime 24 ore (ma non nell\'ultima ora) → nessun token (tetto 3/giorno)', tGiorno);
  const logG = (await serviceFetch(`account_email_log?email=eq.${encodeURIComponent(g.email)}&select=id`)).body;
  check(Array.isArray(logG) && logG.length === 3, 'le righe della finestra giornaliera non vengono cancellate dalla pulizia', logG && logG.length);
  await serviceFetch(`account_email_log?email=eq.${encodeURIComponent(g.email)}`, { method: 'DELETE' });

  // consume_magic_link: uso singolo, restituisce la credenziale.
  const c1 = (await rpc('consume_magic_link', { p_token: t1 })).body;
  check(c1 && c1.ok === true && c1.password_hash === a.password_hash && c1.profilo.session_id === a.session_id,
    'link valido → profilo e credenziale', c1);
  const c2 = (await rpc('consume_magic_link', { p_token: t1 })).body;
  check(c2 && c2.ok === false && c2.motivo === 'token_non_valido', 'lo stesso link aperto due volte → token_non_valido', c2);

  // Link scaduto.
  const b = await creaAccount('scad', PW);
  const tokScad = crypto.randomUUID();
  await serviceFetch('magic_links', { method: 'POST', body: JSON.stringify({ email: b.email, token: tokScad, expires_at: new Date(Date.now() - 60000).toISOString() }) });
  const cs = (await rpc('consume_magic_link', { p_token: tokScad })).body;
  check(cs && cs.ok === false, 'link scaduto → rifiutato', cs);

  // Difensivo (fix round 1): expires_at NULL non deve mai passare come "non scaduto".
  const tokNullScad = crypto.randomUUID();
  const insNull = await serviceFetch('magic_links', { method: 'POST', body: JSON.stringify({ email: b.email, token: tokNullScad, expires_at: null }) });
  if (insNull.status >= 200 && insNull.status < 300) {
    const cNull = (await rpc('consume_magic_link', { p_token: tokNullScad })).body;
    check(cNull && cNull.ok === false, 'link con expires_at NULL → rifiutato (difensivo)', cNull);
  } else {
    console.log(`  ⚠️  expires_at è NOT NULL in magic_links (insert → ${insNull.status}): test expires_at NULL saltato, il fix resta comunque difensivo`);
  }

  // Account senza hash: il link crea una credenziale casuale.
  const n = await creaAccount('linknoh', PW, { senzaHash: true });
  const tn = (await rpcServizio('crea_token_account', { p_tipo: 'magic', p_email: n.email })).body;
  const cn = (await rpc('consume_magic_link', { p_token: tn })).body;
  const salvataN = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(n.email)}&select=password_hash`)).body[0].password_hash;
  check(cn && cn.ok === true && /^pbkdf2\$/.test(cn.password_hash || '') && salvataN === cn.password_hash,
    'account senza hash: il link crea e salva una credenziale', cn);

  // reset_password.
  const r = await creaAccount('reset', PW);
  const tr = (await rpcServizio('crea_token_account', { p_tipo: 'reset', p_email: r.email })).body;
  const nuovo = pbkdf2('Nuova456!', nuovoSale());
  const malR = (await rpc('reset_password', { p_token: tr, p_new_hash: 'abc' })).body;
  check(malR && malR.motivo === 'dati_non_validi', 'reset con hash malformato → dati_non_validi (token non consumato)', malR);
  const okR = (await rpc('reset_password', { p_token: tr, p_new_hash: nuovo })).body;
  check(okR && okR.ok === true, 'reset con token valido', okR);
  check((await login(r.email, 'Nuova456!')).ok === true, 'dopo il reset si entra con la password nuova');
  const riusoR = (await rpc('reset_password', { p_token: tr, p_new_hash: nuovo })).body;
  check(riusoR && riusoR.motivo === 'token_non_valido', 'token di reset riusato → token_non_valido', riusoR);

  // change_password: esige sempre la vecchia credenziale.
  const c = await creaAccount('chg', PW);
  const nuovoC = pbkdf2('Cambiata789!', nuovoSale());
  const senzaVecchia = (await rpc('change_password', { p_nickname: c.nickname, p_old_hash: null, p_new_hash: nuovoC })).body;
  check(senzaVecchia && senzaVecchia.ok === false, 'cambio password con vecchia nulla → rifiutato', senzaVecchia);
  const vecchiaErrata = (await rpc('change_password', { p_nickname: c.nickname, p_old_hash: pbkdf2('x', nuovoSale()), p_new_hash: nuovoC })).body;
  check(vecchiaErrata && vecchiaErrata.motivo === 'credenziali_non_valide', 'cambio password con vecchia errata → rifiutato', vecchiaErrata);
  const okC = (await rpc('change_password', { p_nickname: c.nickname, p_old_hash: c.password_hash, p_new_hash: nuovoC })).body;
  check(okC && okC.ok === true, 'cambio password con la vecchia giusta', okC);
  check((await login(c.email, 'Cambiata789!')).ok === true, 'dopo il cambio si entra con la password nuova');

  // change_password conta i falliti come il login: 10 vecchie errate, poi anche quella giusta
  // viene rifiutata con troppi_tentativi (e la password resta quella di prima).
  const ct = await creaAccount('chgtetto', PW);
  const nuovoCT = pbkdf2('Cambiata789!', nuovoSale());
  for (let i = 0; i < 10; i++) {
    await rpc('change_password', { p_nickname: ct.nickname, p_old_hash: pbkdf2('x', nuovoSale()), p_new_hash: nuovoCT });
  }
  const ctBloccato = await rpc('change_password', { p_nickname: ct.nickname, p_old_hash: ct.password_hash, p_new_hash: nuovoCT });
  check(ctBloccato.status === 200 && ctBloccato.body && ctBloccato.body.motivo === 'troppi_tentativi',
    'change_password: 11° tentativo (anche giusto) → troppi_tentativi, come valore', ctBloccato);
  const ctHash = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(ct.email)}&select=password_hash`)).body;
  check(ctHash && ctHash[0] && ctHash[0].password_hash === ct.password_hash, 'change_password bloccato: la password non cambia', ctHash);
  const ctRighe = (await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(ct.email)}&select=id`)).body;
  check(Array.isArray(ctRighe) && ctRighe.length === 10, 'change_password: i falliti sono registrati per l\'email del profilo', ctRighe && ctRighe.length);
  const upBloccato = (await rpc('update_my_profile', { p_nickname: ct.nickname, p_password_hash: ct.password_hash, p_fields: { bio: 'x' } })).body;
  check(upBloccato && upBloccato.motivo === 'troppi_tentativi', 'update_my_profile rispetta lo stesso tetto', upBloccato);
  await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(ct.email)}`, { method: 'DELETE' });

  // update_my_profile: whitelist e credenziale.
  const p = await creaAccount('prof', PW);
  const upOk = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash,
    p_fields: { bio: 'ciao', interests: ['meditazione'], telepathy_score: 3, show_telepathy_score: false } })).body;
  check(upOk && upOk.ok === true, 'modifica dei campi pubblici', upOk);
  const letta = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(p.email)}&select=bio,interests,telepathy_score,show_telepathy_score,email`)).body[0];
  check(letta.bio === 'ciao' && letta.interests[0] === 'meditazione' && letta.telepathy_score === 3 && letta.show_telepathy_score === false,
    'i campi sono davvero scritti', letta);
  const fuori = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash, p_fields: { email: 'x@y.z' } })).body;
  check(fuori && fuori.motivo === 'dati_non_validi', 'campo fuori whitelist (email) → dati_non_validi', fuori);
  const fuori2 = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash, p_fields: { password_hash: 'x' } })).body;
  check(fuori2 && fuori2.motivo === 'dati_non_validi', 'campo fuori whitelist (password_hash) → dati_non_validi', fuori2);
  const lungo = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash, p_fields: { bio: 'x'.repeat(1001) } })).body;
  check(lungo && lungo.motivo === 'dati_non_validi', 'bio oltre 1000 caratteri → dati_non_validi', lungo);
  // Fix round 1: valori oltre il range di int devono essere rifiutati PRIMA del ::int (mai un RAISE/500).
  const rTS = await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash, p_fields: { telepathy_score: 1e12 } });
  check(rTS.status === 200 && rTS.body && rTS.body.motivo === 'dati_non_validi',
    'telepathy_score oltre il range int (1e12) → dati_non_validi, HTTP 200 (non RAISE)', rTS);
  const rTB = await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: p.password_hash, p_fields: { telepathy_best: 1e12 } });
  check(rTB.status === 200 && rTB.body && rTB.body.motivo === 'dati_non_validi',
    'telepathy_best oltre il range int (1e12) → dati_non_validi, HTTP 200 (non RAISE)', rTB);
  const senzaCred = (await rpc('update_my_profile', { p_nickname: p.nickname, p_password_hash: null, p_fields: { bio: 'hack' } })).body;
  check(senzaCred && senzaCred.motivo === 'credenziali_non_valide', 'credenziale nulla → credenziali_non_valide', senzaCred);
  const bio = (await serviceFetch(`profiles?email=eq.${encodeURIComponent(p.email)}&select=bio`)).body[0].bio;
  check(bio === 'ciao', 'dopo i rifiuti il profilo è invariato', bio);
  const upRighe = (await serviceFetch(`login_attempts?email=eq.${encodeURIComponent(p.email)}&select=id`)).body;
  check(Array.isArray(upRighe) && upRighe.length === 1, 'update_my_profile: la credenziale sbagliata conta come fallito', upRighe && upRighe.length);
}

async function testTelepatia() {
  console.log('\n— get_telepathy_leaderboard / get_my_telepathy_totals / merge_telepathy_scores —');
  const PW = 'Password123!';
  const a = await creaAccount('tele', PW);
  const ospite = `acct-ospite-${TS}`;
  const vittima = await creaAccount('vitt', PW);
  const cleanupScores = [a.email, ospite, vittima.email];
  // Registrati subito (prima di qualunque RPC che potrebbe eccepire): la pulizia in fondo alla
  // funzione gira SOLO se non c'è stata eccezione, quindi il try/finally è la rete di sicurezza
  // per la produzione — niente righe di test lasciate in telepathy_scores su un fallimento.
  try {
    await rpc('increment_telepathy_score', { p_user_id: ospite, p_nickname: 'Ospite', p_rounds: 7, p_matches: 3 });
    await rpc('increment_telepathy_score', { p_user_id: vittima.email, p_nickname: vittima.nickname, p_rounds: 5, p_matches: 2 });

    const lb = (await rpc('get_telepathy_leaderboard', { p_limit: 10 })).body;
    check(Array.isArray(lb) && lb.length > 0 && lb.every(r => !('user_id' in r)), 'la classifica non contiene user_id', lb && lb[0]);
    const lbMax = (await rpc('get_telepathy_leaderboard', { p_limit: 1000 })).body;
    check(Array.isArray(lbMax) && lbMax.length <= 50, 'la classifica non supera 50 righe', lbMax && lbMax.length);

    const tOspite = (await rpc('get_my_telepathy_totals', { p_user_id: ospite, p_password_hash: null })).body;
    check(tOspite[0] && tOspite[0].rounds_count === 7, 'ospite: i propri totali con il solo id', tOspite);
    const tVittima = (await rpc('get_my_telepathy_totals', { p_user_id: vittima.email, p_password_hash: null })).body;
    check(Array.isArray(tVittima) && tVittima.length === 0, 'email registrata senza credenziale: nessun totale', tVittima);
    const tVittimaOk = (await rpc('get_my_telepathy_totals', { p_user_id: vittima.email, p_password_hash: vittima.password_hash })).body;
    check(tVittimaOk[0] && tVittimaOk[0].rounds_count === 5, 'email registrata con credenziale: totali', tVittimaOk);

    const senzaCred = await rpc('merge_telepathy_scores', { p_old_user_id: ospite, p_new_user_id: a.email, p_nickname: 'X', p_password_hash: pbkdf2('x', nuovoSale()) });
    check(senzaCred.status >= 400, 'fusione con credenziale sbagliata → rifiutata', senzaCred.body);
    const furto = await rpc('merge_telepathy_scores', { p_old_user_id: vittima.email, p_new_user_id: a.email, p_nickname: 'X', p_password_hash: a.password_hash });
    const vittimaDopo = (await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(vittima.email)}&select=rounds_count`)).body;
    check(vittimaDopo[0] && vittimaDopo[0].rounds_count === 5, 'non si può svuotare la riga di un account registrato usandola come «vecchia»', { furto: furto.body, vittimaDopo });
    const ok = await rpc('merge_telepathy_scores', { p_old_user_id: ospite, p_new_user_id: a.email, p_nickname: 'NomeFinto', p_password_hash: a.password_hash });
    check(Array.isArray(ok.body) && ok.body[0] && ok.body[0].out_rounds === 7, 'fusione legittima ospite → account', ok.body);
    const nick = (await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(a.email)}&select=nickname`)).body[0].nickname;
    check(nick === a.nickname, 'la fusione scrive il nickname del profilo, non quello passato', nick);
  } finally {
    for (const u of cleanupScores) await serviceFetch(`telepathy_scores?user_id=eq.${encodeURIComponent(u)}`, { method: 'DELETE' });
  }
}

async function pulizia() {
  for (const e of EMAILS) await deleteTestAccount(e);
  await serviceFetch(`login_attempts?email=like.nessuno-${TS}@test.com`, { method: 'DELETE' });
  // Rete di sicurezza: se il test si interrompe a metà, queste righe finte non devono
  // restare a bloccare l'IP di questa macchina o a sporcare login_attempts.
  await serviceFetch(`login_attempts?email=like.acct-ipfill-*-${TS}@test.com`, { method: 'DELETE' });
  await serviceFetch(`login_attempts?email=like.acct-glob-*-${TS}@test.com`, { method: 'DELETE' });
}

(async () => {
  try {
    await testLoginERegistrazione();
    await testLinkResetProfilo();
    await testTelepatia();
  } catch (e) {
    fail('eccezione: ' + e.message);
  } finally {
    await pulizia();
    console.log(`\n${passed} passati, ${failed} falliti`);
  }
})();
