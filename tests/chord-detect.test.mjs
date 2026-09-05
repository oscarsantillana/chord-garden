import { magnitudeSpectrum } from './helpers/fft.mjs';
// Rainbow Pitch — behavior tests for the pure spectrum classifier.
//
// No test framework, no deps: plain assertions, run with `node
// tests/chord-detect.test.mjs`. chord-detect.js is CommonJS
// (`module.exports = ChordDetect`) so it can be loaded as the `ChordDetect`
// browser global too; we pull it in here via createRequire since this file
// itself is ESM (.mjs). Mirrors the structure of tests/logic.test.mjs.
//
// This suite proves public classification behavior against synthetic,
// DFT-derived harmonic signals: chroma family matching, completeness
// rejection, and direct low-edge inversion evidence. Recorded sampled-piano
// spectra live in chord-detect-sampled-piano.test.mjs. Neither suite is a
// substitute for an acoustic piano through a representative device mic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ChordDetect = require('../js/chord-detect.js');

// js/data.js is a plain browser-global file (no module.exports, unlike
// logic.js/chord-detect.js), so it can't be require()'d directly. Load its
// source into a fresh vm context and pull CHORDS back out — this keeps the
// 9 core chords derived straight from js/data.js rather than hardcoded here.
const dataSrc = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
const dataSandbox = {};
vm.createContext(dataSandbox);
// Top-level `const` in a vm-run script binds in the context's lexical
// environment, not as an own property of the sandbox/global object, so an
// explicit `this.CHORDS = CHORDS` is needed to get it back out.
vm.runInContext(dataSrc + '\nthis.CHORDS = CHORDS;', dataSandbox);
const { CHORDS } = dataSandbox;

// Only the 9 core chords (the first 9 entries in js/data.js — see its own
// "Core chords" comment). All 9 are 3-note triads with 3 DISTINCT pitch
// classes, confirmed by reading js/data.js directly, so the "3-of-12
// one-hot template" design is exact here, not approximate.
const CORE_CHORDS = CHORDS.slice(0, 9);
assert.equal(CORE_CHORDS.length, 9, 'expected exactly 9 core chords in js/data.js');

// --- Test-local synthetic signal generation (NOT part of chord-detect.js —
// intentional: the module must stay agnostic to how the spectrum was
// produced; a real AnalyserNode or this hand-rolled DFT both feed it the
// same shape of data). ---------------------------------------------------

const SAMPLE_RATE = 11025;
const N = 2048; // ~0.186s, ~5.4Hz resolution — resolves A3=220Hz's neighbours with margin.

// Note name -> fundamental frequency (A4 = 440Hz equal temperament),
// independent of ChordDetect's own pitch-class math, so the test doesn't
// just re-derive the module's own assumptions.
function noteToFreq(note) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = parseInt(m[3], 10);
  const semitoneFromA4 = base + accidental + (octave - 4) * 12 - 9; // A = 9
  return 440 * Math.pow(2, semitoneFromA4 / 12);
}

// Simple seeded PRNG so the noise added below is deterministic (no test
// flakiness from Math.random).
function makeRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// Harmonic-rich synthetic tone for one note: sum of partials k*f0 for
// k=1..6 with decaying amplitudes, skipping partials that would alias past
// Nyquist. A sine only tests "read one peak" — this tests "survive harmonic
// bleed", which is the actual failure mode matchChord's margin design
// guards against.
function synthNote(freq, length, rand) {
  const amps = [1, 0.55, 0.3, 0.2, 0.12, 0.08];
  const buf = new Float64Array(length);
  const nyquistLimit = 0.9 * (SAMPLE_RATE / 2);
  for (let k = 1; k <= 6; k++) {
    const partialFreq = k * freq;
    if (partialFreq >= nyquistLimit) continue;
    const amp = amps[k - 1];
    for (let n = 0; n < length; n++) {
      buf[n] += amp * Math.sin((2 * Math.PI * partialFreq * n) / SAMPLE_RATE);
    }
  }
  // ~0.02-relative-amplitude white noise.
  for (let n = 0; n < length; n++) {
    buf[n] += 0.02 * (rand() * 2 - 1);
  }
  return buf;
}

// A chord's test waveform = sum of its 3 notes' waveforms at equal
// amplitude (safe: unrelated frequencies, no structural cancellation).
function synthChord(notes, length, rand) {
  const buf = new Float64Array(length);
  notes.forEach((note) => {
    const noteBuf = synthNote(noteToFreq(note), length, rand);
    for (let n = 0; n < length; n++) buf[n] += noteBuf[n];
  });
  return buf;
}

function hannWindow(length) {
  const w = new Float64Array(length);
  for (let n = 0; n < length; n++) {
    w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (length - 1));
  }
  return w;
}

// Preserve the original Hann window and unnormalized magnitudes.
function dft(buf) {
  const window = hannWindow(buf.length);
  return magnitudeSpectrum(buf.map((value, index) => value * window[index]));
}

function identifyChordWaveform(buf) {
  const magnitudes = dft(buf);
  return ChordDetect.identify(magnitudes, { sampleRate: SAMPLE_RATE, fftSize: N, chords: CORE_CHORDS });
}

// --- noteNameToPitchClass / chordTemplate --------------------------------

{
  assert.equal(ChordDetect.noteNameToPitchClass('C4'), 0);
  assert.equal(ChordDetect.noteNameToPitchClass('C#4'), 1);
  assert.equal(ChordDetect.noteNameToPitchClass('Bb3'), 10);
  assert.equal(ChordDetect.noteNameToPitchClass('Cb4'), 11); // negative-mod guard
  assert.equal(ChordDetect.noteNameToPitchClass('B3'), 11);
  console.log('ok - noteNameToPitchClass: parses letter+accidental+octave, ignores octave, wraps negatives');
}

{
  const template = ChordDetect.chordTemplate({ notes: ['C4', 'E4', 'G4'] });
  assert.equal(template.length, 12);
  assert.deepEqual(template, [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]); // C, E, G
  console.log('ok - chordTemplate: one-hot at the 3 distinct pitch classes, zero elsewhere');
}

// --- cosineSimilarity -----------------------------------------------------

{
  assert.equal(ChordDetect.cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(ChordDetect.cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
  assert.equal(ChordDetect.cosineSimilarity([0, 0, 0], [1, 0, 0]), 0); // divide-by-zero guard
  console.log('ok - cosineSimilarity: identical -> 1, orthogonal -> 0, zero-vector guarded');
}

// --- dbToLinear -------------------------------------------------------------

{
  assert.ok(Math.abs(ChordDetect.dbToLinear(0) - 1) < 1e-9);
  assert.ok(Math.abs(ChordDetect.dbToLinear(-20) - 0.1) < 1e-9);
  console.log('ok - dbToLinear: matches Math.pow(10, db/20)');
}

// --- identify() against synthetic harmonic-rich chords, per CORE_CHORDS ---
//
// IMPORTANT, DISCOVERED-BY-RUNNING-THE-TEST FINDING (not a bug in this
// module — an inherent property of the real js/data.js data combined with
// a 12-bin, octave-invariant chroma vector): the 9 "core" colours are not 9
// distinct pitch-class sets. They are the 3 inversions of exactly 3 major
// triads (that IS the Eguchi method — the whole point is teaching a child
// to tell inversions apart by ear):
//   {red, orange, brown}  all reduce to pitch classes {C, E, G}
//   {yellow, black, purple} all reduce to pitch classes {C, F, A}
//   {blue, green, pink}   all reduce to pitch classes {G, B, D}
// Verified directly from js/data.js's notes. A chroma vector by
// construction discards octave/bass information, so chordTemplate() for
// every member of one of these groups is a BYTE-IDENTICAL 12-length array.
// No amount of chroma math can ever tell red's audio apart from orange's or
// brown's — the templates ARE each other. This is a structural ceiling on
// pitch-class-only chord detection, not a tuning problem to fix with
// different opts. (Distinguishing an inversion by ear needs bass-note /
// register information a plain 12-bin chroma vector deliberately throws
// away — flagging this for the design phase; see final report.)
//
// So this suite validates two different, both-true things instead of one
// over-strong claim:
//   (a) sonic content is extracted correctly: identify() against the FULL
//       9-chord pool lands on the right pitch-class GROUP every time, and
//       correctly reports near-zero margin/confidence for a genuinely
//       ambiguous within-group case (a false claim of confidence there
//       would be the actual bug) — ties resolve, by stable sort, to
//       whichever group member appears earliest in the candidate array, so
//       that member (red, yellow, blue) is asserted for an exact name
//       match + real confidence, while its same-template siblings
//       (orange/brown, black/purple, green/pink) are asserted to land
//       somewhere in their own group with confidence ~0.
//   (b) when the ACTIVE-colours candidate pool doesn't contain a same-
//       template sibling yet (the normal early-learner case — matchChord
//       is always called with only the profile's active colours per
//       decision #8, not the full 9), detection is unambiguous and
//       confident. This is exercised in the "disambiguation via active
//       subset" block below.

const templateGroupKey = (chord) =>
  ChordDetect.chordTemplate(chord).map((v) => (v ? '1' : '0')).join('');

const groups = new Map(); // templateKey -> [chord, ...] in CORE_CHORDS order
CORE_CHORDS.forEach((chord) => {
  const key = templateGroupKey(chord);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(chord);
});

CORE_CHORDS.forEach((chord) => {
  const rand = makeRand(1); // fresh deterministic noise per chord
  const buf = synthChord(chord.notes, N, rand);
  const result = identifyChordWaveform(buf);
  const group = groups.get(templateGroupKey(chord));
  const groupNames = group.map((c) => c.name);

  assert.ok(!result.silence, `${chord.name}: expected non-silent detection`);
  assert.ok(result.best, `${chord.name}: expected a best match`);
  assert.ok(
    groupNames.includes(result.best.name),
    `${chord.name}: expected best match within its same-pitch-class-set group [${groupNames}], got ${result.best.name} (scores: ${JSON.stringify(result.scores)})`
  );

  // Whichever group member is asked about, its 2 same-template siblings
  // score EXACTLY as high (byte-identical templates -> identical cosine
  // similarity), so best/second/third are a true 3-way tie: margin is
  // always 0 regardless of which sibling "wins" the naming tie. Stable
  // sort resolves the naming tie to whichever sibling appears earliest in
  // CORE_CHORDS order (red before orange before brown, etc.), but that is
  // just an artifact of array order, NOT genuine confidence — so every
  // member of a 3-way-tied group must report confidence ~0, including the
  // one whose name happens to win the tie.
  const tieWinner = group[0].name === chord.name;
  assert.ok(result.confidence < 0.1, `${chord.name}: expected near-zero confidence given identical-template siblings [${groupNames}] in the pool, got ${result.confidence}`);
  if (tieWinner) {
    assert.equal(result.best.name, chord.name, `${chord.name}: expected exact match as its group's array-order tie-winner`);
    console.log(`ok - identify: synthetic "${chord.name}" (array-order tie-winner of [${groupNames}]) names itself but confidence is correctly ~0 (${result.confidence.toFixed(3)}) since it's a true 3-way tie`);
  } else {
    console.log(`ok - identify: synthetic "${chord.name}" correctly reports low confidence (${result.confidence.toFixed(3)}) — indistinguishable from same-triad siblings [${groupNames.filter((n) => n !== chord.name)}] by pitch class alone`);
  }
});

// --- disambiguation via active subset: with only ONE representative per
// pitch-class group in the candidate pool (the realistic early-learner
// case — a profile that has only unlocked red/yellow/blue so far, one per
// triad, has NOT yet unlocked orange/black/green etc.), detection is
// unambiguous and confident, because no same-template sibling is in the
// pool to tie against. This directly validates decision #8's design (only
// pass the profile's ACTIVE colours, never the full CHORDS table). ------

{
  const CHORD_BY_NAME = Object.fromEntries(CORE_CHORDS.map((c) => [c.name, c]));
  const activeSubset = [CHORD_BY_NAME.red, CHORD_BY_NAME.yellow, CHORD_BY_NAME.blue];
  activeSubset.forEach((chord) => {
    const rand = makeRand(1);
    const buf = synthChord(chord.notes, N, rand);
    const magnitudes = dft(buf);
    const result = ChordDetect.identify(magnitudes, { sampleRate: SAMPLE_RATE, fftSize: N, chords: activeSubset });
    assert.equal(result.best.name, chord.name, `${chord.name}: expected exact match within a sibling-free active subset`);
    assert.ok(result.confidence > 0.4, `${chord.name}: expected real confidence within a sibling-free active subset, got ${result.confidence}`);
    console.log(`ok - identify: "${chord.name}" identified confidently (${result.confidence.toFixed(3)}) when active colours don't include a same-triad sibling`);
  });
}

// --- rejection case: pure white noise should not hallucinate a chord ------

{
  const rand = makeRand(7);
  const buf = new Float64Array(N);
  for (let n = 0; n < N; n++) buf[n] = rand() * 2 - 1;
  const result = identifyChordWaveform(buf);
  // Either genuinely too quiet (unlikely for full-scale noise) or heard but
  // scored low-confidence — either way, must not hallucinate a chord.
  assert.ok(result.silence || result.confidence < 0.2, `expected white noise to be silence or low-confidence, got ${JSON.stringify({ silence: result.silence, confidence: result.confidence })}`);
  console.log(`ok - identify: pure white noise does not hallucinate a chord (silence=${result.silence}, confidence=${(result.confidence || 0).toFixed(3)})`);
}

// --- confusion sanity case: a single isolated note should not high-confidence
// match a chord that doesn't contain its pitch class -----------------------

{
  // G4 alone -> pitch class 7. Any core chord that does NOT include pitch
  // class 7 (G) must not come back as a high-confidence match: a single
  // note's harmonic bleed (octaves + fifth overtone) can flatter unrelated
  // templates, and this is exactly the failure mode margin-based confidence
  // exists to catch.
  const rand = makeRand(3);
  const buf = synthNote(noteToFreq('G4'), N, rand);
  const result = identifyChordWaveform(buf);
  const gPitchClass = ChordDetect.noteNameToPitchClass('G4');
  if (!result.silence && result.confidence > 0.4) {
    const bestChord = CORE_CHORDS.find((c) => c.name === result.best.name);
    const bestPitchClasses = bestChord.notes.map((n) => ChordDetect.noteNameToPitchClass(n));
    assert.ok(
      bestPitchClasses.includes(gPitchClass),
      `single G4 note matched high-confidence to "${result.best.name}" which does not contain G's pitch class (scores: ${JSON.stringify(result.scores)})`
    );
  }
  console.log(`ok - identify: isolated G4 note never high-confidence-matches a chord lacking G's pitch class (best=${result.best && result.best.name}, confidence=${(result.confidence || 0).toFixed(3)})`);
}

// --- chord-completeness safety: one piano key is not a three-note chord ----

{
  const rand = makeRand(11);
  const buf = synthNote(noteToFreq('E4'), N, rand);
  const magnitudes = dft(buf);
  const activeSubset = CORE_CHORDS.filter((c) => c.name === 'red' || c.name === 'yellow');
  const result = ChordDetect.identify(magnitudes, {
    sampleRate: SAMPLE_RATE,
    fftSize: N,
    chords: activeSubset,
  });
  assert.ok(
    result.confidence < 0.2,
    `isolated E4 must be rejected as an incomplete chord, got ${JSON.stringify({
      best: result.best && result.best.name,
      confidence: result.confidence,
    })}`
  );
  console.log('ok - identify: isolated E4 is rejected instead of being accepted as a complete Red chord');
}

// Exercise the same safety property across every core voicing. A live
// candidate pool need not contain a same-family sibling, so each target is
// tested alongside one representative from each other family: neither a
// lone bass key nor the target's bottom two keys may be promoted to a
// complete chord at the live 0.55 threshold.
{
  const familyFor = (chord) => templateGroupKey(chord);
  for (const chord of CORE_CHORDS) {
    const activePool = [
      chord,
      ...CORE_CHORDS.filter((candidate) => familyFor(candidate) !== familyFor(chord))
        .filter((candidate, index, all) =>
          all.findIndex((other) => familyFor(other) === familyFor(candidate)) === index),
    ];

    for (const notes of [[chord.notes[0]], chord.notes.slice(0, 2)]) {
      const rand = makeRand(23);
      const magnitudes = dft(synthChord(notes, N, rand));
      const result = ChordDetect.identifyWithBass(magnitudes, {
        sampleRate: SAMPLE_RATE,
        fftSize: N,
        chords: activePool,
      });
      assert.ok(
        result.confidence < 0.55,
        `${chord.name}: incomplete voicing [${notes.join(', ')}] must not clear the live threshold; got ${result.best && result.best.name} at ${result.confidence}`
      );
    }
  }
  console.log('ok - identifyWithBass: isolated bass keys and two-note voicings are rejected for all 9 core chords');
}

// --- inversion recognition: octave-preserving evidence must break a chroma tie

{
  const orange = CORE_CHORDS.find((c) => c.name === 'orange');
  const family = CORE_CHORDS.filter((c) => ['red', 'orange', 'brown'].includes(c.name));
  const rand = makeRand(13);
  const buf = synthChord(orange.notes, N, rand);
  const magnitudes = dft(buf);
  const result = ChordDetect.identifyWithBass(magnitudes, {
    sampleRate: SAMPLE_RATE,
    fftSize: N,
    chords: family,
  });
  assert.equal(result.best && result.best.name, 'orange', 'first-inversion C major must be identified as Orange');
  assert.ok(result.confidence >= 0.55, `Orange inversion must be accepted confidently, got ${result.confidence}`);
  console.log('ok - identifyWithBass: clean first-inversion C major is identified confidently as Orange');
}

// --- inversion evidence must not erase an ambiguous triad-family result ---

{
  const byName = Object.fromEntries(CORE_CHORDS.map((chord) => [chord.name, chord]));
  const candidates = [byName.red, byName.orange, byName.brown, byName.yellow];
  const magnitudes = new Float64Array(N / 2);
  const addPeak = (note, magnitude) => {
    const bin = Math.round((noteToFreq(note) * N) / SAMPLE_RATE);
    magnitudes[bin] = magnitude;
  };

  // Low-edge order C,E,F,G proves the Red-family three notes are present,
  // while the added F/A energy makes C-F-A almost equally plausible in
  // chroma. Bass C is not permission to ignore that family ambiguity.
  addPeak('C4', 1);
  addPeak('E4', 1);
  addPeak('F4', 0.99);
  addPeak('G4', 1);
  addPeak('A4', 0.99);

  const result = ChordDetect.identifyWithBass(magnitudes, {
    sampleRate: SAMPLE_RATE,
    fftSize: N,
    chords: candidates,
  });
  assert.equal(result.best && result.best.name, 'red', 'Red may remain the provisional top name');
  assert.ok(
    result.confidence < 0.55,
    `direct bass evidence must not promote a family-level near-tie; got ${result.confidence}`
  );
  console.log('ok - identifyWithBass: bass evidence cannot override an ambiguous triad-family match');
}

// --- an inactive/unmapped inversion must not inherit another colour -------

{
  const byName = Object.fromEntries(CORE_CHORDS.map((chord) => [chord.name, chord]));
  const magnitudes = dft(synthChord(byName.orange.notes, N, makeRand(31)));
  const result = ChordDetect.identifyWithBass(magnitudes, {
    sampleRate: SAMPLE_RATE,
    fftSize: N,
    chords: [byName.red, byName.yellow],
  });
  assert.ok(
    result.confidence < 0.55,
    `C/E must not be accepted as active Red merely because Orange is absent; got ${result.best && result.best.name} at ${result.confidence}`
  );
  console.log('ok - identifyWithBass: an inactive inversion cannot inherit its active sibling colour');
}

console.log('\nAll chord-detect.test.mjs assertions passed.');
console.log('\nReminder: this suite uses synthetic Node signals. Recorded sampled-piano onset coverage lives in chord-detect-sampled-piano.test.mjs; an acoustic piano through a real device microphone still requires live human validation.');
