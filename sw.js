/*
 * Chord Garden — service worker.
 *
 * WHY: the app loads Tone.js from a CDN and the piano note files (assets/piano/) at
 * runtime (see js/audio.js), and without a service worker none of that is
 * cached beyond the browser's own HTTP cache — so the app is useless offline,
 * which matters a lot for a kids' app used in cars/planes/waiting rooms. The
 * first visit (online, by definition) precaches the whole app shell, and
 * installs also fill a separate long-lived audio cache with Tone.js and every
 * piano sample. After that first visit, the app — chords, colours and all —
 * works fully offline, and later releases keep the piano without re-downloading.
 */

// Bump this on every release: the shell is served cache-first, so returning
// devices only refetch it when the version (and thus this file) changes.
// It carries APP_VERSION from js/app.js (a test in tests/version.test.mjs
// enforces this) — browsers decide a new sw.js exists by diffing this file's
// bytes, so the version has to live here literally, not in an imported script.
const CACHE_NAME = 'rainbow-pitch-v0.7.1';

// The local app shell: everything needed to boot the app with no network.
const APP_SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/data.js',
  'js/i18n.js',
  'js/sprites.js',
  'js/audio.js',
  'js/logic.js',
  'js/layout.js',
  'js/songs.js',
  'js/chord-detect.js',
  'js/fresh-chord-gate.js',
  'js/mic-capture.js',
  'js/storage.js',
  'js/updates.js',
  'js/app.js',
  'assets/favicon.svg',
  'assets/manifest.json',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/fonts/grandstander-latin.woff2',
  'assets/fonts/grandstander-latin-ext.woff2',
  'assets/fonts/nunito-latin.woff2',
  'assets/fonts/nunito-latin-ext.woff2',
];

const TONE_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js';

// Tone.js and the piano note files live here, not in APP_SHELL or the
// versioned cache above. Both are long-lived: Tone.js is a pinned cdnjs URL,
// and the piano files sit under assets/piano/vN/, where new content ALWAYS
// goes in a new vN folder, never over v1 (tools/piano-samples/README.md). So a
// release has no reason to replace them, and deleting them with the old shell
// cache left updated devices with no piano until they were back online. Bump
// the -v1 only if the same URLs ever start serving different content. Adding
// or removing a note needs no bump: activate prunes entries that are no longer
// in the list.
const AUDIO_CACHE = 'rainbow-pitch-audio-v1';

const APP_ROOT = new URL('./', self.location.href);

// Must match the notes in js/data.js's chords and the files in each layer
// folder of assets/piano/v1/ (tests/sw-audio-cache.test.mjs enforces both, and
// what js/audio.js loads). The soft and firm layers are only played when a
// child has natural piano variety on, but they are cached like main so
// turning it on works offline straight away.
const SAMPLE_LAYERS = ['main', 'soft', 'firm'];
const SAMPLE_FILES = [
  'A3', 'As3', 'B3', 'C4', 'Cs4', 'D4', 'Ds4', 'E4', 'F4', 'Fs4', 'G4', 'Gs4',
  'A4', 'As4', 'B4', 'C5', 'D5', 'E5',
].map(name => name + '.mp3');
const SAMPLE_URLS = SAMPLE_LAYERS.flatMap(layer =>
  SAMPLE_FILES.map(file => new URL('assets/piano/v1/' + layer + '/' + file, APP_ROOT).href));
const AUDIO_URLS = [TONE_JS_URL, ...SAMPLE_URLS];
const AUDIO_URL_SET = new Set(AUDIO_URLS);

const INDEX_URL = new URL('index.html', APP_ROOT).href;
const SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, APP_ROOT).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // The local shell has to succeed — if any of these 404s, install
      // should fail loudly so we notice, same as any normal build error.
      // A new cache name must also bypass still-fresh HTTP cache entries.
      await cache.addAll(APP_SHELL.map(path => new Request(new URL(path, APP_ROOT), { cache: 'reload' })));
    }).then(fillAudioCache)
  );
});

// Best-effort and per URL: one unreachable file must not fail the install or
// stop the rest. Copying from any existing cache (the previous release's
// runtime-fetched samples) is what lets an update finish with no network.
async function fillAudioCache() {
  const audio = await caches.open(AUDIO_CACHE);
  await Promise.all(AUDIO_URLS.map(async (url) => {
    try {
      if (await audio.match(url)) return;
      const existing = await caches.match(url);
      if (existing) {
        await audio.put(url, existing);
        return;
      }
      const res = await fetch(url);
      if (res.ok) await audio.put(url, res);
    } catch (e) {
      // Best-effort only — see comment above; the next online play fetches it.
    }
  }));
}

// The page asks a waiting version to take over once it's safe to reload (see
// js/updates.js's apply()) — this is what lets skipWaiting happen only at a
// moment app.js chooses, never the instant a new version finishes installing.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('rainbow-pitch-') && name !== CACHE_NAME && name !== AUDIO_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(pruneAudioCache).then(() => self.clients.claim())
  );
});

// Drop audio entries the current list no longer names, so a future sample
// change leaves nothing behind.
async function pruneAudioCache() {
  const audio = await caches.open(AUDIO_CACHE);
  const keys = await audio.keys();
  await Promise.all(keys.filter(req => !AUDIO_URL_SET.has(req.url)).map(req => audio.delete(req)));
}

function isPrecached(url) {
  return SHELL_URLS.has(url.href) || AUDIO_URL_SET.has(url.href);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET — POST/etc (none of ours, but be defensive) pass through.
  if (request.method !== 'GET') return;

  // Only the app's two entry URLs share the main document cache. Other
  // pages (including the acceptance tool) keep their own navigation behavior.
  if (request.mode === 'navigate') {
    if (url.origin !== APP_ROOT.origin ||
        (url.pathname !== APP_ROOT.pathname && url.pathname !== new URL(INDEX_URL).pathname)) return;
    event.respondWith(
      fetch(request).then(async res => {
        if (res.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(INDEX_URL, res.clone());
          } catch (error) { /* Cache failure must not discard a successful network response. */ }
        }
        return res;
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.match(INDEX_URL);
      })
    );
    return;
  }

  // App shell, Tone.js, and piano files: cache-first, then fall back to
  // the network and stash a copy for next time. This is the strategy that
  // makes the app (and its sound) work fully offline after the first visit.
  if (isPrecached(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // Same-origin/CORS responses land here as normal 200s (cdnjs sends
          // CORS headers, and the piano files are same-origin), so `res.ok` is the
          // right guard — only cache complete, successful responses.
          if (res.ok) {
            const copy = res.clone();
            const target = AUDIO_URL_SET.has(url.href) ? AUDIO_CACHE : CACHE_NAME;
            caches.open(target).then((cache) => cache.put(request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else: network-first pass-through, no offline guarantee.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
