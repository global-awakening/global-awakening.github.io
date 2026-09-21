/**
 * Test della decisione da prendere quando l'invio di una push fallisce.
 *
 * È la logica più pericolosa del sistema: qui si decide se cancellare l'abbonamento di
 * qualcuno. Un errore qui non produce nessun messaggio, produce persone che smettono di
 * ricevere notifiche senza che nessuno lo sappia.
 *
 * Esecuzione: node test-push-esito.js
 */
const PERCORSO = './supabase/functions/notify-ritual-start/esito.mjs';

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const atteso = (n, a, b) => (a === b ? ok(n) : ko(n, `atteso ${b}, ottenuto ${a}`));

(async () => {
  const { decidiDopoErrore } = await import(PERCORSO);

  // Gli unici due casi in cui il servizio push dichiara morto l'abbonamento.
  atteso('410 → cancella', decidiDopoErrore(410), 'cancella');
  atteso('404 → cancella', decidiDopoErrore(404), 'cancella');

  // Risposta esplicita di non consegna: si può riprovare senza rischio di doppioni.
  atteso('429 → rilascia', decidiDopoErrore(429), 'rilascia');
  atteso('500 → rilascia', decidiDopoErrore(500), 'rilascia');
  atteso('503 → rilascia', decidiDopoErrore(503), 'rilascia');

  // Non sappiamo se è arrivata: si trattiene, e la notifica si perde. Rilasciare qui
  // significherebbe ripetere una consegna riuscita la cui risposta si è persa — fino a
  // quindici volte, col cron al minuto e la finestra del promemoria a quindici.
  atteso('timeout senza codice → trattieni', decidiDopoErrore(undefined), 'trattieni');
  atteso('errore di rete (null) → trattieni', decidiDopoErrore(null), 'trattieni');

  // Un guasto NOSTRO non deve mai cancellare gli abbonamenti delle persone.
  atteso('403 (chiave VAPID sbagliata) → trattieni, NON cancella', decidiDopoErrore(403), 'trattieni');
  atteso('401 → trattieni, NON cancella', decidiDopoErrore(401), 'trattieni');

  // Regola generale che vale la pena bloccare: l'unico esito che tocca push_subscriptions
  // è 'cancella', e lo producono solo 404 e 410. Nessun altro codice, mai.
  const cancellano = [];
  for (let c = 100; c <= 599; c++) if (decidiDopoErrore(c) === 'cancella') cancellano.push(c);
  JSON.stringify(cancellano) === JSON.stringify([404, 410])
    ? ok('solo 404 e 410 cancellano un abbonamento, nessun altro codice')
    : ko('solo 404 e 410 cancellano un abbonamento', JSON.stringify(cancellano));

  console.log(`\n${passati} passati, ${falliti} falliti`);
  process.exit(falliti === 0 ? 0 : 1);
})();
