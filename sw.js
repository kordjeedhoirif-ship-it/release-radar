// Release Radar — fonctionne aussi sans connexion (dernière version enregistrée)
const CACHE = 'rr-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'data/releases.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
// fichiers du site : réseau d'abord (toujours à jour), le cache seulement hors connexion
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); const key = u.pathname.endsWith('releases.json') ? 'data/releases.json' : e.request; caches.open(CACHE).then(c => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(u.pathname.endsWith('releases.json') ? 'data/releases.json' : e.request).then(r => r || caches.match('index.html'))));
});
