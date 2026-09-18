/**
 * Orari dei rituali e fusi orari — Global Awakening. node test-orari-rituali.js (server su :4321)
 *
 * Il difetto che questi test sorvegliano: l'app chiedeva l'orario in UTC e lo ristampava in UTC,
 * scaricando la conversione di fuso sulle persone. Chi scriveva 21:00 pensando all'ora del proprio
 * orologio si presentava al rituale con ore di scarto — e lo scarto cambiava da solo al cambio
 * dell'ora legale.
 *
 * Il database resta in UTC (scelta giusta, non si tocca): a cambiare è solo il contorno.
 *
 * Prerequisiti: app su http://localhost:4321/app.html.
 * La pulizia dei dati di test richiede SUPABASE_SERVICE_KEY in .env.test (vedi test-helpers.js).
 */
const { chromium } = require('playwright');
const { purge, loginAsGuest } = require('./test-helpers');

const APP_URL = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const TS = Date.now();
const NICK_ROMA = `OraRoma_${TS}`;
const NICK_BRASILE = `OraBr_${TS}`;
const NOME_RITUALE = `Rituale orario ${TS}`;

// Data lontana dal cambio dell'ora legale (finisce il 25/10/2026) e dal presente,
// così il rituale non risulta mai "live" e il test non dipende dall'istante in cui gira.
const DATA_LOCALE = '2026-10-10';
const ORA_LOCALE = '21:00';

let passed = 0, failed = 0;
const pass = (m) => { console.log('  ✅ ' + m); passed++; };
const fail = (m) => { console.log('  ❌ ' + m); failed++; process.exitCode = 1; };

/** Scarto in minuti fra un fuso e UTC a un dato istante (gestisce da sé l'ora legale). */
function scartoMinuti(istante, fuso) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(istante).map((x) => [x.type, x.value]));
  const comeUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (comeUtc - istante.getTime()) / 60000;
}

/** L'istante UTC che corrisponde a una data/ora scritta in un certo fuso. */
function istanteDa(data, ora, fuso) {
  const tentativo = new Date(`${data}T${ora}:00Z`);
  return new Date(tentativo.getTime() - scartoMinuti(tentativo, fuso) * 60000);
}

/** L'ora HH:MM con cui quell'istante si legge in un certo fuso. */
function oraIn(istante, fuso) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso, hour12: false, hour: '2-digit', minute: '2-digit',
  }).format(istante);
}

(async () => {
  const istante = istanteDa(DATA_LOCALE, ORA_LOCALE, 'Europe/Rome');
  const attesaRoma = oraIn(istante, 'Europe/Rome');          // 21:00
  const attesaBrasile = oraIn(istante, 'America/Sao_Paulo'); // l'altro capo del mondo
  console.log(`Istante di riferimento: ${istante.toISOString()}`);
  console.log(`  atteso a Roma: ${attesaRoma} · atteso a San Paolo: ${attesaBrasile}\n`);

  const browser = await chromium.launch();

  // ── Chi scrive l'orario, dalla propria poltrona italiana ──
  const ctxRoma = await browser.newContext({ timezoneId: 'Europe/Rome', viewport: { width: 1280, height: 900 } });
  const roma = await ctxRoma.newPage();
  await loginAsGuest(roma, NICK_ROMA, { appUrl: APP_URL });
  await roma.locator('button').filter({ hasText: /Rituali|Rituals/ }).first().click();
  await roma.locator('button').filter({ hasText: /Proponi Rituale|Propose Ritual/ }).first().click();
  await roma.waitForTimeout(500);

  // 1. l'etichetta non deve più chiedere alle persone di convertire in UTC
  const etichette = await roma.locator('label').allInnerTexts();
  const etichettaOra = etichette.find((x) => /Ora|Time/i.test(x)) || '';
  if (!/UTC/i.test(etichettaOra)) pass(`l'etichetta dell'ora non parla più di UTC (è "${etichettaOra.trim()}")`);
  else fail(`l'etichetta chiede ancora l'ora in UTC: "${etichettaOra.trim()}"`);

  await roma.locator('input[placeholder*="Full Moon"], input[placeholder*="Luna"]').first().fill(NOME_RITUALE);
  await roma.locator('input[type="date"]').first().fill(DATA_LOCALE);
  await roma.locator('input[type="time"]').first().fill(ORA_LOCALE);
  await roma.locator('button').filter({ hasText: /Crea Rituale|Create Ritual/ }).last().click();
  await roma.waitForTimeout(12000); // la card compare al giro di polling (~10s)

  // la card giusta è il div più interno che contiene SIA il nome SIA la riga della data:
  // senza il secondo filtro si prende un pezzo di card e il controllo passerebbe a vuoto
  const cardRoma = roma.locator('div').filter({ hasText: NOME_RITUALE }).filter({ hasText: /[0-9]{1,2}:[0-9]{2}/ }).last();
  const testoRoma = await cardRoma.innerText().catch(() => '');

  // 2. chi scrive un orario deve riveder(si) lo stesso orario
  if (testoRoma.includes(attesaRoma)) pass(`a Roma il rituale si legge alle ${attesaRoma}, come scritto`);
  else fail(`a Roma il rituale non mostra ${attesaRoma}. Testo della card: ${JSON.stringify(testoRoma.slice(0, 160))}`);

  // 3. e non deve vedersi sbattuto in faccia un fuso che non è il suo
  // il controllo su UTC vale solo se la card contiene davvero una data: altrimenti
  // "non c’è UTC" sarebbe vero perché non c’è niente
  const cardRomaHaData = /[0-9]{1,2}:[0-9]{2}/.test(testoRoma);
  if (cardRomaHaData && !/UTC/i.test(testoRoma)) pass('la card non mostra più un orario in UTC');
  else if (!cardRomaHaData) fail('la card non contiene nessuna data: il controllo su UTC non sarebbe valido');
  else fail('la card mostra ancora l\'orario in UTC');

  // ── Chi lo guarda dall'altra parte del mondo ──
  const ctxBr = await browser.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: 1280, height: 900 } });
  const brasile = await ctxBr.newPage();
  await loginAsGuest(brasile, NICK_BRASILE, { appUrl: APP_URL });
  await brasile.locator('button').filter({ hasText: /Rituali|Rituals/ }).first().click();
  await brasile.waitForTimeout(12000);

  const cardBr = brasile.locator('div').filter({ hasText: NOME_RITUALE }).filter({ hasText: /[0-9]{1,2}:[0-9]{2}/ }).last();
  const testoBr = await cardBr.innerText().catch(() => '');

  // 4. stesso istante, orologio diverso: è il senso di un rituale mondiale simultaneo
  if (testoBr.includes(attesaBrasile)) pass(`a San Paolo lo stesso rituale si legge alle ${attesaBrasile}`);
  else fail(`a San Paolo il rituale non mostra ${attesaBrasile}. Testo della card: ${JSON.stringify(testoBr.slice(0, 160))}`);

  await browser.close();

  console.log('\n— Pulizia —');
  const enc = encodeURIComponent;
  await purge(SUPABASE_URL, [
    `rituals?name=eq.${enc(NOME_RITUALE)}`,
    `online_users?nickname=eq.${enc(NICK_ROMA)}`,
    `online_users?nickname=eq.${enc(NICK_BRASILE)}`,
  ], { label: 'orari-rituali' });

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
})();
