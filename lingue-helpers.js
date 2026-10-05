/**
 * lingue-helpers.js — quale lingua parla l'app e come si mettono insieme le traduzioni.
 * Vive fuori da app.jsx per lo stesso motivo di inviti-helpers.js: qui si prova in node
 * (test-lingue-helpers.js). Stile ES5, nessuna dipendenza, nessun passaggio di build.
 * Spec: docs/superpowers/specs/2026-10-05-lingue-es-fr-design.md §3.1, §3.3.
 */
(function (globale) {
  'use strict';

  var LINGUE = ['en', 'it', 'es', 'fr'];
  var LOCALE = { en: 'en-GB', it: 'it-IT', es: 'es-ES', fr: 'fr-FR' };
  var NOMI = { en: 'English', it: 'Italiano', es: 'Español', fr: 'Français' };
  var CHIAVE = 'ga_lang';

  function supportata(l) { return typeof l === 'string' && LINGUE.indexOf(l) !== -1; }

  // Dalla lingua del telefono contano le due lettere iniziali: «es-MX» e «es_ES» sono spagnolo.
  function codice(voce) {
    return typeof voce === 'string' ? voce.slice(0, 2).toLowerCase() : '';
  }

  function linguaIniziale(salvata, lingueTelefono) {
    if (supportata(salvata)) return salvata;
    var voci = Array.isArray(lingueTelefono) ? lingueTelefono : [];
    for (var i = 0; i < voci.length; i++) {
      var c = codice(voci[i]);
      if (supportata(c)) return c;
    }
    return 'en';
  }

  // In navigazione privata o con i dati del sito bloccati l'accesso a localStorage solleva:
  // la lingua allora non si ricorda, ma l'app parte lo stesso.
  function leggiLinguaSalvata(storage) {
    try {
      var v = storage ? storage.getItem(CHIAVE) : null;
      return supportata(v) ? v : null;
    } catch (e) { return null; }
  }

  function salvaLingua(storage, l) {
    if (!supportata(l)) return;
    try { if (storage) storage.setItem(CHIAVE, l); } catch (e) { /* non si ricorda: pazienza */ }
  }

  function semplice(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }

  // Fusione profonda solo negli oggetti semplici. Array (privacy.sections, weekdaysShort) e
  // funzioni (dayOf, peopleHere…) si sostituiscono per intero: fonderli pezzo per pezzo
  // creerebbe sezioni metà spagnole e metà inglesi.
  function fondi(base, sopra) {
    var r = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) {
      r[k] = semplice(base[k]) ? fondi(base[k], {}) : base[k];
    }
    if (!semplice(sopra)) return r;
    for (k in sopra) if (Object.prototype.hasOwnProperty.call(sopra, k)) {
      r[k] = semplice(sopra[k]) && semplice(r[k]) ? fondi(r[k], sopra[k]) : sopra[k];
    }
    return r;
  }

  function locale(l) { return LOCALE[l] || 'en-GB'; }
  function etichetta(l) { return supportata(l) ? l.toUpperCase() + ' · ' + NOMI[l] : l; }

  var api = { LINGUE: LINGUE, LOCALE: LOCALE, linguaIniziale: linguaIniziale,
              leggiLinguaSalvata: leggiLinguaSalvata, salvaLingua: salvaLingua,
              fondi: fondi, locale: locale, etichetta: etichetta };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.LingueHelpers = api;
})(typeof self !== 'undefined' ? self : this);
