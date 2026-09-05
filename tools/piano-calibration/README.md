# Piano recognition diagnostics

Open `http://localhost:8000/tools/piano-calibration/` using the local server.
This developer tool is separate from the child-facing practice app and from
the blinded acceptance protocol. It downloads no third-party assets and
makes no network requests with microphone data.

Start with Red (C4–E4–G4), normal volume, pedal up. Release all keys before
starting, wait for **Play now**, then hold the chord for two seconds. The
result distinguishes baseline/onset problems from incomplete note evidence,
ambiguous harmonics, and uncertain family/inversion matches. The loudest
frame is diagnostic evidence, not an accepted answer.

All 14 production chords compete in every trial. The selected target only
labels the operator's intended keys; it never changes recognition. The
two-key C4–E4 scenario should produce no accepted chord.

Each attempt keeps up to 15 seconds of frequency measurements in tab memory.
It does not record audio or persist anything automatically. **Save diagnostics**
downloads a JSON snapshot containing spectra, timing, intended notes, and
results. It contains no microphone labels or device identifiers. Starting
another attempt replaces the previous one. Stop, page exit, and hiding the
tab release capture. These snapshots belong to the diagnostic workflow;
the practice app does not subscribe to frame diagnostics.

Replay a saved attempt against the current recogniser and temporal gate:

```sh
node tools/piano-calibration/replay.mjs /path/to/rainbow-piano-red-….json
```

Compare the recorded result to the replayed result after changes. Preserve
separate trials of other chords and negative cases before claiming an
improvement; one correctly recognised Red chord is not a piano validation.
The browser scripts use a diagnostic query suffix to avoid stale app-shell
service-worker entries while developing locally.
