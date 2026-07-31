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

// Read the analyser resolution through MicCapture's real start() path instead
// of duplicating its default here. Raising the live FFT size should therefore
// make this regression pass without weakening its assertions.
let liveAnalyser = null;
let liveAudioContext = null;

class FakeAnalyser {
  constructor() {
    this.fftSize = 2048;
    this.smoothingTimeConstant = 0;
  }

  get frequencyBinCount() {
    return this.fftSize / 2;
  }
}

class FakeAudioContext {
  constructor() {
    this.sampleRate = 48000;
    this.state = 'running';
    liveAudioContext = this;
  }

  createMediaStreamSource() {
    return { connect() {} };
  }

  createAnalyser() {
    liveAnalyser = new FakeAnalyser();
    return liveAnalyser;
  }

  async close() {}
}

const micSandbox = {
  console,
  setTimeout,
  clearTimeout,
  navigator: {
    mediaDevices: {
      async getUserMedia() {
        return { getTracks: () => [{ stop() {} }] };
      },
    },
  },
  window: { AudioContext: FakeAudioContext },
  ChordDetect,
  FreshChordGate: {},
};
vm.createContext(micSandbox);
const micSource = fs.readFileSync(new URL('../js/mic-capture.js', import.meta.url), 'utf8');
vm.runInContext(`${micSource}\nthis.MicCapture = MicCapture;`, micSandbox);
await micSandbox.MicCapture.start();

const SAMPLE_RATE = liveAudioContext.sampleRate;
const FFT_SIZE = liveAnalyser.fftSize;
micSandbox.MicCapture.stop();
assert.equal(SAMPLE_RATE, 48000, 'the fake live path must expose a 48 kHz analyser');

function noteToFrequency(note) {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const midi = (Number(match[3]) + 1) * 12 + base + accidental;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function pianoLikeSpectrum(notes, { inharmonicity, octaveShift }) {
  const magnitudes = new Float64Array(FFT_SIZE / 2);
  const partialAmplitudes = [1, 0.6, 0.35, 0.22, 0.14, 0.09, 0.06, 0.04];

  for (const note of notes) {
    const fundamental = noteToFrequency(note) * Math.pow(2, octaveShift);
    partialAmplitudes.forEach((amplitude, index) => {
      const harmonic = index + 1;
      const frequency = harmonic * fundamental *
        Math.sqrt(1 + inharmonicity * harmonic * harmonic);
      const bin = Math.round((frequency * FFT_SIZE) / SAMPLE_RATE);
      if (bin > 0 && bin < magnitudes.length) magnitudes[bin] += amplitude;
    });
  }

  return magnitudes;
}

const trials = [];
for (const chord of CHORDS) {
  for (const inharmonicity of [0.0004, 0.0006]) {
    for (const octaveShift of [-1, 0, 1]) {
      const result = ChordDetect.identifyWithBass(
        pianoLikeSpectrum(chord.notes, { inharmonicity, octaveShift }),
        {
          sampleRate: SAMPLE_RATE,
          fftSize: FFT_SIZE,
          chords: CHORDS,
        }
      );
      trials.push({
        chord: chord.name,
        inharmonicity,
        octaveShift,
        detected: result.best && result.best.name,
        confidence: result.confidence,
        accepted: result.confidence >= 0.55,
      });
    }
  }
}

const wrongAccepted = trials.filter((trial) =>
  trial.accepted && trial.detected !== trial.chord
);
assert.deepEqual(wrongAccepted, [], 'no wrong live-resolution result may clear the threshold');

const correctAccepted = trials.filter((trial) =>
  trial.accepted && trial.detected === trial.chord
);
const failures = trials.filter((trial) =>
  !trial.accepted || trial.detected !== trial.chord
);
assert.equal(
  correctAccepted.length,
  trials.length,
  `all exact written voicings must work at the live analyser resolution; ` +
    `accepted ${correctAccepted.length}/${trials.length} at FFT ${FFT_SIZE}. ` +
    `Failures: ${JSON.stringify(failures)}`
);

console.log(
  `ok - all ${trials.length} exact written-voicing trials pass at ` +
    `48 kHz / FFT ${FFT_SIZE}`
);
