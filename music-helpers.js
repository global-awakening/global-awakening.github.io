/**
 * music-helpers.js — far partire la musica dei rituali su un telefono.
 *
 * Vive fuori da app.jsx per lo stesso motivo di push-helpers.js: è la parte che decide se una
 * persona sente qualcosa o no, e dentro l'app non si può provare senza un rituale live, un
 * database e un telefono in mano. Qui si prova in node, a comando (test-musica-sblocco.js).
 *
 * IL PROBLEMA CHE RISOLVE. I browser dei telefoni non lasciano uscire audio da una pagina che
 * la persona non ha ancora toccato. Non è un errore da correggere: è una difesa contro i siti
 * che urlano appena si aprono, e non si può aggirare. La si può però assecondare, e sono due
 * i modi in cui ci blocca:
 *
 *   1. `play()` viene rifiutato (una promise respinta con NotAllowedError);
 *   2. `play()` passa — perché partiamo a volume zero, e per il browser "volume zero" è
 *      "muto", e un audio muto può partire da solo — e la pausa arriva dopo, nel momento in
 *      cui la dissolvenza alza il volume: togliere il muto senza un gesto non è permesso.
 *
 * Il secondo caso è quello insidioso: nessun errore, nessuna promise respinta, l'app crede di
 * star suonando. Per questo qui si sorveglia anche l'evento `pause`.
 *
 * In entrambi i casi la strada è la stessa: restare in ascolto e ripartire al primo gesto
 * della persona, qualunque esso sia. Non chiediamo un gesto apposta — il primo tocco che
 * farebbe comunque basta.
 *
 * Stile ES5 e nessuna dipendenza: lo carica app.html con un <script>, e node dai test.
 */
(function (globale) {
  'use strict';

  // Gli eventi che il browser considera un gesto vero. `click` non basta da solo: su un
  // telefono arriva tardi, e comunque non arriva mai se la persona scorre soltanto.
  var EVENTI_GESTO = ['pointerdown', 'touchstart', 'keydown'];

  var VOLUME_PREDEFINITO = 0.35;
  var PASSO_PREDEFINITO = 0.03;
  var INTERVALLO_PREDEFINITO = 60;

  /**
   * Dissolvenza dal volume attuale di `el` fino a `verso`, poi `poi()`.
   * Ritorna una funzione che ferma la dissolvenza a metà.
   */
  function dissolvenza(el, verso, opz, poi) {
    var passo = opz.passo || PASSO_PREDEFINITO;
    var intervallo = opz.intervallo == null ? INTERVALLO_PREDEFINITO : opz.intervallo;
    var fermata = false;
    var timer = null;

    var tick = function () {
      if (fermata) return;
      var delta = verso - el.volume;
      if (Math.abs(delta) < passo) {
        el.volume = verso;
        if (poi) poi();
        return;
      }
      var prima = el.volume;
      el.volume = Math.max(0, Math.min(1, prima + (delta > 0 ? passo : -passo)));
      // Ci sono telefoni dove il volume non si comanda via codice: l'assegnazione non fa
      // niente. Senza questa uscita la dissolvenza girerebbe per sempre e `poi` non
      // verrebbe chiamato MAI — cioè, allo spegnimento, la musica non si fermerebbe più.
      if (el.volume === prima) {
        if (poi) poi();
        return;
      }
      timer = setTimeout(tick, intervallo);
    };
    tick();

    return function () { fermata = true; if (timer) clearTimeout(timer); };
  }

  /**
   * Avvia la musica, e se il browser non la lascia partire resta in attesa del primo gesto.
   *
   * @param {HTMLAudioElement} el
   * @param {object} [opz]
   *   volume      volume finale (default 0.35)
   *   passo       incremento di volume per passo (default 0.03)
   *   intervallo  millisecondi fra un passo e l'altro (default 60)
   *   documento   dove ascoltare il primo gesto (default `document`)
   *   onStato     riceve 'in-riproduzione' oppure 'in-attesa-di-gesto'
   * @returns {function} da chiamare per smontare tutto
   */
  function avviaMusica(el, opz) {
    opz = opz || {};
    var volume = opz.volume == null ? VOLUME_PREDEFINITO : opz.volume;
    var documento = opz.documento || (typeof document !== 'undefined' ? document : null);
    var onStato = opz.onStato || function () {};

    var annullato = false;
    var armato = false;
    var fermaDissolvenza = null;

    function alGesto() {
      disarma();
      if (annullato) return;
      prova();
    }

    function arma() {
      if (annullato || armato || !documento) return;
      armato = true;
      onStato('in-attesa-di-gesto');
      for (var i = 0; i < EVENTI_GESTO.length; i++) {
        documento.addEventListener(EVENTI_GESTO[i], alGesto, { capture: true });
      }
    }

    function disarma() {
      if (!armato || !documento) return;
      armato = false;
      for (var i = 0; i < EVENTI_GESTO.length; i++) {
        documento.removeEventListener(EVENTI_GESTO[i], alGesto, { capture: true });
      }
    }

    // La pausa che non abbiamo chiesto noi: è il browser che ci ferma mentre alziamo il
    // volume. Da fuori è indistinguibile dal successo, ed è il motivo per cui il problema
    // sul telefono era invisibile.
    function suPausa() {
      if (annullato) return;
      if (fermaDissolvenza) fermaDissolvenza();
      arma();
    }
    el.addEventListener('pause', suPausa);

    function prova() {
      if (annullato) return;
      el.volume = 0;
      var p;
      try {
        p = el.play();
      } catch (_) {
        arma();           // browser vecchi: solleva invece di respingere la promise
        return;
      }
      if (!p || !p.then) { // browser vecchi: play() senza promise. Non sapremo mai se è andata.
        onStato('in-riproduzione');
        fermaDissolvenza = dissolvenza(el, volume, opz);
        return;
      }
      p.then(function () {
        if (annullato) return;
        onStato('in-riproduzione');
        fermaDissolvenza = dissolvenza(el, volume, opz);
      })['catch'](function () {
        if (annullato) return;
        arma();
      });
    }

    prova();

    return function () {
      annullato = true;
      if (fermaDissolvenza) fermaDissolvenza();
      disarma();
      el.removeEventListener('pause', suPausa);
    };
  }

  /**
   * Spegne la musica in dissolvenza. Ritorna una funzione per interrompere lo spegnimento.
   */
  function fermaMusica(el, opz) {
    return dissolvenza(el, 0, opz || {}, function () { el.pause(); });
  }

  var api = { avviaMusica: avviaMusica, fermaMusica: fermaMusica };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.MusicHelpers = api;
})(typeof self !== 'undefined' ? self : this);
