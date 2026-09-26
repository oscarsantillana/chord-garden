import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fakeDom, fakeClock } from './helpers/fake-dom.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup({ micMode = false, deferredMic = false, deferredChord = false, ringing = true, colors = ['red'] } = {}) {
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
  vm.runInContext('this.store=Store; Store.updateProfile(Store.activeProfile().id, { realPianoMode: ' + micMode + ', activeColors: ' + JSON.stringify(colors) + ', roundsPerSet: 2 });', sandbox);
  vm.runInContext(fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'), sandbox);
  const chordByName = vm.runInContext('CHORD_BY_NAME', sandbox); // for tests that need to know the (randomly picked) target
  const click = async label => {
    // Search the whole body: confirmations open as overlays outside #app.
    const button = document.body.querySelectorAll('button').find(node => node.textContent === label);
    assert.ok(button, `button ${label} is visible: ${document.body.textContent}`);
    const pending = button.click(); await flush(); return { pending };
  };
  const colorBtn = name => app.querySelector(`.color-btn[data-color="${name}"]`);
  return { app, document, clock, click, played, listens, pendingStarts, pendingChords, windowEvents, rewards,
    store: sandbox.store, saved, chordByName, colorBtn, get micStarts() { return micStarts; }, get micStops() { return micStops; } };
}
// With two+ active colours the round's target is picked at random; the only
// way to know which one without reaching into session state is to match the
// chord that was actually played against each colour's known notes.
const targetOf = (ui, colors) => colors.find(name => JSON.stringify(ui.chordByName[name].notes) === JSON.stringify(ui.played[ui.played.length - 1]));
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
console.log('ok - real-piano low-confidence retry, stale input, and a second retry');

{
  // Digital mode's round-start cue is the mascot + the chord itself, never a
  // card — a young child can't read "Listen…", and it would flash every
  // round for no reason.
  const ui = setup();
  await ui.click('Play');
  assert.ok(ui.app.querySelector('.answers').classList.contains('waiting'));
  assert.equal(ui.app.querySelector('.answers').classList.contains('dim'), false, 'digital mode does not dim the flags while waiting');
  assert.equal(ui.app.querySelector('.round-cue'), null, 'digital mode renders no round-cue card');
  assert.ok(ui.document.getElementById('mascot').classList.contains('listening'));
  await ui.clock.tick(500);
  assert.ok(ui.app.querySelector('.answers').classList.contains('flutter'), 'the flags flutter once the chord sounds');
  assert.equal(ui.app.querySelector('.answers').classList.contains('waiting'), false);
  await ui.clock.tick(1200);
  assert.equal(ui.document.getElementById('mascot').classList.contains('listening'), false, 'the listening pose settles 1200ms after the chord starts');
}
{
  // Only a set's first practice screen fades in; the round-to-round rebuild
  // must not, or the whole garden blinks under the confetti.
  const ui = setup();
  await ui.click('Play');
  assert.equal(ui.app.querySelector('.practice').classList.contains('continuing'), false, 'the first round fades in');
  await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  await ui.clock.tick(800);
  assert.ok(ui.app.querySelector('.practice').classList.contains('continuing'), 'the next round does not replay the fade-in');
  await ui.click('All done'); await ui.click('Play again');
  assert.equal(ui.app.querySelector('.practice').classList.contains('continuing'), false, 'a new set fades in again');
}
{
  // A tap inside the listening pose's 1200ms drops it immediately.
  const ui = setup();
  await ui.click('Play'); await ui.clock.tick(500);
  assert.ok(ui.document.getElementById('mascot').classList.contains('listening'));
  ui.app.querySelector('.color-btn').click();
  assert.equal(ui.document.getElementById('mascot').classList.contains('listening'), false, 'a quick tap ends the listening pose');
}
{
  // Mic mode is unchanged: the round-cue card and the waiting dim are both
  // instructions for the grown-up, who can read.
  const ui = setup({ micMode: true });
  await ui.click('Play'); await ui.click('Ready');
  assert.ok(ui.app.querySelector('.round-cue'));
  assert.ok(ui.app.querySelector('.answers').classList.contains('dim'));
}
console.log('ok - digital mode drops the Listen card for a listening mascot and a flag flutter; mic mode keeps its card');

{
  // A wrong tap reveals the right flag immediately instead of waiting for a
  // second miss — with two colours a retry is always right by elimination,
  // so the old two-miss design taught nothing on the first miss.
  const colors = ['red', 'yellow'];
  const ui = setup({ colors });
  await ui.click('Play'); await ui.clock.tick(500);
  const target = targetOf(ui, colors);
  const wrong = colors.find((name) => name !== target);
  const wrongBtn = ui.colorBtn(wrong), correctBtn = ui.colorBtn(target);

  wrongBtn.click(); await flush();
  assert.ok(ui.app.querySelector('.answers').classList.contains('reveal'));
  assert.ok(correctBtn.classList.contains('reveal'));
  let events = ui.store.activeProfile().events;
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);

  await ui.clock.tick(300);
  assert.equal(ui.played.length, 2, 'the target chord replays alongside the reveal');

  wrongBtn.click(); await flush();
  assert.equal(ui.store.activeProfile().events.length, 1, 'tapping a non-glowing flag during reveal changes nothing');
  assert.equal(ui.played.length, 2);

  correctBtn.click(); await flush();
  assert.ok(correctBtn.classList.contains('confirmed'));
  assert.equal(ui.store.activeProfile().events.length, 1, 'confirming a reveal records nothing new');
  assert.equal(ui.document.getElementById('confetti').children.length, 0, 'a confirmed reveal gets no confetti');

  await ui.clock.tick(800); await ui.clock.tick(500);
  assert.equal(ui.played.length, 3, "next round's chord sounds after the confirm");
}
{
  // If the child never taps the glowing flag, the round still has to move
  // on — the fallback fires 5s after the wrong tap (the replayed chord
  // rings ~3.3s, then a moment of quiet).
  const colors = ['red', 'yellow'];
  const ui = setup({ colors });
  await ui.click('Play'); await ui.clock.tick(500);
  const target = targetOf(ui, colors);
  const wrong = colors.find((name) => name !== target);
  ui.colorBtn(wrong).click(); await flush();

  await ui.clock.tick(5000); await ui.clock.tick(500);
  assert.equal(ui.played.length, 3, "the fallback moved on and the next round's chord played");
  assert.equal(ui.store.activeProfile().events.length, 1, 'the fallback records nothing beyond the original miss');

  await ui.clock.tick(5000);
  assert.equal(ui.played.length, 3, 'ticking further does not start an extra round');
}
console.log('ok - a wrong tap reveals the answer, waits for it to be confirmed, and falls back if it never is');
