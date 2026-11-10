import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// iOS can leave the Web Audio context suspended, interrupted, frozen or
// unresumable after the app is backgrounded. These tests drive js/audio.js's
// recovery with a fake Tone whose raw context state and clock we control.

const audioSource = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeWorld({ startBehaviour = 'resume', mediaDevices = true } = {}) {
  const w = {
    contexts: [],
    samplers: [],
    setContextCalls: [],
    startBehaviour,
    docListeners: {},
    winListeners: {},
    deviceListeners: [],
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
    resume() {
      this.resumeCalls = (this.resumeCalls || 0) + 1;
      if (this.resumeWorks) this.state = 'running';
      return this.resumeWorks === false ? Promise.reject(new Error('no resume')) : Promise.resolve();
    }
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
  w.navigator = mediaDevices ? { mediaDevices: { addEventListener(type, fn) { if (type === 'devicechange') w.deviceListeners.push(fn); } } } : {};
  w.deviceChange = () => { for (const f of w.deviceListeners) f(); };
  const sandbox = { console, setTimeout, clearTimeout, Date, Promise, Tone, document: w.document, window: w.window, navigator: w.navigator };
  vm.createContext(sandbox);
  vm.runInContext(`${audioSource}\nthis.PianoAudio = PianoAudio;`, sandbox);
  w.audio = sandbox.PianoAudio;
  // One finger tap: touchend then click, each handled in the capture phase.
  w.tap = () => {
    for (const type of ['touchend', 'click']) for (const f of w.docListeners[type] || []) f({ type });
  };
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

test('a tap while suspect rebuilds and restarts the context without unlock()', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  const old = w.initial;
  const oldSamplers = [...w.samplers];
  old.rawContext.setState('interrupted'); // mid-set, page stays visible
  for (const f of w.docListeners.click) f({ type: 'click' }); // a flag tap, no unlock()
  assert.equal(w.contexts.length, 2, 'new Context created synchronously in the tap');
  assert.equal(w.setContextCalls[0], w.contexts[1]);
  assert.ok(oldSamplers.every((s) => s.disposed));
  await wait(20);
  assert.equal(w.contexts[1].rawContext.state, 'running', 'new context was started');
  const before = w.samplers.length;
  assert.ok(before > oldSamplers.length, 'new sampler kicked off by the tap');
  let played = 0;
  const trigger = w.samplers.at(-1).triggerAttackRelease;
  w.samplers.at(-1).triggerAttackRelease = function () { played += 1; return trigger.apply(this, arguments); };
  await w.audio.playChord(['C4', 'E4', 'G4'], 0.01);
  assert.equal(played, 1, 'the chord reached the new sampler');
  assert.equal(w.samplers.length, before, 'no extra sampler built');
});

test('a chord requested after a gesture rebuild in the same tap still plays', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.initial.rawContext.setState('suspended');
  w.tap();
  const p = w.audio.playChord(['C4', 'E4', 'G4'], 0.01); // the tap's own onclick
  await p;
  let played = 0;
  w.samplers.at(-1).triggerAttackRelease = () => { played += 1; };
  await w.audio.playChord(['C4'], 0.01);
  assert.equal(played, 1);
});

test('a tap on a healthy context does not rebuild', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.tap();
  await wait(20);
  assert.equal(w.contexts.length, 1);
  assert.equal(w.setContextCalls.length, 0);
});

test('touchend and click from one tap rebuild only once', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.initial.rawContext.setState('interrupted');
  w.tap();
  assert.equal(w.contexts.length, 2);
  await wait(20);
  w.contexts[1].rawContext.setState('suspended'); // even if the new one looks bad at once
  w.tap();
  assert.equal(w.contexts.length, 2, 'second event of the same tap is ignored');
});

test('a failed restart leaves the next tap to try again', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.initial.rawContext.setState('interrupted');
  w.startBehaviour = 'noop';
  w.tap();
  await wait(20);
  assert.equal(w.contexts.length, 2);
  await wait(650); // a separate tap, past the same-tap guard
  w.startBehaviour = 'resume';
  w.tap();
  assert.equal(w.contexts.length, 3);
});

test('a tap before the first unlock does nothing', async () => {
  const w = makeWorld();
  w.tap();
  assert.equal(w.contexts.length, 1);
});

test('unlock in the same tap finds the context already repaired', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.initial.rawContext.setState('interrupted');
  w.tap();
  const p = w.audio.unlock();
  assert.equal(w.contexts.length, 2, 'only one rebuild for the tap');
  await p;
});

test('returning to the page tries resume() on a non-running context', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.hide();
  w.initial.rawContext.state = 'suspended';
  w.initial.rawContext.resumeWorks = true;
  w.show();
  assert.equal(w.initial.rawContext.resumeCalls, 1);
  await wait(450);
  w.tap();
  assert.equal(w.contexts.length, 1, 'resume worked, so nothing is rebuilt');
});

test('a resume() that rejects is swallowed and the tap rebuilds', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.hide();
  w.initial.rawContext.state = 'interrupted';
  w.initial.rawContext.resumeWorks = false;
  w.show();
  assert.equal(w.initial.rawContext.resumeCalls, 1);
  await wait(20);
  w.tap();
  assert.equal(w.contexts.length, 2);
});

test('a chord on a non-running context marks it for rebuild on the next tap', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  await wait(300); // let the start-up health check settle
  w.initial.rawContext.state = 'suspended'; // no statechange event reaches us
  await w.audio.playChord(['C4', 'E4', 'G4'], 0.01);
  w.tap();
  assert.equal(w.contexts.length, 2);
});

test('a chord on a running context with a frozen clock marks it for rebuild', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  await wait(300);
  w.initial.rawContext.frozenAt = 1;
  await w.audio.playChord(['C4'], 0.01);
  await wait(1700);
  w.tap();
  assert.equal(w.contexts.length, 2);
});

test('a constant stream of chords does not starve the health check', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  await wait(300);
  w.initial.rawContext.frozenAt = 1;
  const until = Date.now() + 1800;
  while (Date.now() < until) { await w.audio.playChord(['C4'], 0.01); await wait(30); }
  w.tap();
  assert.equal(w.contexts.length, 2, 'the check reached its verdict despite constant chords');
});

test('devicechange after start rebuilds on the next tap even if the context looks healthy', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  await wait(300); // healthy, clock ticking
  w.deviceChange();
  await wait(450); // a health check would have cleared suspect by now
  assert.equal(w.initial.rawContext.state, 'running');
  w.tap();
  assert.equal(w.contexts.length, 2);
  await wait(20);
  await w.audio.playChord(['C4'], 0.01);
  await wait(450);
  w.tap();
  assert.equal(w.contexts.length, 2, 'the rebuilt context is trusted again once healthy');
});

test('devicechange during an in-flight health check cannot clear the rebuild flag', async () => {
  const w = makeWorld();
  await w.audio.unlock(); // starts a health check
  w.deviceChange();
  await wait(450);
  w.tap();
  assert.equal(w.contexts.length, 2);
});

test('devicechange before the piano has started does nothing', async () => {
  const w = makeWorld();
  w.deviceChange();
  await w.audio.unlock();
  await wait(300);
  w.tap();
  assert.equal(w.contexts.length, 1);
});

test('devicechange on a non-running context tries resume()', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  w.initial.rawContext.state = 'suspended';
  w.deviceChange();
  assert.equal(w.initial.rawContext.resumeCalls, 1);
});

test('missing navigator.mediaDevices is tolerated', async () => {
  const w = makeWorld({ mediaDevices: false });
  await w.audio.unlock();
  assert.equal(w.deviceListeners.length, 0);
});

test('unplug mid-set: statechange then the next flag tap rebuilds and chords play on the new sampler', async () => {
  const w = makeWorld();
  await w.audio.unlock();
  await wait(300);
  w.initial.rawContext.setState('suspended'); // unplugged
  w.tap(); // flag tap
  assert.equal(w.contexts.length, 2);
  let played = 0;
  const chord = w.audio.playChord(['C4', 'E4', 'G4'], 0.01); // same tap's handler
  await chord;
  w.samplers.at(-1).triggerAttackRelease = () => { played += 1; };
  await w.audio.playChord(['D4'], 0.01); // next round
  assert.equal(played, 1);
  assert.ok(w.samplers.at(-1) !== w.samplers[0] && !w.samplers.at(-1).disposed);
  assert.equal(w.samplers.filter((s) => !s.disposed).length, 1, 'only the new sampler is live');
});
