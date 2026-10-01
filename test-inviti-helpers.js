/**
 * La logica pura degli inviti dentro l'app (inviti-helpers.js).
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-helpers.js
 */
const H = require('./inviti-helpers.js');
let passati = 0, falliti = 0;
const uguale = (n, a, b) => { if (a === b) { console.log('✅ ' + n); passati++; } else { console.error(`❌ ${n} — atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`); falliti++; } };
const ID = '3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c';
const adessoTel = Date.now();
const serverIndietro = adessoTel - 5 * 60000;                 // telefono avanti di 5 minuti
const iso = (ms) => new Date(ms).toISOString();

// Orologio (Review Focus 1)
const s = H.scarto(iso(serverIndietro), adessoTel);
uguale('scarto: telefono avanti di 5 minuti', Math.round(s / 1000), -300);
uguale('conto alla rovescia giusto anche col telefono avanti', H.secondiRimasti(iso(serverIndietro + 45000), s, adessoTel), 45);
uguale('dopo la scadenza: 0, mai negativo', H.secondiRimasti(iso(serverIndietro - 1000), s, adessoTel), 0);
uguale('mmss', `${H.mmss(600)}|${H.mmss(45)}|${H.mmss(0)}`, '10:00|0:45|0:00');

// ?invito=
let u = H.leggiInvitoDaUrl(`?invito=${ID.toUpperCase()}&azione=blocca`);
uguale('?invito= con azione=blocca', `${u.invito}|${u.azione}|${u.presente}`, `${ID}|blocca|true`);
u = H.leggiInvitoDaUrl(`?invito=${ID}&azione=cancella-tutto`);
uguale('azione sconosciuta: ignorata', u.azione, null);
u = H.leggiInvitoDaUrl('?invito=<script>');
uguale('id storto: niente invito, ma il parametro va tolto dall\'indirizzo', `${u.invito}|${u.presente}`, 'null|true');
uguale('nessun parametro', H.leggiInvitoDaUrl('').presente, false);

// Aprire un invito (Review Focus 4 per il primo caso)
const risp = (x) => ({ ok: true, adesso: iso(adessoTel), invito: { id: ID, nome: 'Aurora', match_id: null, match_attivo: false, ...x } });
uguale('invito non mio o identità persa: non trovato', H.esitoApertura({ ok: false, motivo: 'non_trovato' }, null).motivo, 'non_trovato');
uguale('invito non mio: tipo messaggio', H.esitoApertura({ ok: false, motivo: 'non_trovato' }, 'blocca').tipo, 'messaggio');
uguale('risposta vuota o storta: non trovato, senza eccezioni', `${H.esitoApertura(null, null).motivo}|${H.esitoApertura(undefined, 'blocca').motivo}|${H.esitoApertura({ ok: true }, null).motivo}`, 'non_trovato|non_trovato|non_trovato');
uguale('destinatario, aperto: rispondi', H.esitoApertura(risp({ ruolo: 'destinatario', status: 'pending' }), null).tipo, 'rispondi');
uguale('destinatario con azione=blocca: conferma, anche se scaduto', H.esitoApertura(risp({ ruolo: 'destinatario', status: 'expired' }), 'blocca').tipo, 'conferma_blocco');
uguale('destinatario, scaduto', H.esitoApertura(risp({ ruolo: 'destinatario', status: 'expired' }), null).motivo, 'scaduto');
uguale('destinatario, già accettato (altro telefono)', H.esitoApertura(risp({ ruolo: 'destinatario', status: 'accepted' }), null).motivo, 'gia_accettato');
uguale('mittente, ancora aperto: attesa', H.esitoApertura(risp({ ruolo: 'mittente', status: 'pending' }), null).tipo, 'attesa');
const entra = H.esitoApertura(risp({ ruolo: 'mittente', status: 'accepted', match_id: ID, match_attivo: true }), null);
uguale('mittente, accettato con match vivo: entra', `${entra.tipo}|${entra.matchId}`, `entra|${ID}`);
uguale('mittente, accettato ma match sparito', H.esitoApertura(risp({ ruolo: 'mittente', status: 'accepted', match_id: ID }), null).motivo, 'non_ce_piu');
uguale('mittente, rifiutato', H.esitoApertura(risp({ ruolo: 'mittente', status: 'declined' }), null).motivo, 'rifiutato');
uguale('mittente, annullato', H.esitoApertura(risp({ ruolo: 'mittente', status: 'cancelled' }), null).motivo, 'annullato');
uguale('mittente, scaduto', H.esitoApertura(risp({ ruolo: 'mittente', status: 'expired' }), null).motivo, 'scaduto');
const rif = H.esitoApertura(risp({ ruolo: 'mittente', status: 'declined' }), null);
uguale('il nome del messaggio arriva fino al testo', H.testo(rif.motivo, 'it', { nome: rif.nome }), 'Aurora non può ora');

// motivoDaStato come il server (telepatia_motivo_stato)
uguale('motivoDaStato', ['accepted', 'declined', 'cancelled', 'expired', 'pending', 'boh'].map(H.motivoDaStato).join(','), 'gia_accettato,rifiutato,annullato,scaduto,scaduto,scaduto');

// Ripiego della tenuta (accettato da un'app vecchia, senza match_id)
const creato = iso(adessoTel - 30000);
const matches = [
  { id: 'vecchio', user1_id: 'io', user2_id: 'x', created_at: iso(adessoTel - 60000) },
  { id: 'finito', user1_id: 'io', user2_id: 'y', created_at: iso(adessoTel - 10000), ended_at: iso(adessoTel) },
  { id: 'altrui', user1_id: 'z', user2_id: 'io', created_at: iso(adessoTel - 5000) },
  { id: 'giusto', user1_id: 'io', user2_id: 'w', created_at: iso(adessoTel - 20000) },
];
uguale('ripiego: il match attivo in cui sono user1, creato dopo l\'invito', (H.matchDiRipiego(matches, 'io', creato) || {}).id, 'giusto');
uguale('ripiego: niente se non c\'è', H.matchDiRipiego(matches.slice(0, 3), 'io', creato), null);
uguale('ripiego: lista vuota o nulla', `${H.matchDiRipiego([], 'io', creato)}|${H.matchDiRipiego(null, 'io', creato)}`, 'null|null');

// Attesa di chi ha accettato: 3 minuti dall'ora del server
uguale('attesa: 179 s (telefono avanti di 5 minuti) non è finita', H.attesaFinita(iso(serverIndietro - 179000), s, adessoTel), false);
uguale('attesa: 181 s è finita', H.attesaFinita(iso(serverIndietro - 181000), s, adessoTel), true);
uguale('attesa: senza scarto il telefono avanti la darebbe finita (prova che lo scarto conta)', H.attesaFinita(iso(serverIndietro - 10000), 0, adessoTel), true);
uguale('attesa: con lo scarto, 10 s dopo la risposta non è finita', H.attesaFinita(iso(serverIndietro - 10000), s, adessoTel), false);

// Testi
uguale('messaggio con il nome', H.testo('rifiutato', 'it', { nome: 'Bruno' }), 'Bruno non può ora');
uguale('chiave sconosciuta: il messaggio d\'errore', H.testo('boh', 'it'), H.testo('errore', 'it'));
uguale('chiave di Object.prototype: il messaggio d\'errore', H.testo('constructor', 'it'), H.testo('errore', 'it'));
uguale('la frase accanto all\'interruttore', H.testo('nota_nome', 'it'), 'Il tuo nome sarà visibile a tutti quelli che usano l\'app.');
uguale('inglese', H.testo('interruttore', 'en'), 'Receive invites even when you are not connected');
uguale('senza nome: «Qualcuno»', H.testo('rifiutato', 'it'), 'Qualcuno non può ora');

// Ogni motivo che il server può restituire (32a) ha un messaggio proprio, in italiano e in inglese
const MOTIVI = ['invito_in_corso', 'gia_invitato', 'troppi_inviti', 'non_disponibile', 'in_match', 'dati_non_validi',
  'non_trovato', 'scaduto', 'rifiutato', 'annullato', 'gia_accettato', 'non_ce_piu', 'match_non_valido',
  'nessun_abbonamento', 'senza_abbonamento', 'permesso_negato', 'push_saltata'];
for (const l of ['it', 'en']) {
  const senza = MOTIVI.filter((m) => H.testo(m, l, { nome: 'X' }) === H.testo('errore', l));
  uguale(`ogni motivo del server ha il suo messaggio (${l})`, senza.join(','), '');
}
uguale('non_trovato dalla scheda/Online è un messaggio neutro, diverso da quello della notifica',
  H.testo('non_trovato_scheda', 'it') !== H.testo('non_trovato', 'it') && H.testo('non_trovato_scheda', 'it') !== H.testo('errore', 'it'), true);
uguale('non_trovato dalla scheda: neutro anche in inglese', H.testo('non_trovato_scheda', 'en') !== H.testo('errore', 'en') && !/device/i.test(H.testo('non_trovato_scheda', 'en')), true);

// «Auth failed» (m6): messaggio proprio, non «Connessione non riuscita»
uguale('Auth failed ha il suo messaggio (it)', H.testo('auth_fallita', 'it') !== H.testo('errore', 'it') && /accedi/i.test(H.testo('auth_fallita', 'it')), true);
uguale('Auth failed ha il suo messaggio (en)', H.testo('auth_fallita', 'en') !== H.testo('errore', 'en') && /log in/i.test(H.testo('auth_fallita', 'en')), true);
uguale('chiaveDaErrore: Auth failed', `${H.chiaveDaErrore({ message: 'Auth failed' })}|${H.chiaveDaErrore(new Error('P0001: Auth failed'))}`, 'auth_fallita|auth_fallita');
uguale('chiaveDaErrore: altro, vuoto, stringa', `${H.chiaveDaErrore({ message: 'boom' })}|${H.chiaveDaErrore(null)}|${H.chiaveDaErrore('Auth failed')}`, 'errore|errore|auth_fallita');

// Percentuale della scheda
uguale('percentuale', H.percentuale(40, 12), '30%');
uguale('percentuale senza prove: niente', `${H.percentuale(0, 0)}|${H.percentuale(null, null)}`, 'null|null');

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
