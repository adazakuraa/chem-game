// Service Worker: オフライン動作用キャッシュ
// 戦略: stale-while-revalidate（キャッシュを即座に返し、裏で最新版を取得して次回に反映）
// ファイルを追加したら PRECACHE に追記し、CACHE_VERSION を上げること。
const CACHE_VERSION = 'chemlab-v0.2.0';
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'css/style.css',
  'js/main.js',
  'js/version.js',
  'js/core/db.js',
  'js/core/engine.js',
  'js/core/formula.js',
  'js/core/progress.js',
  'js/core/store.js',
  'js/core/validate.js',
  'js/ui/lab.js',
  'js/ui/modal.js',
  'js/ui/reactions.js',
  'js/ui/research.js',
  'js/ui/result.js',
  'js/ui/settings.js',
  'js/ui/structure.js',
  'js/ui/util.js',
  'js/ui/zukan.js',
  'data/elements.json',
  'data/substances.json',
  'data/reactions.json',
  'data/non_reactions.json',
  'data/missions.json',
  'data/progression.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
