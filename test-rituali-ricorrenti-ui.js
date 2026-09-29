/**
 * Rituali che si ripetono, lato interfaccia, e la stanza del rituale.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali-ricorrenti-ui.js (server su :4321)
 *
 * Le regole vere (quali giorni, quale appuntamento è «adesso», chi può fermare) stanno nel
 * database e sono provate da test-rituali-ricorrenti.js. Qui si prova quello che vede chi usa
 * l'app: la riga «giorno N di M», Partecipa/Lascia, la stanza con la preghiera in grande e il
 * numero di chi c'è adesso, l'apertura dalla notifica, il pulsante Ferma.
 *
 * Due persone, due contesti di browser distinti (A crea, B partecipa): due schede dello stesso
 * contesto condividerebbero localStorage, cioè la stessa identità di ospite.
 *
 * Il database è quello vero: tutte le date sono relative ad adesso (una data fissa nel test
 * diventa una bomba a orologeria) e ogni rituale creato qui si cancella nel finally, filtrando
 * sul prefisso degli identificativi di sessione di questo giro e su nient'altro.
 */
const { chromium } = require('playwright');
const { loginAsGuest, purge, serviceFetch, requireServiceKey, SUPABASE_URL } = require('./test-helpers');

requireServiceKey();

const BASE = 'http://localhost:4321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';

const TS = Date.now();
const PREFISSO = `ricui-${TS}-`;
const SID_A = `${PREFISSO}a`;
const SID_B = `${PREFISSO}b`;
const NICK_A = `RicA_${TS}`.slice(0, 20);
const NICK_B = `RicB_${TS}`.slice(0, 20);
const NOME_FORM = `RicUI_form_${TS}`;
const NOME_CICLO = `RicUI_ciclo_${TS}`;

let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };
const check = (cond, m, extra) => cond ? pass(m) : fail(extra !== undefined ? `${m} — ${JSON.stringify(extra)}` : m);

const rpc = (fn, params) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`,
             'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(params)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const GIORNO_MS = 24 * 3600 * 1000;
const dataUtc = (d) => d.toISOString().slice(0, 10);
// Giorno ISO (1 = lunedì … 7 = domenica), come ripeti_giorni nel database.
const isoDow = (d) => ((d.getUTCDay() + 6) % 7) + 1;

// L'app parte in inglese (la lingua non si ricorda tra le visite): i testi si cercano in
// entrambe le lingue, così il test non dipende da quale è attiva.
const schedaDi = (page, nome) => page.locator('.ritual-card').filter({ hasText: nome }).first();
const apriRituali = async (page) => {
  await page.locator('button').filter({ hasText: /Rituali|Rituals/ }).first().click();
};

(async () => {
  const browser = await chromium.launch();
  const erroriPagina = [];
  try {
    // Fuso UTC per A: i giorni scelti nel modulo si contano nello stesso calendario del test.
    const ctxA = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 1280, height: 900 } });
    await ctxA.addInitScript((v) => { try { localStorage.setItem('ga_session_id', v); } catch (_) {} }, SID_A);
    const pageA = await ctxA.newPage();
    pageA.on('pageerror', (e) => erroriPagina.push('A: ' + e.message));
    await loginAsGuest(pageA, NICK_A, { appUrl: `${BASE}/app.html` });
    check(await pageA.evaluate(() => localStorage.getItem('ga_session_id')) === SID_A,
      'A entra con l\'identificativo di sessione atteso');

    // ── 1. A crea dal modulo un rituale «Giorni scelti» ──────────────────────────
    console.log('\n1. Creazione dal modulo, giorni scelti');
    const oggi = new Date();
    const inizio = new Date(oggi.getTime() + GIORNO_MS);          // domani
    const fine = new Date(oggi.getTime() + 7 * GIORNO_MS);        // fra 7 giorni
    // Si esclude un giorno che non è quello di partenza: così il primo appuntamento è domani.
    const escluso = isoDow(new Date(oggi.getTime() + 3 * GIORNO_MS));
    const scelti = [1, 2, 3, 4, 5, 6, 7].filter((g) => g !== escluso);
    let attesi = 0;
    for (let t = inizio.getTime(); dataUtc(new Date(t)) <= dataUtc(fine); t += GIORNO_MS) {
      if (scelti.includes(isoDow(new Date(t)))) attesi++;
    }

    await apriRituali(pageA);
    await pageA.locator('button').filter({ hasText: /Proponi Rituale|Propose Ritual/ }).first().click();
    await pageA.locator('input[placeholder*="Full Moon"], input[placeholder*="Luna"]').first().fill(NOME_FORM);
    await pageA.locator('input[type="date"]').first().fill(dataUtc(inizio));
    await pageA.locator('input[type="time"]').first().fill('12:00');
    await pageA.locator('[data-test="repeat-select"]').selectOption('giorni');
    for (const g of scelti) await pageA.locator(`[data-test="repeat-day-${g}"]`).click();
    await pageA.locator('[data-test="repeat-until"]').fill(dataUtc(fine));
    await pageA.locator('button').filter({ hasText: /Crea Rituale|Create Ritual/ }).last().click();

    const ricA = schedaDi(pageA, NOME_FORM).locator('[data-test="ritual-recurrence"]');
    await ricA.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    const testoRicA = await ricA.innerText().catch(() => '');
    check(new RegExp(`(giorno 1 di|day 1 of) ${attesi}(?!\\d)`).test(testoRicA),
      `la scheda dice «giorno 1 di ${attesi}»`, testoRicA);

    // ── 2. Un ciclo già in corso al giorno 2, preparato via RPC ──────────────────
    console.log('\n2. Ciclo in corso al giorno 2: Partecipa e Lascia');
    // Data e ora dallo stesso istante t0: a cavallo della mezzanotte UTC due letture separate
    // di «adesso» potrebbero dare giorni diversi.
    const t0 = new Date(Date.now() - 60000);
    const ieri = new Date(t0.getTime() - GIORNO_MS);
    const creato = await rpc('create_ritual', {
      p_creator: NICK_A, p_creator_id: SID_A, p_name: NOME_CICLO,
      p_description: 'riga uno\nriga due', p_type: 'consciousness', p_sacred_number: 11,
      p_date: dataUtc(ieri), p_time: t0.toISOString().slice(11, 16), p_duration: 30, p_password_hash: '',
      p_ripeti_giorni: [1, 2, 3, 4, 5, 6, 7],
      p_ripeti_fino: dataUtc(new Date(ieri.getTime() + 6 * GIORNO_MS)), p_fuso: 'UTC'
    });
    const cicloId = Array.isArray(creato.body) && creato.body[0] ? creato.body[0].id : null;
    if (!cicloId) throw new Error(`create_ritual del ciclo fallita: ${creato.status} ${JSON.stringify(creato.body)}`);

    const ctxB = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 1280, height: 900 } });
    await ctxB.addInitScript((v) => { try { localStorage.setItem('ga_session_id', v); } catch (_) {} }, SID_B);
    const pageB = await ctxB.newPage();
    pageB.on('pageerror', (e) => erroriPagina.push('B: ' + e.message));
    await loginAsGuest(pageB, NICK_B, { appUrl: `${BASE}/app.html` });
    await apriRituali(pageB);
    const schedaB = schedaDi(pageB, NOME_CICLO);
    await schedaB.waitFor({ state: 'visible', timeout: 20000 });
    const testoRicB = await schedaB.locator('[data-test="ritual-recurrence"]').innerText().catch(() => '');
    check(/(giorno 2 di|day 2 of) 7(?!\d)/.test(testoRicB), 'B vede «giorno 2 di 7»', testoRicB);

    await schedaB.locator('[data-test="join-ritual"]').click();
    const lascia = schedaB.locator('[data-test="leave-ritual"]');
    await lascia.waitFor({ state: 'visible', timeout: 10000 })
      .then(() => pass('dopo Partecipa compare «Lascia»'))
      .catch(() => fail('dopo Partecipa «Lascia» non compare'));
    await lascia.click();
    await lascia.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    const partecipa = schedaB.locator('[data-test="join-ritual"]');
    check(await partecipa.isEnabled() && /^\s*(Unisciti|Join)\s*$/.test(await partecipa.innerText()),
      'dopo Lascia ricompare «Unisciti» (partecipa)', await partecipa.innerText().catch(() => ''));

    // ── 3. La stanza ─────────────────────────────────────────────────────────────
    console.log('\n3. La stanza del rituale');
    await partecipa.click();
    await lascia.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await schedaB.locator('[data-test="open-room"]').click({ timeout: 5000 }).catch(() => {});
    const stanza = pageB.locator('[data-test="ritual-room"]');
    const stanzaAperta = await stanza.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    check(stanzaAperta, '«Entra» apre la stanza');
    if (stanzaAperta) {
      const testo = await pageB.locator('[data-test="room-text"]').innerText().catch(() => '');
      check(/riga uno\s*\n\s*riga due/.test(testo), 'la preghiera va a capo come è stata scritta', testo);
      const persone = pageB.locator('[data-test="room-people"]');
      const unaPersona = await persone.filter({ hasText: /1 persona qui adesso|1 person here now/ })
        .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      check(unaPersona, 'la stanza dice «1 persona qui adesso» entro 5 s', await persone.innerText().catch(() => ''));

      // ── 4. Review Focus 1: la candela non deve riportare il ciclo al giorno 1 ──
      console.log('\n4. Candela nella stanza');
      // Prima si aspetta che la candela risulti davvero accesa (la riga è stata sostituita con
      // quella riletta): senza, il controllo passerebbe anche se la sostituzione non avvenisse mai.
      const candela = pageB.locator('[data-test="room-candle"]');
      await candela.click();
      const accesa = await candela.filter({ hasText: /\b1\b/ })
        .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
      check(accesa, 'la candela nella stanza risulta accesa (1)', await candela.innerText().catch(() => ''));
      const ancoraGiorno2 = async (quando) => {
        check(await stanza.isVisible(), `${quando} la stanza è ancora aperta`);
        const testo = await schedaB.locator('[data-test="ritual-recurrence"]').textContent().catch(() => '');
        check(/giorno 2 |day 2 /.test(testo || ''), `${quando} la scheda dice ancora «giorno 2»`, testo);
      };
      await ancoraGiorno2('dopo la candela');
      // E dopo un giro del ricaricamento periodico (ogni 10 s), che rilegge tutto dalla vista.
      await pageB.waitForTimeout(11000);
      await ancoraGiorno2('dopo un ricaricamento');

      // Il 🔊 dell'intestazione sta sotto la stanza: dentro la stanza serve il suo pulsante.
      // Se la musica aspettava un gesto, il primo tocco la sblocca soltanto (guardia di 1 s):
      // per questo si riprova una seconda volta prima di dire che non cambia.
      const musica = pageB.locator('[data-test="room-music"]');
      const etichetta = async () => (await musica.getAttribute('aria-label').catch(() => '')) || '';
      const prima = await etichetta();
      check(await musica.isVisible().catch(() => false) && /musica|music/i.test(prima),
        "nella stanza c'è il pulsante della musica", prima);
      let cambiata = false;
      for (let i = 0; i < 2 && !cambiata; i++) {
        await pageB.waitForTimeout(1100);
        await musica.click().catch(() => {});
        await pageB.waitForTimeout(300);
        const dopo = await etichetta();
        cambiata = dopo !== prima && !/Tocca|Tap/.test(dopo);
      }
      check(cambiata, 'il pulsante della musica nella stanza silenzia / riattiva', await etichetta());
      const clamp = await schedaB.locator('[data-test="ritual-desc"]')
        .evaluate((el) => getComputedStyle(el).webkitLineClamp).catch((e) => e.message);
      check(String(clamp) === '3', 'sulla scheda la descrizione si ferma a 3 righe', clamp);

      await pageB.locator('[data-test="room-close"]').click();
      await stanza.waitFor({ state: 'detached', timeout: 5000 })
        .then(() => pass('«Chiudi» chiude la stanza'))
        .catch(() => fail('«Chiudi» non chiude la stanza'));
    }
    await pageB.close();

    // ── 5. Apertura dalla notifica ───────────────────────────────────────────────
    console.log('\n5. Apertura da notifica (?ritual=)');
    const pageN = await ctxB.newPage();
    pageN.on('pageerror', (e) => erroriPagina.push('notifica: ' + e.message));
    // La notifica punta ad app.html?ritual=<id> (push-helpers.js). Il server locale `serve`
    // però rimanda app.html → /app con un 301 che PERDE la query (GitHub Pages no): si va
    // direttamente su /app, che è la stessa pagina, per provare davvero la lettura di ?ritual=.
    await pageN.goto(`${BASE}/app?ritual=${cicloId}`);
    // L'ospite resta ricordato (PR #10): se per qualche motivo chiede di nuovo l'accesso, si entra.
    const ospite = pageN.locator('button:has-text("Entra come Ospite"), button:has-text("Enter as Guest")');
    const logout = pageN.locator('button:has-text("Logout"), button:has-text("Esci")');
    await Promise.race([
      ospite.first().waitFor({ state: 'visible', timeout: 20000 }),
      logout.first().waitFor({ state: 'visible', timeout: 20000 }),
    ]).catch(() => {});
    if (await ospite.first().isVisible().catch(() => false)) {
      await pageN.locator('input[placeholder*="username"], input[placeholder*="Username"]').first().fill(NICK_B);
      await ospite.first().click();
    }
    await pageN.locator('[data-test="ritual-room"]').waitFor({ state: 'visible', timeout: 20000 })
      .then(() => pass('dalla notifica la stanza si apre da sola'))
      .catch(() => fail('dalla notifica la stanza non si apre'));
    check(!pageN.url().includes('ritual='), 'l\'indirizzo non contiene più ritual=', pageN.url());
    await pageN.close();

    // ── 6. Il creatore ferma il ciclo ────────────────────────────────────────────
    console.log('\n6. Ferma');
    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await apriRituali(pageA).catch(() => {});
    const schedaCicloA = schedaDi(pageA, NOME_CICLO);
    await schedaCicloA.waitFor({ state: 'visible', timeout: 20000 });
    const ferma = schedaCicloA.locator('[data-test="stop-ritual"]');
    check(await ferma.isVisible().catch(() => false), 'il creatore vede «Ferma» sul ciclo avviato');
    await ferma.click();
    await pageA.locator('[data-test="stop-ritual-confirm"]').click();
    await ferma.waitFor({ state: 'detached', timeout: 10000 })
      .then(() => pass('confermando, «Ferma» sparisce'))
      .catch(() => fail('dopo la conferma «Ferma» è ancora lì'));

    check(erroriPagina.length === 0, 'nessun errore in console', erroriPagina);
  } catch (e) {
    fail('eccezione: ' + (e && e.message));
  } finally {
    await browser.close().catch(() => {});
    console.log('\n— Pulizia —');
    const via = await serviceFetch(`rituals?creator_id=like.${encodeURIComponent(PREFISSO)}*`, { method: 'DELETE' });
    console.log(`  rituali di prova cancellati: ${Array.isArray(via.body) ? via.body.length : via.status}`);
    // Rete di sicurezza: se il rituale del modulo avesse preso un creator_id diverso da quello
    // atteso, lo si trova comunque per nome (i nomi di questo giro finiscono tutti con TS).
    await purge(SUPABASE_URL, [
      `rituals?name=like.${encodeURIComponent(`RicUI_*_${TS}`)}`,
      `profiles?nickname=eq.${encodeURIComponent(NICK_A)}`,
      `profiles?nickname=eq.${encodeURIComponent(NICK_B)}`,
      `online_users?nickname=eq.${encodeURIComponent(NICK_A)}`,
      `online_users?nickname=eq.${encodeURIComponent(NICK_B)}`,
    ], { label: 'rituali-ricorrenti-ui' });
    console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  }
})();
