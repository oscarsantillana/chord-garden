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
 * Public API: unlock, playChord, playReward, playSparkle, stopAll,
 * whenOutputSilent, isChordRinging.
 */

const PianoAudio = (() => {
  // Where the piano files live, resolved against THIS script (captured while
  // it runs; currentScript is null afterwards), so the app page and the
  // real-piano acceptance tool (which loads ../../js/audio.js) both find them.
  // New content goes in a new vN folder, never over v1 (see sw.js).
  const SAMPLE_BASE_PATH = '../assets/piano/v1/main/';
  const SCRIPT_SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  function sampleBase() {
    try {
      if (SCRIPT_SRC) return new URL(SAMPLE_BASE_PATH, SCRIPT_SRC).href;
    } catch (e) { /* fall through to the page-relative path */ }
    return SAMPLE_BASE_PATH.replace('../', '');
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

  let sampler = null;
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
        urls: sampleUrls(),
        baseUrl: sampleBase(),
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
    // iPhones mute Web Audio while the Ring/Silent switch (or Silent mode)
    // is on, unless the page declares it plays media like a music app does
    // (the Audio Session API, Safari 16.4+). The piano is the whole point of
    // this app, so ask for 'playback' before starting the context; it also
    // pauses other apps' audio, like any music player. Browsers without the
    // API skip this, and older iPhones still need silent mode switched off.
    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* unsupported session type — nothing else to try */ }
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
      pitchedHeldUntil = Math.max(pitchedHeldUntil, Date.now() + (delay + duration) * 1000);
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
    if (!sampler) return;
    sampler.releaseAll();
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
  };
})();
