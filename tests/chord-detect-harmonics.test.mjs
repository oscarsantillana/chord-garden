import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import D from '../js/chord-detect.js';
import Gate from '../js/fresh-chord-gate.js';
import { pianoSpectrum, SAMPLE_RATE, FFT_SIZE } from './helpers/piano-spectrum.mjs';
const context = {};
vm.runInNewContext(fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8') + ';this.chords=CHORDS', context);
const chords = context.chords;
const classify = (notes, options, pool = chords) => D.identifyWithBass(pianoSpectrum(notes, options), {
  sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, chords: pool,
});
function accepted(result) {
  const heard = [];
  const gate = Gate.create({ onHeard: result => heard.push(result.best.name) });
  for (let i = 0; i < 3; i++) gate.pushFrame({ at: i * 120, energy: 1e-9, positiveFlux: 0 });
  for (let i = 0; i < 3; i++) gate.pushFrame({ at: 360 + i * 120, energy: result.energy, positiveFlux: i === 0 ? 1 : 0, result });
  return heard;
}
// Each key may have a different spectral envelope. Weakening every fundamental
// together cannot expose a missing bass being mistaken for another inversion.
for (const chord of chords) {
  const clean = classify(chord.notes);
  assert.deepEqual(accepted(clean), [chord.name], `clean ${chord.name} must remain useful`);
  for (const key of [0, 1, 2]) for (const strength of [0, .001, .01, .03, .06, .15]) for (const octaveShift of [-1, 0, 1]) {
    const fundamentals = [1, 1, 1]; fundamentals[key] = strength;
    const result = classify(chord.notes, { fundamentals, octaveShift });
    assert.ok(result.confidence < .55 || result.best.name === chord.name,
      `${chord.name}, key ${key}, fundamental ${strength}, octave ${octaveShift}: wrong ${result.best?.name} at ${result.confidence}`);
    assert.ok(accepted(result).every(name => name === chord.name));
  }
}
const envelopes = [
  [1, .62, .38, .25, .17, .12, .01, .06],
  [1, .5, .25, .125, .0625, .03125, .015625, .0078125],
];
// Do not depend on a strong seventh partial. Include merged third harmonics,
// especially Purple one octave up at B=.0006, which needs raw-bin corroboration.
for (const chord of chords.slice(0, 9)) for (const octaveShift of [-1, 0, 1]) {
  for (const partials of envelopes) for (const inharmonicity of [0, .0004, .0006, .0012, .002]) {
    for (const strength of [0, .005, .03]) {
      const result = classify(chord.notes, { fundamentals: [strength, 1, 1], partials, octaveShift, inharmonicity });
      assert.ok(accepted(result).every(name => name === chord.name),
        `${chord.name}, octave ${octaveShift}, B=${inharmonicity}, fundamental=${strength}: ${result.best?.name}`);
    }
  }
}
for (const notes of [['C4', 'E5'], ['C3', 'E4'], ['F3', 'A4'], ['G3', 'B4'], ['C4'], ['C4', 'G4'], ['C4', 'E4']]) {
  for (const pool of [chords, chords.slice(0, 2)]) for (const strength of [0, .001, .005, .01, .02, .03, 1]) {
    const fundamentals = notes.map((_, index) => index === 0 ? strength : 1);
    assert.deepEqual(accepted(classify(notes, { fundamentals }, pool)), [], `${notes}, bass=${strength} is not a complete chord`);
  }
}
console.log('ok - 756 independent-key cases, 810 dark-envelope cases, and 98 single-key/dyad cases have no wrong accepts');
