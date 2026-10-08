/*
 * Chord Garden — application logic.
 *
 * Two audiences, one app:
 *   • Child flow  — a playful "practice toy". Big colour buttons, warm piano,
 *     gentle feedback, a calm way to stop, and a happy finish. No scores, no
 *     chord names, no reading required.
 *   • Guardian flow — PIN-gated setup and progress. Choose which colours are
 *     active, add the next colour when the child is ready, see accuracy, manage
 *     child profiles. This is where all the "measurement" language lives.
 */

(() => {
  // The release, as MAJOR.MINOR.PATCH: bump the patch for a fix, the minor
  // for new features, and 1.0.0 once the app is ready. Bump it on EVERY
  // release, together with sw.js's CACHE_NAME, which must carry the same
  // version (tests/version.test.mjs enforces this). Shown in Settings →
  // About and compared against Store's persisted seenVersion at boot, below.
  const APP_VERSION = '0.8.0';
  // Set once at boot (below) when the persisted seenVersion is a different
  // version — i.e. this app session is running right after an update, not a
  // first install. Read by guardianSettings' About section to show
  // "Updated to version N." for the rest of this session only.
  let updatedTo = null;

  // Colours in the order they're introduced (data.js's CHORDS order), for
  // Logic's "what's next" helpers.
  const COLOR_ORDER = CHORDS.map((c) => c.name);

  const AVATARS = Sprites.animals; // custom SVG mascots (see sprites.js)

  const app = document.getElementById('app');

  // ---- tiny DOM helper ---------------------------------------------------
  function el(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return node;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

  // ---- child vs grown-up presentation -------------------------------------
  // Child screens use the playful theme and lock pinch-zoom (little hands
  // zoom by accident); grown-up screens switch to the calm theme (body.adult,
  // see styles.css) and give zoom back, since that's where the reading is.
  const viewportMeta = document.querySelector ? document.querySelector('meta[name="viewport"]') : null;
  const VIEWPORT = {
    child: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
    adult: 'width=device-width, initial-scale=1.0',
  };
  function setMode(mode) {
    if (mode === 'adult') document.body.classList.add('adult');
    else document.body.classList.remove('adult');
    if (viewportMeta) viewportMeta.setAttribute('content', VIEWPORT[mode]);
  }

  // Leaving the celebration (or any screen) shouldn't leave confetti still
  // drifting over the next one.
  function clearConfetti() {
    const layer = document.getElementById('confetti');
    if (layer) clear(layer);
  }

  // A small in-app overlay used instead of window.alert/confirm, which look
  // out of place and block the page. Returns a close() function. Tapping the
  // backdrop or pressing Escape closes it.
  function openOverlay(card) {
    const previous = document.activeElement;
    const backdrop = el('div', {
      class: 'overlay-backdrop',
      onclick: (e) => { if (e.target === backdrop) close(); },
      onkeydown: (e) => { if (e.key === 'Escape') close(); },
    }, card);
    function close() {
      backdrop.remove();
      if (previous && previous.focus) previous.focus();
    }
    document.body.appendChild(backdrop);
    return close;
  }

  function openDialog({ title, body, confirmLabel, danger = false, onConfirm }) {
    let close = () => {};
    const cancel = el('button', { class: 'secondary-btn', onclick: () => close() }, I18n.t('common.cancel'));
    const card = el('div', { class: 'adult dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('h3', { class: 'dialog-title' }, title),
      el('p', { class: 'dialog-body' }, body),
      el('div', { class: 'dialog-actions' },
        cancel,
        el('button', { class: danger ? 'danger-btn' : 'primary-btn', onclick: () => { close(); onConfirm(); } }, confirmLabel)));
    close = openOverlay(card);
    if (cancel.focus) cancel.focus();
  }

  let screenGeneration = 0;
  let pendingMicStart = false;
  let roundSequence = 0;

  function clearScreen() {
    screenGeneration += 1;
    if (pendingMicStart) {
      pendingMicStart = false;
      MicCapture.stop();
    }
    stopFlowerSong(); // a flower's song ends when Home does
    clear(app);
    clearGarden(); // every screen but Home shows the bare hills — see renderHome for where it's filled back in
    clearTerraces();
  }

  async function beginPractice(button, error) {
    const generation = screenGeneration;
    // Only the label changes while the piano loads; the disc stays put.
    const labelEl = button.querySelector('.play-label') || button;
    const label = labelEl.textContent;
    button.disabled = true;
    labelEl.textContent = I18n.t('home.wakingPiano');
    error.hidden = true;
    try {
      await PianoAudio.unlock();
      if (generation !== screenGeneration) return;
      if (Store.activeProfile().realPianoMode) await enterRealPianoMode();
      else startPractice('digital');
    } catch (failure) {
      if (generation !== screenGeneration) return;
      button.disabled = false;
      labelEl.textContent = label;
      error.textContent = failure?.name === 'NotAllowedError'
        ? I18n.t('errors.micNotGranted')
        : I18n.t('errors.pianoOrMicFailed');
      error.hidden = false;
    }
  }

  // Keep the piano in step with the active child's natural-variety setting.
  // Called wherever the active child or the setting can change before a chord
  // plays (boot, Home, practice start, profile changes, the Settings switch).
  function syncPianoVariety() {
    PianoAudio.setVariety(Store.activeProfile().pianoVariety);
  }

  function activeColorObjects() {
    const p = Store.activeProfile();
    return p.activeColors.map((name) => CHORD_BY_NAME[name]).filter(Boolean);
  }

  // Local midnight (not UTC) — "today" should match the day the child is
  // actually living, not wherever UTC happens to be when they play.
  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // How many Practice Sets (finished or calmly stopped) this profile has
  // played since local midnight — used for the child's star row and the
  // guardian's "sets today" line, without either surfacing a raw count to
  // the child.
  function setsToday(p) {
    const start = startOfToday();
    return p.sessions.filter((s) => s.ts >= start).length;
  }

  // =======================================================================
  //  HOME  (Child Start)
  // =======================================================================
  // aria-label text for Sprites.plant's stages 0-5 — see Logic.plantStage.
  // Translated via I18n.t('flower.stage.' + stage) + the flower.today
  // template (see todaysFlowerLabel below), not a plain array lookup.
  function todaysFlowerLabel(stage) {
    return I18n.t('flower.today', { stage: I18n.t('flower.stage.' + stage) });
  }

  // Colour names -> the swatch hex each one draws with, for Sprites.plant's
  // bud tips/petals — same lookup flag() uses, just plural and tolerant of
  // an unknown/missing name (a colour later removed from CHORDS shouldn't
  // blank out a past day's whole flower).
  function swatchesOf(names) {
    return (names || []).map((n) => CHORD_BY_NAME[n]).filter(Boolean).map((c) => c.swatch);
  }

  // The back hill's ridge height (0-340, the hills SVG's own viewBox) at a
  // horizontal fraction of its width — so a garden flower's `bottom` can
  // rest right on the drawn hill instead of a flat line. Mirrors
  // index.html's `.hill-back` path (`M0 90 C90 30 200 40 390 74`) exactly;
  // the two must stay in sync. Bézier x(t) isn't easily invertible, so this
  // samples t in 0..1 and interpolates — x(t)/390 is monotonic across the
  // curve, so a linear search is enough.
  const HILL_BACK = [[0, 90], [90, 30], [200, 40], [390, 74]];
  function backHillY(xFrac) {
    const x = xFrac * 390;
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = HILL_BACK;
    const steps = 64;
    let prevX = x0, prevY = y0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
      const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
      if (x <= px) {
        const span = px - prevX;
        const frac = span > 0 ? (x - prevX) / span : 0;
        return prevY + (py - prevY) * frac;
      }
      prevX = px; prevY = py;
    }
    return y3;
  }

  // Empties the garden layer — every screen but Home shows the bare hills
  // (see clearScreen below). Tolerates the layer not existing (older test
  // sandboxes, or index.html not yet loaded).
  function clearGarden() {
    const layer = document.getElementById('garden');
    if (layer) clear(layer);
    const taps = document.getElementById('garden-taps');
    if (taps) clear(taps);
  }

  const terracesLayer = () => (document.querySelector ? document.querySelector('.scene-terraces') : null);

  // Empties the terraces under wrapped rows of flags. Same tolerance as
  // clearGarden for a missing layer.
  function clearTerraces() {
    const layer = terracesLayer();
    if (layer) layer.innerHTML = '';
  }

  // The landscape-phone Home puts its flags in a right-hand column that
  // already stands on the hill (see styles.css), so it gets no terraces.
  const LANDSCAPE_HOME = '(orientation: landscape) and (max-height: 520px)';
  function isLandscapeHome() {
    return typeof window.matchMedia === 'function' && window.matchMedia(LANDSCAPE_HOME).matches;
  }

  // Safari can delete a website's saved data after about a week without a
  // visit, unless the site runs as a Home Screen app. So on an iPhone/iPad
  // that hasn't been installed yet, grown-ups get a note. iPadOS reports a
  // Mac user agent, hence the touch-points check. Everything is guarded: the
  // test fake DOM has `navigator = {}` and no matchMedia.
  function needsHomeScreenNote() {
    const nav = typeof navigator === 'object' && navigator ? navigator : {};
    const ua = String(nav.userAgent || '');
    const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
    if (!isIos) return false;
    const standalone = nav.standalone === true
      || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
    return !standalone;
  }

  // The hills are fixed but flags wrap into rows, and only the bottom row
  // can stand on the front hill. When there are two or more rows, paint one
  // low terrace under each (back row in the far hill's colour, front row in
  // the near hill's, rows between blended) so no row hangs in the sky. With
  // a single row the hills already do the job, so the layer stays empty.
  // Measured from the flags' real positions, so call it after layout settles.
  function drawTerraces() {
    const layer = terracesLayer();
    if (!layer) return;
    layer.innerHTML = '';
    if (typeof app.querySelectorAll !== 'function') return;
    let flags = [];
    if (app.querySelector('.home')) {
      if (isLandscapeHome()) return;
      flags = app.querySelectorAll('.today-swatch');
    } else if (app.querySelector('.practice')) {
      flags = app.querySelectorAll('.color-btn');
    }
    const first = flags[0];
    if (!first || typeof first.getBoundingClientRect !== 'function') return;
    const rows = Layout.flagRows(Array.from(flags, (f) => f.getBoundingClientRect().bottom));
    if (rows.length < 2) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (!W || !H) return;
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // Two layers per row instead of color-mix(): an unsupported fill would
    // paint black, while stacking the near hill's colour at partial opacity
    // over the far hill's degrades to a plain far-hill terrace.
    layer.innerHTML = rows.map((base, i) => {
      const d = Layout.terracePath(base, W, H);
      const shade = Layout.terraceShade(i, rows.length);
      return `<path d="${d}" style="fill:var(--hill-back)" />` +
        (shade > 0 ? `<path d="${d}" style="fill:var(--hill-front)" fill-opacity="${shade.toFixed(2)}" />` : '');
    }).join('');
  }

  // Draws every PAST day's plant along the back hill (today's plant lives in
  // .today-plant on the home screen itself, not here — see renderHome).
  // Flowers are placed by percentage of #garden, which is styled to match
  // .scene-hills exactly (see styles.css), because the hills stretch
  // non-uniformly with the viewport; percentages of that box are what keep
  // a flower sitting on the ridge at any width.
  function renderGarden(p) {
    clearGarden();
    const layer = document.getElementById('garden');
    if (!layer) return;
    const tapLayer = document.getElementById('garden-taps');
    const { past } = Logic.gardenDays(p.garden);
    if (!past.length) return;
    const width = window.innerWidth || 390;
    const n = Math.max(4, Math.floor(width / 36));
    // One slot per hill position, nearest-to-centre first, skipping the gap
    // reserved for today's plant (centred in #app).
    const slots = [];
    for (let i = 0; i < n; i++) {
      const xFrac = (i + 0.5) / n;
      if (Math.abs(xFrac - 0.5) * width < 50) continue;
      slots.push(xFrac);
    }
    slots.sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
    past.slice(0, slots.length).forEach((day, i) => {
      const xFrac = slots[i];
      const y = backHillY(xFrac);
      const stage = Logic.plantStage(day.sets);
      const spot = `left:${(xFrac * 100).toFixed(2)}%;bottom:calc(${((340 - y) / 340 * 100).toFixed(2)}% - 4px)`;
      const flower = el('div', {
        class: 'garden-flower', style: spot,
        html: Sprites.plant(stage, swatchesOf(day.colors)),
      });
      layer.appendChild(flower);
      // #garden sits behind the page and can't be tapped, so a button of the
      // same size on top of it (in #garden-taps) makes the flower sing. It's
      // as decorative as the scenery: out of the tab order and unlabelled
      // (the flags already give tap-to-hear).
      if (tapLayer) {
        tapLayer.appendChild(el('button', {
          class: 'flower-tap', tabindex: '-1', style: spot,
          onclick: () => playFlowerSong(flower, Songs.visibleColors(stage, day.colors), day.day),
        }));
      }
    });
  }

  // A flower's tap button must never steal a tap meant for a control, so once
  // Home's layout has settled, hide any that overlap one of Home's buttons
  // (Play, flags, avatar chip, lock, today's plant). Needs real layout.
  function hideBlockedFlowerTaps() {
    const layer = document.getElementById('garden-taps');
    if (!layer || typeof layer.querySelectorAll !== 'function' || !app.querySelector('.home')) return;
    const taps = layer.querySelectorAll('.flower-tap');
    taps.forEach((t) => { t.hidden = false; });
    const first = taps[0];
    if (!first || typeof first.getBoundingClientRect !== 'function') return;
    const controls = Array.from(app.querySelectorAll('button'), (b) => b.getBoundingClientRect());
    taps.forEach((t) => {
      const r = t.getBoundingClientRect();
      if (controls.some((c) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top)) t.hidden = true;
    });
  }

  // --- Flower songs --------------------------------------------------------
  // Tapping a flower on Home plays its own song: whole chords in their fixed
  // voicings (Songs.compose), one per beat. While each chord sounds, that
  // colour's petals stay bright and the flower's others fade back, so every
  // chord stays tied to its colour. Nothing else on screen reacts.
  const BEAT_MS = 480;
  let songTimers = [];
  let songFlower = null;
  let songPlaying = false;
  let songSerial = 0;

  const petalsOf = (flower) => (flower && flower.querySelectorAll ? Array.from(flower.querySelectorAll('.petal, .bud-tip')) : []);

  // Bright petals of `swatch`'s colour, dim the rest (no swatch: restore all).
  function glowPetals(flower, swatch) {
    petalsOf(flower).forEach((petal) => {
      const same = !swatch || (petal.getAttribute('fill') || '').toLowerCase() === swatch;
      petal.setAttribute('fill-opacity', same ? '1' : '.3');
    });
  }

  function stopFlowerSong() {
    endEcho(false); // a game that is running ends with the song, whatever stopped it
    songSerial += 1;
    songTimers.forEach((t) => clearTimeout(t));
    songTimers = [];
    if (songFlower) {
      glowPetals(songFlower, null);
      songFlower.classList.remove('singing');
      songFlower.classList.remove('wiggle');
      songFlower = null;
    }
    if (songPlaying) {
      songPlaying = false;
      PianoAudio.stopAll();
    }
  }

  // Plays `song` on `target`, one chord per step, glowing that colour's
  // petals. `lead` delays the first chord (while a grown flower rises).
  function singSong(target, song, serial, generation, lead, onEnd) {
    songFlower = target;
    songPlaying = true;
    target.classList.add('singing');
    let at = lead;
    song.forEach((step, i) => {
      const chord = CHORD_BY_NAME[step.name];
      const last = i === song.length - 1;
      const seconds = step.beats * BEAT_MS / 1000 + (last ? 0.8 : 0.1);
      const sound = () => {
        if (serial !== songSerial || generation !== screenGeneration) return;
        glowPetals(target, chord.swatch);
        PianoAudio.playChord(chord.notes, seconds).catch(() => {});
      };
      if (at === 0) sound();
      else songTimers.push(setTimeout(sound, at));
      at += step.beats * BEAT_MS;
    });
    songTimers.push(setTimeout(() => {
      if (serial !== songSerial || generation !== screenGeneration) return;
      songPlaying = false; // the last chord rings out on its own
      onEnd();
    }, at + 300));
  }

  async function playFlowerSong(flower, colorNames, seed) {
    stopFlowerSong();
    const serial = songSerial;
    const generation = screenGeneration;
    const names = (colorNames || []).filter((n) => CHORD_BY_NAME[n]);
    if (!names.length) {
      // A seed, sprout or leafy plant has no colours yet: a silent wiggle.
      songFlower = flower;
      flower.classList.add('wiggle');
      songTimers.push(setTimeout(() => {
        if (serial === songSerial) stopFlowerSong();
      }, 500));
      return;
    }
    // Best-effort like the Home flag taps: a piano that hasn't loaded stays silent.
    try { await PianoAudio.unlock(); } catch (e) { /* no-op */ }
    if (serial !== songSerial || generation !== screenGeneration) return;
    const song = Songs.compose(names.map((n) => ({
      name: n, top: Math.max(...CHORD_BY_NAME[n].notes.map(Songs.midi)),
    })), seed);
    // The echo game needs a real choice (two colours or more) and every chord
    // of the melody on today's flags, so the child can play it back.
    const songNames = song.map((step) => step.name);
    const game = new Set(songNames).size >= 2 && songNames.every((n) => homeFlagNames.includes(n));
    if (!game) {
      singSong(flower, song, serial, generation, 0, () => stopFlowerSong());
      return;
    }
    const g = {
      source: flower, flower, song, names: songNames, tracker: Songs.tracker(songNames),
      awake: new Set(), listening: false, pendingReplay: false, won: false,
      layer: null, fromTransform: '',
    };
    echo = g;
    g.flower = openStage(g);
    singSong(g.flower, song, serial, generation, g.flower === flower ? 0 : STAGE_LEAD_MS, () => beginListening(g));
  }

  // --- The echo game -------------------------------------------------------
  // After a flower has sung, the child can sing it back on the flags, chord
  // for chord. Any flower plays, not just today's. While it does, the flower
  // grows in the middle of Home (the title and Play fade away) so its petals
  // are easy to follow. A right chord makes its petals ring and sparkle and
  // stay lit; a wrong flag only plays its own chord, so nothing ever says
  // "wrong". Two wrong tries in a row and the flower sings again to help.
  // Repeating the whole melody earns a butterfly. The butterfly is a toy: it
  // saves nothing and waters nothing, so it can't be farmed.
  const STAGE_LEAD_MS = 600;
  const ECHO_IDLE_MS = 25000;
  const ECHO_WIN_MS = 7500;
  const ECHO_REPLAY_MS = 900;
  let echo = null;
  let echoIdleTimer = null;
  let homeFlagNames = [];
  let homeFlagsEl = null;

  const canMeasure = (node) => !!node && typeof node.getBoundingClientRect === 'function';
  const chordOfPetal = (petal) => {
    const fill = (petal.getAttribute('fill') || '').toLowerCase();
    return CHORDS.find((c) => c.swatch.toLowerCase() === fill) || null;
  };

  // Grow the flower in the middle of Home (a copy: the real one stays put,
  // hidden, and comes back when the game ends). Without real layout (tests)
  // the game just runs on the flower where it stands.
  function openStage(g) {
    const source = g.source;
    const home = app.querySelector('.home');
    const main = app.querySelector('.home-main');
    const flagsBox = app.querySelector('.home-flags');
    if (!home || !canMeasure(source) || !canMeasure(main) || !canMeasure(flagsBox) || !document.body) return source;
    const from = source.getBoundingClientRect();
    if (!from.width || !from.height) return source;
    const m = main.getBoundingClientRect();
    const f = flagsBox.getBoundingClientRect();
    const bottom = f.top >= m.bottom - 4 ? f.top - 28 : m.bottom - 20; // flags below, or beside, the middle
    const height = Math.min(380, Math.max(120, bottom - 110));
    const width = height * from.width / from.height;
    const cx = m.left + m.width / 2;
    const stage = el('div', {
      class: 'stage-flower', html: source.innerHTML,
      style: `left:${(cx - width / 2).toFixed(1)}px;top:${(bottom - height).toFixed(1)}px;width:${width.toFixed(1)}px;height:${height.toFixed(1)}px`,
      onclick: () => replayEcho(g),
    });
    g.fromTransform = `translate(${((from.left + from.width / 2) - cx).toFixed(1)}px,${(from.bottom - bottom).toFixed(1)}px) scale(${(from.height / height).toFixed(3)})`;
    stage.style.transform = g.fromTransform;
    g.layer = el('div', { class: 'stage-layer' }, stage);
    document.body.appendChild(g.layer);
    source.style.visibility = 'hidden';
    home.classList.add('echoing');
    void stage.offsetWidth; // commit the start position so the move below animates
    stage.style.transform = '';
    return stage;
  }

  function closeStage(g) {
    if (!g.layer) {
      g.source.style.visibility = '';
      return;
    }
    const layer = g.layer;
    const stage = layer.firstChild;
    g.layer = null;
    if (stage) {
      stage.style.pointerEvents = 'none';
      stage.style.transform = g.fromTransform;
    }
    setTimeout(() => {
      layer.remove();
      // A newer game on the same flower keeps it hidden.
      if (!(echo && echo.source === g.source)) g.source.style.visibility = '';
    }, 550);
  }

  // Bright, white-ringed petals for the colours the child has got so far; the
  // rest stay dim until they are heard in the melody.
  function paintAwake(g) {
    petalsOf(g.flower).forEach((petal) => {
      const chord = chordOfPetal(petal);
      const on = !!chord && g.awake.has(chord.name);
      petal.setAttribute('fill-opacity', on ? '1' : '.35');
      if (on) petal.classList.add('awake');
      else petal.classList.remove('awake');
    });
  }

  function setInviting(on) {
    if (!homeFlagsEl) return;
    if (on) homeFlagsEl.classList.add('inviting');
    else homeFlagsEl.classList.remove('inviting');
  }

  function armEchoIdle(g) {
    clearTimeout(echoIdleTimer);
    echoIdleTimer = setTimeout(() => { if (echo === g) endEcho(true); }, ECHO_IDLE_MS);
  }

  // The song is over: the child's turn.
  function beginListening(g) {
    if (echo !== g) return;
    g.flower.classList.remove('singing');
    glowPetals(g.flower, null);
    songFlower = null;
    g.listening = true;
    paintAwake(g);
    setInviting(true);
    armEchoIdle(g);
  }

  // The flower sings the melody again and the child starts over.
  function replayEcho(g) {
    if (echo !== g || g.won) return;
    clearTimeout(echoIdleTimer);
    songTimers.forEach((t) => clearTimeout(t));
    songTimers = [];
    songSerial += 1;
    g.listening = false;
    g.pendingReplay = false;
    g.awake.clear();
    g.tracker = Songs.tracker(g.names);
    setInviting(false);
    petalsOf(g.flower).forEach((petal) => petal.classList.remove('awake'));
    glowPetals(g.flower, null);
    singSong(g.flower, g.song, songSerial, screenGeneration, 0, () => beginListening(g));
  }

  // White sparkles popping off the petals that were just right.
  function cheerPetals(g, chord) {
    const hit = petalsOf(g.flower).filter((petal) => {
      const c = chordOfPetal(petal);
      return !!c && c.name === chord.name;
    });
    hit.forEach((petal) => {
      petal.classList.remove('echo-pop');
      if (canMeasure(petal)) petal.getBoundingClientRect(); // restart the ring if it was still running
      petal.classList.add('echo-pop');
      setTimeout(() => petal.classList.remove('echo-pop'), 700);
    });
    const layer = document.getElementById('confetti');
    if (!layer || !hit.length || !canMeasure(hit[0])) return;
    hit.slice(0, 2).forEach((petal) => {
      const r = petal.getBoundingClientRect();
      for (let k = 0; k < 5; k++) {
        const angle = k * (Math.PI * 2 / 5) + Math.random() * 0.6;
        const dist = 26 + Math.random() * 22;
        const spark = el('span', {
          class: 'echo-spark',
          style: `left:${(r.left + r.width / 2 - 7).toFixed(1)}px;top:${(r.top + r.height / 2 - 7).toFixed(1)}px;` +
            `--dx:${Math.round(Math.cos(angle) * dist)}px;--dy:${Math.round(Math.sin(angle) * dist)}px`,
        });
        layer.appendChild(spark);
        setTimeout(() => spark.remove(), 900);
      }
    });
  }

  function showButterfly(g) {
    const layer = document.getElementById('confetti');
    if (!layer) return;
    const r = canMeasure(g.flower) ? g.flower.getBoundingClientRect() : null;
    const spot = r && r.width ? `left:${Math.round(r.right - 10)}px;top:${Math.round(r.top - 30)}px` : 'left:60%;top:30%';
    const fly = el('div', { class: 'reward-butterfly', style: spot, html: Sprites.butterfly() });
    layer.appendChild(fly);
    songTimers.push(setTimeout(() => fly.classList.add('leaving'), ECHO_WIN_MS - 1800));
  }

  // The whole melody, repeated: the big reward.
  function echoWin(g) {
    g.won = true;
    g.listening = false;
    clearTimeout(echoIdleTimer);
    setInviting(false);
    g.flower.classList.add('dance');
    songTimers.push(setTimeout(() => {
      if (echo !== g) return;
      burstConfetti(28, g.names.map((n) => CHORD_BY_NAME[n]));
      Promise.resolve(PianoAudio.playSparkle()).catch(() => {});
      showButterfly(g);
    }, 700));
    songTimers.push(setTimeout(() => { if (echo === g) endEcho(true); }, ECHO_WIN_MS));
  }

  function echoTap(name) {
    const g = echo;
    if (!g || !g.listening || g.pendingReplay || g.won) return;
    armEchoIdle(g);
    const result = g.tracker.tap(name);
    if (result.kind === 'right' || result.kind === 'done') {
      g.awake.add(name);
      paintAwake(g);
      cheerPetals(g, CHORD_BY_NAME[name]);
      if (result.kind === 'done') echoWin(g);
    } else if (result.kind === 'replay') {
      g.pendingReplay = true;
      songTimers.push(setTimeout(() => replayEcho(g), ECHO_REPLAY_MS));
    }
  }

  // Put everything back. `natural` is the game running its course (the reward
  // finished, or the child wandered off): then an update that arrived in the
  // meantime can apply, now that Home is quiet again.
  function endEcho(natural) {
    const g = echo;
    if (!g) return;
    echo = null;
    clearTimeout(echoIdleTimer);
    echoIdleTimer = null;
    setInviting(false);
    const home = app.querySelector('.home');
    if (home) home.classList.remove('echoing');
    const fx = document.getElementById('confetti');
    if (fx) {
      fx.querySelectorAll('.reward-butterfly').forEach((n) => n.remove());
      fx.querySelectorAll('.echo-spark').forEach((n) => n.remove());
    }
    petalsOf(g.flower).forEach((petal) => { petal.classList.remove('awake'); petal.classList.remove('echo-pop'); });
    glowPetals(g.flower, null);
    g.flower.classList.remove('singing');
    g.flower.classList.remove('dance');
    closeStage(g);
    if (natural && Updates.hasUpdate() && onChildHome()) Updates.apply();
  }

  // The big round Play button (home and celebration). The label sits inside
  // the button, under the disc, so the whole thing is one tap target.
  function playButton(label, error) {
    const btn = el('button', { class: 'big-start', onclick: () => beginPractice(btn, error) },
      el('span', { class: 'play-disc', html: Sprites.icon('play') }),
      el('span', { class: 'play-label' }, label));
    return btn;
  }

  // True only when the child Home screen is what's actually showing — no
  // practice session running (a set, mic priming, or the celebration all
  // leave `session` set until they finish) and no guardian screen in its
  // place. This is the one moment an app update is safe to apply and reload
  // without surprising or interrupting anyone — see the Updates.init/
  // renderHome calls below and at the bottom of this file.
  function onChildHome() {
    return !session && !echo && !!app.querySelector('.home');
  }

  // --- "A new colour is ready" signals ------------------------------------
  // Profiles ready for a next colour that no grown-up has been shown yet.
  // Drives Home's lock dot and the app-icon badge.
  function pendingAlerts() {
    return Logic.unseenReadiness(Store.all().profiles, COLOR_ORDER);
  }

  // Opening the grown-up area counts as being shown: remember each ready
  // colour so the dot and badge only return for a NEW next colour.
  function markReadySeen() {
    pendingAlerts().forEach((a) => Store.updateProfile(a.id, { readySeen: a.next }));
    syncIconBadge();
  }

  // Mirror the alert count on the installed app's icon (Badging API), only
  // when a grown-up opted in. Unsupported browsers and failures are ignored:
  // the badge is a nicety and must never break the app.
  function syncIconBadge() {
    if (typeof navigator === 'undefined' || typeof navigator.setAppBadge !== 'function') return;
    const n = Store.getIconBadge() ? pendingAlerts().length : 0;
    try {
      let result;
      if (n > 0) result = navigator.setAppBadge(n);
      else if (typeof navigator.clearAppBadge === 'function') result = navigator.clearAppBadge();
      else result = navigator.setAppBadge(0);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  // The calendar day Home was last drawn for. Today's plant and the garden's
  // past days both split on it, so a Home that outlives midnight (suspended
  // overnight, or simply left open) shows yesterday's plant as today's, and
  // that flower twice once a resize redraws the hill.
  let homeDay = null;

  // Redraws an idle child Home that was drawn for an earlier day. Returns true
  // if it did, so callers can skip their own partial redraw. Anywhere else (a
  // set, the celebration, the grown-up area) is left alone: Home is drawn
  // fresh when the child gets back to it.
  function refreshHomeForNewDay() {
    if (!onChildHome() || Logic.dayKey(Date.now()) === homeDay) return false;
    renderHome();
    return true;
  }

  function renderHome() {
    homeDay = Logic.dayKey(Date.now());
    clearScreen();
    clearConfetti();
    setMode('child');
    syncPianoVariety();
    const p = Store.activeProfile();
    const colors = activeColorObjects();

    // Today's flags, planted along the hill. Tapping one plays its chord — a
    // self-serve way to prime the chord↔colour pairing (presentation mode)
    // before quizzing begins.
    const flags = el('div', { class: 'today-colors' },
      colors.map((c) => el('button', {
        class: 'today-swatch',
        title: I18n.color(c.name),
        'aria-label': I18n.color(c.name),
        html: Sprites.flag(c, { picture: p.flagPictures }),
        onclick: async () => {
          // Presentation-mode taps are best-effort — if the piano hasn't
          // loaded yet, the Play button above is where a real retry with a
          // friendly message happens, so a failure here just stays silent.
          // While a flower waits to be echoed, a flag is the child's answer.
          if (echo && echo.listening) echoTap(c.name);
          else stopFlowerSong();
          try {
            await PianoAudio.unlock();
            PianoAudio.playChord(c.notes).catch(() => {});
          } catch (e) { /* no-op — see comment above */ }
        },
      })));

    homeFlagNames = colors.map((c) => c.name);
    homeFlagsEl = flags;

    // Today's own plant, growing a stage per Practice Set played today
    // (Logic.plantStage) — a gentle cadence nudge with no numbers and
    // nothing to feel bad about (a seed or a bud just reads "not yet",
    // never "0 of 5"). It's the same plant that joins the garden on the
    // back hill forever once today is over (see renderGarden).
    const { today } = Logic.gardenDays(p.garden);
    const stage = Logic.plantStage(today ? today.sets : 0);
    const todayColors = today ? today.colors : [];
    const todayPlant = el('button', {
      class: 'today-plant', 'aria-label': todaysFlowerLabel(stage),
      html: Sprites.plant(stage, swatchesOf(todayColors)),
      // Tap for today's flower to sing its song; the day key seeds it, so
      // today's plant sings the same tune all day.
      onclick: () => playFlowerSong(todayPlant, Songs.visibleColors(stage, todayColors), Logic.dayKey(Date.now())),
    });

    const startError = el('p', { class: 'start-error', hidden: true },
      I18n.t('errors.startError'));
    const startBtn = playButton(I18n.t('home.play'), startError);

    // No number, no text and no chord colour: a child sees only a small ink
    // dot on the lock they already know is for grown-ups.
    const showDot = Store.getLockDot() && pendingAlerts().length > 0;
    syncIconBadge();
    const profileStrip = el('header', { class: 'home-top' },
      el('button', { class: 'avatar-chip', title: I18n.t('home.whoIsPlaying'), onclick: openProfilePicker },
        el('span', { class: 'avatar-emoji', html: Sprites.mascot(p.avatar) }),
        el('span', { class: 'avatar-name' }, p.name)),
      el('button', {
        class: 'gear', title: I18n.t('home.grownUpsTitle'),
        'aria-label': I18n.t(showDot ? 'home.grownUpsNewColour' : 'guardian.area'),
        onclick: () => renderGuardianGate(), html: Sprites.icon('lock'),
      }, showDot ? el('span', { class: 'gear-dot', 'aria-hidden': 'true' }) : null));

    app.appendChild(el('section', { class: 'screen home', onanimationend: settleLayout },
      profileStrip,
      el('div', { class: 'home-main' },
        el('div', { class: 'brand' },
          el('h1', { class: 'brand-title' }, I18n.t('home.brandTitle')),
          el('p', { class: 'brand-sub' }, I18n.t('home.brandSub'))),
        startBtn,
        todayPlant,
        startError),
      el('div', { class: 'home-flags' },
        el('p', { class: 'today-label' }, I18n.t('home.tapFlagHint')),
        flags)));
    renderGarden(p);
    fitHomeFlags();
    hideBlockedFlowerTaps();
    drawTerraces();
    // An update that arrived mid-set, mid-celebration, or during a guardian
    // visit couldn't apply then (see onChildHome above) — Home showing again
    // is the next safe moment, so catch up on it now.
    if (Updates.hasUpdate()) Updates.apply();
  }

  // A lightweight in-app overlay instead of window.confirm — with 3+ kids
  // cycling one-by-one through a confirm dialog gets old fast. Switching who
  // is playing isn't destructive to anyone's progress, so no PIN here; it's
  // guardian-flavoured only so a child doesn't idly poke at it.
  function openProfilePicker() {
    const data = Store.all();
    if (data.profiles.length <= 1) {
      // Nothing to switch to; nudge toward guardian area to add a child.
      renderGuardianGate();
      return;
    }
    let close = () => {};
    const list = el('div', { class: 'g-card g-list' });
    data.profiles.forEach((pr) => {
      const active = pr.id === data.activeProfileId;
      list.appendChild(el('button', {
        class: 'g-row',
        'aria-current': active ? 'true' : null,
        onclick: () => { Store.setActiveProfile(pr.id); syncPianoVariety(); close(); renderHome(); },
      }, el('span', { class: 'avatar-row', html: Sprites.mascot(pr.avatar) }),
         el('span', { class: 'g-row-main' }, el('span', { class: 'g-row-title' }, pr.name)),
         active ? el('span', { class: 'g-row-end' }, el('span', { class: 'badge' }, I18n.t('common.playing'))) : null));
    });

    const card = el('div', { class: 'adult dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': I18n.t('home.whoIsPlaying') },
      el('h3', { class: 'dialog-title' }, I18n.t('home.whoIsPlaying')),
      list,
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'secondary-btn', onclick: () => close() }, I18n.t('common.cancel'))));
    close = openOverlay(card);
  }

  // =======================================================================
  //  REAL PIANO MODE  (mic priming + entry, guardian-toggled — see
  //  guardianSettings' "Real piano mode" section below for the on/off switch)
  // =======================================================================
  let micPrimedThisSession = false;

  async function acquireMicrophone() {
    const generation = screenGeneration;
    pendingMicStart = true;
    try {
      await MicCapture.start();
      if (generation !== screenGeneration) return;
      pendingMicStart = false;
      micPrimedThisSession = true;
      startPractice('mic');
    } finally {
      if (generation === screenGeneration) pendingMicStart = false;
    }
  }

  async function enterRealPianoMode() {
    if (micPrimedThisSession) await acquireMicrophone();
    else renderMicPriming();
  }

  function renderMicPriming() {
    clearScreen();
    setMode('adult');
    const generation = screenGeneration;
    const micError = el('p', { class: 'form-msg bad', hidden: true });
    const readyBtn = el('button', {
      class: 'primary-btn',
      onclick: async () => {
        readyBtn.disabled = true;
        micError.hidden = true;
        try {
          await acquireMicrophone();
        } catch (e) {
          if (generation !== screenGeneration) return;
          readyBtn.disabled = false;
          if (e && e.code === 'UNAVAILABLE') {
            // Nothing to retry — old browser / insecure context — so the
            // Ready button itself goes away; "Not now" below still gets a
            // grown-up back to Home (and digital mode) in one tap.
            micError.textContent = I18n.t('errors.micBrowserUnsupported');
            readyBtn.hidden = true;
          } else {
            // Any denial (blocked, dismissed, OS-level) — deliberately not
            // distinguished further, same reasoning as the existing offline-
            // piano error not trying to diagnose DNS vs. CDN-down.
            micError.textContent = I18n.t('errors.micAccessDenied');
          }
          micError.hidden = false;
        }
      },
    }, I18n.t('mic.ready'));

    app.appendChild(el('section', { class: 'screen gate' },
      el('div', { class: 'gate-center' },
        el('div', { class: 'gate-card' },
          el('div', { class: 'gate-lock', html: Sprites.icon('mic') }),
          el('p', { class: 'pin-msg' }, I18n.t('mic.realPianoMode')),
          el('p', {}, I18n.t('mic.explainer')),
          el('p', { class: 'g-caption' }, I18n.t('mic.privacyNote')),
          el('div', { class: 'gate-actions' },
            readyBtn,
            el('button', { class: 'ghost-btn', onclick: renderHome }, I18n.t('mic.notNow'))),
          micError))));
  }

  // =======================================================================
  //  PRACTICE  (Practice Set)
  // =======================================================================
  let session = null;

  // The vine's last-drawn progress (0–1), kept outside `session` because
  // renderPractice() rebuilds the whole screen every round — this is what
  // lets the vine and mascot grow FROM their old spot TO the new one across
  // that rebuild instead of just popping there. See renderPractice().
  let vineProgress = 0;

  function startPractice(mode = 'digital') {
    setMode('child'); // real-piano mode arrives here from the grown-up priming card
    syncPianoVariety();
    const p = Store.activeProfile();
    const colors = activeColorObjects();
    session = {
      colors,
      total: p.roundsPerSet,
      index: 0,
      correct: 0,
      played: 0,        // rounds whose first attempt was scored (skipped mic rounds aren't)
      current: null,
      repeat: 0,        // consecutive count of the current colour
      attempted: false, // whether this round already counted toward stats
      locked: false,
      revealing: false, // true from a wrong tap until the glowing flag is confirmed
      cueing: false,    // true pre-chord: mic mode's card, digital mode's listening mascot
      roundId: 0,
      timers: new Set(),
      streak: 0,        // consecutive FIRST-ATTEMPT-correct rounds; any miss resets it
      mode,             // 'digital' (app picks + plays) or 'mic' (real piano)
      micListen: null,   // cancellable handle for the current mic round
      micArmed: false,   // flips true after FreshChordGate has a calm baseline
    };
    vineProgress = 0;
    nextRound(); // renders the first round's screen (and its fade-in)
  }

  // The mascot's resting (non-transient) mood: happy once a child is on a
  // roll, otherwise its plain face. Used whenever a round starts fresh —
  // never mid-round, so a mood swap never fights with the transient
  // "curious" flash below.
  function baselineMood() {
    return session && session.streak >= 3 ? 'happy' : 'normal';
  }

  // Weighted target each round — see Logic.pickWeighted for why (new colours
  // need front-loaded exposure). We still never let the same colour appear
  // 3+ times in a row, re-picking from the others when that would happen, so
  // the set still feels varied even with weighting in play.
  function pickTarget() {
    const choices = session.colors;
    const events = Store.activeProfile().events;
    let pick = Logic.pickWeighted(choices, events, Math.random);
    if (choices.length > 1 && session.current && pick.name === session.current.name && session.repeat >= 2) {
      const others = choices.filter((c) => c.name !== session.current.name);
      pick = Logic.pickWeighted(others, events, Math.random);
    }
    session.repeat = (session.current && pick.name === session.current.name) ? session.repeat + 1 : 1;
    return pick;
  }

  // Shared by BOTH modes' round-start flow: flips a round from "locked,
  // waiting" to "answers tappable" and fades the round-cue overlay out.
  // Digital calls this once the chord has actually sounded (or failed to);
  // mic mode calls it once MicCapture's onHeard has shown its brief "Got
  // it!" beat. `roundId` guards against a stale timer firing after the
  // round has already moved on (e.g. a calm stop, or the next round already
  // started).
  function unlockAnswers(roundId) {
    if (!session || session.roundId !== roundId) return;
    session.locked = false;
    session.cueing = false;
    const answersEl = app.querySelector('.answers');
    if (answersEl) answersEl.classList.remove('waiting', 'dim');
    const cueEl = app.querySelector('.round-cue');
    if (cueEl) cueEl.classList.add('hidden'); // the cue's job is done once answers unlock (mic mode only — digital has no card)
  }

  // Digital mode's only round-start cue is the chord itself, so the flags
  // flutter in place the instant it sounds — "the chord is here, your turn"
  // — without hinting at the answer (every flag moves identically). Restart-
  // safe (Listen again can retrigger it mid-round) by removing the class and
  // forcing a reflow before re-adding it, since re-adding an already-present
  // class doesn't restart a CSS animation.
  function flutterFlags(roundId) {
    if (!session || session.roundId !== roundId || session.revealing) return;
    const answersEl = app.querySelector('.answers');
    if (!answersEl) return;
    answersEl.classList.remove('flutter');
    void answersEl.offsetWidth; // restart the animation if it's already run
    answersEl.classList.add('flutter');
  }

  // Delayed practice work belongs to one round of one session.
  function scheduleRound(callback, delay) {
    const owner = session;
    const roundId = owner.roundId;
    const timer = setTimeout(() => {
      owner.timers.delete(timer);
      if (session === owner && owner.roundId === roundId) callback();
    }, delay);
    owner.timers.add(timer);
  }

  function clearRoundWork() {
    if (!session) return;
    for (const timer of session.timers) clearTimeout(timer);
    session.timers.clear();
    if (session.micListen) session.micListen.cancel();
    session.micListen = null;
    PianoAudio.stopAll();
  }

  function nextRound() {
    if (!session) return; // a calm stop may have ended the set already
    if (session.mode === 'mic') { nextMicRound(); return; }
    if (session.index >= session.total) return finishPractice(false);
    // Stop any still-ringing sound from the PREVIOUS round (a reward replay,
    // in the rare case it played, or a reveal chord) right away, so its
    // short damper fade finishes well before the new chord below.
    clearRoundWork();
    session.current = pickTarget();
    session.attempted = false;
    session.revealing = false;
    // Locked from render until the chord has actually sounded — a fast tap
    // that lands before any sound plays is a guess, not a listen, and would
    // pollute stats. `roundId` guards against a stray unlock from a stale
    // playChord promise if the round moves on before it resolves.
    session.locked = true;
    session.cueing = true; // shows the "Listen…" overlay (mic mode) / the mascot's listening pose (digital), until the chord below sounds
    const roundId = session.roundId = ++roundSequence;
    renderPractice();
    const notes = session.current.notes;
    // Timings: 500ms gives clearRoundWork()'s stopAll() above its 0.3s
    // damper fade plus a short silence, so the previous chord never bleeds
    // into this one. In digital mode the chord itself is the new-round cue —
    // no card, no tick — so the flags flutter the instant it sounds
    // (flutterFlags) to say "the chord is here, your turn".
    scheduleRound(() => {
      if (!session) return;
      // If the chord genuinely fails to play (e.g. the sampler load timed
      // out), unlock the answer grid anyway — a silent, chordless round is
      // better than a frozen screen the child can't get past. A failed
      // playback has nothing to flutter for.
      PianoAudio.playChord(notes).then(() => {
        unlockAnswers(roundId);
        flutterFlags(roundId);
        // The mascot's "listening" pose (see renderPractice) is a cueing-
        // phase thing; 1200ms gives it a beat to register after the chord
        // starts before it settles back to its baseline face.
        scheduleRound(() => {
          const m = document.getElementById('mascot');
          if (m) m.classList.remove('listening');
        }, 1200);
      }, () => unlockAnswers(roundId));
    }, 500);
  }

  // Which colours the adult may play from in real-piano mode — always the
  // full active set (decision #8: the adult chooses what to play, so there
  // is no pre-selected target and Logic.pickWeighted doesn't apply here).
  function activeChordsForSession() { return session.colors; }

  // Real-piano mode's round-start flow, standing in for nextRound()'s body
  // when session.mode === 'mic' — see nextRound()'s branch above. Renders a
  // brief "Get ready…" baseline state, then changes to "Play any colour…"
  // only when FreshChordGate is genuinely armed. Every other bit of round
  // bookkeeping (attempted/revealing/locked/roundId) mirrors the digital
  // flow exactly, so onAnswer()/renderPractice() needs no mode check of its
  // own.
  function nextMicRound() {
    if (!session) return; // a calm stop may have ended the set already
    if (session.index >= session.total) return finishPractice(false);
    clearRoundWork();
    const armAfter = PianoAudio.whenOutputSilent();
    session.current = null;
    session.currentConfidence = null;
    session.micArmed = false;
    session.showMicRetry = false;
    session.micRetryReason = null;
    session.micInput = null;
    session.attempted = false;
    session.revealing = false;
    session.locked = true;
    session.cueing = true;
    const roundId = session.roundId = ++roundSequence;
    renderPractice();

    session.micListen = MicCapture.listenForChord(activeChordsForSession(), (chordObj, confidence) => {
      if (!session || session.roundId !== roundId) return; // a stale callback from a round that already moved on
      session.micListen = null;
      session.current = chordObj;
      session.currentConfidence = confidence;
      renderPractice(); // State B: brief "Got it!" confirm beat, no colour named
      scheduleRound(() => unlockAnswers(roundId), 350);
    }, (diagnostic) => {
      if (!session || session.roundId !== roundId) return;
      session.micListen = null;
      // The safety valve (decision #1): low confidence or nothing ever
      // stabilised. Nothing is scored/recorded here — the child hasn't even
      // been able to tap anything yet. State D replaces the listening
      // overlay with a gentle, non-blaming retry card.
      session.cueing = false;
      session.showMicRetry = true;
      session.micRetryReason = diagnostic?.reason;
      setMascotMood('curious');
      renderPractice();
    }, {
      armAfter,
      onInput: (input) => {
        if (!session || session.roundId !== roundId || session.current || session.showMicRetry) return;
        session.micInput = input;
        updateMicInput();
      },
      onReady: () => {
        if (!session || session.roundId !== roundId || session.current) return;
        session.micArmed = true;
        renderPractice();
      },
    });
  }

  function micStatus() {
    if (session.showMicRetry || session.current) return I18n.t('mic.paused');
    if (!session.micInput) return I18n.t('mic.checkingInput');
    return {
      sound: I18n.t('mic.soundDetected'),
      quiet: I18n.t('mic.inputQuiet'),
      unavailable: I18n.t('mic.inputUnavailable'),
    }[session.micInput.state];
  }

  function updateMicInput() {
    const status = app.querySelector('.mic-status');
    const meter = app.querySelector('.mic-meter');
    if (status) status.textContent = micStatus();
    if (meter) meter.value = session.showMicRetry || session.current ? 0 : session.micInput?.level || 0;
  }

  // State D's "Try again": re-listen for the SAME round (session.index does
  // not advance, nothing is written to Store).
  function retryMicRound() {
    if (!session) return;
    session.showMicRetry = false;
    nextMicRound();
  }

  // State D's "Skip this one": same "a revealed round still uses up a
  // journey step" precedent as the wrong-tap reveal fallback in onAnswer —
  // advances past this round without ever scoring it, then moves on to the
  // next one.
  function skipMicRound() {
    if (!session) return;
    session.showMicRetry = false;
    session.index += 1;
    nextRound();
  }

  function renderPractice() {
    // Only a set's first build plays the .screen fade-in. Every later round
    // (and each real-piano state change) rebuilds this same screen, and
    // replaying the fade there blinks the whole garden out and back in right
    // under the correct-answer confetti.
    const continuing = !!app.querySelector('.practice');
    clearScreen();
    const p = Store.activeProfile();
    // How far along the set the child is, as a fraction of the vine.
    const target = session.total > 0 ? Math.min(1, session.index / session.total) : 0;

    // The vine replaces a row of round dots: a wavy line that grows toward
    // the end of the set and sprouts a leaf per round played, with the
    // child's mascot riding its tip. It's drawn after render (drawVine) since
    // the wave is laid out in real pixels. The mascot keeps its #mascot id so
    // setMascotMood() and cheer()'s .happy hop work on it directly. In
    // digital mode it also tilts and grows sound-wave arcs (`.listening`,
    // see styles.css) for the pre-chord cueing beat — the only "get ready"
    // cue digital mode has, since it shows no card (see roundCue below).
    const mascotEl = el('div', {
      class: 'journey-mascot' + (session.mode !== 'mic' && session.cueing ? ' listening' : ''),
      id: 'mascot',
      html: Sprites.mascot(p.avatar, baselineMood()),
    });
    const journey = el('div', {
      class: 'vine', role: 'progressbar', 'aria-label': I18n.t('practice.roundsPlayed'),
      'aria-valuemin': 0, 'aria-valuemax': session.total, 'aria-valuenow': session.index,
    }, el('div', { class: 'vine-art' }), mascotEl);

    // The watering can at the end of the vine — fills to the same fraction
    // the vine has grown to (`target`, above); fillCan() tops it up further
    // as rounds are played without a full rebuild (see moveOnWithChord).
    const can = el('div', {
      class: 'vine-can', 'aria-hidden': 'true', style: `--fill:${target}`,
      html: Sprites.icon('can') + `<span class="can-drop">${Sprites.icon('drop')}</span>`,
    });

    // In mic mode there's nothing to replay until a chord has actually been
    // heard (State A has no session.current yet) — the button only appears
    // once it does, relabelled "Hear it again" (the app replaying its own
    // best guess) rather than "Listen again" (which implies a pre-announced
    // target, true only in digital mode). Digital's replay also flutters the
    // flags once it sounds, same as the round's own chord (flutterFlags) —
    // mic mode doesn't, since the grown-up (not the app) is the one playing.
    const listenBtn = (session.mode === 'mic' && !session.current) ? null : el('button', {
      class: 'listen-btn',
      onclick: () => {
        if (session.mode === 'mic') {
          PianoAudio.playChord(session.current.notes).catch(() => {});
        } else {
          const roundId = session.roundId;
          PianoAudio.playChord(session.current.notes).then(() => flutterFlags(roundId), () => {});
        }
      },
    }, el('span', { class: 'listen-icon', html: Sprites.icon('speaker') }),
       el('span', {}, I18n.t(session.mode === 'mic' ? 'practice.hearAgain' : 'practice.listenAgain')));

    // One planted flag per active colour, in a wrapping, centred row — a
    // partial last row centres itself. Flag size and column count are fitted
    // to the space after render (fitAnswers). Non-interactive while locked
    // waiting for the chord to sound, so an eager tap can't land before
    // there's anything to listen to — but only mic mode dims the flags for
    // it (`.dim`, see styles.css); digital mode leaves them at full colour
    // and relies on the mascot + the chord itself as the cue instead.
    const makeAnswerBtn = (c) => el('button', {
      class: 'color-btn',
      'data-color': c.name,
      'aria-label': I18n.color(c.name),
      html: Sprites.flag(c, { picture: p.flagPictures }),
      onclick: () => onAnswer(c),
    });

    const answers = el('div', {
      class: 'answers' + (session.locked ? ' waiting' : '') + (session.locked && session.mode === 'mic' ? ' dim' : ''),
    }, session.colors.map(makeAnswerBtn));

    // Real-piano mode shows a card over the flags while session.cueing is
    // true — baseline ("Get ready…"), armed ("Play any colour…"), and heard
    // ("Got it!") — since these are instructions for the grown-up reading
    // over the child's shoulder, not the child. It's `pointer-events: none`
    // so it never blocks a tap once it's fading out mid-transition.
    //
    // Digital mode shows no card at all: a young child can't read it, and
    // flashing "Listen…" every round just trains "wait for the card" rather
    // than "listen". The chord itself is the cue there — the mascot tilts to
    // listen and the flags flutter once it sounds (see mascotEl and
    // flutterFlags above/below).
    const roundCue = session.mode === 'mic'
      ? (session.current
          ? el('div', { class: 'round-cue mic-heard' + (session.cueing ? '' : ' hidden') },
              el('span', { class: 'round-cue-icon', html: Sprites.icon('check') }),
              el('span', { class: 'round-cue-label' }, I18n.t('mic.gotIt')))
          : el('div', { class: 'round-cue mic-wait' + (session.cueing ? '' : ' hidden') },
              el('span', { class: 'round-cue-icon', html: Sprites.icon('mic') }),
              el('span', { class: 'round-cue-label' },
                I18n.t(session.micArmed ? 'mic.playAnyColour' : 'mic.getReady')),
              el('span', { class: 'round-cue-sub' },
                I18n.t(session.micArmed ? 'mic.listening' : 'mic.waitingQuiet'))))
      : null;

    // State D — the safety valve: low confidence or nothing ever stabilised.
    // Nothing here is ever scored/recorded (see nextMicRound()'s
    // onLowConfidence branch) — this shows BEFORE the child can tap
    // anything, so it's the room/mic that didn't cooperate, never the
    // child's answer. Same visual family as .start-error (plain, honest,
    // no "sorry"/"wrong"), laid out centered like .round-cue above it. The
    // two variants that name a button (All done / Try again) interpolate its
    // translated label rather than concatenating fragments, so the sentence
    // stays one coherent translation unit per language.
    const retryMessage = session.micRetryReason === 'no-input'
      ? I18n.t('errors.micNoInput')
      : session.micRetryReason === 'unavailable'
        ? I18n.t('errors.micUnavailable', { allDone: I18n.t('practice.allDone') })
        : I18n.t('errors.micUnmatched', { tryAgain: I18n.t('mic.tryAgain') });
    const micRetry = (session.mode === 'mic' && session.showMicRetry) ? el('div', { class: 'mic-retry' },
      el('p', {}, retryMessage),
      el('div', { class: 'mic-retry-actions' },
        el('button', { class: 'primary-btn', onclick: retryMicRound }, I18n.t('mic.tryAgain')),
        el('button', { class: 'ghost-btn', onclick: skipMicRound }, I18n.t('mic.skipThisOne')))) : null;

    // Show measured input while polling; permission alone is not evidence
    // that the selected microphone is supplying audio.
    const micPill = session.mode === 'mic' ? el('div', { class: 'mic-pill' },
      el('span', { class: 'mic-pill-icon', html: Sprites.icon('mic') }),
      el('meter', { class: 'mic-meter', min: 0, max: 1, value: 0, 'aria-label': I18n.t('practice.micLevel') }),
      el('span', { class: 'mic-status' }, micStatus())) : null;

    const stopBtn = el('button', { class: 'calm-stop', onclick: calmStop }, I18n.t('practice.allDone'));

    app.appendChild(el('section', { class: 'screen practice' + (continuing ? ' continuing' : ''), onanimationend: settleLayout },
      el('div', { class: 'practice-top' }, journey, can, stopBtn),
      el('div', { class: 'listen-wrap' }, micPill, listenBtn),
      el('div', { class: 'answers-wrap' }, answers, roundCue, micRetry)));
    fitAnswers();
    drawTerraces();
    // Draw the vine where the previous round left it, then grow it to this
    // round a frame later so the tip (and the mascot riding it) visibly
    // moves forward instead of popping into place after the re-render.
    drawVine(vineProgress, vineProgress);
    const from = vineProgress;
    requestAnimationFrame(() => requestAnimationFrame(() => drawVine(from, target)));
    vineProgress = target;
    if (session.mode === 'mic') updateMicInput();
  }

  // The vine's wave in real pixels (48px tall box): shared by the drawn
  // line, the leaves and the mascot so they all sit on it.
  const VINE_WAVELENGTH = 96;
  const vineY = (x) => 24 + 8 * Math.sin((x / VINE_WAVELENGTH) * Math.PI * 2 + 0.6);

  function drawVine(from, to) {
    const vine = app.querySelector('.vine');
    const art = vine && vine.querySelector('.vine-art');
    const mascotEl = document.getElementById('mascot');
    if (!session || !art || !mascotEl) return;
    const w = vine.clientWidth || 240;
    const points = [];
    for (let x = 0; x <= w; x += 4) points.push(`${points.length ? 'L' : 'M'}${x} ${vineY(x).toFixed(1)}`);
    // Only rounds actually reached so far sprout a leaf; the newest pops in.
    const shown = Math.round(to * session.total);
    const leaves = [];
    for (let i = 0; i < shown; i++) {
      const x = ((i + 0.5) / session.total) * w;
      const up = i % 2 === 0;
      const fresh = i === shown - 1 && to > from;
      leaves.push(`<span class="vine-leaf${fresh ? ' new' : ''}" style="left:${x.toFixed(1)}px;top:${(vineY(x) + (up ? -7 : 7)).toFixed(1)}px;--tilt:${up ? -35 : 35}deg"></span>`);
    }
    art.innerHTML =
      `<svg viewBox="0 0 ${w} 48" aria-hidden="true">` +
      `<path class="vine-track" d="${points.join(' ')}"/>` +
      // The gap (1000) outruns the path so the dash pattern never repeats a
      // round-capped dot at the far end.
      `<path class="vine-grow" pathLength="100" stroke-dasharray="${(to * 100).toFixed(2)} 1000" style="--from:${(from * 100).toFixed(2)}" d="${points.join(' ')}"/>` +
      `</svg>` + leaves.join('');
    // The chin of the face sits ~91% down its 36px box, onto the line.
    const x = to * w;
    // Only the real step glides. Placing the mascot must not: each round's
    // re-render makes a fresh element whose stylesheet spot is left 0, so a
    // transition would sweep it in from the edge, and after a resize it should
    // simply be where it belongs. The transition is off until that position
    // has been computed.
    const place = from === to;
    if (place) mascotEl.style.transition = 'none';
    mascotEl.style.left = x.toFixed(1) + 'px';
    mascotEl.style.top = (vineY(x) - 33).toFixed(1) + 'px';
    if (place) {
      void mascotEl.offsetWidth;
      mascotEl.style.transition = '';
    }
  }

  // Practice flags fill the space left for answers (Layout.fitFlags). Capped
  // so two colours on a tablet don't become billboards, and floored so a
  // crowded screen doesn't shrink flags below a tappable size. The floor is
  // 72px, not more, so 14 colours still fit a 320x568 phone without rows
  // spilling up over the Listen button.
  const FLAG_ASPECT = 110 / 168; // the flag sprite's viewBox
  const GAP_X = 10;
  const PRACTICE_FLAGS = { maxH: 230, minH: 72, gapX: GAP_X, gapY: 18, aspect: FLAG_ASPECT };

  function fitAnswers() {
    const wrap = app.querySelector('.answers-wrap');
    const answers = app.querySelector('.answers');
    if (!session || !wrap || !answers || !wrap.clientWidth || !wrap.clientHeight) return;
    const { cols, h, w } = Layout.fitFlags(session.colors.length, wrap.clientWidth, wrap.clientHeight, PRACTICE_FLAGS);
    answers.style.setProperty('--tile-w', w + 'px');
    answers.style.setProperty('--tile-h', h + 'px');
    answers.style.width = (cols * w + (cols - 1) * GAP_X) + 'px';
  }
  // Home's flags share the ground below the back hill's ridge with the
  // "tap a flag" label, so they're sized to what's left rather than left to
  // wrap and scroll (which would carry flags into the sky while the fixed
  // hills stay put). maxH 82 is today's size, so few colours look unchanged.
  const HOME_GAP_X = 14;
  const HOME_FLAGS = { maxH: 82, minH: 40, gapX: HOME_GAP_X, gapY: 10, aspect: FLAG_ASPECT };
  function fitHomeFlags() {
    const box = app.querySelector('.home-flags');
    const colors = app.querySelector('.today-colors');
    const label = app.querySelector('.today-label');
    const n = colors ? colors.children.length : 0;
    // No layout (the test DOM) means nothing to measure.
    if (!box || !colors || !label || !n || !box.clientWidth) return;
    const hillsEl = document.querySelector('.scene-hills');
    if (!hillsEl) return;
    const hills = hillsEl.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const W = window.innerWidth || 390;
    // The lowest point of the back ridge under the flags' width: flags stand
    // below it, never among the past days' flowers on the ridge.
    let maxY = 0;
    for (let i = 0; i <= 8; i++) {
      maxY = Math.max(maxY, backHillY((boxRect.left + boxRect.width * i / 8) / W));
    }
    const ridgeY = hills.top + (maxY / 340) * hills.height;
    // 30 = #app's 24px bottom padding + .home-flags' 6px; 10 = breathing room.
    const ground = window.innerHeight - 30 - ridgeY - 10;
    const budget = ground - label.offsetHeight - 12;
    const { cols, h, w } = Layout.fitFlags(n, box.clientWidth, budget, HOME_FLAGS);
    colors.style.cssText = `--hf-w:${w}px;--hf-h:${h}px;max-width:${cols * w + (cols - 1) * HOME_GAP_X}px`;
  }

  // .screen fades in with a 6px slide, so measurements taken during that
  // animation are 6px low; measure again once it ends. Only the screen's own
  // animation counts (the flags' pop-in bubbles up here too).
  function settleLayout(e) {
    if (e && e.target !== e.currentTarget) return;
    if (app.querySelector('.home')) fitHomeFlags();
    hideBlockedFlowerTaps();
    drawTerraces();
  }

  function relayout() {
    // The garden is about to be redrawn (and the grown flower's place may have
    // moved), so a running echo game ends first.
    if (echo) stopFlowerSong();
    // A new day redraws all of Home (the hill included), and does so first so
    // the measurements below are of the screen that is actually showing.
    const redrew = refreshHomeForNewDay();
    fitAnswers();
    if (!session && app.querySelector('.home')) fitHomeFlags();
    drawTerraces();
    if (session) drawVine(vineProgress, vineProgress);
    // The garden's flower slots are laid out from window width (renderGarden
    // above), so a rotation/resize on Home needs a redraw to keep them
    // spaced right, same as the vine/flags above.
    if (!redrew && !session && app.querySelector('.home')) {
      renderGarden(Store.activeProfile());
      hideBlockedFlowerTaps();
    }
  }
  // iPad Safari fires resize mid-rotation, with the window already at its new
  // size but the page not yet laid out for it, and may not fire again once it
  // is. Measuring then stuck the Home flags in a column until the app was
  // reopened. So lay out at once (no lag on ordinary resizes) and again once
  // things have been still for a moment.
  const SETTLE_MS = 300;
  let settleTimer = null;
  function onViewportChange() {
    relayout();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(relayout, SETTLE_MS);
  }
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  // Web fonts change the label's height, which moves the flags.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => settleLayout());

  // Swaps the live #mascot element's face in place (no full re-render) —
  // used for the brief "curious" flash on a miss, since that's a transient
  // expression layered on the current round, not a new screen.
  function setMascotMood(mood) {
    const mascotEl = document.getElementById('mascot');
    if (mascotEl) mascotEl.innerHTML = Sprites.mascot(Store.activeProfile().avatar, mood);
  }

  function onAnswer(color) {
    // A wrong tap leaves the round in `revealing` (see below) until the
    // child taps the glowing correct flag — every other tap is ignored, and
    // only that one confirms and moves on. This has to come before the
    // locked check below: `revealing` rounds are locked too (nothing else
    // is tappable), but the glowing flag itself still needs to respond.
    if (session.revealing) {
      if (color.name === session.current.name) confirmReveal();
      return;
    }
    if (session.locked) return;
    // A quick tap can land inside the listening pose's 1200ms; drop it now
    // so the tilt never mixes with the happy hop or the curious face.
    const mascotEl = document.getElementById('mascot');
    if (mascotEl) mascotEl.classList.remove('listening');
    const correct = color.name === session.current.name;
    const firstAttempt = !session.attempted; // streak only moves on a first-attempt result

    // Only the FIRST attempt of a round counts toward guardian stats. Mic-
    // mode rounds are tagged with a `src: 'mic'` + confidence via a separate
    // Store function (see js/storage.js), so real-piano reads stay visible
    // to the guardian but out of the core readiness/accuracy signal (see
    // js/logic.js's `src !== 'mic'` filters) — everything else here is
    // identical either way, since it only reads session.current/streak.
    if (!session.attempted) {
      session.attempted = true;
      const record = session.mode === 'mic'
        ? (c, a, ok) => Store.recordRealPianoRound(c, a, ok, session.currentConfidence)
        : Store.recordRound;
      record(session.current.name, color.name, correct);
      session.played += 1;
      if (correct) session.correct += 1;
    }

    const btn = app.querySelector(`.color-btn[data-color="${color.name}"]`);
    if (correct) {
      session.locked = true;
      if (firstAttempt) session.streak += 1;
      btn.classList.add('correct');
      cheer();
      // A little tactile "yes!" right at tap time. The vibrate call is
      // wrapped because plenty of browsers/devices simply don't have
      // navigator.vibrate, and a couple that do still throw if it's blocked
      // by permissions policy — either way it should never interrupt the
      // success feedback.
      try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) { /* no-op — see comment above */ }
      moveOnWithChord();
    } else {
      // Any wrong tap breaks the happy streak, gets a brief, gentle
      // "curious" face, and reveals the right flag right away — with only
      // two colours active, a retry after a miss is always right by
      // elimination, which trains the wrong skill and would otherwise earn
      // the same cheer/confetti as a real answer. The round was already
      // recorded as incorrect on the first attempt, above.
      session.streak = 0;
      setMascotMood('curious');
      btn.classList.add('nudge');
      scheduleRound(() => btn.classList.remove('nudge'), 500);
      session.locked = true;
      session.revealing = true;
      const answersEl = app.querySelector('.answers');
      if (answersEl) answersEl.classList.add('reveal');
      const correctBtn = app.querySelector(`.color-btn[data-color="${session.current.name}"]`);
      if (correctBtn) correctBtn.classList.add('reveal');
      const notes = session.current.notes;
      scheduleRound(() => { if (session) PianoAudio.playChord(notes).catch(() => {}); }, 300);
      // Safety valve so a child who never taps the glowing flag doesn't
      // stall the set: the replayed chord above rings for ~3.3s, then a
      // moment of quiet, then move on anyway. confirmReveal() (above) clears
      // session.revealing synchronously, so on the normal path this is
      // already a no-op by the time it fires.
      scheduleRound(() => {
        if (!session || !session.revealing) return;
        session.revealing = false;
        session.index += 1;
        nextRound();
      }, 5000);
    }
  }

  // A wrong tap's glowing correct flag stays tappable (see onAnswer's
  // `revealing` branch and the CSS pointer-events override on
  // `.color-btn.reveal`); tapping it confirms the answer was seen. One lift
  // + wave (`.confirmed`, see styles.css) replaces the endless reveal bob,
  // but nothing about this counts as a fresh correct answer: no cheer(), no
  // confetti, no vibrate, and the streak/stats stay exactly as the miss
  // already left them.
  function confirmReveal() {
    session.revealing = false;
    const correctBtn = app.querySelector(`.color-btn[data-color="${session.current.name}"]`);
    if (correctBtn) correctBtn.classList.add('confirmed');
    setMascotMood(baselineMood());
    moveOnWithChord();
  }

  // Shared tail for "this round is settled, move to the next one" — a
  // correct first tap, or a confirmed reveal after a miss. A correct tap
  // (or reveal confirm) usually lands while the chord that was just played
  // is still ringing — so the flag lights up against the chord itself, the
  // chord+colour pairing the Eguchi method relies on, with no need to
  // strike it a second time. Only when it's already faded (a slow answer,
  // real-piano mode where the app never played the chord — the grown-up
  // did, or a reveal confirm arriving after its replayed chord has rung
  // out) is it replayed softly, and then the round waits the longer 1100ms
  // so that replay is actually heard. Otherwise 800ms is enough for the
  // glow/confetti/happy mascot to land with the chord before the next
  // round's fade.
  function moveOnWithChord() {
    const replay = !PianoAudio.isChordRinging();
    if (replay) PianoAudio.playReward(session.current.notes).catch(() => {});
    session.index += 1;
    fillCan();
    scheduleRound(nextRound, replay ? 1100 : 800);
  }

  // Tops up the watering can every round, right or wrong — the reveal
  // confirm (confirmReveal) goes through moveOnWithChord too, so a missed
  // round still fills it same as a correct one. Restart-safe like
  // flutterFlags: removing then re-adding `splash` lets the drop animation
  // replay even though the class is already present from the last round.
  function fillCan() {
    const can = app.querySelector('.vine-can');
    if (!can || !session) return;
    const fraction = session.total > 0 ? Math.min(1, session.index / session.total) : 0;
    can.style.cssText = `--fill:${fraction}`;
    can.classList.remove('splash');
    void can.offsetWidth; // restart the animation if it's already run
    can.classList.add('splash');
  }

  function cheer() {
    const mascot = document.getElementById('mascot');
    if (mascot) { mascot.classList.add('happy'); setTimeout(() => mascot.classList.remove('happy'), 900); }
    // A streak feels like a bigger deal, so it gets a bigger burst — same
    // jump animation either way.
    burstConfetti(session.streak >= 3 ? 18 : 10, session.colors);
  }

  function calmStop() {
    // A calm stop is never failure. Save what happened and celebrate gently.
    finishPractice(true);
  }

  function finishPractice(early) {
    if (!session) return;
    clearRoundWork();
    // Release the microphone (MediaStream tracks) the moment a real-piano
    // set ends — this IS the stop control; there's no separate mic-off
    // button, since tapping the existing "All done" button already goes
    // through here (via calmStop()).
    if (session.mode === 'mic') MicCapture.stop();
    // A set stopped before anything was scored isn't a practice set: saving
    // it would light a star on Home and list a "0 of 0" in Progress.
    // `rounds` counts scored rounds, so a round stopped after a first miss
    // counts (its miss is already in the stats) and a skipped real-piano
    // round doesn't. The garden follows FINISHED sets only: a set stopped
    // early is saved for the grown-up but waters nothing (a child once
    // stopped set after set to grow the flower from a few chords), so
    // `watering` stays null and the celebration shows no can at all. Stopping
    // still looks and feels like any other calm ending.
    let watering = null;
    if (session.played > 0) {
      const before = Logic.plantStage((Logic.gardenDays(Store.activeProfile().garden).today || { sets: 0 }).sets);
      Store.recordSession({
        ts: Date.now(),
        rounds: session.played,
        target: session.total,
        correct: session.correct,
        colors: session.colors.map((c) => c.name),
        early,
        ...(session.mode === 'mic' ? { src: 'mic' } : {}),
      });
      syncIconBadge(); // this set may have made the child ready for a new colour
      if (!early) {
        const today = Logic.gardenDays(Store.activeProfile().garden).today;
        watering = { before, after: Logic.plantStage(today.sets), colors: today.colors };
      }
    }
    renderCelebration(early, session.colors, watering);
    session = null;
  }

  // =======================================================================
  //  CELEBRATION  (Child Celebration)
  // =======================================================================
  function renderCelebration(early, colors, watering) {
    clearScreen();
    burstConfetti(70, colors);
    const generation = screenGeneration; // clearScreen() bumps this; guards the watering timers below
    const p = Store.activeProfile();
    const startError = el('p', { class: 'start-error', hidden: true });
    const again = playButton(I18n.t('home.playAgain'), startError);

    if (watering === null) {
      // No plant to water: either nothing was scored, or the set was stopped
      // early (only finished sets water the garden, so stopping can't be used
      // to grow the flower faster). Same warm layout minus the can: mascot,
      // title and actions all shown right away.
      PianoAudio.playSparkle(); // non-pitched flourish — see audio.js for why
      app.appendChild(el('section', { class: 'screen celebrate' },
        el('div', { class: 'cele-mascot', html: Sprites.mascot(p.avatar, 'happy') }),
        el('h1', { class: 'cele-title' }, I18n.t(early ? 'celebrate.niceListening' : 'celebrate.youDidIt')),
        el('div', { class: 'cele-actions' }, again, el('button', { class: 'ghost-btn', onclick: renderHome }, I18n.t('celebrate.home'))),
        startError));
      return;
    }

    // Something was scored: today's plant grew, and watering it is the
    // celebration. The plant starts at its stage from BEFORE this set (see
    // finishPractice) and only grows to `watering.after` once the child
    // taps the can — the tap is the reward moment, not just a formality.
    const swatches = swatchesOf(watering.colors);
    const title = el('h1', { class: 'cele-title' }, I18n.t(early ? 'celebrate.niceListening' : 'celebrate.youDidIt'));
    const hint = el('p', { class: 'cele-hint' }, I18n.t('celebrate.waterHint'));
    const plant = el('div', {
      class: 'cele-plant', role: 'img', 'aria-label': todaysFlowerLabel(watering.before),
      html: Sprites.plant(watering.before, swatches),
    });
    const can = el('button', {
      class: 'water-can', 'aria-label': I18n.t('celebrate.waterAria'), html: Sprites.icon('can'),
      onclick: () => water(),
    });
    const garden = el('div', { class: 'cele-garden' },
      can,
      el('span', { class: 'pour-drop d1', 'aria-hidden': 'true', html: Sprites.icon('drop') }),
      el('span', { class: 'pour-drop d2', 'aria-hidden': 'true', html: Sprites.icon('drop') }),
      el('span', { class: 'pour-drop d3', 'aria-hidden': 'true', html: Sprites.icon('drop') }),
      plant,
      el('span', { class: 'cele-sparkle s1', 'aria-hidden': 'true', html: Sprites.icon('sparkle') }),
      el('span', { class: 'cele-sparkle s2', 'aria-hidden': 'true', html: Sprites.icon('sparkle') }),
      el('span', { class: 'cele-sparkle s3', 'aria-hidden': 'true', html: Sprites.icon('sparkle') }),
      el('span', { class: 'cele-sparkle s4', 'aria-hidden': 'true', html: Sprites.icon('sparkle') }),
      el('div', { class: 'cele-mascot', html: Sprites.mascot(p.avatar, 'happy') }));
    // Actions wait (hidden, not gone — see .waiting in styles.css) until the
    // plant has grown, so a stray tap on Play again/Home can't skip past the
    // reward moment by accident. The safety valve below still shows them if
    // the can is never tapped, so nobody gets stuck here either.
    const actions = el('div', { class: 'cele-actions waiting' },
      again, el('button', { class: 'ghost-btn', onclick: renderHome }, I18n.t('celebrate.home')));

    let watered = false;
    function water() {
      if (watered || generation !== screenGeneration) return;
      watered = true;
      can.disabled = true;
      garden.classList.add('watering');
      hint.classList.add('hidden');
      setTimeout(() => {
        if (generation !== screenGeneration) return;
        plant.innerHTML = Sprites.plant(watering.after, swatches);
        plant.setAttribute('aria-label', todaysFlowerLabel(watering.after));
        plant.classList.remove('grow');
        void plant.offsetWidth; // restart the grow animation
        plant.classList.add('grow');
        PianoAudio.playSparkle();
        title.textContent = watering.after === 5 && watering.before < 5
          ? I18n.t('celebrate.bloomed')
          : watering.after > watering.before ? I18n.t('celebrate.itGrew') : I18n.t('celebrate.lovesIt');
        if (watering.after === 5) garden.classList.add('bloomed');
        actions.classList.remove('waiting');
      }, 900);
    }
    // If the can is never tapped, show the actions anyway — the reward is
    // nice to have, never a gate a child can get stuck behind.
    setTimeout(() => {
      if (generation !== screenGeneration) return;
      actions.classList.remove('waiting');
    }, 8000);

    // .celebrate-garden stands the garden on the front hill (see styles.css).
    app.appendChild(el('section', { class: 'screen celebrate celebrate-garden' },
      el('div', { class: 'cele-top' }, title, hint), garden, actions, startError));
  }

  // =======================================================================
  //  GUARDIAN  (PIN gate + panels)
  // =======================================================================
  function backButton(label, onclick) {
    return el('button', { class: 'back-link', onclick },
      el('span', { class: 'btn-ico', html: Sprites.icon('back') }), label);
  }

  function renderGuardianGate() {
    clearScreen();
    clearConfetti();
    setMode('adult');
    let entered = '';
    const dots = el('div', { class: 'pin-dots', 'aria-hidden': 'true' });
    const msg = el('p', { class: 'pin-msg', 'aria-live': 'polite' }, I18n.t('pin.grownUpsOnly'));

    function refresh() {
      clear(dots);
      for (let i = 0; i < 4; i++) dots.appendChild(el('span', { class: 'pin-dot' + (i < entered.length ? ' filled' : '') }));
    }
    function press(d) {
      if (entered.length >= 4) return;
      entered += d; refresh();
      if (entered.length === 4) {
        if (entered === Store.getPin()) {
          // Asked here, not at boot: Firefox shows a permission prompt for
          // persist(), and that must never pop up in front of a child.
          Store.requestPersistence();
          renderGuardian('colors');
        }
        else {
          msg.textContent = I18n.t('pin.noMatch');
          dots.classList.add('shake');
          entered = '';
          setTimeout(() => { dots.classList.remove('shake'); refresh(); }, 400);
        }
      }
    }
    const pad = el('div', { class: 'pin-pad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((k) => {
        if (k === '') return el('span', {});
        if (k === 'back') {
          return el('button', {
            class: 'pin-key pin-back', 'aria-label': I18n.t('pin.delete'), html: Sprites.icon('backspace'),
            onclick: () => { entered = entered.slice(0, -1); refresh(); },
          });
        }
        return el('button', { class: 'pin-key', onclick: () => press(k) }, k);
      }));

    refresh();
    // The hint only makes sense while the PIN is still the factory default —
    // once a grown-up sets their own in Settings, showing it here would
    // defeat the point of changing it.
    const showHint = Store.getPin() === Store.DEFAULT_PIN;
    app.appendChild(el('section', { class: 'screen gate' },
      el('div', {}, backButton(I18n.t('pin.backToPlay'), renderHome)),
      el('div', { class: 'gate-center' },
        el('div', { class: 'gate-card' },
          el('div', { class: 'gate-lock', html: Sprites.icon('lock') }),
          msg,
          el('p', { class: 'pin-hint' }, showHint ? I18n.t('pin.demoHint', { pin: Store.DEFAULT_PIN }) : I18n.t('pin.enterHint')),
          dots, pad))));
  }

  const GUARDIAN_TABS = () => [
    ['colors', I18n.t('guardian.tabColours')],
    ['progress', I18n.t('guardian.tabProgress')],
    ['profiles', I18n.t('guardian.tabChildren')],
    ['settings', I18n.t('guardian.tabSettings')],
  ];

  // Set by renderGuardian to redraw the header's child chip from the saved
  // profile; only meaningful while the grown-up area is showing.
  let refreshGuardianChild = () => {};

  function renderGuardian(tab) {
    clearScreen();
    setMode('adult');
    // Rendering the area is what "shows" a grown-up the ready colour, even if
    // they toggle colours while inside, so do it on every render.
    markReadySeen();
    const p = Store.activeProfile();
    const activeReady = !!Logic.readyForNext(p, COLOR_ORDER);
    const tabs = el('nav', { class: 'segmented g-tabs', 'aria-label': I18n.t('guardian.sectionsAria') },
      GUARDIAN_TABS().map(([id, lbl]) => el('button', {
        class: 'seg g-tab' + (tab === id ? ' sel' : ''),
        'aria-current': tab === id ? 'page' : null,
        'aria-label': id === 'colors' && activeReady && tab !== 'colors' ? I18n.t('guardian.tabColoursReady') : null,
        onclick: () => renderGuardian(id),
      }, lbl, id === 'colors' && activeReady && tab !== 'colors' ? el('span', { class: 'g-tab-dot', 'aria-hidden': 'true' }) : null)));

    // The chip is redrawn in place (refreshGuardianChild) when Settings renames
    // the child or changes their avatar, so typed-but-unsaved fields on that
    // screen aren't lost to a rebuild.
    const childChip = el('span', { class: 'g-child' });
    refreshGuardianChild = () => {
      const cur = Store.activeProfile();
      clear(childChip);
      childChip.appendChild(el('span', { class: 'g-child-ava', html: Sprites.mascot(cur.avatar) }));
      childChip.appendChild(document.createTextNode(cur.name));
    };
    refreshGuardianChild();

    const body = el('div', { class: 'g-body' });
    if (tab === 'colors') guardianColors(body);
    else if (tab === 'progress') guardianProgress(body);
    else if (tab === 'profiles') guardianProfiles(body);
    else guardianSettings(body);

    app.appendChild(el('section', { class: 'screen guardian' },
      el('header', { class: 'g-head' },
        backButton(I18n.t('guardian.done'), renderHome),
        el('h2', {}, I18n.t('guardian.area')),
        childChip),
      tabs, body));
  }

  // --- Guardian building blocks -------------------------------------------
  // A titled group: small sentence-case heading, its content (usually a
  // .g-card list), and an optional caption underneath.
  function section(title, content, caption) {
    return el('section', { class: 'g-section' },
      title ? el('h3', { class: 'g-section-title' }, title) : null,
      content,
      caption ? el('p', { class: 'g-caption' }, caption) : null);
  }

  // Longer explanations live behind a disclosure so each tab leads with the
  // controls, not a paragraph.
  function disclosure(summary, ...paragraphs) {
    return el('details', { class: 'g-details' },
      el('summary', {}, summary, el('span', { class: 'btn-ico', html: Sprites.icon('chevron') })),
      el('div', { class: 'g-details-body' }, paragraphs.map((t) => el('p', {}, t))));
  }

  // A role=switch button for Settings. `isOn` reads the saved value and
  // `toggle` saves the flip (and may be async); the switch then shows what was
  // saved, so the screen isn't rebuilt and anything typed elsewhere on it
  // survives.
  function switchButton(label, isOn, toggle, extra = {}) {
    const btn = el('button', {
      class: 'switch', role: 'switch', 'aria-checked': isOn() ? 'true' : 'false', 'aria-label': label,
      ...extra,
      onclick: async () => {
        await toggle();
        btn.setAttribute('aria-checked', isOn() ? 'true' : 'false');
      },
    });
    return btn;
  }

  function avatarPicker(selected, onPick) {
    const row = el('div', { class: 'avatar-picker', role: 'radiogroup', 'aria-label': I18n.t('settings.lookTitle') });
    AVATARS.forEach((a) => {
      const btn = el('button', {
        class: 'avatar-opt' + (a === selected ? ' sel' : ''),
        role: 'radio', 'aria-checked': a === selected ? 'true' : 'false', 'aria-label': I18n.t('avatar.' + a),
        html: Sprites.mascot(a),
        onclick: () => {
          row.querySelectorAll('.avatar-opt').forEach((b) => { b.classList.remove('sel'); b.setAttribute('aria-checked', 'false'); });
          btn.classList.add('sel');
          btn.setAttribute('aria-checked', 'true');
          onPick(a);
        },
      });
      row.appendChild(btn);
    });
    return row;
  }

  // --- Guardian: Colours (active set + readiness + add next) --------------
  // Ready to add the next colour when every active colour is well known over
  // its recent attempts (see js/logic.js for why "recent" beats "lifetime").
  function nextColorToAdd(p) {
    const name = Logic.nextColor(p.activeColors, COLOR_ORDER);
    return name ? CHORD_BY_NAME[name] : undefined;
  }

  function readinessCard(p, next, opts = {}) {
    if (!next) {
      return el('div', { class: 'readiness ready' },
        el('span', { class: 'r-icon', html: Sprites.icon('trophy') }),
        el('div', { class: 'r-title' }, I18n.t('colors.allAdded')),
        el('div', { class: 'r-sub' }, I18n.t('colors.practisingFullSet', { name: p.name })));
    }
    const active = p.activeColors;
    const readyNames = new Set(Logic.readyColors(p.events, active));
    const ready = readyNames.size === active.length;
    // One pip per active colour, ticked once that colour clears the bar —
    // shows which colours are holding things up, not just yes/no.
    const pips = el('div', { class: 'r-pips', 'aria-hidden': 'true' },
      active.map((name) => {
        const c = CHORD_BY_NAME[name];
        const ok = readyNames.has(name);
        return el('span', {
          class: 'r-pip' + (ok ? ' ok' : ''), title: I18n.color(c.name),
          style: `background:${c.swatch};color:${c.text}`,
          html: ok ? Sprites.icon('check') : '',
        });
      }));
    return el('div', { class: 'readiness ' + (ready ? 'ready' : 'notyet') },
      el('span', { class: 'r-icon', html: Sprites.icon(ready ? 'check' : 'hourglass') }),
      el('div', { class: 'r-title' }, ready
        ? I18n.t('colors.readyForNext', { color: I18n.color(next.name) })
        : I18n.plural('colors.someReady', active.length, { ready: readyNames.size })),
      el('div', { class: 'r-sub' }, ready
        ? I18n.t('colors.recognisingReliably', { name: p.name })
        : I18n.t('colors.addNextHint', { color: I18n.color(next.name) })),
      pips,
      ready ? el('div', { class: 'r-actions' },
        el('button', { class: 'primary-btn', onclick: () => { Store.addColor(next.name); renderGuardian('colors'); } },
          el('span', { class: 'btn-swatch', style: `background:${next.swatch}` }), I18n.t('colors.addButton', { color: I18n.color(next.name) })),
        // Progress shows this card too; from there the grown-up may want
        // the whole Colours tab instead of just adding the next colour.
        opts.seeColours ? el('button', { class: 'secondary-btn', onclick: () => renderGuardian('colors') }, I18n.t('progress.seeColours')) : null) : null);
  }

  function guardianColors(body) {
    const p = Store.activeProfile();
    const active = p.activeColors;
    const next = nextColorToAdd(p);
    const lastOne = active.length <= 1;

    const colorRow = (c) => {
      const on = active.includes(c.name);
      const locked = on && lastOne; // the set can't be emptied
      const acc = on ? Logic.recentAccuracy(p.events, c.name, 20, { solo: active.length < 2 }).pct : null;
      return el('button', {
        class: 'g-row',
        'aria-pressed': on ? 'true' : 'false',
        'aria-disabled': locked ? 'true' : null,
        title: locked ? I18n.t('colors.lockedTitle') : null,
        onclick: () => { if (!locked) toggleColor(c.name); },
      },
        el('span', { class: 'row-flag', html: Sprites.flag(c, { picture: p.flagPictures }) }),
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, I18n.color(c.name)),
          el('span', { class: 'g-row-sub', title: I18n.t('colors.chordTitle') },
            I18n.t('colors.chordAndNotes', { chord: I18n.chord(c.chord), notes: I18n.notes(c.notes) }))),
        el('span', { class: 'g-row-end' },
          c === next ? el('span', { class: 'badge' }, I18n.t('colors.next')) : null,
          acc != null ? el('span', {}, acc + '%') : null,
          el('span', { class: 'check' + (on ? ' on' : '') + (locked ? ' locked' : ''), html: Sprites.icon('check') })));
    };
    const list = (colors) => el('div', { class: 'g-card g-list' }, colors.map(colorRow));

    const practising = CHORDS.filter((c) => active.includes(c.name));
    const core = CHORDS.filter((c) => !c.advanced && !active.includes(c.name));
    const advanced = CHORDS.filter((c) => c.advanced && !active.includes(c.name));

    body.appendChild(readinessCard(p, next));
    body.appendChild(section(I18n.t('colors.practisingSection', { count: practising.length }), list(practising),
      lastOne ? I18n.t('colors.lastOneHint') : I18n.t('colors.percentagesHint')));
    if (core.length) body.appendChild(section(I18n.t('colors.upNext'), list(core), I18n.t('colors.upNextHint')));
    if (advanced.length) body.appendChild(section(I18n.t('colors.advanced'), list(advanced), I18n.t('colors.advancedHint')));
    body.appendChild(disclosure(I18n.t('colors.howIntroducedSummary'),
      I18n.t('colors.howIntroducedP1'),
      I18n.t('colors.howIntroducedP2')));
  }

  function toggleColor(name) {
    const p = Store.activeProfile();
    if (p.activeColors.includes(name)) {
      if (p.activeColors.length <= 1) return; // shown locked in guardianColors
      Store.removeColor(name);
    } else {
      Store.addColor(name);
    }
    renderGuardian('colors');
  }

  // --- Guardian: Progress -------------------------------------------------
  const fmtDay = (ts) => I18n.date(ts, { weekday: 'short', day: 'numeric', month: 'short' });

  function dayLabel(ts) {
    const day = new Date(ts);
    day.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((startOfToday() - day.getTime()) / 86400000);
    if (daysAgo === 0) return I18n.t('progress.today');
    if (daysAgo === 1) return I18n.t('progress.yesterday');
    return fmtDay(ts);
  }

  function statTile(label, value, note) {
    return el('div', { class: 'stat-tile' },
      el('div', { class: 'stat-label' }, label),
      el('div', { class: 'stat-value' }, value),
      el('div', { class: 'stat-note' }, note));
  }

  // First-try accuracy per day as columns, with a reference line at the
  // 90% readiness level. One series, so no legend: the title names it. Each
  // column is focusable and shows a tooltip; a visually hidden table
  // carries the same numbers for screen readers.
  function accuracyChart(days) {
    const chart = el('div', { class: 'chart', style: `--days:${days.length}` },
      el('div', { class: 'chart-head' },
        el('div', { class: 'chart-title' }, I18n.t('progress.chartTitle')),
        el('div', { class: 'chart-sub' }, I18n.t('progress.chartSub'))));
    if (!days.some((d) => d.seen)) {
      chart.appendChild(el('p', { class: 'chart-empty' }, I18n.t('progress.chartEmpty')));
      return chart;
    }

    const describe = (d) => (d.seen ? I18n.t('progress.dayDescribe', { pct: d.pct, correct: d.correct, seen: d.seen }) : I18n.t('progress.noPractice'));
    const tip = el('div', { class: 'chart-tip', hidden: true });
    const plot = el('div', { class: 'chart-plot' });
    [100, 50, 0].forEach((v) => {
      plot.appendChild(el('div', { class: 'chart-grid', style: `top:${100 - v}%` }));
      plot.appendChild(el('span', { class: 'chart-ylabel', style: `top:${100 - v}%` }, v + '%'));
    });
    plot.appendChild(el('div', { class: 'chart-goal', style: 'top:10%' }));

    function showTip(col, d) {
      if (!col.getBoundingClientRect) return;
      clear(tip);
      tip.appendChild(el('strong', {}, fmtDay(d.start)));
      tip.appendChild(document.createTextNode(describe(d)));
      tip.hidden = false;
      const box = chart.getBoundingClientRect();
      const r = col.getBoundingClientRect();
      const barTop = d.seen ? r.top + r.height * (1 - d.pct / 100) : r.bottom;
      const half = tip.offsetWidth / 2;
      const x = Math.min(Math.max(r.left - box.left + r.width / 2, half + 4), box.width - half - 4);
      tip.style.left = x + 'px';
      tip.style.top = (barTop - box.top - 8) + 'px';
    }
    const hideTip = () => { tip.hidden = true; };

    const cols = el('div', { class: 'chart-cols' }, days.map((d) => {
      const col = el('div', {
        class: 'chart-col', tabindex: '0', 'aria-label': I18n.t('progress.dayAria', { day: fmtDay(d.start), describe: describe(d) }),
        onmouseenter: () => showTip(col, d), onfocus: () => showTip(col, d),
        onmouseleave: hideTip, onblur: hideTip,
      }, d.seen ? el('div', { class: 'chart-bar', style: `height:${d.pct}%` }) : null);
      return col;
    }));
    plot.appendChild(cols);

    const last = days.length - 1;
    chart.appendChild(plot);
    chart.appendChild(el('div', { class: 'chart-x', 'aria-hidden': 'true' },
      days.map((d, i) => el('span', { class: i === last ? 'today' : '' }, String(new Date(d.start).getDate())))));
    chart.appendChild(tip);
    chart.appendChild(el('table', { class: 'sr-only' },
      el('caption', {}, I18n.t('progress.chartTitle')),
      el('tr', {}, el('th', {}, I18n.t('progress.dayColumn')), el('th', {}, I18n.t('progress.accuracyColumn'))),
      days.map((d) => el('tr', {}, el('td', {}, fmtDay(d.start)), el('td', {}, describe(d))))));
    return chart;
  }

  function guardianProgress(body) {
    const p = Store.activeProfile();
    const days = Logic.dailyAccuracy(p.events, { days: 14 });
    const seen = days.reduce((n, d) => n + d.seen, 0);
    const right = days.reduce((n, d) => n + d.correct, 0);

    // The same card as the Colours tab, but only when there's something to
    // act on, so Progress stays about progress the rest of the time.
    const readyNext = Logic.readyForNext(p, COLOR_ORDER);
    if (readyNext) body.appendChild(readinessCard(p, CHORD_BY_NAME[readyNext], { seeColours: true }));

    body.appendChild(el('div', { class: 'stat-tiles' },
      statTile(I18n.t('progress.setsToday'), String(setsToday(p)), I18n.t('progress.aimFiveSets')),
      statTile(I18n.t('progress.last14Days'), seen ? Math.round((right / seen) * 100) + '%' : '—',
        seen ? I18n.t('progress.rightFirstTime', { right, seen }) : I18n.t('progress.noPracticeYet'))));
    body.appendChild(el('div', { class: 'g-card' }, accuracyChart(days)));

    // Cadence: the method asks for about five short sets a day. One column
    // of five dots per day, filled per set played (more than five still
    // shows five; the tooltip has the real count).
    const setDays = Logic.dailySets(p.sessions, { days: 14 });
    body.appendChild(section(I18n.t('progress.setsPerDay'), el('div', { class: 'g-card' },
      el('div', {
        class: 'sets-grid', style: `--days:${setDays.length}`, role: 'img',
        'aria-label': I18n.t('progress.setsPerDayAria', { list: setDays.map((d) => `${fmtDay(d.start)} ${d.sets}`).join(', ') }),
      }, setDays.map((d) => el('div', { class: 'sets-col', title: I18n.plural('progress.setsTooltip', d.sets, { day: fmtDay(d.start) }) },
        Array.from({ length: 5 }, (_, i) => el('span', { class: 'sets-dot' + (i < d.sets ? ' on' : '') }))))),
      el('div', { class: 'sets-x', 'aria-hidden': 'true' },
        el('span', {}, I18n.date(setDays[0].start, { day: 'numeric', month: 'short' })),
        el('span', { class: 'today' }, I18n.t('progress.today')))),
      I18n.t('progress.eachDotHint')));

    const grid = el('div', { class: 'acc-grid' });
    p.activeColors.forEach((name) => {
      const c = CHORD_BY_NAME[name];
      const recent = Logic.recentAccuracy(p.events, name, 20, { solo: p.activeColors.length < 2 });
      const s = p.stats[name] || { correct: 0, seen: 0 };
      grid.appendChild(el('div', { class: 'acc-row' },
        el('span', { class: 'acc-name' }, el('span', { class: 'swatch sm', style: `background:${c.swatch}` }), I18n.color(c.name)),
        el('div', { class: 'acc-track' }, el('div', { class: 'acc-fill', style: `width:${recent.pct || 0}%;background:${c.swatch}` })),
        el('div', { class: 'acc-nums' },
          el('div', { class: 'acc-pct' }, recent.pct == null ? '—' : recent.pct + '%'),
          el('div', { class: 'acc-life' }, s.seen ? I18n.t('progress.allTime', { correct: s.correct, seen: s.seen }) : I18n.t('progress.notTriedYet')))));
    });
    const anyPractice = p.activeColors.some((n) => p.stats[n]);
    body.appendChild(section(I18n.t('progress.accuracyByColour'), el('div', { class: 'g-card' }, grid),
      anyPractice ? I18n.t('progress.rightFirstTimeHint') : I18n.t('progress.noPracticeRecorded', { done: I18n.t('guardian.done') })));

    // Visible but explicitly separate from the accuracy/readiness signal —
    // real-piano detection accuracy hasn't been validated the way the
    // digital method has (see js/logic.js's `src !== 'mic'` filters).
    const micEvents = p.events.filter((e) => e.src === 'mic');
    if (micEvents.length) {
      const matched = micEvents.filter((e) => e.ok).length;
      body.appendChild(section(I18n.t('progress.realPianoPractice'), el('div', { class: 'g-card g-list' },
        el('div', { class: 'g-row' },
          el('span', { class: 'g-row-main' }, el('span', { class: 'g-row-title' }, I18n.plural('progress.attempts', micEvents.length))),
          el('span', { class: 'g-row-end' }, I18n.t('progress.matched', { count: matched })))),
        I18n.t('progress.realPianoHint')));
    }

    if (p.sessions.length) {
      const list = el('div', { class: 'g-card g-list' });
      let lastDay = null;
      p.sessions.slice(0, 10).forEach((se) => {
        const day = new Date(se.ts).toDateString();
        if (day !== lastDay) { list.appendChild(el('div', { class: 's-day' }, dayLabel(se.ts))); lastDay = day; }
        const pct = se.rounds ? Math.round((se.correct / se.rounds) * 100) : null;
        list.appendChild(el('div', { class: 's-row' },
          el('span', { class: 's-time' }, I18n.time(se.ts, { hour: '2-digit', minute: '2-digit' })),
          el('span', { class: 's-main' },
            se.rounds ? I18n.t('progress.rightOf', { correct: se.correct, rounds: se.rounds }) : I18n.t('progress.noRoundsFinished'),
            se.early ? el('span', { class: 'badge muted' }, I18n.t('progress.stoppedEarly')) : null,
            se.src === 'mic' ? el('span', { class: 'badge muted' }, I18n.t('progress.realPianoBadge')) : null),
          el('span', { class: 's-pct' }, pct == null ? '' : pct + '%')));
      });
      body.appendChild(section(I18n.t('progress.recentSessions'), list));
    } else {
      body.appendChild(section(I18n.t('progress.recentSessions'), el('div', { class: 'g-card pad' },
        el('p', { class: 'g-caption' }, I18n.t('progress.finishedSetsHere')))));
    }

    // Mix-ups: which wrong colour a child taps most often for each target,
    // so a grown-up can see patterns a single accuracy number would hide.
    const mixups = Logic.confusions(p.events);
    if (mixups.length) {
      const list = el('div', { class: 'g-card g-list' }, mixups.map((m) => {
        const target = CHORD_BY_NAME[m.target];
        const answered = CHORD_BY_NAME[m.answered];
        return el('div', { class: 'cf-row' },
          el('span', { class: 'swatch sm', style: `background:${target.swatch}` }),
          el('span', { class: 'cf-label' }, I18n.color(target.name)),
          el('span', { class: 'cf-as' }, I18n.t('progress.mistakenFor')),
          el('span', { class: 'swatch sm', style: `background:${answered.swatch}` }),
          el('span', { class: 'cf-label' }, I18n.color(answered.name)),
          el('span', { class: 'cf-count' }, I18n.t('progress.countTimes', { count: m.count })));
      }));
      body.appendChild(section(I18n.t('progress.mixups'), list, I18n.t('progress.mixupsHint')));
    }

    body.appendChild(el('div', {},
      el('button', { class: 'secondary-btn', onclick: () => exportData(p) },
        el('span', { class: 'btn-ico', html: Sprites.icon('download') }), I18n.t('progress.exportButton'))));
  }

  function exportData(p) {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `chord-garden-${p.name}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // --- Guardian: Children (profiles) --------------------------------------
  function guardianProfiles(body) {
    const data = Store.all();
    const list = el('div', { class: 'g-card g-list' });
    data.profiles.forEach((pr) => {
      const active = pr.id === data.activeProfileId;
      const readyNext = Logic.readyForNext(pr, COLOR_ORDER);
      list.appendChild(el('div', { class: 'profile-item' },
        el('button', {
          class: 'g-row', 'aria-current': active ? 'true' : null,
          onclick: () => { Store.setActiveProfile(pr.id); syncPianoVariety(); renderGuardian('profiles'); },
        },
          el('span', { class: 'avatar-row', html: Sprites.mascot(pr.avatar) }),
          el('span', { class: 'g-row-main' },
            el('span', { class: 'g-row-title' }, pr.name),
            el('span', { class: 'g-row-sub' }, I18n.t('children.summary', {
              colours: I18n.plural('children.colourCount', pr.activeColors.length),
              sets: I18n.plural('children.setCount', pr.sessions.length),
            })),
            readyNext ? el('span', { class: 'g-row-ready' },
              el('span', { class: 'btn-ico', html: Sprites.icon('check') }),
              I18n.t('colors.readyForNext', { color: I18n.color(readyNext) })) : null),
          active ? el('span', { class: 'g-row-end' }, el('span', { class: 'badge' }, I18n.t('common.playing'))) : null),
        data.profiles.length > 1 ? el('button', {
          class: 'row-remove', 'aria-label': I18n.t('children.removeAria', { name: pr.name }),
          onclick: () => openDialog({
            title: I18n.t('children.removeTitle', { name: pr.name }),
            body: I18n.t('children.removeBody', { name: pr.name }),
            confirmLabel: I18n.t('children.removeConfirm'), danger: true,
            onConfirm: () => { Store.removeProfile(pr.id); syncPianoVariety(); renderGuardian('profiles'); },
          }),
        }, I18n.t('children.removeConfirm')) : null));
    });
    body.appendChild(section(I18n.t('children.onThisDevice'), list, I18n.t('children.tapToSwitch')));

    let name = '';
    let avatar = AVATARS[0];
    const nameInput = el('input', {
      class: 'text-input', type: 'text', placeholder: I18n.t('children.namePlaceholder'), maxlength: '20', 'aria-label': I18n.t('children.nameAria'),
      oninput: (e) => { name = e.target.value; },
    });
    body.appendChild(section(I18n.t('children.addChildSection'), el('div', { class: 'g-card pad form-stack' },
      nameInput,
      avatarPicker(avatar, (a) => { avatar = a; }),
      el('div', {}, el('button', { class: 'primary-btn', onclick: () => {
        Store.addProfile(name.trim() || I18n.t('child.defaultName'), avatar);
        syncPianoVariety();
        renderGuardian('profiles');
      } }, I18n.t('children.addChildButton'))))));
  }

  // --- Guardian: Settings -------------------------------------------------
  // Language and note names are whole-device preferences (like the PIN), so
  // they read/write Store's top-level getters/setters, not updateProfile —
  // and both go through I18n's own setter too, so the rest of this render
  // (built after these two rows) immediately reflects the new choice.
  function languageSection() {
    const langPref = Store.getLanguage();
    const langOptions = [{ value: 'auto', label: I18n.t('settings.language.automatic') },
      ...I18n.LANGUAGES.map((l) => ({ value: l.code, label: l.name }))];
    const langSeg = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': I18n.t('settings.language.section') },
      langOptions.map((opt) => el('button', {
        class: 'seg' + (langPref === opt.value ? ' sel' : ''),
        role: 'radio', 'aria-checked': langPref === opt.value ? 'true' : 'false',
        onclick: () => { Store.setLanguage(opt.value); I18n.setLanguage(opt.value); renderGuardian('settings'); },
      }, opt.label)));
    const detected = I18n.LANGUAGES.find((l) => l.code === I18n.detectLanguage()) || I18n.LANGUAGES[0];

    const notePref = Store.getNoteNames();
    const noteOptions = [
      { value: 'auto', label: I18n.t('settings.language.automatic') },
      { value: 'letters', label: I18n.t('settings.noteNames.letters') },
      { value: 'solfege', label: I18n.t('settings.noteNames.solfege') },
    ];
    const noteSeg = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': I18n.t('settings.noteNames.section') },
      noteOptions.map((opt) => el('button', {
        class: 'seg' + (notePref === opt.value ? ' sel' : ''),
        role: 'radio', 'aria-checked': notePref === opt.value ? 'true' : 'false',
        onclick: () => { Store.setNoteNames(opt.value); I18n.setNoteNames(opt.value); renderGuardian('settings'); },
      }, opt.label)));

    // Each footnote sits inside its own row, under its control: as a loose
    // child of the card it had none of the row's padding and ran into the
    // card's edge.
    return section(I18n.t('settings.language.sectionTitle'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row stack' }, el('span', { class: 'g-row-title' }, I18n.t('settings.language.section')), langSeg,
        el('span', { class: 'g-row-sub' }, I18n.t('settings.language.footnoteAuto', { language: detected.name }))),
      el('div', { class: 'g-row stack' }, el('span', { class: 'g-row-title' }, I18n.t('settings.noteNames.section')), noteSeg,
        el('span', { class: 'g-row-sub' }, I18n.t('settings.noteNames.footnote')))));
  }

  // The piano files are CC BY 3.0, so the credit (with a link to the licence)
  // sits in the grown-up About text. The sentence keeps a {licence}
  // placeholder so each language can put the link where it reads naturally.
  function pianoCredit() {
    const [before, after = ''] = I18n.t('settings.aboutPiano').split('{licence}');
    return el('p', {}, before,
      el('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener' },
        I18n.t('settings.aboutPianoLicence')),
      after);
  }

  // The version row + manual "Check for updates" — see js/updates.js for the
  // actual mechanics. The status line starts already showing "Updated to
  // version N." when this session just started right after an update
  // (updatedTo, set once at boot below); a manual check overwrites it with
  // its own outcome, same as any other button-triggered status message.
  function aboutSection() {
    const status = el('span', { class: 'g-row-sub about-status', 'aria-live': 'polite' },
      updatedTo ? I18n.t('settings.about.updated', { version: updatedTo }) : '');
    const checkBtn = el('button', {
      class: 'secondary-btn',
      onclick: async () => {
        checkBtn.disabled = true;
        status.classList.remove('bad');
        status.textContent = I18n.t('settings.about.checking');
        // check() can take up to ~20 s; the grown-up may have left Settings by then
        // (and a child started a set), so only apply if this screen is still up.
        // Otherwise Home applies the waiting update the next time it shows.
        const generation = screenGeneration;
        const result = await Updates.check();
        if (result === 'ready') {
          if (generation !== screenGeneration) return;
          // A reload is imminent — leave the button disabled rather than
          // re-enabling it for an instant right before the page goes away.
          status.textContent = I18n.t('settings.about.updating');
          Updates.apply();
          return;
        }
        checkBtn.disabled = false;
        status.textContent = {
          unsupported: I18n.t('settings.about.unsupported'),
          offline: I18n.t('settings.about.offline'),
          none: I18n.t('settings.about.upToDate'),
        }[result] || '';
        if (result === 'offline') status.classList.add('bad');
      },
    }, I18n.t('settings.about.check'));

    return section(I18n.t('settings.about.section'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row' },
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, I18n.t('settings.about.version', { version: APP_VERSION })),
          status),
        checkBtn)),
      I18n.t('settings.about.footnote'));
  }

  function guardianSettings(body) {
    const p = Store.activeProfile();

    body.appendChild(languageSection());

    const lengths = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': I18n.t('settings.roundsPerSet') });
    [10, 15, 20, 25].forEach((n) => {
      const btn = el('button', {
        class: 'seg' + (p.roundsPerSet === n ? ' sel' : ''),
        role: 'radio', 'aria-checked': p.roundsPerSet === n ? 'true' : 'false',
        onclick: () => {
          Store.updateProfile(p.id, { roundsPerSet: n });
          lengths.querySelectorAll('.seg').forEach((b) => { b.classList.remove('sel'); b.setAttribute('aria-checked', 'false'); });
          btn.classList.add('sel');
          btn.setAttribute('aria-checked', 'true');
        },
      }, String(n));
      lengths.appendChild(btn);
    });
    body.appendChild(section(I18n.t('settings.practiceSection'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row stack' }, el('span', { class: 'g-row-title' }, I18n.t('settings.roundsPerSet')), lengths)),
      I18n.t('settings.practiceHint')));

    // Signals for "a new colour is ready": both whole-device settings. The
    // badge needs the Badging API, and iPhone/iPad only allow it once
    // notifications are permitted (Chord Garden never sends any).
    const badgeSupported = typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function';
    const notifBlocked = () => typeof Notification !== 'undefined' && Notification.permission === 'denied';
    const dotSwitch = switchButton(I18n.t('settings.newColour.dot'), () => Store.getLockDot(),
      () => { Store.setLockDot(!Store.getLockDot()); });
    const badgeKey = () => (!badgeSupported ? 'settings.newColour.badgeUnsupported'
      : Store.getIconBadge() && notifBlocked() ? 'settings.newColour.badgeBlocked' : 'settings.newColour.badgeSub');
    const badgeSub = el('span', { class: 'g-row-sub' }, I18n.t(badgeKey()));
    // Asking for permission can change whether the sub-line says "blocked",
    // so it is re-read after the save.
    const badgeSwitch = switchButton(I18n.t('settings.newColour.badge'), () => badgeSupported && Store.getIconBadge(), async () => {
      if (!Store.getIconBadge()) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
        }
        Store.setIconBadge(true);
      } else {
        Store.setIconBadge(false);
      }
      syncIconBadge();
      badgeSub.textContent = I18n.t(badgeKey());
    }, { disabled: badgeSupported ? null : 'true' });
    body.appendChild(section(I18n.t('settings.newColour.section'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row' },
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, I18n.t('settings.newColour.dot')),
          el('span', { class: 'g-row-sub' }, I18n.t('settings.newColour.dotSub'))),
        dotSwitch),
      el('div', { class: 'g-row' },
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, I18n.t('settings.newColour.badge')),
          badgeSub),
        badgeSwitch)),
      I18n.t('settings.newColour.hint')));

    const pictureSwitch = switchButton(I18n.t('settings.picturesAria'), () => p.flagPictures,
      () => { Store.updateProfile(p.id, { flagPictures: !p.flagPictures }); });
    body.appendChild(section(I18n.t('settings.flagsSection'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row' },
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, I18n.t('settings.picturesAria'))),
        pictureSwitch)),
      I18n.t('settings.flagsHint')));

    const varietySwitch = switchButton(I18n.t('settings.varietyAria'), () => p.pianoVariety,
      () => { Store.updateProfile(p.id, { pianoVariety: !p.pianoVariety }); syncPianoVariety(); });
    body.appendChild(section(I18n.t('settings.pianoSection'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row' },
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, I18n.t('settings.varietyTitle'))),
        varietySwitch)),
      I18n.t('settings.varietyHint')));

    const micSwitch = switchButton(I18n.t('mic.realPianoMode'), () => p.realPianoMode,
      () => { Store.updateProfile(p.id, { realPianoMode: !p.realPianoMode }); });
    const micSection = section(I18n.t('mic.realPianoMode'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row' },
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, I18n.t('settings.listenToRealPiano')),
          el('span', { class: 'g-row-sub' }, I18n.t('settings.experimental'))),
        micSwitch)),
      I18n.t('mic.explainer'));
    micSection.appendChild(disclosure(I18n.t('mic.howDetectionWorks'),
      I18n.t('mic.detectionP1'),
      I18n.t('mic.detectionP2')));
    body.appendChild(micSection);

    const nameInput = el('input', { class: 'text-input', type: 'text', value: p.name, maxlength: '20', 'aria-label': I18n.t('settings.nameTitle') });
    body.appendChild(section(I18n.t('settings.childSection'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row stack' },
        el('span', { class: 'g-row-title' }, I18n.t('settings.nameTitle')),
        el('div', { class: 'input-row' }, nameInput,
          el('button', { class: 'primary-btn', onclick: () => {
            Store.updateProfile(p.id, { name: nameInput.value.trim() || p.name });
            nameInput.value = p.name;
            refreshGuardianChild();
          } }, I18n.t('common.save')))),
      el('div', { class: 'g-row stack' },
        el('span', { class: 'g-row-title' }, I18n.t('settings.lookTitle')),
        avatarPicker(p.avatar, (a) => { Store.updateProfile(p.id, { avatar: a }); refreshGuardianChild(); })))));

    const pinInput = el('input', {
      class: 'text-input pin-input', type: 'password', inputmode: 'numeric', pattern: '[0-9]*',
      maxlength: '4', placeholder: I18n.t('settings.pinPlaceholder'), autocomplete: 'new-password', 'aria-label': I18n.t('settings.newPinTitle'),
    });
    const pinMsg = el('p', { class: 'form-msg', 'aria-live': 'polite' });
    body.appendChild(section(I18n.t('settings.pinSection'), el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row stack' },
        el('span', { class: 'g-row-title' }, I18n.t('settings.newPinTitle')),
        el('div', { class: 'input-row' }, pinInput,
          el('button', { class: 'primary-btn', onclick: () => {
            const v = pinInput.value.trim();
            if (!/^\d{4}$/.test(v)) {
              pinMsg.textContent = I18n.t('settings.pinInvalid');
              pinMsg.classList.add('bad');
              return;
            }
            Store.setPin(v);
            pinInput.value = '';
            pinMsg.classList.remove('bad');
            pinMsg.textContent = I18n.t('settings.pinSaved');
          } }, I18n.t('common.save'))),
        pinMsg)),
      Store.getPin() === Store.DEFAULT_PIN
        ? I18n.t('settings.pinDemoHint', { pin: Store.DEFAULT_PIN })
        : I18n.t('settings.pinHint')));

    body.appendChild(section(I18n.t('settings.progressSection'), el('div', { class: 'g-card g-list' },
      el('button', { class: 'g-row danger-row', onclick: () => openDialog({
        title: I18n.t('settings.resetTitle', { name: p.name }),
        body: I18n.t('settings.resetBody'),
        confirmLabel: I18n.t('settings.resetConfirm'), danger: true,
        onConfirm: () => { Store.resetProgress(p.id); renderGuardian('settings'); },
      }) }, I18n.t('settings.resetButton')))));

    body.appendChild(aboutSection());
    body.appendChild(el('div', { class: 'about' },
      el('p', {}, I18n.t('settings.aboutP1')),
      el('p', {}, I18n.t('settings.aboutP2')),
      pianoCredit()));
    if (needsHomeScreenNote()) {
      body.appendChild(el('div', { class: 'g-card g-list' },
        el('div', { class: 'g-row stack' },
          el('span', { class: 'g-row-title' }, I18n.t('settings.homeScreen.title')),
          el('span', { class: 'g-row-sub' }, I18n.t('settings.homeScreen.body')))));
    }
  }

  // =======================================================================
  //  Confetti (lightweight, no dependencies)
  // =======================================================================
  // Confetti in the colours the child was just practising (so the burst is
  // "theirs"): petals, circles and little stars, each with its own drift,
  // spin and speed.
  const CONFETTI_SHAPES = ['', 'circle', 'petal', 'star'];
  function burstConfetti(count, chordColors) {
    const layer = document.getElementById('confetti');
    const colors = (chordColors && chordColors.length ? chordColors : CHORDS).map((c) => c.swatch);
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    for (let i = 0; i < count; i++) {
      const duration = 1.8 + Math.random() * 0.9;
      const bit = el('span', {
        class: ('confetti-bit ' + pick(CONFETTI_SHAPES)).trim(),
        style: `left:${Math.random() * 100}vw;background:${pick(colors)};` +
          `animation-delay:${(Math.random() * 0.35).toFixed(2)}s;transform:rotate(${Math.round(Math.random() * 360)}deg);` +
          `--dur:${duration.toFixed(2)}s;--drift:${Math.round((Math.random() - 0.5) * 160)}px;--spin:${Math.round(360 + Math.random() * 540)}deg`,
      });
      layer.appendChild(bit);
      setTimeout(() => bit.remove(), (duration + 0.4) * 1000);
    }
  }

  window.addEventListener('pagehide', () => {
    screenGeneration += 1;
    pendingMicStart = false;
    clearRoundWork();
    session = null;
    MicCapture.stop();
    PianoAudio.stopAll();
  });
  // A suspended app resumes without a reload; catch a day that rolled over
  // while it was away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshHomeForNewDay();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) renderHome();
  });

  // ---- boot --------------------------------------------------------------
  // Apply the saved (or 'auto') language/note-name preferences before the
  // very first render — I18n already boots into the browser's language on
  // its own (see js/i18n.js), but a guardian's saved override has to win.
  I18n.setLanguage(Store.getLanguage());
  I18n.setNoteNames(Store.getNoteNames());

  // A different stored seenVersion means this session just started right
  // after an update (not a first install, where seenVersion is null) —
  // remember that for the About section, then record the version now running
  // either way, so it's only ever shown once per update. "Different", not
  // "older": versions are strings, and the only way to a different one is a
  // release.
  const seenVersion = Store.getSeenVersion();
  if (seenVersion !== null && seenVersion !== APP_VERSION) updatedTo = APP_VERSION;
  Store.setSeenVersion(APP_VERSION);
  syncPianoVariety();

  // Register the service worker and watch for a waiting update. Applying it
  // is only ever safe while the child Home screen is showing (never mid-set,
  // mid-celebration, or during a guardian visit) — see onChildHome above and
  // renderHome's own check for an update that arrives while Home is already
  // showing.
  Updates.init({ onReady: () => { if (onChildHome()) Updates.apply(); } });

  renderHome();
})();
