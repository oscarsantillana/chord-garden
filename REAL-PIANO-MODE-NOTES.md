# Real piano mode

Updated 2026-09-05. The mode remains experimental and off by default.
Physical piano/device-microphone accuracy has not been validated.

## Signal path

`MicCapture` requests mono input with echo cancellation, noise suppression,
and automatic gain control disabled. Browser constraints remain advisory.
It uses an 8192-point analyser at 44.1/48 kHz and 16384 at 88.2/96 kHz,
keeping frequency bins at or below 5.86 Hz. Input is processed locally;
no audio or spectra are saved or uploaded.

The practice screen shows the analyser's raw time-domain input level,
independently of chord confidence. A moving meter confirms incoming sound,
not a recognised piano chord. Input below -80 dBFS displays as quiet; this
display floor does not change detector thresholds. A muted/ended track or
non-running audio context displays as unavailable. After a round times out,
the badge says Paused and the retry explains whether input was missing or
sound arrived without a recognised chord. Polling resumes with Try again;
All done releases the microphone.

`ChordDetect` folds the magnitude spectrum into twelve pitch classes and
compares candidate chord families by cosine similarity. Each pitch-class
power is square-root scaled before comparison, so a louder or longer-held
key does not receive squared weight relative to quieter audible keys. Raw
power still drives silence and onset thresholds. Inversions have the
same chroma template, so this stage cannot determine the bass.

The note-evidence stage retains register and frequency:

1. Look for the three expected pitch classes among the first four peaks at
   least 10% of the strongest low-frequency peak. Quieter peaks remain
   available for lower-string checks. The apparent fundamentals must fit within one octave, as every
   configured voicing does. An open dyad's upper harmonics must not supply
   the missing third key.
2. Test lower-string hypotheses from the same family. An octave peak alone
   cannot establish a lower key. Require corroborating harmonics and either
   a weak fundamental with a distinct, unexplained third-harmonic peak, or an odd partial
   that the apparent three notes cannot explain.
3. Estimate and subtract conservative Hann/Blackman window leakage from the
   apparent notes' harmonics. The residual check considers odd partials 3,
   5, and 7, including shoulders beside stronger peaks, and requires support
   in adjacent bins. It does not depend on a strong seventh partial.
4. A merged third harmonic may corroborate an independently unexplained odd
   partial using neighboring FFT bins. It cannot replace the distinct peak
   required by the weak-fundamental route.
5. Any supported lower string invalidates the apparent bass/completeness,
   including a lower string of the same pitch class. Return confidence zero;
   do not infer a different inversion from ambiguous evidence.

Only after these checks does the bass pitch class select an active configured
voicing. Inactive core inversions and unwritten advanced inversions abstain.
Octave shifts of the written close-position chords remain supported.
Duplicate inversion templates are collapsed before computing family confidence.

Confidence is a heuristic margin, not a calibrated probability. These checks
reduce the demonstrated harmonic confusions; they do not prove correctness
for arbitrary recordings, missing partials, tuning, or microphone responses.
Some spectra do not contain enough information to identify the played keys.

## What the review changed

The earlier first-peak rule returned the wrong colour at confidence 1 when
only the bass fundamental was weak. Its remaining harmonics passed the
completeness check while another key became the apparent bass. All nine core
inversions exhibited this failure. It also accepted C4 + E5 as Red because a
C harmonic supplied G. Weakening the dyad bass could make those harmonics look
like a close-position chord in the next octave.

The new regression suite varies individual fundamental strengths, register,
and harmonic envelopes. The harmonic-evidence veto produces a retry for the
ambiguous cases. In the original 405-case sweep, accepted coverage changes
from 360/405 to 270/405 because missing-fundamental cases now abstain. The
108-case realistic subset retains 108/108 correct accepted results. This is
an intentional safety tradeoff, not an assertion that the former 360 accepts
were ground-truth physical measurements.

The failed harmonic-inference research helpers were removed from production.
Their previous implementations and historical results remain in Git history.

## Temporal gate and output isolation

`FreshChordGate` requires a calm baseline, a new attack with spectral flux and
an energy rise, and three consecutive confident frames agreeing on a colour.
Baseline readiness allows a steady overall level even when room noise changes
individual frequency bins. Spectral flux alone must not keep the listener
waiting indefinitely; the onset still requires both flux and an energy rise.
A bounded capture window resets after an unsuccessful onset. Timeouts cause a
neutral retry and record no child answer.
A later attack with a new energy rise and spectral flux starts a fresh
capture window and resets frame agreement, even if an earlier noise attack
is still being examined. Sustained/decaying tails cannot extend the window.

A saved physical Blue attempt exposed weaker low-frequency components
displacing B3–D4–G4, and D4's second harmonic being mistaken for independent
support for G3. The revised peak selection and unexplained-harmonic check,
together with fresh-attack restart, recognise its first piano strike on
replay. The fixture and independent interference tests cover this case;
recognition across devices and pianos remains unvalidated.

A subsequent physical Orange attempt had clear E4–G4–C5 evidence but lost
family confidence as C5 faded under a stronger G4. Amplitude-scaled chroma
recognises its first strike after readiness without reducing the confidence
threshold or the required three agreeing frames. The saved excerpt and an
independent synthetic chord with uneven key amplitudes cover this behavior.

`PianoAudio.stopAll()` invalidates pending pitched playback, including work
awaiting sample loading. `whenOutputSilent()` waits through the release tail
before microphone polling starts. Normal playback and reward playback share
this scheduling and cancellation implementation; their durations and
velocities remain 2.2 seconds/1 and 1.2 seconds/0.75 respectively.

Practice rounds own their timers and listener handles. Starting another round
or finishing a session cancels that work. Monotonic round IDs prevent old
playback promises from unlocking a new session. Start and Play again both
honor the profile's real-piano setting.

Microphone startup has a cancellation generation. Leaving the setup screen
or stopping capture releases late permission grants and cannot restart a
cancelled session. Failed graph construction also releases its stream/context.
Page exit stops capture and playback; a restored page returns Home.

## Automated evidence

Run all suites with:

```bash
node --test tests/*.test.mjs
```

The detector coverage includes:

- the original 405-condition core inversion grid, with zero wrong accepts
  and 108/108 accepted in its realistic subset;
- all fourteen candidates competing in the 168-case realistic synthetic
  grid, with 168/168 correct accepted results;
- 84 live-resolution written voicings at 48 kHz;
- 756 waveform cases varying one key's fundamental independently across
  three registers;
- 810 cases varying bass strength, register, inharmonicity, and two darker
  harmonic envelopes;
- 98 single-key/dyad cases including open voicings and a weak bass;
- all fourteen onset-aligned Salamander sampled-piano fixtures through the
  classifier and fresh-attack gate.

The new waveform oracle uses a Blackman-windowed FFT. The original suites
retain their Hann windows and unnormalized magnitudes. A shared test-only
radix-2 FFT is compared against the prior direct DFT through 4096 samples.
The complete 405-case grid now runs in CI without the former O(N²) cost.

The app regressions exercise actual UI handlers with simulated DOM/audio
objects: replay, cancellation during permission acquisition, rapid session
restart, stale playback completion, page restoration, and persisted progress
reset. The service-worker tests keep tool navigation separate from the main
app's offline cache. These simulations complement browser checks; they are
not physical microphone measurements.

## Physical acceptance before validation

Use `tools/real-piano-acceptance/` to collect ground truth before seeing the
detector result. It freezes each intended stimulus, distinguishes abstention
from wrong acceptance, and exports a JSON audit trail without audio/spectra.
Its separate page is excluded from the Pages deployment.

The minimum useful matrix remains:

- all fourteen chords, at least ten fresh strikes each;
- two acoustic pianos and three device microphones, including a phone;
- quiet and ordinary room noise;
- normal, uneven/weak, and pedal-sustained attacks;
- single keys, dyads including C4 + E5, speech/noise, previous-chord tails,
  and all ten unwritten advanced inversions;
- the production Red reward-to-next-round output sequence.

Measure wrong confident accepts separately from correct accepted coverage.
Targets are zero observed wrong accepts and at least 90% coverage overall,
without a weak instrument/device bucket. Preserve failures before tuning.
Automated success alone must not relabel this mode as validated.

Microphone answers remain tagged `src: "mic"` and excluded from digital
readiness/accuracy. The guardian's matched count measures agreement between
the child's answer and the detector, not ground-truth detection accuracy.
