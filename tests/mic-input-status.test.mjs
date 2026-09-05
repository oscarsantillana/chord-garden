import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const FreshChordGate = require('../js/fresh-chord-gate.js');
const source = fs.readFileSync(new URL('../js/mic-capture.js', import.meta.url), 'utf8');

// Raw input must stay visible even when the classifier rejects every frame.
for (const [amplitude, muted, contextState, state, reason] of [
  [0, false, 'running', 'quiet', 'no-input'],
  [.02, false, 'running', 'sound', 'unrecognised'],
  [.02, true, 'running', 'unavailable', 'unavailable'],
  [.02, false, 'interrupted', 'unavailable', 'unavailable'],
]) {
  const inputs = [];
  class Context {
    state = contextState; sampleRate = 48000;
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { frequencyBinCount: 4096,
      getFloatTimeDomainData(data) { data.fill(amplitude); },
      getFloatFrequencyData(data) { data.fill(-Infinity); },
    }; }
    async close() {}
  }
  const sandbox = { setTimeout, clearTimeout, console, window: { AudioContext: Context },
    navigator: { mediaDevices: { async getUserMedia() { return { getTracks: () => [{ muted, stop() {} }] }; } } },
    FreshChordGate, ChordDetect: { dbToLinear: db => 10 ** (db / 20),
      identifyWithBass: () => ({ energy: 0, silence: true, confidence: 0 }) },
  };
  vm.runInNewContext(source + ';this.mic=MicCapture;', sandbox);
  await sandbox.mic.start();
  const result = await new Promise(resolve => sandbox.mic.listenForChord([], () => assert.fail('must abstain'), resolve,
    { pollMs: 1, timeoutMs: 15, onInput: input => inputs.push(input) }));
  assert.ok(inputs.length > 0);
  assert.equal(inputs[0].state, state);
  assert.equal(result.reason, reason);
  assert.equal(inputs[0].level > 0, state === 'sound');
  sandbox.mic.stop();
  const count = inputs.length;
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(inputs.length, count, 'input updates stop with capture');
}
console.log('ok - raw microphone status distinguishes silence from rejected audio');
