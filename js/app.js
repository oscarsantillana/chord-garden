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
    const cancel = el('button', { class: 'secondary-btn', onclick: () => close() }, 'Cancel');
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
    clear(app);
    clearGarden(); // every screen but Home shows the bare hills — see renderHome for where it's filled back in
  }

  async function beginPractice(button, error) {
    const generation = screenGeneration;
    // Only the label changes while the piano loads; the disc stays put.
    const labelEl = button.querySelector('.play-label') || button;
    const label = labelEl.textContent;
    button.disabled = true;
    labelEl.textContent = 'Waking the piano…';
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
        ? 'Microphone access was not granted. Please try again or change the real piano setting.'
        : 'Could not start the piano or microphone. Please try again.';
      error.hidden = false;
    }
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
  const STAGE_NAMES = ['not planted yet', 'a seed', 'a sprout', 'growing leaves', 'a bud', 'in bloom'];

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
      layer.appendChild(el('div', {
        class: 'garden-flower',
        style: `left:${(xFrac * 100).toFixed(2)}%;bottom:calc(${((340 - y) / 340 * 100).toFixed(2)}% - 4px)`,
        html: Sprites.plant(Logic.plantStage(day.sets), swatchesOf(day.colors)),
      }));
    });
  }

  // The big round Play button (home and celebration). The label sits inside
  // the button, under the disc, so the whole thing is one tap target.
  function playButton(label, error) {
    const btn = el('button', { class: 'big-start', onclick: () => beginPractice(btn, error) },
      el('span', { class: 'play-disc', html: Sprites.icon('play') }),
      el('span', { class: 'play-label' }, label));
    return btn;
  }

  function renderHome() {
    clearScreen();
    clearConfetti();
    setMode('child');
    const p = Store.activeProfile();
    const colors = activeColorObjects();

    // Today's flags, planted along the hill. Tapping one plays its chord — a
    // self-serve way to prime the chord↔colour pairing (presentation mode)
    // before quizzing begins.
    const flags = el('div', { class: 'today-colors' },
      colors.map((c) => el('button', {
        class: 'today-swatch',
        title: c.label,
        'aria-label': c.label,
        html: Sprites.flag(c),
        onclick: async () => {
          // Presentation-mode taps are best-effort — if the piano hasn't
          // loaded yet, the Play button above is where a real retry with a
          // friendly message happens, so a failure here just stays silent.
          try {
            await PianoAudio.unlock();
            PianoAudio.playChord(c.notes).catch(() => {});
          } catch (e) { /* no-op — see comment above */ }
        },
      })));

    // Today's own plant, growing a stage per Practice Set played today
    // (Logic.plantStage) — a gentle cadence nudge with no numbers and
    // nothing to feel bad about (a seed or a bud just reads "not yet",
    // never "0 of 5"). It's the same plant that joins the garden on the
    // back hill forever once today is over (see renderGarden).
    const { today } = Logic.gardenDays(p.garden);
    const stage = Logic.plantStage(today ? today.sets : 0);
    const todayPlant = el('div', {
      class: 'today-plant', role: 'img', 'aria-label': `Today's flower: ${STAGE_NAMES[stage]}`,
      html: Sprites.plant(stage, swatchesOf(today ? today.colors : [])),
    });

    const startError = el('p', { class: 'start-error', hidden: true },
      'The piano needs the internet the first time — check your connection and try again.');
    const startBtn = playButton('Play', startError);

    const profileStrip = el('header', { class: 'home-top' },
      el('button', { class: 'avatar-chip', title: 'Who is playing?', onclick: openProfilePicker },
        el('span', { class: 'avatar-emoji', html: Sprites.mascot(p.avatar) }),
        el('span', { class: 'avatar-name' }, p.name)),
      el('button', { class: 'gear', title: 'Grown-ups', 'aria-label': 'Grown-up area', onclick: () => renderGuardianGate(), html: Sprites.icon('lock') }));

    app.appendChild(el('section', { class: 'screen home' },
      profileStrip,
      el('div', { class: 'home-main' },
        el('div', { class: 'brand' },
          el('h1', { class: 'brand-title' }, 'Chord Garden'),
          el('p', { class: 'brand-sub' }, 'Listen, then pick the flag')),
        startBtn,
        todayPlant,
        startError),
      el('div', { class: 'home-flags' },
        el('p', { class: 'today-label' }, 'Tap a flag to hear its song'),
        flags)));
    renderGarden(p);
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
        onclick: () => { Store.setActiveProfile(pr.id); close(); renderHome(); },
      }, el('span', { class: 'avatar-row', html: Sprites.mascot(pr.avatar) }),
         el('span', { class: 'g-row-main' }, el('span', { class: 'g-row-title' }, pr.name)),
         active ? el('span', { class: 'g-row-end' }, el('span', { class: 'badge' }, 'Playing')) : null));
    });

    const card = el('div', { class: 'adult dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Who is playing?' },
      el('h3', { class: 'dialog-title' }, 'Who is playing?'),
      list,
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'secondary-btn', onclick: () => close() }, 'Cancel')));
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
            micError.textContent = "This browser can't access the microphone here — real piano mode needs a modern browser.";
            readyBtn.hidden = true;
          } else {
            // Any denial (blocked, dismissed, OS-level) — deliberately not
            // distinguished further, same reasoning as the existing offline-
            // piano error not trying to diagnose DNS vs. CDN-down.
            micError.textContent = "Chord Garden can't hear the piano without microphone access — check your browser's site settings and try again.";
          }
          micError.hidden = false;
        }
      },
    }, 'Ready');

    app.appendChild(el('section', { class: 'screen gate' },
      el('div', { class: 'gate-center' },
        el('div', { class: 'gate-card' },
          el('div', { class: 'gate-lock', html: Sprites.icon('mic') }),
          el('p', { class: 'pin-msg' }, 'Real piano mode'),
          el('p', {}, 'An adult plays chords on a real piano near this device. Chord Garden listens through the microphone to figure out which chord it heard, then your child taps the colour.'),
          el('p', { class: 'g-caption' }, 'The sound is analysed right here in the browser and is never recorded, saved, or sent anywhere.'),
          el('div', { class: 'gate-actions' },
            readyBtn,
            el('button', { class: 'ghost-btn', onclick: renderHome }, 'Not now')),
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
    if (session.showMicRetry || session.current) return 'Paused';
    if (!session.micInput) return 'Checking input…';
    return { sound: 'Sound detected', quiet: 'Input quiet', unavailable: 'Input unavailable' }[session.micInput.state];
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
      html: Sprites.mascot(Store.activeProfile().avatar, baselineMood()),
    });
    const journey = el('div', {
      class: 'vine', role: 'progressbar', 'aria-label': 'Rounds played',
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
       el('span', {}, session.mode === 'mic' ? 'Hear it again' : 'Listen again'));

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
      'aria-label': c.label,
      html: Sprites.flag(c),
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
              el('span', { class: 'round-cue-label' }, 'Got it!'))
          : el('div', { class: 'round-cue mic-wait' + (session.cueing ? '' : ' hidden') },
              el('span', { class: 'round-cue-icon', html: Sprites.icon('mic') }),
              el('span', { class: 'round-cue-label' },
                session.micArmed ? 'Play any colour on the piano!' : 'Get ready…'),
              el('span', { class: 'round-cue-sub' },
                session.micArmed ? 'Chord Garden is listening.' : 'Waiting for a quiet moment.')))
      : null;

    // State D — the safety valve: low confidence or nothing ever stabilised.
    // Nothing here is ever scored/recorded (see nextMicRound()'s
    // onLowConfidence branch) — this shows BEFORE the child can tap
    // anything, so it's the room/mic that didn't cooperate, never the
    // child's answer. Same visual family as .start-error (plain, honest,
    // no "sorry"/"wrong"), laid out centered like .round-cue above it.
    const retryMessage = session.micRetryReason === 'no-input'
      ? 'No microphone signal reached the app. Check the selected input and microphone level in your device settings, then try again.'
      : session.micRetryReason === 'unavailable'
        ? 'Microphone input is unavailable. Check microphone access, then use All done and start again.'
        : 'Sound reached the microphone, but the chord could not be matched. Release the keys, tap Try again, and wait for the piano prompt before playing all three keys together.';
    const micRetry = (session.mode === 'mic' && session.showMicRetry) ? el('div', { class: 'mic-retry' },
      el('p', {}, retryMessage),
      el('div', { class: 'mic-retry-actions' },
        el('button', { class: 'primary-btn', onclick: retryMicRound }, 'Try again'),
        el('button', { class: 'ghost-btn', onclick: skipMicRound }, 'Skip this one'))) : null;

    // Show measured input while polling; permission alone is not evidence
    // that the selected microphone is supplying audio.
    const micPill = session.mode === 'mic' ? el('div', { class: 'mic-pill' },
      el('span', { class: 'mic-pill-icon', html: Sprites.icon('mic') }),
      el('meter', { class: 'mic-meter', min: 0, max: 1, value: 0, 'aria-label': 'Microphone input level' }),
      el('span', { class: 'mic-status' }, micStatus())) : null;

    const stopBtn = el('button', { class: 'calm-stop', onclick: calmStop }, 'All done');

    app.appendChild(el('section', { class: 'screen practice' + (continuing ? ' continuing' : '') },
      el('div', { class: 'practice-top' }, journey, can, stopBtn),
      el('div', { class: 'listen-wrap' }, micPill, listenBtn),
      el('div', { class: 'answers-wrap' }, answers, roundCue, micRetry)));
    fitAnswers();
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
    mascotEl.style.left = x.toFixed(1) + 'px';
    mascotEl.style.top = (vineY(x) - 33).toFixed(1) + 'px';
  }

  // Largest flag that fits every active colour into the space left for
  // answers, trying each column count at the flag's own proportions. Ties
  // go to more columns (wider, shorter layouts). Capped so two colours on a
  // tablet don't become billboards, and floored so a crowded small screen
  // scrolls rather than shrinking flags below a comfortable tap size.
  const FLAG_ASPECT = 110 / 168; // the flag sprite's viewBox
  const GAP_X = 10;
  const GAP_Y = 18;
  const FLAG_MAX_H = 230;
  const FLAG_MIN_H = 96;
  function fitFlags(n, width, height) {
    let best = { cols: 1, h: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const h = Math.min(FLAG_MAX_H,
        (height - GAP_Y * (rows - 1)) / rows,
        (width - GAP_X * (cols - 1)) / cols / FLAG_ASPECT);
      if (h >= best.h) best = { cols, h };
    }
    const h = Math.max(FLAG_MIN_H, Math.floor(best.h));
    return { cols: best.cols, h, w: Math.floor(h * FLAG_ASPECT) };
  }

  function fitAnswers() {
    const wrap = app.querySelector('.answers-wrap');
    const answers = app.querySelector('.answers');
    if (!session || !wrap || !answers || !wrap.clientWidth || !wrap.clientHeight) return;
    const { cols, h, w } = fitFlags(session.colors.length, wrap.clientWidth, wrap.clientHeight);
    answers.style.setProperty('--tile-w', w + 'px');
    answers.style.setProperty('--tile-h', h + 'px');
    answers.style.width = (cols * w + (cols - 1) * GAP_X) + 'px';
  }
  window.addEventListener('resize', () => {
    fitAnswers();
    if (session) drawVine(vineProgress, vineProgress);
    // The garden's flower slots are laid out from window width (renderGarden
    // above), so a rotation/resize on Home needs a redraw to keep them
    // spaced right, same as the vine/flags above.
    if (!session && app.querySelector('.home')) renderGarden(Store.activeProfile());
  });

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
    // round doesn't. Same reasoning applies to the garden: nothing scored
    // means nothing to water, so `watering` stays null and the celebration
    // shows no can at all.
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
      const today = Logic.gardenDays(Store.activeProfile().garden).today;
      watering = { before, after: Logic.plantStage(today.sets), colors: today.colors };
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
    const again = playButton('Play again', startError);

    if (watering === null) {
      // Nothing was scored (a calm stop before any first tap) — there's no
      // plant to water, so this is the old layout minus the stickers row:
      // mascot, title and actions all shown right away.
      PianoAudio.playSparkle(); // non-pitched flourish — see audio.js for why
      app.appendChild(el('section', { class: 'screen celebrate' },
        el('div', { class: 'cele-mascot', html: Sprites.mascot(p.avatar, 'happy') }),
        el('h1', { class: 'cele-title' }, early ? 'Nice listening!' : 'You did it!'),
        el('div', { class: 'cele-actions' }, again, el('button', { class: 'ghost-btn', onclick: renderHome }, 'Home')),
        startError));
      return;
    }

    // Something was scored: today's plant grew, and watering it is the
    // celebration. The plant starts at its stage from BEFORE this set (see
    // finishPractice) and only grows to `watering.after` once the child
    // taps the can — the tap is the reward moment, not just a formality.
    const swatches = swatchesOf(watering.colors);
    const title = el('h1', { class: 'cele-title' }, early ? 'Nice listening!' : 'You did it!');
    const hint = el('p', { class: 'cele-hint' }, 'Tap the can to water your flower');
    const plant = el('div', {
      class: 'cele-plant', role: 'img', 'aria-label': `Today's flower: ${STAGE_NAMES[watering.before]}`,
      html: Sprites.plant(watering.before, swatches),
    });
    const can = el('button', {
      class: 'water-can', 'aria-label': 'Water your flower', html: Sprites.icon('can'),
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
      again, el('button', { class: 'ghost-btn', onclick: renderHome }, 'Home'));

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
        plant.setAttribute('aria-label', `Today's flower: ${STAGE_NAMES[watering.after]}`);
        plant.classList.remove('grow');
        void plant.offsetWidth; // restart the grow animation
        plant.classList.add('grow');
        PianoAudio.playSparkle();
        title.textContent = watering.after === 5 && watering.before < 5
          ? 'Your flower bloomed!'
          : watering.after > watering.before ? 'It grew!' : 'Your flower loves it!';
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
    const msg = el('p', { class: 'pin-msg', 'aria-live': 'polite' }, 'Grown-ups only');

    function refresh() {
      clear(dots);
      for (let i = 0; i < 4; i++) dots.appendChild(el('span', { class: 'pin-dot' + (i < entered.length ? ' filled' : '') }));
    }
    function press(d) {
      if (entered.length >= 4) return;
      entered += d; refresh();
      if (entered.length === 4) {
        if (entered === Store.getPin()) renderGuardian('colors');
        else {
          msg.textContent = 'That PIN didn’t match. Try again.';
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
            class: 'pin-key pin-back', 'aria-label': 'Delete', html: Sprites.icon('backspace'),
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
      el('div', {}, backButton('Back to play', renderHome)),
      el('div', { class: 'gate-center' },
        el('div', { class: 'gate-card' },
          el('div', { class: 'gate-lock', html: Sprites.icon('lock') }),
          msg,
          el('p', { class: 'pin-hint' }, showHint ? `Demo PIN: ${Store.DEFAULT_PIN}` : 'Enter your 4-digit PIN'),
          dots, pad))));
  }

  const GUARDIAN_TABS = [['colors', 'Colours'], ['progress', 'Progress'], ['profiles', 'Children'], ['settings', 'Settings']];

  function renderGuardian(tab) {
    clearScreen();
    setMode('adult');
    const p = Store.activeProfile();
    const tabs = el('nav', { class: 'segmented g-tabs', 'aria-label': 'Grown-up sections' },
      GUARDIAN_TABS.map(([id, lbl]) => el('button', {
        class: 'seg g-tab' + (tab === id ? ' sel' : ''),
        'aria-current': tab === id ? 'page' : null,
        onclick: () => renderGuardian(id),
      }, lbl)));

    const body = el('div', { class: 'g-body' });
    if (tab === 'colors') guardianColors(body);
    else if (tab === 'progress') guardianProgress(body);
    else if (tab === 'profiles') guardianProfiles(body);
    else guardianSettings(body);

    app.appendChild(el('section', { class: 'screen guardian' },
      el('header', { class: 'g-head' },
        backButton('Done', renderHome),
        el('h2', {}, 'Grown-up area'),
        el('span', { class: 'g-child' },
          el('span', { class: 'g-child-ava', html: Sprites.mascot(p.avatar) }),
          p.name)),
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

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function avatarPicker(selected, onPick) {
    const row = el('div', { class: 'avatar-picker', role: 'radiogroup', 'aria-label': 'Look' });
    AVATARS.forEach((a) => {
      const btn = el('button', {
        class: 'avatar-opt' + (a === selected ? ' sel' : ''),
        role: 'radio', 'aria-checked': a === selected ? 'true' : 'false', 'aria-label': a,
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
    const have = new Set(p.activeColors);
    return CHORDS.find((c) => !have.has(c.name));
  }

  function readinessCard(p, next) {
    if (!next) {
      return el('div', { class: 'readiness ready' },
        el('span', { class: 'r-icon', html: Sprites.icon('trophy') }),
        el('div', { class: 'r-title' }, 'All colours added'),
        el('div', { class: 'r-sub' }, `${p.name} is practising the full set.`));
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
          class: 'r-pip' + (ok ? ' ok' : ''), title: c.label,
          style: `background:${c.swatch};color:${c.text}`,
          html: ok ? Sprites.icon('check') : '',
        });
      }));
    return el('div', { class: 'readiness ' + (ready ? 'ready' : 'notyet') },
      el('span', { class: 'r-icon', html: Sprites.icon(ready ? 'check' : 'hourglass') }),
      el('div', { class: 'r-title' }, ready ? `Ready for ${next.label}` : `${readyNames.size} of ${plural(active.length, 'colour')} ready`),
      el('div', { class: 'r-sub' }, ready
        ? `${p.name} is recognising every current colour reliably.`
        : `Add ${next.label} once every colour is at 90% or better over its recent tries.`),
      pips,
      ready ? el('div', { class: 'r-actions' },
        el('button', { class: 'primary-btn', onclick: () => { Store.addColor(next.name); renderGuardian('colors'); } },
          el('span', { class: 'btn-swatch', style: `background:${next.swatch}` }), `Add ${next.label}`)) : null);
  }

  function guardianColors(body) {
    const p = Store.activeProfile();
    const active = p.activeColors;
    const next = nextColorToAdd(p);
    const lastOne = active.length <= 1;

    const colorRow = (c) => {
      const on = active.includes(c.name);
      const locked = on && lastOne; // the set can't be emptied
      const acc = on ? Logic.recentAccuracy(p.events, c.name).pct : null;
      return el('button', {
        class: 'g-row',
        'aria-pressed': on ? 'true' : 'false',
        'aria-disabled': locked ? 'true' : null,
        title: locked ? 'At least one colour stays on' : null,
        onclick: () => { if (!locked) toggleColor(c.name); },
      },
        el('span', { class: 'row-flag', html: Sprites.flag(c) }),
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, c.label),
          el('span', { class: 'g-row-sub', title: 'Chord (grown-up only)' }, 'Chord ' + c.chord)),
        el('span', { class: 'g-row-end' },
          c === next ? el('span', { class: 'badge' }, 'Next') : null,
          acc != null ? el('span', {}, acc + '%') : null,
          el('span', { class: 'check' + (on ? ' on' : '') + (locked ? ' locked' : ''), html: Sprites.icon('check') })));
    };
    const list = (colors) => el('div', { class: 'g-card g-list' }, colors.map(colorRow));

    const practising = CHORDS.filter((c) => active.includes(c.name));
    const core = CHORDS.filter((c) => !c.advanced && !active.includes(c.name));
    const advanced = CHORDS.filter((c) => c.advanced && !active.includes(c.name));

    body.appendChild(readinessCard(p, next));
    body.appendChild(section(`Practising (${practising.length})`, list(practising),
      lastOne ? 'At least one colour always stays on.' : 'Percentages are right-first-time over each colour’s last 20 tries. Tap a colour to turn it off.'));
    if (core.length) body.appendChild(section('Up next', list(core), 'The method adds these one at a time, in this order.'));
    if (advanced.length) body.appendChild(section('Advanced', list(advanced), 'The remaining major chords, for after the first nine.'));
    body.appendChild(disclosure('How colours are introduced',
      'Each colour always stands for the same chord. Introduce new colours one at a time: the classic method adds the next colour only once the current ones are known with near-perfect accuracy, usually about every two weeks.',
      'One colour on its own is pure listening for a brand-new learner. Two or more turn it into real practice at telling chords apart.'));
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
  const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  function dayLabel(ts) {
    const day = new Date(ts);
    day.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((startOfToday() - day.getTime()) / 86400000);
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return 'Yesterday';
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
        el('div', { class: 'chart-title' }, 'First-try accuracy by day'),
        el('div', { class: 'chart-sub' }, 'Last 14 days of app practice. The line marks 90%, the level for adding a colour.')));
    if (!days.some((d) => d.seen)) {
      chart.appendChild(el('p', { class: 'chart-empty' }, 'Practice from the last 14 days will show here.'));
      return chart;
    }

    const describe = (d) => (d.seen ? `${d.pct}%, ${d.correct} of ${d.seen} right first time` : 'No practice');
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
        class: 'chart-col', tabindex: '0', 'aria-label': `${fmtDay(d.start)}: ${describe(d)}`,
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
      el('caption', {}, 'First-try accuracy by day'),
      el('tr', {}, el('th', {}, 'Day'), el('th', {}, 'Accuracy')),
      days.map((d) => el('tr', {}, el('td', {}, fmtDay(d.start)), el('td', {}, describe(d))))));
    return chart;
  }

  function guardianProgress(body) {
    const p = Store.activeProfile();
    const days = Logic.dailyAccuracy(p.events, { days: 14 });
    const seen = days.reduce((n, d) => n + d.seen, 0);
    const right = days.reduce((n, d) => n + d.correct, 0);

    body.appendChild(el('div', { class: 'stat-tiles' },
      statTile('Sets today', String(setsToday(p)), 'Aim for about 5 short sets'),
      statTile('Last 14 days', seen ? Math.round((right / seen) * 100) + '%' : '—',
        seen ? `${right} of ${seen} right first time` : 'No practice yet')));
    body.appendChild(el('div', { class: 'g-card' }, accuracyChart(days)));

    // Cadence: the method asks for about five short sets a day. One column
    // of five dots per day, filled per set played (more than five still
    // shows five; the tooltip has the real count).
    const setDays = Logic.dailySets(p.sessions, { days: 14 });
    body.appendChild(section('Sets per day', el('div', { class: 'g-card' },
      el('div', {
        class: 'sets-grid', style: `--days:${setDays.length}`, role: 'img',
        'aria-label': 'Sets per day, last 14 days: ' + setDays.map((d) => `${fmtDay(d.start)} ${d.sets}`).join(', '),
      }, setDays.map((d) => el('div', { class: 'sets-col', title: `${fmtDay(d.start)}: ${plural(d.sets, 'set')}` },
        Array.from({ length: 5 }, (_, i) => el('span', { class: 'sets-dot' + (i < d.sets ? ' on' : '') }))))),
      el('div', { class: 'sets-x', 'aria-hidden': 'true' },
        el('span', {}, new Date(setDays[0].start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })),
        el('span', { class: 'today' }, 'Today'))),
      'Each dot is one set. Aim for about 5 short sets a day.'));

    const grid = el('div', { class: 'acc-grid' });
    p.activeColors.forEach((name) => {
      const c = CHORD_BY_NAME[name];
      const recent = Logic.recentAccuracy(p.events, name);
      const s = p.stats[name] || { correct: 0, seen: 0 };
      grid.appendChild(el('div', { class: 'acc-row' },
        el('span', { class: 'acc-name' }, el('span', { class: 'swatch sm', style: `background:${c.swatch}` }), c.label),
        el('div', { class: 'acc-track' }, el('div', { class: 'acc-fill', style: `width:${recent.pct || 0}%;background:${c.swatch}` })),
        el('div', { class: 'acc-nums' },
          el('div', { class: 'acc-pct' }, recent.pct == null ? '—' : recent.pct + '%'),
          el('div', { class: 'acc-life' }, s.seen ? `${s.correct}/${s.seen} all time` : 'Not tried yet'))));
    });
    const anyPractice = p.activeColors.some((n) => p.stats[n]);
    body.appendChild(section('Accuracy by colour', el('div', { class: 'g-card' }, grid),
      anyPractice ? 'Right first time over each colour’s last 20 tries.' : 'No practice recorded yet. Tap Done, then let your child play a set.'));

    // Visible but explicitly separate from the accuracy/readiness signal —
    // real-piano detection accuracy hasn't been validated the way the
    // digital method has (see js/logic.js's `src !== 'mic'` filters).
    const micEvents = p.events.filter((e) => e.src === 'mic');
    if (micEvents.length) {
      const matched = micEvents.filter((e) => e.ok).length;
      body.appendChild(section('Real piano practice', el('div', { class: 'g-card g-list' },
        el('div', { class: 'g-row' },
          el('span', { class: 'g-row-main' }, el('span', { class: 'g-row-title' }, plural(micEvents.length, 'attempt'))),
          el('span', { class: 'g-row-end' }, `${matched} matched`))),
        'Kept out of the accuracy figures above until real-piano detection is validated.'));
    }

    if (p.sessions.length) {
      const list = el('div', { class: 'g-card g-list' });
      let lastDay = null;
      p.sessions.slice(0, 10).forEach((se) => {
        const day = new Date(se.ts).toDateString();
        if (day !== lastDay) { list.appendChild(el('div', { class: 's-day' }, dayLabel(se.ts))); lastDay = day; }
        const pct = se.rounds ? Math.round((se.correct / se.rounds) * 100) : null;
        list.appendChild(el('div', { class: 's-row' },
          el('span', { class: 's-time' }, new Date(se.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
          el('span', { class: 's-main' },
            se.rounds ? `${se.correct} of ${se.rounds} right` : 'No rounds finished',
            se.early ? el('span', { class: 'badge muted' }, 'Stopped early') : null,
            se.src === 'mic' ? el('span', { class: 'badge muted' }, 'Real piano') : null),
          el('span', { class: 's-pct' }, pct == null ? '' : pct + '%')));
      });
      body.appendChild(section('Recent sessions', list));
    } else {
      body.appendChild(section('Recent sessions', el('div', { class: 'g-card pad' },
        el('p', { class: 'g-caption' }, 'Finished sets will appear here.'))));
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
          el('span', { class: 'cf-label' }, target.label),
          el('span', { class: 'cf-as' }, 'mistaken for'),
          el('span', { class: 'swatch sm', style: `background:${answered.swatch}` }),
          el('span', { class: 'cf-label' }, answered.label),
          el('span', { class: 'cf-count' }, m.count + '×'));
      }));
      body.appendChild(section('Mix-ups', list, 'The colour that was played, and the colour tapped instead.'));
    }

    body.appendChild(el('div', {},
      el('button', { class: 'secondary-btn', onclick: () => exportData(p) },
        el('span', { class: 'btn-ico', html: Sprites.icon('download') }), 'Export progress (JSON)')));
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
      list.appendChild(el('div', { class: 'profile-item' },
        el('button', {
          class: 'g-row', 'aria-current': active ? 'true' : null,
          onclick: () => { Store.setActiveProfile(pr.id); renderGuardian('profiles'); },
        },
          el('span', { class: 'avatar-row', html: Sprites.mascot(pr.avatar) }),
          el('span', { class: 'g-row-main' },
            el('span', { class: 'g-row-title' }, pr.name),
            el('span', { class: 'g-row-sub' }, `${plural(pr.activeColors.length, 'colour')}, ${plural(pr.sessions.length, 'set')}`)),
          active ? el('span', { class: 'g-row-end' }, el('span', { class: 'badge' }, 'Playing')) : null),
        data.profiles.length > 1 ? el('button', {
          class: 'row-remove', 'aria-label': `Remove ${pr.name}`,
          onclick: () => openDialog({
            title: `Remove ${pr.name}?`,
            body: `This deletes ${pr.name}’s colours and progress from this device. It can’t be undone.`,
            confirmLabel: 'Remove', danger: true,
            onConfirm: () => { Store.removeProfile(pr.id); renderGuardian('profiles'); },
          }),
        }, 'Remove') : null));
    });
    body.appendChild(section('Children on this device', list, 'Tap a child to make them the one playing.'));

    let name = '';
    let avatar = AVATARS[0];
    const nameInput = el('input', {
      class: 'text-input', type: 'text', placeholder: 'Name', maxlength: '20', 'aria-label': "Child's name",
      oninput: (e) => { name = e.target.value; },
    });
    body.appendChild(section('Add a child', el('div', { class: 'g-card pad form-stack' },
      nameInput,
      avatarPicker(avatar, (a) => { avatar = a; }),
      el('div', {}, el('button', { class: 'primary-btn', onclick: () => {
        Store.addProfile(name.trim() || 'Little One', avatar);
        renderGuardian('profiles');
      } }, 'Add child')))));
  }

  // --- Guardian: Settings -------------------------------------------------
  function guardianSettings(body) {
    const p = Store.activeProfile();

    const lengths = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Rounds per set' },
      [10, 15, 20, 25].map((n) => el('button', {
        class: 'seg' + (p.roundsPerSet === n ? ' sel' : ''),
        role: 'radio', 'aria-checked': p.roundsPerSet === n ? 'true' : 'false',
        onclick: () => { Store.updateProfile(p.id, { roundsPerSet: n }); renderGuardian('settings'); },
      }, String(n))));
    body.appendChild(section('Practice', el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row stack' }, el('span', { class: 'g-row-title' }, 'Rounds per set'), lengths)),
      'A standard set is 20 rounds, about 2–3 minutes. Short, frequent sets work best.'));

    const micSwitch = el('button', {
      class: 'switch', role: 'switch', 'aria-checked': p.realPianoMode ? 'true' : 'false', 'aria-label': 'Real piano mode',
      onclick: () => { Store.updateProfile(p.id, { realPianoMode: !p.realPianoMode }); renderGuardian('settings'); },
    });
    const micSection = section('Real piano mode', el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row' },
        el('span', { class: 'g-row-main' },
          el('span', { class: 'g-row-title' }, 'Listen to a real piano'),
          el('span', { class: 'g-row-sub' }, 'Experimental')),
        micSwitch)),
      'A grown-up plays a chord on a nearby piano instead of the app choosing one, and your child still taps the colour. Sound is analysed on this device only; it is never recorded, saved, or sent.');
    micSection.appendChild(disclosure('How real piano detection works',
      'It checks for all three keys, listens for a fresh attack, and uses the lowest key it hears to tell inversions apart.',
      'If the room, instrument, or microphone makes the evidence unclear, it asks to try again instead of assigning a colour.'));
    body.appendChild(micSection);

    const nameInput = el('input', { class: 'text-input', type: 'text', value: p.name, maxlength: '20', 'aria-label': 'Name' });
    body.appendChild(section('Child', el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row stack' },
        el('span', { class: 'g-row-title' }, 'Name'),
        el('div', { class: 'input-row' }, nameInput,
          el('button', { class: 'primary-btn', onclick: () => {
            Store.updateProfile(p.id, { name: nameInput.value.trim() || p.name });
            renderGuardian('settings');
          } }, 'Save'))),
      el('div', { class: 'g-row stack' },
        el('span', { class: 'g-row-title' }, 'Look'),
        avatarPicker(p.avatar, (a) => { Store.updateProfile(p.id, { avatar: a }); renderGuardian('settings'); })))));

    const pinInput = el('input', {
      class: 'text-input pin-input', type: 'password', inputmode: 'numeric', pattern: '[0-9]*',
      maxlength: '4', placeholder: '••••', autocomplete: 'new-password', 'aria-label': 'New PIN',
    });
    const pinMsg = el('p', { class: 'form-msg', 'aria-live': 'polite' });
    body.appendChild(section('Grown-up PIN', el('div', { class: 'g-card g-list' },
      el('div', { class: 'g-row stack' },
        el('span', { class: 'g-row-title' }, 'New PIN'),
        el('div', { class: 'input-row' }, pinInput,
          el('button', { class: 'primary-btn', onclick: () => {
            const v = pinInput.value.trim();
            if (!/^\d{4}$/.test(v)) {
              pinMsg.textContent = 'Enter exactly 4 digits.';
              pinMsg.classList.add('bad');
              return;
            }
            Store.setPin(v);
            pinInput.value = '';
            pinMsg.classList.remove('bad');
            pinMsg.textContent = 'Saved. Use the new PIN next time.';
          } }, 'Save')),
        pinMsg)),
      Store.getPin() === Store.DEFAULT_PIN
        ? `The lock screen shows the demo PIN (${Store.DEFAULT_PIN}) until you set your own. It keeps little fingers out; it isn't real security.`
        : 'It keeps little fingers out of this area; it isn’t real security.'));

    body.appendChild(section('Progress', el('div', { class: 'g-card g-list' },
      el('button', { class: 'g-row danger-row', onclick: () => openDialog({
        title: `Reset ${p.name}’s progress?`,
        body: 'This clears every practice session, accuracy figure and mix-up for this child. Their colours and settings stay. It can’t be undone.',
        confirmLabel: 'Reset progress', danger: true,
        onConfirm: () => { Store.resetProgress(p.id); renderGuardian('settings'); },
      }) }, 'Reset this child’s progress'))));

    body.appendChild(el('div', { class: 'about' },
      el('p', {}, 'Chord Garden uses the Eguchi Chord Identification Method: children aged about 2–6 learn absolute pitch by matching piano chords to fixed colours. Practise about 5 short times a day.'),
      el('p', {}, 'All data stays on this device.')));
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
  window.addEventListener('pageshow', event => {
    if (event.persisted) renderHome();
  });

  // ---- boot --------------------------------------------------------------
  renderHome();
})();
