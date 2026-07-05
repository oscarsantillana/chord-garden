/*
 * Rainbow Pitch — local persistence.
 *
 * Everything lives on this device only (no accounts, no cloud). We keep one or
 * more child "profiles" so siblings can practise without mixing up progress.
 * Guardians own setup and progress; the child only ever sees practice.
 */

const Store = (() => {
  const KEY = 'rainbow-pitch:v1';

  const DEFAULT_ACTIVE = ['red', 'yellow']; // start with two so there is a real choice
  const DEFAULT_ROUNDS = 20;                // a standard Practice Set

  function freshProfile(name, avatar) {
    return {
      id: 'p_' + Math.random().toString(36).slice(2, 9),
      name: name || 'Little One',
      avatar: avatar || 'fox',
      activeColors: [...DEFAULT_ACTIVE],
      roundsPerSet: DEFAULT_ROUNDS,
      // Per-colour running tallies, used only for guardian progress + readiness.
      stats: {},          // { colorName: { correct, seen } }
      sessions: [],       // [{ ts, rounds, correct, colors:[...] }]
    };
  }

  function defaultData() {
    const first = freshProfile('Little One', 'fox');
    return { activeProfileId: first.id, profiles: [first] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      const data = JSON.parse(raw);
      if (!data.profiles || !data.profiles.length) return defaultData();
      return data;
    } catch (e) {
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

  // Record the outcome of a single round into the active profile's stats.
  function recordRound(colorName, correct) {
    const p = activeProfile();
    const s = p.stats[colorName] || { correct: 0, seen: 0 };
    s.seen += 1;
    if (correct) s.correct += 1;
    p.stats[colorName] = s;
    save();
  }

  // Record a finished (or calmly stopped) Practice Set for guardian progress.
  function recordSession(session) {
    const p = activeProfile();
    p.sessions.unshift(session);
    p.sessions = p.sessions.slice(0, 60); // keep it small
    save();
  }

  return {
    all, save, load,
    activeProfile, setActiveProfile,
    addProfile, removeProfile, updateProfile,
    recordRound, recordSession,
    DEFAULT_ROUNDS,
  };
})();
