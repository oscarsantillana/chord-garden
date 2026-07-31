# Real piano acceptance harness

This is a separate, operator-facing protocol for validating the production microphone detector with physical pianos and device microphones. It is not linked from the child-facing application and is intentionally outside the application shell and service worker.

## Run it

From the repository root, serve the files on a clean local origin:

```sh
python3 -m http.server 8000
```

Open:

```text
http://127.0.0.1:8000/tools/real-piano-acceptance/
```

Loopback HTTP is treated as a secure browser context. A different device requires an HTTPS origin trusted by that device. Use a clean origin with no controlling service worker; the harness refuses to run if a service worker controls the page.

Do not open `index.html` as a `file:` URL. Browsers do not grant the required microphone access there.

## Protocol

The session queue is deterministic:

- Every written-chord pass contains all 14 production chords in `CHORDS` order.
- Every microphone listen uses the full 14-chord candidate pool, including when testing one target.
- Positive passes rotate through normal, weak, and sustained-with-pedal attacks.
- A negative pass contains silence, a single key, a dyad, speech, a room transient, a previous piano tail, and the production Red reward-to-next-round output tail.
- A negative pass also contains both unwritten inversions of each advanced root-position chord: Gray, Tan, Light Green, Light Purple, and Sky Blue.

For each trial, the harness enforces:

```text
SETUP → PREVIEW → ARMING → READY → RESULT
```

The expected target is fixed and displayed in Preview before microphone listening begins. Do not perform the scenario during Arming. Perform it only after Ready appears. The detected name and confidence remain absent from the page and live region until the terminal Result state.

If a listening window expires before baseline readiness, it terminates directly from Arming to Result rather than claiming a false Ready state.

The default session is 59 trials: 42 written-chord trials (three passes of 14) and 17 negative trials. A release-quality matrix should repeat the protocol across the planned physical pianos, rooms, and device microphones. Use stable anonymous aliases so exports can be grouped without entering personal or hardware-identifying data.

The recorder’s release gates are:

- zero wrong written-chord acceptances;
- zero false acceptances on negative scenarios;
- at least 90% correct written-chord coverage.

An abstention on a written chord is safe but lowers coverage. Any wrong acceptance or false acceptance is a safety failure worth preserving and investigating.

## Privacy and isolation

The harness loads the local detector modules plus the exact production
`audio.js` playback path. Its content security policy allows downloads only
of the pinned Tone.js runtime and Salamander piano samples; frames and every
other connection origin remain blocked. Tone.js may create an origin-local
blob worker, but that worker inherits the connection restrictions. The
ordinary HTTPS GETs disclose normal connection metadata (for example IP
address and user agent) to the two static hosts. Microphone content and
results never leave the page.

It does not:

- load the child-facing application UI, storage module, or service worker;
- upload results or call application analytics;
- write cookies, IndexedDB, local storage, or session storage;
- retain or export audio, microphone track labels, spectra, FFT bins, or device IDs.

Microphone spectra exist only as transient in-memory inputs inside `MicCapture`. Export uses a browser-created JSON `Blob` and includes the recorder’s anonymous metadata, fixed candidate names, planned protocol queue, trial outcomes, classifications, durations, and aggregate metrics.

For the Rainbow Pitch Red-reward-tail negative, the harness runs the
production sequence on the same device: Red `playReward()`, the app's 1100 ms
next-round delay, `stopAll()`, and `whenOutputSilent()` as the microphone
`armAfter` barrier. This is deliberately scoped to the Red reward path; it
does not claim physical coverage of every app-played voicing. The operator
never switches tabs and must not play a physical key. A load, timer, stop, or
barrier failure is retained as an invalid `playback-error`, never misreported
as a correct detector rejection. Stopping, invalidating, hiding, or leaving
the page aborts preparation and invalidates any still-loading pitched output.

## Combine a hardware matrix

After collecting exports on multiple pianos and devices, combine them locally:

```sh
node tools/real-piano-acceptance/summarize.mjs results/*.json > matrix-summary.json
```

The summary reports overall safety and coverage, every instrument/device/room
bucket, per-chord and per-technique results, negative scenarios, matrix
coverage, and any hardware bucket below the 90% coverage target.

## Stopping and recovery

“Stop session,” page navigation, and hiding the page all cancel listening and stop microphone tracks. If a trial was active, the harness retains it as an invalid attempt with reason `cancelled`. The partial session remains available for JSON export from Setup.

During Arming or Ready, “Mark attempt invalid” retains the attempt with reason `operator-error`, excludes it from safety and coverage metrics, and returns the operator to the same fixed queue item after Result. Attempts are never deleted or rewritten.
