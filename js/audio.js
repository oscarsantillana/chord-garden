/*
 * Rainbow Pitch — audio engine.
 *
 * Plays chords on a real sampled acoustic piano using Tone.js. A warm, real
 * piano matters here: the child is building a lasting mental link between a
 * timbre+pitch and a colour, so the sound should be pleasant and consistent.
 *
 * Samples: the public "Salamander" grand piano set hosted on the Tone.js CDN.
 * These load lazily on first use and are cached by the browser afterwards.
 *
 * Public API: unlock, playChord, playReward, playCue, playPop, playSparkle,
 * stopAll, whenOutputSilent.
 */

const PianoAudio = (() => {
  const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';
  const SAMPLES = {
    A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
    A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
    A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
    A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
    A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
    A5: 'A5.mp3', C6: 'C6.mp3',
  };
  // If the CDN never answers (offline, blocked, flaky network) the samples'
  // onload would just never fire — this bounds how long the Start button can
  // sit on "Waking the piano…" before we give up and let the grown-up retry.
  const LOAD_TIMEOUT_MS = 20000;
  const RELEASE_SECONDS = 1.2;

  let sampler = null;
  let started = false;
  let pendingPitchedOperations = 0;
  // A stop invalidates playback that crossed an async load boundary.
  let pitchedOperationGeneration = 0;
  let pitchedOutputUntil = 0;

  // Build the sampler on demand and remember the "loaded" promise.
  let loadPromise = null;
  function ensureSampler() {
    if (sampler) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      // onload and onerror both fire from Tone's internals, and the timeout
      // fires from us — guard so only the first of the three ever settles
      // the promise (a late onload after a timeout rejection, etc).
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        sampler = null;
        loadPromise = null; // let a later call rebuild the sampler and retry
        reject(new Error('Piano samples timed out loading.'));
      }, LOAD_TIMEOUT_MS);

      sampler = new Tone.Sampler({
        urls: SAMPLES,
        baseUrl: SAMPLE_BASE,
        release: RELEASE_SECONDS,
        onload: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        },
        onerror: (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          sampler = null;
          loadPromise = null; // reset so a retry rebuilds a fresh sampler
          reject(err instanceof Error ? err : new Error('Piano samples failed to load.'));
        },
      }).toDestination();
      sampler.volume.value = -4;
    });
    return loadPromise;
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
    await Tone.start();
    started = true;
    await ensureSampler();
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
      sampler.releaseAll();
      const delay = 0.05;
      sampler.triggerAttackRelease(notes, duration, Tone.now() + delay, velocity);
      pitchedOutputUntil = Math.max(
        pitchedOutputUntil,
        Date.now() + (delay + duration + RELEASE_SECONDS) * 1000
      );
    } finally {
      pendingPitchedOperations -= 1;
    }
  }

  function playChord(notes, duration = 2.2) {
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

  let cueSynth = null;
  function ensureCueSynth() {
    if (cueSynth) return cueSynth;
    // A soft filtered-noise tick — the "new round, ears on" attention cue
    // that lands right before a chord plays (see nextRound() in app.js).
    // Deliberately its own drier sound rather than reusing the sparkle
    // flourish, so the two stay easy to tell apart by ear: this one means
    // "listen now", sparkle means "you finished". Non-pitched for the same
    // reason as every other decorative sound here — see the file header for
    // why pitch content is reserved for the piano. Raised from -28 to -20
    // (same level as the sparkle) after feedback that the original tick was
    // too subtle to notice on a phone speaker.
    cueSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    }).toDestination();
    cueSynth.volume.value = -20;
    return cueSynth;
  }

  /**
   * Two quick gentle non-pitched ticks ("knock knock, ears on") played just
   * before a chord sounds, so the child learns "this sound = new round" —
   * distinct enough from a single ambient noise to actually be noticed —
   * instead of the reward replay and the next chord blurring into one
   * stream of piano.
   */
  async function playCue() {
    try {
      if (typeof Tone === 'undefined') return; // nothing to do without Tone
      const synth = ensureCueSynth();
      const now = Tone.now();
      synth.triggerAttackRelease('32n', now);
      synth.triggerAttackRelease('32n', now + 0.18);
    } catch (e) {
      // Purely decorative — never let a synth hiccup hold up a round.
    }
  }

  let popSynth = null;
  function ensurePopSynth() {
    if (popSynth) return popSynth;
    // The tap-time "yes!" for a correct answer — brighter and quicker than
    // the cue tick above, but still just filtered noise, never a pitched
    // note. The chord reward replay (playReward) stays the one actual
    // "reward sound"; this is only the tactile pop underneath it.
    popSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
    }).toDestination();
    popSynth.volume.value = -16; // brighter than the cue tick, still gentle
    return popSynth;
  }

  /**
   * A soft non-pitched "pop" at the instant a correct tap lands — distinct
   * from both the cue tick and the chord reward replay (see playReward for
   * why that one stays the acoustic centrepiece of a correct answer).
   */
  async function playPop() {
    try {
      if (typeof Tone === 'undefined') return; // nothing to do without Tone
      const synth = ensurePopSynth();
      synth.triggerAttackRelease('16n', Tone.now());
    } catch (e) {
      // Purely decorative — never let a synth hiccup interrupt success feedback.
    }
  }

  function stopAll() {
    pitchedOperationGeneration += 1;
    if (!sampler) return;
    sampler.releaseAll();
    if (pitchedOutputUntil > Date.now()) {
      pitchedOutputUntil = Date.now() + RELEASE_SECONDS * 1000;
    }
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
    playCue,
    playPop,
    playSparkle,
    stopAll,
    whenOutputSilent,
  };
})();
