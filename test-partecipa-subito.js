/**
 * «Partecipa» deve rispondere subito, e dire quando non ha funzionato.
 * node test-partecipa-subito.js (server su :4321)
 *
 * Segnalato il 22/09/2026: `joinRitual` chiamava il database ma non aggiornava la lista in
 * locale. Il pulsante passava a «Unito» solo al ricaricamento automatico successivo (ogni 10
 * secondi): fino a dieci secondi in cui sembrava non fosse successo niente. E se l'adesione
 * falliva, l'app taceva del tutto.
 *
 * Il test guarda quello che vede la persona: il pulsante e il numero dei partecipanti entro due
 * secondi — molto meno del giro di ricaricamento, che quindi non puo' salvare il risultato.
 */
const { chromium } = require('playwright');
const { loginAsGuest, purge } = require('./test-helpers');

const BASE = 'http://localhost:4321';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const NICK = `PartSub_${TS}`.slice(0, 20);
const AUTORE = `PartSubAutore_${TS}`;
const RITUALE_OK = `PartSub_ok_${TS}`;
const RITUALE_KO = `PartSub_ko_${TS}`;
const RITUALE_DOPPIO = `PartSub_dop_${TS}`;

let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };

const rpc = (fn, params) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
             'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(params)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const creaRituale = async (nome) => {
  const quando = new Date(Date.now() + 120 * 60000);
  const r = await rpc('create_ritual', {
    p_creator: AUTORE, p_creator_id: `partsub-autore-${TS}`, p_name: nome,
    p_description: 'prova partecipa subito', p_type: 'consciousness', p_sacred_number: 11,
    p_date: quando.toISOString().slice(0, 10), p_time: quando.toISOString().slice(11, 16),
    p_duration: 30, p_password_hash: ''
  });
  if (r.status < 200 || r.status >= 300) {
    console.error('non sono riuscita a creare il rituale di prova:', r.status, r.body);
    process.exit(1);
  }
};

const partecipanti = async (scheda) => {
  const testo = await scheda.innerText();
  const m = testo.match(/(\d+)\s+(partecipanti|participants)/i);
  return m ? Number(m[1]) : null;
};

(async () => {
  await creaRituale(RITUALE_OK);
  await creaRituale(RITUALE_KO);
  await creaRituale(RITUALE_DOPPIO);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await loginAsGuest(page, NICK, { appUrl: `${BASE}/app.html` });

  // ── 1. Adesione riuscita: il pulsante cambia subito ──────────────────
  const schedaOk = page.locator('.ritual-card').filter({ hasText: RITUALE_OK }).first();
  await schedaOk.waitFor({ state: 'visible', timeout: 30000 });
  const prima = await partecipanti(schedaOk);
  // Il ricaricamento automatico (ogni 10s) potrebbe cadere nei 2 secondi di attesa e far passare
  // il test anche senza la correzione: durante la prova le letture dei rituali vengono bloccate.
  await page.route('**/rest/v1/rituals?*', (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue());
  await schedaOk.locator('[data-test="join-ritual"]').click();

  let unito = false;
  for (let i = 0; i < 20 && !unito; i++) {
    await page.waitForTimeout(100);
    unito = await schedaOk.locator('[data-test="join-ritual"]').isDisabled().catch(() => false);
  }
  if (unito) pass('entro 2 secondi il pulsante risulta «Unito»');
  else fail('dopo 2 secondi il pulsante non è ancora cambiato: sembra non sia successo niente');

  const dopo = await partecipanti(schedaOk);
  if (prima !== null && dopo === prima + 1) pass(`il numero dei partecipanti sale subito (${prima} → ${dopo})`);
  else fail(`il numero dei partecipanti non è salito subito (${prima} → ${dopo})`);
  await page.unroute('**/rest/v1/rituals?*');

  // ── 2. Adesione fallita: la persona lo viene a sapere ────────────────
  await page.route('**/rest/v1/rpc/join_ritual', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'guasto simulato' })
  }));
  const schedaKo = page.locator('.ritual-card').filter({ hasText: RITUALE_KO }).first();
  await schedaKo.waitFor({ state: 'visible', timeout: 30000 });
  await schedaKo.locator('[data-test="join-ritual"]').click();

  const avviso = page.locator('text=/Problema di connessione|Connection problem/');
  const avvisato = await avviso.first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (avvisato) pass('se l\'adesione fallisce compare un avviso');
  else fail('l\'adesione è fallita e l\'app non ha detto niente');

  const finto = await schedaKo.locator('[data-test="join-ritual"]').isDisabled().catch(() => false);
  if (!finto) pass('se l\'adesione fallisce il pulsante resta «Partecipa» (niente finta adesione)');
  else fail('l\'adesione è fallita ma il pulsante dice «Unito»');
  await page.unroute('**/rest/v1/rpc/join_ritual');

  // ── 3. Doppio tocco rapido: una sola adesione, una sola notifica ─────
  let chiamate = 0;
  await page.route('**/rest/v1/rpc/join_ritual', async (route) => {
    chiamate++;
    await new Promise((r) => setTimeout(r, 800));   // rete lenta: il secondo tocco arriva durante l'attesa
    await route.continue();
  });
  const schedaDop = page.locator('.ritual-card').filter({ hasText: RITUALE_DOPPIO }).first();
  await schedaDop.waitFor({ state: 'visible', timeout: 30000 });
  const bottone = schedaDop.locator('[data-test="join-ritual"]');
  await bottone.click();
  await bottone.click({ timeout: 500 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (chiamate === 1) pass('due tocchi rapidi producono una sola adesione');
  else fail(`due tocchi rapidi hanno prodotto ${chiamate} adesioni (e altrettante notifiche al creatore)`);
  await page.unroute('**/rest/v1/rpc/join_ritual');

  await browser.close();

  console.log('\n— Pulizia —');
  await purge(SUPABASE_URL, [
    `rituals?creator=eq.${encodeURIComponent(AUTORE)}`,
    `profiles?nickname=eq.${encodeURIComponent(NICK)}`,
    `notifications?user_nickname=eq.${encodeURIComponent(AUTORE)}`,
  ], { label: 'partecipa-subito' });

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
