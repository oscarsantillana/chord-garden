import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harnessPath = path.join(__dirname, '..', 'tools', 'real-piano-acceptance', 'acceptance.js');

const CANDIDATE_NAMES = [
  'red', 'yellow', 'blue', 'black', 'green',
  'orange', 'purple', 'pink', 'brown',
  'gray', 'tan', 'lightgreen', 'lightpurple', 'skyblue',
];

const chords = [
  ...CANDIDATE_NAMES.map((name) => ({
    name,
    label: name[0].toUpperCase() + name.slice(1),
    notes: [`${name}-bass`, `${name}-middle`, `${name}-top`],
  })),
];

{
  const Harness = require(harnessPath);
  const queue = Harness.buildQueue(chords, {
    positiveRepetitions: 3,
    negativeRepetitions: 1,
  });

  assert.equal(queue.length, 59, '42 positive and 17 negative trials are scheduled');
  assert.deepEqual(
    queue.slice(0, 14).map((trial) => trial.stimulus.expected),
    CANDIDATE_NAMES,
    'the first positive pass follows the fixed all-chord order'
  );
  assert.deepEqual(
    queue.slice(0, 42).map((trial) => trial.condition),
    [
      ...Array(14).fill('normal'),
      ...Array(14).fill('weak'),
      ...Array(14).fill('sustained'),
    ],
    'positive conditions rotate deterministically by complete pass'
  );
  assert.deepEqual(
    queue.slice(42).map((trial) => trial.stimulus.case),
    [
      'silence',
      'single-key',
      'dyad',
      'speech',
      'room-transient',
      'previous-chord-tail',
      'red-reward-tail',
      'gray-first-inversion',
      'gray-second-inversion',
      'tan-first-inversion',
      'tan-second-inversion',
      'lightgreen-first-inversion',
      'lightgreen-second-inversion',
      'lightpurple-first-inversion',
      'lightpurple-second-inversion',
      'skyblue-first-inversion',
      'skyblue-second-inversion',
    ]
  );
  assert.equal(queue[0].stimulus.technique, 'normal');
  assert.equal(queue[14].stimulus.technique, 'weak');
  assert.equal(queue[28].stimulus.technique, 'sustained');
  assert.deepEqual(queue[48].notes, ['C4', 'E4', 'G4']);
  assert.deepEqual(queue[49].notes, ['C#4', 'E4', 'A4']);
  assert.deepEqual(queue.at(-1).notes, ['Bb4', 'Eb5', 'G5']);
  assert.deepEqual(
    Harness.selectCandidateChords(chords).map((chord) => chord.name),
    CANDIDATE_NAMES,
    'the detector always receives the full fourteen-chord pool'
  );
  assert.ok(Object.isFrozen(queue));
  assert.ok(queue.every((trial) => Object.isFrozen(trial) && Object.isFrozen(trial.stimulus)));
}

{
  const Harness = require(harnessPath);
  const events = [];
  let releasePlayback;
  let releaseBarrier;
  const playback = new Promise((resolve) => { releasePlayback = resolve; });
  const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
  const audio = {
    playReward(notes) {
      events.push(`reward:${notes.join(',')}`);
      return playback;
    },
    stopAll() {
      events.push('stop');
    },
    whenOutputSilent() {
      events.push('barrier');
      return barrier;
    },
  };

  const prepared = await Harness.prepareProductionOutputTail(
    audio,
    ['C4', 'E4', 'G4'],
    {
      async wait(milliseconds) {
        events.push(`wait:${milliseconds}`);
      },
    }
  );
  assert.deepEqual(events, [
    'reward:C4,E4,G4',
    'wait:1100',
    'stop',
    'barrier',
  ], 'the production timer must elapse and stop output without awaiting reward scheduling');
  let armed = false;
  prepared.armAfter.then(() => { armed = true; });
  await Promise.resolve();
  assert.equal(armed, false, 'capture must remain behind the production release barrier');
  releaseBarrier();
  await Promise.resolve();
  assert.equal(armed, false, 'pending reward scheduling must also keep capture closed');
  releasePlayback();
  await prepared.armAfter;
  assert.equal(armed, true);
}

{
  const Harness = require(harnessPath);

  for (const [label, playReward] of [
    ['synchronous reward failure', () => { throw new Error('sync reward failed'); }],
    ['asynchronous reward failure', () => Promise.reject(new Error('async reward failed'))],
  ]) {
    const audio = {
      playReward,
      stopAll() {},
      whenOutputSilent() { return Promise.resolve(); },
    };
    const prepared = await Harness.prepareProductionOutputTail(
      audio,
      ['C4', 'E4', 'G4'],
      { wait: async () => {} }
    );
    await assert.rejects(prepared.armAfter, /reward failed/, label);
  }

  const workingAudio = {
    playReward() { return Promise.resolve(); },
    stopAll() {},
    whenOutputSilent() { return Promise.resolve(); },
  };
  await assert.rejects(
    Harness.prepareProductionOutputTail(
      workingAudio,
      ['C4', 'E4', 'G4'],
      { wait: async () => { throw new Error('timer failed'); } }
    ),
    /timer failed/
  );
  await assert.rejects(
    Harness.prepareProductionOutputTail(
      {
        ...workingAudio,
        stopAll() { throw new Error('stop failed'); },
      },
      ['C4', 'E4', 'G4'],
      { wait: async () => {} }
    ),
    /stop failed/
  );
  await assert.rejects(
    Harness.prepareProductionOutputTail(
      {
        ...workingAudio,
        whenOutputSilent() { throw new Error('barrier failed'); },
      },
      ['C4', 'E4', 'G4'],
      { wait: async () => {} }
    ),
    /barrier failed/
  );
}

{
  const Harness = require(harnessPath);
  const controller = new AbortController();
  let stopped = 0;
  let laterPlayback;
  const playback = new Promise((resolve) => { laterPlayback = resolve; });
  const audio = {
    playReward() { return playback; },
    stopAll() { stopped += 1; },
    whenOutputSilent() { return Promise.resolve(); },
  };
  const preparing = Harness.prepareProductionOutputTail(
    audio,
    ['C4', 'E4', 'G4'],
    {
      signal: controller.signal,
      wait(_milliseconds, signal) {
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
    }
  );
  controller.abort(new Error('operator stopped'));
  await assert.rejects(preparing, /operator stopped/);
  laterPlayback();
  await Promise.resolve();
  assert.ok(stopped >= 1, 'stale reward completion must stop output again after cancellation');
}

{
  const Harness = require(harnessPath);
  const changes = [];
  const phases = Harness.createPhaseMachine((phase) => changes.push(phase));

  assert.equal(phases.current(), 'SETUP');
  assert.throws(() => phases.move('READY'), /cannot move from SETUP to READY/);

  phases.move('PREVIEW');
  phases.move('ARMING');
  phases.move('READY');
  phases.move('RESULT');
  phases.move('PREVIEW');

  assert.deepEqual(changes, ['PREVIEW', 'ARMING', 'READY', 'RESULT', 'PREVIEW']);
  assert.equal(phases.current(), 'PREVIEW');

  phases.reset();
  assert.equal(phases.current(), 'SETUP');
  assert.equal(changes.at(-1), 'SETUP');

  phases.move('PREVIEW');
  phases.move('ARMING');
  phases.move('RESULT');
  assert.equal(phases.current(), 'RESULT', 'timeout before readiness may terminate without a false READY');
}

{
  const Harness = require(harnessPath);
  const available = {
    chords: true,
    chordDetect: true,
    freshChordGate: true,
    micCapture: true,
    recorder: true,
    pianoAudio: true,
    tone: true,
  };

  assert.deepEqual(
    Harness.checkEnvironment({
      isSecureContext: true,
      protocol: 'http:',
      hostname: '127.0.0.1',
      serviceWorkerControlled: false,
      capabilities: available,
      micSupported: true,
    }),
    { ok: true, reason: '' }
  );
  assert.match(
    Harness.checkEnvironment({
      isSecureContext: false,
      protocol: 'http:',
      hostname: '192.168.1.50',
      serviceWorkerControlled: false,
      capabilities: available,
      micSupported: true,
    }).reason,
    /secure context/
  );
  assert.match(
    Harness.checkEnvironment({
      isSecureContext: true,
      protocol: 'https:',
      hostname: 'example.test',
      serviceWorkerControlled: true,
      capabilities: available,
      micSupported: true,
    }).reason,
    /service worker/
  );
  assert.match(
    Harness.checkEnvironment({
      isSecureContext: true,
      protocol: 'file:',
      hostname: '',
      serviceWorkerControlled: false,
      capabilities: available,
      micSupported: true,
    }).reason,
    /HTTP server/
  );
}

{
  const htmlPath = path.join(
    __dirname,
    '..',
    'tools',
    'real-piano-acceptance',
    'index.html'
  );
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptSources = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(scriptSources, [
    'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js',
    '../../js/data.js',
    '../../js/audio.js',
    '../../js/chord-detect.js',
    '../../js/fresh-chord-gate.js',
    '../../js/mic-capture.js',
    '../../js/real-piano-acceptance.js',
    'acceptance.js',
  ]);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(
    html,
    /script-src 'self' 'sha384-c6Uo4N9c3SOEigMVzP6IshUG1wQ5uMp3xeoQFiHWAQ86joWdgyajkvopySyKy\/Z6';/
  );
  for (const file of [
    'A0.mp3', 'C1.mp3', 'Ds1.mp3', 'Fs1.mp3',
    'A1.mp3', 'C2.mp3', 'Ds2.mp3', 'Fs2.mp3',
    'A2.mp3', 'C3.mp3', 'Ds3.mp3', 'Fs3.mp3',
    'A3.mp3', 'C4.mp3', 'Ds4.mp3', 'Fs4.mp3',
    'A4.mp3', 'C5.mp3', 'Ds5.mp3', 'Fs5.mp3',
    'A5.mp3', 'C6.mp3',
  ]) {
    assert.ok(
      html.includes(`https://tonejs.github.io/audio/salamander/${file}`),
      `CSP must allow only the exact production sample path for ${file}`
    );
  }
  assert.doesNotMatch(html, /connect-src https:\/\/tonejs\.github\.io(?:;|\s)/);
  assert.match(html, /media-src 'none'/);
  assert.match(
    html,
    /integrity="sha384-c6Uo4N9c3SOEigMVzP6IshUG1wQ5uMp3xeoQFiHWAQ86joWdgyajkvopySyKy\/Z6"/
  );
  assert.match(html, /crossorigin="anonymous"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /worker-src blob:/);
  assert.doesNotMatch(html, /js\/(?:app|storage)\.js|sw\.js/);

  const source = fs.readFileSync(harnessPath, 'utf8');
  for (const forbidden of [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.match(source, /new Blob\(/);
  assert.match(source, /MicCapture\.start\(\)/);
  assert.match(source, /candidateNames:\s*CANDIDATE_NAMES/);
  assert.match(source, /recorder\.markReady\(activeTrialId\)/);
  assert.match(source, /status:\s*'invalid'/);
  assert.match(source, /prepareProductionOutputTail/);
  assert.match(source, /reason:\s*'playback-error'/);
  assert.match(source, /await PianoAudio\.unlock\(\);[\s\S]*await MicCapture\.start\(\);/);
  assert.doesNotMatch(source, /Promise\.all\(\[pianoReady,\s*microphoneReady\]\)/);
  assert.match(source, /AbortController/);
  assert.match(source, /addEventListener\('pagehide'/);
  assert.match(source, /addEventListener\('visibilitychange'/);
}

console.log('real-piano acceptance browser harness tests passed');
