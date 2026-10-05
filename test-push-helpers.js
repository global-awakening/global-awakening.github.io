/**
 * Test delle funzioni pure delle notifiche push.
 *
 * Dentro un service worker non si testa niente, e questa è la parte che decide cosa legge la
 * persona sul telefono: vive fuori, in push-helpers.js, proprio per poter essere provata.
 *
 * Esecuzione: node test-push-helpers.js
 */
const { costruisciNotifica, urlAzione, puoTacere } = require('./push-helpers.js');

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const uguale = (n, a, b) => (a === b ? ok(n) : ko(n, `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`));

// --- Promemoria -------------------------------------------------------------
const p = costruisciNotifica({ tipo: 'reminder', rituale: 'Luna piena', ritualeId: 42, locale: 'it' });
uguale('promemoria it: titolo', p.titolo, 'Luna piena sta per iniziare');
uguale('promemoria: destinazione', p.url, 'app.html?ritual=42');

// Nessun numero di minuti: chi si iscrive cinque minuti prima dell'inizio è ancora dentro la
// soglia del promemoria, e «inizia tra 15 minuti» sarebbe semplicemente falso.
/\d+\s*minut/i.test(p.titolo + p.corpo)
  ? ko('promemoria senza numero di minuti', p.titolo + ' / ' + p.corpo)
  : ok('promemoria senza numero di minuti');

// --- Avvio ------------------------------------------------------------------
const a = costruisciNotifica({ tipo: 'start', rituale: 'Luna piena', ritualeId: 42, locale: 'it' });
uguale('avvio it: titolo', a.titolo, 'Luna piena sta iniziando ora');

const e = costruisciNotifica({ tipo: 'start', rituale: 'Full moon', ritualeId: 7, locale: 'en' });
uguale('avvio en: titolo', e.titolo, 'Full moon is starting now');

// Il centro notifiche del telefono sostituisce le notifiche con lo stesso tag: se promemoria e
// avvio condividessero il tag, l'avvio cancellerebbe il promemoria invece di affiancarlo.
p.tag !== a.tag ? ok('promemoria e avvio hanno tag diversi') : ko('promemoria e avvio hanno tag diversi', p.tag);

// --- Robustezza -------------------------------------------------------------
const x = costruisciNotifica({ tipo: 'start', rituale: 'X', ritualeId: 1, locale: 'de' });
uguale('lingua sconosciuta ripiega su en', x.titolo, 'X is starting now');

const h = costruisciNotifica({ tipo: 'start', rituale: '<img src=x onerror=alert(1)>', ritualeId: 1, locale: 'it' });
h.titolo.includes('<img src=x onerror=alert(1)>')
  ? ok('il nome del rituale resta testo, non viene interpretato')
  : ko('il nome del rituale resta testo', h.titolo);

// Un payload vuoto o rotto non deve far esplodere il service worker: `userVisibleOnly` ci
// obbliga a mostrare SEMPRE una notifica, e se non ne mostriamo il browser ne mostra una
// generica di sistema — e a forza di quelle ci toglie il permesso.
let vuoto;
try { vuoto = costruisciNotifica({}); ok('payload vuoto non solleva eccezioni'); }
catch (err) { ko('payload vuoto non solleva eccezioni', err.message); }
if (vuoto && typeof vuoto.titolo === 'string' && vuoto.titolo.length > 0) ok('payload vuoto produce comunque un titolo');
else ko('payload vuoto produce comunque un titolo', JSON.stringify(vuoto));

// --- Inviti telepatia (spec 2026-09-25 §4.3) ----------------------------------
const ID = '3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c';
const inv = costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'Aurora', locale: 'it' });
uguale('invito it: titolo', inv.titolo, 'Aurora ti invita a un training telepatico');
uguale('invito it: testo', inv.corpo, 'Tocca per rispondere.');
/\d+\s*minut/i.test(inv.titolo + inv.corpo) ? ko('invito senza numero di minuti', inv.titolo) : ok('invito senza numero di minuti');
uguale('invito: destinazione', inv.url, 'app.html?invito=' + ID);
uguale('invito: tag', inv.tag, 'invito-' + ID);
uguale('invito: azione «blocca»', inv.azioni.length === 1 && inv.azioni[0].action, 'blocca');
uguale('invito en: titolo', costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'Aurora', locale: 'en' }).titolo, 'Aurora invites you to a telepathy training');
const acc = costruisciNotifica({ tipo: 'accettato', invito: ID, nome: 'Bruno', locale: 'it' });
uguale('accettato it', acc.titolo, 'Bruno ha accettato, entra!');
uguale('stesso tag per tutti i messaggi di un invito', acc.tag, inv.tag);
uguale('accettato: nessuna azione', acc.azioni.length, 0);
uguale('rifiutato it', costruisciNotifica({ tipo: 'rifiutato', invito: ID, nome: 'Bruno', locale: 'it' }).titolo, 'Bruno non può ora');
uguale('scaduto it', costruisciNotifica({ tipo: 'scaduto', invito: ID, nome: 'Bruno', locale: 'it' }).titolo, "L'invito a Bruno è scaduto");
uguale('scaduto en', costruisciNotifica({ tipo: 'scaduto', invito: ID, nome: 'Bruno', locale: 'en' }).titolo, 'Your invite to Bruno has expired');
const senza = costruisciNotifica({ tipo: 'invito', locale: 'it' });
uguale('invito senza nome: «Qualcuno»', senza.titolo, 'Qualcuno ti invita a un training telepatico');
uguale('invito senza id: apre l\'app, nessuna azione', `${senza.url}/${senza.azioni.length}`, 'app.html/0');
uguale('un id storto non entra nell\'indirizzo', costruisciNotifica({ tipo: 'invito', invito: 'x"><script>', nome: 'A' }).url, 'app.html');
const lungo = '🌙'.repeat(5) + 'L'.repeat(45);
costruisciNotifica({ tipo: 'invito', invito: ID, nome: lungo, locale: 'it' }).titolo.startsWith(lungo)
  ? ok('nome di 50 caratteri con emoji: intero') : ko('nome di 50 caratteri con emoji: intero', lungo);
costruisciNotifica({ tipo: 'invito', invito: ID, nome: '<b>x</b>', locale: 'it' }).titolo.includes('<b>x</b>')
  ? ok('il nome resta testo') : ko('il nome resta testo', '');
const ign = costruisciNotifica({ tipo: 'boh', rituale: 'Luna', ritualeId: 3, locale: 'it' });
uguale('tipo sconosciuto: testo neutro, non un rituale', `${ign.titolo}/${ign.corpo}/${ign.url}`, "Global Awakening/Apri l'app/app.html");
uguale('promemoria invariato', costruisciNotifica({ tipo: 'reminder', rituale: 'X', ritualeId: 1, locale: 'it' }).titolo, 'X sta per iniziare');
uguale('urlAzione: blocca', urlAzione('app.html?invito=' + ID, 'blocca'), 'app.html?invito=' + ID + '&azione=blocca');
uguale('urlAzione: senza azione', urlAzione('app.html?invito=' + ID, ''), 'app.html?invito=' + ID);
uguale('urlAzione: su un rituale non fa niente', urlAzione('app.html?ritual=4', 'blocca'), 'app.html?ritual=4');
uguale('puoTacere: Chrome su Android', puoTacere('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'), true);
uguale('puoTacere: Safari su iPhone', puoTacere('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), false);
uguale('puoTacere: Chrome su iPhone (sotto è Safari)', puoTacere('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1'), false);
uguale('puoTacere: Firefox', puoTacere('Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0'), false);
// Ruling m7: un nickname con sequenze speciali di String.replace resta letterale.
uguale('il nome con $& e $$ resta letterale', costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'a$&b$$c$1', locale: 'it' }).titolo, 'a$&b$$c$1 ti invita a un training telepatico');
uguale('scaduto: il nome con $& resta letterale', costruisciNotifica({ tipo: 'scaduto', invito: ID, nome: '$&$$', locale: 'en' }).titolo, 'Your invite to $&$$ has expired');
uguale('invito senza nome en: «Someone»', costruisciNotifica({ tipo: 'invito', invito: ID, nome: '', locale: 'en' }).titolo, 'Someone invites you to a telepathy training');

// --- Spagnolo e francese ------------------------------------------------------
const enDi = (o) => costruisciNotifica(Object.assign({ locale: 'en' }, o));
['es', 'fr'].forEach((l) => {
  const casi = [
    { tipo: 'reminder', rituale: 'Luna', ritualeId: 1 }, { tipo: 'start', rituale: 'Luna', ritualeId: 1 },
    { tipo: 'invito', invito: ID, nome: 'Aurora' }, { tipo: 'accettato', invito: ID, nome: 'Aurora' },
    { tipo: 'rifiutato', invito: ID, nome: 'Aurora' }, { tipo: 'scaduto', invito: ID, nome: 'Aurora' }
  ];
  casi.forEach((c) => {
    const r = costruisciNotifica(Object.assign({ locale: l }, c));
    const i = enDi(c);
    r.titolo && r.corpo && r.titolo !== i.titolo && r.corpo !== i.corpo
      ? ok(l + ' ' + c.tipo + ': titolo e testo propri, diversi dall\'inglese')
      : ko(l + ' ' + c.tipo + ': titolo e testo propri', JSON.stringify(r));
    r.titolo.includes('Luna') || r.titolo.includes('Aurora')
      ? ok(l + ' ' + c.tipo + ': contiene il nome') : ko(l + ' ' + c.tipo + ': contiene il nome', r.titolo);
  });
  const sn = costruisciNotifica({ tipo: 'invito', invito: ID, nome: '', locale: l });
  sn.titolo !== enDi({ tipo: 'invito', invito: ID, nome: '' }).titolo && !sn.titolo.startsWith(' ')
    ? ok(l + ' invito senza nome: «qualcuno» tradotto') : ko(l + ' invito senza nome', sn.titolo);
  const az = costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'A', locale: l }).azioni;
  az.length === 1 && az[0].title !== 'No more invites from this person'
    ? ok(l + ' invito: azione «blocca» tradotta') : ko(l + ' invito: azione blocca', JSON.stringify(az));
  const ne = costruisciNotifica({ tipo: 'boh', locale: l });
  ne.corpo !== 'Open the app' ? ok(l + ' tipo sconosciuto: testo neutro tradotto') : ko(l + ' neutro', ne.corpo);
});
uguale('es: titolo avvio', costruisciNotifica({ tipo: 'start', rituale: 'Luna llena', ritualeId: 3, locale: 'es' }).titolo, 'Luna llena está empezando ahora');
uguale('fr: titolo avvio', costruisciNotifica({ tipo: 'start', rituale: 'Pleine lune', ritualeId: 3, locale: 'fr' }).titolo, 'Pleine lune commence maintenant');
uguale('es: nome rituale vuoto, ripiego spagnolo', costruisciNotifica({ tipo: 'start', rituale: '', ritualeId: 3, locale: 'es' }).titolo, 'Un ritual está empezando ahora');
uguale('fr: nome rituale vuoto, ripiego francese', costruisciNotifica({ tipo: 'start', rituale: '', ritualeId: 3, locale: 'fr' }).titolo, 'Un rituel commence maintenant');
uguale('it: nome rituale vuoto, «Un rituale»', costruisciNotifica({ tipo: 'start', rituale: '', ritualeId: 3, locale: 'it' }).titolo, 'Un rituale sta iniziando ora');
uguale('en: nome rituale vuoto, «A ritual»', costruisciNotifica({ tipo: 'start', rituale: '', ritualeId: 3, locale: 'en' }).titolo, 'A ritual is starting now');
uguale('de ripiega su en anche per i rituali', costruisciNotifica({ tipo: 'reminder', rituale: 'X', ritualeId: 1, locale: 'de' }).titolo, 'X is about to begin');
uguale('de ripiega su en anche per gli inviti', costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'A', locale: 'de' }).titolo, 'A invites you to a telepathy training');
uguale('locale «constructor» ripiega su en (rituali)', costruisciNotifica({ tipo: 'start', rituale: 'X', ritualeId: 1, locale: 'constructor' }).titolo, 'X is starting now');
uguale('locale «constructor» ripiega su en (inviti)', costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'A', locale: 'constructor' }).titolo, 'A invites you to a telepathy training');
uguale('locale mancante ripiega su en', costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'A' }).titolo, 'A invites you to a telepathy training');

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
