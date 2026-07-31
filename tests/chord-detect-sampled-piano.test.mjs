import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ChordDetect = require('../js/chord-detect.js');
const FreshChordGate = require('../js/fresh-chord-gate.js');

const dataSrc = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
const dataSandbox = {};
vm.createContext(dataSandbox);
vm.runInContext(dataSrc + '\nthis.CHORDS = CHORDS;', dataSandbox);
const allChords = dataSandbox.CHORDS;

const fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/salamander-onset-spectra.json', import.meta.url), 'utf8')
);

function decodeSpectrum(sparseBins) {
  const magnitudes = new Float64Array(fixture.fftSize / 2);
  for (const [index, quantizedMagnitude] of sparseBins) {
    magnitudes[index] = quantizedMagnitude / 65535;
  }
  return magnitudes;
}

function positiveFlux(current, previous) {
  let risingPower = 0;
  let currentPower = 0;
  for (let i = 0; i < current.length; i++) {
    const now = current[i] * current[i];
    const before = previous[i] * previous[i];
    if (now > before) risingPower += now - before;
    currentPower += now;
  }
  return currentPower > 0 ? risingPower / currentPower : 0;
}

const sampledChords = allChords.filter((chord) => fixture.frames[chord.name]);
assert.equal(sampledChords.length, 14, 'the recorded fixture must contain all 14 configured chords');

for (const chord of sampledChords) {
  const heard = [];
  const gate = FreshChordGate.create({
    onHeard: (result) => heard.push(result.best.name),
    onLowConfidence: () => {},
  });
  const silence = { silence: true, best: null, confidence: 0, energy: 0 };

  for (let frame = 0; frame < 3; frame++) {
    gate.pushFrame({
      at: frame * 60,
      energy: 1e-9,
      positiveFlux: 0,
      result: silence,
    });
  }

  let previous = new Float64Array(fixture.fftSize / 2);
  fixture.frames[chord.name].forEach((sparseBins, index) => {
    const magnitudes = decodeSpectrum(sparseBins);
    const result = ChordDetect.identifyWithBass(magnitudes, {
      sampleRate: fixture.sampleRate,
      fftSize: fixture.fftSize,
      chords: allChords,
    });
    gate.pushFrame({
      at: 180 + fixture.offsetsMs[index],
      energy: result.energy,
      positiveFlux: positiveFlux(magnitudes, previous),
      result,
    });
    previous = magnitudes;
  });

  assert.deepEqual(
    heard,
    [chord.name],
    `${chord.name}: sampled-piano onset sequence must produce exactly one correct colour`
  );
  console.log(`ok - sampled piano: ${chord.name} onset sequence is accepted exactly once`);
}

console.log('\nAll chord-detect-sampled-piano.test.mjs assertions passed.');
