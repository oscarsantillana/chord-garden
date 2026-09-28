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
