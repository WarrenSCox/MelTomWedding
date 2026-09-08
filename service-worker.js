const CACHE = 'mel-tom-wedding-v7.33';

const APP_SHELL = [
  './',
  './index.html',
  './styles-v4.css?v=7.33',
  './app-v4.js?v=7.33',
  './config.js?v=6.8',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './wedding-artwork.jpg',
  './gallery-frame.png'
];

const CORE_PATHS = new Set([
  '/',
  '/MelTomWedding/',
  '/MelTomWedding/index.html',
  '/MelTomWedding/styles-v4.css',
  '/MelTomWedding/app-v4.js',
  '/MelTomWedding/config.js',
  '/MelTomWedding/manifest.webmanifest'
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isCoreRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  if (request.mode === 'navigate') return true;

  const cleanPath = url.pathname;
  return CORE_PATHS.has(cleanPath);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);

  try {
    const freshRequest = new Request(request, { cache: 'no-store' });
    const response = await fetch(freshRequest);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });

    if (cached) return cached;

    if (request.mode === 'navigate') {
      return (await cache.match('./index.html', { ignoreSearch: true })) ||
             (await cache.match('./', { ignoreSearch: true }));
    }

    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: false });

  if (cached) return cached;

  const response = await fetch(request);

  if (response && response.ok) {
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  if (isCoreRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
