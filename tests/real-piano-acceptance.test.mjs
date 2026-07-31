import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RealPianoAcceptance = require('../js/real-piano-acceptance.js');

{
  let now = 1000;
  const session = RealPianoAcceptance.createSession(
    {
      instrument: 'upright-1',
      device: 'phone-1',
      environment: 'quiet-room',
    },
    {
      clock: () => now,
      sessionId: 'session-1',
    }
  );

  const intended = { kind: 'chord', expected: 'red', label: 'Red' };
  const trialId = session.beginTrial(intended);
  session.markOnset(trialId);
  intended.expected = 'orange';
  now = 1640;
  const trial = session.completeTrial(trialId, {
    status: 'accepted',
    detected: 'orange',
    confidence: 0.91,
  });

  assert.equal(trial.stimulus.expected, 'red', 'ground truth must be frozen before listening starts');
  assert.equal(trial.classification, 'wrong-accept');
  assert.equal(trial.latencyMs, 640);
  assert.deepEqual(session.summary().positive, {
    total: 1,
    accepted: 1,
    correctAccepted: 0,
    wrongAccepted: 1,
    abstained: 0,
    acceptedAccuracy: 0,
    correctCoverage: 0,
  });
  console.log('ok - acceptance session: freezes ground truth and classifies a wrong accepted chord');
}

{
  let now = 2000;
  const session = RealPianoAcceptance.createSession(
    {
      instrument: 'grand-1',
      device: 'tablet-1',
      environment: 'ordinary-room',
    },
    { clock: () => now, sessionId: 'session-2' }
  );

  const trialId = session.beginTrial({ kind: 'chord', expected: 'blue', label: 'Blue' });
  now = 9000;
  const trial = session.completeTrial(trialId, {
    status: 'abstained',
    reason: 'timeout',
  });

  assert.equal(trial.classification, 'abstain');
  assert.equal(trial.observationMs, 7000);
  assert.equal(trial.latencyMs, null, 'a no-onset timeout has no detector latency');
  assert.deepEqual(session.summary().positive, {
    total: 1,
    accepted: 0,
    correctAccepted: 0,
    wrongAccepted: 0,
    abstained: 1,
    acceptedAccuracy: null,
    correctCoverage: 0,
  });
  console.log('ok - acceptance session: records a detector abstention separately from a wrong answer');
}

{
  let now = 3000;
  const session = RealPianoAcceptance.createSession(
    {
      instrument: 'upright-2',
      device: 'laptop-1',
      environment: 'ordinary-room',
    },
    { clock: () => now, sessionId: 'session-3' }
  );

  let trialId = session.beginTrial({
    kind: 'negative',
    case: 'single-key',
    label: 'Play one piano key',
  });
  session.markOnset(trialId);
  now += 500;
  const falseAccept = session.completeTrial(trialId, {
    status: 'accepted',
    detected: 'yellow',
    confidence: 0.83,
  });

  trialId = session.beginTrial({
    kind: 'negative',
    case: 'speech-noise',
    label: 'Speak near the microphone',
  });
  now += 7000;
  const correctReject = session.completeTrial(trialId, {
    status: 'abstained',
    reason: 'timeout',
  });

  assert.equal(falseAccept.classification, 'false-accept');
  assert.equal(correctReject.classification, 'correct-reject');
  const summary = session.summary();
  assert.deepEqual(summary.negative, {
    total: 2,
    correctRejected: 1,
    falseAccepted: 1,
    rejectionRate: 0.5,
  });
  assert.deepEqual(summary.gates, {
    coverageTarget: 0.9,
    confidenceThreshold: 0.55,
    unsafeAccepts: 1,
    zeroWrongAccepted: false,
    positiveCoveragePass: null,
  });
  assert.deepEqual(summary.byStimulus, [
    {
      key: 'negative:single-key',
      kind: 'negative',
      total: 1,
      correctRejected: 0,
      falseAccepted: 1,
      rejectionRate: 0,
    },
    {
      key: 'negative:speech-noise',
      kind: 'negative',
      total: 1,
      correctRejected: 1,
      falseAccepted: 0,
      rejectionRate: 1,
    },
  ]);
  console.log('ok - acceptance session: distinguishes negative-case rejection from a false accepted colour');
}

{
  let now = 10000;
  const session = RealPianoAcceptance.createSession(
    {
      instrument: 'upright-3',
      device: 'phone-2',
      environment: 'quiet-room',
    },
    { clock: () => now, sessionId: 'session-4' }
  );

  const trialId = session.beginTrial({ kind: 'chord', expected: 'green', label: 'Green' });
  now = 10420;
  session.markOnset(trialId);
  now = 10760;
  const trial = session.completeTrial(trialId, {
    status: 'accepted',
    detected: 'green',
    confidence: 0.88,
  });

  assert.equal(trial.observationMs, 760);
  assert.equal(trial.latencyMs, 340, 'latency must start at acoustic onset, not when the prompt was shown');
  console.log('ok - acceptance session: separates operator wait time from detector latency');
}

{
  assert.throws(
    () => RealPianoAcceptance.createSession({
      instrument: 'upright-4',
      device: 'phone-3',
      environment: 'quiet-room',
      audio: new Float32Array([0.1, 0.2]),
    }),
    /unknown metadata field: audio/
  );
  assert.throws(
    () => RealPianoAcceptance.createSession(
      {
        instrument: 'upright-4',
        device: 'phone-3',
        environment: 'quiet-room',
      },
      { audio: new Float32Array([0.1, 0.2]) }
    ),
    /unknown option field: audio/
  );

  const session = RealPianoAcceptance.createSession(
    {
      instrument: 'upright-4',
      device: 'phone-3',
      environment: 'quiet-room',
    },
    { sessionId: 'session-5' }
  );
  assert.throws(
    () => session.beginTrial({
      kind: 'chord',
      expected: 'red',
      label: 'Red',
      spectrum: new Float32Array([1, 2]),
    }),
    /unknown stimulus field: spectrum/
  );

  const trialId = session.beginTrial({ kind: 'negative', case: 'silence', label: 'Silence' });
  assert.throws(() => session.exportData(), /complete the active trial/);
  session.completeTrial(trialId, { status: 'abstained', reason: 'timeout' });

  const data = session.exportData();
  const exported = JSON.stringify(data);
  assert.ok(!/MediaStream|deviceId/i.test(exported));
  assert.equal(data.schema, 'rainbow-pitch.real-piano-acceptance');
  assert.equal('createdAt' in data, false, 'exports must not contain an exact wall-clock timestamp');
  assert.deepEqual(data.privacy, {
    audioStored: false,
    spectraStored: false,
    microphoneIdentifiersStored: false,
    exactTimestampsStored: false,
  });
  console.log('ok - acceptance session: rejects diagnostic payloads and exports no audio or spectra');
}

{
  let now = 20000;
  const session = RealPianoAcceptance.createSession(
    {
      instrument: 'upright-5',
      device: 'laptop-2',
      environment: 'ordinary-room',
    },
    {
      clock: () => now,
      sessionId: 'session-6',
      confidenceThreshold: 0.55,
    }
  );

  const trialId = session.beginTrial({ kind: 'chord', expected: 'purple', label: 'Purple' });
  now += 240;
  session.markReady(trialId);
  now += 180;
  session.markOnset(trialId);
  now += 300;
  assert.throws(
    () => session.completeTrial(trialId, {
      status: 'accepted',
      detected: 'purple',
      confidence: 0.54,
    }),
    /below the session threshold/
  );
  assert.throws(
    () => session.completeTrial(trialId, {
      status: 'accepted',
      detected: 'purple',
      confidence: 0.9,
      spectrum: [1, 2, 3],
    }),
    /unknown outcome field: spectrum/
  );
  const trial = session.completeTrial(trialId, {
    status: 'invalid',
    reason: 'operator-error',
  });

  assert.equal(trial.classification, 'invalid');
  assert.equal(trial.readyMs, 240);
  assert.equal(trial.onsetMs, 420);
  assert.equal(trial.latencyMs, null, 'invalid attempts must not publish a detector latency');
  assert.deepEqual(session.summary().invalid, {
    total: 1,
    byReason: { 'operator-error': 1 },
  });
  console.log('ok - acceptance session: enforces threshold, records readiness, and retains invalid attempts');
}

{
  let now = 30000;
  function makeSession(metadata, sessionId) {
    return RealPianoAcceptance.createSession(metadata, {
      clock: () => now,
      sessionId,
      candidateNames: ['red', 'blue'],
    });
  }
  function accept(session, stimulus, detected) {
    const trialId = session.beginTrial(stimulus);
    session.markOnset(trialId);
    now += 300;
    return session.completeTrial(trialId, {
      status: 'accepted',
      detected,
      confidence: 0.9,
    });
  }
  function abstain(session, stimulus) {
    const trialId = session.beginTrial(stimulus);
    now += 7000;
    return session.completeTrial(trialId, {
      status: 'abstained',
      reason: 'timeout',
    });
  }

  const first = makeSession(
    { instrument: 'upright-a', device: 'phone-a', environment: 'quiet-room' },
    'matrix-1'
  );
  accept(first, {
    kind: 'chord',
    expected: 'red',
    label: 'Red',
    technique: 'normal',
  }, 'red');
  accept(first, {
    kind: 'chord',
    expected: 'blue',
    label: 'Blue',
    technique: 'weak',
  }, 'blue');
  abstain(first, {
    kind: 'negative',
    case: 'speech',
    label: 'Speak near the microphone',
  });

  const second = makeSession(
    { instrument: 'grand-a', device: 'laptop-a', environment: 'ordinary-room' },
    'matrix-2'
  );
  accept(second, {
    kind: 'chord',
    expected: 'red',
    label: 'Red',
    technique: 'normal',
  }, 'blue');
  accept(second, {
    kind: 'negative',
    case: 'single-key',
    label: 'Play one key',
  }, 'red');

  const firstExport = first.exportData();
  assert.deepEqual(firstExport.settings.candidateNames, ['red', 'blue']);
  const aggregate = RealPianoAcceptance.summarizeSessions([
    firstExport,
    second.exportData(),
  ]);

  assert.equal(aggregate.overall.positive.total, 3);
  assert.equal(aggregate.overall.positive.correctAccepted, 2);
  assert.equal(aggregate.overall.positive.wrongAccepted, 1);
  assert.equal(aggregate.overall.negative.falseAccepted, 1);
  assert.equal(aggregate.overall.gates.unsafeAccepts, 2);
  assert.equal(aggregate.byDevice['phone-a'].positive.correctCoverage, 1);
  assert.equal(aggregate.byDevice['laptop-a'].positive.correctCoverage, 0);
  assert.equal(aggregate.byTechnique.normal.positive.correctCoverage, 0.5);
  assert.deepEqual(aggregate.weakBuckets.device, ['laptop-a']);
  assert.deepEqual(aggregate.coverage, {
    sessions: 2,
    instruments: ['grand-a', 'upright-a'],
    devices: ['laptop-a', 'phone-a'],
    environments: ['ordinary-room', 'quiet-room'],
    candidateNames: ['blue', 'red'],
  });
  console.log('ok - acceptance aggregation: exposes weak hardware buckets and matrix coverage');
}

{
  let now = 40000;
  const session = RealPianoAcceptance.createSession(
    {
      instrument: 'upright-b',
      device: 'phone-b',
      environment: 'ordinary-room',
    },
    { clock: () => now, sessionId: 'session-7' }
  );
  const trialId = session.beginTrial({ kind: 'chord', expected: 'tan', label: 'Tan' });
  now += 100;
  session.markOnset(trialId);
  now += 400;
  session.markOnset(trialId);
  now += 300;
  const trial = session.completeTrial(trialId, {
    status: 'accepted',
    detected: 'tan',
    confidence: 0.88,
  });

  assert.equal(trial.onsetCount, 2);
  assert.equal(trial.onsetMs, 500, 'the terminal attack should replace an earlier false onset');
  assert.equal(trial.latencyMs, 300, 'latency should be measured from the latest onset');
  console.log('ok - acceptance session: a later real attack supersedes an earlier false onset');
}
