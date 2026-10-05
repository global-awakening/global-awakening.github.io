/**
 * push-helpers.js — funzioni pure delle notifiche push.
 *
 * Vive fuori da sw.js per un motivo solo: dentro un service worker non si testa niente, e
 * questa è la parte che decide cosa legge la persona sul telefono. Caricato da sw.js con
 * importScripts() e da node con require().
 *
 * Deliberatamente in stile ES5 e senza dipendenze: gira dentro un service worker, dove non
 * c'è nessun passaggio di build.
 *
 * Due famiglie di notifiche: i rituali (reminder, start — le manda notify-ritual-start) e, dal
 * 2026-10, gli inviti a un training telepatico (invito, accettato, rifiutato, scaduto — le manda
 * notify-telepathy-invite). Qualunque altro tipo diventa un testo neutro: prima diventava
 * «sta iniziando ora» di un rituale, che per un invito sarebbe stato falso.
 */
(function (globale) {
  'use strict';

  var TESTI = {
    it: {
      unRituale: 'Un rituale',
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
      unRituale: 'A ritual',
      reminder: function (n) {
        return { titolo: n + ' is about to begin', corpo: 'Get ready: the ritual is about to start.' };
      },
      start: function (n) {
        return { titolo: n + ' is starting now', corpo: 'The ritual has begun. Join now.' };
      }
    },
    es: {
      unRituale: 'Un ritual',
      reminder: function (n) {
        return { titolo: n + ' está a punto de empezar', corpo: 'Prepárate: el ritual está a punto de comenzar.' };
      },
      start: function (n) {
        return { titolo: n + ' está empezando ahora', corpo: 'El ritual ha comenzado. Únete ahora.' };
      }
    },
    fr: {
      unRituale: 'Un rituel',
      reminder: function (n) {
        return { titolo: n + ' va bientôt commencer', corpo: 'Prépare-toi : le rituel va bientôt commencer.' };
      },
      start: function (n) {
        return { titolo: n + ' commence maintenant', corpo: 'Le rituel a commencé. Rejoins-le maintenant.' };
      }
    }
  };

  // Inviti. Nessun numero di minuti nemmeno qui: la durata dipende da com'era il destinatario
  // (45 s o 10 minuti) e il tempo scorre mentre la notifica aspetta.
  var TESTI_INVITO = {
    it: {
      invito: function (n) { return { titolo: n + ' ti invita a un training telepatico', corpo: 'Tocca per rispondere.' }; },
      accettato: function (n) { return { titolo: n + ' ha accettato, entra!', corpo: 'Il training ti aspetta.' }; },
      rifiutato: function (n) { return { titolo: n + ' non può ora', corpo: 'Puoi invitare qualcun altro.' }; },
      scaduto: function (n) { return { titolo: "L'invito a " + n + ' è scaduto', corpo: 'Puoi riprovare quando vuoi.' }; },
      blocca: 'Non voglio più inviti da questa persona',
      qualcuno: 'Qualcuno',
      neutro: { titolo: 'Global Awakening', corpo: "Apri l'app" }
    },
    en: {
      invito: function (n) { return { titolo: n + ' invites you to a telepathy training', corpo: 'Tap to answer.' }; },
      accettato: function (n) { return { titolo: n + ' accepted, join now!', corpo: 'The training is waiting for you.' }; },
      rifiutato: function (n) { return { titolo: n + " can't right now", corpo: 'You can invite someone else.' }; },
      scaduto: function (n) { return { titolo: 'Your invite to ' + n + ' has expired', corpo: 'You can try again any time.' }; },
      blocca: 'No more invites from this person',
      qualcuno: 'Someone',
      neutro: { titolo: 'Global Awakening', corpo: 'Open the app' }
    },
    es: {
      invito: function (n) { return { titolo: n + ' te invita a un entrenamiento de telepatía', corpo: 'Toca para responder.' }; },
      accettato: function (n) { return { titolo: n + ' ha aceptado, ¡entra!', corpo: 'El entrenamiento te espera.' }; },
      rifiutato: function (n) { return { titolo: n + ' no puede ahora', corpo: 'Puedes invitar a otra persona.' }; },
      scaduto: function (n) { return { titolo: 'La invitación a ' + n + ' ha vencido', corpo: 'Puedes intentarlo cuando quieras.' }; },
      blocca: 'No quiero más invitaciones de esta persona',
      qualcuno: 'Alguien',
      neutro: { titolo: 'Global Awakening', corpo: 'Abre la app' }
    },
    fr: {
      invito: function (n) { return { titolo: n + " t'invite à un entraînement de télépathie", corpo: 'Touche pour répondre.' }; },
      accettato: function (n) { return { titolo: n + ' a accepté, entre !', corpo: "L'entraînement t'attend." }; },
      rifiutato: function (n) { return { titolo: n + ' ne peut pas pour le moment', corpo: "Tu peux inviter quelqu'un d'autre." }; },
      scaduto: function (n) { return { titolo: "L'invitation à " + n + ' a expiré', corpo: 'Tu peux réessayer quand tu veux.' }; },
      blocca: "Je ne veux plus d'invitations de cette personne",
      qualcuno: "Quelqu'un",
      neutro: { titolo: 'Global Awakening', corpo: "Ouvre l'app" }
    }
  };

  var TIPI_INVITO = ['invito', 'accettato', 'rifiutato', 'scaduto'];
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function eTipoInvito(tipo) { return TIPI_INVITO.indexOf(tipo) !== -1; }

  /**
   * Costruisce titolo, testo, tag, destinazione e azioni di una notifica.
   *
   * Non solleva mai: `userVisibleOnly` ci obbliga a mostrare SEMPRE una notifica quando ne
   * arriva una. Se questo codice esplodesse su un payload storto, il browser mostrerebbe una
   * notifica generica di sistema al posto nostro e, a forza di quelle, ci toglierebbe il
   * permesso. Quindi ogni campo ha un ripiego.
   */
  function costruisciNotifica(payload) {
    var p = payload || {};
    // Le due tabelle hanno le stesse lingue; si controllano entrambe perché una lingua a metà
    // (rituali sì, inviti no) farebbe sollevare l'eccezione che questa funzione promette di evitare.
    var lingua = TESTI[p.locale] && TESTI_INVITO[p.locale] ? p.locale : 'en';

    if (p.tipo === 'reminder' || p.tipo === 'start') {
      var tipo = p.tipo;
      var nome = typeof p.rituale === 'string' && p.rituale.length > 0 ? p.rituale : TESTI[lingua].unRituale;
      var rid = typeof p.ritualeId === 'number' ? p.ritualeId : '';
      var t = TESTI[lingua][tipo](nome);
      return {
        titolo: t.titolo,
        corpo: t.corpo,
        // Il centro notifiche del telefono sostituisce le notifiche con lo stesso tag: se
        // promemoria e avvio lo condividessero, l'avvio cancellerebbe il promemoria invece
        // di affiancarlo.
        tag: 'rituale-' + rid + '-' + tipo,
        url: rid === '' ? 'app.html' : 'app.html?ritual=' + rid,
        azioni: []
      };
    }

    var ti = TESTI_INVITO[lingua];
    if (eTipoInvito(p.tipo)) {
      var chi = typeof p.nome === 'string' && p.nome.length > 0 ? p.nome : ti.qualcuno;
      var id = typeof p.invito === 'string' && UUID.test(p.invito) ? p.invito.toLowerCase() : '';
      var ts = ti[p.tipo](chi);
      return {
        titolo: ts.titolo,
        corpo: ts.corpo,
        // Stesso tag per tutti i messaggi di un invito: «accettato» sostituisce «invito» invece
        // di impilarsi, e dove la push si mostra anche con l'app aperta (Safari) non ci sono doppioni.
        tag: 'invito-' + (id || 'senza-id'),
        url: id ? 'app.html?invito=' + id : 'app.html',
        // Il service worker non chiama RPC (non ha la credenziale di un iscritto): l'azione apre
        // l'app sulla conferma del blocco. Dove le azioni non esistono (iPhone) la stessa scelta
        // sta nella schermata dell'invito.
        azioni: p.tipo === 'invito' && id ? [{ action: 'blocca', title: ti.blocca }] : []
      };
    }

    return { titolo: ti.neutro.titolo, corpo: ti.neutro.corpo, tag: 'ga-generico', url: 'app.html', azioni: [] };
  }

  /** La destinazione del tocco su un'azione della notifica. Solo gli inviti hanno «blocca». */
  function urlAzione(url, azione) {
    if (azione === 'blocca' && typeof url === 'string' && url.indexOf('?invito=') !== -1) return url + '&azione=blocca';
    return url;
  }

  /**
   * Se si può NON mostrare una push d'invito quando l'app è in primo piano. Solo Chromium fuori
   * da iOS lo tollera: Safari (anche Chrome su iPhone, che sotto è Safari) conta le push senza
   * notifica e può togliere il permesso; Firefox ha una quota. Nel dubbio si mostra.
   */
  function puoTacere(userAgent) {
    var ua = typeof userAgent === 'string' ? userAgent : '';
    return /(Chrome|Chromium)\//.test(ua) && !/iPhone|iPad|iPod/.test(ua);
  }

  var api = { costruisciNotifica: costruisciNotifica, eTipoInvito: eTipoInvito, urlAzione: urlAzione,
              puoTacere: puoTacere, TIPI_INVITO: TIPI_INVITO };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.PushHelpers = api;
})(typeof self !== 'undefined' ? self : this);
