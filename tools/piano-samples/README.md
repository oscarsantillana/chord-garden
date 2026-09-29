# Piano note files

`build.mjs` makes the piano files the app plays, in `assets/piano/v1/`, from
the [Salamander Grand Piano V3](https://github.com/sfzinstruments/SalamanderGrandPiano)
recordings by Alexander Holm ([CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)).
The files are adapted: trimmed, retuned and levelled for Chord Garden.

```bash
node tools/piano-samples/build.mjs [--cache <dir>]
```

It needs `ffmpeg` on the PATH and downloads the few Salamander recordings it
uses (about 12 MB per layer) into the cache directory. It then:

- makes one file per note the chords use (read from `js/data.js`), each from
  the nearest Salamander recording (Salamander only recorded every third
  note), with a high-quality resampler, so the browser never stretches pitch;
- tunes every note to A = 440 from its measured pitch;
- levels every note to the same loudness, so no chord is louder than another
  (a louder or brighter chord would be a hint a child could learn instead of
  the pitch);
- trims each file to 3.4 s, since chords ring for 3 s and the browser keeps
  every file unpacked in memory.

Then it decodes what it wrote and checks it: tuning within 1 cent, loudness
within 0.75 dB of the target, a silent end, no chord louder than another by
more than 1.5 dB, and no clipping. It writes the measurements to
`report.json` and exits non-zero if any check fails.

`LAYERS` in the script lists the Salamander velocity layers to build. `main`,
layer 7, is the everyday sound; the app's earlier files were Salamander
layers 6–8, so it keeps the sound children already know.

`soft` (Salamander layer 4, 3 dB quieter and darker) and `firm` (layer 11,
2 dB louder and brighter) are for natural piano variety, the per-child setting
that plays each chord a little differently every time, the way a person at a
real piano does, so a child learns the chord and not one recording of it. Each
has the same 18 files as `main`, and their levels are baked into the files.
`js/audio.js` picks one layer per chord (main half the time, soft and firm a
quarter each) and never depends on which chord it is; the notes themselves are
the same in every layer. The app loads soft and firm only when variety is on.

**Changing the files:** build into a new folder (`v2`, and so on), never over
`v1`. Installed apps keep piano files in a long-lived cache keyed by URL (see
`AUDIO_CACHE` in `sw.js`), so new content under an old URL would never reach
them. Then point the app at the new folder: change `SAMPLE_BASE_ROOT` in
`js/audio.js` (it is resolved against audio.js's own location, and the file
names come from the chords in `js/data.js`) and the `assets/piano/v1/` path in
`SAMPLE_URLS` (and `SAMPLE_FILES`) in `sw.js`. `tests/sw-audio-cache.test.mjs` checks that the
chords, `sw.js`, `js/audio.js` and the files on disk agree.
