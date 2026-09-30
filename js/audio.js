/*
 * Chord Garden — audio engine.
 *
 * Plays chords on a real sampled acoustic piano using Tone.js. A warm, real
 * piano matters here: the child is building a lasting mental link between a
 * timbre+pitch and a colour, so the sound should be pleasant and consistent.
 *
 * Samples: self-hosted Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0),
 * built by tools/piano-samples into assets/piano/vN/. There is one file per
 * note the chords use, already tuned to A = 440 and levelled, so Tone never
 * repitches a sample (stretching pitch in the browser drifts the tuning and
 * changes loudness) and only 3.4 s of each note sits unpacked in memory. They
 * load lazily on first use and the service worker keeps them for offline play.
 *
 * Natural variety (opt-in per child, see setVariety): a person at a real piano
 * never plays a chord the same way twice, and a child who only ever hears one
 * recording may partly learn that recording instead of the chord. So each
 * chord is played from one of three loudness layers (main, soft, firm — each a
 * folder of the same 18 files) with tiny random timing and level differences
 * between its notes. Only HOW a chord is played varies, never WHICH notes:
 * pitch, voicing, inversion and octave are untouched, and chordPlan() never
 * looks at the notes, so the variety can't become a hint about the chord.
 * With variety off, playback is exactly the single steady main recording.
 *
 * Public API: unlock, playChord, playReward, playSparkle, stopAll,
 * whenOutputSilent, isChordRinging, setVariety, chordPlan.
 */

const PianoAudio = (() => {
  // Where the piano files live, resolved against THIS script (captured while
  // it runs; currentScript is null afterwards), so the app page and the
  // real-piano acceptance tool (which loads ../../js/audio.js) both find them.
  // New content goes in a new vN folder, never over v1 (see sw.js).
  const SAMPLE_BASE_ROOT = '../assets/piano/v1/';
  const LAYERS = ['main', 'soft', 'firm'];
  const SCRIPT_SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  function sampleBase(layer) {
    const path = SAMPLE_BASE_ROOT + layer + '/';
    try {
      if (SCRIPT_SRC) return new URL(path, SCRIPT_SRC).href;
    } catch (e) { /* fall through to the page-relative path */ }
    return path.replace('../', '');
  }

  // One sample per note the chords use, keyed the way Tone spells it
  // ('A#3'; Tone maps 'Bb3' to the same key) with the file name written
  // without '#' ('As3.mp3'). Read from CHORDS when the sampler is built.
  const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  function sampleUrls() {
    const urls = {};
    if (typeof CHORDS === 'undefined') return urls;
    for (const chord of CHORDS) {
      for (const note of chord.notes) {
        const m = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
        if (!m) continue;
        const name = m[2] === 'b' ? FLAT_TO_SHARP[m[1] + 'b'] : m[1] + m[2];
        if (!name) continue;
        urls[name + m[3]] = name.replace('#', 's') + m[3] + '.mp3';
      }
    }
    return urls;
  }
  // If the files never arrive (offline, blocked, flaky network) the samples'
  // onload would just never fire — this bounds how long the Start button can
  // sit on "Waking the piano…" before we give up and let the grown-up retry.
  const LOAD_TIMEOUT_MS = 20000;
  // A damper-like key release, not a long concert-hall tail — short enough
  // that clearRoundWork()'s stopAll() at the top of nextRound() leaves a
  // clean gap before the next chord instead of bleeding into it.
  const RELEASE_SECONDS = 0.3;

  // ---- natural variety: the chord plan -----------------------------------
  // Decided per chord, from random numbers only. The layer is one draw for the
  // whole chord (a pianist plays a chord at one dynamic): main half the time,
  // soft and firm a quarter each. Each note also gets its own small delay
  // (a hand never lands three keys at the same instant) and level nudge. The
  // delays are shifted so the earliest note is at 0 and the chord never
  // starts later than it does with variety off.
  const MAX_OFFSET_MS = 20;
  const MAX_GAIN_DB = 1.5;

  function chordPlan(notes, { variety = false, rand = Math.random } = {}) {
    if (!variety) {
      return { layer: 'main', notes: notes.map((note) => ({ note, offsetMs: 0, gainDb: 0 })) };
    }
    const r = rand();
    const layer = r < 0.5 ? 'main' : r < 0.75 ? 'soft' : 'firm';
    const offsets = notes.map(() => rand() * MAX_OFFSET_MS);
    const earliest = offsets.length ? Math.min(...offsets) : 0;
    return {
      layer,
      notes: notes.map((note, i) => ({
        note,
        offsetMs: offsets[i] - earliest,
        gainDb: (rand() * 2 - 1) * MAX_GAIN_DB,
      })),
    };
  }

  // ---- samplers -----------------------------------------------------------
  // One Tone.Sampler per layer, all built the same way. `main` is the piano:
  // unlock() waits for it. soft and firm exist only while variety is on (about
  // 24 MB unpacked each) and load in the background, so they can never delay
  // or fail unlock(); until a layer has loaded, a chord planned for it plays
  // on main instead.
  const samplers = {};
  const ready = {};      // layer -> its files have loaded
  const loading = {};    // layer -> the load promise while in flight
  let varietyOn = false;
  let started = false;
  let pendingPitchedOperations = 0;
  // A stop invalidates playback that crossed an async load boundary.
  let pitchedOperationGeneration = 0;
  let pitchedOutputUntil = 0;
  // When the most recent pitched output stops being HELD (i.e. when its
  // attack+sustain ends and only the release tail remains) — see
  // isChordRinging(), which treats a chord still in its release as no longer
  // "ringing" for reward-replay purposes.
  let pitchedHeldUntil = 0;

  // ---- keeping the audio context alive (iOS) -------------------------------
  // iOS suspends or "interrupts" Web Audio when the app is backgrounded, the
  // screen locks, or Siri, a call or an alarm takes the audio session. Some-
  // times the context then never comes back: it stays 'suspended' or the
  // non-standard 'interrupted', resume() never settles, or it claims to be
  // 'running' while its clock is frozen. Nothing sounds until the app is
  // force-closed, which is the only thing that made a fresh context. So we
  // track whether the context MAY be unhealthy (`suspect`) and, on the next
  // Play/flower tap, replace it. All of this is a no-op where document,
  // window or Tone.getContext are missing (tests, older fakes).
  let suspect = false;
  let startAttempted = false; // Tone.start() has been called at least once
  let audioEpoch = 0;         // bumped on rebuild; stale sample loads are ignored
  let listenedRaw = null;     // the raw context our statechange listener is on
  let healthRun = 0;          // cancels an older health check when a new one starts
  let wasHidden = false;
  // resume() on a dead iOS context can simply never settle, which would leave
  // the Play button on "Waking the piano…" forever. Give up after this long;
  // the child's next tap then rebuilds the context inside its own gesture.
  const START_TIMEOUT_MS = 2500;
  // After the page returns, the context is healthy once it reports 'running'
  // AND its clock has moved: at least MIN_CLOCK_ADVANCE seconds over at least
  // MIN_WALL_MS of real time, checked for up to HEALTH_WINDOW_MS.
  const HEALTH_WINDOW_MS = 1500;
  const HEALTH_POLL_MS = 100;
  const MIN_WALL_MS = 150;
  const MIN_CLOCK_ADVANCE = 0.05;

  function toneContext() {
    try {
      if (typeof Tone !== 'undefined' && typeof Tone.getContext === 'function') return Tone.getContext() || null;
    } catch (e) { /* treat as no context */ }
    return null;
  }

  // Watch the current raw context: leaving 'running' after the piano has
  // started (an interruption while the page stays visible, say Siri) means the
  // next tap should rebuild it.
  function watchContext() {
    try {
      const ctx = toneContext();
      const raw = ctx && ctx.rawContext;
      if (!raw || raw === listenedRaw || typeof raw.addEventListener !== 'function') return;
      listenedRaw = raw;
      raw.addEventListener('statechange', () => {
        if (raw === listenedRaw && startAttempted && raw.state !== 'running') suspect = true;
      });
    } catch (e) { /* no state events — visibility and timeouts still work */ }
  }

  // Run when the page becomes visible again and after every start. Reading
  // state needs no user gesture, so a healthy context is recognised and left
  // alone; one that never proves healthy within the window is marked
  // `suspect` for the next tap to act on.
  function checkHealth() {
    const run = ++healthRun;
    const began = Date.now();
    let base = null;
    const tick = () => {
      if (run !== healthRun) return;
      try {
        const ctx = toneContext();
        const raw = ctx && ctx.rawContext;
        if (!ctx || !raw) return;
        const now = Date.now();
        if (ctx.state === 'running') {
          if (base === null) base = { time: raw.currentTime, at: now };
          else if (now - base.at >= MIN_WALL_MS && raw.currentTime - base.time >= MIN_CLOCK_ADVANCE) {
            suspect = false;
            return;
          }
        } else {
          base = null; // restart the clock measurement once it is running
        }
        if (now - began < HEALTH_WINDOW_MS) setTimeout(tick, HEALTH_POLL_MS);
        else suspect = true; // never ran with a moving clock: the next tap rebuilds
      } catch (e) { suspect = true; }
    };
    tick();
  }

  function onPageVisible() {
    if (!startAttempted) return;
    suspect = true; // assume the worst until the check proves otherwise
    checkHealth();
  }

  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    wasHidden = document.visibilityState === 'hidden';
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { wasHidden = true; return; }
      if (wasHidden && document.visibilityState === 'visible') {
        wasHidden = false;
        onPageVisible();
      }
    });
  }
  // A page restored from the back/forward cache (or an iOS resume) fires
  // pageshow with persisted set, possibly without a visibilitychange.
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', (event) => {
      if (event && event.persisted) onPageVisible();
    });
  }

  // Build a layer's sampler on demand and remember its "loaded" promise.
  function ensureLayer(layer) {
    if (samplers[layer]) return loading[layer];
    loading[layer] = new Promise((resolve, reject) => {
      // onload and onerror both fire from Tone's internals, and the timeout
      // fires from us — guard so only the first of the three ever settles
      // the promise (a late onload after a timeout rejection, etc).
      let settled = false;
      // A rebuild (see rebuildContext) replaces the samplers; a load that
      // belonged to the old ones must not touch the new state when it ends.
      const epoch = audioEpoch;
      const fail = (error) => {
        settled = true;
        if (epoch === audioEpoch) {
          samplers[layer] = null;
          loading[layer] = null; // let a later call rebuild the sampler and retry
        }
        reject(error);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        fail(new Error('Piano samples timed out loading.'));
      }, LOAD_TIMEOUT_MS);

      samplers[layer] = new Tone.Sampler({
        urls: sampleUrls(),
        baseUrl: sampleBase(layer),
        release: RELEASE_SECONDS,
        onload: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (epoch === audioEpoch) ready[layer] = true;
          resolve();
        },
        onerror: (err) => {
          if (settled) return;
          clearTimeout(timer);
          fail(err instanceof Error ? err : new Error('Piano samples failed to load.'));
        },
      }).toDestination();
      samplers[layer].volume.value = -4;
    });
    return loading[layer];
  }
  function ensureSampler() { return ensureLayer('main'); }

  // The extra layers, in the background. A failure is silent: chords just keep
  // playing on main, and the next unlock() or setVariety(true) tries again.
  function loadExtraLayers() {
    if (!varietyOn || !started || typeof Tone === 'undefined') return;
    for (const layer of LAYERS) {
      if (layer !== 'main') ensureLayer(layer).catch(() => {});
    }
  }

  // Turn natural variety on or off (a per-child setting; the app calls this
  // whenever the active child or the setting changes). Off by default.
  function setVariety(on) {
    varietyOn = !!on;
    loadExtraLayers();
  }

  const allSamplers = () => Object.values(samplers).filter(Boolean);

  // Replace a context that may be dead with a fresh one. Must run
  // synchronously inside the tap handler: iOS only lets a NEW AudioContext
  // start while the user gesture is still live, and the gesture is gone after
  // the first `await`. Samplers belong to the old context, so they are thrown
  // away and rebuilt lazily (from the service worker's audio cache, so this
  // works offline).
  function rebuildContext() {
    if (typeof Tone.getContext !== 'function' || typeof Tone.setContext !== 'function'
      || typeof Tone.Context !== 'function') return;
    stopAll();
    const old = Tone.getContext();
    const fresh = new Tone.Context(); // if this throws, nothing has been torn down
    audioEpoch += 1;
    for (const s of allSamplers()) { try { s.dispose(); } catch (e) { /* already gone */ } }
    if (sparkleSynth) { try { sparkleSynth.dispose(); } catch (e) { /* already gone */ } }
    sparkleSynth = null;
    for (const layer of Object.keys(samplers)) delete samplers[layer];
    for (const layer of Object.keys(ready)) delete ready[layer];
    for (const layer of Object.keys(loading)) delete loading[layer];
    Tone.setContext(fresh);
    // Context.dispose() also calls close() but drops its promise, which would
    // surface a rejection from a dead context as an unhandled one. So close
    // it ourselves first (dispose's own close is then a no-op) and swallow.
    if (old && old !== fresh) {
      try {
        if (typeof old.close === 'function') Promise.resolve(old.close()).catch(() => {});
      } catch (e) { /* ignore */ }
      try { if (typeof old.dispose === 'function') old.dispose(); } catch (e) { /* ignore */ }
    }
    listenedRaw = null;
    watchContext();
    suspect = false;
  }

  // Tone.start() with a bound, then a check that the context really runs.
  // Called synchronously from unlock() so the gesture is still live.
  async function startContext() {
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The piano did not wake up.')), START_TIMEOUT_MS);
    });
    try {
      await Promise.race([Tone.start(), timeout]);
    } catch (e) {
      suspect = true;
      throw e;
    } finally {
      clearTimeout(timer);
    }
    const ctx = toneContext();
    if (ctx && ctx.state !== 'running') {
      suspect = true;
      throw new Error('The piano did not wake up.');
    }
  }

  /**
   * Unlock the audio context. Browsers require this to happen inside a user
   * gesture (a tap/click), so call it from a button handler.
   */
  async function unlock() {
    // Tone loads from a separate CDN <script> tag; if that failed to fetch,
    // the global simply won't exist. Fail with a clear message here instead
    // of letting every caller hit a raw ReferenceError.
    if (typeof Tone === 'undefined') {
      throw new Error('The audio library did not load — check your connection and try again.');
    }
    // iPhones mute Web Audio while the Ring/Silent switch (or Silent mode)
    // is on, unless the page declares it plays media like a music app does
    // (the Audio Session API, Safari 16.4+). The piano is the whole point of
    // this app, so ask for 'playback' before starting the context; it also
    // pauses other apps' audio, like any music player. Browsers without the
    // API skip this, and older iPhones still need silent mode switched off.
    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* unsupported session type — nothing else to try */ }
    // A context that may have died while we were away is replaced here, before
    // any await, so the fresh AudioContext starts inside this tap's gesture.
    if ((started || startAttempted) && suspect) rebuildContext();
    startAttempted = true;
    await startContext();
    watchContext();
    started = true;
    // iOS can also report 'running' with the clock stuck and no visibility
    // or state event to warn us. Check in the background; if it never ticks,
    // the next Play tap rebuilds it. `suspect` is only set if the check
    // fails, so quick taps on flowers don't rebuild a healthy context.
    checkHealth();
    const mainReady = ensureSampler();
    // Start the extra layers once main has loaded; never awaited.
    mainReady.then(loadExtraLayers, () => {});
    await mainReady;
  }

  /**
   * Play a chord (array of note names) as a single warm strum.
   * @param {string[]} notes e.g. ['C4','E4','G4']
   * @param {number} duration seconds the chord rings
   */
  async function playPitched(notes, duration, velocity) {
    const operationGeneration = pitchedOperationGeneration;
    pendingPitchedOperations += 1;
    try {
      if (!started) await unlock();
      await ensureSampler();
      if (operationGeneration !== pitchedOperationGeneration) return;
      for (const s of allSamplers()) s.releaseAll();
      const delay = 0.05;
      const start = Tone.now() + delay;
      let spreadMs = 0;
      if (!varietyOn) {
        samplers.main.triggerAttackRelease(notes, duration, start, velocity);
      } else {
        const plan = chordPlan(notes, { variety: true });
        // A layer that hasn't loaded (or failed) falls back to main.
        const target = ready[plan.layer] && samplers[plan.layer] ? samplers[plan.layer] : samplers.main;
        for (const n of plan.notes) {
          // Tone applies velocity as a plain gain (no 0–1 clamp), so a +1.5 dB
          // nudge on a full-velocity chord really is louder; there's headroom
          // (the loudest firm chord peaks at -2.8 dBFS before the -4 dB volume).
          const v = velocity * 10 ** (n.gainDb / 20);
          target.triggerAttackRelease(n.note, duration, start + n.offsetMs / 1000, v);
          spreadMs = Math.max(spreadMs, n.offsetMs);
        }
      }
      pitchedOutputUntil = Math.max(
        pitchedOutputUntil,
        Date.now() + (delay + duration + RELEASE_SECONDS) * 1000 + spreadMs
      );
      pitchedHeldUntil = Math.max(pitchedHeldUntil, Date.now() + (delay + duration) * 1000 + spreadMs);
    } finally {
      pendingPitchedOperations -= 1;
    }
  }

  function playChord(notes, duration = 3.0) {
    return playPitched(notes, duration, 1);
  }

  // Reward replays the target chord, softer and shorter.
  function playReward(notes, duration = 1.2) {
    return playPitched(notes, duration, .75);
  }

  let sparkleSynth = null;
  function ensureSparkleSynth() {
    if (sparkleSynth) return sparkleSynth;
    // Filtered white noise with a fast decay has no sustained pitch — it
    // reads as a little shaker/tambourine tap, not a musical note, so a
    // set-completion flourish can be celebratory without ever adding piano
    // pitch content that could interfere with the chord↔colour associations
    // the practice loop is building.
    sparkleSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.09, sustain: 0 },
    }).toDestination();
    sparkleSynth.volume.value = -20; // gentle — a tap, not a bang
    return sparkleSynth;
  }

  /**
   * A short, cheerful, non-pitched flourish (a couple of quick shaker-like
   * taps) for finishing a set or reaching the celebration screen. Deliberately
   * pitch-free — see ensureSparkleSynth() above.
   */
  async function playSparkle() {
    try {
      if (typeof Tone === 'undefined') return; // nothing to do without Tone
      const synth = ensureSparkleSynth();
      const now = Tone.now();
      synth.triggerAttackRelease('16n', now);
      synth.triggerAttackRelease('16n', now + 0.13);
      synth.triggerAttackRelease('16n', now + 0.28);
    } catch (e) {
      // Purely decorative — never let a synth hiccup break the celebration.
    }
  }

  function stopAll() {
    pitchedOperationGeneration += 1;
    pitchedHeldUntil = 0;
    const all = allSamplers();
    if (!all.length) return;
    for (const s of all) s.releaseAll();
    if (pitchedOutputUntil > Date.now()) {
      pitchedOutputUntil = Date.now() + RELEASE_SECONDS * 1000;
    }
  }

  /**
   * Whether the most recently played chord is still sounding (scheduled or
   * actually held) rather than fading through its release tail or already
   * silent. A correct tap that lands while this is true doesn't need a
   * separate reward replay — the chord it's rewarding is already ringing.
   */
  function isChordRinging() {
    return pendingPitchedOperations > 0 || Date.now() < pitchedHeldUntil;
  }

  // Resolves only after every pending piano scheduling operation has settled
  // and the latest held/released piano sample should be acoustically silent.
  // Real-piano capture uses this as an arming barrier so the app cannot hear
  // its own reward or reveal chord as the next round.
  function whenOutputSilent() {
    return new Promise((resolve) => {
      function check() {
        const remaining = pitchedOutputUntil - Date.now();
        if (pendingPitchedOperations === 0 && remaining <= 0) {
          resolve();
          return;
        }
        setTimeout(check, Math.max(16, Math.min(100, remaining > 0 ? remaining : 50)));
      }
      check();
    });
  }

  return {
    unlock,
    playChord,
    playReward,
    playSparkle,
    stopAll,
    whenOutputSilent,
    isChordRinging,
    setVariety,
    chordPlan,
  };
})();
