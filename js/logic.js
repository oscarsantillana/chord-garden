/*
 * Chord Garden — Eguchi method decision logic.
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

  // The next colour to introduce: the first one in introduction order that
  // isn't active yet, or null once the child has them all. Kept here (not in
  // app.js) so the Home dot, the badge and the grown-up tabs all agree.
  nextColor(activeColors, order) {
    return order.find((name) => !activeColors.includes(name)) || null;
  },

  // The colour a profile is ready to be given next, or null when it isn't
  // ready (or has nothing left to add). Same bar as the Colours tab's card.
  readyForNext(profile, order) {
    const active = profile.activeColors || [];
    const next = Logic.nextColor(active, order);
    if (!next || !Logic.readiness(profile.events || [], active)) return null;
    return next;
  },

  // Profiles whose grown-up hasn't yet been shown that a given next colour is
  // ready. `readySeen` remembers the colour they were shown, so the alert
  // returns only when a NEW next colour becomes ready, never for the same one.
  unseenReadiness(profiles, order) {
    const alerts = [];
    profiles.forEach((p) => {
      const next = Logic.readyForNext(p, order);
      if (next && next !== p.readySeen) alerts.push({ id: p.id, next });
    });
    return alerts;
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

  // Trim a newest-first history (events or sessions, each with a numeric
  // `ts` in ms) by age, not just count: the Progress charts look back 14
  // days, and at ~100 rounds a day a fixed count of 500 forgot most of them.
  // Keeps everything from the last `days` days, but never fewer than the
  // newest `min` items (so readiness still has data after a break) and never
  // more than `max` (a bound on localStorage size). Items without a numeric
  // `ts` survive only inside the `min`.
  keepRecent(list, { days, min = 0, max = Infinity, now = Date.now() } = {}) {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const kept = [];
    for (let i = 0; i < list.length && i < max; i++) {
      const ts = list[i] && list[i].ts;
      if (i < min || (typeof ts === 'number' && ts >= cutoff)) kept.push(list[i]);
      else if (typeof ts === 'number') break; // newest-first: the rest are older still
    }
    return kept;
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

  // Practice Sets played per local calendar day for the last `days` days,
  // oldest first — the "about 5 short sets a day" cadence the method asks
  // for. Uses the same day boundaries as dailyAccuracy().
  dailySets(sessions, { days = 14, now = Date.now() } = {}) {
    const buckets = Logic.dailyAccuracy([], { days, now }).map((b) => ({ start: b.start, sets: 0 }));
    const first = buckets[0].start;
    sessions.forEach((s) => {
      if (typeof s.ts !== 'number' || s.ts < first || s.ts > now) return;
      let i = buckets.length - 1;
      while (i > 0 && s.ts < buckets[i].start) i--;
      buckets[i].sets += 1;
    });
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

  // ---- Growing garden -----------------------------------------------------
  // Every saved Practice Set waters that day's plant (see js/storage.js
  // recordSession). These helpers turn that raw garden data into what the
  // Home/garden screens draw; they know nothing about Store or the DOM.

  // The LOCAL calendar date a timestamp falls on, as 'YYYY-MM-DD'. Never
  // toISOString() — that's UTC, and a chord practised late in the evening
  // must water TODAY's plant, not tomorrow's just because UTC has already
  // rolled over.
  dayKey(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  // The first local day on which a colour would have cleared the readiness
  // bar, replaying stored events oldest-first (real-piano rounds ignored, as
  // in readyColors). For each attempt we ask readyColors itself, over just
  // the newest `windowSize` events up to that point, so "ready" has one
  // definition and this can't drift from the Colours tab. Returns null if it
  // never got there. `events` is newest-first; events with no numeric `ts`
  // can't be placed on a day, so they are skipped.
  firstReadyDay(events, colorName, opts = {}) {
    const windowSize = opts.windowSize || 20;
    const chrono = (events || [])
      .filter((e) => e && e.c === colorName && e.src !== 'mic' && typeof e.ts === 'number')
      .reverse();
    for (let k = 1; k <= chrono.length; k++) {
      const window = chrono.slice(Math.max(0, k - windowSize), k).reverse(); // newest-first, like p.events
      if (Logic.readyColors(window, [colorName], opts).length) return Logic.dayKey(chrono[k - 1].ts);
    }
    return null;
  },

  // Rebuild the per-day practice history from what older saves still hold:
  // sets per day from the garden, and first-attempt tallies from the recent
  // events (each stored event is one first attempt). Real-piano events go
  // into `m`, kept apart from `t` as everywhere else. Newest day first.
  // Shape: { day, sets, t: { colour: [tries, right] }, m?: { ... } }.
  historyFromSaved(garden, events) {
    const byDay = new Map();
    const entryFor = (day) => {
      if (!byDay.has(day)) byDay.set(day, { day, sets: 0, t: {} });
      return byDay.get(day);
    };
    (Array.isArray(garden) ? garden : []).forEach((g) => {
      if (g && typeof g.day === 'string') entryFor(g.day).sets += Number(g.sets) || 0;
    });
    (Array.isArray(events) ? events : []).forEach((e) => {
      if (!e || typeof e.c !== 'string' || typeof e.ts !== 'number') return;
      const entry = entryFor(Logic.dayKey(e.ts));
      let bucket = entry.t;
      if (e.src === 'mic') bucket = entry.m = entry.m || {};
      const tally = bucket[e.c] || (bucket[e.c] = [0, 0]);
      tally[0] += 1;
      if (e.ok) tally[1] += 1;
    });
    return Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
  },

  // When each colour was added and first became ready, reconstructed from
  // the garden and recent events. Covers the active colours plus any colour
  // seen in either. These are estimates (only ~15 days of events survive),
  // so each entry lists its estimated fields in `approx`: `added` always (the
  // first day seen, up to a year back), `ready` too when replaying the
  // events found one (for a colour known before them, that's only "ready by
  // then"). A `ready` set later, live, is exact. A colour never seen gets
  // `today`.
  colorDatesFromSaved(garden, events, activeColors, today) {
    const first = new Map(); // colour -> earliest day seen
    const see = (c, day) => {
      if (typeof c !== 'string' || !day) return;
      if (!first.has(c) || day < first.get(c)) first.set(c, day);
    };
    (Array.isArray(garden) ? garden : []).forEach((g) => {
      if (g) (g.colors || []).forEach((c) => see(c, g.day));
    });
    (Array.isArray(events) ? events : []).forEach((e) => {
      if (e && typeof e.ts === 'number') see(e.c, Logic.dayKey(e.ts));
    });
    const names = new Set([...(activeColors || []), ...first.keys()]);
    const out = {};
    names.forEach((c) => {
      const ready = Logic.firstReadyDay(events, c);
      out[c] = { added: first.get(c) || today, ready, approx: ready ? ['added', 'ready'] : ['added'] };
    });
    return out;
  },

  // Sets played in a day -> how grown that day's plant is. Clamped so a
  // marathon day still reads as a full bloom (5) instead of overflowing the
  // sprite stages Sprites.plant knows how to draw.
  plantStage(sets) {
    return Math.max(0, Math.min(5, Math.floor(sets) || 0));
  },

  // Split a garden (newest first) into today's entry (growing right now) and
  // every other day (settled on the hill forever). Tolerates a missing or
  // malformed garden — e.g. a profile normalise() hasn't reached yet — by
  // treating it as empty rather than throwing.
  gardenDays(garden, now = Date.now()) {
    const list = Array.isArray(garden) ? garden : [];
    const key = Logic.dayKey(now);
    const today = list.find((entry) => entry && entry.day === key) || null;
    const past = list.filter((entry) => entry !== today);
    return { today, past };
  },

  // De-duplicate colour names and sort them into the fixed order chords are
  // introduced in (CHORDS' declaration order in data.js) — the order a
  // bloom's petals should read in, and the order any other colour list
  // should read in too. Unknown names are dropped, not sorted last, since
  // there's no swatch to draw them with anyway.
  orderColors(names) {
    const list = Array.isArray(names) ? names : [];
    if (typeof CHORDS === 'undefined') return Array.from(new Set(list));
    const index = new Map(CHORDS.map((c, i) => [c.name, i]));
    return Array.from(new Set(list))
      .filter((n) => index.has(n))
      .sort((a, b) => index.get(a) - index.get(b));
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
