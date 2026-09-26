# Chord Garden

A playful web app that helps young children (about **2–6 years old**) develop
**perfect (absolute) pitch** using the **Eguchi Chord Identification Method**.

The child hears a chord on a real piano and taps the matching **colour**. No
reading, no scores, no chord names — just listening and playing. Grown-ups get a
quiet, PIN-protected area to choose colours, follow progress, and add the next
colour when the child is ready.

> This is a fresh, self-contained rebuild synthesising three earlier prototypes
> in this workspace — `eguchi`, `cim`/`cim-1` (Chord Identification Method
> Trainer), and `eguchi-codex` (*Lend Me Your Ears*). It keeps the authoritative
> Eguchi colour↔chord mapping and the child-first UX principles from those, with
> zero build tooling.

---

## The method in one minute

The Eguchi method teaches absolute pitch to very young children by pairing each
chord with a fixed **colour**:

| Order | Colour | Chord | Notes |
|------:|--------|-------|-------|
| 1 | 🔴 Red | C | C E G |
| 2 | 🟡 Yellow | F/C | C F A |
| 3 | 🔵 Blue | G/B | B D G |
| 4 | ⚫ Black | F/A | A C F |
| 5 | 🟢 Green | G/D | D G B |
| 6 | 🟠 Orange | C/E | E G C |
| 7 | 🟣 Purple | F | F A C |
| 8 | 🩷 Pink | G | G B D |
| 9 | 🟤 Brown | C/G | G C E |

*(Five advanced colours — Gray, Tan, Light Green, Light Purple, Sky Blue —
cover the remaining major triads.)*

**How to practise:**

- Short and often — about **5 sessions a day**, 2–3 minutes each (~20 rounds).
- Brand-new learners can start with **one colour** — pure listening and
  imprinting, no choice to make yet — then move to **two colours** once that
  first one is familiar, so there is a real choice to make.
- Introduce colours **one at a time**, roughly **every two weeks**.
- Only add the next colour once the current ones are recognised with **near‑100%
  accuracy**. The grown-up area shows a *readiness signal* and lets you add it.

Learn more: Eguchi's Chord Identification Method (Ichionkai Music School).

---

## Run it

It's a static site — no build step, no dependencies to install.

**Option A — just open it**

Open `index.html` in a modern browser (Chrome, Safari, Firefox, Edge).

**Option B — serve locally** (recommended; avoids any browser file:// quirks)

```bash
cd rainbow-pitch
python3 -m http.server 8000
# then visit http://localhost:8000
```

**Option C — host it free**

Push to GitHub and enable **GitHub Pages** (serve from the repo root), or drop
the folder onto Netlify / Vercel / Cloudflare Pages.

The piano sound uses [Tone.js](https://tonejs.github.io/) with the public
"Salamander" grand-piano samples, loaded from a CDN on first tap. The first
visit needs an internet connection; after that, a service worker keeps the
whole app — including the piano samples — working fully offline when served
over http(s) (e.g. GitHub Pages). Opening `index.html` directly via `file://`
still works, just without offline caching.

---

## Using the app

### Child (default)
1. Tap **Play** (this also wakes up the audio — browsers require a tap first).
2. Listen to the chord, then tap the matching colour.
3. A wrong tap is gentle: the right flag glows while the chord plays again, and tapping it moves on. Nothing is marked "wrong."
4. Tap **All done** any time — stopping early is fine, never a failure.
5. Finish (or stop) the set, then tap the watering can to water today's flower. Each set helps it grow — seed, sprout, leaves, bud — and the fifth set of the day makes it bloom in the colours just practised. Every day's flower stays in the garden on the home screen.

### Grown-ups
Tap the lock button on the home screen and enter the demo PIN **`2468`**.

- **Colours** — see the readiness signal, add the next colour, or hand-pick the
  active set (keep at least two).
- **Progress** — accuracy per colour, recent sessions, and a JSON export.
- **Children** — add/switch/remove child profiles (siblings each keep their own
  progress).
- **Settings** — set length, rename a child, reset progress, turn the pictures
  on the flags on or off; also **Real piano mode** (below). The whole app's
  **language** (English or Spanish; follows the browser by default, can be
  changed here) and **note names** (C D E or Do Re Mi) are set here too —
  device-wide preferences, like the PIN, not per child.

> The PIN is a light gate for demos, **not real security**. All data is stored
> **only on this device** (browser `localStorage`); nothing is uploaded.

### Real piano mode (experimental)

Instead of the app choosing and playing a chord, a grown-up plays one on a
real piano near the device; the app listens through the microphone, decides
which chord it heard, and the child taps the matching colour. Turn it on
per-child in **Settings**. All listening happens locally in the browser —
audio is never recorded, saved, or sent anywhere.

The detector looks for a close-position triad and checks for harmonics that
could indicate a quieter lower key. Incomplete or ambiguous evidence produces
a gentle retry and is not scored. Play the configured voicing, with all three
keys struck together; octave shifts are supported. This remains experimental
until validated across physical pianos, rooms, and device microphones.

The PIN defaults to **`2468`** and can be changed any time in **Settings**.
The lock screen's "Demo PIN: 2468" hint is only shown while the PIN is still
that factory default — once you set your own, the hint disappears for good.

---

## Project layout

```
rainbow-pitch/
├─ index.html          # app shell, loads Tone.js + scripts
├─ css/styles.css      # playful child theme + calm guardian theme (light & dark)
├─ js/
│  ├─ data.js          # fixed Eguchi colour ↔ chord mapping
│  ├─ i18n.js          # English/Spanish strings, note-name spelling (C D E / Do Re Mi)
│  ├─ sprites.js       # custom inline-SVG mascots, colour flags & UI icons (no emoji)
│  ├─ audio.js         # Tone.js sampled-piano engine
│  ├─ chord-detect.js  # pure spectrum/chord classifier
│  ├─ fresh-chord-gate.js # pure fresh-attack + stable-frame state machine
│  ├─ mic-capture.js   # local Web Audio microphone capture
│  ├─ real-piano-acceptance.js # pure ground-truth acceptance recorder
│  ├─ storage.js       # profiles, stats & sessions in localStorage
│  ├─ logic.js         # pure decision logic: readiness, weighted picking, confusions
│  └─ app.js           # all screens & the practice loop
├─ sw.js               # service worker — offline cache for the app shell + piano samples
├─ tests/              # plain-Node logic, detector, gate, and piano-fixture tests
├─ tools/real-piano-acceptance/ # isolated guided physical-test harness
└─ assets/             # favicon, web-app manifest, app icons, bundled fonts (Grandstander + Nunito, OFL)
```

## Development

No build step — this is still a static site, so there's nothing to compile
or bundle.

Run all regression tests, including the 405-condition detector sweep:

```bash
node --test tests/*.test.mjs
for file in js/*.js sw.js; do node --check "$file" || exit 1; done
```

The waveform tests use a test-only FFT checked against the original direct
transform. They preserve the synthesis, windows, and full case grids without
the former two-minute transform cost.

`js/logic.js` holds the pure method logic — rolling readiness windows,
weighted colour picking, confusion aggregation — deliberately kept free of
`Store`/DOM access so it can be loaded both as the `Logic` browser global and
directly in Node, and so it stays straightforward to test. `js/chord-detect.js`
is the same pattern applied to real-piano mode's spectrum classification.

The detector suites require zero wrong accepted colours in their defined
synthetic grids while retaining useful coverage. That is regression evidence,
not a guarantee for arbitrary acoustic input. The sampled-piano fixture suite feeds
all 14 configured chords as onset-aligned 48 kHz spectra from the same
Salamander piano timbre through the public detector and fresh-attack gate.
Neither suite substitutes for the remaining physical-piano/device-microphone
acceptance pass; the separate harness documents how to collect that
ground-truth evidence.

## License

MIT — see [LICENSE](LICENSE).
