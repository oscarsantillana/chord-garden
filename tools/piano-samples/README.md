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

**Changing the files:** build into a new folder (`v2`, and so on), never over
`v1`. Installed apps keep piano files in a long-lived cache keyed by URL (see
`AUDIO_CACHE` in `sw.js`), so new content under an old URL would never reach
them. Update the list in `sw.js` and `js/audio.js` to match; a test checks
that they agree.
