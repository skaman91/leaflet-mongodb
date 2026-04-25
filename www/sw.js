const STATIC_CACHE = 'static-v1'
const TILES_CACHE = 'tiles-v1'
const API_CACHE = 'api-v1'

// Что кешируем сразу
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/svg-icon.js',
  '/Leaflet.Control.Opacity.js',
  '/img/arrow-blue.svg'
]

// =======================
// INSTALL
// =======================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// =======================
// ACTIVATE
// =======================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![STATIC_CACHE, TILES_CACHE, API_CACHE].includes(k))
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// =======================
// FETCH
// =======================
self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)

  // ❌ Google tiles — мимо
  if (url.hostname.includes('google.com')) {
    return
  }

  // 🗺 OSM tiles
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(cacheFirst(req, TILES_CACHE))
    return
  }

  // 📡 API
  if (
    url.pathname.startsWith('/points') ||
    url.pathname.startsWith('/pointsHistory') ||
    url.pathname.startsWith('/locations')
  ) {
    event.respondWith(networkFirst(req, API_CACHE))
    return
  }

  // 📦 статика
  event.respondWith(cacheFirst(req, STATIC_CACHE))
})

// =======================
// STRATEGIES
// =======================
async function cacheFirst (req, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  if (cached) return cached

  const res = await fetch(req)
  cache.put(req, res.clone())
  return res
}

async function networkFirst (req, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    cache.put(req, res.clone())
    return res
  } catch (e) {
    const cached = await cache.match(req)
    if (cached) return cached
    throw e
  }
}