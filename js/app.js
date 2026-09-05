/*
 * Rainbow Pitch — application logic.
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
  }

  async function beginPractice(button, error) {
    const generation = screenGeneration;
    const label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = 'Waking the piano…';
    error.hidden = true;
    try {
      await PianoAudio.unlock();
      if (generation !== screenGeneration) return;
      if (Store.activeProfile().realPianoMode) await enterRealPianoMode();
      else startPractice('digital');
    } catch (failure) {
      if (generation !== screenGeneration) return;
      button.disabled = false;
      button.innerHTML = label;
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
  function renderHome() {
    clearScreen();
    const p = Store.activeProfile();
    const colors = activeColorObjects();

    // Tapping a swatch plays its chord — a self-serve way to prime the
    // chord↔colour pairing (presentation mode) before quizzing begins.
    const swatches = el('div', { class: 'today-colors' },
      colors.map((c) => el('button', {
        class: 'today-swatch',
        style: `background:${c.swatch};color:${c.text}`,
        title: c.label,
        'aria-label': c.label,
        onclick: async () => {
          // Presentation-mode taps are best-effort — if the piano hasn't
          // loaded yet, the Start button below is where a real retry with a
          // friendly message happens, so a failure here just stays silent.
          try {
            await PianoAudio.unlock();
            PianoAudio.playChord(c.notes).catch(() => {});
          } catch (e) { /* no-op — see comment above */ }
        },
      }, el('span', { class: 'today-dot' }))));

    // Five little stars, one lit per Practice Set played today — a gentle
    // cadence nudge with no numbers and nothing to feel bad about (dim
    // stars are just "not yet", never "0 of 5").
    const setsRow = el('div', { class: 'sets-today', 'aria-label': 'Sets played today' },
      Array.from({ length: 5 }, (_, i) =>
        el('span', { class: 'set-star' + (i < Math.min(setsToday(p), 5) ? ' filled' : ''), html: Sprites.icon('star') })));

    const startError = el('p', { class: 'start-error', hidden: true },
      'The piano needs the internet the first time — check your connection and try again.');
    const startBtn = el('button', {
      class: 'big-start',
      onclick: () => beginPractice(startBtn, startError),
    }, el('span', { class: 'btn-ico', html: Sprites.icon('play') }), 'Start');

    const profileStrip = el('div', { class: 'profile-strip' },
      el('button', { class: 'avatar-chip', title: 'Who is playing?', onclick: openProfilePicker },
        el('span', { class: 'avatar-emoji', html: Sprites.mascot(p.avatar) }),
        el('span', { class: 'avatar-name' }, p.name)),
      el('button', { class: 'gear', title: 'Grown-ups', 'aria-label': 'Grown-up area', onclick: () => renderGuardianGate(), html: Sprites.icon('gear') }));

    app.appendChild(el('section', { class: 'screen home' },
      profileStrip,
      el('div', { class: 'brand' },
        el('div', { class: 'brand-mark', html: Sprites.icon('rainbow') }),
        el('h1', { class: 'brand-title' }, 'Rainbow Pitch'),
        el('p', { class: 'brand-sub' }, 'Listen and tap the colour!')),
      el('div', { class: 'today-panel' },
        el('p', { class: 'today-label' }, "Today's colours"),
        swatches),
      setsRow,
      startBtn,
      startError));
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
    const backdrop = el('div', {
      class: 'overlay-backdrop',
      onclick: (e) => { if (e.target === backdrop) close(); },
    });
    function close() { backdrop.remove(); }

    const list = el('div', { class: 'op-list' });
    data.profiles.forEach((pr) => {
      list.appendChild(el('button', {
        class: 'op-item' + (pr.id === data.activeProfileId ? ' active' : ''),
        onclick: () => { Store.setActiveProfile(pr.id); close(); renderHome(); },
      }, el('span', { class: 'op-avatar', html: Sprites.mascot(pr.avatar) }),
         el('span', { class: 'op-name' }, pr.name)));
    });

    const card = el('div', { class: 'overlay-card profile-picker' },
      el('h3', { class: 'op-title' }, 'Grown-ups: who is playing?'),
      list,
      el('button', { class: 'ghost-btn op-close', onclick: close }, 'Cancel'));
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
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
    const generation = screenGeneration;
    const micError = el('p', { class: 'start-error', hidden: true });
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
            micError.textContent = "Rainbow Pitch can't hear the piano without microphone access — check your browser's site settings and try again.";
          }
          micError.hidden = false;
        }
      },
    }, 'Ready');

    app.appendChild(el('section', { class: 'screen gate' },
      el('div', { class: 'gate-card' },
        el('div', { class: 'gate-lock', html: Sprites.icon('mic') }),
        el('p', { class: 'pin-msg' }, 'Real piano mode'),
        el('p', {}, 'An adult plays chords on a real piano near this device. Rainbow Pitch listens through the microphone to figure out which chord it heard, then your child taps the colour.'),
        el('p', { class: 'g-note' }, 'The sound is analysed right here in the browser and is never recorded, saved, or sent anywhere.'),
        el('div', { class: 'gate-actions' },
          readyBtn,
          el('button', { class: 'ghost-btn', onclick: renderHome }, 'Not now')),
        micError)));
  }

  // =======================================================================
  //  PRACTICE  (Practice Set)
  // =======================================================================
  let session = null;

  // The journey mascot's last-rendered position (0–100, a % of the path),
  // kept outside `session` because renderPractice() rebuilds the whole
  // screen every round — this is what lets the mascot animate FROM its old
  // spot TO its new one across that rebuild instead of just popping there.
  // See renderPractice() for how it's used.
  let mascotPct = 0;

  function startPractice(mode = 'digital') {
    const p = Store.activeProfile();
    const colors = activeColorObjects();
    session = {
      colors,
      total: p.roundsPerSet,
      index: 0,
      correct: 0,
      current: null,
      repeat: 0,        // consecutive count of the current colour
      attempted: false, // whether this round already counted toward stats
      misses: 0,        // wrong taps so far this round
      locked: false,
      cueing: false,    // true while the "Listen…" cue is showing, pre-chord
      roundId: 0,
      timers: new Set(),
      streak: 0,        // consecutive FIRST-ATTEMPT-correct rounds; any miss resets it
      mode,             // 'digital' (app picks + plays) or 'mic' (real piano)
      micListen: null,   // cancellable handle for the current mic round
      micArmed: false,   // flips true after FreshChordGate has a calm baseline
    };
    mascotPct = 0;
    renderPractice();
    nextRound();
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
    if (answersEl) answersEl.classList.remove('waiting');
    const cueEl = app.querySelector('.round-cue');
    if (cueEl) cueEl.classList.add('hidden'); // the cue's job is done once answers unlock
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
    // Stop any still-ringing sound from the PREVIOUS round (the reward replay
    // or a two-miss reveal chord) right away, so its release fade happens
    // during this round's cue beat instead of bleeding into the new chord
    // below.
    clearRoundWork();
    session.current = pickTarget();
    session.attempted = false;
    session.misses = 0;
    // Locked from render until the chord has actually sounded — a fast tap
    // that lands before any sound plays is a guess, not a listen, and would
    // pollute stats. `roundId` guards against a stray unlock from a stale
    // playChord promise if the round moves on before it resolves.
    session.locked = true;
    session.cueing = true; // shows the "Listen…" overlay until the chord below sounds
    const roundId = session.roundId = ++roundSequence;
    renderPractice();
    const notes = session.current.notes;
    // Timings: a beat longer than before (was 500/900ms) to give the stopAll
    // fade above and the prominent "Listen…" overlay + double-tick cue room
    // to land as their own unmistakable "new round, ears on" moment —
    // otherwise the previous chord's tail and this round's chord blur into
    // one stream of piano.
    scheduleRound(() => {
      if (!session || session.roundId !== roundId) return;
      PianoAudio.playCue();
    }, 600);
    scheduleRound(() => {
      if (!session) return;
      // If the chord genuinely fails to play (e.g. the sampler load timed
      // out), unlock the answer grid anyway — a silent, chordless round is
      // better than a frozen screen the child can't get past.
      PianoAudio.playChord(notes).then(() => unlockAnswers(roundId), () => unlockAnswers(roundId));
    }, 1050);
  }

  // Which colours the adult may play from in real-piano mode — always the
  // full active set (decision #8: the adult chooses what to play, so there
  // is no pre-selected target and Logic.pickWeighted doesn't apply here).
  function activeChordsForSession() { return session.colors; }

  // Real-piano mode's round-start flow, standing in for nextRound()'s body
  // when session.mode === 'mic' — see nextRound()'s branch above. Renders a
  // brief "Get ready…" baseline state, then changes to "Play any colour…"
  // only when FreshChordGate is genuinely armed. Every other bit of round
  // bookkeeping (attempted/misses/locked/roundId) mirrors the digital flow
  // exactly, so onAnswer()/renderPractice() needs no mode check of its own.
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
    session.misses = 0;
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
  // journey step" precedent as the existing two-miss reveal path — advances
  // past this round without ever scoring it, then moves on to the next one.
  function skipMicRound() {
    if (!session) return;
    session.showMicRetry = false;
    session.index += 1;
    nextRound();
  }

  function renderPractice() {
    clearScreen();
    // How far along the set the child is, as a % of the journey path — the
    // mascot walks to this spot and the flag marks the end (session.total).
    const targetPct = session.total > 0 ? Math.min(100, (session.index / session.total) * 100) : 0;

    const track = el('div', { class: 'journey-track' },
      Array.from({ length: session.total }, (_, i) =>
        el('span', {
          class: 'journey-step' + (i < session.index ? ' done' : i === session.index ? ' now' : ''),
          // Same (i / total) * 100 formula as the mascot's own `left` below,
          // so the "now" dot and the mascot never drift apart — see the
          // .journey-step comment in styles.css for why they used to.
          style: `left:${(i / session.total) * 100}%`,
        })));

    // The mascot itself — same #mascot id as before, so setMascotMood() and
    // cheer()'s .happy hop keep working untouched. It's placed at its OLD
    // spot (mascotPct) here, then nudged to the new one a frame later so the
    // CSS transition on `left` has something to animate between; without
    // that two-step, a full re-render would just make it appear already at
    // the new spot with nothing to see move.
    const mascotEl = el('div', {
      class: 'journey-mascot', id: 'mascot', style: `left:${mascotPct}%`,
      html: Sprites.mascot(Store.activeProfile().avatar, baselineMood()),
    });
    requestAnimationFrame(() => requestAnimationFrame(() => { mascotEl.style.left = targetPct + '%'; }));
    mascotPct = targetPct;

    const journey = el('div', { class: 'journey' },
      el('div', { class: 'journey-path' }, track, mascotEl),
      el('span', { class: 'journey-flag', 'aria-hidden': 'true', html: Sprites.icon('flag') }));

    // In mic mode there's nothing to replay until a chord has actually been
    // heard (State A has no session.current yet) — the button only appears
    // once it does, relabelled "Hear it again" (the app replaying its own
    // best guess) rather than "Listen again" (which implies a pre-announced
    // target, true only in digital mode). Wiring is identical either way.
    const listenBtn = (session.mode === 'mic' && !session.current) ? null : el('button', {
      class: 'listen-btn',
      onclick: () => PianoAudio.playChord(session.current.notes).catch(() => {}),
    }, el('span', { class: 'listen-icon', html: Sprites.icon('speaker') }),
       el('span', {}, session.mode === 'mic' ? 'Hear it again' : 'Listen again'));

    // Adaptive columns so any number of colours fits the screen without
    // horizontal scrolling; the grid fills the space left below the controls.
    const n = session.colors.length;
    const cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    // If the last row isn't full, its buttons can't be centered by picking
    // a discrete grid-column (there's often no integer "middle" — e.g. one
    // leftover button in a 2-column grid). Instead the leftover buttons are
    // pulled out of the grid's column tracks into their own full-width row
    // (grid-column: 1 / -1) and centered with flexbox, which works for any
    // (cols, remainder) combination. flex-basis approximates each button's
    // width to a normal grid column so it doesn't look mismatched.
    const rem = n % cols;
    const fullCount = n - rem;
    // Dimmed + non-interactive while locked waiting for the chord to sound,
    // so an eager tap can't land before there's anything to listen to.
    const makeAnswerBtn = (c) => el('button', {
      class: 'color-btn',
      'data-color': c.name,
      'aria-label': c.label,
      style: `background:${c.swatch};color:${c.text}`,
      onclick: () => onAnswer(c),
    }, el('span', { class: 'color-face', html: Sprites.shape(c.shape) }));

    const answerItems = session.colors.slice(0, fullCount).map(makeAnswerBtn);
    if (rem > 0) {
      answerItems.push(el('div', {
        class: 'answers-trailing',
        style: `grid-column:1 / -1;--cols:${cols}`,
      }, session.colors.slice(fullCount).map(makeAnswerBtn)));
    }
    const answers = el('div', { class: 'answers' + (session.locked ? ' waiting' : ''), style: `grid-template-columns:repeat(${cols},1fr)` },
      answerItems);

    // A prominent "get ready" overlay, centered directly over the answers
    // grid, visible only while session.cueing is true (see nextRound(),
    // which flips it off — and adds `.hidden` here — once the chord has
    // actually sounded). It's `pointer-events: none` so it never blocks a
    // tap once it's fading out mid-transition. This replaces the old tiny
    // journey-path pill, which was too subtle for a child to actually notice
    // a new round was starting.
    //
    // Real-piano mode reuses this exact overlay for three states: baseline
    // ("Get ready…"), armed ("Play any colour…"), and heard ("Got it!").
    let roundCue;
    if (session.mode === 'mic') {
      roundCue = session.current
        ? el('div', { class: 'round-cue mic-heard' + (session.cueing ? '' : ' hidden') },
            el('span', { class: 'round-cue-icon', html: Sprites.icon('check') }),
            el('span', { class: 'round-cue-label' }, 'Got it!'))
        : el('div', { class: 'round-cue mic-wait' + (session.cueing ? '' : ' hidden') },
            el('span', { class: 'round-cue-icon', html: Sprites.icon('mic') }),
            el('span', { class: 'round-cue-label' },
              session.micArmed ? 'Play any colour on the piano!' : 'Get ready…'),
            el('span', { class: 'round-cue-sub g-note' },
              session.micArmed ? 'Rainbow Pitch is listening.' : 'Waiting for a quiet moment.'));
    } else {
      roundCue = el('div', { class: 'round-cue' + (session.cueing ? '' : ' hidden') },
        el('span', { class: 'round-cue-icon', html: Sprites.icon('speaker') }),
        el('span', { class: 'round-cue-label' }, 'Listen…'));
    }

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

    app.appendChild(el('section', { class: 'screen practice' },
      el('div', { class: 'practice-top' }, journey, micPill, stopBtn),
      el('div', { class: 'listen-wrap' }, listenBtn),
      el('div', { class: 'answers-wrap' }, answers, roundCue, micRetry)));
    if (session.mode === 'mic') updateMicInput();
  }

  // Swaps the live #mascot element's face in place (no full re-render) —
  // used for the brief "curious" flash on a miss, since that's a transient
  // expression layered on the current round, not a new screen.
  function setMascotMood(mood) {
    const mascotEl = document.getElementById('mascot');
    if (mascotEl) mascotEl.innerHTML = Sprites.mascot(Store.activeProfile().avatar, mood);
  }

  function onAnswer(color) {
    if (session.locked) return;
    const correct = color.name === session.current.name;
    const firstAttempt = !session.attempted; // streak only moves on a first-attempt result

    // Only the FIRST attempt of a round counts toward guardian stats. Mic-
    // mode rounds are tagged with a `src: 'mic'` + confidence via a separate
    // Store function (see js/storage.js), so real-piano reads stay visible
    // to the guardian but out of the core readiness/accuracy signal (see
    // js/logic.js's `src !== 'mic'` filters) — everything else here is
    // identical either way, since it only reads session.current/misses/streak.
    if (!session.attempted) {
      session.attempted = true;
      const record = session.mode === 'mic'
        ? (c, a, ok) => Store.recordRealPianoRound(c, a, ok, session.currentConfidence)
        : Store.recordRound;
      record(session.current.name, color.name, correct);
      if (correct) session.correct += 1;
    }

    const btn = app.querySelector(`.color-btn[data-color="${color.name}"]`);
    if (correct) {
      session.locked = true;
      if (firstAttempt) session.streak += 1;
      btn.classList.add('correct');
      cheer();
      // A little burst of non-pitched, tactile "yes!" right at tap time —
      // the chord reward replay just below stays the acoustic centrepiece;
      // this is only the quick pop/buzz under the tapped button itself. The
      // vibrate call is wrapped because plenty of browsers/devices simply
      // don't have navigator.vibrate, and a couple that do still throw if
      // it's blocked by permissions policy — either way it should never
      // interrupt the success feedback.
      PianoAudio.playPop();
      try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) { /* no-op — see comment above */ }
      // Replay the target chord itself, softer, rather than a cheerful
      // little arpeggio: hearing the SAME chord again right at the moment
      // of success is the reinforcement the Eguchi method relies on. A
      // different pitched "ta-da" in the same piano timbre would just be
      // new pitch content landing on top of the association we're building.
      PianoAudio.playReward(session.current.notes).catch(() => {});
      session.index += 1;
      scheduleRound(nextRound, 1100);
    } else {
      // Any miss breaks the happy streak, and gets a brief, gentle
      // "curious" face — never a lingering state; a new round always starts
      // fresh-faced (see baselineMood/renderPractice).
      session.streak = 0;
      setMascotMood('curious');
      session.misses += 1;
      if (session.misses >= 2) {
        // Two misses: guessing your way there by elimination trains the
        // wrong skill. Stop the round, show the answer, and replay the
        // chord while it's highlighted — chord and colour together is the
        // reinforcement moment the method actually relies on. The round was
        // already recorded as incorrect on the first attempt, above. The
        // curious face just set above naturally lasts until nextRound()
        // re-renders.
        session.locked = true;
        const answersEl = app.querySelector('.answers');
        if (answersEl) answersEl.classList.add('reveal');
        const correctBtn = app.querySelector(`.color-btn[data-color="${session.current.name}"]`);
        if (correctBtn) correctBtn.classList.add('reveal');
        const notes = session.current.notes;
        scheduleRound(() => { if (session) PianoAudio.playChord(notes).catch(() => {}); }, 300);
        // A revealed round still uses up a journey step — otherwise a tough
        // set keeps growing and the recorded session accuracy over-counts.
        session.index += 1;
        scheduleRound(nextRound, 1600);
      } else {
        // Gentle feedback on the first miss: a soft wobble and replay the
        // sound. No "wrong" text. The round doesn't advance here, so the
        // curious face is put back to baseline on a timer instead of on
        // nextRound —
        // guarded by roundId in case the round moves on anyway (e.g. the
        // child gets it right on retry) before the timer fires.
        btn.classList.add('nudge');
        scheduleRound(() => btn.classList.remove('nudge'), 500);
        const notes = session.current.notes;
        scheduleRound(() => { if (session) PianoAudio.playChord(notes).catch(() => {}); }, 260);
        const roundId = session.roundId;
        scheduleRound(() => {
          if (!session || session.roundId !== roundId) return; // a new round already took over the mascot
          setMascotMood(baselineMood());
        }, 1500);
      }
    }
  }

  function cheer() {
    const mascot = document.getElementById('mascot');
    if (mascot) { mascot.classList.add('happy'); setTimeout(() => mascot.classList.remove('happy'), 900); }
    // A streak feels like a bigger deal, so it gets a bigger burst — same
    // jump animation either way.
    burstConfetti(session.streak >= 3 ? 18 : 10);
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
    Store.recordSession({
      ts: Date.now(),
      rounds: session.index,
      target: session.total,
      correct: session.correct,
      colors: session.colors.map((c) => c.name),
      early,
      ...(session.mode === 'mic' ? { src: 'mic' } : {}),
    });
    renderCelebration(early);
    session = null;
  }

  // =======================================================================
  //  CELEBRATION  (Child Celebration)
  // =======================================================================
  function renderCelebration(early) {
    clearScreen();
    burstConfetti(60);
    PianoAudio.playSparkle(); // non-pitched flourish — see audio.js for why
    const p = Store.activeProfile();
    const startError = el('p', { class: 'start-error', hidden: true });
    const again = el('button', { class: 'big-start', onclick: () => beginPractice(again, startError) },
      el('span', { class: 'btn-ico', html: Sprites.icon('play') }), 'Play again');
    app.appendChild(el('section', { class: 'screen celebrate' },
      el('div', { class: 'cele-mascot', html: Sprites.mascot(p.avatar, 'happy') }),
      el('h1', { class: 'cele-title' }, early ? 'Nice listening!' : 'You did it!'),
      el('div', { class: 'stickers' }, ['star', 'note', 'sparkle', 'note', 'star'].map((s) => el('span', { class: 'sticker', html: Sprites.icon(s) }))),
      el('div', { class: 'cele-actions' },
        again,
        el('button', { class: 'ghost-btn', onclick: renderHome }, 'Home')), startError));
  }

  // =======================================================================
  //  GUARDIAN  (PIN gate + panels)
  // =======================================================================
  function renderGuardianGate() {
    clearScreen();
    let entered = '';
    const dots = el('div', { class: 'pin-dots' });
    const msg = el('p', { class: 'pin-msg' }, 'Grown-ups only');

    function refresh() {
      clear(dots);
      for (let i = 0; i < 4; i++) dots.appendChild(el('span', { class: 'pin-dot' + (i < entered.length ? ' filled' : '') }));
    }
    function press(d) {
      if (entered.length >= 4) return;
      entered += d; refresh();
      if (entered.length === 4) {
        if (entered === Store.getPin()) renderGuardian('colors');
        else { msg.textContent = 'Try again'; entered = ''; setTimeout(refresh, 250); }
      }
    }
    const pad = el('div', { class: 'pin-pad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
        k === '' ? el('span', {}) :
          el('button', { class: 'pin-key', onclick: () => k === '⌫' ? (entered = entered.slice(0, -1), refresh()) : press(k) }, k)));

    refresh();
    // The hint only makes sense while the PIN is still the factory default —
    // once a grown-up sets their own in Settings, showing it here would
    // defeat the point of changing it.
    const showHint = Store.getPin() === Store.DEFAULT_PIN;
    app.appendChild(el('section', { class: 'screen gate' },
      el('button', { class: 'back-link', onclick: renderHome }, '‹ Back to play'),
      el('div', { class: 'gate-card' },
        el('div', { class: 'gate-lock', html: Sprites.icon('lock') }),
        msg,
        showHint ? el('p', { class: 'pin-hint' }, `Demo PIN: ${Store.DEFAULT_PIN}`) : null,
        dots, pad)));
  }

  function renderGuardian(tab) {
    clearScreen();
    const tabs = el('nav', { class: 'g-tabs' },
      [['colors', 'Colours'], ['progress', 'Progress'], ['profiles', 'Children'], ['settings', 'Settings']].map(([id, lbl]) =>
        el('button', { class: 'g-tab' + (tab === id ? ' active' : ''), onclick: () => renderGuardian(id) }, lbl)));

    const body = el('div', { class: 'g-body' });
    if (tab === 'colors') guardianColors(body);
    else if (tab === 'progress') guardianProgress(body);
    else if (tab === 'profiles') guardianProfiles(body);
    else guardianSettings(body);

    app.appendChild(el('section', { class: 'screen guardian' },
      el('header', { class: 'g-head' },
        el('button', { class: 'back-link', onclick: renderHome }, '‹ Done'),
        el('h2', {}, 'Grown-up area'),
        el('span', { class: 'g-child' },
          el('span', { class: 'g-child-ava', html: Sprites.mascot(Store.activeProfile().avatar) }),
          Store.activeProfile().name)),
      tabs, body));
  }

  // --- Guardian: Colours (active set + readiness + add next) --------------
  // Ready to add the next colour when every active colour is well known over
  // its recent attempts (see js/logic.js for why "recent" beats "lifetime").
  function readiness(p) {
    return Logic.readiness(p.events, p.activeColors);
  }

  function nextColorToAdd(p) {
    const have = new Set(p.activeColors);
    return CHORDS.find((c) => !have.has(c.name));
  }

  function guardianColors(body) {
    const p = Store.activeProfile();
    body.appendChild(el('p', { class: 'g-lead' },
      'These are the colours ', el('strong', {}, p.name), ' practises now. Introduce new colours one at a time — the classic method adds the next colour only after the current ones are known with near-perfect accuracy (about every two weeks).'));

    const ready = readiness(p);
    const next = nextColorToAdd(p);
    if (next) {
      body.appendChild(el('div', { class: 'readiness ' + (ready ? 'ready' : 'notyet') },
        el('span', { class: 'r-icon', html: Sprites.icon(ready ? 'check' : 'hourglass') }),
        el('div', {},
          el('div', { class: 'r-title' }, ready ? 'Ready for a new colour!' : 'Keep practising the current colours'),
          el('div', { class: 'r-sub' }, ready
            ? `${p.name} is recognising the current colours reliably. You can add the next colour.`
            : 'Add the next colour once every current colour is near 100%.')),
        el('button', {
          class: 'add-color-btn',
          disabled: !ready,
          style: `background:${next.swatch};color:${next.text}`,
          onclick: () => { Store.addColor(next.name); renderGuardian('colors'); },
        }, 'Add ' + next.label)));
    } else {
      body.appendChild(el('div', { class: 'readiness ready' }, el('span', { class: 'r-icon', html: Sprites.icon('trophy') }),
        el('div', {}, el('div', { class: 'r-title' }, 'All colours added!'), el('div', { class: 'r-sub' }, 'Amazing progress.'))));
    }

    // Full palette with toggle (guardian may hand-pick the active set).
    const grid = el('div', { class: 'palette-grid' });
    CHORDS.forEach((c) => {
      const on = p.activeColors.includes(c.name);
      const acc = Logic.recentAccuracy(p.events, c.name).pct;
      grid.appendChild(el('button', {
        class: 'palette-item' + (on ? ' on' : ''),
        onclick: () => toggleColor(c.name),
      },
        el('span', { class: 'pi-swatch', style: `background:${c.swatch}` }),
        el('span', { class: 'pi-label' }, c.label),
        el('span', { class: 'pi-meta' }, on ? (acc == null ? 'active' : acc + '%') : 'off'),
        el('span', { class: 'pi-chord', title: 'Chord (grown-up only)' }, c.chord)));
    });
    body.appendChild(el('h3', { class: 'g-sub' }, 'All colours'));
    body.appendChild(grid);
    body.appendChild(el('p', { class: 'g-note' }, 'Tip: one colour alone is pure listening/imprinting for a brand-new learner; two or more turns it into real discrimination practice.'));
  }

  function toggleColor(name) {
    const p = Store.activeProfile();
    const on = p.activeColors.includes(name);
    if (on) {
      if (p.activeColors.length <= 1) { window.alert('Keep at least one colour active.'); return; }
      Store.removeColor(name);
    } else {
      Store.addColor(name);
    }
    renderGuardian('colors');
  }

  // --- Guardian: Progress -------------------------------------------------
  function guardianProgress(body) {
    const p = Store.activeProfile();
    const active = p.activeColors;

    body.appendChild(el('p', { class: 'g-note sets-today-note' },
      `Sets today: ${setsToday(p)} (aim for about 5 short sets a day)`));

    // Visible but explicitly separate from the accuracy/readiness signal
    // below — real-piano detection accuracy hasn't been validated the way
    // the digital method has (see js/logic.js's `src !== 'mic'` filters), so
    // this is a plain count, not a bar or a readiness card. Omitted entirely
    // for a profile that's never used the feature.
    const micEvents = p.events.filter((e) => e.src === 'mic');
    if (micEvents.length) {
      const micMatched = micEvents.filter((e) => e.ok).length;
      body.appendChild(el('p', { class: 'g-note' },
        `Real piano practice: ${micEvents.length} attempts, ${micMatched} matched`));
    }

    body.appendChild(el('h3', { class: 'g-sub' }, 'Accuracy by colour'));
    if (!active.some((n) => p.stats[n])) {
      body.appendChild(el('p', { class: 'g-note' }, 'No practice recorded yet. Tap “Done”, then let your child play a set.'));
    }
    const bars = el('div', { class: 'bars' });
    active.forEach((name) => {
      const c = CHORD_BY_NAME[name];
      const recent = Logic.recentAccuracy(p.events, name);
      const s = p.stats[name] || { correct: 0, seen: 0 };
      const pct = recent.pct == null ? 0 : recent.pct;
      bars.appendChild(el('div', { class: 'bar-row' },
        el('span', { class: 'bar-swatch', style: `background:${c.swatch}` }),
        el('span', { class: 'bar-name' }, c.label),
        el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${pct}%;background:${c.swatch}` })),
        el('span', { class: 'bar-nums' },
          el('span', { class: 'bar-num' }, recent.pct == null ? '—' : recent.pct + '% recent'),
          el('span', { class: 'bar-life' }, s.seen ? `${s.correct}/${s.seen} all-time` : ''))));
    });
    body.appendChild(bars);

    body.appendChild(el('h3', { class: 'g-sub' }, 'Recent sessions'));
    if (!p.sessions.length) {
      body.appendChild(el('p', { class: 'g-note' }, 'Sessions will appear here.'));
    } else {
      const list = el('ul', { class: 'sessions' });
      p.sessions.slice(0, 10).forEach((se) => {
        const d = new Date(se.ts);
        const when = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const pct = se.rounds ? Math.round((se.correct / se.rounds) * 100) : 0;
        list.appendChild(el('li', {},
          el('span', { class: 's-when' }, when),
          el('span', { class: 's-detail' }, `${se.correct}/${se.rounds} correct${se.early ? ' · calm stop' : ''} · ${pct}%`)));
      });
      body.appendChild(list);
    }

    // Mix-ups: which wrong colour a child taps most often for each target,
    // so a grown-up can see patterns a single accuracy number would hide.
    const mixups = Logic.confusions(p.events);
    if (mixups.length) {
      body.appendChild(el('h3', { class: 'g-sub' }, 'Mix-ups'));
      const list = el('div', { class: 'confusions' });
      mixups.forEach((m) => {
        const target = CHORD_BY_NAME[m.target];
        const answered = CHORD_BY_NAME[m.answered];
        list.appendChild(el('div', { class: 'cf-row' },
          el('span', { class: 'cf-swatch', style: `background:${target.swatch}` }),
          el('span', { class: 'cf-label' }, target.label),
          el('span', { class: 'cf-arrow' }, '→'),
          el('span', { class: 'cf-swatch', style: `background:${answered.swatch}` }),
          el('span', { class: 'cf-label' }, answered.label),
          el('span', { class: 'cf-count' }, '×' + m.count)));
      });
      body.appendChild(list);
    }

    body.appendChild(el('div', { class: 'g-actions' },
      el('button', { class: 'ghost-btn', onclick: () => exportData(p) }, '⬇ Export progress (JSON)')));
  }

  function exportData(p) {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `rainbow-pitch-${p.name}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // --- Guardian: Children (profiles) --------------------------------------
  function guardianProfiles(body) {
    const data = Store.all();
    body.appendChild(el('h3', { class: 'g-sub' }, 'Children on this device'));
    const list = el('div', { class: 'profiles-list' });
    data.profiles.forEach((p) => {
      list.appendChild(el('div', { class: 'profile-card' + (p.id === data.activeProfileId ? ' active' : '') },
        el('button', { class: 'pc-main', onclick: () => { Store.setActiveProfile(p.id); renderGuardian('profiles'); } },
          el('span', { class: 'pc-avatar', html: Sprites.mascot(p.avatar) }),
          el('span', {}, el('div', { class: 'pc-name' }, p.name),
            el('div', { class: 'pc-meta' }, `${p.activeColors.length} colours · ${p.sessions.length} sessions`))),
        data.profiles.length > 1 ? el('button', { class: 'pc-del', title: 'Remove', onclick: () => {
          if (window.confirm(`Remove ${p.name} and their progress?`)) { Store.removeProfile(p.id); renderGuardian('profiles'); }
        } }, 'Remove') : null));
    });
    body.appendChild(list);

    // Add a new child
    let name = '';
    let avatar = AVATARS[0];
    const nameInput = el('input', { class: 'text-input', type: 'text', placeholder: "Child's name", maxlength: '20', oninput: (e) => name = e.target.value });
    const avatarRow = el('div', { class: 'avatar-picker' },
      AVATARS.map((a) => el('button', { class: 'avatar-opt' + (a === avatar ? ' sel' : ''), onclick: (e) => {
        avatar = a;
        avatarRow.querySelectorAll('.avatar-opt').forEach((b) => b.classList.remove('sel'));
        e.currentTarget.classList.add('sel');
      }, html: Sprites.mascot(a) })));
    body.appendChild(el('div', { class: 'add-profile' },
      el('h3', { class: 'g-sub' }, 'Add a child'),
      nameInput, avatarRow,
      el('button', { class: 'primary-btn', onclick: () => {
        Store.addProfile(name.trim() || 'Little One', avatar);
        renderGuardian('profiles');
      } }, 'Add child')));
  }

  // --- Guardian: Settings -------------------------------------------------
  function guardianSettings(body) {
    const p = Store.activeProfile();
    body.appendChild(el('h3', { class: 'g-sub' }, 'Practice set length'));
    body.appendChild(el('p', { class: 'g-note' }, 'A standard set is 20 rounds (about 2–3 minutes). Short, frequent sets — a few times a day — work best.'));
    const row = el('div', { class: 'rounds-row' },
      [10, 15, 20, 25].map((n) => el('button', {
        class: 'round-opt' + (p.roundsPerSet === n ? ' sel' : ''),
        onclick: () => { Store.updateProfile(p.id, { roundsPerSet: n }); renderGuardian('settings'); },
      }, n + ' rounds')));
    body.appendChild(row);

    body.appendChild(el('h3', { class: 'g-sub' }, 'Real piano mode'));
    body.appendChild(el('p', { class: 'g-note' },
      "A grown-up plays a chord on a real piano near the device instead of the app choosing one — your child still picks the colour. Like everything else in Rainbow Pitch, the sound is only ever listened to right here, on this device. It's never recorded, saved, or sent anywhere."));
    body.appendChild(el('p', { class: 'g-note' },
      "This experimental mode checks for all three keys, listens for a fresh attack, and uses the lowest heard key to tell inversions apart. If the room, instrument, or microphone makes the evidence unclear, it asks to try again instead of assigning a colour."));
    const micRow = el('div', { class: 'rounds-row' },
      [false, true].map((v) => el('button', {
        class: 'round-opt' + (p.realPianoMode === v ? ' sel' : ''),
        onclick: () => { Store.updateProfile(p.id, { realPianoMode: v }); renderGuardian('settings'); },
      }, v ? 'On' : 'Off')));
    body.appendChild(micRow);

    body.appendChild(el('h3', { class: 'g-sub' }, 'Rename child'));
    const nameInput = el('input', { class: 'text-input', type: 'text', value: p.name, maxlength: '20' });
    body.appendChild(el('div', { class: 'rename-row' }, nameInput,
      el('button', { class: 'primary-btn', onclick: () => { Store.updateProfile(p.id, { name: nameInput.value.trim() || p.name }); renderGuardian('settings'); } }, 'Save')));

    // Tap-to-apply, no Save button — this mirrors the "Add a child" avatar
    // picker in guardianProfiles, but writes straight to the existing
    // profile instead of collecting a choice for a brand-new one.
    body.appendChild(el('h3', { class: 'g-sub' }, 'Change look'));
    body.appendChild(el('div', { class: 'avatar-picker' },
      AVATARS.map((a) => el('button', {
        class: 'avatar-opt' + (a === p.avatar ? ' sel' : ''),
        onclick: () => { Store.updateProfile(p.id, { avatar: a }); renderGuardian('settings'); },
        html: Sprites.mascot(a),
      }))));

    body.appendChild(el('h3', { class: 'g-sub' }, 'Grown-up PIN'));
    body.appendChild(el('p', { class: 'g-note' },
      `A light gate for little fingers, not real security. The lock screen shows the demo PIN (${Store.DEFAULT_PIN}) as a hint only until you set your own here.`));
    const pinInput = el('input', {
      class: 'text-input pin-input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*',
      maxlength: '4', placeholder: '••••',
    });
    const pinMsg = el('p', { class: 'g-note pin-save-msg' });
    body.appendChild(el('div', { class: 'rename-row' }, pinInput,
      el('button', { class: 'primary-btn', onclick: () => {
        const v = pinInput.value.trim();
        if (!/^\d{4}$/.test(v)) { pinMsg.textContent = 'Please enter exactly 4 digits.'; return; }
        Store.setPin(v);
        pinInput.value = '';
        pinMsg.textContent = 'Saved — use the new PIN next time.';
      } }, 'Save')));
    body.appendChild(pinMsg);

    body.appendChild(el('h3', { class: 'g-sub' }, 'Danger zone'));
    body.appendChild(el('button', { class: 'danger-btn', onclick: () => {
      if (window.confirm(`Reset all progress for ${p.name}? This cannot be undone.`)) {
        Store.resetProgress(p.id);
        renderGuardian('settings');
      }
    } }, 'Reset this child’s progress'));

    body.appendChild(el('div', { class: 'about' },
      el('p', {}, 'Rainbow Pitch uses the Eguchi Chord Identification Method: children aged ~2–6 learn absolute pitch by matching piano chords to fixed colours. Practise ~5 short times a day.'),
      el('p', { class: 'g-note' }, 'All data stays on this device. The grown-up PIN above is a light gate, not real security.')));
  }

  // =======================================================================
  //  Confetti (lightweight, no dependencies)
  // =======================================================================
  function burstConfetti(count) {
    const layer = document.getElementById('confetti');
    const colors = CHORDS.map((c) => c.swatch);
    for (let i = 0; i < count; i++) {
      const bit = el('span', { class: 'confetti-bit' });
      bit.style.left = Math.random() * 100 + 'vw';
      bit.style.background = colors[Math.floor(Math.random() * colors.length)];
      bit.style.animationDelay = (Math.random() * 0.3) + 's';
      bit.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(bit);
      setTimeout(() => bit.remove(), 2200);
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
