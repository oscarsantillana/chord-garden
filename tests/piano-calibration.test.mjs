import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fakeDom, Element } from './helpers/fake-dom.mjs';
const require = createRequire(import.meta.url);
const ChordDetect = require('../js/chord-detect.js');
const { document, app } = fakeDom();
for (const id of ['target', 'notes', 'start', 'stop', 'status', 'input', 'level', 'result', 'outcome', 'summary', 'save']) {
  const element = new Element(id === 'target' ? 'select' : 'div'); element.id = id; app.appendChild(element);
}
const $ = id => document.getElementById(id);
$('target').value = 'red';
const documentEvents = {}, windowEvents = {}, listens = [];
document.addEventListener = (event, callback) => { documentEvents[event] = callback; };
let stops = 0;
const sandbox = { document, console, setTimeout, clearTimeout, ChordDetect,
  window: { addEventListener: (event, callback) => { windowEvents[event] = callback; } },
  MicCapture: { async start() {}, stop() { stops++; }, listenForChord(chords, heard, low, opts) { listens.push({ chords, heard, low, opts }); } },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(new URL('../tools/piano-calibration/calibration.js', import.meta.url), 'utf8'), sandbox);
await $('start').click();
assert.equal(listens[0].chords.length, 14, 'the intended target never narrows the candidate pool');
listens[0].opts.onReady();
assert.match($('status').textContent, /Play now/);
listens[0].low({ reason: 'unrecognised' });
assert.equal($('outcome').textContent, 'No chord accepted.');
assert.equal($('start').disabled, false);
assert.equal(stops, 1);
await $('start').click();
listens[0].opts.onReady();
assert.match($('status').textContent, /getting ready/, 'stale readiness cannot prompt a new attempt early');
document.hidden = true; documentEvents.visibilitychange();
assert.equal(stops, 2, 'hiding the page releases microphone capture');
assert.equal($('outcome').textContent, 'Stopped.');
listens[1].heard({ name: 'red' }, .9);
assert.equal($('outcome').textContent, 'Stopped.', 'late detection cannot replace a cancelled attempt');
console.log('ok - calibration preserves candidate pool, exposes readiness, and cancels safely');
