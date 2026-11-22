import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const Diagnostics = createRequire(import.meta.url)('../js/diagnostics.js');

test('ring buffer caps entries at MAX_EVENTS, dropping oldest first', () => {
  Diagnostics.clear();
  for (let i = 0; i < Diagnostics.MAX_EVENTS + 15; i += 1) {
    Diagnostics.record('evt', { i });
  }
  const list = Diagnostics.events();
  assert.equal(list.length, Diagnostics.MAX_EVENTS);
  assert.equal(list[0].data.i, 15);
  assert.equal(list[list.length - 1].data.i, Diagnostics.MAX_EVENTS + 14);
});

test('errorMessage formats Errors, strings and empty values safely', () => {
  assert.equal(Diagnostics.errorMessage(new TypeError('bad state')), 'TypeError: bad state');
  assert.equal(Diagnostics.errorMessage('plain message'), 'plain message');
  assert.equal(Diagnostics.errorMessage(null), 'unknown');
  const long = 'x'.repeat(300);
  assert.equal(Diagnostics.errorMessage(long).length, 200);
});

test('formatReport outputs valid JSON with metadata and relative timestamps', () => {
  Diagnostics.clear();
  Diagnostics.record('practice.start', { mode: 'digital', colors: 2 });
  Diagnostics.record('flag.ignored', { reason: 'locked' });
  const text = Diagnostics.formatReport({
    version: '0.9.2',
    env: { ua: 'test-ua', standalone: true },
    audio: { contextState: 'running', suspect: false },
    session: null,
  });
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, 'Chord Garden');
  assert.equal(parsed.version, '0.9.2');
  assert.equal(parsed.env.standalone, true);
  assert.equal(parsed.audio.contextState, 'running');
  assert.equal(parsed.eventCount, 2);
  assert.equal(parsed.events[0].type, 'practice.start');
  assert.equal(parsed.events[1].type, 'flag.ignored');
  assert.equal(typeof parsed.events[0].dtMs, 'number');
  assert.equal(typeof parsed.events[0].at, 'string');
});
