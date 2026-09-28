/*
 * Chord Garden — the little songs the flowers sing.
 *
 * Tapping a flower on Home plays a short song made only of that flower's own
 * colours' chords, each in its fixed voicing from data.js (whole chords,
 * never single notes, never re-voiced) — so every sound stays tied to the
 * colour that lit up.
 *
 * Why it sounds like music: the nine core chords are all I, IV and V of C
 * major, and their fixed voicings' top notes (red G4, yellow A4, blue G4,
 * black F4, green B4, orange C5, purple C5, pink D5, brown E5) trace a tune
 * when chords follow each other. Ending on a C-major chord (red = C,
 * orange = C/E, brown = C/G) sounds finished, so a song lands there whenever
 * the flower has one of them.
 *
 * Pure functions only: no DOM, no audio. Each flower's song is fixed — the
 * same inputs always give the same song — because a child learns by
 * repetition. Usable as the `Songs` browser global and straight in Node.
 */

const Songs = {
  // MIDI number for a note name like 'C4', 'C#4', 'Bb3', 'Eb4' (C4 = 60).
  midi(note) {
    const m = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
    if (!m) return NaN;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    const shift = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return (Number(m[3]) + 1) * 12 + base + shift;
  },

  // The colours a plant sprite actually draws (mirrors budTips/bloom in
  // sprites.js): a bloom (stage 5) shows every colour; a bud (stage 4) shows
  // at most three tips — the first, the middle one and the last; younger
  // plants have no coloured parts yet, so they have no song.
  visibleColors(stage, colors) {
    const list = Array.isArray(colors) ? colors : [];
    if (stage >= 5) return list.slice();
    if (stage < 4) return [];
    const n = list.length;
    if (n <= 2) return list.slice();
    const tips = [list[0], list[Math.floor((n - 1) / 2)], list[n - 1]];
    return tips.filter((c, i) => tips.indexOf(c) === i);
  },

  // Build a song: [{ name, beats }].
  //   colors: [{ name, top }] in introduction order (`top` = MIDI of the
  //           voicing's highest note); seed: a string (the flower's day).
  // Steps, all deterministic:
  //  1. Drop duplicate names; none left means no song.
  //  2. A random stream seeded from seed + the colour names, so today's
  //     plant sings a new song when a new colour joins it, never otherwise.
  //  3. `home` is the first C-major chord present (red, orange, brown).
  //  4. The song has 4 to 6 steps: colours + 2, clamped.
  //  5. With more colours than steps, keep `home` plus a random pick of the
  //     rest (still in introduction order).
  //  6. Sort the kept colours by top note, then shape the line: rising,
  //     falling, or an arch (even positions up, odd positions back down).
  //  7. Move `home` to the end so the song comes to rest.
  //  8. The song is the last `steps` items of the line repeated end to end,
  //     so it ends where the line ends and, with three or more colours, never
  //     repeats a chord back to back. Two colours pick one of three orders.
  //  9. A rhythm from RHYTHMS: every chord lasts one or two beats, and the
  //     last is always held for two.
  compose(colors, seed) {
    const seen = new Set();
    const items = [];
    for (const c of colors || []) {
      if (!c || seen.has(c.name)) continue;
      seen.add(c.name);
      items.push(c);
    }
    const n = items.length;
    if (n === 0) return [];
    const rng = Songs._mulberry32(Songs._fnv1a(`${seed}|${items.map((c) => c.name).join(',')}`));
    const home = ['red', 'orange', 'brown'].find((name) => seen.has(name)) || null;
    const steps = Math.min(6, Math.max(4, n + 2));

    let kept = items;
    if (n > steps) {
      const chosen = new Set();
      if (home) chosen.add(home);
      const pool = items.filter((c) => c.name !== home);
      while (chosen.size < steps) {
        const i = Math.floor(rng() * pool.length);
        chosen.add(pool.splice(i, 1)[0].name);
      }
      kept = items.filter((c) => chosen.has(c.name));
    }

    // Array.prototype.sort is stable, so equal top notes keep introduction order.
    const sorted = kept.slice().sort((a, b) => a.top - b.top);
    const shape = Math.floor(rng() * 3);
    let line;
    if (shape === 0) line = sorted;
    else if (shape === 1) line = sorted.slice().reverse();
    else {
      const up = sorted.filter((_, i) => i % 2 === 0);
      const down = sorted.filter((_, i) => i % 2 === 1).reverse();
      line = up.concat(down);
    }
    if (home) line = line.filter((c) => c.name !== home).concat(items.find((c) => c.name === home));

    // The last `steps` items of the line repeated end to end.
    const len = line.length;
    const start = (len - (steps % len)) % len;
    let names = [];
    for (let i = 0; i < steps; i++) names.push(line[(start + i) % len].name);
    // Two colours can only alternate, and every child starts with red and
    // yellow, so without this every early flower would sing the same tune.
    // Let the flower's day pick one of three orders instead (still ending
    // where the line ends, on its C chord when it has one).
    if (len === 2) {
      const [a, b] = [line[0].name, line[1].name];
      const orders = [[a, b, a, b], [b, a, a, b], [a, a, b, b]];
      names = orders[Math.floor(rng() * orders.length)];
    }
    // And a rhythm, so songs with the same chords still differ. Every chord
    // lasts at least a beat, so its sound stays tied to its glowing petals,
    // and the last one is always held.
    const choices = Songs.RHYTHMS[steps];
    const rhythm = choices[Math.floor(rng() * choices.length)];
    return names.map((name, i) => ({ name, beats: rhythm[i] }));
  },

  // Beats per step for each song length; the last chord is always held for 2.
  RHYTHMS: {
    4: [[1, 1, 1, 2], [2, 1, 1, 2], [1, 1, 2, 2]],
    5: [[1, 1, 1, 1, 2], [1, 1, 2, 1, 2], [2, 1, 1, 1, 2]],
    6: [[1, 1, 1, 1, 1, 2], [1, 1, 2, 1, 1, 2], [2, 1, 1, 1, 1, 2]],
  },

  // 32-bit FNV-1a string hash.
  _fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  },

  // Small seeded random stream (mulberry32): returns () => [0, 1).
  _mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Songs;
