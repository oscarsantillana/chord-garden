import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = 'https://example.test/app/';
const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const audioSource = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
const AUDIO = 'rainbow-pitch-audio-v1';
const TONE = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js';

const keyOf = (r) => (typeof r === 'string' ? r : r.url);

// A device: named caches that persist across service worker versions, plus a
// fake network that can be switched offline or told to fail specific URLs.
function makeDevice() {
  const stores = new Map();
  const device = { stores, offline: false, failUrls: new Set(), fetched: [] };
  const makeCache = (map) => ({
    async match(r) { return map.get(keyOf(r))?.clone(); },
    async put(r, res) { map.set(keyOf(r), res); },
    async add(r) { const res = await device.fetch(r); if (!res.ok) throw new Error('bad'); map.set(keyOf(r), res); },
    async addAll(rs) { for (const r of rs) await this.add(r); },
    async keys() { return [...map.keys()].map(url => ({ url })); },
    async delete(r) { return map.delete(keyOf(r)); },
  });
  device.caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return makeCache(stores.get(name));
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(r) {
      for (const map of stores.values()) {
        const hit = map.get(keyOf(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  device.fetch = async (r) => {
    const url = keyOf(r);
    device.fetched.push(url);
    if (device.offline || device.failUrls.has(url)) throw new Error('network down');
    return new Response('body of ' + url);
  };
  return device;
}

function loadWorker(device) {
  const handlers = {};
  const context = {
    URL, Request, Response, console,
    caches: device.caches,
    fetch: device.fetch,
    self: {
      location: { href: root + 'sw.js' },
      addEventListener: (name, cb) => { handlers[name] = cb; },
      skipWaiting() {},
      clients: { async claim() {} },
    },
  };
  vm.createContext(context);
  vm.runInContext(swSource, context);
  const run = async (name) => {
    let p;
    handlers[name]({ waitUntil(x) { p = x; } });
    await p;
  };
  return {
    install: () => run('install'),
    activate: () => run('activate'),
    fetch(url) {
      let res;
      handlers.fetch({ request: { method: 'GET', url, mode: 'cors' }, respondWith(v) { res = v; } });
      return res;
    },
    sampleUrls: () => [...vm.runInContext('SAMPLE_URLS', context)],
  };
}

const audioUrls = (w) => [TONE, ...w.sampleUrls()];
const cacheHas = (device, name, url) => device.stores.get(name)?.has(url) ?? false;
const versioned = () => /CACHE_NAME = '([^']+)'/.exec(swSource)[1];

test('sw.js sample list matches SAMPLE_BASE and SAMPLES in js/audio.js', () => {
  const base = audioSource.match(/SAMPLE_BASE\s*=\s*'([^']+)'/)[1];
  const block = audioSource.match(/SAMPLES\s*=\s*\{([\s\S]*?)\}/)[1];
  const fromAudio = [...block.matchAll(/:\s*'([^']+)'/g)].map(m => base + m[1]);
  assert.ok(fromAudio.length > 20);
  assert.deepEqual(loadWorker(makeDevice()).sampleUrls().sort(), fromAudio.sort());
});

test('first install fetches Tone.js and every sample into the audio cache', async () => {
  const device = makeDevice();
  const w = loadWorker(device);
  await w.install();
  for (const url of audioUrls(w)) assert.ok(cacheHas(device, AUDIO, url), url);
  assert.ok(!cacheHas(device, versioned(), TONE), 'Tone.js no longer goes in the versioned cache');
});

test('an update install copies samples from the previous cache with no network', async () => {
  const device = makeDevice();
  const w = loadWorker(device);
  const old = new Map(w.sampleUrls().map(u => [u, new Response('old ' + u)]));
  old.set(TONE, new Response('old tone'));
  device.stores.set('rainbow-pitch-v0.5.0', old);
  await w.install();
  const wanted = new Set(audioUrls(w));
  assert.deepEqual(device.fetched.filter(u => wanted.has(u)), []);
  for (const url of audioUrls(w)) assert.ok(cacheHas(device, AUDIO, url), url);
  assert.equal(await device.stores.get(AUDIO).get(TONE).text(), 'old tone');
});

test('a failing sample fetch does not fail the install or stop the others', async () => {
  const device = makeDevice();
  const w = loadWorker(device);
  const bad = w.sampleUrls()[3];
  device.failUrls.add(bad);
  device.failUrls.add(TONE);
  await w.install();
  assert.ok(!cacheHas(device, AUDIO, bad));
  assert.ok(!cacheHas(device, AUDIO, TONE));
  for (const url of w.sampleUrls().filter(u => u !== bad)) assert.ok(cacheHas(device, AUDIO, url), url);
  assert.ok(cacheHas(device, versioned(), root + 'index.html'), 'shell still cached');
});

test('activate deletes old versioned caches, keeps the audio cache, prunes stale entries', async () => {
  const device = makeDevice();
  const w = loadWorker(device);
  await w.install();
  const stale = 'https://tonejs.github.io/audio/salamander/Old.mp3';
  device.stores.set('rainbow-pitch-v0.5.0', new Map([['x', new Response('x')]]));
  device.stores.set('unrelated-cache', new Map());
  device.stores.get(AUDIO).set(stale, new Response('stale'));
  await w.activate();
  assert.ok(!device.stores.has('rainbow-pitch-v0.5.0'));
  assert.ok(device.stores.has('unrelated-cache'), 'caches without our prefix are left alone');
  assert.ok(!cacheHas(device, AUDIO, stale));
  for (const url of audioUrls(w)) assert.ok(cacheHas(device, AUDIO, url), url);
});

test('regression: updating from 0.5.0 then going offline still serves the piano', async () => {
  const device = makeDevice();
  const w = loadWorker(device);
  // A 0.5.0 device: shell plus runtime-fetched samples, all in one versioned cache.
  const old = new Map(w.sampleUrls().map(u => [u, new Response('sample ' + u)]));
  old.set(TONE, new Response('tone'));
  old.set(root + 'index.html', new Response('old shell'));
  device.stores.set('rainbow-pitch-v0.5.0', old);
  await w.install();
  device.offline = true;
  await w.activate();
  assert.ok(!device.stores.has('rainbow-pitch-v0.5.0'));
  for (const url of audioUrls(w)) {
    const res = await w.fetch(url);
    assert.ok(res, url);
    assert.equal(await res.text(), url === TONE ? 'tone' : 'sample ' + url);
  }
});

test('a runtime fetch of a sample is stored in the audio cache', async () => {
  const device = makeDevice();
  const w = loadWorker(device);
  const url = w.sampleUrls()[0];
  const res = await w.fetch(url);
  assert.equal(await res.text(), 'body of ' + url);
  await new Promise(r => setImmediate(r));
  assert.ok(cacheHas(device, AUDIO, url));
  assert.ok(!cacheHas(device, versioned(), url));
});
