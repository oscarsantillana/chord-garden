# Audio-analysis fixtures

`salamander-onset-spectra.json` contains normalized, sparse FFT peak data—not
audio—from onset-aligned chords rendered with the same Salamander Grand Piano
samples used by Rainbow Pitch. Each frame retains the 128 strongest bins of a
4096-point, 48 kHz Hann-windowed FFT at 0, 60, 120, 240, and 400 ms after the
attack.

Source samples: **Salamander Grand Piano V3** by Alexander Holm, licensed
under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The canonical
source is <https://github.com/sfzinstruments/SalamanderGrandPiano>.

The five advanced-colour entries use the same sparse sample anchors as the
production Tone.js sampler in this register: A3, C4, D#4, F#4, A4, and C5.
Where an exact note sample is absent, the fixture uses Tone-style
nearest-sample playback-rate transposition before the three notes are mixed
with a shared start time. Thus the advanced frames preserve recorded
Salamander timbre while also exercising the transposition path the app uses
for C#4, E4, D4, G#4, B4, Bb3, F4, G4, and Bb4.

These fixtures exercise recorded-piano timbre and browser-scale FFT
resolution. They do not substitute for the separate real-piano/microphone
acceptance corpus.

`physical-blue-onsets.json.gz` is a local diagnostic excerpt supplied during
piano testing on 2026-09-05, labelled B3–D4–G4 (Blue). It contains the first
54 frames (6.583 seconds) of the failed attempt: 48 kHz, 8192-point spectra
and relative frame times. Magnitudes retain seven significant digits and
the JSON is gzip-compressed. It contains no audio, device IDs, names, or
absolute timestamps. The original download remains unchanged.

The excerpt reproduces low-frequency interference displacing apparent keys,
a shared D4 harmonic falsely supporting a lower G, and a noise onset
consuming the capture window before the piano strike. This is one labelled
physical case, not a hardware acceptance matrix.
