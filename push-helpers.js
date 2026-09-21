/**
 * push-helpers.js — funzioni pure delle notifiche push.
 *
 * Vive fuori da sw.js per un motivo solo: dentro un service worker non si testa niente, e
 * questa è la parte che decide cosa legge la persona sul telefono. Caricato da sw.js con
 * importScripts() e da node con require().
 *
 * Deliberatamente in stile ES5 e senza dipendenze: gira dentro un service worker, dove non
 * c'è nessun passaggio di build.
 */
(function (globale) {
  'use strict';

  var TESTI = {
    it: {
      // Nessun numero di minuti: chi si iscrive cinque minuti prima dell'inizio è ancora
      // dentro la soglia del promemoria, e «inizia tra 15 minuti» sarebbe falso.
      reminder: function (n) {
        return { titolo: n + ' sta per iniziare', corpo: 'Preparati: il rituale sta per cominciare.' };
      },
      start: function (n) {
        return { titolo: n + ' sta iniziando ora', corpo: 'Il rituale è iniziato. Unisciti adesso.' };
      }
    },
    en: {
      reminder: function (n) {
        return { titolo: n + ' is about to begin', corpo: 'Get ready: the ritual is about to start.' };
      },
      start: function (n) {
        return { titolo: n + ' is starting now', corpo: 'The ritual has begun. Join now.' };
      }
    }
  };

  /**
   * Costruisce titolo, testo, tag e destinazione di una notifica.
   *
   * Non solleva mai: `userVisibleOnly` ci obbliga a mostrare SEMPRE una notifica quando ne
   * arriva una. Se questo codice esplodesse su un payload storto, il browser mostrerebbe una
   * notifica generica di sistema al posto nostro e, a forza di quelle, ci toglierebbe il
   * permesso. Quindi ogni campo ha un ripiego.
   *
   * @param {{tipo?:string, rituale?:string, ritualeId?:number, locale?:string}} payload
   * @returns {{titolo:string, corpo:string, tag:string, url:string}}
   */
  function costruisciNotifica(payload) {
    var p = payload || {};
    var lingua = TESTI[p.locale] ? p.locale : 'en';
    var tipo = p.tipo === 'reminder' ? 'reminder' : 'start';
    var nome = typeof p.rituale === 'string' && p.rituale.length > 0 ? p.rituale : (lingua === 'it' ? 'Un rituale' : 'A ritual');
    var id = typeof p.ritualeId === 'number' ? p.ritualeId : '';

    var t = TESTI[lingua][tipo](nome);

    return {
      titolo: t.titolo,
      corpo: t.corpo,
      // Il centro notifiche del telefono sostituisce le notifiche con lo stesso tag: se
      // promemoria e avvio lo condividessero, l'avvio cancellerebbe il promemoria invece
      // di affiancarlo.
      tag: 'rituale-' + id + '-' + tipo,
      url: id === '' ? 'app.html' : 'app.html?ritual=' + id
    };
  }

  var api = { costruisciNotifica: costruisciNotifica };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.PushHelpers = api;
})(typeof self !== 'undefined' ? self : this);
