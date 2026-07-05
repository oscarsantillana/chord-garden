/*
 * Rainbow Pitch — hand-drawn SVG sprites.
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

  function mascot(key) {
    return MASCOTS[key] || MASCOTS.fox;
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
    hourglass: svg(`<path d="M7 3 h10 M7 21 h10 M7 3 c0 5 10 6 10 9 c0 3-10 4-10 9 M17 3 c0 5-10 6-10 9 c0 3 10 4 10 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, '0 0 24 24'),
    trophy: svg(`<path d="M7 4 h10 v4 a5 5 0 0 1 -10 0 Z" fill="currentColor"/><path d="M7 5 H4 v2 a3 3 0 0 0 3 3 M17 5 h3 v2 a3 3 0 0 1 -3 3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 13 v4 M9 20 h6 M10 20 a2 3 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`, '0 0 24 24'),
    rainbow: svg(`
      <path d="M8 44 a34 34 0 0 1 68 0" fill="none" stroke="#ff4d6d" stroke-width="7" stroke-linecap="round"/>
      <path d="M17 44 a25 25 0 0 1 50 0" fill="none" stroke="#ff9f1c" stroke-width="7" stroke-linecap="round"/>
      <path d="M26 44 a16 16 0 0 1 32 0" fill="none" stroke="#2ec4b6" stroke-width="7" stroke-linecap="round"/>
      <path d="M35 44 a7 7 0 0 1 14 0" fill="none" stroke="#4361ee" stroke-width="7" stroke-linecap="round"/>`, '0 0 84 50'),
  };

  function icon(name) {
    return ICONS[name] || '';
  }

  return { mascot, icon, animals };
})();
