/* deepseek手机api版 PWA Service Worker
 * 只缓存同源静态资源；API 请求、SSE 流和跨域请求一律直连网络。
 * 升级发布时修改 CACHE_VERSION 即可清理旧缓存。
 */
const CACHE_VERSION = 'ds-mobile-v3'
const CACHE_PREFIX = 'ds-mobile-'
const APP_SHELL = new URL('./', self.registration.scope).href
const PRECACHE = [
  APP_SHELL,
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
].map((url) => new URL(url, APP_SHELL).href)

/** 读取首页引用的 JS/CSS，安装时一并缓存，首次安装后即可离线启动。 */
async function precache() {
  const cache = await caches.open(CACHE_VERSION)
  const response = await fetch(APP_SHELL, { cache: 'reload' })
  if (!response.ok) {
    throw new Error(`app shell returned ${response.status}`)
  }
  await cache.put(APP_SHELL, response.clone())

  const html = await response.text()
  const assets = new Set(PRECACHE)
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1]
    if (!value || value.startsWith('data:') || value.startsWith('#')) {
      continue
    }
    const url = new URL(value, APP_SHELL)
    if (url.origin === self.location.origin) {
      assets.add(url.href)
    }
  }
  await cache.addAll([...assets].filter((url) => url !== APP_SHELL))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

const isCacheable = (request, url) =>
  request.method === 'GET' &&
  url.origin === self.location.origin &&
  !url.pathname.endsWith('/sw.js')

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (!isCacheable(event.request, url)) {
    return
  }

  // 导航请求优先取新版本，断网时回退到缓存的壳。
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_VERSION).then((cache) => cache.put(APP_SHELL, copy))
          }
          return response
        })
        .catch(async () => (await caches.match(APP_SHELL)) ?? Response.error())
    )
    return
  }

  // 静态资源用 stale-while-revalidate，避免每次启动都阻塞在网络上。
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy))
          }
          return response
        })
        .catch(() => cached ?? Response.error())
      return cached ?? network
    })
  )
})
