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
