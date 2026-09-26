import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fakeDom, fakeClock } from './helpers/fake-dom.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup({ micMode = false, deferredMic = false, deferredChord = false, ringing = true } = {}) {
  const { app, document } = fakeDom(), clock = fakeClock();
  const saved = new Map(), windowEvents = {}, played = [], listens = [], pendingStarts = [], pendingChords = [], rewards = [];
  let micStarts = 0, micStops = 0;
  const sandbox = { console, document, ...clock, requestAnimationFrame: callback => callback(),
    window: { addEventListener: (name, callback) => { windowEvents[name] = callback; } },
    navigator: {}, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    Sprites: { animals: ['fox'], icon: () => '', mascot: () => '', shape: () => '', flag: () => '' },
    PianoAudio: {
      async unlock() {}, stopAll() {}, async whenOutputSilent() {}, playSparkle() {},
      isChordRinging: () => ringing,
      async playReward(notes) { rewards.push([...notes]); },
      playChord(notes) { played.push([...notes]); return deferredChord ? new Promise(resolve => pendingChords.push(resolve)) : Promise.resolve(); },
    },
    MicCapture: {
      isSupported: () => true, stop() { micStops++; },
      start() { micStarts++; return deferredMic ? new Promise(resolve => pendingStarts.push(resolve)) : Promise.resolve(); },
      listenForChord(chords, heard, low, opts) { const listen = { chords, heard, low, opts, cancelled: false }; listens.push(listen); return { cancel() { listen.cancelled = true; } }; },
    },
  };
  vm.createContext(sandbox);
  for (const file of ['data', 'logic', 'storage']) vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), sandbox);
  vm.runInContext('this.store=Store; Store.updateProfile(Store.activeProfile().id, { realPianoMode: ' + micMode + ', activeColors: ["red"], roundsPerSet: 2 });', sandbox);
  vm.runInContext(fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'), sandbox);
  const click = async label => {
    // Search the whole body: confirmations open as overlays outside #app.
    const button = document.body.querySelectorAll('button').find(node => node.textContent === label);
    assert.ok(button, `button ${label} is visible: ${document.body.textContent}`);
    const pending = button.click(); await flush(); return { pending };
  };
  return { app, clock, click, played, listens, pendingStarts, pendingChords, windowEvents, rewards,
    store: sandbox.store, saved, get micStarts() { return micStarts; }, get micStops() { return micStops; } };
}
{
  const ui = setup({ micMode: true });
  await ui.click('Play'); await ui.click('Ready'); assert.equal(ui.micStarts, 1);
  await ui.click('All done'); await ui.click('Play again');
  assert.equal(ui.micStarts, 2, 'replay reacquires the microphone');
  assert.equal(ui.listens.length, 2); assert.equal(ui.played.length, 0);
}
{
  const ui = setup({ micMode: true, deferredMic: true });
  await ui.click('Play'); const { pending } = await ui.click('Ready');
  await ui.click('Not now'); ui.pendingStarts[0](); await pending; await flush();
  assert.ok(ui.app.querySelector('.home')); assert.equal(ui.listens.length, 0);
  assert.equal(ui.micStops, 1, 'leaving priming cancels acquisition');
}
{
  const ui = setup();
  await ui.click('Play'); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  await ui.click('All done'); await ui.click('Play again');
  await ui.clock.tick(2200);
  assert.equal(ui.played.length, 2, 'the previous answer timer cannot start an extra round');
  assert.equal(ui.store.activeProfile().events.length, 1);
}
{
  const ui = setup({ deferredChord: true });
  await ui.click('Play'); await ui.clock.tick(500);
  await ui.click('All done'); await ui.click('Play again');
  ui.pendingChords[0](); await flush();
  assert.ok(ui.app.querySelector('.answers').classList.contains('waiting'), 'old playback completion cannot unlock a new round');
  await ui.clock.tick(500); ui.pendingChords[1](); await flush();
  assert.equal(ui.app.querySelector('.answers').classList.contains('waiting'), false);
}
{
  const ui = setup();
  await ui.click('Play'); await ui.click('All done'); await ui.click('Play again'); await ui.clock.tick(500);
  assert.equal(ui.played.length, 1, 'stopping before the chord cancels the old chord timer');
  ui.windowEvents.pagehide(); await ui.clock.tick(5000);
  ui.windowEvents.pageshow({ persisted: true }); assert.ok(ui.app.querySelector('.home'));
}
{
  // ringing (default): a correct tap lands while the just-played chord is
  // still ringing, so it isn't replayed and the next round follows at the
  // shorter 800ms beat.
  const ui = setup();
  await ui.click('Play'); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  assert.equal(ui.rewards.length, 0, 'a still-ringing chord is not replayed');
  await ui.clock.tick(799);
  assert.equal(ui.played.length, 1, 'the next round has not started yet');
  await ui.clock.tick(1); await ui.clock.tick(500);
  assert.equal(ui.played.length, 2, "next round's chord sounds 800 + 500 ms after the tap");
}
{
  // not ringing (a slow answer, or real-piano mode where the app never
  // played the chord itself): the correct tap replays the chord softly, and
  // the round waits the longer 1100ms beat so that replay is heard.
  const ui = setup({ ringing: false });
  await ui.click('Play'); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  assert.equal(ui.rewards.length, 1, 'a faded chord is replayed once');
  assert.deepEqual(ui.rewards[0], ui.played[0], 'the replay uses the target chord notes');
  await ui.clock.tick(1099);
  assert.equal(ui.played.length, 1, 'the next round has not started yet');
  await ui.clock.tick(1); await ui.clock.tick(500);
  assert.equal(ui.played.length, 2, "next round's chord sounds 1100 + 500 ms after the tap");
}
{
  const ui = setup(); const p = ui.store.activeProfile();
  ui.store.recordRound('red', 'red', true); ui.store.recordRealPianoRound('red', 'yellow', false, .8);
  ui.store.recordSession({ rounds: 1, correct: 1 });
  ui.app.querySelector('.gear').click();
  for (const digit of ['2', '4', '6', '8']) await ui.click(digit);
  await ui.click('Settings'); await ui.click('Reset this child’s progress');
  assert.equal(p.events.length, 2, 'reset waits for the in-app confirmation');
  await ui.click('Reset progress');
  assert.equal(p.events.length, 0); assert.equal(p.sessions.length, 0); assert.equal(Object.keys(p.stats).length, 0);
  const persisted = JSON.parse(ui.saved.get('rainbow-pitch:v1')).profiles[0];
  assert.deepEqual(persisted.events, []); assert.deepEqual(persisted.activeColors, ['red']);
}
console.log('ok - app replay, startup cancellation, session timers, stale playback, and progress reset');

{
  const ui = setup({ micMode: true });
  await ui.click('Play'); await ui.click('Ready');
  const first = ui.listens[0];
  first.low({ reason: 'no-input' });
  assert.equal(ui.app.querySelector('.mic-status').textContent, 'Paused');
  assert.match(ui.app.querySelector('.mic-retry').textContent, /No microphone signal/);
  await ui.click('Try again');
  ui.listens[1].opts.onInput({ level: .7, state: 'sound' });
  assert.equal(ui.app.querySelector('.mic-status').textContent, 'Sound detected');
  assert.equal(ui.app.querySelector('.mic-meter').value, .7);
  first.opts.onInput({ level: 0, state: 'quiet' });
  assert.equal(ui.app.querySelector('.mic-status').textContent, 'Sound detected', 'stale input cannot change the new round');
  ui.listens[1].low({ reason: 'unrecognised' });
  assert.match(ui.app.querySelector('.mic-retry').textContent, /Sound reached the microphone/);
  assert.equal(ui.app.querySelector('.mic-status').textContent, 'Paused');
}
