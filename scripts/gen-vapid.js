#!/usr/bin/env node
/**
 * gen-vapid.js — genera la coppia di chiavi VAPID che firma le notifiche push.
 *
 * VAPID è il meccanismo con cui il servizio push del browser verifica che chi manda una
 * notifica sia davvero il nostro server e non un estraneo che ha rubato un endpoint.
 *
 * Le due chiavi hanno destini opposti:
 *   - la PUBBLICA va in app.html. È pubblica per definizione: il browser la riceve comunque
 *     al momento dell'iscrizione, quindi nasconderla non proteggerebbe niente.
 *   - la PRIVATA va SOLO nei segreti della Edge Function. Chi ce l'ha può mandare notifiche
 *     a nome di Global Awakening a chiunque sia iscritto.
 *
 * Perciò questo script NON stampa la privata a schermo (finirebbe nella cronologia del
 * terminale e nelle trascrizioni): la scrive in .env.local, che è già escluso da git.
 *
 * Uso: node scripts/gen-vapid.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENV = path.join(__dirname, '..', '.env.local');

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function main() {
  const testo = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  if (/^VAPID_PRIVATE_KEY=/m.test(testo)) {
    console.error('⛔  .env.local contiene già VAPID_PRIVATE_KEY.');
    console.error('    Rigenerare le chiavi invaliderebbe TUTTI gli abbonamenti push esistenti:');
    console.error('    ogni telefono già iscritto smetterebbe di ricevere notifiche, in silenzio.');
    console.error('    Se è davvero quello che vuoi, togli la riga a mano e rilancia.');
    process.exit(1);
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  // Formato atteso dalle API push: il punto non compresso della curva (65 byte) per la
  // pubblica, lo scalare grezzo (32 byte) per la privata. Si estraggono dalle codifiche DER.
  const pub = b64url(publicKey.export({ type: 'spki', format: 'der' }).subarray(-65));
  const priv = b64url(privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(36, 68));

  const righe = [
    '',
    '# Chiavi VAPID delle notifiche push (generate da scripts/gen-vapid.js).',
    '# La privata non deve uscire da questo file: chi ce l\'ha può mandare notifiche',
    '# a nome di Global Awakening a chiunque sia iscritto.',
    `VAPID_PUBLIC_KEY=${pub}`,
    `VAPID_PRIVATE_KEY=${priv}`,
    ''
  ].join('\n');

  fs.appendFileSync(ENV, righe, 'utf8');

  console.log('✅ Chiavi VAPID generate e salvate in .env.local (escluso da git).');
  console.log('');
  console.log('Chiave PUBBLICA, da incollare in app.html:');
  console.log('  ' + pub);
  console.log('');
  console.log('La PRIVATA non viene stampata. Per caricare i segreti della Edge Function:');
  console.log('  supabase secrets set \\');
  console.log('    VAPID_PUBLIC_KEY="$(grep ^VAPID_PUBLIC_KEY= .env.local | cut -d= -f2)" \\');
  console.log('    VAPID_PRIVATE_KEY="$(grep ^VAPID_PRIVATE_KEY= .env.local | cut -d= -f2)" \\');
  console.log('    VAPID_SUBJECT="mailto:global.awakening.app@gmail.com"');
}

main();
