/*
 * Rainbow Pitch — audio engine.
 *
 * Plays chords on a real sampled acoustic piano using Tone.js. A warm, real
 * piano matters here: the child is building a lasting mental link between a
 * timbre+pitch and a colour, so the sound should be pleasant and consistent.
 *
 * Samples: the public "Salamander" grand piano set hosted on the Tone.js CDN.
 * These load lazily on first use and are cached by the browser afterwards.
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

  let sampler = null;
  let started = false;
  let ready = false;

  // Build the sampler on demand and remember the "loaded" promise.
  let loadPromise = null;
  function ensureSampler() {
    if (sampler) return loadPromise;
    loadPromise = new Promise((resolve) => {
      sampler = new Tone.Sampler({
        urls: SAMPLES,
        baseUrl: SAMPLE_BASE,
        release: 1.2,
        onload: () => { ready = true; resolve(); },
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
    await Tone.start();
    started = true;
    await ensureSampler();
  }

  function isReady() {
    return started && ready;
  }

  /**
   * Play a chord (array of note names) as a single warm strum.
   * @param {string[]} notes e.g. ['C4','E4','G4']
   * @param {number} duration seconds the chord rings
   */
  async function playChord(notes, duration = 2.2) {
    if (!started) await unlock();
    await ensureSampler();
    // Tone occasionally needs a tick after loading before triggering.
    sampler.releaseAll();
    sampler.triggerAttackRelease(notes, duration);
  }

  function stopAll() {
    if (sampler) sampler.releaseAll();
  }

  /** A short, friendly two-note "well done" flourish. */
  async function playHappy() {
    if (!started) await unlock();
    await ensureSampler();
    const now = Tone.now();
    sampler.triggerAttackRelease('C5', 0.18, now);
    sampler.triggerAttackRelease('E5', 0.18, now + 0.14);
    sampler.triggerAttackRelease('G5', 0.5, now + 0.28);
  }

  return { unlock, isReady, playChord, playHappy, stopAll };
})();
