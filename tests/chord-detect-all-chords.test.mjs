import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ChordDetect = require('../js/chord-detect.js');

const dataSource = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
const dataSandbox = {};
vm.createContext(dataSandbox);
vm.runInContext(`${dataSource}\nthis.CHORDS = CHORDS;`, dataSandbox);
const { CHORDS } = dataSandbox;

const SAMPLE_RATE = 48000;
const FFT_SIZE = 4096;

function noteToFrequency(note) {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const midi = (Number(match[3]) + 1) * 12 + base + accidental;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function octaveUp(note) {
  return note.replace(/(-?\d+)$/, (octave) => String(Number(octave) + 1));
}

function spectrumFor(notes) {
  const magnitudes = new Float64Array(FFT_SIZE / 2);
  for (const note of notes) {
    const fundamental = noteToFrequency(note);
    for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
      const frequency = fundamental * harmonic;
      const bin = Math.round((frequency * FFT_SIZE) / SAMPLE_RATE);
      if (bin > 0 && bin < magnitudes.length - 1) {
        magnitudes[bin] += 1 / harmonic;
      }
    }
  }
  return magnitudes;
}

for (const chord of CHORDS) {
  const result = ChordDetect.identifyWithBass(spectrumFor(chord.notes), {
    sampleRate: SAMPLE_RATE,
    fftSize: FFT_SIZE,
    chords: CHORDS,
  });
  assert.equal(result.best && result.best.name, chord.name, `${chord.name}: written voicing must name its colour`);
  assert.ok(result.confidence >= 0.55, `${chord.name}: written voicing must clear the live threshold`);
}
console.log('ok - all 14 written chord voicings are accepted against the full candidate pool');

for (const chord of CHORDS.slice(9)) {
  const [low, middle, high] = chord.notes;
  const unwrittenInversions = [
    [middle, high, octaveUp(low)],
    [high, octaveUp(low), octaveUp(middle)],
  ];
  for (const notes of unwrittenInversions) {
    const result = ChordDetect.identifyWithBass(spectrumFor(notes), {
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      chords: CHORDS,
    });
    assert.ok(
      result.confidence < 0.55,
      `${chord.name}: unwritten inversion [${notes.join(', ')}] must abstain; got ${result.best && result.best.name} at ${result.confidence}`
    );
  }
}
console.log('ok - both unwritten inversions of every advanced chord abstain');
