/*
 * Chord Garden — app-update lifecycle.
 *
 * WHY a separate module: sw.js's own update mechanics (a new version
 * installs in the background and waits) are invisible without something on
 * the page side asking a waiting worker to take over and reloading once it
 * does — otherwise, on an installed PWA that never fully closes (common on
 * iPhone/iPad), a family can be stuck on an old version for days while a
 * fresh index.html runs against old cached scripts. This module owns that
 * page-side half: registering sw.js, noticing a waiting update, and
 * switching to it only when app.js says it's safe to (see onChildHome() and
 * the Updates.init/renderHome calls in js/app.js). It never decides WHEN to
 * switch on its own — apply() is always called by app.js.
 */
const Updates = (() => {
  let registration = null;
  let waiting = null;
  // Only a switch WE asked for (apply(), below) should reload the page — the
  // very first install also fires a controllerchange (sw.js's own
  // clients.claim()), and that must be a no-op.
  let reloadOnSwitch = false;
  let reloaded = false; // reload at most once, even if apply() is called twice
  let onReady = () => {};

  function hasUpdate() { return !!waiting; }

  function setWaiting(worker) {
    waiting = worker;
    onReady();
  }

  function apply() {
    if (!waiting) return;
    reloadOnSwitch = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  // Resolves once `worker` reaches 'installed', or after ~20s if it never
  // does — a stalled download shouldn't hang a grown-up's "Check for
  // updates" tap forever.
  function whenInstalled(worker) {
    return new Promise((resolve) => {
      if (worker.state === 'installed') { resolve(true); return; }
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, 20000);
      if (timer.unref) timer.unref(); // never keep a test (or the page) alive just for this
      worker.addEventListener('statechange', () => {
        if (settled || worker.state !== 'installed') return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  // An `installing` worker reaching 'installed' is only an UPDATE when
  // something was already controlling the page — the very first install
  // reaches 'installed' too, but there's no older version to switch away
  // from, so it must never call onReady()/offer to apply().
  function trackInstalling(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
    });
  }

  function init(opts = {}) {
    onReady = typeof opts.onReady === 'function' ? opts.onReady : () => {};
    // Same guard as index.html's old inline registration: no SW support, or
    // opened via file:// where registration is impossible outright — the app
    // should just keep working as before, minus offline support and updates.
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadOnSwitch && !reloaded) {
        reloaded = true;
        location.reload();
      }
    });

    const register = () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        registration = reg;
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => trackInstalling(reg.installing));
      }).catch(() => {}); // e.g. offline on a first visit — nothing to register yet
    };
    // `defer` on every script tag (see index.html) means this normally runs
    // well before `load` fires — but tolerate the document already being
    // complete rather than waiting for a `load` event that's already fired.
    if (typeof document !== 'undefined' && document.readyState === 'complete') register();
    else if (typeof window !== 'undefined') window.addEventListener('load', register);
    else register();
  }

  // A grown-up's "Check for updates" tap in Settings — see js/app.js.
  async function check() {
    if (!registration) return 'unsupported';
    try {
      await registration.update();
    } catch (e) {
      return 'offline';
    }
    if (registration.waiting) {
      setWaiting(registration.waiting);
      apply();
      return 'updating';
    }
    if (registration.installing) {
      const worker = registration.installing;
      const installed = await whenInstalled(worker);
      if (!installed) return 'none';
      setWaiting(worker);
      apply();
      return 'updating';
    }
    return 'none';
  }

  return { init, hasUpdate, apply, check };
})();
