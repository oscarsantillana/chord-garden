import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pianoSpectrum } from './helpers/piano-spectrum.mjs';
import { replay } from '../tools/piano-calibration/replay.mjs';
const require = createRequire(import.meta.url);
const FreshChordGate = require('../js/fresh-chord-gate.js');
const ChordDetect = require('../js/chord-detect.js');
const red = { name: 'red', notes: ['C4', 'E4', 'G4'] };
const chord = pianoSpectrum(red.notes);

// Fixed broadband floor with independently varying bins, then a real chord
// spectrum above that floor. Exercise capture, classifier, and gate together.
let seed = 19;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }
for (const playChord of [false, true]) {
  let at = 0, frame = 0, timer = null, ready = 0;
  const heard = [], timeouts = [], frames = [];
  class Context {
    sampleRate = 48000; state = 'running';
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { frequencyBinCount: 4096,
      getFloatTimeDomainData(data) { data.fill(.002); },
      getFloatFrequencyData(data) {
        for (let i = 0; i < data.length; i++) {
          const noise = .00001 * Math.sqrt(-Math.log(Math.max(random(), 1e-9)));
          data[i] = 20 * Math.log10(noise + (playChord && frame >= 8 ? chord[i] : 0));
        }
        frame++;
      },
    }; }
    async close() {}
  }
  const sandbox = { console, Date: { now: () => at },
    setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => { timer = null; },
    window: { AudioContext: Context },
    navigator: { mediaDevices: { async getUserMedia() { return { getTracks: () => [{ stop() {} }] }; } } },
    FreshChordGate, ChordDetect,
  };
  vm.runInNewContext(fs.readFileSync(new URL('../js/mic-capture.js', import.meta.url), 'utf8') + ';this.mic=MicCapture;', sandbox);
  await sandbox.mic.start();
  sandbox.mic.listenForChord([red], result => heard.push(result.name), result => timeouts.push(result),
    { onReady: () => ready++, onFrame: frame => frames.push(frame) });
  await Promise.resolve();
  for (let i = 0; timer && i < 70; i++) { at += 120; const callback = timer; timer = null; callback(); }
  assert.equal(ready, 1, 'the live capture path must arm despite stationary broadband noise');
  assert.deepEqual(heard, playChord ? ['red'] : [], 'background alone must not become a chord');
  assert.equal(timeouts.length, playChord ? 0 : 1);
  const replayed = replay({ sampleRate: 48000, fftSize: 8192, frames });
  assert.equal(replayed.replayed.ready, true);
  assert.equal(replayed.replayed.detected, playChord ? 'red' : null, 'saved spectra reproduce capture decisions with the full candidate pool');
  sandbox.mic.stop();
}
console.log('ok - stationary microphone noise permits readiness, fresh real spectra match, noise alone abstains');
