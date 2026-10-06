// test-lingue-ui.js — prova dal browser in quattro lingue (en, it, es, fr).
// Serve il server locale (npx serve -l 4321 .) e la chiave di servizio in memoria (notifica di prova).
const { chromium } = require('playwright');
const { loadTestEnv, purge, loginAsGuest, serviceFetch, SUPABASE_URL } = require('./test-helpers');
const { leggiTraduzioni } = require('./scripts/leggi-traduzioni');

loadTestEnv();
const APP_URL = 'http://localhost:4321/app.html';
const T = leggiTraduzioni();
const SUFFISSO = Date.now();
const NICK_SEZIONI = `LinguaUI_s${SUFFISSO}`;
const NICK_CAMPANELLA = `LinguaUI_c${SUFFISSO}`;
// Nickname lungo (26 caratteri) di proposito: l'intestazione deve reggerlo a 360 px con l'ellissi.
const NICK_360 = `LinguaUI_lungo_${SUFFISSO}`;

let passed = 0, failed = 0;
const check = (c, msg, d) => {
  if (c) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ ' + msg + (d === undefined ? '' : ' ' + JSON.stringify(d))); }
};
const minuscolo = (s) => s.toLowerCase();

// loginAsGuest conosce solo le etichette it/en: il login si fa in inglese, poi si passa
// alla lingua da provare col menu (la scelta resta in ga_lang, come per un utente vero).
async function entraOspite(page, nick, lingua) {
  await page.goto(APP_URL);
  await page.locator('select[data-test="lingua"]').first().selectOption('en');
  await loginAsGuest(page, nick, { appUrl: APP_URL });
  if (lingua !== 'en') await page.locator('select[data-test="lingua"]').first().selectOption(lingua);
}

// Parole che in ES non devono comparire: inglesi e italiane presenti oggi nell'interfaccia.
// Una parola vale solo se la scansione di controllo (stesse zone, in en e in it) la trova davvero:
// cercarla fra le chiavi o dentro frasi lunghe darebbe un elenco che non può mai scattare.
const PAROLE = {
  en: ['Rituals', 'Telepathy', 'Consciousness', 'Logout', 'Online Now', 'Active Rituals', 'Rounds Played', 'Guest'],
  it: ['Rituali', 'Telepatia', 'Coscienza', 'Esci', 'Online', 'Rituali attivi', 'Round giocati', 'Ospite'],
};
// Parola intera, senza distinguere maiuscole: «Esci» non deve far scattare «Escribe».
const cercaParola = (testo, p) => new RegExp('(^|[^\\p{L}])' + p.replace(/ /g, '\\s+') + '($|[^\\p{L}])', 'iu').test(testo);

// Testo dell'interfaccia delle tre sezioni: intestazione, barra delle sezioni, statistiche e titoli.
// Il testo scritto dagli utenti (nomi di rituali, post, utenti online) sta fuori.
async function raccogliInterfaccia(page, lingua) {
  const parti = [];
  for (const tab of ['rituals', 'telepathy', 'consciousness']) {
    const nome = T[lingua].tabs[tab];
    await page.locator('.main-nav-top button', { hasText: nome }).first().click();
    await page.waitForTimeout(1200);
    const testo = await page.evaluate(() => {
      const sel = ['header', '.main-nav-top', '.stats-grid', 'h1', 'h2', 'h3', '.main-nav-bottom'];
      return sel.flatMap((s) => [...document.querySelectorAll(s)].map((e) => e.innerText)).join('\n');
    });
    check(testo.includes(nome), `[${lingua}] sezione «${nome}» visibile (raccolti ${testo.length} caratteri)`);
    parti.push({ tab, nome, testo });
  }
  return parti;
}

async function run() {
  const browser = await chromium.launch();
  const creati = [NICK_SEZIONI, NICK_CAMPANELLA, NICK_360];
  try {
    console.log('\n[1] locale es-ES: menu su "es", ingresso in spagnolo');
    {
      const ctx = await browser.newContext({ locale: 'es-ES' });
      const page = await ctx.newPage();
      await page.goto(APP_URL);
      const sel = page.locator('select[data-test="lingua"]').first();
      await sel.waitFor({ timeout: 20000 });
      check(await sel.inputValue() === 'es', 'es-ES: value "es"');
      const corpo = minuscolo(await page.evaluate(() => document.body.innerText));
      // «Entrar como Invitado» sta dentro la scheda Invitado, non ancora aperta: si guardano le schede.
      for (const k of ['tabGuest', 'tabLogin', 'tabRegister']) {
        check(corpo.includes(minuscolo(T.es[k])), `schermata d'ingresso contiene «${T.es[k]}»`);
      }
      await ctx.close();
    }

    console.log('\n[2] locale de-DE: ripiego su "en"');
    {
      const ctx = await browser.newContext({ locale: 'de-DE' });
      const page = await ctx.newPage();
      await page.goto(APP_URL);
      const sel = page.locator('select[data-test="lingua"]').first();
      await sel.waitFor({ timeout: 20000 });
      check(await sel.inputValue() === 'en', 'de-DE: value "en"');
      await ctx.close();
    }

    console.log('\n[3] en-US, scelgo fr, ricarico: resta "fr"');
    {
      const ctx = await browser.newContext({ locale: 'en-US' });
      const page = await ctx.newPage();
      await page.goto(APP_URL);
      const sel = page.locator('select[data-test="lingua"]').first();
      await sel.waitFor({ timeout: 20000 });
      check(await sel.inputValue() === 'en', 'partenza "en"');
      await sel.selectOption('fr');
      await page.reload();
      const sel2 = page.locator('select[data-test="lingua"]').first();
      await sel2.waitFor({ timeout: 20000 });
      check(await sel2.inputValue() === 'fr', 'dopo il ricaricamento value "fr"');
      await ctx.close();
    }

    console.log('\n[4] nessuna frase a metà: sezioni principali in es, da ospite');
    {
      const ctx = await browser.newContext({ locale: 'en-US' });
      const page = await ctx.newPage();
      await entraOspite(page, NICK_SEZIONI, 'en');
      // Controllo: la scansione, nelle lingue sbagliate, deve saper trovare le parole.
      const controlloEn = (await raccogliInterfaccia(page, 'en')).map((x) => x.testo).join('\n');
      await page.locator('select[data-test="lingua"]').first().selectOption('it');
      const controlloIt = (await raccogliInterfaccia(page, 'it')).map((x) => x.testo).join('\n');
      const inEn = PAROLE.en.filter((p) => cercaParola(controlloEn, p));
      const inIt = PAROLE.it.filter((p) => cercaParola(controlloIt, p));
      check(inEn.length >= 1, `controllo: la scansione in en trova parole inglesi (${inEn.length}/${PAROLE.en.length})`, inEn);
      check(inIt.length >= 1, `controllo: la scansione in it trova parole italiane (${inIt.length}/${PAROLE.it.length})`, inIt);
      const scartate = [...PAROLE.en.filter((p) => !inEn.includes(p)), ...PAROLE.it.filter((p) => !inIt.includes(p))];
      if (scartate.length) console.log('  (parole scartate: non compaiono nelle zone scansionate: ' + scartate.join(', ') + ')');
      const paroleDaCercare = [...inEn, ...inIt];
      check(paroleDaCercare.length >= 10, `almeno 10 parole da cercare in es (${paroleDaCercare.length})`);

      await page.locator('select[data-test="lingua"]').first().selectOption('es');
      for (const { nome, testo } of await raccogliInterfaccia(page, 'es')) {
        const trovate = paroleDaCercare.filter((p) => cercaParola(testo, p));
        check(trovate.length === 0, `«${nome}»: nessuna parola en/it dimenticata`, trovate);
      }
      await ctx.close();
    }

    console.log('\n[5] campanella in francese');
    {
      // La notifica va inserita prima del login: la campanella la legge al montaggio.
      const r = await serviceFetch('notifications', { method: 'POST', body: JSON.stringify({
        user_nickname: NICK_CAMPANELLA, type: 'comment', message: 'Prova ha commentato il tuo post' }) });
      check(r.status >= 200 && r.status < 300, 'notifica di prova inserita', [r.status, r.body]);
      const ctx = await browser.newContext({ locale: 'en-US' });
      const page = await ctx.newPage();
      await entraOspite(page, NICK_CAMPANELLA, 'fr');
      await page.locator('button:has-text("🔔")').first().click();
      const riga = page.locator('[data-test="notifica"]').first();
      await riga.waitFor({ timeout: 15000 });
      const testo = (await riga.innerText()).trim();
      check(testo.includes('Prova a commenté ta publication'), 'campanella: «Prova a commenté ta publication»', testo);
      await ctx.close();
    }

    console.log('\n[6] 360 px in francese');
    {
      const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 360, height: 740 } });
      const page = await ctx.newPage();
      await entraOspite(page, NICK_360, 'fr');
      await page.waitForTimeout(1000);
      const larghezza = await page.evaluate(() => document.documentElement.scrollWidth);
      check(larghezza <= 360, `nickname di ${NICK_360.length} caratteri: nessuno scroll orizzontale (scrollWidth ${larghezza})`);
      check(await page.locator('header select[data-test="lingua"]').first().isVisible(), 'menu lingua visibile');
      const caselle = await page.locator('header .lingua-menu').first().boundingBox();
      check(caselle && caselle.x >= 0 && caselle.x + caselle.width <= 360, 'menu lingua intero dentro i 360 px', caselle);
      const intestazione = await page.evaluate(() => { const h = document.querySelector('header'); return h ? h.scrollWidth : -1; });
      check(intestazione >= 0 && intestazione <= 360, `intestazione dentro i 360 px (${intestazione})`);
      await ctx.close();
    }
  } catch (e) {
    console.log('  ✗ Eccezione: ' + e.message);
    failed++;
  } finally {
    // Pulizia sul DB vero: la notifica e le presenze lasciate dal login da ospite. Prima del close,
    // così se il browser si pianta la pulizia parte comunque.
    const filtri = [];
    for (const n of creati) {
      const q = encodeURIComponent(n);
      filtri.push(`notifications?user_nickname=eq.${q}`, `online_users?nickname=eq.${q}`);
    }
    try { await purge(SUPABASE_URL, filtri, { label: 'lingue-ui' }); }
    finally { try { await browser.close(); } catch (e) { console.log('  (browser.close: ' + e.message + ')'); } }
  }

  console.log(`\n${passed} passati, ${failed} falliti`);
  process.exit(failed ? 1 : 0);
}

run();
