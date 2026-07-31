/*
 * Rainbow Pitch — service worker.
 *
 * WHY: the app loads Tone.js from a CDN and ~22 Salamander piano samples at
 * runtime (see js/audio.js), and without a service worker none of that is
 * cached beyond the browser's own HTTP cache — so the app is useless offline,
 * which matters a lot for a kids' app used in cars/planes/waiting rooms. The
 * first visit (online, by definition) precaches the whole app shell plus
 * Tone.js; every sample gets cached the first time it's actually fetched.
 * After that first visit, the app — chords, colours and all — works fully
 * offline.
 */

// Bump this on every release: the shell is served cache-first, so returning
// devices only refetch it when the version (and thus this file) changes.
const CACHE_NAME = 'rainbow-pitch-v3';

// The local app shell: everything needed to boot the app with no network.
const APP_SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/data.js',
  'js/sprites.js',
  'js/audio.js',
  'js/logic.js',
  'js/chord-detect.js',
  'js/fresh-chord-gate.js',
  'js/mic-capture.js',
  'js/storage.js',
  'js/app.js',
  'assets/favicon.svg',
  'assets/manifest.json',
];

const TONE_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js';

// Piano samples stream from this host — cache-first applies to any request
// whose URL starts with it, regardless of how Tone.js issues the request.
const SAMPLE_HOST = 'tonejs.github.io/audio/salamander/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // The local shell has to succeed — if any of these 404s, install
      // should fail loudly so we notice, same as any normal build error.
      await cache.addAll(APP_SHELL);
      // Tone.js lives on a third-party CDN we don't control; if it's briefly
      // unreachable, don't let that sink the whole install — the app can
      // still boot (and re-fetch Tone.js) on the next online visit.
      try {
        await cache.add(TONE_JS_URL);
      } catch (e) {
        // Best-effort only — see comment above.
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

function isPrecached(url) {
  // Skip the bare './' shell entry here — it's the same document as
  // 'index.html' (already covered below) and an empty suffix would match
  // every URL's endsWith() check.
  return url.href === TONE_JS_URL || url.href.includes(SAMPLE_HOST) ||
    APP_SHELL.some((path) => path !== './' && url.href.endsWith(path));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET — POST/etc (none of ours, but be defensive) pass through.
  if (request.method !== 'GET') return;

  // Navigations (e.g. reloading index.html) fall back to the cached shell
  // when offline, so the app still boots instead of showing the browser's
  // offline error page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // App shell, Tone.js, and piano samples: cache-first, then fall back to
  // the network and stash a copy for next time. This is the strategy that
  // makes the app (and its sound) work fully offline after the first visit.
  if (isPrecached(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // Same-origin/CORS responses land here as normal 200s (cdnjs and
          // tonejs.github.io both send CORS headers), so `res.ok` is the
          // right guard — only cache complete, successful responses.
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
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
