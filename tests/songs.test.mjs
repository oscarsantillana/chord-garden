// Chord Garden — tests for js/songs.js (pure flower-song composer).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Songs = require('../js/songs.js');

// name -> top note, straight from the fixed voicings in data.js.
const TOP = { red: 'G4', yellow: 'A4', blue: 'G4', black: 'F4', green: 'B4', orange: 'C5', purple: 'C5', pink: 'D5', brown: 'E5' };
const ORDER = Object.keys(TOP);
const colors = (names) => names.map((name) => ({ name, top: Songs.midi(TOP[name]) }));
const names = (song) => song.map((s) => s.name);

assert.equal(Songs.midi('C4'), 60);
assert.equal(Songs.midi('A4'), 69);
assert.equal(Songs.midi('C#4'), 61);
assert.equal(Songs.midi('Bb3'), 58);
assert.equal(Songs.midi('Eb4'), 63);
assert.equal(Songs.midi('C5'), 72);

// visibleColors mirrors what the sprite draws.
const six = ['red', 'yellow', 'blue', 'black', 'green', 'orange'];
assert.deepEqual(Songs.visibleColors(3, six), []);
assert.deepEqual(Songs.visibleColors(0, ['red']), []);
assert.deepEqual(Songs.visibleColors(4, ['red']), ['red']);
assert.deepEqual(Songs.visibleColors(4, ['red', 'yellow']), ['red', 'yellow']);
assert.deepEqual(Songs.visibleColors(4, ['red', 'yellow', 'blue']), ['red', 'yellow', 'blue']);
assert.deepEqual(Songs.visibleColors(4, six), ['red', 'blue', 'orange']);
assert.deepEqual(Songs.visibleColors(5, six), six);
assert.deepEqual(Songs.visibleColors(5, ['red']), ['red']);
assert.deepEqual(Songs.visibleColors(5, undefined), []);

// compose
assert.deepEqual(Songs.compose([], 'x'), []);
{
  const a = Songs.compose(colors(['yellow', 'blue', 'pink']), '2026-09-01');
  const b = Songs.compose(colors(['yellow', 'blue', 'pink']), '2026-09-01');
  assert.deepEqual(a, b, 'same inputs give the same song');
}
{
  const song = Songs.compose(colors(['red']), 'd');
  assert.deepEqual(names(song), ['red', 'red', 'red', 'red'], 'one colour sings itself four times');
}
{
  // Only the given colours appear; length follows the colour count; ends on home.
  const expectLen = { 1: 4, 2: 4, 3: 5, 4: 6, 5: 6, 6: 6, 7: 6, 8: 6, 9: 6 };
  for (let n = 1; n <= 9; n++) {
    for (const seed of ['a', '2026-01-02', 'zzz', '7']) {
      const given = ORDER.slice(0, n);
      const song = Songs.compose(colors(given), seed);
      assert.equal(song.length, expectLen[n], `${n} colours -> ${expectLen[n]} steps`);
      assert.ok(names(song).every((x) => given.includes(x)), 'only given colours appear');
      assert.equal(song.at(-1).beats, 2, 'last step is held two beats');
      assert.ok(song.every((s) => s.beats === 1 || s.beats === 2), 'every chord lasts one or two beats');
      assert.ok(Songs.RHYTHMS[song.length].some((r) => r.join() === song.map((s) => s.beats).join()), 'a known rhythm');
      assert.equal(song.at(-1).name, 'red', 'ends on the C-major chord');
      if (n >= 3) {
        for (let i = 1; i < song.length; i++) assert.notEqual(song[i].name, song[i - 1].name, 'no back-to-back repeat');
      }
    }
  }
}
{
  // Red and yellow (where every child starts) must not give every flower the
  // same song: across days, both the order and the rhythm vary.
  const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  const songs = days.map((d) => Songs.compose(colors(['red', 'yellow']), d));
  assert.ok(new Set(songs.map((x) => names(x).join())).size >= 2, 'different orders');
  assert.ok(new Set(songs.map((x) => x.map((s) => s.beats).join())).size >= 2, 'different rhythms');
  assert.ok(new Set(songs.map((x) => JSON.stringify(x))).size >= 5, 'several distinct songs');
  assert.ok(songs.every((x) => x.at(-1).name === 'red' && new Set(names(x)).size === 2), 'still both colours, ending on red');
}
{
  // Home preference: red, then orange, then brown.
  assert.equal(Songs.compose(colors(['yellow', 'brown', 'orange']), 's').at(-1).name, 'orange');
  assert.equal(Songs.compose(colors(['yellow', 'blue', 'brown']), 's').at(-1).name, 'brown');
  // No home chord: any given colour may end it, but only given ones appear.
  const song = Songs.compose(colors(['yellow', 'blue', 'pink']), 's');
  assert.ok(names(song).every((x) => ['yellow', 'blue', 'pink'].includes(x)));
}
{
  // Nine colours: exactly six steps, home last, even when the pick is random.
  for (const seed of ['a', 'b', 'c', 'd', 'e']) {
    const song = Songs.compose(colors(ORDER), seed);
    assert.equal(song.length, 6);
    assert.equal(song.at(-1).name, 'red');
    assert.equal(new Set(names(song)).size, 6, 'six different chords');
  }
}
{
  // A new colour joining changes the song's stream; duplicates are ignored.
  const dup = Songs.compose(colors(['red', 'yellow', 'red']), 'd');
  assert.deepEqual(dup, Songs.compose(colors(['red', 'yellow']), 'd'));
}
console.log('ok - songs');
