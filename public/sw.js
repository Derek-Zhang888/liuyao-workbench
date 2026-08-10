/* 六爻工作台 Service Worker（2026-08-10）
 * 策略：网络优先 + 缓存兜底。静态资源命中网络时写入缓存，离线/弱网时回退缓存。
 * 数据始终走 IndexedDB（不经过 SW），隐私承诺不变：不上传、不追踪。
 */
const CACHE = 'liuyao-workbench-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  // 跳过非 http(s) 与跨域资源（如外部字体）
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
  )
})
