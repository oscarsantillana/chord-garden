import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = 'https://example.test/rainbow-pitch/';
const handlers = {};
const entries = new Map([[root + 'index.html', new Response('main app')]]);
const writes = [];
let precached = [];
let offline = false;
let skipWaitingCalls = 0;
const cache = {
  async addAll(requests) { precached = requests; },
  async add() {},
  async match(request) { return entries.get(typeof request === 'string' ? request : request.url)?.clone(); },
  async put(request, response) {
    const key = typeof request === 'string' ? request : request.url;
    writes.push(key); entries.set(key, response);
  },
};
const context = {
  URL, Request, console,
  self: {
    location: { href: root + 'sw.js' },
    addEventListener: (name, callback) => { handlers[name] = callback; },
    skipWaiting() { skipWaitingCalls++; },
  },
  caches: { async open() { return cache; }, match: cache.match },
  async fetch(request) {
    if (offline) throw new Error('offline');
    return new Response(request.url.includes('acceptance') ? 'acceptance tool' : 'fresh app');
  },
};
vm.runInNewContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), context);
let installed;
handlers.install({ waitUntil(promise) { installed = promise; } });
await installed;
writes.length = 0; // install also fills the audio cache; this test is about documents
assert.ok(precached.length > 0);
assert.ok(precached.every(request => request.cache === 'reload'), 'new releases must refresh HTTP-cached shell files');
function dispatch(path, mode = 'navigate') {
  let response;
  handlers.fetch({ request: { method: 'GET', url: new URL(path, root).href, mode }, respondWith(value) { response = value; } });
  return response;
}
assert.equal(dispatch('tools/real-piano-acceptance/'), undefined, 'tool navigation must use the browser network path');
// index.html names its scripts by unversioned paths, so it must come from the
// same release as the cached js/ and css/: a newer one on the network must not
// be served (or written into this release's cache) while this worker runs.
assert.equal(await (await dispatch('./')).text(), 'main app', 'the cached document wins over a newer one online');
assert.equal(await (await dispatch('index.html')).text(), 'main app');
assert.deepEqual(writes, [], 'a newer document never lands in this release\'s cache');
offline = true;
assert.equal(await (await dispatch('index.html')).text(), 'main app');
assert.equal(await (await dispatch('./')).text(), 'main app');
assert.equal(dispatch('tools/real-piano-acceptance/'), undefined, 'offline tool navigation must not receive the main shell');
// With nothing cached yet (a failed precache), the network fills the gap.
offline = false;
entries.delete(root + 'index.html');
assert.equal(await (await dispatch('./')).text(), 'fresh app');
assert.deepEqual(writes, [root + 'index.html'], 'and is stashed for offline use');
offline = true;
assert.equal(await (await dispatch('./')).text(), 'fresh app');
console.log('ok - service worker serves the app document cache-first, kept apart from tool documents');

// The page (js/updates.js) asks a waiting version to take over by posting
// this message; every other message must be ignored.
handlers.message({ data: { type: 'SKIP_WAITING' } });
assert.equal(skipWaitingCalls, 1, 'a SKIP_WAITING message calls self.skipWaiting()');
handlers.message({ data: { type: 'something-else' } });
handlers.message({ data: null });
handlers.message({});
assert.equal(skipWaitingCalls, 1, 'any other message is ignored');
console.log('ok - service worker calls skipWaiting only for a SKIP_WAITING message');
