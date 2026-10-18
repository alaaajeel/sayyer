/*
 * سَيّر service worker (PWA only — the Android app never registers it).
 * - The app shell (page, scripts, styles, icons) is cached so the app opens without internet.
 * - Map tiles, map styles and fonts are cached as you browse, so areas you've seen still draw offline.
 * - Routing and search always go to the network: stale routes or results would be wrong.
 */
// Bump on each release so old caches are dropped when the new worker activates.
const VERSION = 'sayyer-v13-beta';
const SHELL = `${VERSION}-shell`;
const TILES = `${VERSION}-tiles`;
const MAX_TILES = 600;

/** Fonts, icons and base style for the downloaded offline map (bundled with the app, ~4.6 MB). */
const OFFLINE_ASSETS = [
  "./icons/pucks/arrow.png",
  "./icons/pucks/private-car.png",
  "./icons/pucks/taxi.png",
  "./icons/pucks/motorbike.png",
  "./offline/fonts/Noto Sans Bold/0-255.pbf",
  "./offline/fonts/Noto Sans Bold/1024-1279.pbf",
  "./offline/fonts/Noto Sans Bold/1536-1791.pbf",
  "./offline/fonts/Noto Sans Bold/1792-2047.pbf",
  "./offline/fonts/Noto Sans Bold/256-511.pbf",
  "./offline/fonts/Noto Sans Bold/512-767.pbf",
  "./offline/fonts/Noto Sans Bold/64256-64511.pbf",
  "./offline/fonts/Noto Sans Bold/64512-64767.pbf",
  "./offline/fonts/Noto Sans Bold/64768-65023.pbf",
  "./offline/fonts/Noto Sans Bold/65024-65279.pbf",
  "./offline/fonts/Noto Sans Bold/65280-65535.pbf",
  "./offline/fonts/Noto Sans Bold/768-1023.pbf",
  "./offline/fonts/Noto Sans Bold/8192-8447.pbf",
  "./offline/fonts/Noto Sans Bold/8448-8703.pbf",
  "./offline/fonts/Noto Sans Bold/8704-8959.pbf",
  "./offline/fonts/Noto Sans Bold/9472-9727.pbf",
  "./offline/fonts/Noto Sans Italic/0-255.pbf",
  "./offline/fonts/Noto Sans Italic/1024-1279.pbf",
  "./offline/fonts/Noto Sans Italic/1536-1791.pbf",
  "./offline/fonts/Noto Sans Italic/1792-2047.pbf",
  "./offline/fonts/Noto Sans Italic/256-511.pbf",
  "./offline/fonts/Noto Sans Italic/512-767.pbf",
  "./offline/fonts/Noto Sans Italic/64256-64511.pbf",
  "./offline/fonts/Noto Sans Italic/64512-64767.pbf",
  "./offline/fonts/Noto Sans Italic/64768-65023.pbf",
  "./offline/fonts/Noto Sans Italic/65024-65279.pbf",
  "./offline/fonts/Noto Sans Italic/65280-65535.pbf",
  "./offline/fonts/Noto Sans Italic/768-1023.pbf",
  "./offline/fonts/Noto Sans Italic/8192-8447.pbf",
  "./offline/fonts/Noto Sans Italic/8448-8703.pbf",
  "./offline/fonts/Noto Sans Italic/8704-8959.pbf",
  "./offline/fonts/Noto Sans Italic/9472-9727.pbf",
  "./offline/fonts/Noto Sans Regular/0-255.pbf",
  "./offline/fonts/Noto Sans Regular/1024-1279.pbf",
  "./offline/fonts/Noto Sans Regular/1536-1791.pbf",
  "./offline/fonts/Noto Sans Regular/1792-2047.pbf",
  "./offline/fonts/Noto Sans Regular/256-511.pbf",
  "./offline/fonts/Noto Sans Regular/512-767.pbf",
  "./offline/fonts/Noto Sans Regular/64256-64511.pbf",
  "./offline/fonts/Noto Sans Regular/64512-64767.pbf",
  "./offline/fonts/Noto Sans Regular/64768-65023.pbf",
  "./offline/fonts/Noto Sans Regular/65024-65279.pbf",
  "./offline/fonts/Noto Sans Regular/65280-65535.pbf",
  "./offline/fonts/Noto Sans Regular/768-1023.pbf",
  "./offline/fonts/Noto Sans Regular/8192-8447.pbf",
  "./offline/fonts/Noto Sans Regular/8448-8703.pbf",
  "./offline/fonts/Noto Sans Regular/8704-8959.pbf",
  "./offline/fonts/Noto Sans Regular/9472-9727.pbf",
  "./data/road-safety-iraq.json",
  "./data/iraq-governorates.json",
  "./offline/sprites/ofm.json",
  "./offline/sprites/ofm.png",
  "./offline/sprites/ofm@2x.json",
  "./offline/sprites/ofm@2x.png",
  "./offline/style-liberty.json"
];

const TILE_HOSTS = ['tiles.openfreemap.org', 'server.arcgisonline.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', ...OFFLINE_ASSETS.map(encodeURI)]))
      .then(async () => {
        // Initial scripts load before this worker controls the page. Cache them explicitly,
        // including the map worker, so the very first offline restart can load the app.
        const response = await fetch('./assets-manifest.json', { cache: 'reload' });
        if (!response.ok) throw new Error('App asset manifest unavailable');
        const assets = await response.json();
        const cache = await caches.open(SHELL);
        await cache.addAll(assets);
      })
      .then(async () => {
        const cache = await caches.open(SHELL);
        const url = './voice/arafat/manifest.json';
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error('Voice manifest unavailable');
        const manifest = await response.clone().json();
        if (manifest.v !== 2 || !Object.keys(manifest.clips || {}).length) throw new Error('Invalid voice manifest');
        await cache.addAll([...new Set(Object.values(manifest.clips).map(c => './voice/arafat/' + c.file))]);
        await cache.put(url, response);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page loads: newest version when online, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  // Governorate map packs (same github.io origin, other repo): stored by the app itself, never here.
  if (url.pathname.includes('/sayyer-maps/')) return;

  // Own files: built assets have hashed names, so cache-first is always correct.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Map tiles, styles, fonts: serve the cached copy at once and refresh it in the background.
  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok || res.type === 'opaque') {
              cache.put(req, res.clone());
              trim(TILES, MAX_TILES);
            }
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      })
    );
  }
  // Everything else (routing, search): straight to the network.
});
