import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fakeDom, fakeClock } from './helpers/fake-dom.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup({ micMode = false, deferredMic = false, deferredChord = false, ringing = true, colors = ['red'], navigator = {} } = {}) {
  const { app, document } = fakeDom(), clock = fakeClock();
  // The growing garden's past-days layer (see index.html's #garden, right
  // after the hills svg) — not part of fakeDom() itself since only this
  // suite's Home/garden tests need it.
  const garden = document.createElement('div'); garden.id = 'garden'; document.body.appendChild(garden);
  const saved = new Map(), windowEvents = {}, played = [], listens = [], pendingStarts = [], pendingChords = [], rewards = [];
  let micStarts = 0, micStops = 0;
  const sandbox = { console, document, ...clock, requestAnimationFrame: callback => callback(),
    window: { addEventListener: (name, callback) => { windowEvents[name] = callback; } },
    navigator, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    Sprites: { animals: ['fox'], icon: () => '', mascot: () => '', shape: () => '',
      // Reveals whether a caller passed { picture: false } (the flagPictures
      // toggle — see js/storage.js/js/app.js), without needing real SVG markup.
      flag: (c, o = {}) => (o.picture === false ? 'plain-flag' : 'picture-flag'),
      plant: (stage) => `plant-${stage}` },
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
  // i18n.js loads right after data.js (same order as index.html) — the
  // sandbox's navigator defaults to {} (English), so existing label-based
  // clicks below keep working unless a test explicitly asks for another one.
  for (const file of ['data', 'i18n', 'logic', 'storage']) vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), sandbox);
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
  return { app, document, garden, clock, click, played, listens, pendingStarts, pendingChords, windowEvents, rewards,
    store: sandbox.store, i18n: sandbox.I18n, saved, chordByName, colorBtn, get micStarts() { return micStarts; }, get micStops() { return micStops; } };
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

{
  // Home: a fresh profile hasn't planted anything yet, and no past day sits
  // in the garden. Recording sets (two today, one yesterday) and coming
  // back to Home should show today's plant grown and yesterday's flower
  // settled on the back hill.
  const ui = setup();
  assert.equal(ui.app.querySelector('.today-plant').textContent, 'plant-0');
  assert.equal(ui.garden.querySelector('.garden-flower'), null);

  const today = Date.now();
  const yesterday = today - 24 * 60 * 60 * 1000;
  ui.store.recordSession({ ts: today, rounds: 2, correct: 2, colors: ['red'] });
  ui.store.recordSession({ ts: today, rounds: 2, correct: 2, colors: ['red'] });
  ui.store.recordSession({ ts: yesterday, rounds: 2, correct: 2, colors: ['red'] });

  // Navigate away (an empty set — nothing scored) and back so Home re-renders.
  await ui.click('Play'); await ui.click('All done'); await ui.click('Home');
  assert.equal(ui.app.querySelector('.today-plant').textContent, 'plant-2');
  const flowers = ui.garden.querySelectorAll('.garden-flower');
  assert.equal(flowers.length, 1);
  assert.equal(flowers[0].textContent, 'plant-1');
}
console.log('ok - Home: today\'s plant grows with sets played today, and past days join the garden');

{
  // The watering can at the end of the vine fills a fraction of the set
  // every round, right or wrong.
  const ui = setup();
  await ui.click('Play');
  const can = ui.app.querySelector('.vine-can');
  assert.equal(can.style.cssText, '--fill:0');
  await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  assert.equal(can.style.cssText, '--fill:0.5');
  assert.ok(can.classList.contains('splash'));
}
console.log('ok - Practice: the watering can fills as the set is played');

{
  // Finishing a set that scored something shows the can+plant scene,
  // waiting for the child's own tap before the plant actually grows.
  const ui = setup();
  await ui.click('Play'); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  await ui.clock.tick(800); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  await ui.clock.tick(800);
  assert.ok(ui.app.querySelector('.water-can'));
  assert.ok(ui.app.querySelector('.cele-actions').classList.contains('waiting'));
  assert.equal(ui.app.querySelector('.cele-plant').textContent, 'plant-0');

  ui.app.querySelector('.water-can').click();
  await ui.clock.tick(900);
  assert.equal(ui.app.querySelector('.cele-plant').textContent, 'plant-1');
  assert.equal(ui.app.querySelector('.cele-title').textContent, 'It grew!');
  assert.equal(ui.app.querySelector('.cele-actions').classList.contains('waiting'), false);
}
console.log('ok - Celebration: tapping the can grows today\'s plant');

{
  // The 5th set of the day blooms the flower, in the colours just practised.
  const ui = setup();
  const today = Date.now();
  for (let i = 0; i < 4; i++) ui.store.recordSession({ ts: today, rounds: 2, correct: 2, colors: ['red'] });
  await ui.click('Play'); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  await ui.clock.tick(800); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  await ui.clock.tick(800);
  ui.app.querySelector('.water-can').click();
  await ui.clock.tick(900);
  assert.equal(ui.app.querySelector('.cele-title').textContent, 'Your flower bloomed!');
  assert.ok(ui.app.querySelector('.cele-garden').classList.contains('bloomed'));
}
console.log('ok - Celebration: the 5th set of the day blooms the flower');

{
  // A child who never taps the can still gets to Play again / Home — the
  // reward is nice to have, never a gate.
  const ui = setup();
  await ui.click('Play'); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  await ui.clock.tick(800); await ui.clock.tick(500);
  ui.app.querySelector('.color-btn').click();
  await ui.clock.tick(800);
  assert.ok(ui.app.querySelector('.cele-actions').classList.contains('waiting'));
  await ui.clock.tick(8000);
  assert.equal(ui.app.querySelector('.cele-actions').classList.contains('waiting'), false);
}
console.log('ok - Celebration: the actions show themselves after 8s even if the can is never tapped');

{
  // Nothing scored (a calm stop before any first tap) means nothing to
  // water — no can, and the actions are never hidden waiting for one.
  const ui = setup();
  await ui.click('Play'); await ui.click('All done');
  assert.equal(ui.app.querySelector('.water-can'), null);
  assert.equal(ui.app.querySelector('.cele-actions').classList.contains('waiting'), false);
}
console.log('ok - Celebration: nothing scored means nothing to water');

{
  // The guardian-only flagPictures toggle (default on): Home's flags and a
  // practice round's flags follow it, without anything else changing.
  const ui = setup();
  const p = ui.store.activeProfile();
  assert.equal(ui.app.querySelector('.today-swatch').textContent, 'picture-flag', 'Home flags show pictures by default');

  ui.store.updateProfile(p.id, { flagPictures: false });
  await ui.click('Play'); await ui.click('All done'); await ui.click('Home');
  assert.equal(ui.app.querySelector('.today-swatch').textContent, 'plain-flag', 'turning pictures off plainifies Home\'s flags');

  await ui.click('Play'); await ui.clock.tick(500);
  assert.equal(ui.app.querySelector('.color-btn').textContent, 'plain-flag', 'and a practice round\'s answer flags too');
}
console.log('ok - Settings: the flagPictures toggle plainifies Home and practice flags');

{
  // The whole app follows the browser's language by default (I18n.detectLanguage,
  // see js/i18n.js) — a Spanish browser sees the Spanish Home screen and gets
  // <html lang="es">, with no guardian involvement at all.
  const ui = setup({ navigator: { languages: ['es-ES'] } });
  assert.equal(ui.app.querySelector('.play-label').textContent, 'Jugar', 'Home shows the Spanish Play label');
  assert.equal(ui.document.documentElement.lang, 'es', 'the fake <html> gets the resolved language');
}
console.log('ok - I18n: a Spanish browser language shows the Spanish Home screen');

{
  // A guardian can override the language in Settings; it takes effect
  // immediately (no reload), same as any other Settings toggle.
  const ui = setup({ navigator: { languages: ['es-ES'] } });
  assert.equal(ui.app.querySelector('.play-label').textContent, 'Jugar');
  ui.app.querySelector('.gear').click();
  for (const digit of ['2', '4', '6', '8']) await ui.click(digit);
  await ui.click('Ajustes'); // the Settings tab itself is already in Spanish at this point
  const englishBtn = ui.app.querySelectorAll('button').find((b) => b.textContent === 'English');
  assert.ok(englishBtn, 'the English option is offered by its own name, untranslated');
  englishBtn.click(); await flush();
  await ui.click('Done'); // the Settings screen already re-rendered in English by this point
  assert.equal(ui.app.querySelector('.play-label').textContent, 'Play', 'overriding to English updates Home immediately');
  assert.equal(ui.document.documentElement.lang, 'en');
}
console.log('ok - I18n: overriding the language in Settings updates the app immediately');

{
  // The grown-up Colours list shows each chord's name and its notes low to
  // high, via I18n.chord/I18n.notes — letters in English, solfège in Spanish
  // (auto note names follow the language; see js/i18n.js's noteNames()).
  const rowSubFor = (ui, colorLabel) => {
    const mains = ui.app.querySelectorAll('.g-row-main');
    const main = mains.find((m) => m.children[0].textContent === colorLabel);
    assert.ok(main, `a row for "${colorLabel}" is visible`);
    return main.children[1].textContent;
  };
  const en = setup();
  en.app.querySelector('.gear').click();
  for (const digit of ['2', '4', '6', '8']) await en.click(digit);
  assert.equal(rowSubFor(en, 'Yellow'), 'Chord F/C · C F A');

  const es = setup({ navigator: { languages: ['es-ES'] } });
  es.app.querySelector('.gear').click();
  for (const digit of ['2', '4', '6', '8']) await es.click(digit);
  assert.equal(rowSubFor(es, 'Amarillo'), 'Acorde Fa/Do · Do Fa La');
}
console.log('ok - I18n: the Colours list shows chord names and notes in the current language/note-name spelling');
