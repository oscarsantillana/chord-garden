// Chord Garden — tests for the long-term record Store keeps per child:
// `history` (daily tallies) and `colorDates` (when each colour was added and
// first became ready), plus the version-9 -> 10 migration. Same vm-sandbox
// style and fake clock as tests/garden.test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
const RealDate = Date;
const DAY = 24 * 3600 * 1000;
const at = (m, d, h = 9) => new RealDate(2026, m, d, h, 0).getTime();

// Values built inside the vm come from another realm; round-trip through
// JSON to get plain host-realm data before comparing.
const plain = (v) => JSON.parse(JSON.stringify(v));

function load(seed, startClock = at(8, 26)) {
  const clock = { now: startClock };
  class FakeDate extends RealDate { static now() { return clock.now; } }
  const map = new Map(seed ? Object.entries(seed) : []);
  const localStorage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  const sandbox = { console, localStorage, Date: FakeDate };
  vm.createContext(sandbox);
  vm.runInContext(read('data') + '\nthis.CHORDS = CHORDS;', sandbox);
  vm.runInContext(read('logic') + '\nthis.Logic = Logic;', sandbox);
  vm.runInContext(read('storage') + '\nthis.Store = Store;', sandbox);
  return { Store: sandbox.Store, clock, map };
}

{
  const { Store } = load();
  const p = Store.activeProfile();
  assert.deepEqual(plain(p.history), []);
  assert.deepEqual(plain(p.colorDates), {
    red: { added: '2026-09-26', ready: null }, yellow: { added: '2026-09-26', ready: null },
  });
  Store.recordRound('red', 'red', true);
  Store.recordRound('red', 'yellow', false);
  Store.recordRound('yellow', 'yellow', true);
  Store.recordSession({ ts: at(8, 26), rounds: 3, correct: 2, colors: ['red', 'yellow'] });
  assert.deepEqual(plain(Store.activeProfile().history), [
    { day: '2026-09-26', sets: 1, t: { red: [2, 1], yellow: [1, 1] }, vr: 3 },
  ]);
  console.log('ok - history: rounds and sets land in today\'s entry');
}

{
  const { Store, clock } = load();
  Store.recordRound('red', 'red', true);
  clock.now = at(8, 27);
  Store.recordRound('red', 'red', true);
  // A set stamped on an earlier day slots in without disturbing the order.
  Store.recordSession({ ts: at(8, 20), rounds: 1, correct: 1, colors: ['red'] });
  assert.deepEqual(plain(Store.activeProfile().history).map((e) => [e.day, e.sets]),
    [['2026-09-27', 0], ['2026-09-26', 0], ['2026-09-20', 1]]);
  console.log('ok - history: rounds on two days make two entries, newest first');
}

{
  const { Store, clock } = load();
  const first = at(0, 1, 12);
  for (let i = 0; i < 1503; i++) {
    clock.now = first + i * DAY;
    Store.recordRound('red', 'red', true);
  }
  const h = plain(Store.activeProfile().history);
  assert.equal(h.length, 1500);
  const key = (ts) => {
    const d = new RealDate(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  assert.equal(h[0].day, key(first + 1502 * DAY), 'newest day kept');
  assert.equal(h[1499].day, key(first + 3 * DAY), 'the three oldest days fell off');
  console.log('ok - history: capped at 1500 days');
}

{
  const { Store, clock } = load();
  Store.addColor('blue');
  assert.deepEqual(plain(Store.activeProfile().colorDates.blue), { added: '2026-09-26', ready: null });
  Store.removeColor('blue');
  assert.ok(Store.activeProfile().colorDates.blue, 'removeColor leaves the dates alone');
  clock.now = at(9, 3);
  Store.addColor('blue');
  assert.equal(Store.activeProfile().colorDates.blue.added, '2026-09-26', 're-adding keeps the original date');
  console.log('ok - colorDates: addColor sets added once');
}

{
  const { Store, clock } = load();
  // 7 right on day 1: not yet. The 8th on day 2 clears the bar.
  for (let i = 0; i < 7; i++) Store.recordRound('red', 'red', true);
  assert.equal(Store.activeProfile().colorDates.red.ready, null);
  clock.now = at(8, 27);
  Store.recordRound('red', 'red', true);
  assert.equal(Store.activeProfile().colorDates.red.ready, '2026-09-27');
  clock.now = at(8, 28);
  Store.recordRound('red', 'red', true);
  assert.equal(Store.activeProfile().colorDates.red.ready, '2026-09-27', 'set once, never moved');
  console.log('ok - colorDates: ready is set on the day the bar is first cleared');
}

{
  const { Store } = load();
  Store.updateProfile(Store.activeProfile().id, { activeColors: ['red'] });
  for (let i = 0; i < 10; i++) Store.recordRound('red', 'red', true);
  assert.equal(Store.activeProfile().colorDates.red.ready, null, 'a single flag proves nothing');
  console.log('ok - colorDates: not ready with a single active colour');
}

{
  const { Store } = load();
  for (let i = 0; i < 10; i++) Store.recordRealPianoRound('red', 'red', true, 0.9);
  const p = Store.activeProfile();
  assert.deepEqual(plain(p.history[0]), { day: '2026-09-26', sets: 0, t: {}, m: { red: [10, 10] } });
  assert.equal(p.colorDates.red.ready, null, 'real-piano rounds never set ready');
  Store.recordRound('red', 'red', true);
  assert.equal(plain(Store.activeProfile().history[0]).m.red[0], 10, 'digital rounds leave m alone');
  console.log('ok - history: mic rounds go to m and never set ready');
}

{
  const { Store, clock } = load();
  Store.addColor('blue');
  Store.recordRound('red', 'red', true);
  Store.recordSession({ ts: at(8, 26), rounds: 1, correct: 1, colors: ['red'] });
  clock.now = at(8, 30);
  Store.resetProgress(Store.activeProfile().id);
  const p = Store.activeProfile();
  assert.deepEqual(plain(p.history), []);
  assert.deepEqual(plain(p.colorDates), {
    red: { added: '2026-09-30', ready: null }, yellow: { added: '2026-09-30', ready: null },
    blue: { added: '2026-09-30', ready: null },
  });
  console.log('ok - resetProgress clears history and reseeds colorDates');
}

function v9Save() {
  const ev = (c, ok, ts, src) => ({ c, a: ok ? c : 'x', ok, ts, ...(src ? { src } : {}) });
  // Newest first: a yellow miss, a mic round, then 9 red rights (4 on the
  // 26th, 5 on the 25th).
  const events = [ev('yellow', false, at(8, 26, 11)), ev('red', true, at(8, 26, 10), 'mic')];
  for (let i = 8; i >= 0; i--) events.push(ev('red', true, at(8, i >= 5 ? 26 : 25, 8 + i % 5)));
  return {
    version: 9, activeProfileId: 'k', pin: '2468',
    profiles: [{
      id: 'k', name: 'K', avatar: 'fox', activeColors: ['red', 'yellow', 'blue'], roundsPerSet: 20,
      stats: {}, sessions: [], events,
      garden: [{ day: '2026-09-25', sets: 2, colors: ['red'] }, { day: '2026-09-01', sets: 1, colors: ['green'] }],
    }],
  };
}

{
  const { Store, map } = load({ 'rainbow-pitch:v1': JSON.stringify(v9Save()) });
  const p = Store.activeProfile();
  assert.equal(Store.all().version, 12);
  assert.deepEqual(plain(p.history), [
    { day: '2026-09-26', sets: 0, t: { yellow: [1, 0], red: [4, 4] }, m: { red: [1, 1] } },
    { day: '2026-09-25', sets: 2, t: { red: [5, 5] } },
    { day: '2026-09-01', sets: 1, t: {} },
  ]);
  const cd = plain(p.colorDates);
  assert.deepEqual(cd.red, { added: '2026-09-25', ready: '2026-09-26', approx: ['added', 'ready'] });
  assert.deepEqual(cd.yellow, { added: '2026-09-26', ready: null, approx: ['added'] });
  assert.deepEqual(cd.blue, { added: '2026-09-26', ready: null, approx: ['added'] }, 'never seen: today');
  assert.deepEqual(cd.green, { added: '2026-09-01', ready: null, approx: ['added'] }, 'seen only in the garden');
  console.log('ok - migration: a version-9 save gets approx colour dates and a backfilled history');

  // An already-migrated save loads unchanged.
  Store.recordRound('red', 'red', true); // forces a save
  const before = plain({ h: Store.activeProfile().history, c: Store.activeProfile().colorDates });
  const again = load({ 'rainbow-pitch:v1': map.get('rainbow-pitch:v1') });
  const after = plain({ h: again.Store.activeProfile().history, c: again.Store.activeProfile().colorDates });
  assert.deepEqual(after, before);
  console.log('ok - migration: loading an already-migrated save changes nothing');

  // A migrated colour that becomes ready later gets an exact ready date:
  // only `added` stays an estimate. Yellow has 1 miss; 9 rights make 9/10.
  again.clock.now = at(8, 28);
  for (let i = 0; i < 9; i++) again.Store.recordRound('yellow', 'yellow', true);
  assert.deepEqual(plain(again.Store.activeProfile().colorDates.yellow), { added: '2026-09-26', ready: '2026-09-28', approx: ['added'] });
  console.log('ok - migration: a ready date set later is exact, and approx still lists only added');
}

console.log('\nAll history.test.mjs assertions passed.');

// --- natural piano variety: the pianoVariety setting and the vr tally -------

{
  const { Store } = load();
  assert.equal(Store.activeProfile().pianoVariety, true, 'a fresh profile starts with variety on');
  Store.addProfile('Sib', 'fox');
  assert.equal(Store.activeProfile().pianoVariety, true, 'so does an added child');
  console.log('ok - pianoVariety: new children start with variety on');
}

{
  // vr counts only digital rounds played with variety on.
  const { Store } = load();
  const id = Store.activeProfile().id;
  Store.recordRound('red', 'red', true);
  Store.recordRound('red', 'yellow', false);
  Store.recordRealPianoRound('red', 'red', true, 0.9);
  assert.equal(plain(Store.activeProfile().history[0]).vr, 2, 'mic rounds are not counted');
  Store.updateProfile(id, { pianoVariety: false });
  Store.recordRound('red', 'red', true);
  assert.equal(plain(Store.activeProfile().history[0]).vr, 2, 'rounds with variety off are not counted');
  assert.equal(plain(Store.activeProfile().history[0]).t.red[0], 3);

  const off = load();
  off.Store.updateProfile(off.Store.activeProfile().id, { pianoVariety: false });
  off.Store.recordRound('red', 'red', true);
  off.Store.recordRealPianoRound('red', 'red', true, 0.9);
  assert.ok(!('vr' in plain(off.Store.activeProfile().history[0])), 'absent means 0');
  console.log('ok - history: vr counts digital rounds played with variety on');
}

{
  // A version-10 save: a child with practice keeps the steady sound, one
  // without starts on, and an explicit boolean is respected.
  const profile = (id, extra) => ({
    id, name: id, avatar: 'fox', activeColors: ['red', 'yellow'], roundsPerSet: 20, realPianoMode: false, flagPictures: true,
    stats: {}, sessions: [], events: [], garden: [], history: [],
    colorDates: { red: { added: '2026-09-01', ready: null }, yellow: { added: '2026-09-01', ready: null } },
    readySeen: null, ...extra,
  });
  const v10 = {
    version: 10, activeProfileId: 'none', pin: '2468',
    profiles: [
      profile('none', {}),
      profile('stats', { stats: { red: { correct: 1, seen: 1 } } }),
      profile('events', { events: [{ c: 'red', a: 'red', ok: true, ts: at(8, 25) }] }),
      profile('sessions', { sessions: [{ ts: at(8, 25), rounds: 1, correct: 1, colors: ['red'] }] }),
      profile('garden', { garden: [{ day: '2026-09-25', sets: 1, colors: ['red'] }] }),
      profile('history', { history: [{ day: '2026-09-25', sets: 0, t: {} }] }),
      profile('explicit', { events: [{ c: 'red', a: 'red', ok: true, ts: at(8, 25) }], pianoVariety: true }),
      profile('junk', { pianoVariety: 'yes' }),
    ],
  };
  const { Store } = load({ 'rainbow-pitch:v1': JSON.stringify(v10) });
  const byId = Object.fromEntries(Store.all().profiles.map((p) => [p.id, p.pianoVariety]));
  assert.deepEqual(plain(byId), {
    none: true, stats: false, events: false, sessions: false, garden: false, history: false, explicit: true, junk: true,
  });
  assert.equal(Store.all().version, 12);
  console.log('ok - migration: a version-10 save keeps the steady sound for children who already practise');
}

{
  const { Store } = load();
  const p = Store.activeProfile();
  Store.removeColor('yellow');
  for (let i = 0; i < 12; i++) Store.recordRound('red', 'red', true);
  assert.equal(p.events.length, 12);
  assert.ok(p.events.every((e) => e.solo === true), 'rounds with one flag are marked solo');
  assert.equal(p.colorDates.red.ready, null, 'one flag proves nothing about telling chords apart');

  Store.addColor('yellow');
  Store.recordRound('red', 'red', true);
  assert.equal(p.events[0].solo, undefined, 'rounds with two flags carry no mark');
  assert.equal('solo' in p.events[0], false);
  assert.equal(p.colorDates.red.ready, null, 'solo padding does not stamp ready on the first two-flag round');
  for (let i = 0; i < 7; i++) Store.recordRound('red', 'red', true);
  assert.equal(p.colorDates.red.ready, '2026-09-26', 'eight rounds with a choice do');
  console.log('ok - recordRound marks solo rounds and does not stamp ready from them');
}
