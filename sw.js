// Service worker PWA Global Awakening.
// Strategia: network-first per navigazione/app.html/app.js (aggiornamenti sempre freschi,
// cache solo come fallback offline), cache-first per CDN immutabili e icone, no-cache per Supabase/EmailJS.
// push-helpers.js contiene le funzioni pure che costruiscono titolo e testo delle notifiche.
// Sta fuori da qui perche' dentro un service worker non si testa niente, e quella e' la parte
// che decide cosa legge la persona sul telefono.
// ?v=13: importScripts passa dalla cache HTTP del browser (fino a max-age=600), non dal gestore
// fetch. Con un indirizzo nuovo i telefoni prendono i testi nuovi insieme al service worker nuovo.
importScripts('push-helpers.js?v=13');

// v7: il bump non e' cosmetico. Senza, i browser che hanno gia' installato l'app tengono il
// service worker vecchio, che non ha nessun handler push — e le notifiche non arrivano
// a nessuno di quelli che l'app ce l'hanno gia'.
// v8: aggiunge music-helpers.js. Senza il bump, chi ha gia' l'app installata tiene il service
// worker vecchio, che quel file non lo conosce: offline la pagina si caricherebbe senza
// MusicHelpers e la musica non partirebbe piu' per niente.
// v9: il manifest passa a network-first. Era in cache-first: la nuova icona d'avvio (23/09/2026)
// non arrivava al telefono nemmeno reinstallando l'app, perche' la cache e' di Chrome e
// sopravvive. Il bump serve a far ripartire i service worker gia' installati con la regola nuova.
// v10: via EmailJS dal precache (28/09/2026): token ed email ora li fa il server.
// v11: rituali che si ripetono e stanza del rituale (29/09/2026). L'app legge dalla vista nuova
// e apre la stanza da ?ritual=: senza il bump le app installate resterebbero sul codice di prima.
// v12: inviti a un training anche a chi non è collegato (2026-10). Testi e gestori nuovi delle
// push d'invito: senza il bump le app installate terrebbero quelli vecchi.
// v13: quattro lingue; push-helpers con ES/FR.
const CACHE = 'ga-pwa-v13';
const PRECACHE = [
  'app.html', 'app.js', 'push-helpers.js?v=13', 'music-helpers.js', 'inviti-helpers.js', 'lingue-helpers.js', 'notifiche-helpers.js', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/icon-any-192.png', 'icons/icon-any-512.png',
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // add singolo + allSettled: se un CDN non risponde non fa fallire tutto il precache.
    // cache:'reload' bypassa la cache HTTP del browser → icone/app sempre fresche al bump versione.
    await Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase / EmailJS: sempre rete, mai cache (dati freschi; offline -> errore gestito dall'app)
  if (/supabase\.co$/.test(url.hostname) || /emailjs\.com$/.test(url.hostname)) return;

  // Audio: file grandi (il brano dei rituali pesa 18 MB). Fuori dalla cache offline, altrimenti
  // se li porta sul telefono chiunque installi l'app. Vanno sempre in rete, con la cache HTTP
  // del browser a fare da cuscino sui riascolti.
  if (/\.(mp3|ogg|m4a|wav)$/i.test(url.pathname)) return;

  // Navigazione, app.html e il codice dell'app: network-first, fallback cache.
  // app.js DEVE essere preso fresco, altrimenti le PWA installate restano sulla versione vecchia.
  // music-helpers.js e' codice dell'app quanto app.js: se stesse fra i file cache-first, una
  // correzione all'avvio della musica non arriverebbe mai a chi ha gia' l'app installata.
  // Lo stesso vale per il manifest: e' da li' che Android legge icone, nome e colori dell'app.
  const isFresh = req.mode === 'navigate' || url.pathname.endsWith('/app.html') || url.pathname.endsWith('/app.js') || url.pathname.endsWith('/music-helpers.js') || url.pathname.endsWith('/inviti-helpers.js') || url.pathname.endsWith('/lingue-helpers.js') || url.pathname.endsWith('/notifiche-helpers.js') || url.pathname.endsWith('/manifest.webmanifest') || url.pathname.endsWith('/');
  if (isFresh) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = (await caches.match(req)) || (await caches.match('app.html'));
        if (cached) return cached;
        throw _;
      }
    })());
    return;
  }

  // Resto (CDN immutabili, icone, manifest): cache-first
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const fresh = await fetch(req);
    try { const c = await caches.open(CACHE); c.put(req, fresh.clone()); } catch (_) {}
    return fresh;
  })());
});

// ---------------------------------------------------------------------------
// Notifiche push di avvio rituale
// ---------------------------------------------------------------------------

// Tipi d'invito: scritti anche qui, perché il ripiego deve riconoscerli pure senza PushHelpers.
const TIPI_INVITO = ['invito', 'accettato', 'rifiutato', 'scaduto'];

// Il payload arriva cifrato dalla Edge Function; il browser lo decifra e ce lo consegna qui.
// `userVisibleOnly: true`, dichiarato al momento dell'iscrizione, ci obbliga a mostrare SEMPRE
// una notifica: se questo handler non ne mostrasse nessuna, il browser ne mostrerebbe una
// generica di sistema al posto nostro e, a forza di quelle, ci toglierebbe il permesso.
// Per questo costruisciNotifica ha un ripiego per ogni campo e non solleva mai.
// Unica eccezione voluta: un invito con l'app in primo piano su Chromium (vedi sotto).
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let payload = {};
    try { payload = e.data ? e.data.json() : {}; } catch (_) { payload = {}; }
    const eInvito = !!payload && TIPI_INVITO.includes(payload.tipo);

    // Invito con l'app in primo piano: niente notifica, la finestra aggiorna subito banner o
    // attesa. Solo dove il browser lo tollera (Chromium fuori da iOS, PushHelpers.puoTacere):
    // Safari conta le push senza notifica e può togliere il permesso, e lì la notifica si
    // mostra sempre (lo stesso tag evita i doppioni). I rituali non passano di qui.
    if (eInvito) {
      try {
        if (self.PushHelpers && self.PushHelpers.puoTacere(self.navigator && self.navigator.userAgent)) {
          const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          const visibile = finestre.find((f) => f.visibilityState === 'visible' && f.url.includes('app.html'));
          if (visibile) {
            visibile.postMessage({ tipo: payload.tipo, invito: payload.invito });
            return;
          }
        }
      } catch (_) { /* nel dubbio la notifica si mostra */ }
    }

    // Ripiego assoluto. costruisciNotifica non solleva su payload storti, ma self.PushHelpers
    // puo' essere undefined se importScripts non e' andato a buon fine. Per un invito il ripiego
    // e' neutro: un testo di rituale sarebbe falso.
    let n;
    try {
      n = self.PushHelpers.costruisciNotifica(payload);
    } catch (_) {
      // La tabella sta qui e non in push-helpers.js perche' questo ramo scatta proprio quando
      // push-helpers.js non si e' caricato: non si puo' chiedere i testi a lui.
      const RIPIEGO = {
        it: ["Apri l'app", 'Un rituale sta iniziando.'],
        en: ['Open the app', 'A ritual is starting.'],
        es: ['Abre la app', 'Un ritual está empezando.'],
        fr: ["Ouvre l'app", 'Un rituel commence.']
      };
      const r = RIPIEGO[payload && payload.locale] || RIPIEGO.en;
      n = eInvito
        ? { titolo: 'Global Awakening', corpo: r[0], tag: 'invito-ripiego', url: 'app.html', azioni: [] }
        : { titolo: 'Global Awakening', corpo: r[1], tag: 'rituale-ripiego', url: 'app.html', azioni: [] };
    }

    try {
      await self.registration.showNotification(n.titolo, {
        body: n.corpo,
        tag: n.tag,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        actions: n.azioni || [],
        data: { url: n.url, tipo: payload && payload.tipo, invito: payload && payload.invito }
      });
    } catch (_) {
      // Anche showNotification puo' rigettare (opzioni non supportate su qualche browser).
      // Meglio una notifica scarna che nessuna notifica.
      await self.registration.showNotification('Global Awakening', { body: n.corpo });
    }
  })());
});

// Chiede alla finestra di aprire l'invito e aspetta la conferma. Un'app vecchia (senza il
// gestore) o una pagina bloccata non risponde: dopo attesaMs si ripiega sulla ricarica.
function chiediAllaFinestra(finestra, messaggio, attesaMs) {
  return new Promise((risolvi) => {
    const canale = new MessageChannel();
    let timer = null;
    const fine = (esito) => { clearTimeout(timer); try { canale.port1.close(); } catch (_) {} risolvi(esito); };
    timer = setTimeout(() => fine(false), attesaMs);
    // addEventListener + start() invece di onmessage: funziona uguale nei browser e in Node
    // (test-sw-inviti.js usa il MessageChannel di Node).
    canale.port1.addEventListener('message', (ev) => fine(!!(ev.data && ev.data.ok)));
    canale.port1.start();
    try { finestra.postMessage(messaggio, [canale.port2]); } catch (_) { fine(false); }
  });
}

// Toccando la notifica: se una finestra dell'app e' gia' aperta la si mette a fuoco invece di
// aprirne una seconda (cinque rituali, cinque copie dell'app). Per un invito le si passa l'invito
// per messaggio, senza ricaricarla (una ricarica interromperebbe un training in corso); i
// rituali restano con navigate().
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const dati = e.notification.data || {};
  const base = dati.url || 'app.html';
  const eInvito = TIPI_INVITO.includes(dati.tipo) && typeof dati.invito === 'string';
  const azione = e.action === 'blocca' ? 'blocca' : null;
  const destinazione = azione && self.PushHelpers ? self.PushHelpers.urlAzione(base, azione) : base;

  e.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of finestre) {
      if (f.url.includes('app.html')) {
        await f.focus();
        if (eInvito && await chiediAllaFinestra(f, { tipo: 'apri-invito', invito: dati.invito, azione }, 1000)) return;
        // navigate() non e' disponibile ovunque: se manca, la finestra resta dov'e' ma
        // almeno e' in primo piano, che e' meglio di una seconda copia dell'app.
        if ('navigate' in f) { try { await f.navigate(destinazione); } catch (_) {} }
        return;
      }
    }
    await self.clients.openWindow(destinazione);
  })());
});

// Il browser puo' cambiare da solo l'indirizzo dell'abbonamento, senza avvisare nessuno.
// Senza questo handler la persona smette di ricevere notifiche e non se ne accorge: ne' lei,
// che non sa di doverle aspettare, ne' noi, che continuiamo a scrivere a un indirizzo morto.
//
// Il service worker non vede localStorage, quindi l'app gli lascia in una cache dedicata
// quel poco che serve per ri-registrarsi da solo.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    let dati = null;
    try {
      const c = await caches.open('ga-push-config');
      const r = await c.match('config');
      dati = r ? await r.json() : null;
    } catch (_) { dati = null; }
    if (!dati) return; // senza indirizzo e chiave non possiamo fare nulla: ci riprova l'app al prossimo avvio

    let nuova = e.newSubscription;
    if (!nuova) {
      try {
        nuova = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: dati.vapid
        });
      } catch (_) { return; }
    }
    if (!nuova) return;

    const json = nuova.toJSON();
    const intestazioni = {
      'apikey': dati.key,
      'Authorization': 'Bearer ' + dati.key,
      'Content-Type': 'application/json'
    };

    await fetch(`${dati.url}/rest/v1/rpc/register_push_subscription`, {
      method: 'POST',
      headers: intestazioni,
      body: JSON.stringify({
        p_session_id: dati.sessionId,
        p_endpoint: nuova.endpoint,
        p_p256dh: json.keys.p256dh,
        p_auth: json.keys.auth,
        p_locale: dati.locale
      })
    }).catch(() => {});

    const vecchia = e.oldSubscription;
    if (vecchia && vecchia.endpoint && vecchia.endpoint !== nuova.endpoint) {
      await fetch(`${dati.url}/rest/v1/rpc/delete_push_subscription`, {
        method: 'POST',
        headers: intestazioni,
        body: JSON.stringify({ p_endpoint: vecchia.endpoint })
      }).catch(() => {});
    }
  })());
});
