/**
 * La soglia del rituale: quando il telefono non lascia partire la musica, un invito a tutto
 * schermo chiede il tocco che la sblocca. node test-soglia-rituale.js (server su :4321)
 *
 * Nata dalla prova dal vivo di Irene del 23/09/2026: tocca la notifica, arriva nel rituale,
 * il megafono accanto al nome dice «audio acceso» — e non si sente niente finché non tocca lo
 * schermo. Il tocco non si può evitare (regola dei browser, vedi music-helpers.js), ma si può
 * smettere di nasconderlo: diventa una soglia d'ingresso voluta.
 *
 * Il browser è vero, il blocco dell'audio è emulato. Il Chromium di Playwright lascia suonare
 * tutto, anche rilanciato con `--autoplay-policy=user-gesture-required` (provato il 23/09/2026:
 * `play()` passa comunque). Quindi `play()` viene fatto rifiutare con NotAllowedError finché
 * nella pagina non arriva un gesto vero (`isTrusted`) che per la specifica attiva la pagina —
 * per un dito, quando si ALZA (il revisore del 23/09/2026 ha colto che l'app ascoltava solo la
 * discesa: un test che accetta la discesa non poteva accorgersene).
 * Non si usa `navigator.userActivation`: Chrome la conserva anche dopo un ricaricamento.
 * Il rituale è live e l'ospite ci è dentro; poi lo si apre in una scheda NUOVA, mai toccata —
 * come quella aperta dalla notifica.
 */
const { chromium } = require('playwright');
const { loginAsGuest, purge } = require('./test-helpers');

const BASE = 'http://localhost:4321';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const NICK = `Soglia_${TS}`.slice(0, 20);
const AUTORE = `SogliaAutore_${TS}`;
const RITUALE = `Soglia_rituale_${TS}`;

let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };

const rpc = (fn, params) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
             'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(params)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const soglia = (page) => page.locator('[data-test="soglia-rituale"]');
const inPausa = (page) => page.locator('audio').first().evaluate((el) => el.paused).catch(() => null);

(async () => {
  // Rituale già iniziato: minuto corrente (UTC), 3 minuti di durata.
  const ora = new Date();
  const creato = await rpc('create_ritual', {
    p_creator: AUTORE, p_creator_id: `soglia-autore-${TS}`, p_name: RITUALE,
    p_description: 'prova soglia', p_type: 'consciousness', p_sacred_number: 11,
    p_date: ora.toISOString().slice(0, 10), p_time: ora.toISOString().slice(11, 16),
    p_duration: 3, p_password_hash: ''
  });
  if (creato.status < 200 || creato.status >= 300) {
    console.error('non sono riuscita a creare il rituale di prova:', creato.status, creato.body);
    process.exit(1);
  }
  const ritualId = Array.isArray(creato.body) ? creato.body[0].id : creato.body.id;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript(() => {
    // Gli eventi che per la specifica HTML «attivano» la pagina: un dito vale quando SI ALZA
    // (pointerup/touchend), il mouse e la tastiera quando scendono. Un touchstart non basta.
    // Registrati da questo script d'avvio, quindi PRIMA dei listener dell'app: un play()
    // chiamato durante l'evento stesso lo vede già attivato, come nel browser vero.
    let toccata = false;
    const attiva = (e) => { if (e.isTrusted) toccata = true; };
    const attivaSe = (fn) => (e) => { if (fn(e)) attiva(e); };
    document.addEventListener('touchend', attiva, true);
    document.addEventListener('keydown', attiva, true);
    document.addEventListener('mousedown', attiva, true);
    document.addEventListener('pointerup', attivaSe((e) => e.pointerType !== 'mouse'), true);
    document.addEventListener('pointerdown', attivaSe((e) => e.pointerType === 'mouse'), true);
    const originale = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!toccata) {
        return Promise.reject(new DOMException('gesto richiesto', 'NotAllowedError'));
      }
      return originale.call(this);
    };
  });
  const ingresso = await ctx.newPage();
  await loginAsGuest(ingresso, NICK, { appUrl: `${BASE}/app.html` });
  const sid = await ingresso.evaluate(() => localStorage.getItem('ga_session_id'));
  const unito = await rpc('join_ritual', { p_ritual_id: ritualId, p_session_id: sid });
  if (unito.status >= 300) { console.error('adesione fallita:', unito.status, unito.body); process.exit(1); }

  // Scheda nuova, mai toccata: come quella che apre la notifica.
  await ingresso.close();
  const page = await ctx.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });

  // ── 1. il blocco è reale, e la soglia compare ────────────────────────
  const comparsa = await soglia(page).first().waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true).catch(() => false);
  if (comparsa) pass('con l\'audio bloccato compare l\'invito a entrare nel rituale');
  else fail('l\'audio è bloccato ma non compare nessun invito: la persona non sa che deve toccare');

  if (await inPausa(page) === true) pass('prima del tocco la musica è davvero ferma (il blocco del browser è attivo)');
  else fail('la musica suona già prima del tocco: il test non sta riproducendo il blocco del telefono');

  if (comparsa) {
    const testo = await soglia(page).first().innerText();
    if (testo.includes(RITUALE)) pass('l\'invito nomina il rituale');
    else fail(`l'invito non nomina il rituale: ${JSON.stringify(testo)}`);
  }

  // ── 2. un tocco sulla soglia: via l'invito, parte la musica ───────────
  if (comparsa) {
    await soglia(page).first().tap();
    const sparita = await soglia(page).first().waitFor({ state: 'hidden', timeout: 3000 })
      .then(() => true).catch(() => false);
    if (sparita) pass('dopo il tocco l\'invito sparisce');
    else fail('dopo il tocco l\'invito resta a schermo');

    let suona = false;
    for (let i = 0; i < 30 && !suona; i++) {
      await page.waitForTimeout(200);
      suona = (await inPausa(page)) === false;
    }
    if (suona) pass('dopo il tocco la musica parte');
    else fail('dopo il tocco la musica non parte');

    // Il tocco d'ingresso non deve «cadere» sui pulsanti sotto: il megafono resta acceso.
    const muto = await page.evaluate(() => localStorage.getItem('ga_music_muted'));
    if (muto !== '1') pass('il tocco d\'ingresso non silenzia la musica');
    else fail('il tocco d\'ingresso ha silenziato la musica');
  }

  if (errori.length === 0) pass('nessun errore JavaScript');
  else fail('errori JavaScript: ' + errori.join(' | '));

  await browser.close();

  console.log('\n— Pulizia —');
  await purge(SUPABASE_URL, [
    `rituals?creator=eq.${encodeURIComponent(AUTORE)}`,
    `profiles?nickname=eq.${encodeURIComponent(NICK)}`,
  ], { label: 'soglia-rituale' });

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
