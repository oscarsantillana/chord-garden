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

// The 22 files a 0.5.x device fetched from the Tone.js host.
const OLD_BASE = 'https://tonejs.github.io/audio/salamander/';
const oldSampleUrls = () => [
  'A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3',
  'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6',
].map(n => OLD_BASE + n + '.mp3');

// The file name for a note, as written in data.js: 'Bb3' -> 'As3.mp3'.
const FLAT = { Db: 'Cs', Eb: 'Ds', Gb: 'Fs', Ab: 'Gs', Bb: 'As' };
const fileFor = (note) => {
  const [, letter, acc, octave] = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
  const name = acc === 'b' ? FLAT[letter + 'b'] : letter + (acc === '#' ? 's' : '');
  return name + octave + '.mp3';
};

const LAYERS = ['main', 'soft', 'firm'];

// Load audio.js in a vm and make it build its sampler; returns the options
// it passed to Tone.Sampler. With `variety`, it also turns natural variety on
// and returns the options of every sampler it built, keyed by layer folder.
async function samplerOptions(extra, { variety = false } = {}) {
  const built = [];
  class StubSampler {
    constructor(o) { built.push(o); this.volume = {}; setImmediate(o.onload); }
    toDestination() { return this; }
  }
  const sandbox = {
    console, setTimeout, clearTimeout, Date, URL,
    Tone: { Sampler: StubSampler, async start() {} },
    ...extra,
  };
  vm.createContext(sandbox);
  vm.runInContext(audioSource + '\nthis.PianoAudio = PianoAudio;', sandbox);
  sandbox.PianoAudio.unlock().catch(() => {});
  await new Promise(r => setImmediate(r));
  assert.ok(built.length, 'audio.js built a sampler');
  if (!variety) {
    assert.equal(built.length, 1, 'variety off builds only the main sampler');
    return built[0];
  }
  sandbox.PianoAudio.setVariety(true);
  await new Promise(r => setImmediate(r));
  const byLayer = {};
  for (const o of built) byLayer[/([^/]+)\/$/.exec(o.baseUrl)[1]] = o;
  return byLayer;
}

test('the notes in data.js, sw.js, every assets/piano/v1 layer and js/audio.js all agree', async () => {
  const dataSandbox = {};
  vm.createContext(dataSandbox);
  vm.runInContext(fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8') + '\nthis.CHORDS = CHORDS;', dataSandbox);
  const fromData = [...new Set(dataSandbox.CHORDS.flatMap(c => c.notes.map(fileFor)))].sort();
  assert.equal(fromData.length, 18);

  const swUrls = loadWorker(makeDevice()).sampleUrls();
  assert.equal(swUrls.length, 54, 'three layers of 18 notes');
  const urlsByLayer = {};
  const options = await samplerOptions({
    document: { currentScript: { src: root + 'js/audio.js' } },
    CHORDS: dataSandbox.CHORDS,
  }, { variety: true });
  assert.deepEqual(Object.keys(options).sort(), [...LAYERS].sort());

  for (const layer of LAYERS) {
    const layerBase = root + 'assets/piano/v1/' + layer + '/';
    const fromSw = swUrls.filter(u => u.startsWith(layerBase)).map(u => u.slice(layerBase.length)).sort();
    assert.deepEqual(fromSw, fromData, layer + ': sw.js lists the data.js notes');

    const onDisk = fs.readdirSync(new URL('../assets/piano/v1/' + layer + '/', import.meta.url)).filter(f => f.endsWith('.mp3')).sort();
    assert.deepEqual(onDisk, fromData, layer + ': files on disk');

    // audio.js as a classic script at <root>/js/audio.js, with data.js's globals.
    assert.equal(options[layer].baseUrl, layerBase, layer + ': audio.js resolves against its own location');
    const urls = { ...options[layer].urls };
    assert.deepEqual(Object.values(urls).sort(), fromData, layer + ': audio.js loads the same files');
    assert.equal(urls['A#3'], 'As3.mp3');
    assert.ok(!Object.keys(urls).some(k => k.includes('b')), 'keys use Tone sharp spelling');
  }
  assert.equal(swUrls.filter(u => LAYERS.every(l => !u.startsWith(root + 'assets/piano/v1/' + l + '/'))).length, 0, 'no stray files');
});

test('audio.js without data.js or a script tag (test sandboxes) still builds a sampler', async () => {
  const options = await samplerOptions({});
  assert.deepEqual({ ...options.urls }, {});
  assert.equal(options.baseUrl, 'assets/piano/v1/main/');
});

test('the acceptance tool, at tools/real-piano-acceptance/, finds the same files via ../../js/audio.js', async () => {
  const src = 'https://example.test/tools/real-piano-acceptance/../../js/audio.js';
  const options = await samplerOptions({ document: { currentScript: { src: new URL(src).href } } });
  assert.equal(options.baseUrl, 'https://example.test/assets/piano/v1/main/');
});

test('piano files are same-origin and cached-first; the old Tone.js host is no longer intercepted', async () => {
  const device = makeDevice();
  const w = loadWorker(device);
  for (const url of w.sampleUrls()) assert.ok(url.startsWith(root) && url.endsWith('.mp3'), url);
  await w.install();
  device.offline = true;
  const hit = await w.fetch(w.sampleUrls()[0]);
  assert.equal(await hit.text(), 'body of ' + w.sampleUrls()[0]);
  const old = OLD_BASE + 'A4.mp3';
  device.offline = false;
  await w.fetch(old);
  await new Promise(r => setImmediate(r));
  assert.ok(!cacheHas(device, AUDIO, old) && !cacheHas(device, versioned(), old), 'not cached by the worker');
});

test('an existing 0.5.1 device holding the 22 tonejs files updates: they are pruned, the new files cached, offline Play works', async () => {
  const device = makeDevice();
  const w = loadWorker(device);
  const oldUrls = oldSampleUrls();
  assert.equal(oldUrls.length, 22);
  const audio = new Map(oldUrls.map(u => [u, new Response('old ' + u)]));
  audio.set(TONE, new Response('tone'));
  device.stores.set(AUDIO, audio);
  device.stores.set('rainbow-pitch-v0.5.1', new Map([[root + 'index.html', new Response('old shell')]]));
  await w.install();
  await w.activate();
  device.offline = true;
  assert.ok(!device.stores.has('rainbow-pitch-v0.5.1'));
  for (const u of oldUrls) assert.ok(!cacheHas(device, AUDIO, u), 'pruned ' + u);
  for (const url of audioUrls(w)) {
    const res = await w.fetch(url);
    assert.ok(res, url);
    assert.equal(await res.text(), url === TONE ? 'tone' : 'body of ' + url);
  }
  assert.equal(await device.stores.get(AUDIO).get(TONE).text(), 'tone', 'Tone.js kept');
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
  const stale = root + 'assets/piano/v0/main/Old.mp3';
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
