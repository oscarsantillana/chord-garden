import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let releaseCalls = 0;
let triggerCalls = 0;

class FakeSampler {
  constructor(options) {
    this.volume = { value: 0 };
    setTimeout(options.onload, 0);
  }

  toDestination() {
    return this;
  }

  releaseAll() {
    releaseCalls += 1;
  }

  triggerAttackRelease() {
    triggerCalls += 1;
  }
}

class FakeNoiseSynth {
  constructor() {
    this.volume = { value: 0 };
  }

  toDestination() {
    return this;
  }

  triggerAttackRelease() {}
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Tone: {
    Sampler: FakeSampler,
    NoiseSynth: FakeNoiseSynth,
    async start() {},
    now() { return 0; },
  },
};
vm.createContext(sandbox);
const audioSource = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
vm.runInContext(`${audioSource}\nthis.PianoAudio = PianoAudio;`, sandbox);
const { PianoAudio } = sandbox;

await PianoAudio.unlock();
await PianoAudio.playReward(['C4', 'E4', 'G4'], 0.01);
assert.equal(triggerCalls, 1, 'reward should schedule one pitched output');

PianoAudio.stopAll();
const startedAt = Date.now();
let resolved = false;
const silence = PianoAudio.whenOutputSilent().then(() => { resolved = true; });

await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(resolved, false, 'the barrier must remain closed during the sampler release tail');

await silence;
const elapsed = Date.now() - startedAt;
assert.ok(elapsed >= 250, `the barrier resolved too early for a 0.3s release tail (${elapsed}ms)`);
assert.ok(releaseCalls >= 2, 'playback and stop should both release prior sampler voices');

const alreadySilentAt = Date.now();
await PianoAudio.whenOutputSilent();
assert.ok(Date.now() - alreadySilentAt < 100, 'an already-silent barrier should resolve immediately');

let finishDeferredLoad;
let deferredTriggerCalls = 0;

class DeferredSampler {
  constructor(options) {
    this.volume = { value: 0 };
    finishDeferredLoad = options.onload;
  }

  toDestination() {
    return this;
  }

  releaseAll() {}

  triggerAttackRelease() {
    deferredTriggerCalls += 1;
  }
}

const deferredSandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Tone: {
    Sampler: DeferredSampler,
    NoiseSynth: FakeNoiseSynth,
    async start() {},
    now() { return 0; },
  },
};
vm.createContext(deferredSandbox);
vm.runInContext(`${audioSource}\nthis.PianoAudio = PianoAudio;`, deferredSandbox);
const deferredAudio = deferredSandbox.PianoAudio;

const pendingChord = deferredAudio.playChord(['C4', 'E4', 'G4'], 0.01);
const pendingReward = deferredAudio.playReward(['C4', 'E4', 'G4'], 0.01);
while (!finishDeferredLoad) await Promise.resolve();

deferredAudio.stopAll();
let deferredSilenceResolved = false;
const deferredSilence = deferredAudio.whenOutputSilent().then(() => {
  deferredSilenceResolved = true;
});

await new Promise((resolve) => setTimeout(resolve, 75));
assert.equal(
  deferredSilenceResolved,
  false,
  'the barrier must wait for playback operations whose sample load is still pending'
);

finishDeferredLoad();
await Promise.all([pendingChord, pendingReward]);
await deferredSilence;
assert.equal(
  deferredTriggerCalls,
  0,
  'stopAll must prevent in-flight chord and reward playback from scheduling after loading'
);

console.log('ok - audio output barrier: waits through release tails and cancelled in-flight loading');

// isChordRinging() — a fresh sandbox/sampler so its state starts clean.
const ringingSandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Tone: {
    Sampler: FakeSampler,
    NoiseSynth: FakeNoiseSynth,
    async start() {},
    now() { return 0; },
  },
};
vm.createContext(ringingSandbox);
vm.runInContext(`${audioSource}\nthis.PianoAudio = PianoAudio;`, ringingSandbox);
const ringingAudio = ringingSandbox.PianoAudio;

assert.equal(ringingAudio.isChordRinging(), false, 'nothing has played yet');

await ringingAudio.playChord(['C4', 'E4', 'G4'], 0.2);
assert.equal(ringingAudio.isChordRinging(), true, 'a chord that was just triggered should still be ringing');

ringingAudio.stopAll();
assert.equal(ringingAudio.isChordRinging(), false, 'stopAll should end the ringing chord');

await ringingAudio.playChord(['C4', 'E4', 'G4'], 0.05);
assert.equal(ringingAudio.isChordRinging(), true, 'a freshly played short chord should still be ringing');
await new Promise((resolve) => setTimeout(resolve, 150));
assert.equal(ringingAudio.isChordRinging(), false, 'a short chord should stop ringing once its delay+duration has passed');

console.log('ok - isChordRinging tracks held pitched output through play, stop, and natural end');
