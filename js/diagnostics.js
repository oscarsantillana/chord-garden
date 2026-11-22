/*
 * Chord Garden — lightweight in-memory diagnostics.
 *
 * Keeps a small fixed-size ring buffer of discrete app and audio events
 * (round transitions, flag taps/ignores, AudioContext recovery, JS errors) so
 * a grown-up can copy a plain diagnostic report from Settings → About if a
 * rare iPad glitch happens.
 *
 * Always on in memory, zero background timers, no network calls, and never
 * stores child names, PINs or audio recordings.
 */

const Diagnostics = (() => {
  const MAX_EVENTS = 120;
  let buffer = [];

  function errorMessage(err) {
    try {
      if (!err) return 'unknown';
      if (typeof err === 'string') return err.slice(0, 200);
      const name = err.name ? String(err.name) : '';
      const msg = err.message ? String(err.message) : String(err);
      const text = name && !msg.startsWith(name) ? `${name}: ${msg}` : msg;
      return text.slice(0, 200);
    } catch (e) {
      return 'unreadable-error';
    }
  }

  function record(type, data) {
    try {
      const entry = { t: Date.now(), type: String(type) };
      if (data !== undefined && data !== null) entry.data = data;
      buffer.push(entry);
      if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
    } catch (e) {
      // Diagnostics must never interfere with play.
    }
  }

  function events() {
    return buffer.slice();
  }

  function clear() {
    buffer = [];
  }

  function formatReport(meta = {}) {
    const now = Date.now();
    const entries = buffer.map((item) => {
      const out = {
        dtMs: item.t - now,
        at: new Date(item.t).toISOString(),
        type: item.type,
      };
      if (item.data !== undefined) out.data = item.data;
      return out;
    });
    const report = {
      app: 'Chord Garden',
      version: meta.version || null,
      capturedAt: new Date(now).toISOString(),
      env: meta.env || null,
      audio: meta.audio || null,
      session: meta.session || null,
      eventCount: entries.length,
      events: entries,
    };
    return JSON.stringify(report, null, 2);
  }

  return { MAX_EVENTS, record, events, clear, errorMessage, formatReport };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Diagnostics;
