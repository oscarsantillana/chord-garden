/*
 * Rainbow Pitch — Eguchi method decision logic.
 *
 * Pure functions only: data in, result out, no Store/DOM access. That keeps
 * them usable both as the `Logic` browser global (loaded before storage.js)
 * and straight in Node for testing.
 *
 * Why a rolling window instead of a lifetime average? A toddler who fumbles
 * "red" for their first two weeks but has nailed it every time since would
 * still show a mediocre LIFETIME accuracy — the early mistakes never wash
 * out, so readiness could stay stuck at "not yet" long after the colour is
 * actually known. Looking only at the most recent N attempts means readiness
 * reflects how the child is doing right now, not how they did when they were
 * just starting out.
 */

const Logic = {
  // Last `windowSize` events for one colour, newest first (events are already
  // stored newest-first, so this is just a filter + slice).
  //
  // `e.src !== 'mic'` excludes real-piano-detected rounds from the core
  // readiness/accuracy signal — a mic misread would otherwise silently
  // corrupt "is this colour known well enough to add the next one", and
  // real-piano detection accuracy hasn't been validated the way the digital
  // (app-chosen, Tone.js-played) path has. Absent `src` (every digital
  // event) already means "counts", so this is a pure no-op against any
  // existing/legacy events.
  recentEvents(events, colorName, windowSize) {
    const matches = events.filter((e) => e.c === colorName && e.src !== 'mic');
    return windowSize == null ? matches : matches.slice(0, windowSize);
  },

  // Rolling accuracy for one colour over its last `windowSize` attempts.
  // pct is null (not 0) when nothing has been seen yet, so callers can tell
  // "no data" apart from "seen and got it all wrong".
  recentAccuracy(events, colorName, windowSize = 20) {
    const recent = Logic.recentEvents(events, colorName, windowSize);
    const seen = recent.length;
    const correct = recent.filter((e) => e.ok).length;
    return { seen, correct, pct: seen ? Math.round((correct / seen) * 100) : null };
  },

  // Ready to add the next colour once EVERY active colour has enough recent
  // attempts and a high enough recent accuracy. Profiles with no events yet
  // simply fail the minSeen check, so "not ready" is the safe default.
  readiness(events, activeColors, opts) {
    return Logic.readyColors(events, activeColors, opts).length === activeColors.length;
  },

  // The active colours that individually clear the readiness bar, in their
  // original order — lets the guardian see "4 of 6 ready" instead of only a
  // yes/no, with the same thresholds readiness() itself uses.
  readyColors(events, activeColors, { minSeen = 8, minPct = 90, windowSize = 20 } = {}) {
    return activeColors.filter((name) => {
      const { seen, pct } = Logic.recentAccuracy(events, name, windowSize);
      return seen >= minSeen && pct !== null && pct >= minPct;
    });
  },

  // First-attempt accuracy per local calendar day for the last `days` days,
  // oldest first, ending with the day containing `now`. Days without practice
  // have seen 0 and pct null. Real-piano rounds are excluded, as everywhere
  // else in the core accuracy signal.
  dailyAccuracy(events, { days = 14, now = Date.now() } = {}) {
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    const buckets = Array.from({ length: days }, (_, i) => {
      const start = new Date(end);
      start.setDate(end.getDate() - (days - 1 - i));
      return { start: start.getTime(), seen: 0, correct: 0, pct: null };
    });
    const first = buckets[0].start;
    events.forEach((e) => {
      if (e.src === 'mic' || typeof e.ts !== 'number' || e.ts < first || e.ts > now) return;
      let i = buckets.length - 1;
      while (i > 0 && e.ts < buckets[i].start) i--;
      buckets[i].seen += 1;
      if (e.ok) buckets[i].correct += 1;
    });
    buckets.forEach((b) => { if (b.seen) b.pct = Math.round((b.correct / b.seen) * 100); });
    return buckets;
  },

  // Which wrong-answer pairs happen most, so a grown-up can see e.g. "red is
  // often answered as orange". Sorted by how often the mix-up happens.
  confusions(events, { limit = 5 } = {}) {
    const tally = new Map();
    events.forEach((e) => {
      if (e.ok || e.src === 'mic') return;
      const key = e.c + '>' + e.a;
      const entry = tally.get(key) || { target: e.c, answered: e.a, count: 0 };
      entry.count += 1;
      tally.set(key, entry);
    });
    return Array.from(tally.values()).sort((a, b) => b.count - a.count).slice(0, limit);
  },

  // Pick the next round's target colour, weighted so under-practised colours
  // come up more often. A colour just added by a grown-up has near-zero
  // recent reps and needs front-loaded exposure to catch up to the others —
  // without this, a 9-colour veteran would drown out a brand-new colour and
  // it would take forever to imprint. Well-practised colours (recentSeen >=
  // minSeen) sit at the baseline weight of 1, so the mix still feels random
  // once everything is known.
  pickWeighted(colors, events, rand = Math.random, { windowSize = 30, minSeen = 6 } = {}) {
    const recent = events.filter((e) => e.src !== 'mic').slice(0, windowSize);
    const weights = colors.map((c) => {
      const recentSeen = recent.filter((e) => e.c === c.name).length;
      return 1 + Math.max(0, minSeen - recentSeen);
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = rand() * total;
    for (let i = 0; i < colors.length; i++) {
      r -= weights[i];
      if (r < 0) return colors[i];
    }
    return colors[colors.length - 1]; // floating-point safety net
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
