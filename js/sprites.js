/*
 * Chord Garden — hand-drawn SVG sprites.
 *
 * Custom flat-design mascot characters and UI icons, so the app has a
 * consistent illustrated look instead of relying on system emoji (which render
 * differently on every device and can look cheap). Everything is inline SVG,
 * scales crisply, and uses `currentColor` for icons so CSS controls the colour.
 */

const Sprites = (() => {
  const svg = (body, vb = '0 0 100 100') =>
    `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true" focusable="false">${body}</svg>`;

  // ---- Mascots ----------------------------------------------------------
  // Each is a friendly front-facing animal face on a 100×100 canvas.
  const MASCOTS = {
    fox: svg(`
      <path d="M20 46 L41 52 L27 20 Z" fill="#ef7c3f"/>
      <path d="M80 46 L59 52 L73 20 Z" fill="#ef7c3f"/>
      <path d="M26 42 L37 49 L29 27 Z" fill="#fbceac"/>
      <path d="M74 42 L63 49 L71 27 Z" fill="#fbceac"/>
      <path d="M50 32 C71 32 80 46 78 60 C76 75 64 88 50 91 C36 88 24 75 22 60 C20 46 29 32 50 32 Z" fill="#f5843c"/>
      <path d="M50 58 C61 58 69 65 69 65 L50 89 L31 65 C31 65 39 58 50 58 Z" fill="#fff7f0"/>
      <ellipse cx="39" cy="58" rx="4.6" ry="5.6" fill="#38304f"/>
      <ellipse cx="61" cy="58" rx="4.6" ry="5.6" fill="#38304f"/>
      <path d="M50 67 C54 67 56 70 56 72 C56 76 50 78 50 78 C50 78 44 76 44 72 C44 70 46 67 50 67 Z" fill="#38304f"/>`),

    cat: svg(`
      <path d="M22 48 L44 52 L26 22 Z" fill="#9aa3b3"/>
      <path d="M78 48 L56 52 L74 22 Z" fill="#9aa3b3"/>
      <path d="M28 44 L39 49 L30 30 Z" fill="#ffc2d4"/>
      <path d="M72 44 L61 49 L70 30 Z" fill="#ffc2d4"/>
      <path d="M50 34 C71 34 80 46 80 60 C80 78 66 90 50 92 C34 90 20 78 20 60 C20 46 29 34 50 34 Z" fill="#aab3c2"/>
      <ellipse cx="39" cy="60" rx="4.4" ry="6" fill="#38304f"/>
      <ellipse cx="61" cy="60" rx="4.4" ry="6" fill="#38304f"/>
      <path d="M45 70 L55 70 L50 76 Z" fill="#ff7aa2"/>
      <path d="M50 76 C50 80 47 82 43 81 M50 76 C50 80 53 82 57 81" stroke="#38304f" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M22 62 L36 65 M22 70 L36 70 M78 62 L64 65 M78 70 L64 70" stroke="#c9d0dc" stroke-width="2" stroke-linecap="round"/>`),

    bear: svg(`
      <circle cx="30" cy="32" r="11" fill="#8a5a2f"/>
      <circle cx="70" cy="32" r="11" fill="#8a5a2f"/>
      <circle cx="30" cy="32" r="5.5" fill="#c49a6c"/>
      <circle cx="70" cy="32" r="5.5" fill="#c49a6c"/>
      <ellipse cx="50" cy="60" rx="31" ry="30" fill="#9a6a3a"/>
      <ellipse cx="50" cy="70" rx="16" ry="13" fill="#e2c39a"/>
      <circle cx="40" cy="55" r="4" fill="#38304f"/>
      <circle cx="60" cy="55" r="4" fill="#38304f"/>
      <ellipse cx="50" cy="65" rx="5.5" ry="4" fill="#38304f"/>
      <path d="M50 69 C50 74 46 76 42 74 M50 69 C50 74 54 76 58 74" stroke="#38304f" stroke-width="2" fill="none" stroke-linecap="round"/>`),

    panda: svg(`
      <circle cx="28" cy="33" r="10" fill="#2f2b33"/>
      <circle cx="72" cy="33" r="10" fill="#2f2b33"/>
      <ellipse cx="50" cy="60" rx="31" ry="30" fill="#fbfbfd" stroke="#e7e3ee" stroke-width="1.5"/>
      <ellipse cx="38" cy="56" rx="8" ry="10" fill="#2f2b33" transform="rotate(-18 38 56)"/>
      <ellipse cx="62" cy="56" rx="8" ry="10" fill="#2f2b33" transform="rotate(18 62 56)"/>
      <circle cx="38" cy="55" r="3" fill="#fff"/>
      <circle cx="62" cy="55" r="3" fill="#fff"/>
      <ellipse cx="50" cy="68" rx="5" ry="3.6" fill="#2f2b33"/>
      <path d="M50 72 C50 76 46 78 43 76 M50 72 C50 76 54 78 57 76" stroke="#2f2b33" stroke-width="2" fill="none" stroke-linecap="round"/>`),

    frog: svg(`
      <ellipse cx="50" cy="66" rx="31" ry="24" fill="#5cb84a"/>
      <circle cx="34" cy="40" r="13" fill="#6cc24a"/>
      <circle cx="66" cy="40" r="13" fill="#6cc24a"/>
      <circle cx="34" cy="40" r="7.5" fill="#fff"/>
      <circle cx="66" cy="40" r="7.5" fill="#fff"/>
      <circle cx="34" cy="42" r="3.6" fill="#38304f"/>
      <circle cx="66" cy="42" r="3.6" fill="#38304f"/>
      <path d="M30 70 Q50 84 70 70" stroke="#2f6b28" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="45" cy="60" r="1.6" fill="#2f6b28"/>
      <circle cx="55" cy="60" r="1.6" fill="#2f6b28"/>`),

    owl: svg(`
      <path d="M26 36 L34 24 L41 38 Z" fill="#7a5a3a"/>
      <path d="M74 36 L66 24 L59 38 Z" fill="#7a5a3a"/>
      <path d="M50 30 C71 30 82 44 82 61 C82 79 68 90 50 92 C32 90 18 79 18 61 C18 44 29 30 50 30 Z" fill="#8a6640"/>
      <ellipse cx="50" cy="78" rx="20" ry="12" fill="#b18a5e"/>
      <circle cx="38" cy="56" r="13" fill="#f2e7d2"/>
      <circle cx="62" cy="56" r="13" fill="#f2e7d2"/>
      <circle cx="38" cy="56" r="6" fill="#38304f"/>
      <circle cx="62" cy="56" r="6" fill="#38304f"/>
      <circle cx="40" cy="54" r="2" fill="#fff"/>
      <circle cx="64" cy="54" r="2" fill="#fff"/>
      <path d="M50 60 L56 68 L44 68 Z" fill="#f2a03d"/>`),

    penguin: svg(`
      <ellipse cx="50" cy="58" rx="30" ry="32" fill="#3a3a44"/>
      <ellipse cx="50" cy="62" rx="20" ry="24" fill="#fbfbfd"/>
      <circle cx="41" cy="52" r="3.6" fill="#38304f"/>
      <circle cx="59" cy="52" r="3.6" fill="#38304f"/>
      <path d="M50 56 L59 62 L50 70 L41 62 Z" fill="#f2a03d"/>
      <path d="M22 44 C16 40 14 48 18 52 M78 44 C84 40 86 48 82 52" stroke="#3a3a44" stroke-width="4" fill="none" stroke-linecap="round"/>`),

    bunny: svg(`
      <ellipse cx="40" cy="26" rx="7.5" ry="22" fill="#fbfbfd" stroke="#ece7f2" stroke-width="1.5"/>
      <ellipse cx="60" cy="26" rx="7.5" ry="22" fill="#fbfbfd" stroke="#ece7f2" stroke-width="1.5"/>
      <ellipse cx="40" cy="28" rx="3.6" ry="15" fill="#ffc2d4"/>
      <ellipse cx="60" cy="28" rx="3.6" ry="15" fill="#ffc2d4"/>
      <ellipse cx="50" cy="64" rx="27" ry="25" fill="#fbfbfd" stroke="#ece7f2" stroke-width="1.5"/>
      <circle cx="40" cy="61" r="4" fill="#38304f"/>
      <circle cx="60" cy="61" r="4" fill="#38304f"/>
      <circle cx="36" cy="70" r="5" fill="#ffd6e3"/>
      <circle cx="64" cy="70" r="5" fill="#ffd6e3"/>
      <path d="M46 69 L54 69 L50 74 Z" fill="#ff7aa2"/>
      <path d="M50 74 C50 78 47 80 44 79 M50 74 C50 78 53 80 56 79" stroke="#38304f" stroke-width="2" fill="none" stroke-linecap="round"/>`),

    pig: svg(`
      <ellipse cx="33" cy="34" rx="8" ry="9" fill="#f7a8c4" transform="rotate(-20 33 34)"/>
      <ellipse cx="67" cy="34" rx="8" ry="9" fill="#f7a8c4" transform="rotate(20 67 34)"/>
      <ellipse cx="50" cy="62" rx="31" ry="29" fill="#f9b5cd"/>
      <circle cx="40" cy="56" r="4" fill="#38304f"/>
      <circle cx="60" cy="56" r="4" fill="#38304f"/>
      <ellipse cx="50" cy="70" rx="12" ry="9" fill="#f28fb0"/>
      <ellipse cx="45.5" cy="70" rx="2.4" ry="3.4" fill="#c85f85"/>
      <ellipse cx="54.5" cy="70" rx="2.4" ry="3.4" fill="#c85f85"/>`),

    koala: svg(`
      <circle cx="27" cy="42" r="14" fill="#b7bfca"/>
      <circle cx="73" cy="42" r="14" fill="#b7bfca"/>
      <circle cx="27" cy="42" r="8" fill="#e9c9d8"/>
      <circle cx="73" cy="42" r="8" fill="#e9c9d8"/>
      <ellipse cx="50" cy="62" rx="29" ry="28" fill="#aab3c0"/>
      <circle cx="40" cy="58" r="4" fill="#38304f"/>
      <circle cx="60" cy="58" r="4" fill="#38304f"/>
      <ellipse cx="50" cy="70" rx="8" ry="10" fill="#4b4657"/>`),

    lion: svg(`
      <circle cx="50" cy="58" r="40" fill="#d99a3c"/>
      <g fill="#c07f28">
        <circle cx="50" cy="16" r="9"/><circle cx="84" cy="58" r="9"/><circle cx="16" cy="58" r="9"/>
        <circle cx="50" cy="100" r="9"/><circle cx="76" cy="26" r="9"/><circle cx="24" cy="26" r="9"/>
        <circle cx="76" cy="90" r="9"/><circle cx="24" cy="90" r="9"/></g>
      <circle cx="50" cy="58" r="30" fill="#f2b950"/>
      <ellipse cx="50" cy="66" rx="15" ry="11" fill="#fbe0ad"/>
      <circle cx="40" cy="54" r="4" fill="#38304f"/>
      <circle cx="60" cy="54" r="4" fill="#38304f"/>
      <path d="M44 63 L56 63 L50 68 Z" fill="#6b4a1a"/>
      <path d="M50 68 C50 73 46 75 42 73 M50 68 C50 73 54 75 58 73" stroke="#6b4a1a" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  };

  const animals = Object.keys(MASCOTS);

  // Per-mascot face metadata for mood overlays: each mascot's two eye centre
  // coordinates, the fill colour immediately behind its eyes (its "skin",
  // for blanking an open eye before redrawing it), the dark ink colour that
  // mascot already uses for its own eyes/mouth (for drawing new marks so
  // they match), and `mouthDy` — the vertical distance from the eyes down
  // to that mascot's own mouth/nose/beak, eyeballed from its MASCOTS
  // artwork above, so a "curious" mouth overlay lands roughly on top of the
  // original instead of floating in the wrong place. Recorded per mascot —
  // rather than computed from the SVG — because every face is hand-drawn
  // and different; this lets mood() stay one small generic function instead
  // of needing 7 full alternate face drawings (one per mascot per mood).
  const FACE = {
    fox:     { eyes: [[39, 58], [61, 58]], skin: '#f5843c', dark: '#38304f', mouthDy: 14 },
    cat:     { eyes: [[39, 60], [61, 60]], skin: '#aab3c2', dark: '#38304f', mouthDy: 16 },
    bear:    { eyes: [[40, 55], [60, 55]], skin: '#9a6a3a', dark: '#38304f', mouthDy: 16 },
    // Panda's "eyes" are its black eye-patches themselves, so ink drawn in
    // the patch colour would vanish: its happy closed-eye arcs and curious
    // eyebrow need to be WHITE to show up on the patch (arcInk), and its
    // brows need lifting clear of the patches onto the white fur above
    // (browLift) or the dark strokes would blend straight into the black.
    panda:   { eyes: [[38, 56], [62, 56]], skin: '#2f2b33', dark: '#2f2b33', arcInk: '#fbfbfd', browLift: 6, mouthDy: 16 },
    frog:    { eyes: [[34, 42], [66, 42]], skin: '#ffffff', dark: '#38304f', mouthDy: 35 },
    owl:     { eyes: [[38, 56], [62, 56]], skin: '#f2e7d2', dark: '#38304f', mouthDy: 8 },
    penguin: { eyes: [[41, 52], [59, 52]], skin: '#fbfbfd', dark: '#38304f', mouthDy: 11 },
    bunny:   { eyes: [[40, 61], [60, 61]], skin: '#fbfbfd', dark: '#38304f', mouthDy: 13 },
    pig:     { eyes: [[40, 56], [60, 56]], skin: '#f9b5cd', dark: '#38304f', mouthDy: 14 },
    koala:   { eyes: [[40, 58], [60, 58]], skin: '#aab3c0', dark: '#38304f', mouthDy: 12 },
    lion:    { eyes: [[40, 54], [60, 54]], skin: '#f2b950', dark: '#38304f', mouthDy: 14 },
  };

  // Builds the extra markup layered on top of a mascot's base face for a
  // mood. Purely geometric, driven only by one mascot's eye coordinates +
  // two colours, so the same code draws a believable face for every mascot
  // instead of hand-drawing each mood per animal.
  //
  // The method never marks anything as "wrong", so there is deliberately no
  // sad/disappointed mood here — a missed tap gets a "curious" mascot, not
  // a sad one. Any mood this function doesn't recognise (including the
  // interim 'sad' key app.js may still pass until it's wired to 'curious')
  // falls through to the empty-overlay case, i.e. the plain, normal face.
  function moodOverlay(face, mood) {
    if (mood === 'happy') {
      // Blank each eye, then draw closed, upturned "^ ^" eyes in the
      // mascot's own dark colour, plus two soft blush circles low on the
      // cheeks (semi-transparent via fill-opacity, not a literal rgba, to
      // stay consistent with the flat-colour style used everywhere else).
      return face.eyes.map(([x, y]) => `
        <circle cx="${x}" cy="${y}" r="7" fill="${face.skin}"/>
        <path d="M${x - 6} ${y + 1} Q${x} ${y - 6} ${x + 6} ${y + 1}" stroke="${face.arcInk || face.dark}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`).join('')
        + face.eyes.map(([x, y]) => `<circle cx="${x}" cy="${y + 13}" r="5" fill="#ff7aa2" fill-opacity=".4"/>`).join('');
    }
    if (mood === 'curious') {
      // Friendly "hmm, let's listen again!" — never disappointed. Leave
      // both eyes exactly as they are (still open, still cheerful) and just
      // add ONE raised eyebrow arc over the right eye, plus a small open
      // "o" mouth in the mascot's own ink colour roughly where its mouth
      // already sits (see FACE.mouthDy), reading as curious/thinking
      // rather than upset.
      const lift = face.browLift || 0; // clear of any dark eye patch (panda)
      const [bx, by] = face.eyes[1]; // eyes[1] is the right eye
      const brow = `<path d="M${bx - 8} ${by - 9 - lift} Q${bx} ${by - 17 - lift} ${bx + 8} ${by - 10 - lift}" stroke="${face.arcInk || face.dark}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
      const mx = (face.eyes[0][0] + face.eyes[1][0]) / 2;
      const my = (face.eyes[0][1] + face.eyes[1][1]) / 2 + face.mouthDy;
      const mouth = `<ellipse cx="${mx}" cy="${my}" rx="4.2" ry="5.4" fill="${face.dark}"/>`;
      return brow + mouth;
    }
    return '';
  }

  function mascot(key, mood = 'normal') {
    const body = MASCOTS[key] || MASCOTS.fox;
    if (mood === 'normal') return body;
    const face = FACE[key] || FACE.fox;
    // Splice the overlay in just before the closing tag, so it layers on
    // top of the base face markup inside the same <svg> (same viewBox,
    // same currentColor-free flat-fill style).
    return body.replace('</svg>', moodOverlay(face, mood) + '</svg>');
  }

  // ---- Icons (use currentColor) ----------------------------------------
  const ICONS = {
    play: svg(`<path d="M8 5.5 L8 18.5 L18.5 12 Z" fill="currentColor"/>`, '0 0 24 24'),
    speaker: svg(`
      <path d="M4 9 L4 15 L8 15 L13 19 L13 5 L8 9 Z" fill="currentColor"/>
      <path d="M16.5 9 A4 4 0 0 1 16.5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M19 6.5 A8 8 0 0 1 19 17.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`, '0 0 24 24'),
    gear: svg(`
      <path d="M12 2 l1.6 3 3.3-.6 .9 3.2 3 1.5-1.3 3.1 1.3 3.1-3 1.5-.9 3.2-3.3-.6L12 22l-1.6-3-3.3.6-.9-3.2-3-1.5 1.3-3.1L3.2 8.6l3-1.5.9-3.2 3.3.6z" fill="currentColor"/>
      <circle cx="12" cy="12" r="3.4" fill="var(--card,#fff)"/>`, '0 0 24 24'),
    lock: svg(`
      <path d="M7 10 V7 a5 5 0 0 1 10 0 v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" fill="currentColor"/>
      <circle cx="12" cy="15" r="1.6" fill="var(--card,#fff)"/>`, '0 0 24 24'),
    star: svg(`<path d="M12 2.5 l2.9 5.9 6.5.9 -4.7 4.6 1.1 6.5 -5.8-3.1 -5.8 3.1 1.1-6.5 -4.7-4.6 6.5-.9 Z" fill="currentColor"/>`, '0 0 24 24'),
    sparkle: svg(`<path d="M12 2 C12.6 7.5 16.5 11.4 22 12 C16.5 12.6 12.6 16.5 12 22 C11.4 16.5 7.5 12.6 2 12 C7.5 11.4 11.4 7.5 12 2 Z" fill="currentColor"/>`, '0 0 24 24'),
    note: svg(`<path d="M9 17 V6 l10-2 v9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="6.5" cy="17.5" r="3" fill="currentColor"/><circle cx="16.5" cy="15.5" r="3" fill="currentColor"/>`, '0 0 24 24'),
    check: svg(`<path d="M5 13 l4 4 L19 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`, '0 0 24 24'),
    // Real-piano mode's mic-capsule-on-a-stand glyph (see js/mic-capture.js) —
    // same filled-capsule + stroke-arc convention as `speaker` just above it:
    // a solid currentColor body for the capsule itself, thin stroked arcs/
    // lines for the stand, matching speaker's filled-horn + stroked sound-arcs
    // split.
    mic: svg(`
      <rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor"/>
      <path d="M6 11 a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M12 17 V21.5 M8.5 21.5 H15.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`, '0 0 24 24'),
    hourglass: svg(`<path d="M7 3 h10 M7 21 h10 M7 3 c0 5 10 6 10 9 c0 3-10 4-10 9 M17 3 c0 5-10 6-10 9 c0 3 10 4 10 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, '0 0 24 24'),
    trophy: svg(`<path d="M7 4 h10 v4 a5 5 0 0 1 -10 0 Z" fill="currentColor"/><path d="M7 5 H4 v2 a3 3 0 0 0 3 3 M17 5 h3 v2 a3 3 0 0 1 -3 3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 13 v4 M9 20 h6 M10 20 a2 3 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`, '0 0 24 24'),
    rainbow: svg(`
      <path d="M8 44 a34 34 0 0 1 68 0" fill="none" stroke="#ff4d6d" stroke-width="7" stroke-linecap="round"/>
      <path d="M17 44 a25 25 0 0 1 50 0" fill="none" stroke="#ff9f1c" stroke-width="7" stroke-linecap="round"/>
      <path d="M26 44 a16 16 0 0 1 32 0" fill="none" stroke="#2ec4b6" stroke-width="7" stroke-linecap="round"/>
      <path d="M35 44 a7 7 0 0 1 14 0" fill="none" stroke="#4361ee" stroke-width="7" stroke-linecap="round"/>`, '0 0 84 50'),
    // The goal marker at the far end of the practice screen's journey path
    // (see js/app.js renderPractice) — a small pole-and-pennant flag.
    flag: svg(`
      <path d="M6 3 V21" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M6 4 L19 4 L14.5 8.5 L19 13 L6 13 Z" fill="currentColor"/>`, '0 0 24 24'),
    // Grown-up UI glyphs, drawn to replace text characters (‹ ⬇ ⌫) that
    // render differently in every font.
    back: svg(`<path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`, '0 0 24 24'),
    close: svg(`<path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`, '0 0 24 24'),
    chevron: svg(`<path d="M6 9 L12 15 L18 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`, '0 0 24 24'),
    download: svg(`
      <path d="M12 4 V15 M7 10.5 L12 15.5 L17 10.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 19.5 H19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`, '0 0 24 24'),
    backspace: svg(`
      <path d="M9 5 H19 a2 2 0 0 1 2 2 V17 a2 2 0 0 1 -2 2 H9 L3 12 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="M11.5 9.5 L16.5 14.5 M16.5 9.5 L11.5 14.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`, '0 0 24 24'),
    // The growing garden's watering can: it fills a little every round (at
    // the end of the practice vine) and waters today's plant after a set.
    // Themed fills/strokes (unlike the plain currentColor icons above) so it
    // matches day/night like the plant sprite; the water is a pale tint no
    // chord uses, so it never reads as a flag colour. `.can-water` is a
    // plain rect the CSS scales to show how full the can is.
    can: svg(`
      <path d="M40 24 C40 6 10 6 10 28 C10 40 18 46 26 46" fill="none" stroke-width="5" stroke-linecap="round" style="stroke:var(--ink,#1F3A2E)"/>
      <path d="M70 58 L90 30" stroke-width="9" stroke-linecap="round" style="stroke:var(--ink,#1F3A2E)"/>
      <path d="M70 58 L90 30" stroke-width="4" stroke-linecap="round" style="stroke:var(--card,#fff)"/>
      <ellipse cx="91" cy="26" rx="8" ry="5" transform="rotate(35 91 26)" stroke-width="3" style="fill:var(--card,#fff);stroke:var(--ink,#1F3A2E)"/>
      <rect x="22" y="24" width="50" height="50" rx="10" stroke-width="4" style="fill:var(--card,#fff);stroke:var(--ink,#1F3A2E)"/>
      <rect class="can-water" x="26" y="32" width="42" height="38" rx="6" style="fill:var(--water,#BFE3F2)"/>
      <rect x="19" y="19" width="56" height="8" rx="4" style="fill:var(--ink,#1F3A2E)"/>`, '0 0 100 84'),
    // One drop of the can's water: it falls into the can after a round and
    // out of it onto the plant.
    drop: svg(`<path d="M10 1 C13 7 17 11 17 16 A7 7 0 0 1 3 16 C3 11 7 7 10 1 Z" stroke-width="1.6" style="fill:var(--water,#BFE3F2);stroke:var(--water-ink,#4E8FAE)"/>`, '0 0 20 26'),
  };

  function icon(name) {
    return ICONS[name] || '';
  }

  // ---- Colour shapes (use currentColor) ---------------------------------
  // One fixed, chunky silhouette per Eguchi colour (see CHORDS.shape in
  // data.js). Every colour answer keeps its own shape as well as its own
  // hue, so a colour-blind child (or anyone in bad light) still has a
  // second, shape-based way to tell two swatches apart. Single-colour and
  // `currentColor`-filled, like the icons above, so CSS can give each one
  // contrast against whatever swatch colour it sits on. Kept to one or two
  // paths wherever the shape allows it; a few (cloud, flower, clover) need
  // several overlapping primitives to read as themselves at a glance.
  const SHAPE_BODIES = {
    apple: `
      <circle cx="50" cy="66" r="27" fill="currentColor"/>
      <rect x="46.5" y="30" width="7" height="17" rx="3" fill="currentColor" transform="rotate(-14 50 38)"/>
      <path d="M54 34 C64 27 75 31 73 40 C71 48 58 47 52 40 Z" fill="currentColor"/>`,

    star: `<path d="M50 14 L59.4 41.1 L88 41.6 L65.2 58.9 L73.5 86.4 L50 70 L26.5 86.4 L34.8 58.9 L12 41.6 L40.6 41.1 Z" fill="currentColor"/>`,

    raindrop: `<path d="M50 12 C68 42 80 62 80 76 C80 90 66 96 50 96 C34 96 20 90 20 76 C20 62 32 42 50 12 Z" fill="currentColor"/>`,

    note: `
      <ellipse cx="40" cy="76" rx="15" ry="11" transform="rotate(-18 40 76)" fill="currentColor"/>
      <rect x="52" y="20" width="7" height="58" rx="3" fill="currentColor"/>
      <path d="M59 20 C78 24 82 40 70 48 C72 36 62 28 59 32 Z" fill="currentColor"/>`,

    leaf: `
      <path d="M50 8 C80 30 80 70 50 96 C20 70 20 30 50 8 Z" fill="currentColor"/>
      <rect x="47" y="90" width="6" height="10" rx="2" fill="currentColor"/>`,

    carrot: `
      <path d="M50 32 C43 20 31 15 23 20 C31 22 39 28 45 34 Z M50 32 C50 16 48 6 48 6 C54 8 56 20 54 32 Z M50 32 C58 20 70 15 78 20 C70 22 62 28 56 34 Z" fill="currentColor"/>
      <path d="M50 30 C60 30 66 39 63 51 L54 92 C53 96 47 96 46 92 L37 51 C34 39 40 30 50 30 Z" fill="currentColor"/>`,

    butterfly: `
      <path d="M50 40 C38 14 8 10 6 28 C4 42 16 50 30 48 C18 56 12 72 22 84 C32 94 46 82 50 62 Z" fill="currentColor"/>
      <path d="M50 40 C62 14 92 10 94 28 C96 42 84 50 70 48 C82 56 88 72 78 84 C68 94 54 82 50 62 Z" fill="currentColor"/>
      <rect x="47" y="36" width="6" height="34" rx="3" fill="currentColor"/>`,

    heart: `<path d="M50 88 C20 66 8 48 8 32 C8 16 22 6 36 12 C44 15 48 22 50 28 C52 22 56 15 64 12 C78 6 92 16 92 32 C92 48 80 66 50 88 Z" fill="currentColor"/>`,

    acorn: `
      <path d="M28 40 C28 26 38 18 50 18 C62 18 72 26 72 40 C72 44 66 46 50 46 C34 46 28 44 28 40 Z" fill="currentColor"/>
      <rect x="47" y="10" width="6" height="9" rx="2" fill="currentColor"/>
      <path d="M32 42 C28 60 34 84 50 92 C66 84 72 60 68 42 C60 48 40 48 32 42 Z" fill="currentColor"/>`,

    cloud: `
      <ellipse cx="50" cy="66" rx="34" ry="18" fill="currentColor"/>
      <circle cx="32" cy="52" r="16" fill="currentColor"/>
      <circle cx="52" cy="44" r="20" fill="currentColor"/>
      <circle cx="72" cy="54" r="15" fill="currentColor"/>`,

    // A hand-drawn cookie disc (irregular edge, not a perfect circle) with a
    // few chip holes cut into it via evenodd — one path, one colour, real
    // holes that show whatever is behind the icon rather than needing a
    // second fill colour.
    cookie: `<path fill-rule="evenodd" fill="currentColor" d="M50 15 C62 13 74 20 78 32 C88 34 92 46 87 56 C90 66 84 77 73 80 C70 90 58 94 48 90 C36 93 24 87 20 76 C10 73 8 61 14 52 C10 42 16 31 27 28 C30 18 40 13 50 15 Z
      M42 40 A4 4 0 1 0 34 40 A4 4 0 1 0 42 40 Z
      M66.5 36 A4.5 4.5 0 1 0 57.5 36 A4.5 4.5 0 1 0 66.5 36 Z
      M70 60 A4 4 0 1 0 62 60 A4 4 0 1 0 70 60 Z
      M43.5 64 A3.5 3.5 0 1 0 36.5 64 A3.5 3.5 0 1 0 43.5 64 Z"/>`,

    clover: `
      <circle cx="50" cy="34" r="18" fill="currentColor"/>
      <circle cx="32" cy="60" r="18" fill="currentColor"/>
      <circle cx="68" cy="60" r="18" fill="currentColor"/>
      <path d="M50 66 C50 80 54 90 62 94" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>`,

    flower: `
      <circle cx="50" cy="16" r="15" fill="currentColor"/>
      <circle cx="70.9" cy="31.2" r="15" fill="currentColor"/>
      <circle cx="62.9" cy="55.8" r="15" fill="currentColor"/>
      <circle cx="37.1" cy="55.8" r="15" fill="currentColor"/>
      <circle cx="29.1" cy="31.2" r="15" fill="currentColor"/>
      <path d="M50 62 L50 92" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="58" cy="76" rx="10" ry="5" transform="rotate(-30 58 76)" fill="currentColor"/>`,

    bird: `
      <ellipse cx="48" cy="58" rx="28" ry="24" fill="currentColor"/>
      <path fill-rule="evenodd" fill="currentColor" d="M91 40 A15 15 0 1 0 61 40 A15 15 0 1 0 91 40 Z
        M87 34 A3 3 0 1 0 81 34 A3 3 0 1 0 87 34 Z"/>
      <path d="M90 37 L99 41 L90 46 Z" fill="currentColor"/>
      <path d="M22 48 L4 60 L24 68 Z" fill="currentColor"/>
      <ellipse cx="44" cy="68" rx="14" ry="20" transform="rotate(-20 44 68)" fill="currentColor"/>`,
  };

  const SHAPES = Object.fromEntries(Object.entries(SHAPE_BODIES).map(([k, body]) => [k, svg(body)]));

  function shape(name) {
    return SHAPES[name] || '';
  }

  // ---- Flags --------------------------------------------------------------
  // The answer object: an Eguchi-style colour flag planted in the grass, the
  // way the method is taught with real flags. The cloth carries the colour's
  // shape in its ink tone; poles, knob and mound are styled from CSS
  // (.flag-pole etc.) so the day/night garden themes can recolour them.
  // .flag-cloth is the group that waves when the flag is picked.
  //
  // `picture` (default true) draws the shape on the cloth as a second,
  // colour-independent cue (see the comment in data.js); a guardian can turn
  // it off per child for plain colour flags, which just skips that one group.
  function flag(chord, { picture = true } = {}) {
    const body = SHAPE_BODIES[chord.shape] || '';
    return `<svg viewBox="0 0 110 168" xmlns="http://www.w3.org/2000/svg" class="sprite flag" aria-hidden="true" focusable="false">
      <ellipse class="flag-mound" cx="18" cy="164" rx="15" ry="4"/>
      <rect class="flag-pole" x="14" y="8" width="8" height="156" rx="4"/>
      <circle class="flag-knob" cx="18" cy="9" r="7"/>
      <g class="flag-cloth">
        <path class="flag-fabric" d="M22 16 C44 6 70 26 104 14 L104 90 C70 102 44 82 22 92 Z" fill="${chord.swatch}"/>
        <path d="M22 16 C44 6 70 26 104 14 L104 24 C70 36 44 16 22 26 Z" fill="#fff" opacity=".16"/>
        ${picture ? `<g transform="translate(40 30) scale(0.46)" style="color:${chord.text}">${body}</g>` : ''}
      </g>
    </svg>`;
  }

  // ---- Growing garden plant ----------------------------------------------
  // The day's plant, stages 0 (unplanted) through 5 (bloom) — see
  // js/logic.js's Logic.plantStage for how a set count maps to a stage.
  // Unlike the icons/shapes above, stems/leaves/soil are themed (they sit on
  // the garden scene, which recolours for day/night), while the chord
  // swatches used for bud tips and bloom petals are fixed, like flag().

  const round2 = (n) => Math.round(n * 100) / 100;

  // How many petals a bloom gets, and where — one petal per practised
  // colour when there's room to read them individually (n <= 9); past that
  // a single ring gets too crowded to tell petals apart, so it splits into
  // an outer and inner ring instead. Below 5 colours the ring repeats (mod
  // n) so the bloom still reads as a full flower rather than a sparse one.
  // Petal ORDER is colour order — the order the colours were learned in
  // (see Logic.orderColors) — so the oldest-known colour always leads.
  function petalLayout(n) {
    if (n <= 3) {
      return Array.from({ length: 6 }, (_, i) => ({ color: i % n, D: 11, RX: 7.5, RY: 10.5, angle: 60 * i }));
    }
    if (n === 4) {
      return Array.from({ length: 8 }, (_, i) => ({ color: i % 4, D: 11.5, RX: 5.8, RY: 10.5, angle: 45 * i }));
    }
    if (n <= 9) {
      const D = 11 + Math.max(0, n - 6) / 3;
      const RX = Math.min(7.5, 46 / n);
      return Array.from({ length: n }, (_, i) => ({ color: i, D, RX, RY: 10.5, angle: (360 * i) / n }));
    }
    const outer = Math.ceil(n / 2);
    const inner = n - outer;
    const outerRX = Math.min(6.2, 43 / outer);
    const outerPetals = Array.from({ length: outer }, (_, i) =>
      ({ color: i, D: 13.5, RX: outerRX, RY: 10.5, angle: (360 * i) / outer }));
    const innerPetals = Array.from({ length: inner }, (_, i) =>
      ({ color: outer + i, D: 7.5, RX: 3.8, RY: 6.5, angle: (360 * i) / inner + 180 / outer }));
    return [...outerPetals, ...innerPetals]; // outer ring drawn first, inner ring on top
  }

  // Stage 4's bud tips hint at the colours about to bloom without yet
  // committing to petalLayout()'s full ring: 1–2 colours get one tip each;
  // 3+ collapses to first/middle/last so the still-closed bud doesn't get
  // crowded before it's even open.
  function budTips(swatches) {
    const n = swatches.length;
    if (n <= 1) {
      const c = swatches[0] || '#FFFFFF';
      return `<ellipse class="bud-tip" cx="27" cy="22" rx="3.4" ry="7.5" fill="${c}" transform="rotate(-14 27 22)"/>`
        + `<ellipse class="bud-tip" cx="33" cy="22" rx="3.4" ry="7.5" fill="${c}" transform="rotate(14 33 22)"/>`;
    }
    if (n === 2) {
      return `<ellipse class="bud-tip" cx="27" cy="22" rx="3.4" ry="7.5" fill="${swatches[0]}" transform="rotate(-14 27 22)"/>`
        + `<ellipse class="bud-tip" cx="33" cy="22" rx="3.4" ry="7.5" fill="${swatches[1]}" transform="rotate(14 33 22)"/>`;
    }
    const mid = swatches[Math.floor((n - 1) / 2)];
    return `<ellipse class="bud-tip" cx="24.5" cy="23" rx="3" ry="7" fill="${swatches[0]}" transform="rotate(-24 24.5 23)"/>`
      + `<ellipse class="bud-tip" cx="35.5" cy="23" rx="3" ry="7" fill="${swatches[n - 1]}" transform="rotate(24 35.5 23)"/>`
      + `<ellipse class="bud-tip" cx="30" cy="20" rx="3.2" ry="7.5" fill="${mid}"/>`;
  }

  // Stage 5's bloom: petalLayout() picks the ring(s), this just draws them
  // plus the flower's centre "heart". The thin outline is set once on the
  // group (not per petal) so it applies to the heart too, keeping every
  // shape readable against similar-hued neighbours without a heavier stroke
  // on any one of them.
  function bloom(swatches) {
    const colors = swatches.length ? swatches : ['#FFFFFF'];
    const layout = petalLayout(colors.length);
    const petals = layout.map((p) => {
      const d = round2(p.D), rx = round2(p.RX), ry = round2(p.RY), angle = round2(p.angle);
      return `<ellipse class="petal" cx="0" cy="-${d}" rx="${rx}" ry="${ry}" fill="${colors[p.color]}" transform="rotate(${angle})"/>`;
    }).join('');
    const [r1, r2] = colors.length >= 10 ? [5.5, 2.4] : [7, 3]; // smaller heart for the denser two-ring blooms
    return `<g transform="translate(30 27)" stroke="#1F3A2E" stroke-opacity=".22" stroke-width="1">${petals}`
      + `<circle class="plant-heart" cx="0" cy="0" r="${r1}" fill="#FFF4D6" stroke-opacity=".3"/>`
      + `<circle cx="0" cy="0" r="${r2}" fill="#EAD7A6" stroke="none"/></g>`;
  }

  // ---- Mystery-seed species ----------------------------------------------
  // Each species draws its own seed, sprout, leaves, bud and bloom on the
  // same 60×90 canvas as the daisy (soil centred at x=30, y≈86). The daisy
  // stays the default and its stages 0–5 are byte-identical to before.
  //
  // Petal contract, same as the daisy (app.js petalsOf / glowPetals /
  // chordOfPetal): every .petal / .bud-tip carries its own exact swatch in a
  // `fill` attribute (never style, never inherited, never fill-opacity — that
  // attribute belongs to glowPetals). Nothing is drawn over a petal except a
  // small flower centre. No ids, <defs>, clipPath or mask: the echo game
  // clones the SVG. Chord colours appear nowhere else.

  const SPECIES = ['daisy', 'tulip', 'sunflower', 'starflower', 'pinwheel', 'bellflower'];

  const OUTLINE = 'stroke="#1F3A2E" stroke-opacity=".22" stroke-width="1"';
  const CREAM = '#FFF4D6';
  const sLeaf = 'fill:var(--leaf,#6FA656)';
  const sSoil = 'fill:var(--soil,#9B7650)';
  const sSoilDark = 'fill:var(--soil-dark,#7A5B3D)';
  const sVine = 'stroke:var(--vine,#5E8F46)';
  const r2 = round2;
  const rad = (deg) => (deg * Math.PI) / 180;
  const at = (list, i) => list[i % list.length];

  const leafD = (d) => `<path class="plant-leaf" d="${d}" style="${sLeaf}"/>`;
  const stemD = (d, w) => `<path class="plant-stem" d="${d}" style="${sVine}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  const veinD = (d) => `<path d="${d}" style="${sVine}" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".7"/>`;
  const plot = '<ellipse class="plant-soil" cx="30" cy="86" rx="15" ry="5.5" style="fill:var(--soil,#9B7650)"/>'
    + '<ellipse cx="30" cy="84.5" rx="5" ry="1.8" style="fill:var(--soil-dark,#7A5B3D)"/>';
  const mound = '<ellipse class="plant-soil" cx="30" cy="86" rx="15" ry="6" style="fill:var(--soil,#9B7650)"/>';
  const soilTop = '<ellipse class="plant-soil" cx="30" cy="87" rx="13" ry="4.5" style="fill:var(--soil,#9B7650)"/>';

  // The colours a closed bud shows — mirrors budTips() and
  // Songs.visibleColors(4, …): 1 colour → two tips of it, 2 → both,
  // 3+ → first, middle, last.
  function budColors(swatches) {
    const n = swatches.length;
    if (n <= 1) { const c = swatches[0] || '#FFFFFF'; return [c, c]; }
    if (n === 2) return swatches.slice();
    return [swatches[0], swatches[Math.floor((n - 1) / 2)], swatches[n - 1]];
  }

  // ---- Seeds: drawn around (0,0), ~12 units tall. Neutral earth tones and
  // cream only, so they never read as a chord colour.
  const SEEDS = {
    daisy: '<ellipse class="plant-seed" cx="0" cy="0" rx="4.2" ry="5.4" fill="#C9A26B"/>',
    // A papery bulb: wide shoulders, flat base, tunic lines, cream roots.
    tulip: '<path d="M-2 5.6 l-1.3 2.2 M0 5.9 v2.6 M2 5.6 l1.3 2.2" stroke="#EFE3C8" stroke-width="1" stroke-linecap="round" fill="none"/>'
      + '<path class="plant-seed" d="M0 -6.6 C1.2 -4.4 6.2 -3.2 6.2 1.4 C6.2 4.8 3.6 6.1 0 6.1 C-3.6 6.1 -6.2 4.8 -6.2 1.4 C-6.2 -3.2 -1.2 -4.4 0 -6.6 Z" fill="#C68A56"/>'
      + '<path d="M-2.8 -2.4 C-3.9 0 -3.7 3 -2.4 5.4 M2.8 -2.4 C3.9 0 3.7 3 2.4 5.4 M0 -6.6 L.5 -8.4" stroke="#7A4E2C" stroke-opacity=".55" stroke-width=".9" stroke-linecap="round" fill="none"/>',
    // Striped almond, lying tilted.
    sunflower: '<g transform="rotate(32)"><path class="plant-seed" d="M0 -7 C3.9 -4.6 4 2.6 0 7 C-4 2.6 -3.9 -4.6 0 -7 Z" fill="#4B4540"/>'
      + '<path d="M-1.7 -4.2 C-2.3 -.5 -1.9 2.8 -.7 5.3 M1.7 -4.2 C2.3 -.5 1.9 2.8 .7 5.3" stroke="#F2E6CC" stroke-width="1.05" stroke-linecap="round" fill="none"/></g>',
    // Slender curved seed with a little cream tuft.
    starflower: '<g transform="rotate(-18)"><path class="plant-seed" d="M-1.6 -6.4 C3.4 -3.6 3.6 3 .4 7 C1.2 2.6 .2 -2.4 -2.6 -5.4 Z" fill="#6E5843"/>'
      + '<path d="M-2.1 -5.9 l-1.9 -2.2 M-2.1 -5.9 l-.2 -2.9 M-2.1 -5.9 l1.4 -2.4" stroke="#EFE3C8" stroke-width=".9" stroke-linecap="round" fill="none"/></g>',
    // Plump round seed with the swirl its flower will wear.
    pinwheel: '<circle class="plant-seed" cx="0" cy="0" r="4.9" fill="#B88A5C"/>'
      + '<path d="M0 0 C1.4 0 1.5 -1.7 0 -1.8 C-2.1 -1.9 -2.6 1 -.8 2.4 C1.6 4 4.1 1.5 3.3 -1.3" stroke="#F4E7CC" stroke-width="1.1" stroke-linecap="round" fill="none"/>',
    // A little cluster of three tiny seeds.
    bellflower: '<circle class="plant-seed" cx="-3" cy="1.8" r="2.5" fill="#7B5A3E"/><circle class="plant-seed" cx="3" cy="2.2" r="2.4" fill="#7B5A3E"/><circle class="plant-seed" cx="0" cy="-2.2" r="2.6" fill="#7B5A3E"/>'
      + '<circle cx="-3.7" cy="1" r=".7" fill="#EFE3C8"/><circle cx="2.3" cy="1.4" r=".7" fill="#EFE3C8"/><circle cx="-.7" cy="-3" r=".75" fill="#EFE3C8"/>',
  };
  const seedAt = (species, x, y) => `<g transform="translate(${x} ${y})">${SEEDS[species] || SEEDS.daisy}</g>`;

  // Stage 1's first green: a spear for the bulb, a little hook for the rest.
  const peek = (species) => (species === 'tulip'
    ? leafD('M29.2 80.5 C29.2 77 29.8 74 30.8 71 C31.8 74 32.2 77 31.8 80.5 Z')
    : stemD('M30 80 C29.6 77 30.6 74.8 32.6 74', 1.8)
      + leafD('M32.6 74 C34.8 72.4 36.6 73 37.1 74.5 C35.2 75.4 33.7 75.1 32.6 74 Z'));

  // ---- Per-species foliage (stems + leaves, soil last) for stages 2-5 ----
  const FOLIAGE = {
    tulip: {
      2: leafD('M29.5 86 C26 80 25 72 26.5 64 C28.8 70 30.2 78 31 86 Z') + leafD('M30.5 86 C33 81 34.6 75 34 68 C32 73 30.8 79 29.8 86 Z'),
      3: stemD('M30 87 C30 74 30 60 30 48', 3)
        + leafD('M29 86 C21 80 17 66 19 50 C23 60 27 72 31 84 Z') + leafD('M31 86 C38 80 42 70 41 58 C37 66 33 75 29.5 84 Z'),
      4: stemD('M30 87 C30 72 30 54 30 38', 3.2)
        + leafD('M29 86 C19 80 14 64 16 44 C21 56 26 70 31 84 Z') + leafD('M31 86 C40 79 45 66 43 52 C38 62 34 72 29.5 84 Z'),
    },
    sunflower: {
      2: stemD('M30 86 C30 80 30 75 30 70', 3.6)
        + leafD('M30 71 C25 72.6 19.5 71 18 67.5 C21 64.8 27 65.8 30 70 Z') + leafD('M30 71 C35 72.6 40.5 71 42 67.5 C39 64.8 33 65.8 30 70 Z')
        + `<g transform="translate(35 64.5) scale(.62) rotate(-60)">${SEEDS.sunflower}</g>`,
      3: stemD('M30 87 C30 74 30 60 30 46', 4.2)
        + leafD('M30 73 C26 77 16 79 9.5 72.5 C13.5 66 18.5 62.5 24 63.5 C27.5 64.5 29.5 68 30 73 Z') + veinD('M30 72 C24 70 17 70 12 72')
        + leafD('M30 62 C34 66 44 68 50.5 61.5 C46.5 55 41.5 51.5 36 52.5 C32.5 53.5 30.5 57 30 62 Z') + veinD('M30 61 C36 59 43 59 48 61')
        + leafD('M30 50 C27 52.5 22 52.5 19.5 49 C22 45.5 26.5 45 30 48 Z') + leafD('M30 50 C33 52.5 38 52.5 40.5 49 C38 45.5 33.5 45 30 48 Z'),
      4: stemD('M30 87 C30 72 30.5 54 30 38', 4.6)
        + leafD('M30 74 C26 78 15 80 8.5 73.5 C12.5 67 17.5 63.5 23.5 64.5 C27.5 65.5 29.5 69 30 74 Z') + veinD('M30 73 C24 71 16 71 11 73')
        + leafD('M30 62 C34 66 45 68 51.5 61.5 C47.5 55 42.5 51.5 36.5 52.5 C32.5 53.5 30.5 57 30 62 Z') + veinD('M30 61 C36 59 44 59 49 61'),
    },
    starflower: {
      2: stemD('M30 86 C30 80 30.5 75 30 70', 2.2)
        + leafD('M30 74 C26 72 22.5 67.5 21.5 62 C25 65 28.5 69 30 72 Z') + leafD('M30 74 C34 72 37.5 67.5 38.5 62 C35 65 31.5 69 30 72 Z'),
      3: stemD('M30 87 C30 74 30 60 30 46', 2.6)
        + leafD('M30 73 C24 72 18 69 13.5 62.5 C20 65 26 68 30 70.5 Z') + leafD('M30 73 C36 72 42 69 46.5 62.5 C40 65 34 68 30 70.5 Z')
        + leafD('M30 59 C25.5 58 21 55 18.5 49.5 C23 52 27 54.5 30 56.5 Z') + leafD('M30 59 C34.5 58 39 55 41.5 49.5 C37 52 33 54.5 30 56.5 Z'),
      4: stemD('M30 87 C30 72 30 54 30 38', 2.6)
        + leafD('M30 74 C24 73 18 70 13.5 63.5 C20 66 26 69 30 71.5 Z') + leafD('M30 74 C36 73 42 70 46.5 63.5 C40 66 34 69 30 71.5 Z')
        + leafD('M30 61 C25.5 60 21 57 18.5 51.5 C23 54 27 56.5 30 58.5 Z') + leafD('M30 61 C34.5 60 39 57 41.5 51.5 C37 54 33 56.5 30 58.5 Z'),
    },
    pinwheel: {
      2: stemD('M30 86 C30 81 31 77 30 73 C29.3 70 31.6 68.4 33.2 70.2', 2.4)
        + stemD('M30 79 L25 77', 1.6) + `<circle class="plant-leaf" cx="22.5" cy="76" r="4" style="${sLeaf}"/>`
        + stemD('M30.4 75 L35 73', 1.6) + `<circle class="plant-leaf" cx="37.5" cy="72" r="3.6" style="${sLeaf}"/>`,
      3: stemD('M30 87 C33 76 27 64 30 48', 3)
        + stemD('M31 75 L22 72', 1.8) + `<circle class="plant-leaf" cx="18" cy="70.5" r="5.8" style="${sLeaf}"/>` + veinD('M18 70.5 l-3 -3.6 M18 70.5 l-4.2 1.4 M18 70.5 l-.6 4.4 M18 70.5 l3.6 1.4')
        + stemD('M29.6 63 L38 60', 1.8) + `<circle class="plant-leaf" cx="42" cy="59" r="5.2" style="${sLeaf}"/>` + veinD('M42 59 l3 -3.4 M42 59 l3.9 1.4 M42 59 l.4 4.2 M42 59 l-3.4 1.6')
        + stemD('M29.5 54 C26 53.5 24 50 25.5 47.5 C27 45.5 29.5 47 28.4 48.6', 1.3),
      4: stemD('M30 87 C33 74 27 56 30 38', 3)
        + stemD('M31.2 75 L21.5 72', 1.8) + `<circle class="plant-leaf" cx="17" cy="70.5" r="6.2" style="${sLeaf}"/>` + veinD('M17 70.5 l-3.2 -3.8 M17 70.5 l-4.4 1.5 M17 70.5 l-.6 4.6 M17 70.5 l3.8 1.4')
        + stemD('M29.4 62 L38.5 59', 1.8) + `<circle class="plant-leaf" cx="43" cy="58" r="5.6" style="${sLeaf}"/>` + veinD('M43 58 l3.2 -3.6 M43 58 l4.1 1.5 M43 58 l.4 4.4 M43 58 l-3.6 1.7'),
    },
    bellflower: {
      2: stemD('M30 86 C30 80 30 75 30 71 C30 67.5 33.5 66.8 34.6 69.6', 2.4)
        + leafD('M29.5 86 C25 82 23.5 76 25 70.5 C27.5 75 29.5 80 30.5 85 Z'),
      3: stemD('M30 87 C30 72 26 58 26 47 C26 41.5 31.5 39.5 33.5 44', 2.6)
        + leafD('M29.5 86 C21 81 17.5 70 20 57 C25 66 29 76 31 85 Z') + leafD('M30.5 86 C38 82 42 74 40.5 63 C36.5 71 32.5 78 29.5 85 Z'),
      4: stemD('M30 87 C29 66 19 44 20 27 C19 8 45 3 51 25', 2.6)
        + leafD('M29.5 86 C20 81 15.5 69 18 54 C24 64 28.5 75 31 85 Z') + leafD('M30.5 86 C39 82 44 72 42.5 60 C38 69 33 78 29.5 85 Z'),
    },
  };

  // ---- Per-species heads: stage 4 bud (bud-tips) and stage 5 bloom -------
  const tulipPetal = (W, H) => `M0 0 C${r2(-W * 1.25)} ${r2(-H * 0.12)} ${r2(-W * 1.15)} ${r2(-H * 0.78)} 0 ${-H} C${r2(W * 1.15)} ${r2(-H * 0.78)} ${r2(W * 1.25)} ${r2(-H * 0.12)} 0 0 Z`;
  function tulipFan(cls, fills, { A, W, H, px = 30, py = 40 }) {
    const P = fills.length;
    const items = fills.map((fill, i) => ({ fill, angle: P > 1 ? -A + (2 * A * i) / (P - 1) : 0 }));
    return items.slice().sort((a, b) => Math.abs(b.angle) - Math.abs(a.angle))
      .map((p) => `<path class="${cls}" d="${tulipPetal(W, H)}" fill="${p.fill}" transform="translate(${px} ${py}) rotate(${r2(p.angle)})"/>`).join('');
  }
  function tulipHead(stage, colors) {
    if (stage === 4) {
      const tips = budColors(colors);
      const fan = tulipFan('bud-tip', tips, { A: tips.length === 3 ? 8 : 5, W: 4.3, H: 21 });
      return `<g ${OUTLINE}>${fan}</g>` + `<path d="M23.4 33.5 C23.8 38.6 26.4 41.2 30 41.2 C33.6 41.2 36.2 38.6 36.6 33.5 C34.6 35.6 32.4 36.6 30 36.6 C27.6 36.6 25.4 35.6 23.4 33.5 Z" style="${sLeaf}"/>`;
    }
    const n = colors.length;
    let body;
    if (n <= 7) {
      const P = n <= 2 ? 3 : n;
      const fills = Array.from({ length: P }, (_, i) => at(colors, i));
      body = tulipFan('petal', fills, { A: P <= 3 ? 20 : Math.min(34, 8.5 * (P - 1)), W: P <= 3 ? 7.5 : P <= 5 ? 6.3 : 5.4, H: 24 });
    } else {
      const back = Math.ceil(n / 2);
      body = tulipFan('petal', colors.slice(0, back), { A: 36, W: 5.4, H: 25.5 })
        + tulipFan('petal', colors.slice(back), { A: 20, W: 5.8, H: 19, py: 41 });
    }
    return `<g ${OUTLINE}>${body}</g>`;
  }

  const lens = (r0, r1, w) => `M0 ${-r0} C${r2(w)} ${r2(-r0 - 3)} ${r2(w * 0.9)} ${r2(-r1 + 4)} 0 ${-r1} C${r2(-w * 0.9)} ${r2(-r1 + 4)} ${r2(-w)} ${r2(-r0 - 3)} 0 ${-r0} Z`;
  function ring(cls, fills, { r0, r1, w, offset = 0, cx = 30, cy = 25 }) {
    const K = fills.length;
    const d = lens(r0, r1, w);
    return fills.map((fill, i) => `<path class="${cls}" d="${d}" fill="${fill}" transform="translate(${cx} ${cy}) rotate(${r2(offset + (360 * i) / K)})"/>`).join('');
  }
  function sunDisc(r) {
    let dots = '';
    for (let i = 1; i <= 16; i++) {
      const rr = (r - 2) * Math.sqrt(i / 16), a = i * 137.5;
      dots += `<circle cx="${r2(30 + rr * Math.sin(rad(a)))}" cy="${r2(25 - rr * Math.cos(rad(a)))}" r=".85"/>`;
    }
    return `<circle class="plant-heart" cx="30" cy="25" r="${r}" style="${sSoilDark}"/>`
      + `<g fill="${CREAM}" opacity=".6" stroke="none">${dots}</g>`;
  }
  function sunflowerHead(stage, colors) {
    if (stage === 4) {
      const tips = budColors(colors);
      const angles = tips.length === 3 ? [-30, 30, 0] : [-17, 17];
      const tipEls = tips.map((fill, i) => `<path class="bud-tip" d="${lens(4, 16.5, 3.1)}" fill="${fill}" transform="translate(30 26) rotate(${angles[i]})"/>`).join('');
      let bracts = '';
      for (let i = 0; i < 11; i++) bracts += `<path d="M0 -7 L2.4 -7.6 L0 -11.8 L-2.4 -7.6 Z" transform="translate(30 26) rotate(${r2(16 + (360 * i) / 11)})"/>`;
      return `<g ${OUTLINE}>${tipEls}</g><g style="${sLeaf}">${bracts}</g>`
        + `<circle cx="30" cy="26" r="8.4" style="${sLeaf}" stroke="#1F3A2E" stroke-opacity=".18"/>`
        + `<path d="M25.5 23 L34.5 29 M25.5 29 L34.5 23 M30 20 V32" style="${sVine}" stroke-width=".8" opacity=".55"/>`;
    }
    const n = colors.length;
    let petals;
    if (n <= 8) {
      const K = n <= 4 ? 12 : 2 * n;
      const fills = Array.from({ length: K }, (_, i) => at(colors, i));
      petals = ring('petal', fills, { r0: 6.5, r1: 19.5, w: Math.min(3.2, 42 / K) });
    } else {
      const shift = Math.floor(n / 2);
      petals = ring('petal', colors, { r0: 6.5, r1: 20, w: Math.min(3.2, 44 / n) })
        + ring('petal', colors.map((_, i) => at(colors, i + shift)), { r0: 6.5, r1: 16.5, w: Math.min(3.1, 42 / n), offset: 180 / n });
    }
    return `<g ${OUTLINE}>${petals}${sunDisc(n >= 9 ? 8.2 : 8.8)}</g>`;
  }

  const ray = (L, w, r0 = 2.5) => `M0 ${-r0} C${w} -7 ${r2(w * 0.8)} ${r2(-L * 0.6)} 0 ${-L} C${r2(-w * 0.8)} ${r2(-L * 0.6)} ${-w} -7 0 ${-r0} Z`;
  function starflowerHead(stage, colors) {
    if (stage === 4) {
      const tips = budColors(colors);
      const angles = tips.length === 3 ? [-9, 9, 0] : [-6, 6];
      const tipEls = tips.map((fill, i) => `<path class="bud-tip" d="${ray(19, 2.3, 0)}" fill="${fill}" transform="translate(30 38) rotate(${angles[i]})"/>`).join('');
      let calyx = '';
      [-64, -32, 0, 32, 64].forEach((a) => { calyx += `<path d="M0 0 C1.6 -2 1.3 -4.6 0 -6.8 C-1.3 -4.6 -1.6 -2 0 0 Z" transform="translate(30 38.5) rotate(${a})"/>`; });
      return `<g ${OUTLINE}>${tipEls}</g><g style="${sLeaf}">${calyx}</g>`;
    }
    const n = colors.length;
    const O = n >= 13 ? 7 : 6;
    const outer = Array.from({ length: O }, (_, i) => at(colors, i));
    const inner = n > O ? Array.from({ length: O }, (_, i) => at(colors, O + i)) : [];
    const ringOf = (fills, L, w, off) => fills.map((fill, i) =>
      `<path class="petal" d="${ray(L, w)}" fill="${fill}" transform="translate(30 26) rotate(${r2(off + (360 * i) / fills.length)})"/>`).join('');
    let stamens = '';
    for (let i = 0; i < 6; i++) {
      const a = rad(30 + 60 * i), x = r2(30 + 4.6 * Math.sin(a)), y = r2(26 - 4.6 * Math.cos(a));
      stamens += `<path d="M30 26 L${x} ${y}" stroke="#1F3A2E" stroke-opacity=".45" stroke-width=".7"/><circle cx="${x}" cy="${y}" r="1" fill="${CREAM}" stroke="#1F3A2E" stroke-opacity=".35" stroke-width=".5"/>`;
    }
    return `<g ${OUTLINE}>${ringOf(inner, 13.5, 2, 180 / O)}${ringOf(outer, 20.5, 2.7, 0)}`
      + `<circle class="plant-heart" cx="30" cy="26" r="3.3" fill="${CREAM}" stroke-opacity=".3"/></g>${stamens}`;
  }

  const blade = (k) => `M0 -2.5 C${r2(-3.6 * k)} -7 ${r2(-3 * k)} -15 ${r2(3 * k)} -18.5 C${r2(7 * k)} -20.8 ${r2(12 * k)} -19.5 ${r2(13.5 * k)} -15.5 C${r2(10.5 * k)} -17 ${r2(7.5 * k)} -16 ${r2(5.5 * k)} -13 C${r2(4 * k)} -10.5 ${r2(2.5 * k)} -6 0 -2.5 Z`;
  function pinwheelHead(stage, colors) {
    if (stage === 4) {
      const tips = budColors(colors);
      const angles = tips.length === 3 ? [-10, 10, 0] : [-6, 6];
      const d = 'M0 0 C-4 -4 -4.6 -11 -1.2 -16 C.8 -19 3 -20.6 4.6 -21 C2.6 -17.4 2.6 -11 4 -6 C4.6 -3 2.6 -1 0 0 Z';
      const tipEls = tips.map((fill, i) => `<path class="bud-tip" d="${d}" fill="${fill}" transform="translate(30 40) rotate(${angles[i]})"/>`).join('');
      return `<g ${OUTLINE}>${tipEls}</g>`
        + `<circle cx="26.6" cy="39.4" r="3.2" style="${sLeaf}"/><circle cx="33.4" cy="39.4" r="3.2" style="${sLeaf}"/>`;
    }
    const layout = petalLayout(colors.length);
    const petals = layout.map((p) => {
      const inner = p.D < 10;
      const k = inner ? 0.9 : Math.min(1, 7 / layout.filter((q) => q.D >= 10).length);
      const s = inner ? 0.62 : 1;
      return `<path class="petal" d="${blade(k)}" fill="${colors[p.color]}" transform="translate(30 26) rotate(${r2(p.angle)}) scale(${s})"/>`;
    }).join('');
    const small = colors.length >= 10;
    return `<g ${OUTLINE}>${petals}<circle class="plant-heart" cx="30" cy="26" r="${small ? 4.4 : 5.4}" fill="${CREAM}" stroke-opacity=".3"/></g>`
      + `<path d="M30 26 C31.4 26 31.5 24.3 30 24.2 C27.9 24.1 27.4 27 29.2 28.4 C31.6 30 34.1 27.5 33.3 24.7" transform="translate(30 26) scale(${small ? 0.8 : 1}) translate(-30 -26)" stroke="#1F3A2E" stroke-opacity=".4" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
  }

  const ARCH = [[20, 27], [19, 8], [45, 3], [51, 25]];
  const onArch = (t) => {
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [0, 1].map((j) => k.reduce((s, kk, i) => s + kk * ARCH[i][j], 0));
  };
  function bellLobes(L, w, h) {
    const tw = w * 0.42;
    const side = (u) => [[u * tw, 0], [u * tw * 1.2, h * 0.5], [u * w * 0.78, h * 0.74], [u * w * 1.06, h]];
    const bumps = L === 1 ? 3 : L === 2 ? 2 : 1;
    return Array.from({ length: L }, (_, i) => {
      const u0 = -1 + (2 * i) / L, u1 = -1 + (2 * (i + 1)) / L;
      const a = side(u0), b = side(u1);
      const p = (q) => `${r2(q[0])} ${r2(q[1])}`;
      let d = `M${p(a[0])} Q${r2(((u0 + u1) / 2) * tw)} ${r2(-tw * 0.7 * (1 - Math.abs(u0 + u1) / 2))} ${p(b[0])}`;
      d += ` C${p(b[1])} ${p(b[2])} ${p(b[3])}`;
      for (let j = 1; j <= bumps; j++) {
        const xa = b[3][0] + ((a[3][0] - b[3][0]) * (j - 1)) / bumps, xb = b[3][0] + ((a[3][0] - b[3][0]) * j) / bumps;
        d += ` Q${r2((xa + xb) / 2)} ${r2(h + 2.6)} ${r2(xb)} ${r2(h)}`;
      }
      return d + ` C${p(a[2])} ${p(a[1])} ${p(a[0])} Z`;
    });
  }
  function bellflowerHead(stage, colors) {
    const pedicel = (x, y, len) => `<path d="M${r2(x)} ${r2(y)} v${len}" style="${sVine}" stroke-width="1.3" stroke-linecap="round"/>`;
    if (stage === 4) {
      const tips = budColors(colors);
      const ts = tips.length === 3 ? [0.36, 0.68, 0.98] : [0.5, 0.96];
      return tips.map((fill, i) => {
        const [x, y] = onArch(ts[i]);
        return pedicel(x, y, 3.4)
          + `<ellipse class="bud-tip" cx="${r2(x)}" cy="${r2(y + 7.6)}" rx="3.7" ry="4.4" fill="${fill}" ${OUTLINE}/>`
          + `<path d="M${r2(x - 2.6)} ${r2(y + 4.4)} Q${r2(x)} ${r2(y + 1.6)} ${r2(x + 2.6)} ${r2(y + 4.4)} Q${r2(x)} ${r2(y + 5.8)} ${r2(x - 2.6)} ${r2(y + 4.4)} Z" style="${sLeaf}"/>`;
      }).join('');
    }
    const n = colors.length;
    const B = n <= 3 ? 3 : Math.min(5, n);
    const L = n <= 5 ? 1 : n <= 10 ? 2 : 3;
    const w = B === 3 ? 6.6 : B === 4 ? 6 : L === 1 ? 5.6 : 6.2;
    const h = B === 3 ? 11.5 : B === 4 ? 10.5 : 10;
    const ts = Array.from({ length: B }, (_, i) => 0.24 + (0.76 * i) / (B - 1));
    const bells = ts.map((t, i) => {
      const [x, y] = onArch(t);
      const drop = B === 5 && i % 2 === 1 ? 6.5 : 0;
      const len = 2.2 + Math.max(0, 14 - y) * 0.35 + drop;
      const lobes = bellLobes(L, w, h).map((d, j) => `<path class="petal" d="${d}" fill="${at(colors, i * L + j)}"/>`).join('');
      return { drop, svg: pedicel(x, y, r2(len)) + `<g transform="translate(${r2(x)} ${r2(y + len)})" ${OUTLINE}>${lobes}</g>` };
    });
    return bells.filter((b) => !b.drop).concat(bells.filter((b) => b.drop)).map((b) => b.svg).join('');
  }

  const HEADS = { tulip: tulipHead, sunflower: sunflowerHead, starflower: starflowerHead, pinwheel: pinwheelHead, bellflower: bellflowerHead };

  // A lone seed, for the seed-drop animation (picker → plot).
  function seed(species) {
    return `<svg viewBox="-9 -10 18 20" xmlns="http://www.w3.org/2000/svg" class="sprite seed" aria-hidden="true" focusable="false">${SEEDS[species] || SEEDS.daisy}</svg>`;
  }

  // ---- Mystery seed packets ----------------------------------------------
  // Crimped paper packets with a "?" seal. Fixed cream paper and ink (like
  // butterfly()), so they read as paper on the day and the night garden
  // alike — var(--card) turns navy at night. No chord colours, no words.
  const PACKET_INK = '#35584A';
  const PACKET_PATTERNS = {
    stripes: () => [20, 31, 42, 53].map((x) => `<rect x="${x}" y="31" width="5.5" height="57" rx="2"/>`).join(''),
    dots: () => {
      let s = '';
      for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) {
        s += `<circle cx="${19 + col * 10.5 + (row % 2) * 5.2}" cy="${35 + row * 10}" r="2.1"/>`;
      }
      return s.replace(/<circle cx="(6[6-9]|7\d)(\.\d)?"[^>]*\/>/g, '');
    },
    swirl: () => [[22, 38], [58, 38], [22, 80], [58, 80], [40, 84], [40, 34]].map(([x, y]) =>
      `<path d="M${x} ${y} c1.6 0 1.7 -2 0 -2.1 c-2.4 -.1 -3 3.2 -.9 4.7 c2.8 1.9 5.6 -1.2 4.6 -4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`).join(''),
    stars: () => [[21, 36, 1], [59, 40, 0.8], [23, 80, 0.85], [57, 82, 1], [40, 35, 0.7], [16.5, 58, 0.6], [63.5, 60, 0.6]].map(([x, y, s]) =>
      `<path d="M0 -5 C.6 -1.2 1.2 -.6 5 0 C1.2 .6 .6 1.2 0 5 C-.6 1.2 -1.2 .6 -5 0 C-1.2 -.6 -.6 -1.2 0 -5 Z" transform="translate(${x} ${y}) scale(${s})"/>`).join(''),
    waves: () => [36, 46, 70, 80].map((y) => `<path d="M16 ${y} q4 -3.6 8 0 t8 0 t8 0 t8 0 t8 0 t8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`).join(''),
    zigzag: () => [36, 46, 70, 80].map((y) => `<path d="M16 ${y + 1.6} l4 -3.2 l4 3.2 l4 -3.2 l4 3.2 l4 -3.2 l4 3.2 l4 -3.2 l4 3.2 l4 -3.2 l4 3.2 l4 -3.2 l4 3.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>`).join(''),
  };
  const PACKET_NAMES = Object.keys(PACKET_PATTERNS);
  function seedPacket(pattern) {
    const draw = PACKET_PATTERNS[pattern] || PACKET_PATTERNS.dots;
    let crimp = 'M12 17';
    for (let x = 12; x < 68; x += 4) crimp += ` L${x + 2} 13.6 L${x + 4} 17`;
    let teeth = '';
    for (let x = 16; x < 66; x += 4) teeth += `M${x} 18.5 v6 `;
    return `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" class="sprite seed-packet" aria-hidden="true" focusable="false" style="color:${PACKET_INK}">`
      + `<ellipse cx="40" cy="95" rx="25" ry="3.2" fill="#1F3A2E" opacity=".16"/>`
      + `<path class="packet-paper" d="${crimp} L68 88 Q68 92.5 63.5 92.5 L16.5 92.5 Q12 92.5 12 88 Z" fill="#FBF3E2"/>`
      + `<path d="${crimp} L68 27 L12 27 Z" fill="#EBD9B6"/>`
      + `<path d="${teeth}" stroke="${PACKET_INK}" stroke-opacity=".22" stroke-width="1"/>`
      + `<path d="M12 27 H68" stroke="${PACKET_INK}" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="2.5 2.5"/>`
      + `<g fill="currentColor" opacity=".2">${draw()}</g>`
      + `<path d="M64 31 V88 Q64 89.5 62.5 89.5" stroke="#fff" stroke-opacity=".7" stroke-width="2" fill="none" stroke-linecap="round"/>`
      + `<path d="${crimp} L68 88 Q68 92.5 63.5 92.5 L16.5 92.5 Q12 92.5 12 88 Z" fill="none" stroke="${PACKET_INK}" stroke-width="2.4" stroke-linejoin="round"/>`
      + `<circle class="packet-seal" cx="40" cy="59" r="13.5" fill="#fff" stroke="${PACKET_INK}" stroke-width="2.4"/>`
      + `<circle cx="40" cy="59" r="10.2" fill="none" stroke="${PACKET_INK}" stroke-opacity=".25" stroke-width="1.2" stroke-dasharray="1.6 2.2"/>`
      + `<path d="M35.6 55 C35.6 50.6 44.4 50.6 44.4 55.2 C44.4 58.6 40 58.4 40 62" fill="none" stroke="${PACKET_INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<circle cx="40" cy="67" r="2.1" fill="${PACKET_INK}"/>`
      + `</svg>`;
  }

  function plant(stage, swatches, opts) {
    const species = typeof opts === 'string' ? opts : (opts && opts.species) || 'daisy';
    const kind = SPECIES.includes(species) ? species : 'daisy';
    const wrap = (body) => `<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg" class="sprite plant" aria-hidden="true" focusable="false">${body}</svg>`;
    if (stage === 'planted') return wrap(plot + seedAt(kind, 30, 80.6));
    const st = Math.max(0, Math.min(5, Math.floor(stage) || 0));
    const colors = Array.isArray(swatches) ? swatches : [];
    if (kind === 'daisy' || st === 0) return daisyPlant(st, colors);
    if (st === 1) return wrap(seedAt(kind, 30, 80) + mound + peek(kind));
    const fol = FOLIAGE[kind];
    if (st <= 3) return wrap(fol[st] + soilTop);
    return wrap(fol[4] + soilTop + HEADS[kind](st, colors.length ? colors : ['#FFFFFF']));
  }

  function daisyPlant(stage, swatches) {
    const st = Math.max(0, Math.min(5, Math.floor(stage) || 0));
    const colors = Array.isArray(swatches) ? swatches : [];
    const soil = `<ellipse class="plant-soil" cx="30" cy="87" rx="13" ry="4.5" style="fill:var(--soil,#9B7650)"/>`;
    const leaf = (d) => `<path class="plant-leaf" d="${d}" style="fill:var(--leaf,#6FA656)"/>`;
    const stem = (d, width) => `<path class="plant-stem" d="${d}" style="stroke:var(--vine,#5E8F46)" stroke-width="${width}" fill="none" stroke-linecap="round"/>`;
    let body;
    if (st === 0) {
      // Not planted yet: just the plot, with a hole waiting for a seed.
      body = `<ellipse class="plant-soil" cx="30" cy="86" rx="15" ry="5.5" style="fill:var(--soil,#9B7650)"/>`
        + `<ellipse cx="30" cy="84.5" rx="5" ry="1.8" style="fill:var(--soil-dark,#7A5B3D)"/>`;
    } else if (st === 1) {
      // Seed drawn first, soil second so it covers the seed's lower half —
      // "just planted" rather than "sitting on top of the ground".
      body = `<ellipse class="plant-seed" cx="30" cy="80" rx="4.2" ry="5.4" fill="#C9A26B"/>`
        + `<ellipse class="plant-soil" cx="30" cy="86" rx="15" ry="6" style="fill:var(--soil,#9B7650)"/>`;
    } else if (st === 2) {
      body = stem('M30 86 C30 81 30 77 30 72', 3)
        + leaf('M30 75 C24 74 20 70 19 66 C24 66 28 69 30 73 Z')
        + leaf('M30 73 C36 72 40 68 41 64 C36 64 32 67 30 71 Z')
        + soil;
    } else if (st === 3) {
      body = stem('M30 87 C30 76 30 64 30 50', 3.5)
        + leaf('M30 76 C21 75 15 69 13 62 C21 62 27 66 30 72 Z')
        + leaf('M30 68 C39 67 45 61 47 54 C39 54 33 58 30 64 Z')
        + leaf('M30 55 C25 54 21 50 20 46 C25 46 28 49 30 52 Z')
        + leaf('M30 53 C35 52 39 48 40 44 C35 44 32 47 30 50 Z')
        + soil;
    } else {
      // Stages 4 and 5 share the same taller stem shape + two upper leaves;
      // only the top of the plant (closed bud vs. open bloom) differs.
      const shared = stem(st === 4 ? 'M30 87 C30 72 31 54 30 38' : 'M30 87 C30 72 31 54 30 36', 3.5)
        + leaf('M30 72 C21 71 15 65 13 58 C21 58 27 62 30 68 Z')
        + leaf('M30 62 C39 61 45 55 47 48 C39 48 33 52 30 58 Z')
        + soil;
      body = st === 4
        ? shared + budTips(colors)
          + `<path d="M21 26 C21 35 25 40 30 40 C35 40 39 35 39 26 C36 29 33 30 30 30 C27 30 24 29 21 26 Z" style="fill:var(--leaf,#6FA656)"/>`
        : shared + bloom(colors);
    }
    return `<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg" class="sprite plant" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  // The reward butterfly of the flower echo game: white wings with a soft ink
  // outline, so it never borrows a chord colour. The wings are separate
  // groups so CSS can flap them (see .bf-wing in styles.css).
  function butterfly() {
    const wing = (cls, d) => `<g class="bf-wing ${cls}"><path d="${d}" fill="#fff" stroke="#35584A" stroke-width="2" stroke-linejoin="round"/></g>`;
    return `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg" class="sprite butterfly" aria-hidden="true" focusable="false">`
      + wing('bf-l', 'M38 28 C30 6 8 2 4 14 C0 26 16 32 38 30 C20 34 10 46 20 54 C28 58 36 44 38 32 Z')
      + wing('bf-r', 'M42 28 C50 6 72 2 76 14 C80 26 64 32 42 30 C60 34 70 46 60 54 C52 58 44 44 42 32 Z')
      + `<ellipse cx="40" cy="31" rx="2.6" ry="13" fill="#35584A"/>`
      + `<path d="M39 19 C37 12 34 9 31 8 M41 19 C43 12 46 9 49 8" fill="none" stroke="#35584A" stroke-width="1.4" stroke-linecap="round"/>`
      + `</svg>`;
  }

  return { mascot, icon, animals, shape, flag, plant, butterfly, seed, seedPacket, SPECIES, PACKET_NAMES };
})();
