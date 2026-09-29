// Chord Garden — natural piano variety in js/audio.js: the pure chord plan and
// how playback follows it. audio.js is loaded into a vm with a fake Tone, the
// same way tests/audio-output-barrier.test.mjs does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const audioSource = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
const dataSource = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

// A small seeded generator (mulberry32) so the statistics are repeatable.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fake Tone: every Sampler is recorded with its options and calls. Loading is
// automatic (setTimeout 0) or manual (`finish()`). `rand` replaces the
// sandbox's Math.random and `clock` its Date.now, so playback is repeatable.
function load({ autoLoad = true, rand = null, clock = null } = {}) {
  const samplers = [];
  class FakeSampler {
    constructor(options) {
      this.options = options;
      this.volume = { value: 0 };
      this.released = 0;
      this.triggers = [];
      this.finish = () => options.onload();
      samplers.push(this);
      if (autoLoad) setTimeout(options.onload, 0);
    }
    toDestination() { return this; }
    releaseAll() { this.released += 1; }
    triggerAttackRelease(...args) { this.triggers.push(args); }
  }
  const sandbox = {
    console, setTimeout, clearTimeout, URL,
    Date: clock ? class extends Date { static now() { return clock.now; } } : Date,
    document: { currentScript: { src: 'https://example.test/app/js/audio.js' } },
    Tone: {
      Sampler: FakeSampler,
      NoiseSynth: class { constructor() { this.volume = {}; } toDestination() { return this; } },
      async start() {},
      now: () => 10,
    },
  };
  if (rand) {
    // The vm has its own Math; give it one whose random() we control.
    const m = {};
    for (const name of Object.getOwnPropertyNames(Math)) m[name] = Math[name];
    m.random = rand;
    sandbox.Math = m;
  }
  vm.createContext(sandbox);
  vm.runInContext(dataSource + '\nthis.CHORDS = CHORDS;', sandbox);
  vm.runInContext(audioSource + '\nthis.PianoAudio = PianoAudio;', sandbox);
  const layerOf = (s) => /([^/]+)\/$/.exec(s.options.baseUrl)[1];
  const byLayer = (layer) => samplers.find((s) => layerOf(s) === layer);
  return { audio: sandbox.PianoAudio, chords: sandbox.CHORDS, samplers, layerOf, byLayer };
}
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const NOTES = ['C4', 'E4', 'G4'];

test('chordPlan with variety off is exactly today: main, no offsets, no gain', () => {
  const { audio, chords } = load();
  for (const chord of chords) {
    const plan = plain(audio.chordPlan(chord.notes, { variety: false, rand: () => { throw new Error('must not draw'); } }));
    assert.deepEqual(plan, plain({ layer: 'main', notes: chord.notes.map((note) => ({ note, offsetMs: 0, gainDb: 0 })) }));
  }
  assert.equal(audio.chordPlan(NOTES).layer, 'main', 'off is the default');
});

test('chordPlan with variety on: about 50/25/25 layers, the same for every chord', () => {
  const { audio, chords } = load();
  const N = 4000;
  for (const chord of chords) {
    const rand = seeded(7);
    const count = { main: 0, soft: 0, firm: 0 };
    for (let i = 0; i < N; i++) count[audio.chordPlan(chord.notes, { variety: true, rand }).layer] += 1;
    assert.ok(Math.abs(count.main / N - 0.5) < 0.03, `${chord.name} main ${count.main / N}`);
    assert.ok(Math.abs(count.soft / N - 0.25) < 0.03, `${chord.name} soft ${count.soft / N}`);
    assert.ok(Math.abs(count.firm / N - 0.25) < 0.03, `${chord.name} firm ${count.firm / N}`);
  }
  // Independent of the notes: the same random numbers give the same layer,
  // offsets and gains for any chord.
  const a = audio.chordPlan(chords[0].notes, { variety: true, rand: seeded(3) });
  const b = audio.chordPlan(chords[chords.length - 1].notes, { variety: true, rand: seeded(3) });
  assert.equal(a.layer, b.layer);
  assert.deepEqual(plain(a.notes.map((n) => [n.offsetMs, n.gainDb])), plain(b.notes.map((n) => [n.offsetMs, n.gainDb])));
});

test('chordPlan with variety on: offsets in [0, 20] starting at 0, gains within 1.5 dB, notes unchanged', () => {
  const { audio, chords } = load();
  const rand = seeded(11);
  let sawOffset = false, sawGain = false;
  for (let i = 0; i < 2000; i++) {
    const chord = chords[i % chords.length];
    const plan = audio.chordPlan(chord.notes, { variety: true, rand });
    assert.deepEqual(plain(plan.notes.map((n) => n.note)), plain(chord.notes), 'same notes, same order');
    const offsets = plan.notes.map((n) => n.offsetMs);
    assert.equal(Math.min(...offsets), 0, 'the earliest note is at 0');
    for (const o of offsets) { assert.ok(o >= 0 && o <= 20, 'offset ' + o); if (o > 0) sawOffset = true; }
    for (const n of plan.notes) { assert.ok(n.gainDb >= -1.5 && n.gainDb <= 1.5, 'gain ' + n.gainDb); if (n.gainDb !== 0) sawGain = true; }
  }
  assert.ok(sawOffset && sawGain, 'it does vary');
});

test('variety off builds only main and makes the same Tone calls as before', async () => {
  const { audio, samplers, layerOf } = load();
  await audio.unlock();
  await tick();
  assert.deepEqual(samplers.map(layerOf), ['main']);
  assert.equal(samplers[0].options.baseUrl, 'https://example.test/app/assets/piano/v1/main/');
  assert.equal(samplers[0].options.release, 0.3);
  assert.equal(samplers[0].volume.value, -4);
  await audio.playChord(NOTES, 2);
  await audio.playReward(NOTES, 1);
  assert.equal(samplers.length, 1, 'still only main');
  assert.equal(samplers[0].released, 2);
  assert.deepEqual(plain(samplers[0].triggers), [
    [NOTES, 2, 10.05, 1],
    [NOTES, 1, 10.05, 0.75],
  ]);
});

test('variety on: soft and firm are built with their own base URLs, in the background after main', async () => {
  const { audio, samplers, layerOf } = load();
  audio.setVariety(true); // before unlock: nothing to build yet
  assert.equal(samplers.length, 0);
  await audio.unlock();
  await tick();
  assert.deepEqual(samplers.map(layerOf).sort(), ['firm', 'main', 'soft']);
  for (const s of samplers) {
    assert.equal(s.options.baseUrl, `https://example.test/app/assets/piano/v1/${layerOf(s)}/`);
    assert.equal(s.options.release, 0.3);
    assert.equal(s.volume.value, -4);
  }
  // Turning it on after unlock builds them too.
  const later = load();
  await later.audio.unlock();
  await tick();
  assert.equal(later.samplers.length, 1);
  later.audio.setVariety(true);
  assert.deepEqual(later.samplers.map(later.layerOf).sort(), ['firm', 'main', 'soft']);
});

test('variety on: each note goes to the planned layer at its planned offset and velocity', async () => {
  const SEED = 21;
  const { audio, samplers, byLayer } = load({ rand: seeded(SEED) });
  audio.setVariety(true);
  await audio.unlock();
  await tick();
  // The unlock consumed no random numbers, so the plan for the first chord is
  // the one drawn from a fresh stream with the same seed.
  const plan = audio.chordPlan(NOTES, { variety: true, rand: seeded(SEED) });
  await audio.playChord(NOTES, 2);
  const fired = samplers.filter((s) => s.triggers.length);
  assert.equal(fired.length, 1, 'all three notes go to one layer');
  assert.equal(fired[0], byLayer(plan.layer));
  assert.equal(fired[0].triggers.length, 3, 'one call per note');
  plan.notes.forEach((n, i) => {
    const [note, duration, time, velocity] = fired[0].triggers[i];
    assert.equal(note, n.note);
    assert.equal(duration, 2);
    assert.ok(Math.abs(time - (10.05 + n.offsetMs / 1000)) < 1e-9);
    assert.ok(Math.abs(velocity - 10 ** (n.gainDb / 20)) < 1e-9, 'full-velocity chords get the whole ±1.5 dB, uncapped');
  });
});

test('variety on: a reward scales its softer velocity by the planned gain', async () => {
  const { audio, samplers } = load({ rand: seeded(8) });
  audio.setVariety(true);
  await audio.unlock();
  await tick();
  const plan = audio.chordPlan(NOTES, { variety: true, rand: seeded(8) });
  await audio.playReward(NOTES, 1);
  const fired = samplers.find((s) => s.triggers.length);
  plan.notes.forEach((n, i) => {
    assert.ok(Math.abs(fired.triggers[i][3] - 0.75 * 10 ** (n.gainDb / 20)) < 1e-9);
  });
});

test('variety on: until a layer has loaded, chords play on main', async () => {
  const { audio, samplers, layerOf, byLayer } = load({ autoLoad: false, rand: seeded(4) });
  audio.setVariety(true);
  const unlocking = audio.unlock();
  await tick();
  byLayer('main').finish();
  await unlocking; // resolves on main alone
  await tick();
  assert.deepEqual(samplers.map(layerOf).sort(), ['firm', 'main', 'soft'], 'extras were built but have not loaded');
  for (let i = 0; i < 40; i++) await audio.playChord(NOTES, 1);
  assert.equal(byLayer('soft').triggers.length, 0, 'soft is not loaded, so unused');
  assert.equal(byLayer('firm').triggers.length, 0, 'firm is not loaded, so unused');
  assert.equal(byLayer('main').triggers.length, 120, 'all 40 chords x 3 notes on main');
  // Once soft and firm load, they get used.
  byLayer('soft').finish();
  byLayer('firm').finish();
  await tick();
  for (let i = 0; i < 80; i++) await audio.playChord(NOTES, 1);
  assert.ok(byLayer('soft').triggers.length > 0 && byLayer('firm').triggers.length > 0, 'both extra layers are used once loaded');
});

test('a failed extra layer never fails unlock() and its chords fall back to main', async () => {
  const { audio, byLayer } = load({ autoLoad: false, rand: () => 0.6 }); // 0.6 -> soft
  audio.setVariety(true);
  const unlocking = audio.unlock();
  await tick();
  byLayer('main').finish();
  await unlocking;
  byLayer('soft').options.onerror(new Error('offline'));
  await tick();
  await audio.playChord(NOTES, 1);
  assert.equal(byLayer('main').triggers.length, 3, 'planned for soft, played on main');
});

test('a main load failure still rejects unlock() as before', async () => {
  const { audio, samplers } = load({ autoLoad: false });
  const unlocking = audio.unlock();
  await tick();
  samplers[0].options.onerror(new Error('boom'));
  await assert.rejects(unlocking, /failed to load/); // the vm's Error is another realm, so the message is generic
});

test('playing and stopAll release every sampler', async () => {
  const { audio, samplers } = load();
  audio.setVariety(true);
  await audio.unlock();
  await tick();
  assert.equal(samplers.length, 3);
  await audio.playChord(NOTES, 1);
  assert.ok(samplers.every((s) => s.released === 1), 'each is released before the chord');
  audio.stopAll();
  assert.ok(samplers.every((s) => s.released === 2), 'stopAll releases all three');
});

test('held and output times include the largest offset', async () => {
  const clock = { now: 1_000_000 };
  // 0 -> main; offsets 0, 10, 20 ms; gains anything.
  const draws = [0, 0, 0.5, 1];
  let i = 0;
  const { audio } = load({ clock, rand: () => (i < draws.length ? draws[i++] : 0.5) });
  audio.setVariety(true);
  await audio.unlock();
  await tick();
  i = 0;
  await audio.playChord(NOTES, 0.1); // delay 50 + duration 100 (+ spread 20) ms held
  clock.now += 160;
  assert.equal(audio.isChordRinging(), true, 'still held at 160 ms: the last note starts at 70 ms');
  clock.now += 11;
  assert.equal(audio.isChordRinging(), false, 'no longer held after 50 + 100 + 20 ms');

  // Output is silent after the 300 ms release tail on top of that: 470 ms.
  clock.now = 1_000_000 + 469;
  let silent = false;
  const barrier = audio.whenOutputSilent().then(() => { silent = true; });
  await tick(120);
  assert.equal(silent, false, 'not silent at 469 ms');
  clock.now = 1_000_000 + 471;
  await barrier;
  assert.equal(silent, true);
});
