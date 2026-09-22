// Service worker PWA Global Awakening.
// Strategia: network-first per navigazione/app.html/app.js (aggiornamenti sempre freschi,
// cache solo come fallback offline), cache-first per CDN immutabili e icone, no-cache per Supabase/EmailJS.
// push-helpers.js contiene le funzioni pure che costruiscono titolo e testo delle notifiche.
// Sta fuori da qui perche' dentro un service worker non si testa niente, e quella e' la parte
// che decide cosa legge la persona sul telefono.
importScripts('push-helpers.js');

// v7: il bump non e' cosmetico. Senza, i browser che hanno gia' installato l'app tengono il
// service worker vecchio, che non ha nessun handler push — e le notifiche non arrivano
// a nessuno di quelli che l'app ce l'hanno gia'.
// v8: aggiunge music-helpers.js. Senza il bump, chi ha gia' l'app installata tiene il service
// worker vecchio, che quel file non lo conosce: offline la pagina si caricherebbe senza
// MusicHelpers e la musica non partirebbe piu' per niente.
const CACHE = 'ga-pwa-v8';
const PRECACHE = [
  'app.html', 'app.js', 'push-helpers.js', 'music-helpers.js', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js'
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
  const isFresh = req.mode === 'navigate' || url.pathname.endsWith('/app.html') || url.pathname.endsWith('/app.js') || url.pathname.endsWith('/music-helpers.js') || url.pathname.endsWith('/');
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

// Il payload arriva cifrato dalla Edge Function; il browser lo decifra e ce lo consegna qui.
// `userVisibleOnly: true`, dichiarato al momento dell'iscrizione, ci obbliga a mostrare SEMPRE
// una notifica: se questo handler non ne mostrasse nessuna, il browser ne mostrerebbe una
// generica di sistema al posto nostro e, a forza di quelle, ci toglierebbe il permesso.
// Per questo costruisciNotifica ha un ripiego per ogni campo e non solleva mai.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let payload = {};
    try { payload = e.data ? e.data.json() : {}; } catch (_) { payload = {}; }

    // Ripiego assoluto. costruisciNotifica non solleva su payload storti, ma self.PushHelpers
    // puo' essere undefined se importScripts non e' andato a buon fine (file fuori cache e
    // rete assente, o deploy parziale). In quel caso, senza questo try, non verrebbe mostrata
    // NESSUNA notifica — che e' esattamente la condizione che fa mostrare al browser la sua
    // notifica generica di sistema e, a forza di quelle, revocarci il permesso.
    let n;
    try {
      n = self.PushHelpers.costruisciNotifica(payload);
    } catch (_) {
      n = {
        titolo: 'Global Awakening',
        corpo: payload && payload.locale === 'it' ? 'Un rituale sta iniziando.' : 'A ritual is starting.',
        tag: 'rituale-ripiego',
        url: 'app.html'
      };
    }

    try {
      await self.registration.showNotification(n.titolo, {
        body: n.corpo,
        tag: n.tag,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        data: { url: n.url }
      });
    } catch (_) {
      // Anche showNotification puo' rigettare (opzioni non supportate su qualche browser).
      // Meglio una notifica scarna che nessuna notifica.
      await self.registration.showNotification('Global Awakening', { body: n.corpo });
    }
  })());
});

// Toccando la notifica: se una finestra dell'app e' gia' aperta la si mette a fuoco e la si
// porta sul rituale, invece di aprirne una seconda. Aprire sempre una finestra nuova
// lascerebbe la persona con cinque copie dell'app dopo cinque rituali.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destinazione = (e.notification.data && e.notification.data.url) || 'app.html';

  e.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of finestre) {
      if (f.url.includes('app.html')) {
        await f.focus();
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
