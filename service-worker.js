const CACHE = 'dft-v6';

// Build absolute URLs relative to this SW's scope so it works both
// on localhost and on GitHub Pages (/DungeonForTwo/).
const BASE = self.registration.scope;

const FILES = [
  '',
  'index.html',
  'styles.css',
  'manifest.json',
  'assets/favicon.png',
  'assets/preview.png',
  'src/main.js',
  'src/state.js',
  'src/render.js',
  'src/ui.js',
  'src/input.js',
  'src/player.js',
  'src/classes.js',
  'src/enemies.js',
  'src/combat.js',
  'src/dungeon.js',
  'src/items.js',
  'src/shop.js',
  'src/audio.js',
  'src/mobile.js',
  'src/detect.js',
  'src/rng.js',
  'assets/sounds/boss_music.ogg',
  'assets/sounds/death_music.ogg',
  'assets/sounds/equip.ogg',
  'assets/sounds/finished_level.ogg',
  'assets/sounds/hit.ogg',
  'assets/sounds/level_up.ogg',
  'assets/sounds/mage_ability.ogg',
  'assets/sounds/make-believe-giulio-fazio-main-version-16260-01-24.mp3',
  'assets/sounds/pickup_gold.ogg',
  'assets/sounds/pickup_item.ogg',
  'assets/sounds/player_hit.ogg',
  'assets/sounds/sword_ability.ogg',
].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Cache-first: serve from cache, fall back to network.
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
