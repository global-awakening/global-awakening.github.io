/**
 * esito.mjs — cosa fare quando l'invio di una push fallisce.
 *
 * Isolato e testabile perché è la logica più pericolosa dell'intero sistema: qui si decide se
 * cancellare l'abbonamento di qualcuno. Sbagliarla non produce nessun errore visibile, produce
 * persone che smettono di ricevere notifiche senza che nessuno lo sappia.
 *
 * Tre esiti possibili, e la differenza fra loro è cosa sappiamo della consegna:
 *
 *   'cancella'  — il servizio push dichiara l'abbonamento morto (404/410). È l'unico caso in
 *                 cui si tocca `push_subscriptions`.
 *   'rilascia'  — abbiamo una risposta esplicita che dice «non consegnato» (429, 5xx). La
 *                 prenotazione si libera e il giro dopo riprova: sappiamo che non è arrivata.
 *   'trattieni' — non sappiamo se è arrivata (timeout, connessione caduta, DNS, errore senza
 *                 codice). La prenotazione RESTA presa e la notifica si perde.
 *
 * L'ultimo caso è il cuore della cosa. Se rilasciassimo la prenotazione su un timeout, una
 * consegna riuscita la cui risposta si è persa verrebbe ripetuta al giro dopo — e col cron al
 * minuto e la finestra del promemoria a quindici, la stessa persona riceverebbe fino a quindici
 * vibrazioni identiche. Il rischio è asimmetrico: perdere una notifica è spiacevole, farsi
 * spegnere le push è definitivo.
 *
 * E un 403 (chiave VAPID sbagliata) NON cancella niente: è un guasto nostro, non un abbonamento
 * morto, e cancellare gli abbonamenti perché abbiamo ruotato una chiave sarebbe un disastro
 * silenzioso e irreversibile.
 */

/**
 * @param {number|undefined} statusCode  lo stato HTTP riportato dal servizio push, se c'è
 * @returns {'cancella'|'rilascia'|'trattieni'}
 */
export function decidiDopoErrore(statusCode) {
  if (statusCode === 404 || statusCode === 410) return 'cancella';
  if (statusCode === 429) return 'rilascia';
  if (typeof statusCode === 'number' && statusCode >= 500 && statusCode <= 599) return 'rilascia';
  return 'trattieni';
}
