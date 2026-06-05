// Service worker PWA Global Awakening.
// Strategia: network-first per navigazione/app.html/app.js (aggiornamenti sempre freschi,
// cache solo come fallback offline), cache-first per CDN immutabili e icone, no-cache per Supabase/EmailJS.
const CACHE = 'ga-pwa-v3';
const PRECACHE = [
  'app.html', 'app.js', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // add singolo + allSettled: se un CDN non risponde non fa fallire tutto il precache.
    await Promise.allSettled(PRECACHE.map((u) => c.add(u)));
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

  // Navigazione, app.html e app.js (codice dell'app): network-first, fallback cache.
  // app.js DEVE essere preso fresco, altrimenti le PWA installate restano sulla versione vecchia.
  const isFresh = req.mode === 'navigate' || url.pathname.endsWith('/app.html') || url.pathname.endsWith('/app.js') || url.pathname.endsWith('/');
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
