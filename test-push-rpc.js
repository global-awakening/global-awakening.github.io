/**
 * Test delle RPC degli abbonamenti push.
 *
 * `push_subscriptions` ha RLS attiva e zero policy: dal client non si legge e non si scrive,
 * si passa solo dalle due RPC SECURITY DEFINER. Qui si verifica che quelle porte facciano
 * esattamente il loro lavoro e niente di più — in particolare che la tabella resti invisibile.
 *
 * Esecuzione: node test-push-rpc.js
 * Prerequisiti: 19_push_notifiche_rituali.sql e 21_push_rpc.sql applicate.
 * I controlli che devono LEGGERE la tabella usano la chiave privilegiata da .env.test; se
 * manca, vengono saltati dichiarandolo, non fingono di passare.
 */
const { getServiceKey } = require('./test-helpers');

const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const H = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json'
};

const TS = Date.now();
const SID = `push_test_${TS}`;
const ENDPOINT = `https://fcm.googleapis.com/fcm/send/test_${TS}`;

let passati = 0, falliti = 0, saltati = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const skip = (n, d) => { console.log('⏭️  ' + n + ' — ' + d); saltati++; };

async function rpc(nome, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: H, body: JSON.stringify(body)
  });
  return { status: res.status, testo: await res.text() };
}

/**
 * «Rifiutato» deve voler dire «la funzione ha detto no», non «la funzione non esiste».
 * Senza questa distinzione i controlli sulle validazioni passerebbero anche a migration
 * non applicata: PGRST202 è un 404 e un 404 è >= 400.
 */
function rifiutatoDavvero(nome, r) {
  if (r.status < 400) { ko(nome, 'accettato con ' + r.status); return; }
  if (r.testo.includes('PGRST202')) { ko(nome, 'la funzione non esiste: il rifiuto non vale'); return; }
  ok(nome);
}

/** Legge le righe con la chiave privilegiata. Ritorna null se la chiave non c'è. */
async function righeDi(sessionId) {
  const key = getServiceKey();
  if (!key) return null;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?session_id=eq.${sessionId}&select=id,endpoint,locale,failure_count`,
    { headers: { 'apikey': key, 'Authorization': 'Bearer ' + key } }
  );
  return await res.json();
}

async function pulisci() {
  const key = getServiceKey();
  if (!key) return;
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?session_id=eq.${SID}`, {
    method: 'DELETE', headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
}

(async () => {
  try {
    // 1. Registrazione
    let r = await rpc('register_push_subscription', {
      p_session_id: SID, p_endpoint: ENDPOINT,
      p_p256dh: 'chiave_p256dh_finta', p_auth: 'chiave_auth_finta', p_locale: 'it'
    });
    r.status < 300 ? ok('registrazione accettata') : ko('registrazione accettata', r.status + ' ' + r.testo);

    // 2. Stesso endpoint una seconda volta: deve aggiornare, non duplicare.
    //    Un duplicato significherebbe due notifiche identiche sullo stesso telefono.
    await rpc('register_push_subscription', {
      p_session_id: SID, p_endpoint: ENDPOINT,
      p_p256dh: 'chiave_p256dh_finta', p_auth: 'chiave_auth_finta', p_locale: 'en'
    });
    const righe = await righeDi(SID);
    if (righe === null) skip('seconda registrazione aggiorna e non duplica', 'manca SUPABASE_SERVICE_KEY in .env.test');
    else if (righe.length === 1 && righe[0].locale === 'en') ok('seconda registrazione aggiorna e non duplica');
    else ko('seconda registrazione aggiorna e non duplica', JSON.stringify(righe));

    // 3. Il controllo che conta di più: anon NON legge la tabella.
    //    Chi legge endpoint e chiavi può mandare notifiche a quel telefono.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint`, { headers: H });
    const corpo = await res.json();
    Array.isArray(corpo) && corpo.length === 0
      ? ok('anon non legge push_subscriptions')
      : ko('anon non legge push_subscriptions', JSON.stringify(corpo).slice(0, 160));

    // 4. anon non scrive nemmeno direttamente, scavalcando la RPC
    const resIns = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ session_id: SID, endpoint: ENDPOINT + '_diretto', p256dh: 'x', auth: 'y' })
    });
    resIns.status >= 400
      ? ok('anon non scrive direttamente nella tabella')
      : ko('anon non scrive direttamente nella tabella', 'accettato con ' + resIns.status);

    // 5. Un endpoint non https viene rifiutato. Senza questo controllo la tabella diventa una
    //    lista di URL arbitrari che il server chiamerà da solo ogni minuto.
    r = await rpc('register_push_subscription', {
      p_session_id: SID, p_endpoint: 'http://cattivo.example/x', p_p256dh: 'a', p_auth: 'b', p_locale: 'it'
    });
    rifiutatoDavvero('endpoint non https rifiutato', r);

    // 6. Lingua non prevista rifiutata
    r = await rpc('register_push_subscription', {
      p_session_id: SID, p_endpoint: ENDPOINT + '_de', p_p256dh: 'a', p_auth: 'b', p_locale: 'de'
    });
    rifiutatoDavvero('locale non previsto rifiutato', r);

    // 7. Cancellazione
    r = await rpc('delete_push_subscription', { p_endpoint: ENDPOINT });
    if (r.testo.includes('PGRST202')) {
      ko('cancellazione rimuove la riga', 'la funzione non esiste');
    } else {
      const dopo = await righeDi(SID);
      if (dopo === null) skip('cancellazione rimuove la riga', 'manca SUPABASE_SERVICE_KEY in .env.test');
      else if (dopo.length === 0) ok('cancellazione rimuove la riga');
      else ko('cancellazione rimuove la riga', JSON.stringify(dopo));
    }
  } finally {
    await pulisci();
  }

  console.log(`\n${passati} passati, ${falliti} falliti${saltati ? `, ${saltati} saltati` : ''}`);
  process.exit(falliti === 0 ? 0 : 1);
})();
