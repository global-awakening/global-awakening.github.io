/**
 * Test del flusso permesso/iscrizione push nell'app.
 *
 * Perché gli stub: Chromium headless non ha un vero servizio push, quindi
 * `pushManager.subscribe` fallirebbe sempre e non si potrebbe verificare niente. Si
 * sostituiscono subscribe/getSubscription e il permesso con dei finti che registrano le
 * chiamate, e si verifica CHI le chiama e QUANDO — che è esattamente il comportamento da
 * proteggere. Gli stub stanno su PushManager.prototype e non sulla singola registrazione,
 * così non c'è nessuna corsa con `serviceWorker.ready`.
 *
 * Il controllo che conta più di tutti è «su NO il popup del browser non si apre»: il permesso
 * si chiede una volta sola nella vita e un no è quasi definitivo. Se quel test diventa rosso,
 * stiamo bruciando il permesso delle persone.
 *
 * Esecuzione: node test-push-ui.js
 * Prerequisiti: server su http://localhost:4321, migration 19/21/22 applicate,
 *               SUPABASE_SERVICE_KEY in .env.test per creare e ripulire il rituale di prova.
 */
const { chromium } = require('playwright');
const { getServiceKey, loginAsGuest } = require('./test-helpers');

const APP_URL = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const TS = Date.now();
const NOME_RITUALE = `PushTest_${TS}`;

let passati = 0, falliti = 0;
const ok = (n) => { console.log('  ✅ ' + n); passati++; };
const ko = (n, d) => { console.log('  ❌ ' + n + (d ? ' — ' + d : '')); falliti++; process.exitCode = 1; };

const KEY = getServiceKey();

/** Stub installati PRIMA di ogni script di pagina. */
const STUB = `
  window.__push = { subscribeChiamato: 0, permessoChiesto: 0 };
  window.__permesso = window.__permesso || 'default';

  if (typeof Notification !== 'undefined') {
    Object.defineProperty(Notification, 'permission', {
      get: () => window.__permesso, configurable: true
    });
    Notification.requestPermission = async () => {
      window.__push.permessoChiesto++;
      window.__permesso = window.__rispostaPermesso || 'granted';
      return window.__permesso;
    };
  }

  if (typeof PushManager !== 'undefined') {
    // Lo stub ricorda l'abbonamento, come fa un browser vero: se getSubscription tornasse
    // sempre null, lo spegnimento e il logout non troverebbero niente da disfare e i controlli
    // relativi passerebbero — o fallirebbero — per il motivo sbagliato.
    window.__subFinta = null;
    PushManager.prototype.getSubscription = async function () { return window.__subFinta; };
    PushManager.prototype.subscribe = async function () {
      window.__push.subscribeChiamato++;
      const endpoint = 'https://fcm.googleapis.com/fcm/send/finto_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      window.__subFinta = {
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh_finta', auth: 'auth_finta' } }),
        unsubscribe: async () => { window.__subFinta = null; return true; }
      };
      return window.__subFinta;
    };
  }
`;

async function creaRitualeDiProva() {
  // Il rituale parte fra due ore: deve esistere e non essere finito, non deve far scattare
  // nessuna notifica durante il test.
  const inizio = new Date(Date.now() + 2 * 3600 * 1000);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rituals`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    },
    body: JSON.stringify({
      creator: `PushHost_${TS}`, creator_id: `push_host_${TS}`,
      name: NOME_RITUALE, description: 'rituale per il test delle notifiche push',
      type: 'meditation', sacred_number: 3,
      date: inizio.toISOString().slice(0, 10), time: inizio.toISOString().slice(11, 16),
      duration: 30, participants: [], energy: 0
    })
  });
  const corpo = await res.json();
  if (!Array.isArray(corpo) || !corpo[0]) throw new Error('rituale di prova non creato: ' + JSON.stringify(corpo));
  return corpo[0].id;
}

/** Le righe scritte dallo stub, riconoscibili dall'endpoint. Serve a non fidarsi dello stub. */
async function righeConEndpointFinto() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=like.*fcm.googleapis.com/fcm/send/finto_*&select=id,endpoint,session_id`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  return await res.json();
}

async function pulisci(ritualeId) {
  if (!KEY) return;
  const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  if (ritualeId) await fetch(`${SUPABASE_URL}/rest/v1/rituals?id=eq.${ritualeId}`, { method: 'DELETE', headers: h });
  // SOLO gli abbonamenti finti creati dallo stub, riconoscibili dall'endpoint. Un filtro più
  // largo qui cancellerebbe gli abbonamenti veri delle persone: la pulizia di un test non deve
  // mai poter toccare dati di produzione.
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=like.*fcm.googleapis.com/fcm/send/finto_*`,
    { method: 'DELETE', headers: h }).catch(() => {});
}

async function nuovaScheda(browser, prima) {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:4321' });
  const page = await ctx.newPage();
  await page.addInitScript(STUB);
  if (prima) await page.addInitScript(prima);
  return { ctx, page };
}

/** Entra come ospite e clicca «Partecipa» sul rituale di prova. */
async function entraEPartecipa(page, nick) {
  await loginAsGuest(page, nick, { appUrl: APP_URL });
  const card = page.locator('.ritual-card').filter({ hasText: NOME_RITUALE }).first();
  await card.waitFor({ state: 'visible', timeout: 20000 });
  await card.locator('[data-test="join-ritual"]').first().click();
  await page.waitForTimeout(1200);
}

(async () => {
  if (!KEY) {
    console.error('⛔  Serve SUPABASE_SERVICE_KEY in .env.test per creare il rituale di prova.');
    process.exit(1);
  }

  let ritualeId = null;
  const browser = await chromium.launch();

  try {
    ritualeId = await creaRitualeDiProva();
    console.log(`\n📋 Rituale di prova creato (id ${ritualeId})\n`);

    // --- 1 e 2: la nostra domanda compare, e un NO non apre il popup del browser ---
    {
      const { ctx, page } = await nuovaScheda(browser);
      await entraEPartecipa(page, `PushA_${TS}`);

      const domanda = page.locator('[data-test="push-chiedi"]');
      (await domanda.count()) === 1
        ? ok('al «Partecipa» compare la nostra domanda')
        : ko('al «Partecipa» compare la nostra domanda', `trovati ${await domanda.count()} pannelli`);

      let stato = await page.evaluate(() => window.__push);
      stato.permessoChiesto === 0
        ? ok('prima della risposta il popup del browser non è partito')
        : ko('prima della risposta il popup del browser non è partito', `chiesto ${stato.permessoChiesto} volte`);

      await page.locator('[data-test="push-no"]').click();
      await page.waitForTimeout(600);

      stato = await page.evaluate(() => window.__push);
      stato.permessoChiesto === 0
        ? ok('su NO il popup del browser NON si apre')
        : ko('su NO il popup del browser NON si apre', `chiesto ${stato.permessoChiesto} volte`);
      stato.subscribeChiamato === 0
        ? ok('su NO non ci si iscrive')
        : ko('su NO non ci si iscrive', 'subscribe chiamato');

      const segno = await page.evaluate(() => localStorage.getItem('ga_push_rifiutato_il'));
      segno ? ok('il no viene ricordato, per non ri-chiedere subito')
            : ko('il no viene ricordato', 'ga_push_rifiutato_il assente');

      await ctx.close();
    }

    // --- 3: su SÌ parte il popup e poi l'iscrizione ---
    {
      const { ctx, page } = await nuovaScheda(browser);
      await entraEPartecipa(page, `PushB_${TS}`);

      await page.locator('[data-test="push-si"]').click();
      await page.waitForTimeout(1500);

      const stato = await page.evaluate(() => window.__push);
      stato.permessoChiesto === 1
        ? ok('su SÌ il popup del browser si apre')
        : ko('su SÌ il popup del browser si apre', `chiesto ${stato.permessoChiesto} volte`);
      stato.subscribeChiamato === 1
        ? ok('su SÌ ci si iscrive')
        : ko('su SÌ ci si iscrive', `subscribe chiamato ${stato.subscribeChiamato} volte`);

      const spento = await page.evaluate(() => localStorage.getItem('ga_push_spento'));
      spento === null ? ok('dopo l\'iscrizione il segno di spegnimento è pulito')
                      : ko('dopo l\'iscrizione il segno di spegnimento è pulito', spento);

      // Il controllo che mancava: che la riga sia arrivata DAVVERO sul server. Senza, il test
      // restava verde anche con la RPC completamente rotta — bastava che lo stub di subscribe
      // fosse stato chiamato. Era il falso verde più costoso della suite.
      const righe = await righeConEndpointFinto();
      righe.length >= 1
        ? ok('l\'abbonamento è stato scritto davvero nel database')
        : ko('l\'abbonamento è stato scritto davvero nel database', 'nessuna riga');

      // Uscendo dall'account l'abbonamento deve sparire, altrimenti chi entra dopo sullo stesso
      // telefono riceve le notifiche dei rituali di chi è uscito.
      // Il logout passa da un dialogo di conferma: il primo click lo apre, il secondo esce.
      await page.locator('button:has-text("Logout"), button:has-text("Esci")').first().click();
      await page.waitForTimeout(400);
      await page.locator('.modal-content button').last().click();
      await page.waitForTimeout(2500);
      const dopoLogout = await righeConEndpointFinto();
      dopoLogout.length === 0
        ? ok('il logout cancella l\'abbonamento push')
        : ko('il logout cancella l\'abbonamento push', `rimaste ${dopoLogout.length} righe`);

      await ctx.close();
    }

    // --- 4: uno spegnimento esplicito non si annulla da solo ---
    {
      const { ctx, page } = await nuovaScheda(browser, () => {
        window.__permesso = 'granted';
        try { localStorage.setItem('ga_push_spento', '1'); } catch (_) {}
      });
      await entraEPartecipa(page, `PushC_${TS}`);

      const stato = await page.evaluate(() => window.__push);
      stato.subscribeChiamato === 0
        ? ok('spegnimento esplicito rispettato: nessuna ri-iscrizione di nascosto')
        : ko('spegnimento esplicito rispettato', `subscribe chiamato ${stato.subscribeChiamato} volte`);
      (await page.locator('[data-test="push-chiedi"]').count()) === 0
        ? ok('a notifiche spente non si ri-propone la domanda')
        : ko('a notifiche spente non si ri-propone la domanda', 'pannello presente');

      await ctx.close();
    }

    // --- 5: permesso già negato al browser: non si chiede e non si insiste ---
    {
      const { ctx, page } = await nuovaScheda(browser, () => { window.__permesso = 'denied'; });
      await entraEPartecipa(page, `PushD_${TS}`);

      const stato = await page.evaluate(() => window.__push);
      stato.permessoChiesto === 0
        ? ok('permesso già negato: non si richiede')
        : ko('permesso già negato: non si richiede', `chiesto ${stato.permessoChiesto} volte`);
      (await page.locator('[data-test="push-chiedi"]').count()) === 0
        ? ok('permesso già negato: nessuna domanda inutile')
        : ko('permesso già negato: nessuna domanda inutile', 'pannello presente');

      await ctx.close();
    }
  } catch (e) {
    ko('il test è arrivato in fondo', e.message);
  } finally {
    await browser.close();
    await pulisci(ritualeId);
  }

  console.log(`\nRisultato: ${passati} passati, ${falliti} falliti`);
  process.exit(falliti === 0 ? 0 : 1);
})();
