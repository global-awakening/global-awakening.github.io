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
      conferma: 'Conferma', annulla: 'Annulla', chiudi: 'Chiudi', rifiuta: 'Rifiuta',
      invito_a: 'Invito a {nome}: {tempo}',
      scade_fra: 'scade fra {tempo}',
      scaduto_breve: 'scaduto',
      attesa_invitante: 'In attesa che {nome} entri… ({tempo})',
      non_arrivato: '{nome} non è arrivato: torni alla lobby',
      invito_durante_training: '{nome} ti ha invitato: sei già in un training',
      prove: 'Prove', indovinate: 'Indovinate',
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
      conferma: 'Confirm', annulla: 'Cancel', chiudi: 'Close', rifiuta: 'Decline',
      invito_a: 'Invite to {nome}: {tempo}',
      scade_fra: 'expires in {tempo}',
      scaduto_breve: 'expired',
      attesa_invitante: 'Waiting for {nome} to join… ({tempo})',
      non_arrivato: '{nome} did not arrive: back to the lobby',
      invito_durante_training: '{nome} invited you: you are already in a training',
      prove: 'Trials', indovinate: 'Hits',
      qualcuno: 'Someone'
    }
  };

  function testo(chiave, lingua, valori) {
    var t = TESTI[lingua] ? TESTI[lingua] : TESTI.en;
    var s = Object.prototype.hasOwnProperty.call(t, chiave) ? t[chiave] : t.errore;
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

  // Solo fra la 32a e la 32b: un'app vecchia accetta senza match_id, creando il match con
  // user1_id = chi ha invitato. Si entra nel match attivo in cui sono user1, nato dopo l'invito.
  function matchDiRipiego(matches, mioSid, invitoCreatoIl) {
    var t0 = Date.parse(invitoCreatoIl);
    if (isNaN(t0) || !matches || !matches.length) return null;
    var buoni = matches.filter(function (m) {
      return m && m.user1_id === mioSid && !m.ended_at && Date.parse(m.created_at) >= t0;
    });
    buoni.sort(function (a, b) { return Date.parse(a.created_at) - Date.parse(b.created_at); });
    return buoni[0] || null;
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
              matchDiRipiego: matchDiRipiego, attesaFinita: attesaFinita, percentuale: percentuale };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.InvitiHelpers = api;
})(typeof window !== 'undefined' ? window : this);
