// Chord Garden — builds the piano note files in assets/piano/ from the
// Salamander Grand Piano V3 recordings (Alexander Holm, CC-BY 3.0), then
// measures what it made. Run from the repo root (needs ffmpeg on PATH):
//
//   node tools/piano-samples/build.mjs [--cache <dir>]
//
// Why prepare files instead of streaming Salamander as before:
// - One file per note the chords use, so the browser never stretches a
//   neighbouring recording to reach a pitch. Salamander only recorded every
//   third note, so each file here is made from the nearest recording (at most
//   one semitone away) with a high-quality resampler, once, offline.
// - Every note is tuned to A = 440 equal temperament from its measured pitch.
// - Every note is levelled to the same loudness, so no chord is louder than
//   another. A louder or brighter chord would be a hint a child could learn
//   instead of listening to the pitch.
// - 3.4 s per file instead of Salamander's 16 s: chords ring for 3 s, and the
//   browser keeps every file unpacked in memory (an iPad has to hold them).
//
// The checks at the end must all pass; the script exits non-zero otherwise.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const OUT_DIR = new URL('assets/piano/v1/', ROOT);
const REPORT = new URL('tools/piano-samples/report.json', ROOT);
const SOURCE_BASE = 'https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/master/Samples/';

// Salamander's 16 velocity layers, by role. `main` is the everyday sound:
// the app's previous files were Salamander layers 6–8 (measured), so layer 7
// keeps a child's familiar sound. `gainDb` is relative to the main layer.
const LAYERS = {
  main: { velocity: 7, gainDb: 0 },
};
const TARGET_RMS_DB = -26; // per note, first second after the strike (mono); the old files averaged -26
const SR = 48000;
const FILE_SECONDS = 3.4;  // 3 s chord + 0.3 s damper release, plus a little slack
const FADE_SECONDS = 0.4;  // ends silent even if a chord is held to the very end
const PRE_ROLL_MS = 3;     // keep the very start of the hammer strike

const args = process.argv.slice(2);
const cacheDir = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : path.join(os.tmpdir(), 'chord-garden-salamander');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// ---- Notes the chords use (js/data.js is the source of truth) -------------
const data = {};
vm.runInNewContext(fs.readFileSync(new URL('js/data.js', ROOT), 'utf8') + ';this.CHORDS = CHORDS;', data);
const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (n) => PCS[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12 * (Number(n.slice(-1)) + 1);
const SHARP = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
const fileNameOf = (m) => SHARP[m % 12] + (Math.floor(m / 12) - 1); // 'As3' — no '#' in URLs
const NOTES = [...new Set(data.CHORDS.flatMap((c) => c.notes.map(midiOf)))].sort((a, b) => a - b);

// Salamander's recorded notes (minor thirds from A0) and their file stems.
const RECORDED = { 57: 'A3', 60: 'C4', 63: 'D#4', 66: 'F#4', 69: 'A4', 72: 'C5', 75: 'D#5', 78: 'F#5' };
const nearestRecorded = (m) => Object.keys(RECORDED).map(Number)
  .reduce((best, k) => (Math.abs(k - m) < Math.abs(best - m) ? k : best));

// ---- Audio helpers ----------------------------------------------------------
function decode(file, channels = 1) {
  const buf = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', String(channels), '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function fftMagnitudes(x, start, n) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next;
      }
    }
  }
  return (k) => Math.hypot(re[k], im[k]);
}

// The strike: the first sample above 1% of the first second's peak.
function onsetOf(x) {
  let peak = 0;
  for (let i = 0; i < SR && i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak * 0.01) return i;
  return 0;
}

// Fundamental near `midi`, in cents from A = 440 equal temperament. A 1.4 s
// window from 150 ms after the strike, with parabolic peak interpolation, is
// good to a fraction of a cent.
function centsOff(x, onset, midi) {
  const n = 65536, start = onset + Math.round(0.15 * SR), mag = fftMagnitudes(x, start, n);
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  const lo = Math.floor((f0 * 2 ** (-0.5 / 12) * n) / SR), hi = Math.ceil((f0 * 2 ** (0.5 / 12) * n) / SR);
  let k = lo;
  for (let i = lo; i <= hi; i++) if (mag(i) > mag(k)) k = i;
  const a = Math.log(mag(k - 1)), b = Math.log(mag(k)), c = Math.log(mag(k + 1));
  const f = ((k + (0.5 * (a - c)) / (a - 2 * b + c)) * SR) / n;
  return 1200 * Math.log2(f / f0);
}

const rmsDb = (x, from, len) => {
  let ss = 0;
  for (let i = 0; i < len; i++) ss += (x[from + i] || 0) ** 2;
  return 10 * Math.log10(ss / len + 1e-20);
};
const peakDb = (x) => 20 * Math.log10(x.reduce((p, v) => Math.max(p, Math.abs(v)), 0) + 1e-20);

// ---- Sources ----------------------------------------------------------------
fs.mkdirSync(cacheDir, { recursive: true });
function source(stem, velocity) {
  const file = path.join(cacheDir, `${stem}v${velocity}.flac`);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    console.log(`downloading ${stem}v${velocity}.flac`);
    execFileSync('curl', ['-sfL', '-o', file, SOURCE_BASE + encodeURIComponent(`${stem}v${velocity}.flac`)]);
  }
  return file;
}

// ---- Build ------------------------------------------------------------------
const report = { source: 'Salamander Grand Piano V3 by Alexander Holm (CC-BY 3.0)', targetRmsDb: TARGET_RMS_DB, layers: {} };
const failures = [];
fs.rmSync(OUT_DIR, { recursive: true, force: true });

for (const [layer, { velocity, gainDb }] of Object.entries(LAYERS)) {
  const dir = new URL(`${layer}/`, OUT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const notes = {};
  for (const m of NOTES) {
    const key = nearestRecorded(m);
    const src = source(RECORDED[key], velocity);
    const x = decode(src);
    const onset = onsetOf(x);
    const measured = centsOff(x, onset, key);
    // Resample by the semitone step, less the recording's own tuning error.
    const ratio = 2 ** (((m - key) * 100 - measured) / 1200);
    const level = rmsDb(x, onset, SR);
    const gain = TARGET_RMS_DB + gainDb - level;
    const start = Math.max(0, onset / SR - PRE_ROLL_MS / 1000);
    const out = new URL(`${fileNameOf(m)}.mp3`, dir);
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', start.toFixed(5), '-i', src, '-af', [
      `asetrate=${(SR * ratio).toFixed(4)}`,
      `aresample=${SR}:filter_size=128:phase_shift=14:cutoff=0.97`, // high-quality windowed-sinc
      `atrim=duration=${FILE_SECONDS}`,
      `afade=t=out:st=${(FILE_SECONDS - FADE_SECONDS).toFixed(2)}:d=${FADE_SECONDS}`,
      `volume=${gain.toFixed(2)}dB`,
    ].join(','), '-ar', String(SR), '-c:a', 'libmp3lame', '-b:a', '128k', out.pathname]);

    // Measure what was written, not what was intended.
    const y = decode(out.pathname);
    const yOnset = onsetOf(y);
    const result = {
      from: `${RECORDED[key]}v${velocity}`, stepSemitones: m - key, sourceCents: +measured.toFixed(2),
      cents: +centsOff(y, yOnset, m).toFixed(2), rmsDb: +rmsDb(y, yOnset, SR).toFixed(2),
      peakDb: +peakDb(y).toFixed(2), tailDb: +rmsDb(y, y.length - SR / 100, SR / 100).toFixed(1),
      bytes: fs.statSync(out).size,
    };
    notes[fileNameOf(m)] = result;
    if (Math.abs(result.cents) > 1) failures.push(`${layer}/${fileNameOf(m)}: ${result.cents} cents off`);
    if (Math.abs(result.rmsDb - (TARGET_RMS_DB + gainDb)) > 0.75) failures.push(`${layer}/${fileNameOf(m)}: level ${result.rmsDb} dB`);
    if (result.tailDb > -70) failures.push(`${layer}/${fileNameOf(m)}: ends at ${result.tailDb} dB, not silent`);
    if (result.peakDb > -3) failures.push(`${layer}/${fileNameOf(m)}: peak ${result.peakDb} dB`);
  }

  // Every chord, as the app will play it: the three files started together.
  const cache = {};
  const load = (m) => (cache[m] ||= decode(new URL(`${fileNameOf(m)}.mp3`, dir).pathname));
  const chords = {};
  for (const c of data.CHORDS) {
    const ys = c.notes.map((n) => load(midiOf(n)));
    const mix = new Float32Array(Math.max(...ys.map((y) => y.length)));
    ys.forEach((y) => y.forEach((v, i) => { mix[i] += v; }));
    const o = onsetOf(mix);
    const mag = fftMagnitudes(mix, o, 32768);
    let num = 0, den = 0;
    for (let k = 1; k < 16384; k++) { const v = mag(k); num += (v * k * SR) / 32768; den += v; }
    chords[c.name] = { rmsDb: +rmsDb(mix, o, SR).toFixed(2), peakDb: +peakDb(mix).toFixed(2), brightnessHz: Math.round(num / den) };
  }
  const levels = Object.values(chords).map((c) => c.rmsDb);
  const spread = Math.max(...levels) - Math.min(...levels);
  if (spread > 1.5) failures.push(`${layer}: chord loudness spread ${spread.toFixed(2)} dB`);
  const loudestPeak = Math.max(...Object.values(chords).map((c) => c.peakDb));
  if (loudestPeak > -1) failures.push(`${layer}: a chord peaks at ${loudestPeak} dB`);
  report.layers[layer] = { velocity, gainDb, notes, chords, chordSpreadDb: +spread.toFixed(2) };

  console.log(`\n${layer} (Salamander layer ${velocity}): ${NOTES.length} notes`);
  for (const [name, r] of Object.entries(notes)) {
    console.log(`  ${name.padEnd(4)} from ${r.from.padEnd(6)} ${(r.stepSemitones > 0 ? '+' : '') + r.stepSemitones} st  source ${String(r.sourceCents).padStart(5)} ¢ → ${String(r.cents).padStart(5)} ¢  level ${r.rmsDb} dB  peak ${r.peakDb} dB  ${Math.round(r.bytes / 1024)} KB`);
  }
  console.log(`  chords: loudness spread ${spread.toFixed(2)} dB, loudest peak ${loudestPeak} dB`);
}

fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
if (failures.length) {
  console.error('\nFAILED:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`\nAll checks passed. Files in ${OUT_DIR.pathname}, report in ${REPORT.pathname}`);
