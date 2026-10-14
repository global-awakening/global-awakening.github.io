/**
 * sonda-telepatia.js — sul DB vero: con la chiave pubblica si può ancora leggere o toccare una
 * partita di telepatia (telepathy_matches) o la sua chat (telepathy_chat)?
 *
 * Con la chiave di servizio crea una partita di prova fra due ospiti di prova e un messaggio di chat.
 * Poi:
 *   - controlla le RPC nuove della 39a (estraneo escluso, chi indovina non vede il simbolo);
 *   - prova con la chiave pubblica a leggere/scrivere/cancellare le due tabelle e a chiamare
 *     end_telepathy_match, e guarda con la chiave di servizio cos'è rimasto.
 *   node scripts/sonda-telepatia.js             prima della 39b: le falle sulle tabelle escono con ⏳
 *   node scripts/sonda-telepatia.js --dopo-39b  dopo la 39b: ogni falla è un ❌
 * I controlli sulle RPC (passi 3-4) sono veri in entrambe le modalità (ma richiedono la 39a applicata).
 * Serve SUPABASE_SERVICE_KEY (env o .env.test), come gli altri test. La pulizia gira anche se un
 * controllo fallisce e usa la chiave di servizio (la chat va via in cascata con la partita).
 */
const { SUPABASE_URL, requireServiceKey, getServiceKey } = require('../test-helpers');

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const DOPO = process.argv.includes('--dopo-39b');
const TS = Date.now();
const SID_A = `SondaTel_${TS}_A`;   // ospite che manda al round 0 (user1_role sender)
const SID_B = `SondaTel_${TS}_B`;   // ospite che indovina al round 0
const SID_X = `SondaTel_${TS}_X`;   // estraneo alla partita
const PREFISSO = `SondaTel_${TS}`;  // nickname di tutte le righe di prova (per la pulizia)
const NICK_A = `${PREFISSO}_A`;
const NICK_B = `${PREFISSO}_B`;
const NICK_ANON = `${PREFISSO}_anon`;

let passati = 0, falliti = 0, attese = 0;
const check = (ok, m, d) => {
  if (ok) { console.log(`  ✅ ${m}`); passati++; return; }
  console.log(`  ❌ ${m}${d === undefined ? '' : ' — ' + JSON.stringify(d).slice(0, 300)}`); falliti++; process.exitCode = 1;
};
// Prima della 39b la falla c'è ancora: si segna senza far fallire.
const chiusa = (ok, m, d) => {
  if (ok || DOPO) return check(ok, m, d);
  console.log(`  ⏳ ${m} (falla nota, si chiude con la 39b)`); attese++;
};

async function rest(chiave, path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: chiave, Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json',
               Prefer: 'return=representation', ...opts.headers },
  });
  const testo = await r.text();
  let corpo; try { corpo = JSON.parse(testo); } catch { corpo = testo; }
  return { status: r.status, corpo };
}
const rpc = (chiave, fn, params) => rest(chiave, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
const rifiutata = (r) => r.status === 401 || r.status === 403;

(async () => {
  requireServiceKey();
  const SVC = getServiceKey();
  const e = encodeURIComponent;
  let mid = null;
  try {
    console.log(`— Preparazione (${PREFISSO}) —`);
    const ia = await rpc(SVC, 'id_pubblico', { p_sid: SID_A });
    const ib = await rpc(SVC, 'id_pubblico', { p_sid: SID_B });
    const PUB_A = ia.corpo, PUB_B = ib.corpo;
    check(typeof PUB_A === 'string' && PUB_A.startsWith('pub_') && typeof PUB_B === 'string' && PUB_B.startsWith('pub_'),
      'id pubblici dei due ospiti di prova calcolati', [ia.status, ib.status]);
    if (!String(PUB_A).startsWith('pub_') || !String(PUB_B).startsWith('pub_')) throw new Error('id_pubblico non disponibile');

    const ins = await rest(SVC, 'telepathy_matches', { method: 'POST', body: JSON.stringify({
      user1_id: PUB_A, user1_nickname: NICK_A, user1_role: 'sender',
      user2_id: PUB_B, user2_nickname: NICK_B, user2_role: 'receiver', level: 'lvl3', round_count: 0 }) });
    mid = Array.isArray(ins.corpo) && ins.corpo[0] && ins.corpo[0].id;
    check(ins.status === 201 && mid, 'partita di prova creata con la chiave di servizio', ins);
    if (!mid) throw new Error('partita non creata');
    const msg = await rest(SVC, 'telepathy_chat', { method: 'POST', body: JSON.stringify({ match_id: mid, sender_name: NICK_A, content: 'messaggio della sonda' }) });
    check(msg.status === 201, 'messaggio di chat di prova creato', msg);

    console.log('— RPC con un estraneo (vere già prima della 39b) —');
    const stato = (sid) => rpc(ANON, 'partita_stato', { p_session_id: sid, p_password_hash: null, p_match_id: mid });
    const x1 = await stato(SID_X);
    check(x1.status === 200 && x1.corpo === null, 'partita_stato a un estraneo: null', x1);
    const x2 = await rpc(ANON, 'chat_leggi', { p_session_id: SID_X, p_password_hash: null, p_match_id: mid });
    check(x2.status === 200 && x2.corpo === null, 'chat_leggi a un estraneo: null', x2);
    const x3 = await rpc(ANON, 'partita_simbolo', { p_session_id: SID_X, p_password_hash: null, p_match_id: mid, p_simbolo: 'star', p_livello: null });
    check(x3.status === 200 && x3.corpo && x3.corpo.ok === false, 'partita_simbolo di un estraneo: ok false', x3);
    const x4 = await rpc(ANON, 'chat_scrivi', { p_session_id: SID_X, p_password_hash: null, p_match_id: mid, p_testo: 'intruso' });
    check(x4.status === 200 && x4.corpo && x4.corpo.ok === false, 'chat_scrivi di un estraneo: ok false', x4);
    await rpc(ANON, 'partita_esci', { p_session_id: SID_X, p_password_hash: null, p_match_id: mid });
    const aperta = await rest(SVC, `telepathy_matches?id=eq.${mid}&select=ended_at,ended_by`);
    check(aperta.corpo[0] && aperta.corpo[0].ended_at === null && aperta.corpo[0].ended_by === null,
      'partita_esci di un estraneo: la partita resta aperta', aperta.corpo);
    const chatX = await rest(SVC, `telepathy_chat?match_id=eq.${mid}&select=content`);
    check(Array.isArray(chatX.corpo) && chatX.corpo.length === 1, 'nessun messaggio dell\'estraneo in chat', chatX.corpo);

    console.log('— RPC con i giocatori: il simbolo resta nascosto a chi indovina —');
    const guess0 = await rpc(ANON, 'partita_simbolo', { p_session_id: SID_B, p_password_hash: null, p_match_id: mid, p_simbolo: 'star', p_livello: null });
    check(guess0.corpo && guess0.corpo.ok === false, 'chi indovina non può inviare il simbolo', guess0.corpo);
    const invio = await rpc(ANON, 'partita_simbolo', { p_session_id: SID_A, p_password_hash: null, p_match_id: mid, p_simbolo: 'star', p_livello: null });
    check(invio.status === 200 && invio.corpo && invio.corpo.ok === true, 'chi manda invia il simbolo', invio);
    const vistaB = await stato(SID_B);
    const vb = vistaB.corpo;
    check(vb && vb.sender_symbol === null && vb.simbolo_inviato === true,
      'chi indovina: sender_symbol null e simbolo_inviato true', vb);
    check(vb && vb.user1_id === PUB_A && vb.user2_id === PUB_B, 'la vista contiene solo id pubblici', vb);
    const vistaA = await stato(SID_A);
    check(vistaA.corpo && vistaA.corpo.sender_symbol === 'star', 'chi manda vede il proprio simbolo', vistaA.corpo);
    const wr = await rpc(ANON, 'chat_scrivi', { p_session_id: SID_B, p_password_hash: null, p_match_id: mid, p_testo: 'risposta della sonda' });
    check(wr.corpo && wr.corpo.ok === true, 'un giocatore scrive in chat', wr);
    const lett = await rpc(ANON, 'chat_leggi', { p_session_id: SID_A, p_password_hash: null, p_match_id: mid });
    check(Array.isArray(lett.corpo) && lett.corpo.length === 2, 'l\'altro giocatore legge i due messaggi', lett.corpo);

    console.log('— Tabelle con la chiave pubblica (falle note fino alla 39b) —');
    const gm = await rest(ANON, 'telepathy_matches?select=*');
    chiusa(rifiutata(gm) || (Array.isArray(gm.corpo) && !gm.corpo.some((m) => m.id === mid)),
      'anon non legge le partite', gm.status);
    const gc = await rest(ANON, 'telepathy_chat?select=*');
    chiusa(rifiutata(gc) || (Array.isArray(gc.corpo) && !gc.corpo.some((c) => c.match_id === mid)),
      'anon non legge la chat', gc.status);

    await rest(ANON, 'telepathy_matches', { method: 'POST', body: JSON.stringify({
      user1_id: 'pub_sonda_anon1', user1_nickname: NICK_ANON, user1_role: 'sender',
      user2_id: 'pub_sonda_anon2', user2_nickname: NICK_ANON, user2_role: 'receiver', level: 'lvl3', round_count: 0 }) });
    const pm = await rest(SVC, `telepathy_matches?user1_nickname=eq.${e(NICK_ANON)}&select=id`);
    chiusa(Array.isArray(pm.corpo) && pm.corpo.length === 0, 'anon non crea una partita', pm.corpo);
    await rest(ANON, 'telepathy_chat', { method: 'POST', body: JSON.stringify({ match_id: mid, sender_name: `${PREFISSO}_intruso`, content: 'scritto da anon' }) });
    const pc = await rest(SVC, `telepathy_chat?sender_name=eq.${e(`${PREFISSO}_intruso`)}&select=id`);
    chiusa(Array.isArray(pc.corpo) && pc.corpo.length === 0, 'anon non scrive in chat', pc.corpo);

    await rest(ANON, `telepathy_matches?id=eq.${mid}`, { method: 'PATCH', body: JSON.stringify({ level: 'lvl9', round_count: 99 }) });
    const rm = await rest(SVC, `telepathy_matches?id=eq.${mid}&select=level,round_count`);
    chiusa(rm.corpo[0] && rm.corpo[0].level === 'lvl3' && rm.corpo[0].round_count === 0, 'anon non riscrive una partita', rm.corpo);

    await rest(ANON, `telepathy_chat?match_id=eq.${mid}`, { method: 'DELETE' });
    const dc = await rest(SVC, `telepathy_chat?match_id=eq.${mid}&select=id`);
    chiusa(Array.isArray(dc.corpo) && dc.corpo.length >= 2, 'anon non cancella la chat', dc.corpo);

    const fine = await rpc(ANON, 'end_telepathy_match', { p_match_id: mid, p_ended_by: 'sonda' });
    const em = await rest(SVC, `telepathy_matches?id=eq.${mid}&select=ended_at`);
    chiusa(rifiutata(fine) || (em.corpo[0] && em.corpo[0].ended_at === null),
      'anon non chiude una partita con end_telepathy_match', [fine.status, em.corpo]);

    await rest(ANON, `telepathy_matches?id=eq.${mid}`, { method: 'DELETE' });
    const sm = await rest(SVC, `telepathy_matches?id=eq.${mid}&select=id`);
    chiusa(Array.isArray(sm.corpo) && sm.corpo.length === 1, 'anon non cancella una partita', sm.corpo);
  } catch (err) {
    check(false, `eccezione: ${err.message}`);
  } finally {
    console.log('— Pulizia —');
    const via = [`telepathy_matches?user1_nickname=like.${e(PREFISSO)}*`, `telepathy_matches?user1_nickname=eq.${e(NICK_ANON)}`];
    if (mid) via.push(`telepathy_matches?id=eq.${mid}`);
    for (const p of via) { try { await rest(SVC, p, { method: 'DELETE' }); } catch (_) { /* si verifica sotto */ } }
    const resti = [];
    for (const p of via) {
      try { const r = await rest(SVC, `${p}&select=id`); if (Array.isArray(r.corpo) && r.corpo.length) resti.push(p); } catch (_) { resti.push(p); }
    }
    check(resti.length === 0, 'non resta nulla della sonda', resti);
  }
  console.log(`\nRisultato: ${passati} passati, ${falliti} falliti${attese ? `, ${attese} falle note in attesa della 39b` : ''}`);
})().catch((err) => { console.error(err); process.exitCode = 1; });
