const CACHE_NAME = 'campeonato-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo-sem-fundo.png',
  './logo.jpeg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: always fetch latest, cache as offline fallback
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip Firebase/Google requests (handled by their own SDKs)
  if (url.hostname.includes('firebase') || url.hostname.includes('google')) {
    return;
  }

  e.respondWith(
    fetch(e.request).then(response => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});

// Web Push: handle incoming push notifications (ready for FCM Cloud Functions)
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || '⚽ Campeonato';
  const options = {
    body: data.body || 'Atualização do jogo ao vivo!',
    icon: './logo-sem-fundo.png',
    badge: './logo-sem-fundo.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'live-match',
    renotify: true,
    data: { url: data.url || './' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Open app when notification is clicked
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('brasileiraoftv') || client.url.includes('organizador-de-campeonato')) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
