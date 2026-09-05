import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup({ suspended = false, fail = false } = {}) {
  const requests = [], contexts = [], resume = deferred();
  class Context {
    constructor() { this.sampleRate = 48000; this.state = suspended ? 'suspended' : 'running'; this.closed = false; contexts.push(this); }
    resume() { return resume.promise; }
    async close() { this.closed = true; }
    createMediaStreamSource() { if (fail) throw new Error('graph failure'); return { connect() {} }; }
    createAnalyser() { return { fftSize: 8192, frequencyBinCount: 4096 }; }
  }
  const sandbox = { console, setTimeout, clearTimeout,
    navigator: { mediaDevices: { getUserMedia() { const request = deferred(); requests.push(request); return request.promise; } } },
    window: { AudioContext: Context },
  };
  vm.runInNewContext(fs.readFileSync(new URL('../js/mic-capture.js', import.meta.url), 'utf8') + ';this.mic=MicCapture;', sandbox);
  function grant(index) { const track = { stopped: false, stop() { this.stopped = true; } }; requests[index].resolve({ getTracks: () => [track] }); return track; }
  return { mic: sandbox.mic, grant, contexts, resume };
}
{
  const { mic, grant, contexts } = setup();
  const pending = mic.start(); const rejected = assert.rejects(pending, { name: 'AbortError' });
  mic.stop(); const track = grant(0); await rejected;
  assert.equal(track.stopped, true); assert.equal(contexts.length, 0);
}
{
  const { mic, grant } = setup();
  const older = mic.start(); const rejected = assert.rejects(older, { name: 'AbortError' });
  const newer = mic.start(); const latestTrack = grant(1); const handle = await newer;
  const lateTrack = grant(0); await rejected;
  assert.equal(lateTrack.stopped, true); assert.equal(latestTrack.stopped, false);
  handle.stop(); assert.equal(latestTrack.stopped, true);
}
{
  const { mic, grant, contexts, resume } = setup({ suspended: true });
  const pending = mic.start(); const rejected = assert.rejects(pending, { name: 'AbortError' });
  const track = grant(0); await new Promise(resolve => setImmediate(resolve));
  assert.equal(contexts.length, 1); mic.stop();
  assert.equal(track.stopped, true); assert.equal(contexts[0].closed, true);
  resume.resolve(); await rejected;
}
{
  const { mic, grant, contexts } = setup({ fail: true });
  const pending = mic.start(); const track = grant(0);
  await assert.rejects(pending, /graph failure/);
  assert.equal(track.stopped, true); assert.equal(contexts[0].closed, true);
}
{
  const { mic, grant } = setup();
  const first = mic.start(); grant(0); const oldHandle = await first;
  const second = mic.start(); const track = grant(1); await second;
  oldHandle.stop(); assert.equal(track.stopped, false); mic.stop();
}
console.log('ok - cancelled, overlapping, failed, and suspended microphone startups release only their own resources');
