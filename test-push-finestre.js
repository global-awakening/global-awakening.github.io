/**
 * Test della logica che decide se un rituale merita una notifica adesso, e quale.
 *
 * È l'unica parte del motore provabile senza database né rete, ed è anche quella dove un
 * errore non si vede: una soglia sbagliata non dà nessun errore, semplicemente le notifiche
 * arrivano all'ora sbagliata o non arrivano affatto.
 *
 * Il modulo è ESM, perché è Deno a importarlo dalla Edge Function: da CommonJS si carica con
 * import() dinamico, quindi il corpo del test sta dentro una funzione async.
 *
 * Esecuzione: node test-push-finestre.js
 */
const PERCORSO = './supabase/functions/notify-ritual-start/finestre.mjs';

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const atteso = (n, a, b) => (a === b ? ok(n) : ko(n, `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`));

(async () => {
  const { classifica, istanteInizio } = await import(PERCORSO);

  const INIZIO = Date.parse('2026-09-21T21:00:00Z');
  const min = (m) => INIZIO + m * 60000;

  // --- Le soglie -------------------------------------------------------------
  atteso('T-16 → niente',     classifica(min(-16), INIZIO), null);
  atteso('T-15 → promemoria', classifica(min(-15), INIZIO), 'reminder');
  atteso('T-1  → promemoria', classifica(min(-1),  INIZIO), 'reminder');
  atteso('T    → avvio',      classifica(INIZIO,   INIZIO), 'start');
  atteso('T+4  → avvio',      classifica(min(4),   INIZIO), 'start');
  atteso('T+6  → niente',     classifica(min(6),   INIZIO), null);

  // A T esatto entrambe le condizioni sarebbero vere se scritte nell'ordine sbagliato, e la
  // persona riceverebbe il promemoria mentre il rituale è già iniziato.
  atteso('a T esatto vince l\'avvio, non il promemoria', classifica(INIZIO, INIZIO), 'start');

  // Una data illeggibile non deve far suonare niente a nessuno.
  atteso('istante illeggibile → niente', classifica(NaN, INIZIO), null);
  atteso('inizio illeggibile → niente',  classifica(INIZIO, NaN), null);

  // --- La lettura di data e ora ----------------------------------------------
  atteso('data+ora lette come UTC', istanteInizio('2026-09-21', '21:00'), INIZIO);
  atteso('ora con i secondi',       istanteInizio('2026-09-21', '21:00:00'), INIZIO);
  atteso('data malformata → NaN',   Number.isNaN(istanteInizio('non-una-data', '21:00')), true);

  // La prova che smaschera un'interpretazione nel fuso locale: se questo valore cambiasse col
  // fuso della macchina, la lettura non sarebbe in UTC e i rituali suonerebbero sfasati.
  atteso('l\'istante non dipende dal fuso della macchina',
    new Date(istanteInizio('2026-09-21', '21:00')).toISOString(), '2026-09-21T21:00:00.000Z');

  console.log(`\n${passati} passati, ${falliti} falliti`);
  process.exit(falliti === 0 ? 0 : 1);
})();
