import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = 'https://example.test/rainbow-pitch/';
const handlers = {};
const entries = new Map([[root + 'index.html', new Response('main app')]]);
const writes = [];
let offline = false;
const cache = {
  async match(request) { return entries.get(typeof request === 'string' ? request : request.url)?.clone(); },
  async put(request, response) {
    const key = typeof request === 'string' ? request : request.url;
    writes.push(key); entries.set(key, response);
  },
};
const context = {
  URL, console,
  self: { location: { href: root + 'sw.js' }, addEventListener: (name, callback) => { handlers[name] = callback; } },
  caches: { async open() { return cache; }, match: cache.match },
  async fetch(request) {
    if (offline) throw new Error('offline');
    return new Response(request.url.includes('acceptance') ? 'acceptance tool' : 'fresh app');
  },
};
vm.runInNewContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), context);
function dispatch(path, mode = 'navigate') {
  let response;
  handlers.fetch({ request: { method: 'GET', url: new URL(path, root).href, mode }, respondWith(value) { response = value; } });
  return response;
}
assert.equal(dispatch('tools/real-piano-acceptance/'), undefined, 'tool navigation must use the browser network path');
assert.equal(await (await cache.match(root + 'index.html')).text(), 'main app');
assert.equal(await (await dispatch('./')).text(), 'fresh app');
assert.deepEqual(writes, [root + 'index.html']);
offline = true;
assert.equal(await (await dispatch('index.html')).text(), 'fresh app');
assert.equal(await (await dispatch('./')).text(), 'fresh app');
assert.equal(dispatch('tools/real-piano-acceptance/'), undefined, 'offline tool navigation must not receive the main shell');
console.log('ok - service worker keeps app and tool documents separate, with an offline app fallback');
