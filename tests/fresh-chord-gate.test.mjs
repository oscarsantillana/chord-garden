import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FreshChordGate = require('../js/fresh-chord-gate.js');

{
  const heard = [];
  let timedOut = 0;
  const gate = FreshChordGate.create({
    onHeard: (result) => heard.push(result),
    onLowConfidence: () => { timedOut += 1; },
  });

  for (let frame = 0; frame < 20; frame++) {
    gate.pushFrame({
      at: frame * 120,
      energy: 1 - frame * 0.02,
      positiveFlux: 0,
      result: {
        silence: false,
        best: { name: 'red' },
        confidence: 0.99,
      },
    });
  }
  gate.timeout();

  assert.deepEqual(heard, [], 'a sustained or decaying confident tail must not count as a fresh chord');
  assert.equal(timedOut, 1, 'a tail-only listen should end with one gentle retry');
  console.log('ok - fresh chord gate: sustained confident tail never completes a round');
}

{
  const heard = [];
  let ready = 0;
  let onsetAt = null;
  const gate = FreshChordGate.create({
    onHeard: (result) => heard.push(result.best.name),
    onLowConfidence: () => assert.fail('fresh attack should not time out'),
    onReady: () => { ready += 1; },
    onOnset: (at) => { onsetAt = at; },
  });
  const blue = {
    silence: false,
    best: { name: 'blue' },
    confidence: 0.92,
  };

  for (let frame = 0; frame < 3; frame++) {
    gate.pushFrame({ at: frame * 120, energy: 1, positiveFlux: 0, result: blue });
    assert.equal(ready, frame === 2 ? 1 : 0, 'ready must fire only after the complete calm baseline');
  }
  gate.pushFrame({ at: 360, energy: 1.8, positiveFlux: 0.5, result: blue });
  gate.pushFrame({ at: 480, energy: 1.7, positiveFlux: 0.04, result: blue });
  gate.pushFrame({ at: 600, energy: 1.6, positiveFlux: 0.03, result: blue });
  gate.pushFrame({ at: 720, energy: 1.5, positiveFlux: 0.02, result: blue });

  assert.deepEqual(heard, ['blue'], 'one fresh attack must complete exactly once after stable agreement');
  assert.equal(ready, 1, 'the initial baseline should arm the listener exactly once');
  assert.equal(onsetAt, 360, 'the gate should expose the actual spectral-onset time');
  assert.equal(gate.getState(), 'DONE');
  console.log('ok - fresh chord gate: a fresh stable attack completes exactly once');
}

{
  const heard = [];
  let timedOut = 0;
  const gate = FreshChordGate.create({
    onHeard: (result) => heard.push(result.best.name),
    onLowConfidence: () => { timedOut += 1; },
    captureMs: 400,
  });
  const noise = { silence: false, best: null, confidence: 0 };
  const redTail = {
    silence: false,
    best: { name: 'red' },
    confidence: 0.99,
  };

  for (let frame = 0; frame < 3; frame++) {
    gate.pushFrame({ at: frame * 100, energy: 1, positiveFlux: 0, result: noise });
  }
  gate.pushFrame({ at: 300, energy: 2, positiveFlux: 0.8, result: noise });
  gate.pushFrame({ at: 800, energy: 1.1, positiveFlux: 0, result: noise });
  gate.pushFrame({ at: 900, energy: 1.0, positiveFlux: 0, result: redTail });
  gate.pushFrame({ at: 1000, energy: 0.9, positiveFlux: 0, result: redTail });
  gate.pushFrame({ at: 1100, energy: 0.8, positiveFlux: 0, result: redTail });
  gate.timeout();

  assert.deepEqual(heard, [], 'a false onset must not arm a later sustained chord tail');
  assert.equal(timedOut, 1);
  console.log('ok - fresh chord gate: an expired false onset cannot arm a later tail');
}

console.log('\nAll fresh-chord-gate.test.mjs assertions passed.');

{
  const heard = [], onsets = [];
  const gate = FreshChordGate.create({ onHeard: result => heard.push(result.best.name), onOnset: at => onsets.push(at) });
  for (const at of [0, 120, 240]) gate.pushFrame({ at, energy: 1, positiveFlux: 0 });
  gate.pushFrame({ at: 360, energy: 2, positiveFlux: .7 }); // Room transient, no chord.
  gate.pushFrame({ at: 960, energy: 1, positiveFlux: 0 });
  const blue = { best: { name: 'blue' }, confidence: .95 };
  gate.pushFrame({ at: 1080, energy: 8, positiveFlux: .9, result: blue });
  gate.pushFrame({ at: 1200, energy: 7.5, positiveFlux: 0, result: blue });
  gate.pushFrame({ at: 1320, energy: 7, positiveFlux: 0, result: blue });
  assert.deepEqual(heard, ['blue'], 'a later fresh piano attack must get its own capture window');
  assert.deepEqual(onsets, [360, 1080]);
}

{
  const heard = [];
  const gate = FreshChordGate.create({ onHeard: result => heard.push(result.best.name) });
  const blue = { best: { name: 'blue' }, confidence: .95 };
  for (const at of [0, 120, 240]) gate.pushFrame({ at, energy: 1, positiveFlux: 0 });
  gate.pushFrame({ at: 360, energy: 3, positiveFlux: .8, result: blue });
  gate.pushFrame({ at: 480, energy: 2.9, positiveFlux: 0, result: blue });
  gate.pushFrame({ at: 600, energy: 8, positiveFlux: .9, result: blue });
  assert.deepEqual(heard, [], 'a restrike must not inherit confident frames from the previous attack');
  gate.pushFrame({ at: 720, energy: 7.5, positiveFlux: 0, result: blue });
  gate.pushFrame({ at: 840, energy: 7, positiveFlux: 0, result: blue });
  assert.deepEqual(heard, ['blue']);
}

{
  let ready = false;
  const heard = [];
  const gate = FreshChordGate.create({ onReady: () => { ready = true; }, onHeard: result => heard.push(result.best.name) });
  // Room noise can have a steady total level while power moves between bins.
  // Its positive spectral flux is not a new piano attack.
  for (let i = 0; i < 8; i++) gate.pushFrame({ at: i * 120, energy: 1 + (i % 2) * .03, positiveFlux: .4 });
  assert.equal(ready, true, 'stationary background noise must allow the listener to become ready');
  assert.deepEqual(heard, []);
  const red = { best: { name: 'red' }, confidence: .9 };
  gate.pushFrame({ at: 960, energy: 4, positiveFlux: .8, result: red });
  gate.pushFrame({ at: 1080, energy: 3.9, positiveFlux: .2, result: red });
  gate.pushFrame({ at: 1200, energy: 3.8, positiveFlux: .2, result: red });
  assert.deepEqual(heard, ['red'], 'a new chord above the background must still pass stable-frame detection');
}
