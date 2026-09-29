/*
 * Chord Garden — flag layout maths.
 *
 * Pure functions only: numbers in, numbers out, no DOM access. app.js
 * measures the screen and paints; this file only decides sizes and shapes,
 * which keeps it usable as the `Layout` browser global (loaded after
 * logic.js) and straight in Node for testing.
 *
 * Why terraces? The hills behind every child screen are fixed, but a crowd
 * of flags wraps into several rows. Only the bottom row can stand on the
 * front hill, so each extra row gets its own low ridge (a terrace) to stand
 * on instead of hanging in the sky.
 */

const Layout = {
  // Largest flag that fits n flags into width x height, trying each column
  // count at the flag's own proportions (aspect = width / height). Ties go to
  // more columns (wider, shorter layouts). Capped at maxH so two colours on a
  // tablet don't become billboards, and floored at minH so a crowded screen
  // never shrinks flags below a tappable size.
  fitFlags(n, width, height, { maxH, minH, gapX, gapY, aspect }) {
    // No room for even one row at the minimum size means the measurement is
    // off (iPad Safari can report a half-rotated screen). The search below
    // would then favour MORE rows, since every candidate is negative and
    // dividing by more rows makes it less so: a row of flags came out as a
    // column of the smallest ones. Use the fewest rows the width allows.
    if (height < minH) {
      const perRow = Math.floor((width + gapX) / (minH * aspect + gapX));
      const fitCols = Math.max(1, Math.min(n, perRow));
      const cols = Math.ceil(n / Math.ceil(n / fitCols));
      return { cols, h: minH, w: Math.floor(minH * aspect) };
    }
    const fit = (cols) => {
      const rows = Math.ceil(n / cols);
      return Math.min(maxH,
        (height - gapY * (rows - 1)) / rows,
        (width - gapX * (cols - 1)) / cols / aspect);
    };
    let best = { cols: 1, h: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const h = fit(cols);
      if (h >= best.h) best = { cols, h };
    }
    // Then even the rows out (9 flags as 5 + 4, not 8 + 1): the same number
    // of rows with fewer columns gives each flag more width, so this never
    // makes the flags smaller.
    const cols = Math.ceil(n / Math.ceil(n / best.cols));
    const h = Math.max(minH, Math.floor(Math.max(best.h, fit(cols))));
    return { cols, h, w: Math.floor(h * aspect) };
  },

  // The distinct row baselines from every flag's pole base (px from the top
  // of the viewport), sorted top (back) to bottom (front). Bases within
  // `tolerance` px count as one row, since flags in a row differ by a pixel
  // or two (rounding, the entrance animation).
  flagRows(bottoms, tolerance = 6) {
    const rows = [];
    [...bottoms].sort((a, b) => a - b).forEach((b) => {
      if (!rows.length || b - rows[rows.length - 1] > tolerance) rows.push(b);
    });
    return rows;
  },

  // SVG path for one terrace under a row whose pole bases are at `base`. The
  // ridge sits 2px above the base at both edges and rises further in the
  // middle, so it stays at or above every pole base across the full width.
  terracePath(base, width, height) {
    const r = (v) => Math.round(v * 10) / 10;
    const y = base - 4;
    return `M0 ${r(y + 2)} C${r(width * 0.28)} ${r(y - 22)} ${r(width * 0.72)} ${r(y - 22)} ${r(width)} ${r(y + 2)} L${r(width)} ${r(height)} L0 ${r(height)} Z`;
  },

  // How "near" row i of k is: 0 for the back row, 1 for the front row. The
  // back row takes the far hill's colour and the front row the near hill's.
  terraceShade(i, k) {
    return k <= 1 ? 1 : i / (k - 1);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Layout;
