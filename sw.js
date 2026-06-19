/* MCQ Supermarket — service worker (offline app shell + installable PWA).
   Same-origin GET requests are served cache-first then network-updated; all
   cross-origin traffic (Firebase, Tesseract CDN, Brevo, fonts) goes straight
   to the network so live sync/AI/email are never intercepted. */
const CACHE = 'mcq-ops-v28';
const ASSETS = [
  './', 'index.html',
  'assets/styles.css', 'assets/styles2.css',
  'assets/data.js', 'assets/hr-data.js', 'assets/pages.js', 'assets/pages2.js',
  'assets/ai.js', 'assets/firebase.js', 'assets/app.js', 'assets/faceid.js', 'assets/i18n.js',
  'assets/mcq-logo-exact.png', 'manifest.webmanifest'
];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(a => c.add(a)))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // let CDN / Firebase / Brevo go to network
  const liveAsset = url.pathname === '/' || /\.(?:html|js|css)$/i.test(url.pathname);
  if (liveAsset) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
