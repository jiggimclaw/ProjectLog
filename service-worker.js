const CACHE_NAME = 'projectlog-shell-v3-1-0';
const VERSION = '3.1.0';
const versioned = (path) => `${path}?v=${VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  versioned('./styles.css'),
  './manifest.webmanifest',
  versioned('./src/app.js'),
  versioned('./src/analytics.js'),
  versioned('./src/backup.js'),
  versioned('./src/chart.js'),
  versioned('./src/domain.js'),
  versioned('./src/events.js'),
  versioned('./src/icons.js'),
  versioned('./src/presentation.js'),
  versioned('./src/router.js'),
  versioned('./src/storage.js'),
  versioned('./src/view-helpers.js'),
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
