/**
 * Test candela rituali (Batch D #10) — Global Awakening
 *
 * Copre toggle_ritual_candle: accendi (count+1, presente), spegni (count-1, assente),
 * indipendenza tra session_id diversi, e dalla 30_ il nome di chi accende e il rifiuto
 * «not_live» fuori dall'appuntamento in corso.
 *
 * Esecuzione: NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali-candele.js
 * Prerequisito: aver applicato supabase/sql/30_candela_nella_stanza.sql.
 */
const { purge } = require('./test-helpers');

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS  = Date.now();
const CREATOR = `CandGuest_${TS}`;
const SID1 = `candle-s1-${TS}`;
const SID2 = `candle-s2-${TS}`;
// Dalla 30_ la candela si accende solo durante l'appuntamento: il rituale di prova è in corso
// (partito un minuto fa, dura 30 minuti); quello di domani serve a provare il rifiuto.
const T_LIVE = new Date(Date.now() - 60000);
const T_FUTURO = new Date(Date.now() + 86400000);
const NOME1 = `Luce_${TS}`;

let passed = 0, failed = 0;
function pass(m) { console.log(`  ✅ ${m}`); passed++; }
function fail(m) { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; }

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers },
    ...opts,
  });
  if (res.status === 204) return null;
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return txt; }
}
async function rpc(fn, params) {
  return sb(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });
}
const candlesOf = (row) => (row && row[0] && Array.isArray(row[0].candles)) ? row[0].candles : null;
const nomiOf = (row) => (row && row[0] && row[0].candles_nomi) || null;

(async () => {
  console.log('— Setup —');
  await rpc('cleanup_expired_rituals', {});
  const crea = (t, nome) => rpc('create_ritual', {
    p_creator: CREATOR, p_creator_id: SID1, p_name: nome,
    p_description: 'test', p_type: 'consciousness', p_sacred_number: 11,
    p_date: t.toISOString().slice(0, 10), p_time: t.toISOString().slice(11, 19), p_duration: 30, p_password_hash: null,
  });
  const created = await crea(T_LIVE, `Candela-${TS}`);
  const ritId = Array.isArray(created) && created[0] ? created[0].id : null;
  if (ritId == null) { fail(`setup: create_ritual fallito: ${JSON.stringify(created)}`); console.log(`\nRisultato: ${passed} passati, ${failed} falliti`); return; }
  pass('rituale di test creato (in corso)');
  const futuro = await crea(T_FUTURO, `Candela-futuro-${TS}`);
  const futId = Array.isArray(futuro) && futuro[0] ? futuro[0].id : null;
  if (futId == null) fail(`setup: create_ritual (futuro) fallito: ${JSON.stringify(futuro)}`);

  try {
    console.log('— Fuori dall\'appuntamento —');
    if (futId != null) {
      const nl = await rpc('toggle_ritual_candle', { p_ritual_id: futId, p_session_id: SID1, p_nickname: NOME1 });
      if (nl && !Array.isArray(nl) && /not_live/.test(nl.message || '')) pass('rituale di domani -> rifiutato con not_live');
      else fail(`rituale di domani: atteso not_live, ottenuto ${JSON.stringify(nl)}`);
    }

    console.log('— Toggle —');
    // Dalla 30_ si accende solo da presenti nella stanza (come fa l'app prima di accendere).
    await rpc('segna_presenza_rituale', { p_ritual_id: ritId, p_session_id: SID1 });
    await rpc('segna_presenza_rituale', { p_ritual_id: ritId, p_session_id: SID2 });
    let r = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID1, p_nickname: NOME1 });
    let c = candlesOf(r);
    if (c && c.includes(SID1) && c.length === 1) pass('accendi -> candela presente, count 1');
    else fail(`accendi fallito: ${JSON.stringify(r)}`);
    const nomi = nomiOf(r);
    if (nomi && nomi[SID1] === NOME1) pass('accendi -> il nome di chi accende è salvato');
    else fail(`nome non salvato: ${JSON.stringify(nomi)}`);

    r = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID1, p_nickname: NOME1 });
    c = candlesOf(r);
    if (c && !c.includes(SID1) && c.length === 0 && nomiOf(r) && !(SID1 in nomiOf(r))) pass('rispegni -> candela e nome assenti, count 0');
    else fail(`spegni fallito: ${JSON.stringify(r)}`);

    await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID1, p_nickname: NOME1 });
    // Senza p_nickname: la chiamata delle app ancora in cache (due parametri) deve funzionare.
    r = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID2 });
    c = candlesOf(r);
    if (c && c.includes(SID1) && c.includes(SID2) && c.length === 2) pass('due utenti (uno con la chiamata vecchia) -> count 2');
    else fail(`due utenti fallito: ${JSON.stringify(r)}`);

    r = await rpc('toggle_ritual_candle', { p_ritual_id: ritId, p_session_id: SID1, p_nickname: NOME1 });
    c = candlesOf(r);
    if (c && !c.includes(SID1) && c.includes(SID2) && c.length === 1) pass('spegni uno -> resta l\'altro, count 1');
    else fail(`indipendenza fallita: ${JSON.stringify(r)}`);
  } finally {
    console.log('— Teardown —');
    // Pulizia DETERMINISTICA dei rituali di questo run: purge filtra esattamente sul
    // creator del run via la chiave di servizio → cancella sempre, indipendentemente dalla
    // logica di scadenza di cleanup_expired_rituals (che resta nel Setup come igiene
    // iniziale). Cancellando il rituale spariscono anche le candele (JSONB su rituals).
    // Vedi test-helpers.js.
    await purge(SUPABASE_URL, [
      `rituals?creator=eq.${encodeURIComponent(CREATOR)}`,
    ], { label: 'rituali-candele' });
    console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  }
})();
