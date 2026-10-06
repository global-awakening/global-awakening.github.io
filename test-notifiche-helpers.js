const N = require('./notifiche-helpers.js');
let passed = 0, failed = 0;
const uguale = (m, a, b) => { if (a === b) { passed++; console.log('  ✅ ' + m); } else { failed++; console.log('  ❌ ' + m, JSON.stringify(a), '≠', JSON.stringify(b)); } };
const T = (type, message, lang) => N.testoNotifica({ type, message }, lang);

// Le sei forme (spec §3.4), in francese.
uguale('ritual_join fr', T('ritual_join', 'Ale si è unito/a al tuo rituale "Luna piena"', 'fr'), 'Ale a rejoint ton rituel « Luna piena »');
uguale('ritual_comment es', T('ritual_comment', 'Ale ha commentato il tuo rituale "Luna piena"', 'es'), 'Ale ha comentado tu ritual «Luna piena»');
uguale('comment en', T('comment', 'Ale ha commentato il tuo post', 'en'), 'Ale commented on your post');
uguale('private_message es', T('private_message', 'Ale ti ha inviato un messaggio privato', 'es'), 'Ale te ha enviado un mensaje privado');
uguale('telepathy_invite fr', T('telepathy_invite', 'Ale ti ha invitato a un training telepatico', 'fr'), 'Ale t’a invité·e à un entraînement télépathique');
uguale('telepathy_declined en', T('telepathy_declined', 'Ale ha rifiutato il tuo invito al training telepatico', 'en'), 'Ale declined your telepathy training invite');
// italiano: invariato
uguale('it resta com\'è', T('comment', 'Ale ha commentato il tuo post', 'it'), 'Ale ha commentato il tuo post');
// nomi difficili
uguale('nickname con spazi', T('comment', 'Luce del Mattino ha commentato il tuo post', 'en'), 'Luce del Mattino commented on your post');
uguale('rituale con virgolette', T('ritual_join', 'Ale si è unito/a al tuo rituale "Il "cerchio" di luce"', 'en'), 'Ale joined your ritual "Il "cerchio" di luce"');
uguale('nickname che contiene la coda di un altro tipo', T('private_message', 'Bob ha commentato il tuo post ti ha inviato un messaggio privato', 'en'), 'Bob ha commentato il tuo post sent you a private message');
// ripieghi
uguale('tipo sconosciuto → grezzo', T('altro', 'Ciao', 'en'), 'Ciao');
uguale('frase che non corrisponde → grezza', T('comment', 'Messaggio diverso', 'en'), 'Messaggio diverso');
uguale('nome vuoto → grezza', T('comment', ' ha commentato il tuo post', 'en'), ' ha commentato il tuo post');
uguale('message assente', T('comment', undefined, 'en'), '');
uguale('lingua sconosciuta → en', T('comment', 'Ale ha commentato il tuo post', 'de'), 'Ale commented on your post');
uguale('n nullo non solleva', N.testoNotifica(null, 'en'), '');

console.log(`\n${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
