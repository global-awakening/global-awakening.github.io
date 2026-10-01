/**
 * Le RPC degli inviti offline sul database VERO, con la chiave pubblica come l'app.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-rpc.js
 *
 * Prerequisiti: 32a applicata, notify-telepathy-invite pubblicata, SUPABASE_SERVICE_KEY in
 * .env.test (serve solo per ripulire: senza, il test non parte).
 *
 * ⚠️ Gira sul database di produzione, con persone vere dentro. Per pochi secondi la riga di
 * disponibilità di prova è visibile nella lista «Disponibili su invito»: nickname con prefisso
 * GAInvRpc_, session_id con prefisso gainvrpc_, tutto con il timestamp del lancio. Lanciarlo in
 * un orario tranquillo. Nessuna persona vera viene toccata: gli unici destinatari sono i due
 * session_id di prova. L'abbonamento push di B è finto (endpoint FCM inventato, mai di una
 * persona): se la Edge Function prova a spedirgli qualcosa, la spedizione fallisce da sola e
 * l'abbonamento finto viene comunque cancellato dalla pulizia.
 * Pulizia nel finally, con filtri sui soli due session_id / nickname di questo lancio.
 */
const { getServiceKey, purge, serviceFetch } = require('./test-helpers');

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TS = Date.now();
const A = { sid: `gainvrpc_a_${TS}`, nick: `GAInvRpc_A_${TS}` };
const B = { sid: `gainvrpc_b_${TS}`, nick: `GAInvRpc_B_${TS}` };

let passati = 0, falliti = 0;
const check = (c, m, x) => {
  if (c) { console.log('  ✅ ' + m); passati++; }
  else { console.log('  ❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); falliti++; process.exitCode = 1; }
};

// Con la chiave di servizio: le prenotazioni e i residui non sono leggibili dall'app.
async function righe(percorso) {
  const r = await serviceFetch(percorso, { method: 'GET' });
  return r.status === 200 && Array.isArray(r.body) ? r.body : null;
}
const aspetta = (ms) => new Promise((fatto) => setTimeout(fatto, ms));

async function rpc(fn, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { stato: r.status, j };
}
// Ospiti: nessun profilo, quindi nessuna password da verificare.
const tu = (p) => ({ p_session_id: p.sid, p_password_hash: null });
const abbona = (p) => rpc('register_push_subscription', { p_session_id: p.sid,
  p_endpoint: `https://fcm.googleapis.com/fcm/send/gainvrpc_${p.sid}`, p_p256dh: 'p256dh_finta', p_auth: 'auth_finta', p_locale: 'it' });

(async () => {
  if (!getServiceKey()) { console.log('⛔ serve SUPABASE_SERVICE_KEY in .env.test per ripulire: non parto.'); process.exit(2); }
  try {
    let r = await rpc('set_telepathy_availability', { ...tu(B), p_nickname: B.nick, p_enabled: true });
    check(r.stato === 200 && r.j && r.j.ok === false && r.j.motivo === 'nessun_abbonamento', 'senza abbonamento non si accende', r);
    if (r.stato === 404) { console.log('  (RPC assenti: la 32a non è applicata, mi fermo)'); return; }

    r = await abbona(B);
    check(r.stato === 200 || r.stato === 204, 'B registra un abbonamento push finto', r);
    r = await rpc('set_telepathy_availability', { ...tu(B), p_nickname: B.nick, p_enabled: true });
    check(r.j && r.j.ok === true && r.j.acceso === true, 'con l\'abbonamento si accende', r);

    r = await rpc('renew_telepathy_availability', tu(B));
    check(r.j && r.j.ok === true && r.j.stato === 'acceso', 'il rinnovo dice «acceso»', r.j);

    r = await rpc('get_invitable_users', { ...tu(A), p_nickname: A.nick });
    const riga = Array.isArray(r.j) ? r.j.find((x) => x.nickname === B.nick) : null;
    check(!!riga && Object.keys(riga).sort().join(',') === 'id,nickname', 'B è nella lista di A, con il solo id opaco', r.j && r.j.length);
    if (!riga) return;
    check(!JSON.stringify(r.j).includes(B.sid), 'la lista non contiene il session_id di B');

    r = await rpc('get_invite_card', { ...tu(A), p_nickname: A.nick, p_disponibilita_id: riga.id, p_session_online: null });
    check(r.j && r.j.ok === true && r.j.scheda && r.j.scheda.nickname === B.nick && !JSON.stringify(r.j).includes(B.sid),
      'la scheda di B non contiene il suo session_id', r.j);
    r = await rpc('get_invite_card', { ...tu(A), p_nickname: A.nick, p_disponibilita_id: null, p_session_online: null });
    check(r.j && r.j.ok === false && r.j.motivo === 'dati_non_validi', 'scheda senza nessuna indicazione: dati_non_validi', r.j);

    r = await rpc('send_telepathy_invite', { ...tu(A), p_nickname: A.nick, p_disponibilita_id: riga.id, p_session_online: null });
    check(r.j && r.j.ok === true && r.j.push_saltata === false, 'A invita B (10 minuti, con push)', r.j);
    const invito = r.j && r.j.id;
    const secondi = r.j && r.j.expires_at ? (Date.parse(r.j.expires_at) - Date.parse(r.j.adesso)) / 1000 : 0;
    check(secondi > 590 && secondi <= 600, 'B offline: 10 minuti dall\'ora del server', secondi);
    if (!invito) return;

    // La push parte con pg_net DOPO il commit, in modo asincrono: prima di andare avanti (e prima
    // della pulizia) si aspetta che la Edge Function abbia prenotato la push d'invito. È anche
    // l'unica prova che la funzione sia stata raggiunta. Se B rifiutasse prima, la funzione
    // troverebbe l'invito chiuso e non prenoterebbe niente. Ripiego: se il servizio push avesse
    // dichiarato morto l'abbonamento finto (404/410), la funzione lo cancella e la prenotazione
    // sparisce con lui a cascata; anche quello prova che la funzione è stata raggiunta.
    let raggiunta = null;
    for (let i = 0; i < 20 && !raggiunta; i++) {
      const pren = await righe(`telepathy_invite_pushes?invite_id=eq.${invito}&kind=eq.invito&select=invite_id`);
      if (pren && pren.length > 0) { raggiunta = 'prenotazione'; break; }
      const ab = await righe(`push_subscriptions?session_id=eq.${B.sid}&select=id,failure_count`);
      if (ab && (ab.length === 0 || ab.some((x) => (x.failure_count ?? 0) > 0))) { raggiunta = 'abbonamento toccato'; break; }
      await aspetta(500);
    }
    check(raggiunta !== null, 'la Edge Function è stata raggiunta e ha prenotato la push d\'invito (≤10 s)', raggiunta);

    r = await rpc('send_telepathy_invite', { ...tu(A), p_nickname: A.nick, p_disponibilita_id: riga.id, p_session_online: null });
    check(r.j && r.j.ok === false && r.j.motivo === 'invito_in_corso', 'un secondo invito di A: invito_in_corso', r.j);

    r = await rpc('get_my_telepathy_invites', tu(B));
    check(r.j && r.j.in_arrivo && r.j.in_arrivo.id === invito && r.j.in_arrivo.from_id === A.sid, 'B vede l\'invito, con from_id', r.j);
    r = await rpc('get_my_telepathy_invites', tu(A));
    check(r.j && r.j.in_uscita && r.j.in_uscita.id === invito && !JSON.stringify(r.j).includes(B.sid),
      'A vede il suo invito, senza il session_id di B', r.j);

    r = await rpc('get_telepathy_invite', { p_invite_id: invito, ...tu(B) });
    check(r.j && r.j.ok === true && r.j.invito && r.j.invito.ruolo === 'destinatario' && r.j.invito.status === 'pending',
      'B apre l\'invito dalla notifica: destinatario, pending', r.j);

    r = await rpc('respond_telepathy_invite', { p_invite_id: invito, ...tu(A), p_accept: false, p_match_id: null });
    check(r.j && r.j.ok === false && r.j.motivo === 'non_trovato', 'A non può rispondere al proprio invito', r.j);

    r = await rpc('respond_telepathy_invite', { p_invite_id: invito, ...tu(B), p_accept: true, p_match_id: null });
    check(r.j && r.j.ok === false && r.j.motivo === 'match_non_valido', 'accettare senza un match valido: match_non_valido', r.j);

    r = await rpc('respond_telepathy_invite', { p_invite_id: invito, ...tu(B), p_accept: false, p_match_id: null });
    check(r.j && r.j.ok === true && r.j.status === 'declined', 'B rifiuta', r.j);
    r = await rpc('respond_telepathy_invite', { p_invite_id: invito, ...tu(B), p_accept: false, p_match_id: null });
    check(r.j && r.j.ok === false && r.j.motivo === 'rifiutato', 'un secondo rifiuto: motivo «rifiutato»', r.j);

    // Il database vero non deve poter essere scaduto da chiunque abbia la chiave pubblica.
    r = await rpc('expire_telepathy_invites', {});
    check(r.stato === 401 || r.stato === 403, 'expire_telepathy_invites non è chiamabile con la chiave pubblica', r.stato);

    r = await rpc('set_telepathy_availability', { ...tu(B), p_nickname: B.nick, p_enabled: false });
    check(r.j && r.j.ok === true && r.j.acceso === false, 'B spegne l\'interruttore', r.j);
    r = await rpc('get_invitable_users', { ...tu(A), p_nickname: A.nick });
    check(Array.isArray(r.j) && !r.j.some((x) => x.nickname === B.nick), 'spento, B non è più in lista', r.j);
  } catch (e) {
    check(false, 'eccezione imprevista nel test', String((e && e.message) || e));
  } finally {
    await purge(SUPABASE_URL, [
      `telepathy_invites?from_id=eq.${A.sid}`, `telepathy_invites?to_id=eq.${A.sid}`,
      `telepathy_invites?from_id=eq.${B.sid}`, `telepathy_invites?to_id=eq.${B.sid}`,
      `telepathy_availability?session_id=in.(${A.sid},${B.sid})`,
      `telepathy_invite_blocks?blocker_session=in.(${A.sid},${B.sid})`,
      `push_subscriptions?session_id=in.(${A.sid},${B.sid})`,
      `notifications?user_nickname=in.(${A.nick},${B.nick})`,
    ], { label: 'inviti-rpc' });

    // Residui: le stesse righe, contate dopo la pulizia con gli stessi filtri. Se ne resta anche
    // una il test fallisce: sul database vero non si lasciano tracce. Le prenotazioni seguono gli
    // inviti e gli abbonamenti a cascata.
    const residui = [
      `telepathy_invites?or=(from_id.in.(${A.sid},${B.sid}),to_id.in.(${A.sid},${B.sid}))&select=id`,
      `telepathy_availability?session_id=in.(${A.sid},${B.sid})&select=session_id`,
      `telepathy_invite_blocks?blocker_session=in.(${A.sid},${B.sid})&select=blocker_session`,
      `push_subscriptions?session_id=in.(${A.sid},${B.sid})&select=id`,
      `notifications?user_nickname=in.(${A.nick},${B.nick})&select=id`,
    ];
    let restano = 0;
    for (const p of residui) {
      const r = await righe(p);
      if (r === null) { check(false, 'conteggio dei residui non riuscito', p); continue; }
      restano += r.length;
    }
    check(restano === 0, 'dopo la pulizia non resta nessuna riga di prova', restano);
    // Qui e non dopo il finally: anche quando il test si ferma prima (return nel try), il
    // riepilogo si stampa.
    console.log(`\n${passati} passati, ${falliti} falliti`);
  }
})();
