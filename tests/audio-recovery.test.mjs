import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// iOS can leave the Web Audio context suspended, interrupted, frozen or
// unresumable after the app is backgrounded. These tests drive js/audio.js's
// recovery with a fake Tone whose raw context state and clock we control.

const audioSource = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeWorld({ startBehaviour = 'resume' } = {}) {
  const w = {
    contexts: [],
    samplers: [],
    setContextCalls: [],
    startBehaviour,
    docListeners: {},
    winListeners: {},
  };
  class FakeRaw {
    constructor() {
      this.state = 'suspended';
      this.frozenAt = null;
      this.listeners = [];
      this.t0 = Date.now();
    }
    get currentTime() {
      return this.frozenAt !== null ? this.frozenAt : (Date.now() - this.t0) / 1000;
    }
    addEventListener(type, fn) { if (type === 'statechange') this.listeners.push(fn); }
    setState(state) { this.state = state; for (const fn of this.listeners) fn(); }
  }
  class FakeContext {
    constructor() {
      this.rawContext = new FakeRaw();
      this.closed = 0;
      this.disposed = 0;
      w.contexts.push(this);
    }
    get state() { return this.rawContext.state; }
    // A dead iOS context can reject its close(); recovery must swallow that.
    close() { this.closed += 1; return Promise.reject(new Error('close failed')); }
    dispose() { this.disposed += 1; }
  }
  class FakeSampler {
    constructor(options) {
      this.volume = { value: 0 };
      this.disposed = false;
      w.samplers.push(this);
      setTimeout(options.onload, 0);
    }
    toDestination() { return this; }
    releaseAll() {}
    triggerAttackRelease() {}
    dispose() { this.disposed = true; }
  }
  class FakeNoiseSynth {
    constructor() { this.volume = { value: 0 }; }
    toDestination() { return this; }
    triggerAttackRelease() {}
    dispose() {}
  }
  let current = new FakeContext();
  w.initial = current;
  const Tone = {
    Sampler: FakeSampler,
    NoiseSynth: FakeNoiseSynth,
    Context: FakeContext,
    getContext: () => current,
    setContext(ctx) { w.setContextCalls.push(ctx); current = ctx; },
    now: () => 0,
    start() {
      if (w.startBehaviour === 'hang') return new Promise(() => {});
      if (w.startBehaviour === 'resume') current.rawContext.state = 'running';
      return Promise.resolve();
    },
  };
  w.document = {
    visibilityState: 'visible',
    addEventListener(type, fn) { (w.docListeners[type] ||= []).push(fn); },
  };
  w.window = { addEventListener(type, fn) { (w.winListeners[type] ||= []).push(fn); } };
  const sandbox = { console, setTimeout, clearTimeout, Date, Promise, Tone, document: w.document, window: w.window };
  vm.createContext(sandbox);
  vm.runInContext(`${audioSource}\nthis.PianoAudio = PianoAudio;`, sandbox);
  w.audio = sandbox.PianoAudio;
  w.hide = () => { w.document.visibilityState = 'hidden'; for (const f of w.docListeners.visibilitychange) f(); };
  w.show = () => { w.document.visibilityState = 'visible'; for (const f of w.docListeners.visibilitychange) f(); };
  return w;
}

test('first-ever unlock never rebuilds', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  assert.equal(w.contexts.length, 1);
  assert.equal(w.setContextCalls.length, 0);
});

test('healthy return leaves the context and samplers alone', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  const built = w.samplers.length;
  w.hide();
  w.show();
  await wait(450); // the health check needs >= 150 ms of a moving clock
  const p = w.audio.unlock();
  assert.equal(w.contexts.length, 1, 'no new Context');
  await p;
  assert.equal(w.setContextCalls.length, 0);
  assert.equal(w.samplers.length, built);
  assert.ok(w.samplers.every((s) => !s.disposed));
});

for (const state of ['suspended', 'interrupted']) {
  test(`return while ${state} rebuilds synchronously on the next unlock`, async () => {
    const w = makeWorld();
    await w.audio.unlock();
    const oldSamplers = [...w.samplers];
    const old = w.initial;
    w.hide();
    old.rawContext.state = state;
    w.show();
    const p = w.audio.unlock(); // not awaited: what follows is the synchronous part
    assert.equal(w.contexts.length, 2, 'new Context created before any await');
    assert.equal(w.setContextCalls.length, 1);
    assert.equal(w.setContextCalls[0], w.contexts[1]);
    assert.ok(oldSamplers.every((s) => s.disposed), 'old samplers disposed');
    assert.equal(old.closed, 1);
    await p; // the rejected close() must not escape
    assert.ok(w.samplers.length > oldSamplers.length, 'main layer rebuilt');
    assert.equal(w.samplers.at(-1).disposed, false);
    await w.audio.playChord(['C4', 'E4', 'G4'], 0.01);
  });
}

test('pageshow with persisted marks the context suspect', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.initial.rawContext.state = 'suspended';
  for (const f of w.winListeners.pageshow) f({ persisted: true });
  const p = w.audio.unlock();
  assert.equal(w.contexts.length, 2);
  await p;
});

test('running but frozen clock after return rebuilds on the next unlock', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.hide();
  w.initial.rawContext.frozenAt = 1;
  w.show();
  await wait(300);
  const p = w.audio.unlock();
  assert.equal(w.contexts.length, 2);
  await p;
});

test('Tone.start() that never settles rejects within the bound, then the next unlock rebuilds', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.startBehaviour = 'hang';
  w.initial.rawContext.state = 'suspended';
  for (const f of w.winListeners.pageshow) f({ persisted: true });
  const began = Date.now();
  await assert.rejects(w.audio.unlock(), /did not wake/);
  const took = Date.now() - began;
  assert.ok(took >= 2000 && took < 4000, `bounded wait, took ${took}ms`);
  assert.equal(w.contexts.length, 2);
  w.startBehaviour = 'resume';
  const p = w.audio.unlock();
  assert.equal(w.contexts.length, 3, 'the following tap rebuilds again');
  await p;
});

test('a start that settles but leaves the context not running is an error', async () => {
  const w = makeWorld({ startBehaviour: 'noop' });
  await assert.rejects(w.audio.unlock(), /did not wake/);
  w.startBehaviour = 'resume';
  const p = w.audio.unlock();
  assert.equal(w.contexts.length, 2, 'rebuilt inside the next tap');
  await p;
});

test('statechange to interrupted while visible rebuilds on the next unlock', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.initial.rawContext.setState('interrupted');
  const p = w.audio.unlock();
  assert.equal(w.contexts.length, 2);
  await p;
  // The listener follows the new context; the old one is no longer watched.
  w.initial.rawContext.setState('suspended');
  const q = w.audio.unlock();
  assert.equal(w.contexts.length, 2, 'old context state changes are ignored');
  await q;
  w.contexts[1].rawContext.setState('interrupted');
  const r = w.audio.unlock();
  assert.equal(w.contexts.length, 3);
  await r;
});

test('a clock stuck from the start, with no page or state event, rebuilds on the next unlock', async () => {
  const w = makeWorld();
  w.initial.rawContext.frozenAt = 0; // reports 'running' once started, but never ticks
  await w.audio.unlock();
  await wait(1700); // past the health window
  const p = w.audio.unlock();
  assert.equal(w.contexts.length, 2);
  await p;
});

test('a quick second unlock on a healthy context does not rebuild', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  await w.audio.unlock(); // e.g. two flower taps in a row, before the check finishes
  assert.equal(w.contexts.length, 1);
  await wait(300);
  await w.audio.unlock();
  assert.equal(w.contexts.length, 1);
});
