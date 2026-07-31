import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RealPianoAcceptance = require('../js/real-piano-acceptance.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rainbow-pitch-summary-'));

function completedExport(metadata, sessionId, detected) {
  let now = 0;
  const session = RealPianoAcceptance.createSession(metadata, {
    clock: () => now,
    sessionId,
    candidateNames: ['red'],
  });
  const trialId = session.beginTrial({
    kind: 'chord',
    expected: 'red',
    label: 'Red',
    technique: 'normal',
  });
  session.markOnset(trialId);
  now = 300;
  session.completeTrial(trialId, {
    status: 'accepted',
    detected,
    confidence: 0.9,
  });
  return session.exportData();
}

try {
  const firstPath = path.join(temporaryDirectory, 'first.json');
  const secondPath = path.join(temporaryDirectory, 'second.json');
  fs.writeFileSync(firstPath, JSON.stringify(completedExport(
    { instrument: 'upright-cli', device: 'phone-cli', environment: 'quiet-room' },
    'cli-1',
    'red'
  )));
  fs.writeFileSync(secondPath, JSON.stringify(completedExport(
    { instrument: 'grand-cli', device: 'laptop-cli', environment: 'ordinary-room' },
    'cli-2',
    'blue'
  )));

  const cliPath = new URL(
    '../tools/real-piano-acceptance/summarize.mjs',
    import.meta.url
  );
  const result = spawnSync(
    process.execPath,
    [cliPath.pathname, firstPath, secondPath],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.overall.positive.total, 2);
  assert.equal(summary.overall.positive.correctAccepted, 1);
  assert.equal(summary.overall.positive.wrongAccepted, 1);
  assert.deepEqual(summary.coverage.devices, ['laptop-cli', 'phone-cli']);
  assert.deepEqual(summary.weakBuckets.device, ['laptop-cli']);
  console.log('ok - acceptance summary CLI: combines local session exports');
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
