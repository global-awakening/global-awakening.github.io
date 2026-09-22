/**
 * finestre.mjs — decide se un rituale merita una notifica adesso, e quale.
 *
 * Vive in un file suo perché è l'unica parte del motore provabile senza database né rete:
 * Deno lo importa dalla Edge Function, node lo carica dai test con import() dinamico.
 * È in .mjs e non .js perché un file non può essere insieme CommonJS e ESM, e Deno vuole ESM.
 *
 * SOGLIE, non intervalli stretti. Se un'esecuzione del cron salta, quella dopo recupera invece
 * di perdere la notifica. È la tabella ritual_notifications_sent (chiave primaria composta su
 * rituale + telefono + tipo) a rendere sicura una soglia larga: la seconda occasione non
 * produce un doppione, perché la prenotazione è già stata presa.
 */

const QUINDICI_MINUTI = 15 * 60000;
const CINQUE_MINUTI = 5 * 60000;

/**
 * @param {number} adesso   millisecondi
 * @param {number} inizio   millisecondi
 * @param {number} [durata] durata del rituale in millisecondi. Se manca, si usa la rete di
 *                          sicurezza piena di cinque minuti (com'era prima del 22/09/2026).
 * @returns {'reminder'|'start'|null}
 */
export function classifica(adesso, inizio, durata) {
  // Una data illeggibile non deve far suonare niente a nessuno: meglio silenzio che una
  // notifica all'ora sbagliata.
  if (!Number.isFinite(adesso) || !Number.isFinite(inizio)) return null;

  // I cinque minuti sono una RETE DI SICUREZZA, non un ritardo previsto: il cron gira ogni
  // minuto, e servono solo a recuperare un giro saltato. Ma non devono durare più del rituale:
  // da quando la durata proposta è tre minuti, una «sta iniziando ORA» recuperata al quarto
  // minuto arriverebbe a rituale finito. Una beffa, non un avviso.
  const finestraAvvio = Number.isFinite(durata) && durata > 0
    ? Math.min(CINQUE_MINUTI, durata)
    : CINQUE_MINUTI;

  // L'avvio si controlla per primo: a T esatto entrambe le condizioni sarebbero vere se
  // scritte al contrario, e la persona riceverebbe il promemoria mentre il rituale è iniziato.
  if (adesso >= inizio && adesso < inizio + finestraAvvio) return 'start';
  if (adesso >= inizio - QUINDICI_MINUTI && adesso < inizio) return 'reminder';
  return null;
}

/**
 * Il database tiene `date` e `time` come TESTO, in UTC — la PR #4 del 18/09 ha spostato la
 * conversione di fuso sul contorno lasciando il database com'era.
 *
 * La `Z` finale non è decorativa: senza, Deno interpreta la stringa nel fuso del server e i
 * rituali suonano all'ora sbagliata. È lo stesso errore che l'app faceva in faccia alle
 * persone prima della PR #4, spostato dentro al server.
 *
 * @returns {number} millisecondi, oppure NaN se la data non è leggibile
 */
export function istanteInizio(data, ora) {
  const oraPiena = /^\d{2}:\d{2}$/.test(ora) ? ora + ':00' : ora;
  return Date.parse(`${data}T${oraPiena}Z`);
}
