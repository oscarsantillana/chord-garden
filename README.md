# 🌈 Rainbow Pitch

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
- Start with **two colours** so there is a real choice to make.
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
"Salamander" grand-piano samples, loaded from a CDN on first tap and cached by
the browser afterwards, so an internet connection is needed the first time.

---

## Using the app

### Child (default)
1. Tap **Start** (this also wakes up the audio — browsers require a tap first).
2. Listen to the chord, then tap the matching colour.
3. A wrong tap is gentle: the chord replays and nothing is marked "wrong."
4. Tap **All done** any time — stopping early is fine, never a failure.
5. Finish the set for a little celebration. 🎉

### Grown-ups
Tap the ⚙ gear on the home screen and enter the demo PIN **`2468`**.

- **Colours** — see the readiness signal, add the next colour, or hand-pick the
  active set (keep at least two).
- **Progress** — accuracy per colour, recent sessions, and a JSON export.
- **Children** — add/switch/remove child profiles (siblings each keep their own
  progress).
- **Settings** — set length, rename a child, reset progress.

> The PIN is a light gate for demos, **not real security**. All data is stored
> **only on this device** (browser `localStorage`); nothing is uploaded.

---

## Project layout

```
rainbow-pitch/
├─ index.html          # app shell, loads Tone.js + scripts
├─ css/styles.css      # playful child theme + calm guardian theme (light & dark)
├─ js/
│  ├─ data.js          # fixed Eguchi colour ↔ chord mapping
│  ├─ audio.js         # Tone.js sampled-piano engine
│  ├─ storage.js       # profiles, stats & sessions in localStorage
│  └─ app.js           # all screens & the practice loop
└─ assets/             # favicon + web-app manifest
```

## License

MIT — see [LICENSE](LICENSE).
