// Chord Garden — tests for the growing-garden feature: Logic's garden
// helpers (dayKey/plantStage/gardenDays/orderColors), Store's garden
// persistence, and Sprites.plant()'s SVG output.
//
// Same node:vm sandbox loading style as tests/logic.test.mjs and
// tests/app-lifecycle.test.mjs: js/*.js are plain scripts that define
// globals rather than modules, so each context loads them in the same
// order index.html does. Run with `node tests/garden.test.mjs`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');

// A minimal fake localStorage backed by a Map, like app-lifecycle's, so
// Store's load()/save() work without a real browser. `seed` lets a test
// pre-populate it (as if saved on a previous visit) before storage.js runs.
function makeLocalStorage(seed) {
  const map = new Map(seed ? Object.entries(seed) : []);
  return { map, localStorage: { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) } };
}

// Loads data.js + logic.js (+ storage.js when withStore) into a fresh vm
// context. Each call gets its own Store, since Store reads localStorage
// once at load time — tests that need different starting saved data just
// call this again rather than sharing one context.
// vm's contextified sandbox only picks up top-level `var`s automatically;
// js/*.js declare their globals with `const`, so each load is followed by
// `this.X = X` to copy the binding onto the sandbox where the test can see it.
function loadContext({ withStore = true, seed } = {}) {
  const { map, localStorage } = makeLocalStorage(seed);
  const sandbox = { console, localStorage };
  vm.createContext(sandbox);
  vm.runInContext(read('data') + '\nthis.CHORDS = CHORDS;', sandbox);
  vm.runInContext(read('logic') + '\nthis.Logic = Logic;', sandbox);
  if (withStore) vm.runInContext(read('storage') + '\nthis.Store = Store;', sandbox);
  return { saved: map, Logic: sandbox.Logic, CHORDS: sandbox.CHORDS, Store: sandbox.Store };
}

function loadSprites() {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(read('sprites') + '\nthis.Sprites = Sprites;', sandbox);
  return sandbox.Sprites;
}

const countOf = (svg, cls) => (svg.match(new RegExp(`class="${cls}"`, 'g')) || []).length;

// Data returned from code that ran inside the vm sandbox (e.g. an array
// built with `[]` or `Array.from()` inside logic.js/storage.js) comes from
// a different realm than this test file, so it has a different — but
// structurally identical — Array/Object prototype. node:assert/strict's
// deepEqual treats that as unequal ("same structure but not
// reference-equal"), so any such value is normalised into plain host-realm
// data with this before comparing.
function plain(value) {
  // Array.from()/the {} literal below run as HOST code, so — unlike calling
  // .map() straight on a cross-realm array, which inherits that array's own
  // realm via species — they always build a fresh host-realm container.
  if (Array.isArray(value)) return Array.from(value, plain);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = plain(value[k]);
    return out;
  }
  return value;
}

// --- Logic.dayKey ------------------------------------------------------------

{
  const { Logic } = loadContext({ withStore: false });
  assert.equal(Logic.dayKey(new Date(2026, 0, 5, 10, 30).getTime()), '2026-01-05');
  assert.equal(Logic.dayKey(new Date(2026, 10, 9, 23, 59).getTime()), '2026-11-09', 'month and day are zero-padded');
  console.log('ok - Logic.dayKey: local calendar date, zero-padded');
}

// --- Logic.plantStage ---------------------------------------------------------

{
  const { Logic } = loadContext({ withStore: false });
  assert.equal(Logic.plantStage(-1), 0);
  assert.equal(Logic.plantStage(0), 0);
  assert.equal(Logic.plantStage(3), 3);
  assert.equal(Logic.plantStage(5), 5);
  assert.equal(Logic.plantStage(9), 5);
  console.log('ok - Logic.plantStage: clamps sets to a 0-5 stage');
}

// --- Logic.gardenDays ----------------------------------------------------------

{
  const { Logic } = loadContext({ withStore: false });
  const now = new Date(2026, 8, 26, 12, 0).getTime();
  const today = { day: '2026-09-26', sets: 2, colors: ['red'] };
  const yesterday = { day: '2026-09-25', sets: 5, colors: ['red', 'yellow'] };
  const older = { day: '2026-09-20', sets: 1, colors: [] };
  const { today: t, past } = Logic.gardenDays([today, yesterday, older], now);
  assert.equal(t, today);
  assert.deepEqual(plain(past), [yesterday, older], 'past keeps its newest-first order');
  console.log('ok - Logic.gardenDays: splits today from past, preserving order');
}
{
  // Note: gardenDays() returns an object literal built inside the vm
  // context, so it's compared field-by-field below rather than with a
  // single deepEqual against a host-realm object literal — cross-realm
  // plain objects have different (but structurally identical) prototypes,
  // which node's strict deepEqual treats as unequal.
  const { Logic } = loadContext({ withStore: false });
  const now = new Date(2026, 8, 26, 12, 0).getTime();
  let { today, past } = Logic.gardenDays(undefined, now);
  assert.equal(today, null);
  assert.deepEqual(plain(past), []);
  ({ today, past } = Logic.gardenDays(null, now));
  assert.equal(today, null);
  assert.deepEqual(plain(past), []);
  const older = { day: '2026-09-20', sets: 1, colors: [] };
  ({ today, past } = Logic.gardenDays([older], now));
  assert.equal(today, null);
  assert.deepEqual(plain(past), [older]);
  console.log('ok - Logic.gardenDays: tolerates a missing/non-array garden, and no-entry-today');
}

// --- Logic.orderColors ----------------------------------------------------------

{
  const { Logic } = loadContext({ withStore: false });
  // CHORDS order (data.js): red, yellow, blue, ... — dedupes 'red', drops
  // the unknown 'nope', and sorts the rest into that chord order.
  assert.deepEqual(plain(Logic.orderColors(['blue', 'red', 'red', 'yellow', 'nope'])), ['red', 'yellow', 'blue']);
  assert.deepEqual(plain(Logic.orderColors([])), []);
  console.log('ok - Logic.orderColors: de-dupes, sorts by chord order, drops unknown names');
}

// --- Store: fresh profile -------------------------------------------------------

{
  const { Store } = loadContext();
  assert.deepEqual(plain(Store.activeProfile().garden), []);
  console.log('ok - Store: a fresh profile starts with an empty garden');
}

// --- Store: recordSession waters today's plant -----------------------------------

{
  const { Store } = loadContext();
  const p = Store.activeProfile();
  const today = new Date(2026, 8, 26, 9, 0).getTime();
  Store.recordSession({ ts: today, rounds: 20, correct: 18, colors: ['yellow', 'red'] });
  Store.recordSession({ ts: today + 1000, rounds: 20, correct: 20, colors: ['red', 'blue'] });
  assert.equal(p.garden.length, 1, 'two sets on the same day merge into one entry');
  assert.equal(p.garden[0].sets, 2);
  assert.deepEqual(plain(p.garden[0].colors), ['red', 'yellow', 'blue']);
  console.log('ok - Store.recordSession: merges same-day sessions into one garden entry, unioning colours');
}
{
  const { Store, Logic } = loadContext();
  const p = Store.activeProfile();
  const today = new Date(2026, 8, 26, 9, 0).getTime();
  const yesterday = new Date(2026, 8, 25, 9, 0).getTime();
  Store.recordSession({ ts: today, rounds: 20, correct: 20, colors: ['red'] });
  Store.recordSession({ ts: yesterday, rounds: 20, correct: 20, colors: ['blue'] });
  assert.equal(p.garden.length, 2, 'a session on a different local day gets its own entry');
  assert.deepEqual(plain(p.garden.map((e) => e.day)).sort(), [Logic.dayKey(yesterday), Logic.dayKey(today)].sort());
  console.log('ok - Store.recordSession: a session on a different day creates a separate garden entry');
}

// --- Store: resetProgress clears the garden ---------------------------------------

{
  const { Store } = loadContext();
  const p = Store.activeProfile();
  Store.recordSession({ ts: Date.now(), rounds: 20, correct: 20, colors: ['red'] });
  assert.equal(p.garden.length, 1);
  Store.resetProgress(p.id);
  assert.deepEqual(plain(p.garden), [], 'the garden is progress too');
  console.log('ok - Store.resetProgress: clears the garden');
}

// --- Store: backfilling a garden from legacy (pre-garden) saved data ----------------

{
  const day1 = new Date(2026, 8, 20, 9, 0).getTime();
  const day1b = new Date(2026, 8, 20, 15, 0).getTime();
  const day2 = new Date(2026, 8, 22, 10, 0).getTime(); // a later day than day1
  const oldProfile = {
    id: 'p_old1', name: 'Kid', avatar: 'fox',
    activeColors: ['red', 'yellow'], roundsPerSet: 20, realPianoMode: false,
    stats: {},
    sessions: [
      { ts: day2, rounds: 20, correct: 20, colors: ['blue'] },
      { ts: day1b, rounds: 20, correct: 18, colors: ['yellow'] },
      { ts: day1, rounds: 20, correct: 20, colors: ['red'] },
    ],
    events: [],
    // deliberately no `garden` — this is a v4-shaped save from before the
    // growing-garden feature existed
  };
  const oldData = { version: 4, activeProfileId: oldProfile.id, profiles: [oldProfile], pin: '2468' };
  const { Store, Logic } = loadContext({ seed: { 'rainbow-pitch:v1': JSON.stringify(oldData) } });
  const p = Store.activeProfile();
  assert.equal(p.garden.length, 2, 'one entry per local day that had a session');
  assert.equal(p.garden[0].day, Logic.dayKey(day2), 'newest day first');
  assert.equal(p.garden[0].sets, 1);
  assert.deepEqual(plain(p.garden[0].colors), ['blue']);
  assert.equal(p.garden[1].day, Logic.dayKey(day1));
  assert.equal(p.garden[1].sets, 2, 'two sessions the same older day merge into one entry');
  assert.deepEqual(plain(p.garden[1].colors), ['red', 'yellow']);
  console.log('ok - Store: old saved data without a garden is backfilled from sessions on load');
}

// --- Store: flagPictures defaults and normalises --------------------------------

{
  const { Store } = loadContext();
  assert.equal(Store.activeProfile().flagPictures, true, 'a fresh profile defaults to pictures on');
  console.log('ok - Store: a fresh profile starts with flagPictures true');
}
{
  const oldProfile = {
    id: 'p_old2', name: 'Kid', avatar: 'fox',
    activeColors: ['red', 'yellow'], roundsPerSet: 20, realPianoMode: false,
    stats: {}, sessions: [], events: [], garden: [],
    // deliberately no `flagPictures` — a v5-shaped save from before this toggle existed
  };
  const oldData = { version: 5, activeProfileId: oldProfile.id, profiles: [oldProfile], pin: '2468' };
  const { Store } = loadContext({ seed: { 'rainbow-pitch:v1': JSON.stringify(oldData) } });
  assert.equal(Store.activeProfile().flagPictures, true, 'saved data without the field normalises to true');
  console.log('ok - Store: old saved data without flagPictures normalises to true');
}

// --- Sprites.flag: the picture option ----------------------------------------------

{
  const Sprites = loadSprites();
  const { CHORDS } = loadContext({ withStore: false });
  const red = CHORDS.find((c) => c.name === 'red'); // apple shape

  const withPicture = Sprites.flag(red);
  assert.ok(withPicture.includes('<circle cx="50" cy="66" r="27"'), 'default includes the apple picture group');
  assert.ok(withPicture.includes('scale(0.46)'));
  assert.ok(withPicture.includes(`fill="${red.swatch}"`), 'and still carries the swatch fill');

  const plain = Sprites.flag(red, { picture: false });
  assert.equal(plain.includes('<circle cx="50" cy="66" r="27"'), false, 'picture: false leaves out the apple picture group');
  assert.equal(plain.includes('scale(0.46)'), false);
  assert.ok(plain.includes(`fill="${red.swatch}"`), 'the swatch fill is unchanged');
  console.log('ok - Sprites.flag: { picture: false } leaves out the picture group but keeps the swatch');
}

// --- Sprites.plant: petal counts ----------------------------------------------------

{
  const Sprites = loadSprites();
  const expected = { 1: 6, 2: 6, 3: 6, 4: 8, 5: 5, 6: 6, 9: 9, 10: 10, 14: 14 };
  Object.entries(expected).forEach(([n, count]) => {
    const swatches = Array.from({ length: Number(n) }, (_, i) => `#${String(i + 1).padStart(6, '0')}`);
    const svg = Sprites.plant(5, swatches);
    assert.equal(countOf(svg, 'petal'), count, `n=${n}`);
  });
  console.log('ok - Sprites.plant: bloom petal counts for n=1,2,3,4,5,6,9,10,14 colours');
}

// --- Sprites.plant: stages 0-3 have no petals ---------------------------------------

{
  const Sprites = loadSprites();
  [0, 1, 2, 3].forEach((stage) => {
    const svg = Sprites.plant(stage, ['#e6304b']);
    assert.equal(countOf(svg, 'petal'), 0, `stage ${stage}`);
  });
  console.log('ok - Sprites.plant: stages 0-3 (not yet bloomed) have no petals');
}

// --- Sprites.plant: stage 4 bud-tip counts ------------------------------------------

{
  const Sprites = loadSprites();
  const two = Sprites.plant(4, ['#e6304b', '#ffd21e']);
  assert.equal(countOf(two, 'bud-tip'), 2, '2 colours -> 2 tips');
  const nine = Sprites.plant(4, Array.from({ length: 9 }, (_, i) => `#${String(i + 1).padStart(6, '0')}`));
  assert.equal(countOf(nine, 'bud-tip'), 3, '9 colours -> collapses to 3 tips');
  console.log('ok - Sprites.plant: stage 4 shows 2 bud-tips for 2 colours, 3 for 9 colours');
}

// --- Sprites.plant: stage 5 includes every practised swatch -------------------------

{
  const Sprites = loadSprites();
  const svg = Sprites.plant(5, ['#e6304b', '#ffd21e']);
  assert.ok(svg.includes('#e6304b'), 'red swatch present');
  assert.ok(svg.includes('#ffd21e'), 'yellow swatch present');
  console.log('ok - Sprites.plant: stage 5 bloom contains every practised colour swatch');
}

// --- Sprites.plant: stage is clamped -------------------------------------------------

{
  const Sprites = loadSprites();
  const over = Sprites.plant(7, ['#e6304b']);
  assert.ok(countOf(over, 'petal') > 0, 'stage clamps up to 5 (bloom)');
  const under = Sprites.plant(-1, ['#e6304b']);
  assert.equal(countOf(under, 'petal'), 0);
  assert.ok(under.includes('plant-soil'), 'still draws the plot');
  assert.equal(under.includes('plant-stem'), false, 'stage clamps down to 0 (unplanted, no stem)');
  console.log('ok - Sprites.plant: stage is clamped to 0-5');
}

// --- Sprites.icon: can -----------------------------------------------------------------

{
  const Sprites = loadSprites();
  assert.ok(Sprites.icon('can').includes('can-water'));
  console.log('ok - Sprites.icon: can icon includes the can-water fill rect');
}

console.log('\nAll garden.test.mjs assertions passed.');
