import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { replay } from '../tools/piano-calibration/replay.mjs';
import vm from 'node:vm';
import D from '../js/chord-detect.js';
import { pianoSpectrum, SAMPLE_RATE, FFT_SIZE } from './helpers/piano-spectrum.mjs';

const data = {};
vm.runInNewContext(fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8') + ';this.chords=CHORDS;', data);
for (const [note, strength] of [['G#3', .07], ['G3', .025]]) {
  const chord = pianoSpectrum(['B3', 'D4', 'G4']);
  const interference = pianoSpectrum([note], { partials: [1], inharmonicity: 0 });
  const scale = Math.max(...chord) * strength / Math.max(...interference);
  const spectrum = chord.map((value, i) => value + interference[i] * scale);
  const result = D.identifyWithBass(spectrum, { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, chords: data.chords });
  assert.equal(result.best.name, 'blue');
  assert.ok(result.confidence >= .55, `${note} interference must not hide Blue or borrow D4's harmonic as lower-key support`);
}

const attempt = JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/physical-blue-onsets.json.gz', import.meta.url))));
const result = replay(attempt);
assert.equal(result.replayed.ready, true);
assert.equal(result.replayed.detected, 'blue', 'physical B3–D4–G4 must survive weak low-frequency interference and shared harmonics');
assert.ok(result.replayed.detectedAt < 4000, 'recognise the first piano strike instead of waiting for a repeated chord');
console.log('ok - physical Blue onset replay recognises the intended inversion');
