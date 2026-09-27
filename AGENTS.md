# Notes for coding agents

Chord Garden is a static web app (no build step, no dependencies) that helps
children aged about 2–6 learn perfect pitch with the Eguchi Chord
Identification Method. A child hears a piano chord and taps the matching
colour flag; grown-ups have a PIN-gated area (demo PIN `2468`). It is
installed as a PWA and served from GitHub Pages at https://chordgarden.app.
The README covers the method, how the app is used, and the project layout;
this file covers what you need to change it safely.

## Run and check

- Serve the folder: `python3 -m http.server 8000`, then open
  http://localhost:8000. The service worker only registers over http(s).
- Check before you finish, exactly as the deploy does:
  `node --test tests/*.test.mjs` and
  `for f in js/*.js sw.js; do node --check "$f" || exit 1; done`.
- Pushing to `main` deploys through `.github/workflows/pages.yml`, which runs
  those checks first; a failing test means the site doesn't update. Only
  `index.html`, `sw.js`, `assets/`, `css/` and `js/` are published. `tools/`
  is never deployed.

## Where things live

Scripts are plain `<script defer>` files that share globals, loaded in
index.html's order: `data.js` (chords, colours, voicings), `i18n.js`,
`sprites.js`, `audio.js`, `logic.js`, `chord-detect.js`,
`fresh-chord-gate.js`, `mic-capture.js`, `storage.js`, `updates.js`, then
`app.js` (every screen and the practice loop). `sw.js` is the offline cache.
`logic.js`, `chord-detect.js` and `fresh-chord-gate.js` are pure and tested
directly. Modules are IIFEs (`const Store = (() => { ... })()`), and app.js
builds the DOM with its `el()` helper.

## Rules that break things if forgotten

- **Release = version bump.** Every change to a published file needs
  `APP_VERSION` in `js/app.js` and `CACHE_NAME` in `sw.js` bumped together,
  as MAJOR.MINOR.PATCH (patch for a fix, minor for features, 1.0.0 once the
  app is ready). The shell is served cache-first, so installed apps never see
  a change without it. `tests/version.test.mjs` fails if the two differ.
- **New script or asset in the shell:** add it to `APP_SHELL` in `sw.js` and
  to index.html in load order. Tests that load scripts into a vm sandbox
  follow the same order; add it there too.
- **Never rename** the storage keys `rainbow-pitch:v1` / `rainbow-pitch:backup`
  (`js/storage.js`) or the cache prefix `rainbow-pitch-` (`sw.js`). They
  predate the rename to Chord Garden on purpose; changing them wipes families'
  progress or orphans caches.
- **New saved fields:** bump `VERSION` in `js/storage.js` and give old saved
  data a default in `normalise()`. Progress lives only in the browser
  (localStorage, per origin); there is no server and no import yet.
- **Updates apply only on the child Home screen** (`js/updates.js`,
  `onChildHome()` in app.js), never mid-set, mid-celebration or in the
  grown-up area. A first install must not reload.

## Product rules

- **Every visible string goes through `I18n.t`** (and `I18n.plural`,
  `I18n.color`, `I18n.chord`, `I18n.notes`, `I18n.date`) with both English
  and Spanish in `js/i18n.js`; a parity test fails otherwise. Spanish is
  neutral, informal (tú), and warm on child screens. "Chord Garden" is never
  translated.
- **Child screens need no reading**, never show scores or chord names, and
  never mark an answer as wrong. Grown-up-only information (chords, notes,
  accuracy) stays behind the PIN.
- **Chord colours mean chords.** They appear only on the answer flags and on
  garden petals; buttons, text and everything else are white and garden ink.
- **Only the piano is pitched.** Decorative sounds must be non-pitched
  (`PianoAudio.playSparkle()` is filtered noise), so nothing competes with
  the chord-colour pairing.
- **Rewards follow practice, not accuracy.** A set waters today's plant
  whether or not the child was right; no plant ever wilts.
- **Real piano mode is experimental.** `tools/real-piano-acceptance` mirrors
  production timing (the 1100 ms reward-replay delay); change both together.

## Test harness quirks

`tests/helpers/fake-dom.mjs` is deliberately small:

- `querySelector` matches only the first class of a selector
  (`'.screen.practice'` also matches `.screen.home`). Select by one distinctive
  class.
- `innerHTML` is plain text and `style` is a plain object (no `setProperty`),
  so app code sets CSS variables through `style.cssText`.
- `getElementById` works, but `querySelector('#id')` silently returns the
  first element of any kind.
- Values created inside a vm sandbox come from another realm, so
  `assert.deepEqual` against literals can fail; normalise them first (see
  `plain()` in `tests/garden.test.mjs`).
- `navigator` is `{}` unless a test passes one, so the app runs in English
  and without a service worker.

For visual checks, headless Chrome driven over the DevTools protocol from a
small Node script works well (Node has a global `WebSocket`). Headless windows
are at least 500 px wide.

## Workflow

- One branch per change, from an up-to-date `main`, merged through a pull
  request. Commit messages explain why in plain language.
- `IDEAS.md` is a local-only list of parked ideas, ignored through
  `.git/info/exclude`. Never add or commit it.
