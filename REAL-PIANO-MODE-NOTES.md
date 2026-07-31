# Real Piano Mode — Engineering Notes

Last updated: 2026-07-29

This is the current design and evidence log for real-piano mode. It replaces
the earlier research snapshot that ended with a 37% inversion scorer and
chroma-only live capture. That scorer is not used by the application.

## Current status

| Area | Current state | Evidence |
|---|---|---|
| Chord-family classification | Implemented for all 14 configured colours | Full-pool synthetic grid plus sampled-piano spectra |
| Chord completeness | Implemented; incomplete voicings abstain | All 84 isolated-key/dyad cases across all 14 chords |
| Written-bass classification | Implemented with direct low-edge evidence | Core inversion sweep, advanced unwritten-inversion negatives, and 14 sampled-piano onsets |
| Live spectral resolution | Sample-rate-aware | 84/84 exact voicings across registers at 48 kHz; bin-width tests through 96 kHz |
| Fresh-chord requirement | Implemented | Pure state-machine tests and browser-path verification |
| App-output isolation | Implemented | Playback-silence barrier, late-load cancellation test, and timed Red-reward browser pass |
| Browser microphone lifecycle | Implemented | Synthetic MediaStream through the real Web Audio path; track ends on “All done” |
| Ground-truth acceptance tooling | Implemented | Strict session recorder plus separate local guided harness |
| Physical piano/device-mic accuracy | **Not yet validated** | Requires a human acceptance pass on representative hardware |

The mode remains guardian-configurable, per child, and off by default.
Unclear input produces a neutral retry and records no answer.

## What the actual problem was

There were three independent failure modes.

1. A 12-bin chroma vector knows which pitch classes are present but discards
   register. The nine core chords are three inversions of three triads:

   - Red / Orange / Brown → C, E, G
   - Yellow / Black / Purple → C, F, A
   - Blue / Green / Pink → G, B, D

   Chroma alone therefore cannot name an inversion.

2. Chroma can make one isolated key look like a plausible chord because that
   key's harmonics populate several pitch classes. A high chroma margin was
   not proof that three keys had actually been played.

3. Consecutive-frame confidence was not a fresh-event detector. The tail of
   the previous real chord—or Rainbow Pitch's own reward/reveal piano—could
   be stable and confident enough to satisfy the next round.

The fix had to address all three. Improving only the inversion scorer would
still leave false single-key accepts and cross-round self-triggering.

## Shipped design

### 1. Chroma chooses the triad family

`ChordDetect.chromaFromSpectrum()` folds the live magnitude spectrum into 12
pitch classes. `matchChord()` compares it with templates derived directly from
`js/data.js`. Confidence remains margin-primary because piano harmonics put
substantial energy outside a sparse three-bin template.

Only the active colours are candidates.

### 2. The low spectral edge proves completeness

`lowEdgePitchClasses()` reads the first few salient spectral peaks from low to
high frequency before octave information is discarded.

`identify()` requires all three pitch classes of the winning chord to occur in
that low-edge evidence. Otherwise it returns:

```text
confidence: 0
incomplete: true
```

This is the guard that rejects a lone key or dyad instead of treating harmonic
overtones as the missing chord tones.

### 3. Direct bass evidence resolves an inversion

`identifyWithBass()` maps the lowest salient pitch class to the unique
candidate in the winning family whose configured written voicing begins on
that pitch class. It performs this check even when the family has only one
active/configured candidate. That prevents an unwritten inversion of an
advanced chord—or an inactive core inversion—from inheriting another colour.

The decision uses bass pitch class, so the same written inversion can move by
octaves. If the low edge is absent or does not map uniquely, confidence is
zero. There is no fallback to the discarded inferred-harmonic scorer.

Before returning confidence, the classifier collapses duplicate inversion
templates and recomputes the margin between genuinely different triad
families. Bass C can resolve Red vs Orange vs Brown; it cannot turn a
Red-family-vs-Yellow-family near-tie into a confident answer. Because
three-key completeness is already proven at this point, this second margin
gate uses a narrower 0.02→0.12 confidence range than chroma-only matching.

### 4. A temporal gate requires a new attack

`FreshChordGate` is a pure state machine:

```text
WAIT_BASELINE → WAIT_ONSET → CAPTURE_ATTACK → DONE
```

It requires:

- a short calm baseline;
- normalized positive spectral flux;
- an energy rise over that baseline;
- three consecutive confident frames that agree on one colour.

A dedicated `onReady` callback changes the child-facing cue from “Get ready…”
to “Play any colour…” only after the calm baseline exists. This prevents an
adult from following the prompt before the detector can observe a new attack.

A false onset has a bounded capture window. If it never produces stable chord
evidence, the gate returns to baseline instead of letting an unrelated later
tail complete the event. Timeout produces the existing neutral retry.

### 5. Capture arms only after app piano output is silent

`PianoAudio` tracks pending pitched scheduling, a cancellation generation,
and the latest expected sample-release deadline. `stopAll()` invalidates
pitched operations still crossing an asynchronous sample-load boundary, so a
stale reward or reveal cannot begin after it was stopped. `whenOutputSilent()`
is passed to `MicCapture.listenForChord()` as `armAfter`.

At each mic round the app:

1. cancels any prior listener;
2. releases any app piano sound;
3. waits through its release tail;
4. starts baseline/onset polling.

This barrier and the onset gate are intentionally redundant. The barrier keeps
the baseline clean; the gate prevents any sustained tail from counting even if
timing estimates are imperfect.

### 6. Browser capture preserves piano transients

The microphone request asks for mono audio with:

```text
echoCancellation: false
noiseSuppression: false
autoGainControl: false
```

Unsupported constraints are advisory and may be ignored by the browser. The
request does not change the privacy model: analysis remains local in memory;
audio is not recorded, stored, or sent.

The analyser resolution scales with the actual `AudioContext.sampleRate`.
Its default keeps frequency bins at or below 5.86 Hz: FFT 8192 at 44.1/48 kHz
and FFT 16384 at 88.2/96 kHz. A fixed 4096-point FFT at 48 kHz was safe but
missed 12 of 84 low-register exact-voicing cases because fundamentals could
round to the neighbouring pitch class.

## Safety contract

This detector is intentionally selective.

- A correct confident result may unlock the colour buttons.
- Silence, ambiguity, an incomplete voicing, or an unstable attack must
  abstain and lead to retry.
- A wrong confident result is a release failure.

Coverage matters too: a detector that always abstains is safe but useless.
The test suite therefore enforces both:

- zero wrong results above the live `0.55` confidence threshold;
- at least 95% correct accepted coverage in the defined realistic synthetic
  subset.

Real-piano events remain tagged `src: "mic"` and excluded from the core
digital readiness/accuracy calculations. The guardian line “N attempts,
M matched” means the child's answer agreed with the detector; it is not
ground-truth detector accuracy.

## Evidence

### Synthetic behavior tests

`tests/chord-detect.test.mjs` covers:

- pitch-class and template math;
- family ambiguity under chroma alone;
- unambiguous active subsets;
- white-noise rejection;
- isolated-key rejection;
- every isolated key and dyad for all 14 chords;
- a clean inversion through the public `identifyWithBass()` path;
- rejection of all 10 unwritten inversions of the five advanced chords;
- rejection when an inactive inversion has the winning family;
- rejection when direct bass evidence is present but the triad family remains
  a near-tie.

### Full-pool and live-resolution grids

`tests/chord-detect-full-pool.test.mjs` always supplies all 14 colours as
candidates. Its 168-case piano-like grid covers typical and weak fundamentals,
two inharmonicity coefficients, and three octave placements:

- 168/168 correct confident accepts;
- zero wrong confident accepts;
- 84/84 isolated-key and dyad cases rejected;
- 10/10 unwritten advanced inversions rejected.

`tests/chord-detect-live-resolution.test.mjs` obtains the FFT size through the
real `MicCapture.start()` default rather than duplicating it. At 48 kHz / FFT
8192, all 84 exact-voicing cases—14 chords × two inharmonicity values × three
octave placements—are accepted correctly. `tests/mic-capture-resolution.test.mjs`
also protects the ≤5.86 Hz bin-width invariant at 44.1, 48, 88.2, and 96 kHz.

### 405-condition adversarial inversion sweep

`tests/chord-detect-bass.test.mjs` preserves the original grid:

```text
9 chords
× 5 inharmonicity coefficients
× 3 fundamental-strength conditions
× 3 octave shifts
= 405 trials
```

Current result:

- 375/405 top-name correct (92.6%), counting abstentions' provisional
  array-order name;
- 360/405 accepted at the live threshold;
- **360/360 accepted results correct; zero wrong accepted colours**;
- 108/108 realistic-condition trials accepted correctly;
- the 45 hard missing-fundamental/high-register cases abstain safely;
- quiet noise remains below threshold.

The provisional top name on a zero-confidence result is not an app answer.
Selective accepted accuracy is the release metric.

### Recorded sampled-piano onset corpus

`tests/fixtures/salamander-onset-spectra.json` contains sparse, normalized
48 kHz / 4096-point FFT frames from onset-aligned Salamander Grand Piano
chords. It stores spectral data, not audio.

`tests/chord-detect-sampled-piano.test.mjs` feeds all 14 configured chords
through the public classifier and `FreshChordGate`, always with all 14
candidates present. Result:

- 14/14 correct;
- exactly one completion per onset sequence.

The five advanced entries use the same Salamander sample anchors and
nearest-sample playback-rate transposition as the production Tone sampler.
This checks recorded piano timbre and browser-scale FFT resolution. It does
not model a room, acoustic-piano soundboard, device microphone, or browser
input DSP.

### Browser/Web Audio path

A local HTTP build was exercised in Chromium with a page-local synthetic
MediaStream containing a fresh harmonic C-major attack. The test used the
real `getUserMedia` wrapper, `AudioContext`, `AnalyserNode`,
`MicCapture.listenForChord()`, detector, gate, and app UI.

Observed:

- app booted with zero application console errors;
- the fresh Red attack produced “Got it!” and unlocked the answers;
- after answering, the same sustained Red input did **not** complete the next
  round and reached the neutral retry state;
- retry plus a new attack completed normally;
- a controlled ready callback showed “Get ready…” before arming and “Play any
  colour…” after arming;
- “All done” changed the microphone track state to `ended`.

The two console warnings were Tone.js autoplay warnings emitted before a user
gesture, not real-piano application errors.

### Ground-truth acceptance workflow

`js/real-piano-acceptance.js` is a DOM- and microphone-free trial recorder.
It freezes the intended stimulus before listening, records ready/onset/result
durations, distinguishes safe abstention from wrong/false acceptance, retains
invalid attempts without counting them in coverage, and rejects unknown
audio/spectrum-style fields. Exports contain no exact wall-clock timestamp,
raw audio, spectra, stream, or microphone identifier.

The separate `tools/real-piano-acceptance/` page guides an operator through:

```text
SETUP → PREVIEW → ARMING → READY → RESULT
```

Every listen receives all 14 candidates. The default queue contains 42
written-chord trials across normal, weak, and sustained attacks plus 17
negative trials, including all unwritten advanced inversions and the exact
production Red reward-to-next-round output sequence. A result name
does not enter the DOM before the terminal state. Invalid attempts remain in
the audit trail and repeat the same fixed queue item.

The harness was exercised in Chromium with page-local microphone callbacks.
The smoke pass verified target-before-listen ordering, all 14 candidates,
result withholding, repeated false/real onset telemetry, unsafe-result
presentation, invalid/repeat, cancellation, and a 320 px layout with no
horizontal overflow.

A separate clean-runtime pass loaded the SRI-pinned Tone.js bytes with zero
console errors and no CSP violations. It made exactly 22 third-party sample
requests, all GETs to the allowlisted Salamander paths with no request body.
There were two expected Tone.js autoplay warnings before a user gesture; the
audio context was `running` after the Start gesture.

For the `red-reward-tail` trial, the harness uses production `PianoAudio`:
Red `playReward()` and the 1100 ms next-round timer start together, followed
by `stopAll()` and `whenOutputSilent()` as `MicCapture`'s `armAfter`.
Preparation is abortable, and late sample-load completion is invalidated in
the audio engine. Playback, timer, stop, and barrier failures are invalid
trials rather than false evidence of a correct rejection. The scenario is
intentionally named narrowly: it validates the Red reward path, not every
possible app-played chord.

The measured warm-cache browser sequence was:

```text
reward invoked      29 ms
reward scheduled    38 ms
stopAll()          1131 ms
barrier created    1132 ms
barrier resolved   2333 ms
READY              2347 ms
```

The same browser pass forced asynchronous and synchronous reward failures,
`stopAll()` failure, and barrier-construction failure. Each path moved
`PREVIEW → ARMING → RESULT`, retained `playback-error`, never reached READY,
and repeated trial 21. Operator invalidation during both the 1100 ms delay
and the release barrier produced no late listener. A synthetic `pagehide`
during deferred loading moved to SETUP, stopped output again when loading
settled, and created no later listener.

## Non-blocking follow-up

### Long-sweep test performance

`tests/chord-detect-bass.test.mjs` deliberately preserves the full
405-condition adversarial synthesis grid, but its hand-written DFT is
O(N²) for N=4096. On the 2026-07-29 validation machine the sweep took about
129 seconds; the other 13 Node suites completed together in about 7 seconds.
This is test-oracle cost only—the browser detector receives an analyser FFT
and does not run this DFT in production.

If the sweep runs frequently in CI, replace the direct transform with a
deterministic radix-2 FFT. The optimization is acceptable only if it keeps:

- the Hann window and seeded synthesis;
- every family × inharmonicity × fundamental-strength × octave cell;
- 375/405 diagnostic top-name matches;
- 360/405 accepted with zero wrong accepted colours;
- 108/108 correctly accepted realistic-condition trials.

Do not reduce the grid, loosen the 0.55 acceptance threshold, or replace a
failing cell with a cached expected answer just to shorten runtime.

## Discarded approaches

### Chroma-only inversion naming

Impossible by construction: inversions in a family have byte-identical chroma
templates.

### Inferred harmonic-series bass scorer

Two variants were tried before the direct low-edge approach:

- independent per-candidate octave search: 162/405 (40.0%);
- joint whole-voicing/transposition search: 150/405 (37.0%).

Both could be confidently wrong. Major-triad partials support a common
virtual/residue pitch, so inferring a bass from the whole harmonic stack
repeatedly explains the same phantom rather than the actually lowest key.

The old research helpers remain in `js/chord-detect.js` only to keep that
experiment reproducible. The live path does not call
`disambiguateBassVoicing()`.

### Basic Pitch as the primary browser detector

The model route was investigated but not selected for this version. It adds a
large TensorFlow/browser payload, a roughly two-second analysis window, slow
or highly variable first inference, and mobile-WebGL risk. It could be a later
fallback or offline evaluation tool, but the direct onset/low-edge solution is
smaller, explainable, and already fits this fixed 14-chord vocabulary.

## File map

| File | Responsibility |
|---|---|
| `js/chord-detect.js` | Pure chroma, completeness, and inversion classification |
| `js/fresh-chord-gate.js` | Pure baseline/onset/stability state machine |
| `js/mic-capture.js` | getUserMedia/Web Audio wiring, flux calculation, polling, cancellation |
| `js/real-piano-acceptance.js` | Pure ground-truth trials, privacy-safe export, and cross-session metrics |
| `js/audio.js` | Sampled-piano playback and output-silence barrier |
| `js/app.js` | Guardian toggle, priming UI, mic-round lifecycle, retry/skip |
| `js/storage.js` | `src: "mic"` event/session storage, separate from core stats |
| `index.html` | Script load order |
| `sw.js` | Offline app-shell entries and cache version |
| `tests/chord-detect.test.mjs` | Core classifier and negative behaviors |
| `tests/chord-detect-bass.test.mjs` | Adversarial selective-safety/utility grid |
| `tests/chord-detect-full-pool.test.mjs` | All-14 competition, completeness, and advanced inversion grid |
| `tests/chord-detect-live-resolution.test.mjs` | Exact voicings at the actual live analyser default |
| `tests/fresh-chord-gate.test.mjs` | Tail, fresh attack, and false-onset behaviors |
| `tests/chord-detect-sampled-piano.test.mjs` | Recorded-piano onset integration fixture |
| `tests/mic-capture-resolution.test.mjs` | Sample-rate-aware analyser resolution |
| `tests/real-piano-acceptance.test.mjs` | Ground truth, metrics, invalid attempts, and export privacy |
| `tools/real-piano-acceptance/` | Isolated local guided physical-test harness; never part of the child app |
| `tools/real-piano-acceptance/summarize.mjs` | Local cross-session hardware-matrix summary |

## Verification commands

```bash
node tests/logic.test.mjs
node tests/chord-detect.test.mjs
node tests/chord-detect-bass.test.mjs
node tests/chord-detect-all-chords.test.mjs
node tests/chord-detect-full-pool.test.mjs
node tests/chord-detect-live-resolution.test.mjs
node tests/fresh-chord-gate.test.mjs
node tests/chord-detect-sampled-piano.test.mjs
node tests/mic-capture.test.mjs
node tests/mic-capture-resolution.test.mjs
node tests/audio-output-barrier.test.mjs
node tests/real-piano-acceptance.test.mjs
node tests/real-piano-acceptance-browser.test.mjs
node tests/real-piano-acceptance-summary-cli.test.mjs

for file in js/*.js sw.js; do
  node --check "$file" || exit 1
done
```

## Remaining physical acceptance pass

Do not relabel this mode “validated” from the current automated evidence
alone. The final acceptance corpus must use known ground truth: the adult or
tester records which chord was intentionally played before reading the app
result.

Use the separate `tools/real-piano-acceptance/` page so the intended stimulus
is fixed before listening and the detector result stays hidden until the
trial resolves. It stores no audio or spectra and exports an explicit JSON
audit trail.

Minimum useful matrix:

- all 14 configured chords, at least 10 fresh strikes each;
- at least two acoustic pianos with different registers/timbres;
- at least three representative device microphones, including one phone;
- quiet and ordinary-room-noise conditions;
- normal, weak, and pedal-sustained attacks;
- single-key, dyad, speech/noise, previous-chord-tail, and all 10 unwritten
  advanced-inversion negatives;
- production Red reward audio immediately before a new round, reproduced by
  the harness through the production playback and output-silence path. This
  is representative timing evidence, not a physical claim for all 14 app
  reward voicings or the longer two-miss reveal path.

Track two separate metrics:

1. wrong confident accepts (target: zero);
2. correct accepted coverage (target: at least 90% overall, with no materially
   weak device/instrument bucket).

Any failure should be added as a small reproducible spectrum/onset fixture
before thresholds or peak rules are changed. Do not tune against anecdotes
without preserving the failing case.
