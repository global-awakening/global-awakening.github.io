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
// Nickname corto (12 caratteri) di proposito: il test misura il menu lingua, non la lunghezza dei nomi.
const NICK_360 = `LinguaUI_${String(SUFFISSO).slice(-3)}`;

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
// Ognuna deve esistere davvero in en o it (controllato sotto), altrimenti l'elenco non prova nulla.
const PAROLE_VIETATE = [
  'Rituals', 'Telepathy', 'Consciousness', 'Logout', 'Online now', 'Active Rituals', 'Create Ritual', 'Guest',
  'Rituali', 'Telepatia', 'Coscienza', 'Esci', 'Ospite', 'Rituali attivi', 'Crea Rituale', 'Invita', 'Impostazioni',
];
const testiEnIt = JSON.stringify([T.en, T.it]).toLowerCase();
const nonPresenti = PAROLE_VIETATE.filter((p) => !testiEnIt.includes(minuscolo(p)));
const paroleDaCercare = PAROLE_VIETATE.filter((p) => !nonPresenti.includes(p));
// Parola intera, senza distinguere maiuscole: «Invita» non deve far scattare «Invitado».
const cercaParola = (testo, p) => new RegExp('(^|[^\\p{L}])' + p.replace(/ /g, '\\s+') + '($|[^\\p{L}])', 'iu').test(testo);

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
    if (nonPresenti.length) console.log('  (parole scartate perché non esistono in en/it: ' + nonPresenti.join(', ') + ')');
    check(paroleDaCercare.length >= 10, `almeno 10 parole da cercare (${paroleDaCercare.length})`);
    {
      const ctx = await browser.newContext({ locale: 'en-US' });
      const page = await ctx.newPage();
      await entraOspite(page, NICK_SEZIONI, 'es');
      for (const tab of ['rituals', 'telepathy', 'consciousness']) {
        const nome = T.es.tabs[tab];
        await page.locator('.main-nav-top button', { hasText: nome }).first().click();
        await page.waitForTimeout(1200);
        // Solo l'interfaccia: intestazione, barra delle sezioni, statistiche e titoli.
        // Il testo scritto dagli utenti (nomi di rituali, post, utenti online) sta fuori.
        const testo = await page.evaluate(() => {
          const sel = ['header', '.main-nav-top', '.stats-grid', 'h1', 'h2', 'h3', '.main-nav-bottom'];
          return sel.flatMap((s) => [...document.querySelectorAll(s)].map((e) => e.innerText)).join('\n');
        });
        check(testo.includes(nome), `sezione «${nome}» visibile (raccolti ${testo.length} caratteri)`);
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
      check(larghezza <= 360, `nessuno scroll orizzontale (scrollWidth ${larghezza})`);
      check(await page.locator('header select[data-test="lingua"]').first().isVisible(), 'menu lingua visibile');
      const intestazione = await page.evaluate(() => { const h = document.querySelector('header'); return h ? h.scrollWidth : -1; });
      check(intestazione >= 0 && intestazione <= 360, `intestazione dentro i 360 px (${intestazione})`);
      await ctx.close();
    }
  } catch (e) {
    console.log('  ✗ Eccezione: ' + e.message);
    failed++;
  } finally {
    await browser.close();
    // Pulizia sul DB vero: la notifica e le presenze lasciate dal login da ospite.
    const filtri = [];
    for (const n of creati) {
      const q = encodeURIComponent(n);
      filtri.push(`notifications?user_nickname=eq.${q}`, `online_users?nickname=eq.${q}`);
    }
    await purge(SUPABASE_URL, filtri, { label: 'lingue-ui' });
  }

  console.log(`\n${passed} passati, ${failed} falliti`);
  process.exit(failed ? 1 : 0);
}

run();
