// Minimal DOM and controllable clock for testing the application's actual UI handlers.
export class Element {
  constructor(tag, text = '') { this.tag = tag; this.children = []; this.parentNode = null; this.attrs = {}; this.listeners = {}; this.style = {}; this._text = text; this.className = ''; }
  get firstChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute(key, value) { this.attrs[key] = String(value); if (key === 'id') this.id = value; if (key === 'hidden') this.hidden = true; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  click() { if (!this.disabled) return this.listeners.click?.({ target: this }); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children = []; this._text = value; }
  get innerHTML() { return this.textContent; }
  set innerHTML(value) { this.textContent = value; }
  get classList() {
    return {
      add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' ').trim(); },
      remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
      contains: name => this.className.split(' ').includes(name),
    };
  }
  matches(selector) {
    const tag = selector.match(/^[a-z]+/)?.[0];
    const cls = selector.match(/\.([\w-]+)/)?.[1];
    const attr = selector.match(/\[([^=]+)="([^"]+)"\]/);
    return (!tag || this.tag === tag) && (!cls || this.classList.contains(cls)) && (!attr || this.attrs[attr[1]] === attr[2]);
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
export function fakeDom() {
  const body = new Element('body');
  const app = body.appendChild(new Element('main')); app.id = 'app';
  const confetti = body.appendChild(new Element('div')); confetti.id = 'confetti';
  // documentElement + title exist so js/i18n.js's setLanguage() (which sets
  // document.documentElement.lang and document.title) has somewhere to
  // write, same as a real page's <html> and <title>.
  return { app, document: { body, documentElement: new Element('html'), title: '',
    createElement: tag => new Element(tag), createTextNode: text => new Element('#text', text),
    getElementById(id) { return [body, ...body.querySelectorAll('')].find(node => node.id === id) || null; },
  } };
}
export function fakeClock() {
  const timers = new Map(); let nextId = 0, now = 0;
  return {
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async tick(ms) {
      const until = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].callback();
        await new Promise(resolve => setImmediate(resolve));
      }
      now = until;
    },
  };
}
