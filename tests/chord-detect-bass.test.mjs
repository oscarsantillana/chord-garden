import { magnitudeSpectrum } from './helpers/fft.mjs';
// Rainbow Pitch — adversarial tests for the shipped selective inversion path.
//
// Purpose (read this before touching thresholds): chroma alone cannot tell
// red/orange/brown (etc.) apart. This file keeps the original 405-condition
// grid and asks whether register and harmonic evidence stays both safe and useful
// under piano-like stresses:
//   - weak or fully MISSING fundamentals (very common on real low piano
//     notes — the amplitude at k=1 can be a small fraction of the upper
//     partials, or effectively absent)
//   - INHARMONICITY (real piano partials sit sharp of exact integer
//     multiples: f_k = k*f0*sqrt(1+B*k^2), never exactly f_k = k*f0)
//   - the whole chord played in a DIFFERENT OCTAVE than the app's own
//     digital note names (proves this isn't secretly hardcoded to
//     "red = C4 specifically")
//
// It reports top-name coverage for diagnosis, then enforces the actual live
// contract: zero wrong accepted colours at confidence >= 0.55 and >=95%
// correct accepted coverage in the realistic subset. Do not narrow the grid
// or loosen those assertions to improve a headline number.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ChordDetect = require('../js/chord-detect.js');

const dataSrc = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
const dataSandbox = {};
vm.createContext(dataSandbox);
vm.runInContext(dataSrc + '\nthis.CHORDS = CHORDS;', dataSandbox);
const { CHORDS } = dataSandbox;
const CORE_CHORDS = CHORDS.slice(0, 9);

const FAMILIES = [
  ['red', 'orange', 'brown'],
  ['yellow', 'black', 'purple'],
  ['blue', 'green', 'pink'],
];
const CHORD_BY_NAME = Object.fromEntries(CORE_CHORDS.map((c) => [c.name, c]));

// --- Synthesis: same DFT/sample-rate conventions as tests/chord-detect.test.mjs ---

const SAMPLE_RATE = 11025;
const N = 4096; // wider than Stage 1's 2048 — better frequency resolution helps the
// harmonic-window search distinguish real evidence from noise at higher k.

function noteToFreq(note) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = parseInt(m[3], 10);
  const semitoneFromA4 = base + accidental + (octave - 4) * 12 - 9;
  return 440 * Math.pow(2, semitoneFromA4 / 12);
}

function makeRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// Inharmonic piano-like partial synthesis for ONE note. Unlike Stage 1's
// synthNote (clean integer harmonics, always a full-strength fundamental),
// this:
//   - places partial k at k*freq*sqrt(1+B*k^2) — REAL inharmonic stretch,
//     not the idealized f_k = k*freq.
//   - scales partial k=1's amplitude by `fundamentalAmp` (1.0 = normal,
//     0.0 = fully missing fundamental), independent of the decay applied to
//     k=2..8, so a weak/missing fundamental doesn't also artificially weaken
//     the harmonics that are supposed to carry the pitch evidence instead.
function synthInharmonicNote(freq, length, rand, { B = 0, fundamentalAmp = 1.0 } = {}) {
  const baseAmps = [1, 0.6, 0.35, 0.22, 0.14, 0.09, 0.06, 0.04];
  const buf = new Float64Array(length);
  const nyquistLimit = 0.92 * (SAMPLE_RATE / 2);
  for (let k = 1; k <= baseAmps.length; k++) {
    const partialFreq = k * freq * Math.sqrt(1 + B * k * k);
    if (partialFreq >= nyquistLimit) continue;
    const amp = baseAmps[k - 1] * (k === 1 ? fundamentalAmp : 1);
    for (let n = 0; n < length; n++) {
      buf[n] += amp * Math.sin((2 * Math.PI * partialFreq * n) / SAMPLE_RATE);
    }
  }
  for (let n = 0; n < length; n++) buf[n] += 0.02 * (rand() * 2 - 1);
  return buf;
}

// A chord's test waveform: 3 notes summed, each independently inharmonic,
// each optionally octave-shifted (shiftOctaves applies to ALL 3 notes
// together — a real adult transposing the whole triad up/down the keyboard,
// not just one note).
function synthChord(notes, length, rand, { B, fundamentalAmp, shiftOctaves = 0 } = {}) {
  const buf = new Float64Array(length);
  notes.forEach((note) => {
    const freq = noteToFreq(note) * Math.pow(2, shiftOctaves);
    const noteBuf = synthInharmonicNote(freq, length, rand, { B, fundamentalAmp });
    for (let n = 0; n < length; n++) buf[n] += noteBuf[n];
  });
  return buf;
}

function hannWindow(length) {
  const w = new Float64Array(length);
  for (let n = 0; n < length; n++) w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (length - 1));
  return w;
}

// Preserve the original Hann window and unnormalized magnitudes.
function dft(buf) {
  const window = hannWindow(buf.length);
  return magnitudeSpectrum(buf.map((value, index) => value * window[index]));
}

// --- Main adversarial grid: {family x true-bass-colour x B x fundamentalAmp x octave shift} ---

const B_VALUES = [
  { label: 'clean (B=0)', B: 0 },
  { label: 'typical piano (B=0.0004)', B: 0.0004 },
  { label: 'design upper bound (B=0.0006)', B: 0.0006 },
  { label: 'beyond design bound (B=0.0012)', B: 0.0012 },
  { label: 'extreme/adversarial (B=0.0020)', B: 0.0020 },
];
const FUND_AMPS = [
  { label: 'normal fundamental (1.0)', amp: 1.0 },
  { label: 'weak fundamental (0.15)', amp: 0.15 },
  { label: 'missing fundamental (0.0)', amp: 0.0 },
];
const OCTAVE_SHIFTS = [-1, 0, 1]; // whole chord transposed down/unchanged/up an octave from the app's own digital register

const results = []; // {family, colour, B, amp, shift, pass, detected, confidence}

FAMILIES.forEach((family) => {
  const chordsInFamily = family.map((name) => CHORD_BY_NAME[name]);
  family.forEach((trueColour) => {
    const trueChord = CHORD_BY_NAME[trueColour];
    B_VALUES.forEach(({ B, label: bLabel }) => {
      FUND_AMPS.forEach(({ amp, label: ampLabel }) => {
        OCTAVE_SHIFTS.forEach((shift) => {
          const rand = makeRand(17);
          const buf = synthChord(trueChord.notes, N, rand, { B, fundamentalAmp: amp, shiftOctaves: shift });
          const magnitudes = dft(buf);
          const out = ChordDetect.identifyWithBass(magnitudes, {
            sampleRate: SAMPLE_RATE,
            fftSize: N,
            chords: chordsInFamily,
            // Search band widened to comfortably cover the +-1 octave shift
            // on top of the B3-G4-ish core register.
            bassOpts: { minFreq: 90, maxFreq: 850 },
          });
          const detected = out.best ? out.best.name : null;
          const pass = detected === trueColour;
          results.push({ family: family.join('/'), colour: trueColour, bLabel, ampLabel, shift, pass, detected, confidence: out.confidence });
        });
      });
    });
  });
});

const total = results.length;
const passed = results.filter((r) => r.pass).length;
console.log(`\n=== ADVERSARIAL GRID: ${passed}/${total} (${((100 * passed) / total).toFixed(1)}%) correct colour identifications across full {family x B x fundamentalAmp x octaveShift} sweep ===\n`);

function breakdown(keyFn, label) {
  const groups = new Map();
  results.forEach((r) => {
    const key = keyFn(r);
    if (!groups.has(key)) groups.set(key, { pass: 0, total: 0 });
    const g = groups.get(key);
    g.total += 1;
    if (r.pass) g.pass += 1;
  });
  console.log(`--- by ${label} ---`);
  [...groups.entries()].forEach(([key, g]) => {
    console.log(`  ${key}: ${g.pass}/${g.total} (${((100 * g.pass) / g.total).toFixed(1)}%)`);
  });
  console.log('');
}

breakdown((r) => r.bLabel, 'inharmonicity coefficient B');
breakdown((r) => r.ampLabel, 'fundamental strength');
breakdown((r) => `octave shift ${r.shift >= 0 ? '+' : ''}${r.shift}`, 'octave shift from app\'s digital register');
breakdown((r) => r.family, 'triad family');

// Worst-case cell specifically: extreme inharmonicity AND missing
// fundamental AND shifted register, simultaneously — the actual hard case
// this feature was commissioned to survive, called out on its own so it
// can't hide inside a favourable average.
const worst = results.filter((r) => r.bLabel.startsWith('extreme') && r.ampLabel.startsWith('missing'));
const worstPass = worst.filter((r) => r.pass).length;
console.log(`--- worst case (extreme inharmonicity B=0.002 AND fully missing fundamental, all octave shifts) ---`);
console.log(`  ${worstPass}/${worst.length} (${((100 * worstPass) / worst.length).toFixed(1)}%)`);
worst.forEach((r) => {
  console.log(`    ${r.colour} shift=${r.shift}: ${r.pass ? 'PASS' : 'FAIL'} (detected=${r.detected}, confidence=${r.confidence.toFixed(2)})`);
});
console.log('');

// Realistic-conditions cell: this is the number that actually matters for
// "will this work for a real piano" — typical/design-bound inharmonicity,
// normal-to-weak (not necessarily fully absent) fundamental.
const realistic = results.filter(
  (r) => (r.bLabel.startsWith('typical') || r.bLabel.startsWith('design')) && !r.ampLabel.startsWith('missing')
);
const realisticPass = realistic.filter((r) => r.pass).length;
console.log(`--- realistic conditions (typical/design-bound B, normal-or-weak-but-present fundamental) ---`);
console.log(`  ${realisticPass}/${realistic.length} (${((100 * realisticPass) / realistic.length).toFixed(1)}%)`);
console.log('');

// Child-scoring safety is selective: abstaining is acceptable, confidently
// naming the wrong colour is not. Evaluate the same threshold used by the
// live microphone path instead of treating every array-order `best` as an
// accepted answer.
{
  const accepted = results.filter((r) => r.confidence >= 0.55);
  const wrongAccepted = accepted.filter((r) => !r.pass);
  assert.equal(
    wrongAccepted.length,
    0,
    `no wrong inversion may clear the live confidence threshold; examples: ${JSON.stringify(wrongAccepted.slice(0, 5))}`
  );
  const realisticAccepted = realistic.filter((r) => r.confidence >= 0.55 && r.pass);
  assert.ok(
    realisticAccepted.length / realistic.length >= 0.95,
    `the safe detector must remain useful in realistic conditions; accepted ${realisticAccepted.length}/${realistic.length}`
  );
  console.log(`ok - selective safety: ${accepted.length}/${results.length} trials accepted with zero wrong accepted colours`);
  console.log(`ok - selective utility: ${realisticAccepted.length}/${realistic.length} realistic-condition trials accepted correctly`);
}

// --- Non-family control: with only ONE representative per family present,
// direct bass evidence must preserve the correct chroma answer while still
// validating that the written voicing—not an inactive inversion—was played.
{
  const rand = makeRand(1);
  const chord = CHORD_BY_NAME.red;
  const buf = synthChord(chord.notes, N, rand, { B: 0.0004, fundamentalAmp: 1.0, shiftOctaves: 0 });
  const magnitudes = dft(buf);
  const activeSubset = [CHORD_BY_NAME.red, CHORD_BY_NAME.yellow, CHORD_BY_NAME.blue];
  const plain = ChordDetect.identify(magnitudes, { sampleRate: SAMPLE_RATE, fftSize: N, chords: activeSubset });
  const withBass = ChordDetect.identifyWithBass(magnitudes, { sampleRate: SAMPLE_RATE, fftSize: N, chords: activeSubset });
  assert.equal(withBass.best.name, plain.best.name, 'written-bass validation must preserve the correct family answer');
  assert.equal(withBass.confidence, plain.confidence, 'written-bass validation must preserve confidence for the exact voicing');
  assert.equal(withBass.bass && withBass.bass.method, 'note-evidence', 'every accepted chord must carry checked written-bass evidence');
  console.log('ok - identifyWithBass: validates written bass without changing a correct unique-family answer');
}

// --- Silence / noise control: must not hallucinate a confident bass call --
//
// The retired inferred-harmonic scorer used to hallucinate confidently here.
// The shipped note-evidence path is deliberately selective: noise lacks complete
// chord evidence, so confidence must remain below the live threshold.
{
  const rand = makeRand(9);
  const buf = new Float64Array(N);
  for (let n = 0; n < N; n++) buf[n] = 0.02 * (rand() * 2 - 1);
  const magnitudes = dft(buf);
  const chordsInFamily = FAMILIES[0].map((name) => CHORD_BY_NAME[name]);
  const out = ChordDetect.identifyWithBass(magnitudes, { sampleRate: SAMPLE_RATE, fftSize: N, chords: chordsInFamily });
  assert.ok(out.silence || out.confidence < 0.55, 'quiet noise must not clear the live confidence threshold');
  console.log(`ok - identifyWithBass on quiet noise: silence=${out.silence}, confidence=${(out.confidence || 0).toFixed(3)}, best=${out.best && out.best.name}`);
}

console.log('\nAll chord-detect-bass.test.mjs safety and utility assertions passed.');
console.log('Top-name accuracy includes abstentions; the release contract is zero wrong accepted colours plus useful realistic-condition coverage.');
