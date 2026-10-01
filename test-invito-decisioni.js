/**
 * Test della logica pura di notify-telepathy-invite (spec 2026-09-25 §4.2 e §7).
 *
 * La funzione non si fida di chi la chiama: rilegge l'invito e manda una push solo se lo stato
 * la giustifica. Qui si prova proprio quella decisione, senza rete e senza database.
 *
 * Esecuzione: NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-decisioni.js
 */
const PERCORSO = './supabase/functions/notify-telepathy-invite/decisioni.mjs';

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const atteso = (n, a, b) => (a === b ? ok(n) : ko(n, `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`));

(async () => {
  const { leggiRichiesta, decidiPush, eraDaDieciMinuti, prenotazioneSaltata } = await import(PERCORSO);
  const ID = '3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c';
  const adesso = Date.now();
  const iso = (ms) => new Date(adesso + ms).toISOString();
  const invito = (x) => ({ id: ID, from_id: 'a', from_name: 'Aurora', to_id: 'b', to_name: 'Bruno', status: 'pending',
    created_at: iso(-60000), expires_at: iso(540000), match_id: null, con_push: true, ...x });

  // --- la richiesta ---------------------------------------------------------
  atteso('corpo vuoto: ignorato', leggiRichiesta(null), null);
  atteso('scadenze', JSON.stringify(leggiRichiesta({ tipo: 'scadenze' })), '{"tipo":"scadenze"}');
  atteso('invito con uuid (maiuscole accettate, restituito minuscolo)',
    JSON.stringify(leggiRichiesta({ tipo: 'invito', invito: ID.toUpperCase() })), JSON.stringify({ tipo: 'invito', invito: ID }));
  atteso('uuid storto: ignorato', leggiRichiesta({ tipo: 'invito', invito: "x'; drop" }), null);
  // «scaduto» lo decide solo il giro delle scadenze: chiamarlo da fuori non deve bastare.
  atteso('«scaduto» da fuori: ignorato', leggiRichiesta({ tipo: 'scaduto', invito: ID }), null);

  // --- durata ---------------------------------------------------------------
  atteso('10 minuti', eraDaDieciMinuti({ created_at: iso(0), expires_at: iso(600000) }), true);
  atteso('45 secondi', eraDaDieciMinuti({ created_at: iso(0), expires_at: iso(45000) }), false);

  // --- invito ---------------------------------------------------------------
  // Quarto parametro: il destinatario ha una riga di disponibilità (spec §7).
  let d = decidiPush('invito', invito(), adesso, true);
  atteso('invito pending con push: al destinatario', d && d.a, 'destinatario');
  atteso('invito: il nome è di chi invita', d && d.nome, 'Aurora');
  atteso('invito: TTL = secondi alla scadenza', d && d.ttl, 540);
  atteso('invito: urgenza alta', d && d.urgency, 'high');
  atteso('invito senza con_push: niente', decidiPush('invito', invito({ con_push: false }), adesso, true), null);
  atteso('invito scaduto: niente', decidiPush('invito', invito({ expires_at: iso(-1000) }), adesso, true), null);
  atteso('invito non più pending: niente', decidiPush('invito', invito({ status: 'cancelled' }), adesso, true), null);
  d = decidiPush('invito', invito({ expires_at: iso(500) }), adesso, true);
  atteso('a mezzo secondo dalla scadenza: TTL minimo 1', d && d.ttl, 1);

  // --- disponibilità del destinatario (spec §7) -----------------------------
  atteso('invito senza riga di disponibilità: niente', decidiPush('invito', invito(), adesso, false), null);
  atteso('invito con disponibilità non indicata: niente (nel dubbio non si disturba)', decidiPush('invito', invito(), adesso), null);
  // Le push al mittente non dipendono dalla disponibilità di chi ha risposto.
  atteso('accettato senza disponibilità: la push al mittente parte',
    decidiPush('accettato', invito({ status: 'accepted', match_id: ID }), adesso, false) && 'parte', 'parte');
  atteso('rifiutato senza disponibilità: la push al mittente parte',
    decidiPush('rifiutato', invito({ status: 'declined' }), adesso, false) && 'parte', 'parte');
  atteso('scaduto senza disponibilità: la push al mittente parte',
    decidiPush('scaduto', invito({ status: 'expired', created_at: iso(-700000), expires_at: iso(-100000) }), adesso, false) && 'parte', 'parte');

  // --- accettato ------------------------------------------------------------
  d = decidiPush('accettato', invito({ status: 'accepted', match_id: ID }), adesso);
  atteso('accettato con match_id: al mittente, TTL 180, alta', d && `${d.a}/${d.ttl}/${d.urgency}/${d.nome}`, 'mittente/180/high/Bruno');
  atteso('accettato senza match_id (app vecchia): niente', decidiPush('accettato', invito({ status: 'accepted' }), adesso), null);

  // --- rifiutato ------------------------------------------------------------
  d = decidiPush('rifiutato', invito({ status: 'declined' }), adesso);
  atteso('rifiutato da 10 minuti: al mittente, TTL 3600, normale', d && `${d.a}/${d.ttl}/${d.urgency}`, 'mittente/3600/normal');
  atteso('rifiutato da 45 s: niente', decidiPush('rifiutato', invito({ status: 'declined', created_at: iso(-10000), expires_at: iso(35000) }), adesso), null);

  // --- scaduto --------------------------------------------------------------
  d = decidiPush('scaduto', invito({ status: 'expired', created_at: iso(-700000), expires_at: iso(-100000) }), adesso);
  atteso('scaduto da 10 minuti: al mittente', d && `${d.a}/${d.kind}/${d.ttl}`, 'mittente/scaduto/3600');
  atteso('scaduto da 45 s: niente', decidiPush('scaduto', invito({ status: 'expired', created_at: iso(-100000), expires_at: iso(-55000) }), adesso), null);
  atteso('nessun invito: niente', decidiPush('invito', null, adesso, true), null);

  // --- prenotazione rifiutata dal database ----------------------------------
  // 23505: già prenotata (doppione). 23503: l'invito o l'abbonamento sono spariti nel frattempo
  // (account cancellato, app vecchie che cancellano, abbonamento morto tolto da notify-ritual-start).
  // In entrambi i casi non c'è niente da fare: saltata, non guasto (niente 500, niente email).
  atteso('prenotazione 23505: saltata', prenotazioneSaltata('23505'), true);
  atteso('prenotazione 23503 (riga sparita): saltata', prenotazioneSaltata('23503'), true);
  atteso('prenotazione con altro codice: guasto', prenotazioneSaltata('42501'), false);
  atteso('prenotazione senza codice: guasto', prenotazioneSaltata(undefined), false);

  console.log(`\n${passati} passati, ${falliti} falliti`);
  process.exit(falliti === 0 ? 0 : 1);
})();
