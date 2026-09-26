// Chord Garden — tests for js/updates.js: registering the service worker,
// tracking a waiting update, applying it (SKIP_WAITING + a one-time reload),
// and the manual "Check for updates" flow (see Settings → About in
// js/app.js). Same node:vm sandbox style as the other plain-script modules
// (garden.test.mjs, i18n.test.mjs): js/updates.js defines a global rather
// than an ES module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SOURCE = fs.readFileSync(new URL('../js/updates.js', import.meta.url), 'utf8');

// A fake ServiceWorker: postMessage records what was sent, statechange
// listeners fire when the test calls setState(), and its `state` reflects
// whatever the test last set.
function fakeWorker(initialState = 'installing') {
  const listeners = [];
  const worker = {
    state: initialState,
    posted: [],
    postMessage(msg) { worker.posted.push(msg); },
    addEventListener(name, cb) { if (name === 'statechange') listeners.push(cb); },
    setState(state) { worker.state = state; listeners.forEach((cb) => cb()); },
  };
  return worker;
}

// A fake Registration: register() resolves to one of these. update() is
// swappable per test (resolves/rejects/mutates .installing or .waiting).
function fakeRegistration({ waiting = null, installing = null } = {}) {
  const listeners = {};
  return {
    waiting, installing,
    update: async () => {},
    addEventListener(name, cb) { (listeners[name] = listeners[name] || []).push(cb); },
    fireUpdateFound() { (listeners.updatefound || []).forEach((cb) => cb()); },
  };
}

// Loads js/updates.js into a fresh sandbox with a fake navigator.
// serviceWorker (register() resolves to `registration`), a fake window/
// document/location, and a reload counter. Registration only actually runs
// once the sandbox's 'load' handler is invoked (fireLoad()) or immediately
// if `documentComplete` is true — matching js/updates.js's own two paths.
function setup({ registration, documentComplete = false, hasServiceWorker = true } = {}) {
  const windowEvents = {};
  const swListeners = {};
  let reloads = 0;
  const serviceWorker = hasServiceWorker ? {
    controller: null, // no controller = nothing was running before = first install
    register: async () => registration,
    addEventListener(name, cb) { (swListeners[name] = swListeners[name] || []).push(cb); },
    fireControllerChange() { (swListeners.controllerchange || []).forEach((cb) => cb()); },
  } : undefined;
  const sandbox = {
    console, setTimeout, clearTimeout,
    navigator: hasServiceWorker ? { serviceWorker } : {},
    window: { addEventListener: (name, cb) => { windowEvents[name] = cb; } },
    document: { readyState: documentComplete ? 'complete' : 'loading' },
    location: { protocol: 'https:', reload: () => { reloads++; } },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE + '\nthis.Updates = Updates;', sandbox);
  return {
    Updates: sandbox.Updates,
    // documentComplete registers immediately (no 'load' listener to fire);
    // otherwise fire the 'load' handler js/updates.js registered instead —
    // mirrors its own two registration paths (see js/updates.js's init()).
    fireLoad: async () => { if (windowEvents.load) windowEvents.load(); await flush(); },
    fireControllerChange: () => serviceWorker.fireControllerChange(),
    get reloads() { return reloads; },
    get controller() { return serviceWorker && serviceWorker.controller; },
    set controller(v) { serviceWorker.controller = v; },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

// --- no serviceWorker at all: every call stays inert -------------------------

{
  const { Updates, fireLoad } = setup({ hasServiceWorker: false, documentComplete: true });
  let ready = 0;
  assert.doesNotThrow(() => Updates.init({ onReady: () => ready++ }));
  assert.equal(await Updates.check(), 'unsupported');
  assert.equal(Updates.hasUpdate(), false);
  assert.doesNotThrow(() => Updates.apply());
  assert.equal(ready, 0);
  console.log('ok - Updates: no navigator.serviceWorker at all stays inert and never throws');
}

// --- registration finds a waiting worker right away -------------------------

{
  const waiting = fakeWorker('installed');
  const registration = fakeRegistration({ waiting });
  const { Updates, fireLoad } = setup({ registration, documentComplete: true });
  let ready = 0;
  Updates.init({ onReady: () => ready++ });
  await fireLoad();
  assert.equal(Updates.hasUpdate(), true, 'a waiting worker at registration time is a ready update');
  assert.equal(ready, 1, 'onReady fires for it');
  console.log('ok - Updates.init: a waiting worker at registration is surfaced via hasUpdate()/onReady');
}

// --- apply(): posts SKIP_WAITING, and the next controllerchange reloads once ---

{
  const waiting = fakeWorker('installed');
  const registration = fakeRegistration({ waiting });
  const ui = setup({ registration, documentComplete: true });
  ui.Updates.init({});
  await ui.fireLoad();
  ui.Updates.apply();
  assert.equal(JSON.stringify(waiting.posted), JSON.stringify([{ type: 'SKIP_WAITING' }]));
  ui.fireControllerChange();
  assert.equal(ui.reloads, 1);
  ui.fireControllerChange(); // a second controllerchange must not reload again
  assert.equal(ui.reloads, 1, 'reload only happens once');
  console.log('ok - Updates.apply: posts SKIP_WAITING, and the next controllerchange reloads exactly once');
}

// --- a controllerchange with no apply() (first install) never reloads --------

{
  const registration = fakeRegistration({});
  const ui = setup({ registration, documentComplete: true });
  ui.Updates.init({});
  await ui.fireLoad();
  // clients.claim() on the very first install fires controllerchange too —
  // nothing was ever apply()'d, so this must be a no-op.
  ui.fireControllerChange();
  assert.equal(ui.reloads, 0, 'a controllerchange nobody asked for (first install) does not reload');
  console.log('ok - Updates: a controllerchange without apply() (first install) does not reload');
}

// --- check(): 'none' when update() finds nothing ------------------------------

{
  const registration = fakeRegistration({});
  const { Updates, fireLoad } = setup({ registration, documentComplete: true });
  Updates.init({});
  await fireLoad();
  assert.equal(await Updates.check(), 'none');
  console.log("ok - Updates.check: 'none' when update() finds no waiting or installing worker");
}

// --- check(): 'offline' when update() rejects ----------------------------------

{
  const registration = fakeRegistration({});
  registration.update = async () => { throw new Error('offline'); };
  const { Updates, fireLoad } = setup({ registration, documentComplete: true });
  Updates.init({});
  await fireLoad();
  assert.equal(await Updates.check(), 'offline');
  console.log("ok - Updates.check: 'offline' when registration.update() rejects");
}

// --- check(): 'updating' when update() produces a waiting worker directly -----

{
  const registration = fakeRegistration({});
  const waiting = fakeWorker('installed');
  registration.update = async () => { registration.waiting = waiting; };
  const ui = setup({ registration, documentComplete: true });
  ui.Updates.init({});
  await ui.fireLoad();
  assert.equal(await ui.Updates.check(), 'updating');
  assert.equal(JSON.stringify(waiting.posted), JSON.stringify([{ type: 'SKIP_WAITING' }]), 'check() applies the update it finds');
  ui.fireControllerChange();
  assert.equal(ui.reloads, 1);
  console.log("ok - Updates.check: 'updating' when update() leaves a waiting worker, and it applies + reloads");
}

// --- check(): 'updating' via the installing -> installed path ------------------

{
  const registration = fakeRegistration({});
  const installing = fakeWorker('installing');
  registration.update = async () => { registration.installing = installing; };
  const { Updates, fireLoad } = setup({ registration, documentComplete: true });
  Updates.init({});
  await fireLoad();
  const pending = Updates.check();
  await flush();
  installing.setState('installed');
  assert.equal(await pending, 'updating');
  assert.equal(JSON.stringify(installing.posted), JSON.stringify([{ type: 'SKIP_WAITING' }]));
  console.log("ok - Updates.check: 'updating' via the installing -> installed path");
}

// --- a first install (no controller) reaching 'installed' is NOT an update ----

{
  const registration = fakeRegistration({});
  const ui = setup({ registration, documentComplete: true });
  let ready = 0;
  ui.Updates.init({ onReady: () => ready++ });
  await ui.fireLoad();
  // Simulate the browser discovering + installing a worker for the very
  // first time: 'updatefound' fires with an installing worker, and
  // navigator.serviceWorker.controller is still null (nothing was
  // controlling this page before).
  const installing = fakeWorker('installing');
  registration.installing = installing;
  registration.fireUpdateFound();
  installing.setState('installed');
  assert.equal(ui.Updates.hasUpdate(), false, 'a first install is never treated as a waiting update');
  assert.equal(ready, 0, 'onReady never fires for a first install');
  console.log('ok - Updates: a first install (no controller) reaching \'installed\' is not treated as an update');
}

// --- for contrast: an update DOES surface via updatefound once controlled -----

{
  const registration = fakeRegistration({});
  const ui = setup({ registration, documentComplete: true });
  let ready = 0;
  ui.Updates.init({ onReady: () => ready++ });
  await ui.fireLoad();
  // This time the page IS already controlled (a real returning visit) — the
  // same updatefound -> installing -> installed sequence as the block above
  // is now a genuine update.
  ui.controller = {};
  const installing = fakeWorker('installing');
  registration.installing = installing;
  registration.fireUpdateFound();
  installing.setState('installed');
  assert.equal(ui.Updates.hasUpdate(), true, 'the same sequence, but controlled, IS an update');
  assert.equal(ready, 1);
  console.log('ok - Updates: the same updatefound sequence, once the page is controlled, is a real update');
}

console.log('\nAll updates.test.mjs assertions passed.');
