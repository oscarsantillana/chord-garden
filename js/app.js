/*
 * Rainbow Pitch — application logic.
 *
 * Two audiences, one app:
 *   • Child flow  — a playful "practice toy". Big colour buttons, warm piano,
 *     gentle feedback, a calm way to stop, and a happy finish. No scores, no
 *     chord names, no reading required.
 *   • Guardian flow — PIN-gated setup and progress. Choose which colours are
 *     active, add the next colour when the child is ready, see accuracy, manage
 *     child profiles. This is where all the "measurement" language lives.
 */

(() => {
  const GUARDIAN_PIN = '2468'; // demo gate only — not real security
  const AVATARS = ['🦊', '🐱', '🐻', '🐼', '🐸', '🦉', '🐧', '🦄', '🐢', '🐳', '🐝', '🦋'];

  const app = document.getElementById('app');

  // ---- tiny DOM helper ---------------------------------------------------
  function el(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return node;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

  function activeColorObjects() {
    const p = Store.activeProfile();
    return p.activeColors.map((name) => CHORD_BY_NAME[name]).filter(Boolean);
  }

  // =======================================================================
  //  HOME  (Child Start)
  // =======================================================================
  function renderHome() {
    clear(app);
    const p = Store.activeProfile();
    const colors = activeColorObjects();

    const swatches = el('div', { class: 'today-colors' },
      colors.map((c) => el('div', {
        class: 'today-swatch',
        style: `background:${c.swatch};color:${c.text}`,
        title: c.label,
      }, el('span', { class: 'today-dot' }))));

    const startBtn = el('button', {
      class: 'big-start',
      onclick: async () => {
        startBtn.disabled = true;
        startBtn.textContent = 'Waking the piano…';
        await PianoAudio.unlock();
        startPractice();
      },
    }, '▶  Start');

    const profileStrip = el('div', { class: 'profile-strip' },
      el('button', { class: 'avatar-chip', title: 'Who is playing?', onclick: switchProfilePrompt },
        el('span', { class: 'avatar-emoji' }, p.avatar),
        el('span', { class: 'avatar-name' }, p.name)),
      el('button', { class: 'gear', title: 'Grown-ups', 'aria-label': 'Grown-up area', onclick: () => renderGuardianGate() }, '⚙'));

    app.appendChild(el('section', { class: 'screen home' },
      profileStrip,
      el('div', { class: 'brand' },
        el('div', { class: 'brand-mark' }, '🌈'),
        el('h1', { class: 'brand-title' }, 'Rainbow Pitch'),
        el('p', { class: 'brand-sub' }, 'Listen and tap the colour!')),
      el('div', { class: 'today-panel' },
        el('p', { class: 'today-label' }, "Today's colours"),
        swatches),
      startBtn));
  }

  function switchProfilePrompt() {
    const data = Store.all();
    if (data.profiles.length <= 1) {
      // Nothing to switch to; nudge toward guardian area to add a child.
      renderGuardianGate();
      return;
    }
    // Adult confirmation before switching to protect sibling progress.
    const ok = window.confirm('Grown-up: switch to a different child?');
    if (!ok) return;
    const idx = data.profiles.findIndex((x) => x.id === data.activeProfileId);
    const next = data.profiles[(idx + 1) % data.profiles.length];
    Store.setActiveProfile(next.id);
    renderHome();
  }

  // =======================================================================
  //  PRACTICE  (Practice Set)
  // =======================================================================
  let session = null;

  function startPractice() {
    const p = Store.activeProfile();
    const colors = activeColorObjects();
    session = {
      colors,
      total: p.roundsPerSet,
      index: 0,
      correct: 0,
      current: null,
      attempted: false, // whether this round already counted toward stats
      locked: false,
    };
    renderPractice();
    nextRound();
  }

  function pickTarget() {
    const choices = session.colors;
    let pick;
    do {
      pick = choices[Math.floor(Math.random() * choices.length)];
    } while (choices.length > 1 && session.current && pick.name === session.current.name);
    return pick;
  }

  function nextRound() {
    if (!session) return; // a calm stop may have ended the set already
    if (session.index >= session.total) return finishPractice(false);
    session.current = pickTarget();
    session.attempted = false;
    session.locked = false;
    renderPractice();
    // Small pause, then play so the child settles before listening.
    const notes = session.current.notes;
    setTimeout(() => { if (session) PianoAudio.playChord(notes); }, 450);
  }

  function renderPractice() {
    clear(app);
    const progress = el('div', { class: 'round-progress' },
      Array.from({ length: session.total }, (_, i) =>
        el('span', { class: 'pip' + (i < session.index ? ' done' : i === session.index ? ' now' : '') })));

    const listenBtn = el('button', {
      class: 'listen-btn',
      onclick: () => PianoAudio.playChord(session.current.notes),
    }, el('span', { class: 'listen-icon' }, '🔊'), el('span', {}, 'Listen again'));

    const answers = el('div', { class: 'answers answers-' + session.colors.length },
      session.colors.map((c) => el('button', {
        class: 'color-btn',
        'data-color': c.name,
        style: `background:${c.swatch};color:${c.text}`,
        onclick: () => onAnswer(c),
      }, el('span', { class: 'color-face' }))));

    const stopBtn = el('button', { class: 'calm-stop', onclick: calmStop }, 'All done');

    app.appendChild(el('section', { class: 'screen practice' },
      el('div', { class: 'practice-top' }, progress, stopBtn),
      el('div', { class: 'listen-wrap' }, listenBtn),
      el('div', { class: 'mascot', id: 'mascot' }, Store.activeProfile().avatar),
      answers));
  }

  function onAnswer(color) {
    if (session.locked) return;
    const correct = color.name === session.current.name;

    // Only the FIRST attempt of a round counts toward guardian stats.
    if (!session.attempted) {
      session.attempted = true;
      Store.recordRound(session.current.name, correct);
      if (correct) session.correct += 1;
    }

    const btn = app.querySelector(`.color-btn[data-color="${color.name}"]`);
    if (correct) {
      session.locked = true;
      btn.classList.add('correct');
      cheer();
      PianoAudio.playHappy();
      session.index += 1;
      setTimeout(nextRound, 1100);
    } else {
      // Gentle feedback: a soft wobble and replay the sound. No "wrong" text.
      btn.classList.add('nudge');
      setTimeout(() => btn.classList.remove('nudge'), 500);
      const notes = session.current.notes;
      setTimeout(() => { if (session) PianoAudio.playChord(notes); }, 260);
    }
  }

  function cheer() {
    const mascot = document.getElementById('mascot');
    if (mascot) { mascot.classList.add('happy'); setTimeout(() => mascot.classList.remove('happy'), 900); }
    burstConfetti(10);
  }

  function calmStop() {
    // A calm stop is never failure. Save what happened and celebrate gently.
    finishPractice(true);
  }

  function finishPractice(early) {
    if (!session) return;
    Store.recordSession({
      ts: Date.now(),
      rounds: session.index,
      target: session.total,
      correct: session.correct,
      colors: session.colors.map((c) => c.name),
      early,
    });
    renderCelebration(early);
    session = null;
  }

  // =======================================================================
  //  CELEBRATION  (Child Celebration)
  // =======================================================================
  function renderCelebration(early) {
    clear(app);
    burstConfetti(60);
    PianoAudio.playHappy();
    const p = Store.activeProfile();
    app.appendChild(el('section', { class: 'screen celebrate' },
      el('div', { class: 'cele-mascot' }, p.avatar),
      el('h1', { class: 'cele-title' }, early ? 'Nice listening!' : 'You did it! 🎉'),
      el('div', { class: 'stickers' }, ['⭐', '🌟', '🎵', '🏅', '🎈'].map((s) => el('span', { class: 'sticker' }, s))),
      el('div', { class: 'cele-actions' },
        el('button', { class: 'big-start', onclick: () => { PianoAudio.unlock().then(startPractice); } }, '▶  Play again'),
        el('button', { class: 'ghost-btn', onclick: renderHome }, 'Home'))));
  }

  // =======================================================================
  //  GUARDIAN  (PIN gate + panels)
  // =======================================================================
  function renderGuardianGate() {
    clear(app);
    let entered = '';
    const dots = el('div', { class: 'pin-dots' });
    const msg = el('p', { class: 'pin-msg' }, 'Grown-ups only');

    function refresh() {
      clear(dots);
      for (let i = 0; i < 4; i++) dots.appendChild(el('span', { class: 'pin-dot' + (i < entered.length ? ' filled' : '') }));
    }
    function press(d) {
      if (entered.length >= 4) return;
      entered += d; refresh();
      if (entered.length === 4) {
        if (entered === GUARDIAN_PIN) renderGuardian('colors');
        else { msg.textContent = 'Try again'; entered = ''; setTimeout(refresh, 250); }
      }
    }
    const pad = el('div', { class: 'pin-pad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
        k === '' ? el('span', {}) :
          el('button', { class: 'pin-key', onclick: () => k === '⌫' ? (entered = entered.slice(0, -1), refresh()) : press(k) }, k)));

    refresh();
    app.appendChild(el('section', { class: 'screen gate' },
      el('button', { class: 'back-link', onclick: renderHome }, '‹ Back to play'),
      el('div', { class: 'gate-card' },
        el('div', { class: 'gate-lock' }, '🔒'),
        msg,
        el('p', { class: 'pin-hint' }, 'Demo PIN: 2468'),
        dots, pad)));
  }

  function renderGuardian(tab) {
    clear(app);
    const tabs = el('nav', { class: 'g-tabs' },
      [['colors', 'Colours'], ['progress', 'Progress'], ['profiles', 'Children'], ['settings', 'Settings']].map(([id, lbl]) =>
        el('button', { class: 'g-tab' + (tab === id ? ' active' : ''), onclick: () => renderGuardian(id) }, lbl)));

    const body = el('div', { class: 'g-body' });
    if (tab === 'colors') guardianColors(body);
    else if (tab === 'progress') guardianProgress(body);
    else if (tab === 'profiles') guardianProfiles(body);
    else guardianSettings(body);

    app.appendChild(el('section', { class: 'screen guardian' },
      el('header', { class: 'g-head' },
        el('button', { class: 'back-link', onclick: renderHome }, '‹ Done'),
        el('h2', {}, 'Grown-up area'),
        el('span', { class: 'g-child' }, Store.activeProfile().avatar + ' ' + Store.activeProfile().name)),
      tabs, body));
  }

  // --- Guardian: Colours (active set + readiness + add next) --------------
  function readiness(p) {
    // Ready to add the next colour when every active colour is well known:
    // at least 8 first-attempts seen and >=90% correct.
    const active = p.activeColors;
    for (const name of active) {
      const s = p.stats[name];
      if (!s || s.seen < 8) return false;
      if (s.correct / s.seen < 0.9) return false;
    }
    return true;
  }

  function nextColorToAdd(p) {
    const have = new Set(p.activeColors);
    return CHORDS.find((c) => !have.has(c.name));
  }

  function guardianColors(body) {
    const p = Store.activeProfile();
    body.appendChild(el('p', { class: 'g-lead' },
      'These are the colours ', el('strong', {}, p.name), ' practises now. Introduce new colours one at a time — the classic method adds the next colour only after the current ones are known with near-perfect accuracy (about every two weeks).'));

    const ready = readiness(p);
    const next = nextColorToAdd(p);
    if (next) {
      body.appendChild(el('div', { class: 'readiness ' + (ready ? 'ready' : 'notyet') },
        el('span', { class: 'r-icon' }, ready ? '✅' : '⏳'),
        el('div', {},
          el('div', { class: 'r-title' }, ready ? 'Ready for a new colour!' : 'Keep practising the current colours'),
          el('div', { class: 'r-sub' }, ready
            ? `${p.name} is recognising the current colours reliably. You can add the next colour.`
            : 'Add the next colour once every current colour is near 100%.')),
        el('button', {
          class: 'add-color-btn',
          disabled: !ready,
          style: `background:${next.swatch};color:${next.text}`,
          onclick: () => { p.activeColors.push(next.name); Store.save(); renderGuardian('colors'); },
        }, 'Add ' + next.label)));
    } else {
      body.appendChild(el('div', { class: 'readiness ready' }, el('span', { class: 'r-icon' }, '🏆'),
        el('div', {}, el('div', { class: 'r-title' }, 'All colours added!'), el('div', { class: 'r-sub' }, 'Amazing progress.'))));
    }

    // Full palette with toggle (guardian may hand-pick the active set).
    const grid = el('div', { class: 'palette-grid' });
    CHORDS.forEach((c) => {
      const on = p.activeColors.includes(c.name);
      const s = p.stats[c.name];
      const acc = s && s.seen ? Math.round((s.correct / s.seen) * 100) : null;
      grid.appendChild(el('button', {
        class: 'palette-item' + (on ? ' on' : ''),
        onclick: () => toggleColor(c.name),
      },
        el('span', { class: 'pi-swatch', style: `background:${c.swatch}` }),
        el('span', { class: 'pi-label' }, c.label),
        el('span', { class: 'pi-meta' }, on ? (acc == null ? 'active' : acc + '%') : 'off'),
        el('span', { class: 'pi-chord', title: 'Chord (grown-up only)' }, c.chord)));
    });
    body.appendChild(el('h3', { class: 'g-sub' }, 'All colours'));
    body.appendChild(grid);
    body.appendChild(el('p', { class: 'g-note' }, 'Tip: keep at least two colours active so there is a real choice to make.'));
  }

  function toggleColor(name) {
    const p = Store.activeProfile();
    const on = p.activeColors.includes(name);
    if (on) {
      if (p.activeColors.length <= 2) { window.alert('Keep at least two colours so practice stays a real listening choice.'); return; }
      p.activeColors = p.activeColors.filter((n) => n !== name);
    } else {
      p.activeColors.push(name);
    }
    Store.save();
    renderGuardian('colors');
  }

  // --- Guardian: Progress -------------------------------------------------
  function guardianProgress(body) {
    const p = Store.activeProfile();
    const active = p.activeColors;

    body.appendChild(el('h3', { class: 'g-sub' }, 'Accuracy by colour'));
    if (!active.some((n) => p.stats[n])) {
      body.appendChild(el('p', { class: 'g-note' }, 'No practice recorded yet. Tap “Done”, then let your child play a set.'));
    }
    const bars = el('div', { class: 'bars' });
    active.forEach((name) => {
      const c = CHORD_BY_NAME[name];
      const s = p.stats[name] || { correct: 0, seen: 0 };
      const pct = s.seen ? Math.round((s.correct / s.seen) * 100) : 0;
      bars.appendChild(el('div', { class: 'bar-row' },
        el('span', { class: 'bar-swatch', style: `background:${c.swatch}` }),
        el('span', { class: 'bar-name' }, c.label),
        el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${pct}%;background:${c.swatch}` })),
        el('span', { class: 'bar-num' }, s.seen ? pct + '%' : '—')));
    });
    body.appendChild(bars);

    body.appendChild(el('h3', { class: 'g-sub' }, 'Recent sessions'));
    if (!p.sessions.length) {
      body.appendChild(el('p', { class: 'g-note' }, 'Sessions will appear here.'));
    } else {
      const list = el('ul', { class: 'sessions' });
      p.sessions.slice(0, 10).forEach((se) => {
        const d = new Date(se.ts);
        const when = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const pct = se.rounds ? Math.round((se.correct / se.rounds) * 100) : 0;
        list.appendChild(el('li', {},
          el('span', { class: 's-when' }, when),
          el('span', { class: 's-detail' }, `${se.correct}/${se.rounds} correct${se.early ? ' · calm stop' : ''} · ${pct}%`)));
      });
      body.appendChild(list);
    }

    body.appendChild(el('div', { class: 'g-actions' },
      el('button', { class: 'ghost-btn', onclick: () => exportData(p) }, '⬇ Export progress (JSON)')));
  }

  function exportData(p) {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `rainbow-pitch-${p.name}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // --- Guardian: Children (profiles) --------------------------------------
  function guardianProfiles(body) {
    const data = Store.all();
    body.appendChild(el('h3', { class: 'g-sub' }, 'Children on this device'));
    const list = el('div', { class: 'profiles-list' });
    data.profiles.forEach((p) => {
      list.appendChild(el('div', { class: 'profile-card' + (p.id === data.activeProfileId ? ' active' : '') },
        el('button', { class: 'pc-main', onclick: () => { Store.setActiveProfile(p.id); renderGuardian('profiles'); } },
          el('span', { class: 'pc-avatar' }, p.avatar),
          el('span', {}, el('div', { class: 'pc-name' }, p.name),
            el('div', { class: 'pc-meta' }, `${p.activeColors.length} colours · ${p.sessions.length} sessions`))),
        data.profiles.length > 1 ? el('button', { class: 'pc-del', title: 'Remove', onclick: () => {
          if (window.confirm(`Remove ${p.name} and their progress?`)) { Store.removeProfile(p.id); renderGuardian('profiles'); }
        } }, '🗑') : null));
    });
    body.appendChild(list);

    // Add a new child
    let name = '';
    let avatar = AVATARS[0];
    const nameInput = el('input', { class: 'text-input', type: 'text', placeholder: "Child's name", maxlength: '20', oninput: (e) => name = e.target.value });
    const avatarRow = el('div', { class: 'avatar-picker' },
      AVATARS.map((a) => el('button', { class: 'avatar-opt' + (a === avatar ? ' sel' : ''), onclick: (e) => {
        avatar = a;
        avatarRow.querySelectorAll('.avatar-opt').forEach((b) => b.classList.remove('sel'));
        e.currentTarget.classList.add('sel');
      } }, a)));
    body.appendChild(el('div', { class: 'add-profile' },
      el('h3', { class: 'g-sub' }, 'Add a child'),
      nameInput, avatarRow,
      el('button', { class: 'primary-btn', onclick: () => {
        Store.addProfile(name.trim() || 'Little One', avatar);
        renderGuardian('profiles');
      } }, 'Add child')));
  }

  // --- Guardian: Settings -------------------------------------------------
  function guardianSettings(body) {
    const p = Store.activeProfile();
    body.appendChild(el('h3', { class: 'g-sub' }, 'Practice set length'));
    body.appendChild(el('p', { class: 'g-note' }, 'A standard set is 20 rounds (about 2–3 minutes). Short, frequent sets — a few times a day — work best.'));
    const row = el('div', { class: 'rounds-row' },
      [10, 15, 20, 25].map((n) => el('button', {
        class: 'round-opt' + (p.roundsPerSet === n ? ' sel' : ''),
        onclick: () => { Store.updateProfile(p.id, { roundsPerSet: n }); renderGuardian('settings'); },
      }, n + ' rounds')));
    body.appendChild(row);

    body.appendChild(el('h3', { class: 'g-sub' }, 'Rename child'));
    const nameInput = el('input', { class: 'text-input', type: 'text', value: p.name, maxlength: '20' });
    body.appendChild(el('div', { class: 'rename-row' }, nameInput,
      el('button', { class: 'primary-btn', onclick: () => { Store.updateProfile(p.id, { name: nameInput.value.trim() || p.name }); renderGuardian('settings'); } }, 'Save')));

    body.appendChild(el('h3', { class: 'g-sub' }, 'Danger zone'));
    body.appendChild(el('button', { class: 'danger-btn', onclick: () => {
      if (window.confirm(`Reset all progress for ${p.name}? This cannot be undone.`)) {
        Store.updateProfile(p.id, { stats: {}, sessions: [] });
        renderGuardian('settings');
      }
    } }, 'Reset this child’s progress'));

    body.appendChild(el('div', { class: 'about' },
      el('p', {}, 'Rainbow Pitch uses the Eguchi Chord Identification Method: children aged ~2–6 learn absolute pitch by matching piano chords to fixed colours. Practise ~5 short times a day.'),
      el('p', { class: 'g-note' }, 'All data stays on this device. PIN 2468 is a demo gate, not real security.')));
  }

  // =======================================================================
  //  Confetti (lightweight, no dependencies)
  // =======================================================================
  function burstConfetti(count) {
    const layer = document.getElementById('confetti');
    const colors = CHORDS.map((c) => c.swatch);
    for (let i = 0; i < count; i++) {
      const bit = el('span', { class: 'confetti-bit' });
      bit.style.left = Math.random() * 100 + 'vw';
      bit.style.background = colors[Math.floor(Math.random() * colors.length)];
      bit.style.animationDelay = (Math.random() * 0.3) + 's';
      bit.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(bit);
      setTimeout(() => bit.remove(), 2200);
    }
  }

  // ---- boot --------------------------------------------------------------
  renderHome();
})();
