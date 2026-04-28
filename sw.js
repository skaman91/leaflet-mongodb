const VERSION      = '3'
const STATIC_CACHE = `static-v${VERSION}`
const API_CACHE    = `api-v${VERSION}`
const ALL_CACHES   = [STATIC_CACHE, API_CACHE]

// ─── Install: сразу переходим в активное состояние ────────────────────────────
self.addEventListener('install', () => self.skipWaiting())

// ─── Activate: удаляем старые кеши ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req  = event.request
  const url  = new URL(req.url)

  if (req.method !== 'GET') return

  // Тайлы кешируются через leaflet.offline в IndexedDB — здесь не перехватываем

  // Только запросы к нашему серверу
  if (url.origin !== self.location.origin) return

  // 📡 API — сначала сеть, при отсутствии соединения из кеша
  if (
    url.pathname.startsWith('/points') ||
    url.pathname.startsWith('/locations') ||
    url.pathname.startsWith('/routes') ||
    url.pathname.startsWith('/photo/')
  ) {
    event.respondWith(networkFirst(req, API_CACHE))
    return
  }

  // 📦 Всё остальное (HTML, CSS, JS, img) — кеш, потом сеть
  event.respondWith(cacheFirst(req, STATIC_CACHE))
})

// ─── Стратегии ────────────────────────────────────────────────────────────────

// Статика: кеш → сеть → кешируем на будущее
async function cacheFirst(req, cacheName) {
  const cache  = await caches.open(cacheName)
  const cached = await cache.match(req)
  if (cached) return cached

  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone()).catch(() => {})
    return res
  } catch {
    return new Response('Нет соединения', { status: 503 })
  }
}

// API: сеть → кешируем; при оффлайне — кеш
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone()).catch(() => {})
    return res
  } catch {
    const cached = await cache.match(req)
    if (cached) return cached
    return new Response(
      JSON.stringify({ error: 'Нет соединения', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

