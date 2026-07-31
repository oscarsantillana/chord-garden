// Rainbow Pitch — tests for js/logic.js (pure Eguchi decision logic).
//
// No test framework, no deps: plain assertions, run with `node
// tests/logic.test.mjs`. logic.js is CommonJS (`module.exports = Logic`) so
// it can be loaded as the `Logic` browser global too; we pull it in here via
// createRequire since this file itself is ESM (.mjs).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Logic = require('../js/logic.js');

// Build one event the way storage.js does: newest-first, {c: target, a: answered, ok}.
function ev(c, a, ok) {
  return { c, a, ok, ts: 0 };
}

// --- recentAccuracy -------------------------------------------------------

{
  const { seen, pct } = Logic.recentAccuracy([], 'red');
  assert.equal(seen, 0);
  assert.equal(pct, null); // null (not 0) means "no data yet", distinct from "seen and all wrong"
  console.log('ok - recentAccuracy: empty events -> seen 0, pct null');
}

{
  // 25 events for "red", newest-first. The 5 OLDEST are wrong, the 20 most
  // recent (which is exactly the default window) are all correct. A window
  // of 20 must not reach past index 19 and see those old misses.
  const events = [];
  for (let i = 0; i < 20; i++) events.push(ev('red', 'red', true));
  for (let i = 0; i < 5; i++) events.push(ev('red', 'blue', false));
  const { seen, correct, pct } = Logic.recentAccuracy(events, 'red', 20);
  assert.equal(seen, 20);
  assert.equal(correct, 20);
  assert.equal(pct, 100);
  console.log('ok - recentAccuracy: window truncates to most recent N, ignoring older misses');
}

{
  // pct rounding: 2/3 correct -> 66.666...% should round to 67.
  const events = [ev('red', 'red', true), ev('red', 'red', true), ev('red', 'blue', false)];
  const { pct } = Logic.recentAccuracy(events, 'red', 20);
  assert.equal(pct, 67);
  console.log('ok - recentAccuracy: pct rounds to nearest integer');
}

// --- readiness -------------------------------------------------------------

{
  // Only 3 attempts on "red", all correct, but minSeen default is 8 — too
  // little data to trust yet, so readiness must stay false.
  const events = [ev('red', 'red', true), ev('red', 'red', true), ev('red', 'red', true)];
  assert.equal(Logic.readiness(events, ['red']), false);
  console.log('ok - readiness: false when attempts < minSeen, even if all correct');
}

{
  // 10 attempts, only 5 correct (50%) — below the default minPct of 90.
  const events = [];
  for (let i = 0; i < 5; i++) events.push(ev('red', 'red', true));
  for (let i = 0; i < 5; i++) events.push(ev('red', 'blue', false));
  assert.equal(Logic.readiness(events, ['red']), false);
  console.log('ok - readiness: false when recent accuracy < minPct');
}

{
  // The key scenario the rolling window exists for (see logic.js header
  // comment): a child fumbled "red" for their first 30 attempts, but the 20
  // most recent are all correct. A LIFETIME average would be dragged down by
  // the old misses and readiness would wrongly stay "not yet". The rolling
  // window only looks at the last 20, so readiness must be TRUE.
  const events = [];
  for (let i = 0; i < 20; i++) events.push(ev('red', 'red', true)); // newest 20, all correct
  for (let i = 0; i < 30; i++) events.push(ev('red', 'blue', false)); // older 30, all wrong
  assert.equal(Logic.readiness(events, ['red']), true);
  console.log('ok - readiness: true when only the recent window is good, despite bad lifetime history');
}

{
  // Documenting current behaviour, not necessarily "correct" behaviour:
  // Array.prototype.every on an empty array is vacuously true, so a profile
  // with zero active colours reads as "ready". Callers should guard against
  // an empty active-colour list themselves.
  assert.equal(Logic.readiness([], []), true);
  console.log('ok - readiness: vacuously true for an empty activeColors list (documents current behaviour)');
}

// --- confusions --------------------------------------------------------

{
  const events = [
    ev('red', 'orange', false),
    ev('red', 'orange', false),
    ev('red', 'orange', false),
    ev('red', 'yellow', false),
    ev('blue', 'green', false),
    ev('blue', 'green', false),
    ev('red', 'red', true), // correct answers never count as a confusion
  ];
  const confusions = Logic.confusions(events);
  assert.equal(confusions.length, 3);
  // Sorted by count descending: red>orange (3) before blue>green (2) before red>yellow (1).
  assert.deepEqual(confusions[0], { target: 'red', answered: 'orange', count: 3 });
  assert.deepEqual(confusions[1], { target: 'blue', answered: 'green', count: 2 });
  assert.deepEqual(confusions[2], { target: 'red', answered: 'yellow', count: 1 });
  console.log('ok - confusions: aggregates by (target, answered) pair, ignores correct answers, sorts by count desc');
}

{
  const events = [];
  for (let i = 0; i < 4; i++) events.push(ev('a', 'b', false));
  for (let i = 0; i < 3; i++) events.push(ev('c', 'd', false));
  for (let i = 0; i < 2; i++) events.push(ev('e', 'f', false));
  for (let i = 0; i < 1; i++) events.push(ev('g', 'h', false));
  const confusions = Logic.confusions(events, { limit: 2 });
  assert.equal(confusions.length, 2);
  assert.equal(confusions[0].count, 4);
  assert.equal(confusions[1].count, 3);
  console.log('ok - confusions: respects limit option');
}

// --- pickWeighted --------------------------------------------------------

{
  // Colours: "new" (never seen, weight = 1 + minSeen(6) = 7) and "old" (seen
  // 6+ times recently, weight = 1). Total weight = 8. rand() * 8 lands in
  // [0, 7) -> "new", [7, 8) -> "old". Stub rand with fixed values to pin down
  // the exact boundary the implementation uses (r -= weights[i]; r < 0).
  const colors = [{ name: 'new' }, { name: 'old' }];
  const events = [];
  for (let i = 0; i < 6; i++) events.push(ev('old', 'old', true));

  // rand() = 0 -> r = 0; r -= 7 -> -7 < 0 -> picks "new" (first weight slice).
  assert.equal(Logic.pickWeighted(colors, events, () => 0).name, 'new');
  // rand() just under 7/8 -> r just under 7; r -= 7 -> just under 0 -> still "new".
  assert.equal(Logic.pickWeighted(colors, events, () => 6.999 / 8).name, 'new');
  // rand() = 7/8 exactly -> r = 7; r -= 7 -> 0, not < 0 -> falls through to "old".
  assert.equal(Logic.pickWeighted(colors, events, () => 7 / 8).name, 'old');
  // rand() just under 1 -> r just under 8; r -= 7 -> still >= 0 -> "old".
  assert.equal(Logic.pickWeighted(colors, events, () => 0.999).name, 'old');
  console.log('ok - pickWeighted: deterministic picks at exact weight boundaries with a stubbed rand');
}

{
  // Statistical sanity check with a seeded LCG (deterministic, no Math.random)
  // so the test never flakes: an unseen colour has 7x the weight of a
  // well-practised one, so over many draws it should come up much more often.
  let seed = 42;
  function lcgRand() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }
  const colors = [{ name: 'new' }, { name: 'old' }];
  const events = [];
  for (let i = 0; i < 6; i++) events.push(ev('old', 'old', true));

  let newCount = 0;
  const draws = 2000;
  for (let i = 0; i < draws; i++) {
    if (Logic.pickWeighted(colors, events, lcgRand).name === 'new') newCount++;
  }
  const ratio = newCount / draws;
  // Expected ~7/8 = 0.875; allow generous slack for a simple LCG's distribution.
  assert.ok(ratio > 0.7, `expected unseen colour to dominate draws, got ratio ${ratio}`);
  console.log(`ok - pickWeighted: statistical sanity over ${draws} draws (unseen colour ratio ${ratio.toFixed(3)})`);
}

{
  // A single-colour array has nowhere else to go: every draw must return it,
  // regardless of what rand() returns.
  const colors = [{ name: 'only' }];
  assert.equal(Logic.pickWeighted(colors, [], () => 0).name, 'only');
  assert.equal(Logic.pickWeighted(colors, [], () => 0.9999).name, 'only');
  console.log('ok - pickWeighted: single-colour array always returns that colour');
}

console.log('\nAll logic.test.mjs assertions passed.');
