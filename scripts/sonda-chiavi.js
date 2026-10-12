/**
 * sonda-chiavi.js — dal vivo: nessun session_id si legge con la chiave pubblica.
 *
 * Due ospiti di prova (session_id casuali) si fanno vedere online, entrano in coda, uno crea un
 * rituale, l'altro si iscrive e accende la candela. Poi, con la sola chiave anon, si leggono
 * tabelle, viste e RPC che l'app usa: nessuna risposta deve contenere i due session_id.
 * Con --dopo-36b controlla anche che online_users, telepathy_queue e rituals siano chiuse
 * ad anon in lettura e scrittura (42501 / 401 / 403).
 *
 * Esecuzione (da global-awakening/, o da un worktree caricando prima loadTestEnv):
 *   node scripts/sonda-chiavi.js [--dopo-36b]
 * La pulizia usa la chiave di servizio e gira anche se un controllo fallisce.
 */
const { serviceFetch, SUPABASE_URL } = require('../test-helpers');

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const DOPO_36B = process.argv.includes('--dopo-36b');
const caso = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const SID1 = `sonda-${caso()}`;
const SID2 = `sonda-${caso()}`;
const NICK1 = `Sonda1_${Date.now()}`;
const NICK2 = `Sonda2_${Date.now()}`;
// Le chiude la 36b: prima della 36b una fuga qui è attesa e non fa fallire la sonda.
const CHIUDE_LA_36B = ['online_users', 'telepathy_queue', 'rituals', 'rituali_correnti'];
const TABELLE = ['online_users', 'telepathy_queue', 'telepathy_matches', 'rituals', 'rituali_correnti', 'rituali_pubblici',
  'telepathy_invites', 'notifications', 'profiles', 'push_subscriptions', 'telepathy_trials', 'telepathy_scores',
  'ritual_comments', 'consciousness_posts', 'consciousness_comments', 'telepathy_chat', 'user_blocks', 'content_reports'];

let passati = 0, falliti = 0;
const ok = (m) => { console.log(`  ✅ ${m}`); passati++; };
const ko = (m) => { console.log(`  ❌ ${m}`); falliti++; process.exitCode = 1; };
const check = (c, m, dettaglio) => (c ? ok(m) : ko(dettaglio === undefined ? m : `${m} — ${JSON.stringify(dettaglio).slice(0, 300)}`));

async function anon(percorso, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${percorso}`, { ...opts,
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) } });
  const testo = await r.text();
  let body = testo; try { body = JSON.parse(testo); } catch (_) { /* testo */ }
  return { status: r.status, testo, body };
}
const rpc = (fn, params) => anon(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
const chiusa = (r) => [401, 403].includes(r.status) || String(r.body && r.body.code) === '42501';
const senzaSid = (r) => !r.testo.includes(SID1) && !r.testo.includes(SID2);

(async () => {
  let ritId = null;
  try {
    console.log('— Preparazione —');
    const p1 = await rpc('aggiorna_presenza', { p_session_id: SID1, p_password_hash: null, p_nickname: NICK1, p_lat: 45.4, p_lng: 9.2 });
    const p2 = await rpc('aggiorna_presenza', { p_session_id: SID2, p_password_hash: null, p_nickname: NICK2, p_lat: 41.9, p_lng: 12.5 });
    check(p1.status === 200 && p2.status === 200, 'due ospiti di prova online', [p1.status, p2.status]);
    const q = await rpc('coda_entra', { p_session_id: SID1, p_password_hash: null, p_nickname: NICK1 });
    check(q.status === 200, 'il primo entra in coda', q.body);
    const t = new Date(Date.now() - 60000);
    const cr = await rpc('create_ritual', {
      p_creator: NICK1, p_creator_id: SID1, p_name: `Sonda-${Date.now()}`, p_description: 'sonda chiavi',
      p_type: 'consciousness', p_sacred_number: 11, p_date: t.toISOString().slice(0, 10),
      p_time: t.toISOString().slice(11, 19), p_duration: 30, p_password_hash: null });
    ritId = Array.isArray(cr.body) && cr.body[0] ? cr.body[0].id : null;
    check(ritId != null, 'rituale di prova creato (in corso)', cr.body);
    if (ritId != null) {
      const j = await rpc('join_ritual', { p_ritual_id: ritId, p_session_id: SID2 });
      check(j.status < 300, 'il secondo si iscrive', j.body);
      await rpc('segna_presenza_rituale', { p_ritual_id: ritId, p_session_id: SID2 });
      const c = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID2, p_nickname: NICK2 });
      check(Array.isArray(c.body) && c.body.length === 1, 'il secondo accende la candela', c.body);
      check(senzaSid(c), 'la risposta della candela non contiene session_id');
      const vero = await serviceFetch(`rituals?id=eq.${ritId}&select=participants,candles`);
      const riga = vero.body && vero.body[0];
      check(riga && JSON.stringify(riga).includes(SID2), 'nel database la candela e l\'iscrizione ci sono (la sonda non è vuota)', riga);
    }

    console.log('— Letture con la chiave pubblica —');
    for (const tab of TABELLE) {
      const r = await anon(`${tab}?select=*`);
      if (chiusa(r)) { ok(`${tab}: non leggibile`); continue; }
      if (!DOPO_36B && CHIUDE_LA_36B.includes(tab) && r.status === 200 && !senzaSid(r)) {
        console.log(`  ⏳ ${tab}: session_id ancora leggibile — atteso, la chiude la 36b`);
        continue;
      }
      check(r.status === 200 && senzaSid(r), `${tab}: nessun session_id di prova`, r.status === 200 ? 'session_id trovato' : r.body);
    }
    const presenza = await rpc('aggiorna_presenza', { p_session_id: SID2, p_password_hash: null, p_nickname: NICK2, p_lat: 41.9, p_lng: 12.5 });
    check(presenza.status === 200 && !presenza.testo.includes(SID1), 'aggiorna_presenza del secondo non mostra il session_id del primo', presenza.body);
    const coda = await rpc('coda_leggi', { p_session_id: SID2 });
    check(coda.status === 200 && !coda.testo.includes(SID1), 'coda_leggi del secondo non mostra il session_id del primo', coda.body);
    if (ritId != null) {
      const v = await anon(`rituali_pubblici?id=eq.${ritId}`);
      const r = Array.isArray(v.body) ? v.body[0] : null;
      check(r && r.participants.length === 2 && r.candles.length === 1 && senzaSid(v),
        'rituali_pubblici: due iscritti e una candela, con id pubblici', v.body);
    }

    if (DOPO_36B) {
      console.log('— Dopo la 36b: tabelle chiuse ad anon —');
      for (const tab of ['online_users', 'telepathy_queue', 'rituals']) {
        check(chiusa(await anon(`${tab}?select=*`)), `${tab}: SELECT chiusa`);
        check(chiusa(await anon(tab, { method: 'POST', body: JSON.stringify({}) })), `${tab}: INSERT chiusa`);
        check(chiusa(await anon(`${tab}?id=eq.0`, { method: 'PATCH', body: JSON.stringify({}) })), `${tab}: PATCH chiusa`);
        check(chiusa(await anon(`${tab}?id=eq.0`, { method: 'DELETE' })), `${tab}: DELETE chiusa`);
      }
    }
  } catch (e) {
    ko(`eccezione: ${e.message}`);
  } finally {
    console.log('— Pulizia —');
    const e = encodeURIComponent;
    const via = [`online_users?id=in.(${e(SID1)},${e(SID2)})`, `telepathy_queue?id=in.(${e(SID1)},${e(SID2)})`,
      `rituals?creator=eq.${e(NICK1)}`];
    if (ritId != null) via.push(`ritual_presence?ritual_id=eq.${ritId}`);
    for (const p of via) await serviceFetch(p, { method: 'DELETE' }).catch(() => {});
    const resti = [];
    for (const p of via) { const r = await serviceFetch(`${p}&select=*`); if (Array.isArray(r.body) && r.body.length) resti.push(p); }
    check(resti.length === 0, 'non resta nulla della sonda', resti);
    console.log(`\nRisultato: ${passati} passati, ${falliti} falliti`);
  }
})();
