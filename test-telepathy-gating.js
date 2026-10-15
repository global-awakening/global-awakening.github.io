/**
 * Test gating griglia Receiver (bug 4 / Task A4) — Global Awakening
 *
 * Il receiver NON deve poter cliccare/confermare i simboli finché il sender non ha
 * inviato il simbolo DEL ROUND CORRENTE. Il gating di render (disabled={!senderHasSent})
 * era già presente; il difetto era la finestra a INIZIO round in cui senderHasSent
 * tornava/rimaneva `true` leggendo il simbolo del round PRECEDENTE non ancora pulito
 * dal sender (race cross-client, i due clock non sono sincronizzati).
 *
 * Fix a due livelli:
 *  1) reset locale immediato di senderHasSent all'auto-avanzamento e in acceptInvite;
 *  2) robusto e indipendente dal timing: checkSenderSent considera il simbolo "inviato"
 *     solo se round_count sul DB combacia con il round locale (i round vecchi non sbloccano).
 *
 * Test source-analysis su src/app.jsx (la logica è un reset/guard di stato in effetti,
 * non funzioni pure importabili dal monolite) — stesso stile di test-telepathy-livelli-scala.js.
 *
 * Esecuzione: node test-telepathy-gating.js
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'src', 'app.jsx'), 'utf8');

let passed = 0, failed = 0;
const ok = (cond, m) => {
  if (cond) { console.log('  ✅ ' + m); passed++; }
  else { console.log('  ❌ ' + m); failed++; process.exitCode = 1; }
};

// Estrae il corpo tra un marcatore di inizio e uno di fine. Ritorna null se un marcatore
// manca (così l'assenza di un blocco fallisce esplicitamente, senza falsi-pass leggendo
// resto-del-file — fragilità rilevata in review).
const block = (startMarker, endMarker) => {
  const i = src.indexOf(startMarker);
  if (i < 0) return null;
  const j = src.indexOf(endMarker, i + startMarker.length);
  if (j < 0) return null;
  return src.slice(i, j);
};

console.log('— Gating di render (già presente) —');
ok(/disabled=\{!senderHasSent\}/.test(src),
  'griglia receiver: i bottoni simbolo sono disabled quando !senderHasSent');
ok(/disabled=\{!guessedSymbol \|\| !senderHasSent(?: \|\| [^}]+)?\}/.test(src),
  'bottone Conferma: disabled finché non c\'è guess E il sender non ha inviato');
ok(/\$\{!senderHasSent \? 'symbols-locked' : ''\}/.test(src),
  'griglia receiver: classe symbols-locked quando !senderHasSent (feedback visivo)');

console.log('\n— Fix robusto: checkSenderSent è round-aware (indipendente dal timing) —');
const check = block('const checkSenderSent = async', 'const interval = setInterval(checkSenderSent');
ok(check !== null, 'trovato il blocco checkSenderSent');
ok(check !== null && /rpcPartita\('partita_stato'/.test(check),
  'checkSenderSent legge lo stato dal server (partita_stato)');
ok(check !== null && /simbolo_inviato/.test(check) && /dbRound === roundCount/.test(check),
  'checkSenderSent usa simbolo_inviato (il simbolo è nascosto) e confronta il round');
// La dep roundCount deve essere nell\'array dell\'effetto, altrimenti la closure userebbe un round stantio.
ok(/waitingForPartner, showResult, roundCount\]/.test(src),
  'l\'effetto checkSenderSent ha roundCount tra le dipendenze (closure fresca)');

console.log('\n— Reset locale immediato a inizio round / avvio sessione —');
const advance = block('const advance = setTimeout(', '}, 4500)');
ok(advance !== null, 'trovato il blocco di auto-avanzamento del round');
ok(advance !== null && advance.includes('setSenderHasSent(false)'),
  'auto-avanzamento round resetta senderHasSent=false (blocco immediato del nuovo round)');
const acceptInvite = block('const acceptInvite = async', 'const declineInvite');
ok(acceptInvite !== null, 'trovato il blocco acceptInvite');
ok(acceptInvite !== null && acceptInvite.includes('setSenderHasSent(false)'),
  'acceptInvite resetta senderHasSent=false all\'avvio di una nuova sessione');

console.log('\n— Motore chiuso (39a): niente accessi diretti a partite e chat —');
ok(!/from\('telepathy_matches'\)/.test(src), 'nessun from(\'telepathy_matches\') in app.jsx');
ok(!/from\('telepathy_chat'\)/.test(src), 'nessun from(\'telepathy_chat\') in app.jsx');
ok(!/rest\/v1\/telepathy_(matches|chat)/.test(src), 'nessuna fetch REST diretta alle due tabelle');
ok(!/end_telepathy_match/.test(src), 'end_telepathy_match non si chiama più (c\'è partita_esci)');
const poll = block('const pollResult = async', 'pollResult();');
ok(poll !== null && /if \(error\) return;/.test(poll), 'pollResult: un errore di rete non chiude la partita');

console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
