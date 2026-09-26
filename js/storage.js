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
  const VERSION = 7; // bumped: added top-level `language` and `noteNames` device preferences

  const DEFAULT_ACTIVE = ['red', 'yellow']; // start with two so there is a real choice
  const DEFAULT_ROUNDS = 20;                // a standard Practice Set
  const DEFAULT_PIN = '2468';               // demo gate only — not real security
  const DEFAULT_NAME = () => (typeof I18n !== 'undefined' ? I18n.t('child.defaultName') : 'Little One');

  function freshProfile(name, avatar) {
    return {
      id: 'p_' + Math.random().toString(36).slice(2, 9),
      name: name || DEFAULT_NAME(),
      avatar: avatar || 'fox',
      activeColors: [...DEFAULT_ACTIVE],
      roundsPerSet: DEFAULT_ROUNDS,
      realPianoMode: false, // guardian-only toggle; Home/Practice is unchanged when false
      flagPictures: true, // guardian-only toggle; plain colour flags when false
      // Per-colour running tallies, used only for guardian progress + readiness.
      stats: {},          // { colorName: { correct, seen } }
      sessions: [],       // [{ ts, rounds, correct, colors:[...] }]
      events: [],         // [{ c: target, a: answered, ok, ts }] newest-first, for Logic
      // One entry per local day with at least one saved Practice Set, newest
      // day first: { day: 'YYYY-MM-DD', sets, colors: [...] }. That day's
      // plant never wilts once it's in here — see js/logic.js's gardenDays.
      garden: [],
    };
  }

  function defaultData() {
    const first = freshProfile(DEFAULT_NAME(), 'fox');
    return {
      version: VERSION, activeProfileId: first.id, profiles: [first], pin: DEFAULT_PIN,
      language: 'auto',   // whole-device preference, like the PIN — not per child
      noteNames: 'auto',  // ditto; see js/i18n.js for what 'auto' resolves to
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

  // Bring older saved shapes up to date in place: add anything a newer
  // version of the app would have written, without touching what's already
  // there. Runs silently on every load so old localStorage never gets lost.
  function normalise(data) {
    data.profiles.forEach((p) => {
      if (!Array.isArray(p.events)) p.events = [];
      if (typeof p.realPianoMode !== 'boolean') p.realPianoMode = false;
      if (typeof p.flagPictures !== 'boolean') p.flagPictures = true;
      // storage.js loads after logic.js (see index.html's script order), so
      // Logic.* is safe to call here and in recordSession below.
      if (!Array.isArray(p.garden)) p.garden = gardenFromSessions(p.sessions);
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
    updateProfile(id, { stats: {}, sessions: [], events: [], garden: [] }); // the garden is progress too
  }

  // Colour set mutations go through the store (not direct array pokes on the
  // profile object) so every write path funnels through save().
  function addColor(name) {
    const p = activeProfile();
    if (!p.activeColors.includes(name)) p.activeColors.push(name);
    save();
  }

  function removeColor(name) {
    const p = activeProfile();
    p.activeColors = p.activeColors.filter((n) => n !== name);
    save();
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
    p.events.unshift({ c: colorName, a: answeredColorName, ok: correct, ts: Date.now() });
    p.events = p.events.slice(0, 500); // keep it small, like sessions below
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
    p.events = p.events.slice(0, 500);
    save();
  }

  // Record a finished (or calmly stopped) Practice Set for guardian progress,
  // and water that day's plant: find or start today's garden entry, add one
  // set, and fold in whatever colours this set practised (see js/logic.js's
  // Growing garden helpers for dayKey/orderColors/plantStage).
  function recordSession(session) {
    const p = activeProfile();
    p.sessions.unshift(session);
    p.sessions = p.sessions.slice(0, 60); // keep it small
    const day = Logic.dayKey(typeof session.ts === 'number' ? session.ts : Date.now());
    let entry = p.garden.find((e) => e.day === day);
    if (!entry) {
      entry = { day, sets: 0, colors: [] };
      p.garden.unshift(entry);
    }
    entry.sets += 1;
    entry.colors = Logic.orderColors([...entry.colors, ...(session.colors || [])]);
    p.garden = p.garden.slice(0, 365); // keep it small, like sessions above
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

  return {
    all,
    activeProfile, setActiveProfile,
    addProfile, removeProfile, updateProfile, resetProgress,
    addColor, removeColor,
    recordRound, recordSession, recordRealPianoRound,
    getPin, setPin,
    getLanguage, setLanguage, getNoteNames, setNoteNames,
    DEFAULT_PIN,
  };
})();
