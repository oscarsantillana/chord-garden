import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const ChordDetect = require('../../js/chord-detect.js');
const FreshChordGate = require('../../js/fresh-chord-gate.js');
const data = {};
vm.runInNewContext(fs.readFileSync(new URL('../../js/data.js', import.meta.url), 'utf8') + ';this.chords=CHORDS;', data);

export function replay(attempt) {
  const { sampleRate, fftSize, frames } = attempt;
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isInteger(fftSize) || fftSize < 32 || fftSize > 32768 || (fftSize & (fftSize - 1)) !== 0 ||
      !Array.isArray(frames) || frames.length < 1 || frames.length > 200) throw new Error('Invalid calibration frame format');
  let detected = null, confidence = 0, ready = false, onsets = 0, previous = null, lastAt = -1;
  const gate = FreshChordGate.create({ onReady() { ready = true; }, onOnset() { onsets++; },
    onHeard(result) { detected = result.best.name; confidence = result.confidence; } });
  const reasons = {};
  for (const frame of frames) {
    if (!Number.isFinite(frame.at) || frame.at < lastAt || !Array.isArray(frame.magnitudes) ||
        frame.magnitudes.length !== fftSize / 2 || frame.magnitudes.some(value => !Number.isFinite(value) || value < 0)) {
      throw new Error('Invalid calibration spectrum');
    }
    lastAt = frame.at;
    const result = ChordDetect.identifyWithBass(frame.magnitudes, { sampleRate, fftSize, chords: data.chords });
    const reason = result.silence ? 'silence' : result.incomplete ? 'incomplete'
      : result.ambiguousBass ? 'ambiguous-bass' : result.confidence < .55 ? 'low-confidence' : 'confident';
    reasons[reason] = (reasons[reason] || 0) + 1;
    let rising = 0, power = 0;
    frame.magnitudes.forEach((value, i) => {
      const current = value * value;
      power += current;
      if (previous) rising += Math.max(0, current - previous[i] * previous[i]);
    });
    const positiveFlux = previous && power > 0 ? rising / power : 0;
    previous = frame.magnitudes;
    gate.pushFrame({ at: frame.at, energy: result.energy, positiveFlux, result });
    if (gate.getState() === 'DONE') break;
  }
  return { recorded: attempt.outcome ?? null, replayed: { detected, confidence, ready, onsets }, reasons };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.error('Usage: node tools/piano-calibration/replay.mjs <diagnostics.json>'); process.exitCode = 1; }
  else console.log(JSON.stringify(replay(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), null, 2));
}
