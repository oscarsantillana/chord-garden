/*
 * Chord Garden — local persistence.
 *
 * Everything lives on this device only (no accounts, no cloud). We keep one or
 * more child "profiles" so siblings can practise without mixing up progress.
 * Guardians own setup and progress; the child only ever sees practice.
 */

const Store = (() => {
  const KEY = 'rainbow-pitch:v1';
  const BACKUP_KEY = 'rainbow-pitch:backup';
  const VERSION = 12; // bumped: events from single-flag rounds carry `solo` (older events lack it and count as rounds with a choice); before that `pianoVariety` (natural piano variety) and the `vr` day tally, and before that `history` and `colorDates`

  const DEFAULT_ACTIVE = ['red', 'yellow']; // start with two so there is a real choice
  const DEFAULT_ROUNDS = 20;                // a standard Practice Set
  const DEFAULT_PIN = '2468';               // demo gate only — not real security
  const DEFAULT_NAME = () => (typeof I18n !== 'undefined' ? I18n.t('child.defaultName') : 'Little One');

  const HISTORY_MAX = 1500; // days

  const todayKey = () => Logic.dayKey(Date.now());

  // { colour: { added: today, ready: null } } for a list of colours.
  function seedColorDates(colors) {
    const today = todayKey();
    const out = {};
    colors.forEach((c) => { out[c] = { added: today, ready: null }; });
    return out;
  }

  function freshProfile(name, avatar) {
    return {
      id: 'p_' + Math.random().toString(36).slice(2, 9),
      name: name || DEFAULT_NAME(),
      avatar: avatar || 'fox',
      activeColors: [...DEFAULT_ACTIVE],
      roundsPerSet: DEFAULT_ROUNDS,
      realPianoMode: false, // guardian-only toggle; Home/Practice is unchanged when false
      flagPictures: true, // guardian-only toggle; plain colour flags when false
      // Natural piano variety (js/audio.js): each chord is played a little
      // differently every time. On for a new child, who never knew the steady
      // sound; older profiles are decided in normalise().
      pianoVariety: true,
      // Per-colour running tallies, used only for guardian progress + readiness.
      stats: {},          // { colorName: { correct, seen } }
      sessions: [],       // [{ ts, rounds, correct, colors:[...] }]
      events: [],         // [{ c: target, a: answered, ok, ts }] newest-first, for Logic
      // One entry per local day with at least one saved Practice Set, newest
      // day first: { day: 'YYYY-MM-DD', sets, colors: [...] }. That day's
      // plant never wilts once it's in here — see js/logic.js's gardenDays.
      garden: [],
      // Long-term record for the grown-up's progress view, newest day first,
      // one entry per local day with any practice:
      //   { day, sets, t: { colour: [tries, right] }, m?: { ... }, vr?: n }
      // t = first attempts on the digital piano, m = real-piano rounds (kept
      // apart, like everywhere else), vr = how many of the digital rounds were
      // played with natural piano variety on (absent = 0), so the progress
      // view can compare before and after. Separate from `garden` because rounds
      // are recorded mid-set, before a set (and so a plant) exists, and the
      // garden is exactly what Home draws. Capped at HISTORY_MAX days.
      history: [],
      // { colour: { added: 'YYYY-MM-DD', ready: 'YYYY-MM-DD' | null } }; dates
      // reconstructed by a migration also list which are estimates, e.g.
      // `approx: ['added']` (see Logic.colorDatesFromSaved).
      colorDates: seedColorDates(DEFAULT_ACTIVE),
      // The "ready for next colour" name a grown-up has already been shown
      // (e.g. 'blue'), so the Home dot and app badge stay quiet until a NEW
      // next colour is ready. null = nothing shown yet.
      readySeen: null,
    };
  }

  function defaultData() {
    const first = freshProfile(DEFAULT_NAME(), 'fox');
    return {
      version: VERSION, activeProfileId: first.id, profiles: [first], pin: DEFAULT_PIN,
      language: 'auto',   // whole-device preference, like the PIN — not per child
      noteNames: 'auto',  // ditto; see js/i18n.js for what 'auto' resolves to
      seenVersion: null,  // ditto; null means "first install" — see js/app.js's boot sequence
      lockDot: true,      // ditto; small dot on Home's lock when a new colour is ready
      iconBadge: false,   // ditto; opt-in app-icon badge, off until a grown-up asks for it
    };
  }

  // Build a garden from legacy sessions (saved before the garden existed):
  // one entry per local day with at least one session, newest day first —
  // so a child who's already been practising opens onto their past days
  // instead of an empty plot.
  function gardenFromSessions(sessions) {
    const byDay = new Map(); // day -> { day, sets, colors: Set }
    (sessions || []).forEach((s) => {
      if (typeof s.ts !== 'number') return; // can't place it on a calendar day
      const day = Logic.dayKey(s.ts);
      const entry = byDay.get(day) || { day, sets: 0, colors: new Set() };
      entry.sets += 1;
      (s.colors || []).forEach((c) => entry.colors.add(c));
      byDay.set(day, entry);
    });
    return Array.from(byDay.values())
      .sort((a, b) => (a.day < b.day ? 1 : -1)) // 'YYYY-MM-DD' sorts chronologically; newest first
      .map((e) => ({ day: e.day, sets: e.sets, colors: Logic.orderColors([...e.colors]) }));
  }

  // Valid language codes are whatever js/i18n.js currently supports (or just
  // 'en'/'es' if it hasn't loaded — storage.js's own script tag can in
  // principle run standalone, e.g. in tests that don't load i18n.js).
  function isValidLanguage(v) {
    if (v === 'auto') return true;
    if (typeof I18n !== 'undefined') return I18n.LANGUAGES.some((l) => l.code === v);
    return v === 'en' || v === 'es';
  }
  function isValidNoteNames(v) { return v === 'auto' || v === 'letters' || v === 'solfege'; }

  function hasPractice(p) {
    return [p.events, p.sessions, p.garden, p.history].some((list) => Array.isArray(list) && list.length > 0)
      || (!!p.stats && typeof p.stats === 'object' && Object.keys(p.stats).length > 0);
  }

  // Bring older saved shapes up to date in place: add anything a newer
  // version of the app would have written, without touching what's already
  // there. Runs silently on every load so old localStorage never gets lost.
  function normalise(data) {
    data.profiles.forEach((p) => {
      // Events saved before `solo` existed carry no mark and can't be told
      // apart, so they stay as they are and count as rounds with a choice.
      if (!Array.isArray(p.events)) p.events = [];
      if (typeof p.realPianoMode !== 'boolean') p.realPianoMode = false;
      if (typeof p.flagPictures !== 'boolean') p.flagPictures = true;
      // A child who already has practice knows the steady sound, so variety
      // stays off until a grown-up chooses it; a child with none starts on.
      if (typeof p.pianoVariety !== 'boolean') p.pianoVariety = !hasPractice(p);
      // storage.js loads after logic.js (see index.html's script order), so
      // Logic.* is safe to call here and in recordSession below.
      if (typeof p.readySeen !== 'string') p.readySeen = null;
      if (!Array.isArray(p.garden)) p.garden = gardenFromSessions(p.sessions);
      // Saved before `history`/`colorDates` existed: rebuild what the garden
      // and the ~15 days of events still tell us. Anything older is gone, so
      // these dates are estimates, listed in each colour's `approx`.
      if (!Array.isArray(p.history)) p.history = Logic.historyFromSaved(p.garden, p.events).slice(0, HISTORY_MAX);
      if (!p.colorDates || typeof p.colorDates !== 'object' || Array.isArray(p.colorDates)) {
        p.colorDates = Logic.colorDatesFromSaved(p.garden, p.events, p.activeColors || [], todayKey());
      }
    });
    // The guardian PIN used to be a hard-coded const in app.js; anything
    // saved before it moved into the store needs one filled in here.
    if (typeof data.pin !== 'string' || !/^\d{4}$/.test(data.pin)) data.pin = DEFAULT_PIN;
    // Whole-device preferences (like the PIN, not per child) added for
    // language/note-name support — missing or invalid values fall back to
    // 'auto' rather than any particular language, same reasoning as the PIN
    // above: an old or corrupted save should never crash, just fall back.
    if (!isValidLanguage(data.language)) data.language = 'auto';
    if (!isValidNoteNames(data.noteNames)) data.noteNames = 'auto';
    // A version string (one this device has already booted into) or null
    // (never recorded / corrupted) — anything else falls back to null,
    // same reasoning as language/noteNames above.
    if (typeof data.seenVersion !== 'string') data.seenVersion = null;
    // Booleans, like the device preferences above: anything else (missing in
    // an older save, or corrupted) falls back to the default.
    if (typeof data.lockDot !== 'boolean') data.lockDot = true;
    if (typeof data.iconBadge !== 'boolean') data.iconBadge = false;
    data.version = VERSION;
    return data;
  }

  // If the stored data can't be used, stash the raw string first — a child's
  // months of progress should never be silently destroyed just because the
  // shape changed or the JSON got mangled.
  function backupRaw(raw) {
    try { localStorage.setItem(BACKUP_KEY, raw); } catch (e) { /* ignore */ }
  }

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      return defaultData();
    }
    if (!raw) return defaultData();
    try {
      const data = JSON.parse(raw);
      if (!data.profiles || !data.profiles.length) throw new Error('unusable shape');
      return normalise(data);
    } catch (e) {
      backupRaw(raw);
      return defaultData();
    }
  }

  let data = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function all() { return data; }

  function activeProfile() {
    return data.profiles.find((p) => p.id === data.activeProfileId) || data.profiles[0];
  }

  function setActiveProfile(id) {
    if (data.profiles.some((p) => p.id === id)) {
      data.activeProfileId = id;
      save();
    }
  }

  function addProfile(name, avatar) {
    const p = freshProfile(name, avatar);
    data.profiles.push(p);
    data.activeProfileId = p.id;
    save();
    return p;
  }

  function removeProfile(id) {
    if (data.profiles.length <= 1) return; // always keep at least one
    data.profiles = data.profiles.filter((p) => p.id !== id);
    if (data.activeProfileId === id) data.activeProfileId = data.profiles[0].id;
    save();
  }

  function updateProfile(id, patch) {
    const p = data.profiles.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    save();
  }

  function resetProgress(id) {
    // The garden, history and colour dates are progress too; colour dates
    // start again from today for the colours now active.
    const p = data.profiles.find((x) => x.id === id);
    updateProfile(id, {
      stats: {}, sessions: [], events: [], garden: [], history: [],
      colorDates: seedColorDates(p ? p.activeColors : []),
    });
  }

  // Colour set mutations go through the store (not direct array pokes on the
  // profile object) so every write path funnels through save().
  function addColor(name) {
    const p = activeProfile();
    if (!p.activeColors.includes(name)) p.activeColors.push(name);
    // Turning a colour off and on again keeps its original dates.
    if (!p.colorDates[name]) p.colorDates[name] = { added: todayKey(), ready: null };
    save();
  }

  function removeColor(name) {
    const p = activeProfile();
    p.activeColors = p.activeColors.filter((n) => n !== name);
    save();
  }

  // Keep the last 15 days of rounds (the Progress charts show 14, and the
  // window starts at local midnight 13 days back, so 15 keeps it whole), but
  // never fewer than the newest 500 (readiness after a break) or more than
  // 3000. An event is ~60 bytes, so 3000 is ~180 KB per child. Sessions
  // (below) follow the same idea: 15 days, at least 60, at most 300.
  function trimEvents(events) {
    return Logic.keepRecent(events, { days: 15, min: 500, max: 3000 });
  }

  // Today's (or the given day's) history entry, created on first use and kept
  // newest-first. The oldest days fall off past HISTORY_MAX: ~160 bytes a day
  // with 9 colours, so about 240 KB at most (~4 years of practice days).
  function historyEntry(p, day) {
    let entry = p.history.find((e) => e.day === day);
    if (!entry) {
      entry = { day, sets: 0, t: {} };
      p.history.push(entry);
      p.history.sort((a, b) => (a.day < b.day ? 1 : -1));
      p.history = p.history.slice(0, HISTORY_MAX);
    }
    return entry;
  }

  function tallyRound(p, bucketName, colorName, correct) {
    const entry = historyEntry(p, todayKey());
    const bucket = entry[bucketName] || (entry[bucketName] = {});
    const tally = bucket[colorName] || (bucket[colorName] = [0, 0]);
    tally[0] += 1;
    if (correct) tally[1] += 1;
  }

  // Record the outcome of a single round: lifetime tallies (guardian's
  // simple fallback/all-time view) plus a per-round event (used by Logic for
  // rolling-window readiness and mix-up analysis).
  function recordRound(colorName, answeredColorName, correct) {
    const p = activeProfile();
    const s = p.stats[colorName] || { correct: 0, seen: 0 };
    s.seen += 1;
    if (correct) s.correct += 1;
    p.stats[colorName] = s;
    // With a single flag every tap is right, so readiness must not count the
    // round as telling chords apart (see Logic.recentEvents).
    const solo = p.activeColors.length < 2;
    const event = { c: colorName, a: answeredColorName, ok: correct, ts: Date.now() };
    if (solo) event.solo = true;
    p.events.unshift(event);
    p.events = trimEvents(p.events);
    tallyRound(p, 't', colorName, correct);
    if (p.pianoVariety) {
      const entry = historyEntry(p, todayKey());
      entry.vr = (entry.vr || 0) + 1;
    }
    // First time this colour clears the readiness bar (the Colours tab's own
    // check). With a single flag every answer is right, so it proves nothing.
    // `solo: false` because readyColors would treat this one-colour question
    // as the listening stage and let earlier single-flag rounds count.
    const dates = p.colorDates[colorName] || (p.colorDates[colorName] = { added: todayKey(), ready: null });
    if (!dates.ready && !solo && Logic.readyColors(p.events, [colorName], { solo: false }).length) {
      dates.ready = todayKey();
    }
    save();
  }

  // Record the outcome of a single REAL-PIANO round (an adult played a chord
  // on an actual piano; ChordDetect/MicCapture guessed which one it heard).
  // Deliberately does NOT touch p.stats — the guardian's lifetime-tally
  // fallback number must not move on the strength of an unproven detector
  // (see js/logic.js's `src !== 'mic'` filters for the matching decision to
  // keep these rounds out of the core readiness/accuracy signal for now).
  function recordRealPianoRound(colorName, answeredColorName, correct, confidence) {
    const p = activeProfile();
    const event = { c: colorName, a: answeredColorName, ok: correct, ts: Date.now(), src: 'mic' };
    if (typeof confidence === 'number') event.conf = Math.round(confidence * 100) / 100;
    p.events.unshift(event);
    p.events = trimEvents(p.events);
    tallyRound(p, 'm', colorName, correct);
    save();
  }

  // Record a finished (or calmly stopped) Practice Set for guardian progress.
  // Only a FINISHED set also waters that day's plant: find or start today's
  // garden entry, add one set, and fold in whatever colours this set practised
  // (see js/logic.js's Growing garden helpers for dayKey/orderColors/
  // plantStage). A stopped set (`early`) is still the grown-up's record, but
  // leaves the garden alone; a child once stopped set after set to grow the
  // flower from a handful of chords, so watering follows finished sets.
  function recordSession(session) {
    const p = activeProfile();
    p.sessions.unshift(session);
    p.sessions = Logic.keepRecent(p.sessions, { days: 15, min: 60, max: 300 });
    const day = Logic.dayKey(typeof session.ts === 'number' ? session.ts : Date.now());
    historyEntry(p, day).sets += 1;
    if (session.early) { save(); return; }
    let entry = p.garden.find((e) => e.day === day);
    if (!entry) {
      entry = { day, sets: 0, colors: [] };
      p.garden.unshift(entry);
    }
    entry.sets += 1;
    entry.colors = Logic.orderColors([...entry.colors, ...(session.colors || [])]);
    p.garden = p.garden.slice(0, 365); // keep it small
    save();
  }

  function getPin() { return data.pin || DEFAULT_PIN; }

  // Guardians can change the PIN from Settings; keep it a plain 4-digit
  // string so the same pin-pad UI that reads it back can stay dead simple.
  function setPin(pin) {
    if (!/^\d{4}$/.test(pin)) return false;
    data.pin = pin;
    save();
    return true;
  }

  // Language and note-name spelling are whole-device preferences (like the
  // PIN above), not per child — a shared device shouldn't switch languages
  // every time a guardian picks a different profile.
  function getLanguage() { return data.language || 'auto'; }
  function setLanguage(pref) {
    if (!isValidLanguage(pref)) return false;
    data.language = pref;
    save();
    return true;
  }
  function getNoteNames() { return data.noteNames || 'auto'; }
  function setNoteNames(pref) {
    if (!isValidNoteNames(pref)) return false;
    data.noteNames = pref;
    save();
    return true;
  }

  // Whole-device switches for the "a new colour is ready" signals (Home's
  // lock dot and the installed app's icon badge) — see js/app.js.
  function getLockDot() { return data.lockDot !== false; }
  function setLockDot(on) {
    data.lockDot = !!on;
    save();
  }
  function getIconBadge() { return data.iconBadge === true; }
  function setIconBadge(on) {
    data.iconBadge = !!on;
    save();
  }

  // The app version (js/app.js's APP_VERSION) this device last booted into —
  // used only to show a one-session "Updated to version N" line in Settings
  // (see js/app.js's boot sequence), never to gate anything.
  function getSeenVersion() { return typeof data.seenVersion === 'string' ? data.seenVersion : null; }
  function setSeenVersion(v) {
    data.seenVersion = typeof v === 'string' ? v : null;
    save();
  }

  // Asks the browser to keep this site's storage instead of evicting it under
  // pressure. Best effort: unsupported browsers, denials and errors are all
  // ignored. Only call it from the grown-up area (Firefox may show a prompt).
  let persistenceAsked = false;
  function requestPersistence() {
    if (persistenceAsked) return Promise.resolve();
    persistenceAsked = true;
    try {
      const storage = typeof navigator === 'object' && navigator ? navigator.storage : null;
      if (!storage || typeof storage.persist !== 'function') return Promise.resolve();
      const already = typeof storage.persisted === 'function' ? Promise.resolve(storage.persisted()) : Promise.resolve(false);
      return already.then((yes) => (yes ? undefined : storage.persist())).then(() => {}, () => {});
    } catch (e) { return Promise.resolve(); }
  }

  return {
    all,
    activeProfile, setActiveProfile,
    addProfile, removeProfile, updateProfile, resetProgress,
    addColor, removeColor,
    recordRound, recordSession, recordRealPianoRound,
    getPin, setPin, requestPersistence,
    getLanguage, setLanguage, getNoteNames, setNoteNames,
    getLockDot, setLockDot, getIconBadge, setIconBadge,
    getSeenVersion, setSeenVersion,
    DEFAULT_PIN,
  };
})();
