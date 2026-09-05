import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FreshChordGate = require('../js/fresh-chord-gate.js');

const requestedConstraints = [];
let analyserFrame = 0;
let identifyCalls = 0;
let closed = false;
const track = {
  stopped: false,
  stop() { this.stopped = true; },
};

class FakeAnalyser {
  constructor() {
    this.fftSize = 2048;
    this.smoothingTimeConstant = 0;
  }

  get frequencyBinCount() {
    return this.fftSize / 2;
  }

  getFloatFrequencyData(target) {
    // Three calm baseline frames, then one strong attack followed by a
    // stable spectrum. This drives the real FreshChordGate state machine.
    target.fill(analyserFrame < 3 ? -60 : -20);
    analyserFrame += 1;
  }

  getFloatTimeDomainData(target) { target.fill(analyserFrame < 3 ? 0 : .1); }
}

class FakeAudioContext {
  constructor() {
    this.sampleRate = 48000;
    this.state = 'running';
  }

  createMediaStreamSource() {
    return { connect() {} };
  }

  createAnalyser() {
    return new FakeAnalyser();
  }

  async close() {
    closed = true;
  }
}

const ChordDetect = {
  dbToLinear(db) {
    return Math.pow(10, db / 20);
  },

  identify() {
    assert.fail('the live path must use identifyWithBass, not chroma-only identify');
  },

  identifyWithBass(_magnitudes, opts) {
    identifyCalls += 1;
    assert.equal(opts.sampleRate, 48000);
    assert.equal(opts.fftSize, 8192);
    if (identifyCalls <= 3) {
      return {
        chroma: new Array(12).fill(0),
        energy: 1,
        silence: true,
        best: null,
        confidence: 0,
      };
    }
    return {
      chroma: new Array(12).fill(0),
      energy: 2,
      silence: false,
      best: { name: 'red', score: 1 },
      confidence: 0.9,
    };
  },
};

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  navigator: {
    mediaDevices: {
      async getUserMedia(constraints) {
        requestedConstraints.push(constraints);
        return {
          getTracks() {
            return [track];
          },
        };
      },
    },
  },
  window: { AudioContext: FakeAudioContext },
  ChordDetect,
  FreshChordGate,
};
vm.createContext(sandbox);
const micSource = fs.readFileSync(new URL('../js/mic-capture.js', import.meta.url), 'utf8');
vm.runInContext(`${micSource}\nthis.MicCapture = MicCapture;`, sandbox);
const { MicCapture } = sandbox;

await MicCapture.start();
assert.deepEqual(
  JSON.parse(JSON.stringify(requestedConstraints[0])),
  {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  },
  'capture should request raw mono audio without voice-processing DSP'
);

let arm;
const armAfter = new Promise((resolve) => { arm = resolve; });
const red = { name: 'red', notes: ['C4', 'E4', 'G4'] };
const lifecycle = [];
const heardPromise = new Promise((resolve, reject) => {
  MicCapture.listenForChord(
    [red],
    (chord, confidence) => {
      lifecycle.push('heard');
      resolve({ chord, confidence });
    },
    () => reject(new Error('fresh stable attack should not time out')),
    {
      armAfter,
      pollMs: 1,
      timeoutMs: 500,
      baselineFrames: 3,
      stableFrames: 3,
      onReady: () => { lifecycle.push('ready'); },
      onOnset: () => { lifecycle.push('onset'); },
    }
  );
});

await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(identifyCalls, 0, 'no analyser polling may occur before the output-silence barrier resolves');

arm();
const heard = await Promise.race([
  heardPromise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for fake chord')), 1000)),
]);
assert.equal(heard.chord.name, 'red');
assert.equal(heard.confidence, 0.9);
assert.deepEqual(lifecycle, ['ready', 'onset', 'heard'], 'capture must expose baseline, onset, then terminal detection in order');
assert.ok(identifyCalls >= 6, 'baseline, onset, and stable frames should all traverse identifyWithBass');

MicCapture.stop();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(track.stopped, true, 'stop must release every MediaStream track');
assert.equal(closed, true, 'stop must close the capture AudioContext');

console.log('ok - mic capture: raw constraints, arming barrier, inversion path, fresh attack, and cleanup');
