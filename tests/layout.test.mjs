// Chord Garden — tests for js/layout.js (pure flag layout maths).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Layout = require('../js/layout.js');

const PRACTICE = { maxH: 230, minH: 72, gapX: 10, gapY: 18, aspect: 110 / 168 };

// --- fitFlags -------------------------------------------------------------

{
  // Two colours on a tablet hit the maxH cap; one colour on a narrow screen
  // is width-limited. Same numbers the old app.js fitFlags gave.
  const big = Layout.fitFlags(2, 800, 600, PRACTICE);
  assert.equal(big.h, 230);
  assert.equal(big.w, Math.floor(230 * PRACTICE.aspect));
  assert.equal(big.cols, 2); // ties go to more columns
  const narrow = Layout.fitFlags(1, 100, 600, PRACTICE);
  assert.equal(narrow.cols, 1);
  assert.equal(narrow.h, Math.floor(100 / PRACTICE.aspect));
}

{
  // A crowded small screen is floored at minH rather than shrinking further.
  const crowded = Layout.fitFlags(14, 320, 200, PRACTICE);
  assert.equal(crowded.h, 72);
  assert.equal(crowded.w, Math.floor(72 * PRACTICE.aspect));
}

{
  // Rows come out even: on a wide, short space 9 flags make two rows of 5 + 4
  // (the tie-break alone gave 8 + 1) and 14 make 7 + 7 (not 9 + 5), at the
  // same size as before.
  const HOME = { maxH: 82, minH: 40, gapX: 14, gapY: 10, aspect: 110 / 168 };
  const nine = Layout.fitFlags(9, 440, 140, HOME);
  assert.equal(nine.cols, 5);
  assert.equal(nine.h, 65);
  const fourteen = Layout.fitFlags(14, 800, 250, PRACTICE);
  assert.equal(fourteen.cols, 7);
  assert.equal(fourteen.h, 116);
}

{
  // A height with no room for one row (iPad Safari mid-rotation can make the
  // measured space negative) keeps the flags in as few rows as the width
  // allows at the minimum size, never a column of the smallest flags.
  const HOME = { maxH: 82, minH: 40, gapX: 14, gapY: 10, aspect: 110 / 168 };
  for (const height of [-120, 0, 39]) {
    const row = Layout.fitFlags(4, 524, height, HOME);
    assert.equal(row.cols, 4, `height ${height}: one row`);
    assert.equal(row.h, 40);
    assert.equal(row.w, Math.floor(40 * HOME.aspect));
  }
  // Narrow and crowded: as many per row as fit, rows evened out (5 + 4).
  assert.equal(Layout.fitFlags(9, 200, -50, HOME).cols, 5);
  // A real, if small, height still goes through the normal search.
  assert.equal(Layout.fitFlags(4, 524, 40, HOME).cols, 4);
}

// --- flagRows -------------------------------------------------------------

{
  assert.deepEqual(Layout.flagRows([]), []);
  assert.deepEqual(Layout.flagRows([500, 300, 302, 301, 500.5, 400]), [300, 400, 500]);
  assert.deepEqual(Layout.flagRows([100, 110], 6), [100, 110]);
  assert.deepEqual(Layout.flagRows([100, 110], 12), [100]);
}

// --- terracePath ----------------------------------------------------------

{
  const d = Layout.terracePath(400, 390, 800);
  assert.ok(d.startsWith(`M0 ${400 - 2} `));
  assert.ok(d.endsWith('L390 800 L0 800 Z'));
}

// --- terraceShade ---------------------------------------------------------

{
  assert.equal(Layout.terraceShade(0, 3), 0);
  assert.equal(Layout.terraceShade(2, 3), 1);
  assert.equal(Layout.terraceShade(1, 3), 0.5);
  assert.equal(Layout.terraceShade(0, 1), 1);
}

// --- todayPlantWidth / gardenSlots ----------------------------------------

{
  assert.equal(Layout.todayPlantWidth(810), 92);
  assert.equal(Layout.todayPlantWidth(700), 76);
  assert.equal(Layout.todayPlantWidth(640), 64);
}

{
  // A phone shows 4 big flowers up front, a tablet in landscape 8; the back
  // row is half the size and fills the gaps between them.
  const phone = Layout.gardenSlots(390, { gapHalf: 46 });
  assert.equal(phone.front.length, 4);
  assert.equal(phone.front[0].w, 40);
  assert.equal(phone.back.length, 4);
  const tablet = Layout.gardenSlots(1080, { gapHalf: 46 });
  assert.equal(tablet.front.length, 8);
  assert.equal(tablet.front[0].w, 68);
  assert.equal(tablet.front[0].h, 102);
  assert.equal(tablet.back[0].w, 34);
  assert.equal(tablet.back.length, 8);
  assert.equal(Layout.gardenSlots(810, { gapHalf: 46 }).front.length, 6);
}

for (const width of [320, 390, 600, 810, 1080, 1366]) {
  // Slots keep clear of today's plant and the screen edges, and neighbouring
  // flowers (so their tap buttons) never touch; nearest-to-centre comes first.
  const gapHalf = 46;
  const { front, back, pitch } = Layout.gardenSlots(width, { gapHalf });
  for (const row of [front, back]) {
    const xs = row.map((s) => s.x * width);
    row.forEach((s) => {
      const left = s.x * width - s.w / 2;
      const right = s.x * width + s.w / 2;
      assert.ok(left >= -0.001 && right <= width + 0.001, `${width}: on screen`);
      assert.ok(Math.abs(s.x * width - width / 2) - s.w / 2 >= gapHalf, `${width}: clear of today's plant`);
    });
    row.forEach((a, i) => row.slice(i + 1).forEach((b) => {
      assert.ok(Math.abs(a.x - b.x) * width >= a.w + 12 - 0.001, `${width}: spaced`);
    }));
    xs.slice(1).forEach((x, i) => assert.ok(Math.abs(x - width / 2) >= Math.abs(xs[i] - width / 2) - 0.001, `${width}: centre first`));
  }
  // Zigzag: a back flower's centre is never inside a front flower, its whole
  // width stays clear of the front flowers' tap buttons (fully tappable), and
  // it stands at a midpoint between two front grid positions.
  back.forEach((b) => {
    const bx = b.x * width;
    front.forEach((f) => {
      const fx = f.x * width;
      assert.ok(Math.abs(bx - fx) > f.w / 2, `${width}: back centre not behind a front flower`);
      const overlap = Math.max(0, (f.w + b.w) / 2 - Math.abs(bx - fx));
      assert.ok(overlap <= 0.3 * b.w, `${width}: at least 70% of a back flower stays tappable`);
    });
    const units = Math.abs(bx - width / 2) / pitch;
    assert.ok(Math.abs(units - Math.round(units)) < 1e-6, `${width}: between two front grid positions`);
  });
}
