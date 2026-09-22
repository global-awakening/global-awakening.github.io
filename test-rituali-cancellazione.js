/**
 * Cancellazione di un rituale da parte di chi l'ha creato — Global Awakening
 *
 * Verifica supabase/sql/25_cancella_rituale.sql. Tre cancelli, e ognuno va provato per quello
 * che LASCIA PASSARE e per quello che ferma: un controllo che rifiuta tutto sembra sicuro e
 * non serve a niente.
 *
 * Il pulsante nell'app è nascosto quando non ha senso, ma un pulsante nascosto non protegge
 * niente: chiunque può chiamare la funzione a mano. Per questo si prova qui, sul database, e
 * non solo sull'interfaccia.
 *
 * Esecuzione: node test-rituali-cancellazione.js
 * Auto-pulizia: i rituali del run vengono rimossi in fondo con la chiave di servizio
 * (test-helpers), che resta fuori dal repo.
 */
const { purge } = require('./test-helpers');

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const CREATOR = `CancGuest_${TS}`;
const SID = `canc-sess-${TS}`;
const ALTRO_SID = `canc-altro-${TS}`;

let passed = 0, failed = 0;
const pass = (m) => { console.log(`  ✅ ${m}`); passed++; };
const fail = (m) => { console.log(`  ❌ ${m}`); failed++; process.exitCode = 1; };

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers },
    ...opts,
  });
  let body = null;
  try { body = await res.json(); } catch { /* vuoto */ }
  return { status: res.status, body };
}
const rpc = (fn, params) => sb(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) });

// Crea un rituale che inizia fra `minuti` (negativo = già iniziato).
async function creaRituale(minuti, nome) {
  const quando = new Date(Date.now() + minuti * 60000);
  const r = await rpc('create_ritual', {
    p_creator: CREATOR,
    p_creator_id: SID,
    p_name: nome,
    p_description: 'rituale di prova, cancellazione',
    p_type: 'consciousness',
    p_sacred_number: 11,
    p_date: quando.toISOString().slice(0, 10),
    p_time: quando.toISOString().slice(11, 16),
    p_duration: 30,
    p_password_hash: ''
  });
  if (r.status < 200 || r.status >= 300 || !Array.isArray(r.body) || !r.body[0]) {
    throw new Error(`creazione fallita: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body[0].id;
}

const esiste = async (id) => {
  const r = await sb(`rituals?id=eq.${id}&select=id`);
  return Array.isArray(r.body) && r.body.length > 0;
};

(async () => {
  console.log('\n— Cancellazione rituale —');

  // 1. Il caso legittimo: chi l'ha creato cancella un rituale non ancora iniziato.
  {
    const id = await creaRituale(60, `Da cancellare ${TS}`);
    const r = await rpc('delete_ritual', { p_ritual_id: id, p_session_id: SID, p_password_hash: '' });
    if (r.status >= 200 && r.status < 300) pass('il creatore cancella il proprio rituale futuro');
    else fail(`cancellazione legittima rifiutata: ${r.status} ${JSON.stringify(r.body)}`);
    if (!(await esiste(id))) pass('il rituale sparisce davvero dalla tabella');
    else fail('la funzione ha risposto ok ma il rituale è ancora lì');
  }

  // 2. I commenti non devono restare appesi a un rituale che non esiste più: nessuno li
  //    vedrebbe mai, e nessuno saprebbe mai che sono lì.
  {
    const id = await creaRituale(60, `Con commenti ${TS}`);
    await rpc('create_ritual_comment', {
      p_ritual_id: id, p_author_nickname: CREATOR, p_content: 'commento di prova', p_password_hash: ''
    });
    const prima = await sb(`ritual_comments?ritual_id=eq.${id}&select=id`);
    if (Array.isArray(prima.body) && prima.body.length > 0) pass('il commento di prova è stato scritto');
    else fail('non sono riuscita a scrivere il commento di prova: il caso non è provato');
    await rpc('delete_ritual', { p_ritual_id: id, p_session_id: SID, p_password_hash: '' });
    const dopo = await sb(`ritual_comments?ritual_id=eq.${id}&select=id`);
    if (Array.isArray(dopo.body) && dopo.body.length === 0) pass('i commenti se ne vanno col rituale');
    else fail(`restano ${dopo.body && dopo.body.length} commenti orfani`);
  }

  // 3. Chi non l'ha creato non può cancellarlo, nemmeno conoscendone l'id.
  {
    const id = await creaRituale(60, `Non tuo ${TS}`);
    const r = await rpc('delete_ritual', { p_ritual_id: id, p_session_id: ALTRO_SID, p_password_hash: '' });
    if (r.status >= 400 && String(r.body && r.body.message).includes('not_creator')) {
      pass('un altro non può cancellare il rituale altrui');
    } else {
      fail(`atteso not_creator, ottenuto ${r.status} ${JSON.stringify(r.body)}`);
    }
    if (await esiste(id)) pass('il rituale altrui è ancora al suo posto');
    else fail('GRAVE: il rituale è stato cancellato da chi non l\'aveva creato');
  }

  // 4. Il terzo cancello: a rituale iniziato non si cancella più. Dentro c'è gente che sta
  //    meditando, e non deve vederselo sparire sotto gli occhi.
  {
    const id = await creaRituale(-10, `Gia' iniziato ${TS}`);
    const r = await rpc('delete_ritual', { p_ritual_id: id, p_session_id: SID, p_password_hash: '' });
    if (r.status >= 400 && String(r.body && r.body.message).includes('already_started')) {
      pass('un rituale già iniziato non si cancella');
    } else {
      fail(`atteso already_started, ottenuto ${r.status} ${JSON.stringify(r.body)}`);
    }
    if (await esiste(id)) pass('il rituale in corso è ancora al suo posto');
    else fail('GRAVE: cancellato un rituale già iniziato');
  }

  // 5. Un id che non esiste non deve passare in silenzio: chi chiama deve sapere che non ha
  //    cancellato niente.
  {
    const r = await rpc('delete_ritual', { p_ritual_id: 999999999, p_session_id: SID, p_password_hash: '' });
    if (r.status >= 400 && String(r.body && r.body.message).includes('ritual_not_found')) {
      pass('un rituale inesistente dà ritual_not_found');
    } else {
      fail(`atteso ritual_not_found, ottenuto ${r.status} ${JSON.stringify(r.body)}`);
    }
  }

  console.log('\n— Pulizia —');
  await purge(SUPABASE_URL, [
    `rituals?creator=eq.${encodeURIComponent(CREATOR)}`,
  ], { label: 'rituali-cancellazione' });

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
