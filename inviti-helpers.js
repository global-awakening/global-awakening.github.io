/**
 * inviti-helpers.js — la logica degli inviti a un training telepatico che l'app usa senza
 * toccare la rete. Vive fuori da app.jsx per lo stesso motivo di push-helpers.js e
 * music-helpers.js: dentro l'app non si prova senza un database e due telefoni; qui si prova in
 * node (test-inviti-helpers.js). Stile ES5, nessuna dipendenza, nessun passaggio di build.
 *
 * Una regola attraversa tutto il file: i tempi si contano dall'ora del SERVER (campo `adesso`
 * delle RPC), non dall'orologio del telefono, che può essere avanti o indietro di minuti.
 */
(function (globale) {
  'use strict';

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var TESTI = {
    it: {
      invito_in_corso: 'Hai già un invito in corso',
      gia_invitato: 'È già stato invitato, riprova fra poco',
      troppi_inviti: 'Hai mandato troppi inviti, riprova più tardi',
      non_disponibile: 'Non è più disponibile',
      in_match: 'Sei già in un training',
      dati_non_validi: 'Qualcosa non torna: riprova',
      non_trovato: 'Invito non trovato su questo dispositivo',
      // Bloccando dalla scheda o dalla lista Online la RPC risponde non_trovato quando la persona
      // non esiste più o c'è un blocco: non c'entra nessun invito, quindi un testo neutro.
      non_trovato_scheda: 'Questa persona non è più raggiungibile',
      scaduto: "L'invito è scaduto",
      rifiutato: '{nome} non può ora',
      annullato: "L'invito è stato ritirato",
      gia_accettato: "L'invito è già stato accettato",
      non_ce_piu: "L'altra persona non c'è più",
      // L'invito in uscita non c'è più sul server (le app vecchie cancellano gli inviti ricevuti
      // dopo 2 minuti): il pulsante si libera e si può reinvitare.
      invito_sparito: "L'invito non c'è più: puoi mandarne un altro",
      match_non_valido: 'Non è stato possibile avviare il training: riprova',
      nessun_abbonamento: 'Le notifiche di questo telefono non sono più attive: riaccendi per ricevere inviti',
      senza_abbonamento: 'Le notifiche di questo telefono non sono più attive: riaccendi per ricevere inviti',
      permesso_negato: "Senza il permesso per le notifiche non puoi ricevere inviti quando l'app è chiusa",
      // Browser senza Push (iOS Safari non installata, ecc.): non «non sono più attive».
      push_non_supportata: 'Su questo browser non si possono ricevere notifiche',
      push_saltata: "Non gli arriverà una notifica ora: lo vedrà se apre l'app entro la scadenza",
      // Il server risponde «Auth failed» a chi è registrato ma ha una credenziale vecchia.
      auth_fallita: 'La tua sessione non è più valida: accedi di nuovo',
      errore: 'Connessione non riuscita: riprova',
      interruttore: 'Ricevi inviti anche quando non sei collegata/o',
      nota_nome: "Il tuo nome sarà visibile a tutti quelli che usano l'app.",
      disponibili: 'Disponibili su invito',
      invita: 'Invita a un training',
      blocca: 'Non voglio più inviti da questa persona',
      conferma_blocco: 'Non riceverai più inviti da {nome}, e non potrai invitarla/o. Confermi?',
      bloccato_ok: 'Non riceverai più inviti da {nome}',
      conferma: "Conferma', annulla: 'Annulla', chiudi: 'Chiudi', rifiuta: 'Rifiuta",
      invito_a: 'Invito a {nome}: {tempo}',
      scade_fra: 'scade fra {tempo}',
      scaduto_breve: 'scaduto',
      attesa_invitante: 'In attesa che {nome} entri… ({tempo})',
      non_arrivato: '{nome} non è arrivato: torni alla lobby',
      invito_durante_training: '{nome} ti ha invitato: sei già in un training',
      prove: "Prove', indovinate: 'Indovinate",
      qualcuno: 'Qualcuno'
    },
    en: {
      invito_in_corso: 'You already have an invite in progress',
      gia_invitato: 'Already invited by someone else, try again shortly',
      troppi_inviti: 'You sent too many invites, try again later',
      non_disponibile: 'No longer available',
      in_match: 'You are already in a training',
      dati_non_validi: 'Something is off: try again',
      non_trovato: 'Invite not found on this device',
      non_trovato_scheda: 'This person can no longer be reached',
      scaduto: 'The invite has expired',
      rifiutato: "{nome} can't right now",
      annullato: 'The invite was withdrawn',
      gia_accettato: 'The invite has already been accepted',
      non_ce_piu: 'The other person is no longer there',
      invito_sparito: 'The invite is gone: you can send another one',
      match_non_valido: 'The training could not start: try again',
      nessun_abbonamento: 'Notifications on this phone are no longer active: switch on again to receive invites',
      senza_abbonamento: 'Notifications on this phone are no longer active: switch on again to receive invites',
      permesso_negato: 'Without notification permission you cannot receive invites while the app is closed',
      push_non_supportata: 'Notifications cannot be received on this browser',
      push_saltata: 'They will not get a notification now: they will see it if they open the app before it expires',
      auth_fallita: 'Your session is no longer valid: log in again',
      errore: 'Connection failed: try again',
      interruttore: 'Receive invites even when you are not connected',
      nota_nome: 'Your name will be visible to everyone using the app.',
      disponibili: 'Available on invite',
      invita: 'Invite to a training',
      blocca: 'No more invites from this person',
      conferma_blocco: 'You will no longer receive invites from {nome}, and you will not be able to invite them. Confirm?',
      bloccato_ok: 'You will no longer receive invites from {nome}',
      conferma: "Confirm', annulla: 'Cancel', chiudi: 'Close', rifiuta: 'Decline",
      invito_a: 'Invite to {nome}: {tempo}',
      scade_fra: 'expires in {tempo}',
      scaduto_breve: 'expired',
      attesa_invitante: 'Waiting for {nome} to join… ({tempo})',
      non_arrivato: '{nome} did not arrive: back to the lobby',
      invito_durante_training: '{nome} invited you: you are already in a training',
      prove: "Trials', indovinate: 'Hits",
      qualcuno: 'Someone'
    },
    es: {
      invito_in_corso: 'Ya tienes una invitación en curso',
      gia_invitato: 'Ya le han invitado, inténtalo de nuevo en un momento',
      troppi_inviti: 'Has enviado demasiadas invitaciones, inténtalo más tarde',
      non_disponibile: 'Ya no está disponible',
      in_match: 'Ya estás en un entrenamiento',
      dati_non_validi: 'Algo no cuadra: inténtalo de nuevo',
      non_trovato: 'Invitación no encontrada en este dispositivo',
      non_trovato_scheda: 'Esta persona ya no está disponible',
      scaduto: 'La invitación ha vencido',
      rifiutato: '{nome} no puede ahora',
      annullato: 'La invitación fue retirada',
      gia_accettato: 'La invitación ya fue aceptada',
      non_ce_piu: 'La otra persona ya no está',
      invito_sparito: 'La invitación ya no existe: puedes enviar otra',
      match_non_valido: 'No se pudo iniciar el entrenamiento: inténtalo de nuevo',
      nessun_abbonamento: 'Las notificaciones de este teléfono ya no están activas: vuelve a activarlas para recibir invitaciones',
      senza_abbonamento: 'Las notificaciones de este teléfono ya no están activas: vuelve a activarlas para recibir invitaciones',
      permesso_negato: 'Sin el permiso de notificaciones no puedes recibir invitaciones cuando la app está cerrada',
      push_non_supportata: 'En este navegador no se pueden recibir notificaciones',
      push_saltata: 'Ahora no le llegará una notificación: la verá si abre la app antes de que venza',
      auth_fallita: 'Tu sesión ya no es válida: vuelve a ingresar',
      errore: 'No se pudo conectar: inténtalo de nuevo',
      interruttore: 'Recibir invitaciones incluso cuando no estás conectado/a',
      nota_nome: 'Tu nombre será visible para todas las personas que usan la app.',
      disponibili: 'Disponibles por invitación',
      invita: 'Invitar a un entrenamiento',
      blocca: 'No quiero más invitaciones de esta persona',
      conferma_blocco: 'Ya no recibirás invitaciones de {nome} y no podrás invitarle. ¿Confirmas?',
      bloccato_ok: 'Ya no recibirás invitaciones de {nome}',
      conferma: "Confirmar', annulla: 'Cancelar', chiudi: 'Cerrar', rifiuta: 'Rechazar",
      invito_a: 'Invitación a {nome}: {tempo}',
      scade_fra: 'vence en {tempo}',
      scaduto_breve: 'vencida',
      attesa_invitante: 'Esperando a que {nome} entre… ({tempo})',
      non_arrivato: '{nome} no ha llegado: vuelves al inicio',
      invito_durante_training: '{nome} te ha invitado: ya estás en un entrenamiento',
      prove: "Pruebas', indovinate: 'Aciertos",
      qualcuno: 'Alguien'
    },
    fr: {
      invito_in_corso: 'Tu as déjà une invitation en cours',
      gia_invitato: 'Cette personne a déjà été invitée, réessaie dans un instant',
      troppi_inviti: "Tu as envoyé trop d'invitations, réessaie plus tard",
      non_disponibile: "Ce n'est plus disponible",
      in_match: 'Tu es déjà dans un entraînement',
      dati_non_validi: "Quelque chose cloche : réessaie",
      non_trovato: 'Invitation introuvable sur cet appareil',
      non_trovato_scheda: "Cette personne n'est plus joignable",
      scaduto: "L'invitation a expiré",
      rifiutato: '{nome} ne peut pas pour le moment',
      annullato: "L'invitation a été retirée",
      gia_accettato: "L'invitation a déjà été acceptée",
      non_ce_piu: "L'autre personne n'est plus là",
      invito_sparito: "L'invitation n'existe plus : tu peux en envoyer une autre",
      match_non_valido: "Impossible de démarrer l'entraînement : réessaie",
      nessun_abbonamento: 'Les notifications de ce téléphone ne sont plus actives : réactive-les pour recevoir des invitations',
      senza_abbonamento: 'Les notifications de ce téléphone ne sont plus actives : réactive-les pour recevoir des invitations',
      permesso_negato: "Sans l'autorisation de notifications, tu ne peux pas recevoir d'invitations quand l'app est fermée",
      push_non_supportata: "Ce navigateur ne permet pas de recevoir des notifications",
      push_saltata: "Elle ne recevra pas de notification maintenant : elle la verra si elle ouvre l'app avant l'expiration",
      auth_fallita: "Ta session n'est plus valide : reconnecte-toi",
      errore: 'Connexion impossible : réessaie',
      interruttore: "Recevoir des invitations même quand tu n'es pas connecté(e)",
      nota_nome: "Ton nom sera visible par toutes les personnes qui utilisent l'app.",
      disponibili: 'Disponibles sur invitation',
      invita: 'Inviter à un entraînement',
      blocca: "Je ne veux plus d'invitations de cette personne",
      conferma_blocco: "Tu ne recevras plus d'invitations de {nome} et tu ne pourras plus l'inviter. Tu confirmes ?",
      bloccato_ok: "Tu ne recevras plus d'invitations de {nome}",
      conferma: "Confirmer', annulla: 'Annuler', chiudi: 'Fermer', rifiuta: 'Refuser",
      invito_a: 'Invitation à {nome} : {tempo}',
      scade_fra: 'expire dans {tempo}',
      scaduto_breve: 'expirée',
      attesa_invitante: 'En attente de {nome}… ({tempo})',
      non_arrivato: "{nome} n'est pas arrivé(e) : retour au salon",
      invito_durante_training: "{nome} t'a invité(e) : tu es déjà dans un entraînement",
      prove: "Essais', indovinate: 'Réussites",
      qualcuno: "Quelqu'un"
    }
  };

  function testo(chiave, lingua, valori) {
    var t = TESTI[lingua] ? TESTI[lingua] : TESTI.en;
    // Chiave mancante nella lingua: prima l'inglese, poi il messaggio d'errore della lingua.
    var s = Object.prototype.hasOwnProperty.call(t, chiave) ? t[chiave]
          : Object.prototype.hasOwnProperty.call(TESTI.en, chiave) ? TESTI.en[chiave] : t.errore;
    var v = valori || {};
    var nome = typeof v.nome === 'string' && v.nome.length > 0 ? v.nome : t.qualcuno;
    var tempo = typeof v.tempo === 'string' ? v.tempo : '';
    // Funzioni al posto delle stringhe: un nome con «$&» non deve essere interpretato da replace.
    return s.replace('{nome}', function () { return nome; })
            .replace('{tempo}', function () { return tempo; });
  }

  // Dall'errore di una RPC alla chiave del messaggio: «Auth failed» (registrato con credenziale
  // vecchia) merita un testo suo, non «Connessione non riuscita».
  function chiaveDaErrore(err) {
    var m = typeof err === 'string' ? err : (err && typeof err.message === 'string' ? err.message : '');
    return /Auth failed/i.test(m) ? 'auth_fallita' : 'errore';
  }

  function scarto(adessoServerIso, adessoLocaleMs) {
    var s = Date.parse(adessoServerIso);
    return isNaN(s) ? 0 : s - adessoLocaleMs;
  }

  function secondiRimasti(scadenzaIso, scartoMs, adessoLocaleMs) {
    var t = Date.parse(scadenzaIso);
    if (isNaN(t)) return 0;
    return Math.max(0, Math.ceil((t - (adessoLocaleMs + (scartoMs || 0))) / 1000));
  }

  function mmss(secondi) {
    var s = Math.max(0, Math.floor(secondi || 0));
    var r = s % 60;
    return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r;
  }

  function leggiInvitoDaUrl(search) {
    var p = new URLSearchParams(search || '');
    var id = p.get('invito');
    return {
      invito: id && UUID.test(id) ? id.toLowerCase() : null,
      azione: p.get('azione') === 'blocca' ? 'blocca' : null,
      presente: p.has('invito')
    };
  }

  // Stessa tabella di telepatia_motivo_stato nella 32a.
  function motivoDaStato(status) {
    if (status === 'accepted') return 'gia_accettato';
    if (status === 'declined') return 'rifiutato';
    if (status === 'cancelled') return 'annullato';
    return 'scaduto';
  }

  // Cosa fare arrivando da una notifica (o da ?invito=): la risposta è quella di
  // get_telepathy_invite. Mai una schermata vuota: ogni caso ha il suo messaggio. Anche l'invito
  // non trovato (identità persa, altro browser, invito di un altro) finisce in un messaggio.
  function esitoApertura(r, azione) {
    if (!r || r.ok !== true || !r.invito) return { tipo: 'messaggio', motivo: 'non_trovato' };
    var i = r.invito;
    if (i.ruolo === 'destinatario') {
      if (azione === 'blocca') return { tipo: 'conferma_blocco', nome: i.nome };
      if (i.status === 'pending') return { tipo: 'rispondi', nome: i.nome };
      return { tipo: 'messaggio', motivo: motivoDaStato(i.status), nome: i.nome };
    }
    if (i.status === 'pending') return { tipo: 'attesa', nome: i.nome };
    if (i.status === 'accepted') {
      return i.match_id && i.match_attivo ? { tipo: 'entra', matchId: i.match_id, nome: i.nome }
                                          : { tipo: 'messaggio', motivo: 'non_ce_piu', nome: i.nome };
    }
    return { tipo: 'messaggio', motivo: motivoDaStato(i.status), nome: i.nome };
  }

  function attesaFinita(respondedAtIso, scartoMs, adessoLocaleMs, limiteMs) {
    var t = Date.parse(respondedAtIso);
    if (isNaN(t)) return true;
    return (adessoLocaleMs + (scartoMs || 0)) - t >= (limiteMs || 180000);
  }

  function percentuale(prove, indovinate) {
    if (typeof prove !== 'number' || prove <= 0 || typeof indovinate !== 'number') return null;
    return Math.round((100 * indovinate) / prove) + '%';
  }

  var api = { testo: testo, chiaveDaErrore: chiaveDaErrore, scarto: scarto, secondiRimasti: secondiRimasti, mmss: mmss,
              leggiInvitoDaUrl: leggiInvitoDaUrl, esitoApertura: esitoApertura, motivoDaStato: motivoDaStato,
              attesaFinita: attesaFinita, percentuale: percentuale };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.InvitiHelpers = api;
})(typeof window !== 'undefined' ? window : this);
