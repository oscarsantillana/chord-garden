// Chord Garden — full 14-colour selective-safety regression.
//
// This suite deliberately passes the complete CHORDS table to every detector
// call. It protects the release contract that matters in real-piano mode:
// confident answers must never name the wrong colour, while realistic written
// voicings must still clear the live 0.55 threshold at least 95% of the time.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const ChordDetect = require('../js/chord-detect.js');

const dataSource = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
const dataSandbox = {};
vm.createContext(dataSandbox);
vm.runInContext(`${dataSource}\nthis.CHORDS = CHORDS;`, dataSandbox);
const { CHORDS } = dataSandbox;

const SAMPLE_RATE = 48000;
const FFT_SIZE = 8192;
const ACCEPT_THRESHOLD = 0.55;
const ADVANCED_CHORDS = CHORDS.slice(9);

assert.equal(CHORDS.length, 14, 'the full-pool regression requires all 14 configured chords');
assert.equal(ADVANCED_CHORDS.length, 5, 'the inversion regression requires all 5 advanced chords');

function noteToFrequency(note) {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
  assert.ok(match, `expected a scientific pitch name, got ${note}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const midi = (Number(match[3]) + 1) * 12 + base + accidental;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function shiftOctave(note, octaves) {
  return note.replace(/(-?\d+)$/, (octave) => String(Number(octave) + octaves));
}

// Build analyser-style magnitudes directly. Eight stretched partials model a
// mid-register piano string (f_k = k*f0*sqrt(1+B*k^2)); a small three-bin
// lobe models finite-window leakage. This is deterministic and exercises the
// production spectrum classifier without an O(FFT_SIZE^2) test-only DFT.
function pianoLikeSpectrum(notes, {
  inharmonicity = 0.00035,
  fundamentalAmplitude = 1,
  octaveShift = 0,
} = {}) {
  const magnitudes = new Float64Array(FFT_SIZE / 2);
  const partialAmplitudes = [1, 0.62, 0.38, 0.25, 0.17, 0.12, 0.085, 0.06];
  const noteWeights = [1, 0.88, 0.76];
  const leakage = [
    [-1, 0.16],
    [0, 1],
    [1, 0.16],
  ];

  notes.forEach((note, noteIndex) => {
    const fundamental = noteToFrequency(note) * Math.pow(2, octaveShift);
    partialAmplitudes.forEach((baseAmplitude, partialIndex) => {
      const harmonic = partialIndex + 1;
      const frequency = harmonic * fundamental *
        Math.sqrt(1 + inharmonicity * harmonic * harmonic);
      const centreBin = Math.round((frequency * FFT_SIZE) / SAMPLE_RATE);
      const amplitude = baseAmplitude *
        (harmonic === 1 ? fundamentalAmplitude : 1) *
        (noteWeights[noteIndex] || 1);

      for (const [offset, scale] of leakage) {
        const bin = centreBin + offset;
        if (bin > 0 && bin < magnitudes.length) {
          magnitudes[bin] += amplitude * scale;
        }
      }
    });
  });

  return magnitudes;
}

function classify(notes, spectrumOptions = {}) {
  return ChordDetect.identifyWithBass(
    pianoLikeSpectrum(notes, spectrumOptions),
    {
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      chords: CHORDS,
    }
  );
}

const startedAt = performance.now();

// Typical/weak fundamentals × representative mid-register piano
// inharmonicity × one octave either side of the written register.
const stressTrials = [];
for (const chord of CHORDS) {
  for (const fundamental of [
    { label: 'typical', amplitude: 1 },
    { label: 'weak', amplitude: 0.15 },
  ]) {
    for (const inharmonicity of [0.0002, 0.0006]) {
      for (const octaveShift of [-1, 0, 1]) {
        const result = classify(chord.notes, {
          fundamentalAmplitude: fundamental.amplitude,
          inharmonicity,
          octaveShift,
        });
        stressTrials.push({
          expected: chord.name,
          detected: result.best && result.best.name,
          confidence: result.confidence,
          accepted: result.confidence >= ACCEPT_THRESHOLD,
          fundamental: fundamental.label,
          inharmonicity,
          octaveShift,
        });
      }
    }
  }
}

const wrongAccepted = stressTrials.filter(
  (trial) => trial.accepted && trial.detected !== trial.expected
);
assert.deepEqual(
  wrongAccepted,
  [],
  `full-pool stress grid must have zero wrong confident accepts: ${JSON.stringify(wrongAccepted.slice(0, 5))}`
);

const correctAccepted = stressTrials.filter(
  (trial) => trial.accepted && trial.detected === trial.expected
);
const coverage = correctAccepted.length / stressTrials.length;
const missed = stressTrials.filter(
  (trial) => !trial.accepted || trial.detected !== trial.expected
);
assert.ok(
  coverage >= 0.95,
  `full-pool stress-grid coverage must be >=95%; got ` +
    `${correctAccepted.length}/${stressTrials.length} (${(coverage * 100).toFixed(1)}%). ` +
    `Examples: ${JSON.stringify(missed.slice(0, 8))}`
);

// Each configured three-key chord contributes exactly three single keys and
// three unordered dyads. None is a complete written chord, even if its
// harmonics happen to flatter a candidate's chroma template.
const incompleteTrials = [];
for (const chord of CHORDS) {
  const noteSets = [
    [chord.notes[0]],
    [chord.notes[1]],
    [chord.notes[2]],
    [chord.notes[0], chord.notes[1]],
    [chord.notes[0], chord.notes[2]],
    [chord.notes[1], chord.notes[2]],
  ];

  for (const notes of noteSets) {
    const result = classify(notes);
    incompleteTrials.push({
      chord: chord.name,
      notes,
      detected: result.best && result.best.name,
      confidence: result.confidence,
    });
  }
}

const incompleteAccepts = incompleteTrials.filter(
  (trial) => trial.confidence >= ACCEPT_THRESHOLD
);
assert.deepEqual(
  incompleteAccepts,
  [],
  `isolated keys and dyads must all abstain against the full pool: ` +
    `${JSON.stringify(incompleteAccepts.slice(0, 5))}`
);

// Advanced triads have only one configured written bass. Rotate the same
// pitch-class family into each of its two other close-position inversions;
// neither may inherit the advanced colour merely because the family matches.
const inversionTrials = [];
for (const chord of ADVANCED_CHORDS) {
  const [low, middle, high] = chord.notes;
  const unwrittenInversions = [
    [middle, high, shiftOctave(low, 1)],
    [high, shiftOctave(low, 1), shiftOctave(middle, 1)],
  ];

  for (const notes of unwrittenInversions) {
    const result = classify(notes);
    inversionTrials.push({
      chord: chord.name,
      notes,
      detected: result.best && result.best.name,
      confidence: result.confidence,
    });
  }
}

const inversionAccepts = inversionTrials.filter(
  (trial) => trial.confidence >= ACCEPT_THRESHOLD
);
assert.deepEqual(
  inversionAccepts,
  [],
  `unwritten advanced-chord inversions must abstain against the full pool: ` +
    `${JSON.stringify(inversionAccepts)}`
);

const elapsedMs = performance.now() - startedAt;
console.log(
  `ok - full-pool realistic grid: ${correctAccepted.length}/${stressTrials.length} ` +
    `correct accepts (${(coverage * 100).toFixed(1)}%), 0 wrong accepts`
);
console.log(
  `ok - incomplete voicings: ${incompleteTrials.length}/${incompleteTrials.length} ` +
    `isolated-key/dyad trials rejected`
);
console.log(
  `ok - advanced inversions: ${inversionTrials.length}/${inversionTrials.length} ` +
    `unwritten inversions rejected`
);
console.log(`ok - chord-detect-full-pool completed in ${elapsedMs.toFixed(1)} ms`);
