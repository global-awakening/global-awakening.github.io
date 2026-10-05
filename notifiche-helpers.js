/**
 * notifiche-helpers.js — le notifiche della campanella nella lingua dell'app.
 *
 * Le righe di `notifications` contengono una frase italiana già composta (la scrivono il client
 * per ritual_join/ritual_comment/comment e l'SQL per private_message/telepathy_invite/
 * telepathy_declined), uguale in tutta la storia del progetto. Invece di cambiare il database,
 * qui si riconosce la frase PER TIPO, se ne estraggono nome ed eventuale rituale, e la si
 * riscrive. Una riga che non corrisponde si mostra com'è. Spec lingue §3.4.
 * Stile ES5, nessuna dipendenza; provato in node da test-notifiche-helpers.js.
 */
(function (globale) {
  'use strict';

  // Coda fissa per tipo. Ancorate in fondo: il nome è TUTTO quello che precede la coda, spazi
  // compresi; il rituale va fino all'ultima virgoletta, così regge le virgolette nel nome.
  var FORME = {
    ritual_join:        /^(.+) si è unito\/a al tuo rituale "(.*)"$/,
    ritual_comment:     /^(.+) ha commentato il tuo rituale "(.*)"$/,
    comment:            /^(.+) ha commentato il tuo post$/,
    private_message:    /^(.+) ti ha inviato un messaggio privato$/,
    telepathy_invite:   /^(.+) ti ha invitato a un training telepatico$/,
    telepathy_declined: /^(.+) ha rifiutato il tuo invito al training telepatico$/
  };

  var TESTI = {
    en: {
      ritual_join: function (n, r) { return n + ' joined your ritual "' + r + '"'; },
      ritual_comment: function (n, r) { return n + ' commented on your ritual "' + r + '"'; },
      comment: function (n) { return n + ' commented on your post'; },
      private_message: function (n) { return n + ' sent you a private message'; },
      telepathy_invite: function (n) { return n + ' invited you to a telepathy training'; },
      telepathy_declined: function (n) { return n + ' declined your telepathy training invite'; }
    },
    es: {
      ritual_join: function (n, r) { return n + ' se ha unido a tu ritual «' + r + '»'; },
      ritual_comment: function (n, r) { return n + ' ha comentado tu ritual «' + r + '»'; },
      comment: function (n) { return n + ' ha comentado tu publicación'; },
      private_message: function (n) { return n + ' te ha enviado un mensaje privado'; },
      telepathy_invite: function (n) { return n + ' te ha invitado a un entrenamiento telepático'; },
      telepathy_declined: function (n) { return n + ' ha rechazado tu invitación al entrenamiento telepático'; }
    },
    fr: {
      ritual_join: function (n, r) { return n + ' a rejoint ton rituel « ' + r + ' »'; },
      ritual_comment: function (n, r) { return n + ' a commenté ton rituel « ' + r + ' »'; },
      comment: function (n) { return n + ' a commenté ta publication'; },
      private_message: function (n) { return n + ' t’a envoyé un message privé'; },
      telepathy_invite: function (n) { return n + ' t’a invité·e à un entraînement télépathique'; },
      telepathy_declined: function (n) { return n + ' a refusé ton invitation à l’entraînement télépathique'; }
    }
  };

  function testoNotifica(n, lang) {
    var grezzo = n && n.message != null ? String(n.message) : '';
    try {
      if (!n || lang === 'it') return grezzo;
      var forma = FORME[n.type];
      if (!forma) return grezzo;
      var m = grezzo.match(forma);
      if (!m || !m[1].trim()) return grezzo;
      var t = TESTI[lang] || TESTI.en;
      return t[n.type](m[1], m[2]);
    } catch (e) { return grezzo; }
  }

  var api = { testoNotifica: testoNotifica };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.NotificheHelpers = api;
})(typeof self !== 'undefined' ? self : this);
