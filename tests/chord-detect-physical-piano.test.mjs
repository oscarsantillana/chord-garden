import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { replay } from '../tools/piano-calibration/replay.mjs';
import vm from 'node:vm';
import D from '../js/chord-detect.js';
import { pianoSpectrum, SAMPLE_RATE, FFT_SIZE } from './helpers/piano-spectrum.mjs';

const data = {};
vm.runInNewContext(fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8') + ';this.chords=CHORDS;', data);
{
  const spectrum = pianoSpectrum(['E4', 'G4', 'C5'], { weights: [.35, 1, .35] });
  const result = D.identifyWithBass(spectrum, { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, chords: data.chords });
  assert.equal(result.best.name, 'orange');
  assert.ok(result.confidence >= .55, 'a stronger G must not hide an audible E and C in Orange');
}
for (const chord of data.chords) for (const dominantKey of [0, 1, 2]) for (const quieter of [.25, .35, .5]) {
  const weights = [quieter, quieter, quieter]; weights[dominantKey] = 1;
  const result = D.identifyWithBass(pianoSpectrum(chord.notes, { weights }), {
    sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, chords: data.chords,
  });
  assert.ok(result.confidence < .55 || result.best.name === chord.name,
    `${chord.name} with louder key ${dominantKey} must not become ${result.best.name}`);
}
for (const [note, strength] of [['G#3', .07], ['G3', .025]]) {
  const chord = pianoSpectrum(['B3', 'D4', 'G4']);
  const interference = pianoSpectrum([note], { partials: [1], inharmonicity: 0 });
  const scale = Math.max(...chord) * strength / Math.max(...interference);
  const spectrum = chord.map((value, i) => value + interference[i] * scale);
  const result = D.identifyWithBass(spectrum, { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, chords: data.chords });
  assert.equal(result.best.name, 'blue');
  assert.ok(result.confidence >= .55, `${note} interference must not hide Blue or borrow D4's harmonic as lower-key support`);
}

for (const filename of ['physical-blue-onsets.json.gz', 'physical-orange-onset.json.gz']) {
  const attempt = JSON.parse(gunzipSync(fs.readFileSync(new URL(`./fixtures/${filename}`, import.meta.url))));
  const result = replay(attempt);
  assert.equal(result.replayed.ready, true);
  assert.equal(result.replayed.detected, attempt.target.expected, `physical ${attempt.target.name} must recognise the intended inversion`);
  assert.ok(result.replayed.detectedAt < 4000, 'recognise the first strike after readiness instead of waiting for a repeated chord');
  if (attempt.target.name === 'orange') assert.ok(result.replayed.detectedAt >= 3107, 'ignore the chord played before readiness');
}
console.log('ok - physical Blue and Orange onset replays recognise their intended inversions');
