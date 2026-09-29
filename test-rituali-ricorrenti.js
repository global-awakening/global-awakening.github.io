/**
 * Rituali che si ripetono, sul database vero — Global Awakening
 *
 * Verifica supabase/sql/28_rituali_ricorrenti.sql attraverso PostgREST, cioè per la stessa
 * strada che usa l'app. La logica a fondo è già coperta da test-rituali-ricorrenti-sql.js
 * (PGlite); qui si prova solo che il contratto arrivi intatto sul server vero: ora legale,
 * vista, tabella chiusa, compatibilità con l'app online, ciclo in corso, dedup notifiche.
 *
 * Esecuzione: NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali-ricorrenti.js
 * Auto-pulizia: è il database di produzione, quindi ogni riga creata (rituali per creator_id
 * con prefisso rric-<TS>, abbonamento push finto) viene rimossa in `finally` con la chiave di
 * servizio; le righe figlie (presenze, notifiche) se ne vanno a cascata.
 */
const { requireServiceKey, serviceFetch, SUPABASE_URL } = require('./test-helpers');

requireServiceKey();
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TS = Date.now();
const PREFISSO = `rric-${TS}`;
const ENDPOINT = `https://test.invalid/rric-${TS}`;

let passed = 0, failed = 0;
const pass = (m) => { console.log(`  ✅ ${m}`); passed++; };
const fail = (m) => { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; };
const check = (cond, m, extra) => cond ? pass(m) : fail(extra !== undefined ? `${m} — ${JSON.stringify(extra)}` : m);

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
const ok = (r) => r.status >= 200 && r.status < 300;
const msg = (r) => String(r.body && r.body.message);

// Rituale via RPC pubblica; un creator_id diverso per caso (rate limit: 5 ogni 10 minuti).
async function crea(tag, extra) {
  const r = await rpc('create_ritual', {
    p_creator: 'Ospite', p_creator_id: `${PREFISSO}-${tag}`, p_name: `Prova ricorrente ${tag}`,
    p_description: 'prova sul database vero', p_type: 'consciousness', p_sacred_number: 11,
    p_duration: 30, p_password_hash: '', ...extra,
  });
  if (!ok(r) || !Array.isArray(r.body) || !r.body[0]) {
    throw new Error(`creazione ${tag} fallita: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body[0];
}

(async () => {
  console.log('\n— Rituali ricorrenti sul database vero —');
  try {
    // 1. Ora legale sul server vero: le 07:00 di Roma restano le 07:00 dopo il 25/10.
    {
      const r = await crea('a', { p_date: '2026-10-23', p_time: '05:00', p_ripeti_giorni: [1, 2, 3, 4, 5, 6, 7],
                                  p_ripeti_fino: '2026-10-27', p_fuso: 'Europe/Rome' });
      const occ = await rpc('get_ritual_occurrences', { p_ritual_id: r.id });
      const attese = ['2026-10-23T05:00:00', '2026-10-24T05:00:00', '2026-10-25T06:00:00',
                      '2026-10-26T06:00:00', '2026-10-27T06:00:00'];
      const viste = Array.isArray(occ.body) ? occ.body.map((s) => new Date(s).toISOString().slice(0, 19)) : occ.body;
      check(ok(occ) && JSON.stringify(viste) === JSON.stringify(attese),
        'get_ritual_occurrences: 5 appuntamenti, 07:00 di Roma anche dopo il cambio ora', occ.body);

      // 2. La vista espone le colonne nuove; la tabella delle presenze è chiusa alla chiave pubblica.
      const v = await anon(`rituali_correnti?id=eq.${r.id}`);
      const riga = Array.isArray(v.body) ? v.body[0] : null;
      check(riga && riga.date && riga.time && riga.occorrenza_numero === 1 && riga.occorrenze_totali === 5
            && riga.presenti_ora === 0,
        'la vista restituisce date, time, occorrenza_numero, occorrenze_totali, presenti_ora', v.body);
      const p = await anon('ritual_presence?select=*');
      check([401, 403].includes(p.status) || String(p.body && p.body.code) === '42501',
        'ritual_presence è chiusa alla chiave pubblica', { status: p.status, body: p.body });
    }

    // 3. La chiamata a 10 parametri dell'app online crea ancora un rituale singolo.
    {
      const r = await crea('b', { p_date: '2026-12-01', p_time: '08:00' });
      check(r.ripeti_giorni === null && r.ripeti_fino === null && r.fuso === null,
        'la chiamata a 10 parametri crea un rituale singolo (nessuna regola)', r);
      const v = await anon(`rituali_correnti?id=eq.${r.id}`);
      const riga = Array.isArray(v.body) ? v.body[0] : null;
      check(riga && riga.date === '2026-12-01' && riga.time === '08:00:00' && riga.occorrenza_numero === 1
            && riga.occorrenze_totali === 1, 'per il singolo la vista lascia data e ora intatte', v.body);
    }

    // 4. Ciclo in corso: giornaliero in UTC, partito 2 giorni fa, iniziato un minuto fa.
    {
      const ora = new Date();
      const inizio = new Date(ora.getTime() - 2 * 86400000);
      const alle = new Date(ora.getTime() - 60000).toISOString().slice(11, 16);
      const fino = new Date(ora.getTime() + 5 * 86400000).toISOString().slice(0, 10);
      const c = await crea('c', { p_date: inizio.toISOString().slice(0, 10), p_time: alle,
                                  p_ripeti_giorni: [1, 2, 3, 4, 5, 6, 7], p_ripeti_fino: fino, p_fuso: 'UTC' });
      const ospite = `${PREFISSO}-ospite`;
      const j = await rpc('join_ritual', { p_ritual_id: c.id, p_session_id: ospite });
      check(ok(j), 'un ospite si iscrive al ciclo', j.body);
      const s = await rpc('segna_presenza_rituale', { p_ritual_id: c.id, p_session_id: ospite });
      check(ok(s) && s.body === 1, 'segna_presenza_rituale restituisce 1 presente', s.body);
      const v = await anon(`rituali_correnti?id=eq.${c.id}`);
      check(v.body[0] && v.body[0].presenti_ora === 1 && v.body[0].occorrenza_numero === 3,
        'la vista conta 1 presente ora e l\'appuntamento numero 3', v.body);

      const l = await rpc('leave_ritual', { p_ritual_id: c.id, p_session_id: ospite, p_password_hash: '' });
      const dopo = await serviceFetch(`rituals?id=eq.${c.id}&select=participants`);
      check(ok(l) && Array.isArray(dopo.body) && !JSON.stringify(dopo.body[0].participants).includes(ospite),
        'leave_ritual: l\'ospite esce dal ciclo', { l: l.body, dopo: dopo.body });
      const lc = await rpc('leave_ritual', { p_ritual_id: c.id, p_session_id: `${PREFISSO}-c`, p_password_hash: '' });
      check(!ok(lc) && msg(lc).includes('creator_cannot_leave'), 'il creatore non può uscire dal proprio ciclo', lc.body);

      // 5. Dedup notifiche, sullo stesso ciclo (prima di fermarlo). Abbonamento finto: creato e
      //    cancellato qui. L'insert senza `occorrenza` deve prendere l'appuntamento corrente.
      const sub = await serviceFetch('push_subscriptions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ session_id: `${PREFISSO}-sub`, endpoint: ENDPOINT, p256dh: 'x', auth: 'x' }),
      });
      const subId = Array.isArray(sub.body) && sub.body[0] && sub.body[0].id;
      if (!subId) throw new Error(`abbonamento finto non creato: ${sub.status} ${JSON.stringify(sub.body)}`);
      const corrente = new Date(`${v.body[0].date}T${v.body[0].time}Z`).getTime();
      const riga = { ritual_id: c.id, subscription_id: subId, kind: 'start' };
      const n1 = await serviceFetch('ritual_notifications_sent', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(riga),
      });
      const occ = Array.isArray(n1.body) && n1.body[0] && new Date(n1.body[0].occorrenza).getTime();
      check(ok(n1) && occ === corrente, 'l\'insert senza occorrenza prende l\'appuntamento corrente',
        { status: n1.status, body: n1.body, atteso: new Date(corrente).toISOString() });
      const n2 = await serviceFetch('ritual_notifications_sent', { method: 'POST', body: JSON.stringify(riga) });
      check(n2.status === 409, 'secondo insert uguale respinto (409)', { status: n2.status, body: n2.body });

      // Fermare il ciclo: prima un altro non può, poi il creatore sì, e non due volte.
      const fa = await rpc('ferma_rituale', { p_ritual_id: c.id, p_session_id: ospite, p_password_hash: '' });
      check(!ok(fa) && msg(fa).includes('not_creator'), 'un altro non può fermare il ciclo', fa.body);
      const f = await rpc('ferma_rituale', { p_ritual_id: c.id, p_session_id: `${PREFISSO}-c`, p_password_hash: '' });
      check(ok(f), 'il creatore ferma il ciclo', f.body);
      const fermo = await serviceFetch(`rituals?id=eq.${c.id}&select=fermato_il`);
      check(fermo.body[0] && fermo.body[0].fermato_il, 'fermato_il è valorizzato', fermo.body);
      const f2 = await rpc('ferma_rituale', { p_ritual_id: c.id, p_session_id: `${PREFISSO}-c`, p_password_hash: '' });
      check(!ok(f2) && msg(f2).includes('already_stopped'), 'fermare due volte dà already_stopped', f2.body);
    }
  } catch (e) {
    fail(`errore imprevisto: ${e.message}`);
  } finally {
    console.log('\n— Pulizia —');
    const a = await serviceFetch(`rituals?creator_id=like.${PREFISSO}*`, { method: 'DELETE' });
    const b = await serviceFetch(`push_subscriptions?endpoint=eq.${encodeURIComponent(ENDPOINT)}`, { method: 'DELETE' });
    console.log(`  rituali: HTTP ${a.status}, abbonamento finto: HTTP ${b.status}`);
    const resto = await serviceFetch(`rituals?creator_id=like.${PREFISSO}*&select=id`);
    check(Array.isArray(resto.body) && resto.body.length === 0, 'nessun rituale di prova rimasto');
    console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  }
})();
