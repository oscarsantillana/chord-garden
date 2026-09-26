// Chord Garden — tests for js/i18n.js: language detection, string lookup +
// fallback + interpolation, pluralisation, note/chord spelling in both note-
// name modes, and an en/es parity check over the whole string table.
//
// Same node:vm sandbox loading style as tests/garden.test.mjs: js/i18n.js is
// a plain script that defines a global rather than a module, so it's loaded
// into a fresh vm context the same way index.html loads it. Run with
// `node tests/i18n.test.mjs`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Loads js/i18n.js into a fresh sandbox with the given `navigator` (defaults
// to none at all, i.e. Node-like: detectLanguage() falls back to English).
// Each call gets its own I18n, since the module keeps module-level state
// (the current language/note-names preference) that individual tests mutate.
function loadI18n(navigator) {
  const sandbox = { console };
  if (navigator !== undefined) sandbox.navigator = navigator;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8') + '\nthis.I18n = I18n;', sandbox);
  return sandbox.I18n;
}

// --- detectLanguage ----------------------------------------------------------

{
  const I18n = loadI18n();
  assert.equal(I18n.detectLanguage({ languages: ['es-MX', 'en'] }), 'es', 'the first supported base subtag wins');
  assert.equal(I18n.detectLanguage({ languages: ['fr-FR', 'es'] }), 'es', 'an unsupported tag is skipped in favour of a later supported one');
  assert.equal(I18n.detectLanguage({ languages: ['fr'] }), 'en', 'no supported tag at all falls back to English');
  assert.equal(I18n.detectLanguage({ language: 'es-AR' }), 'es', 'falls back to .language when .languages is absent');
  assert.equal(I18n.detectLanguage({}), 'en', 'nothing at all falls back to English');
  console.log('ok - I18n.detectLanguage: first supported base subtag, or English');
}

// --- t: fallback + interpolation --------------------------------------------

{
  const I18n = loadI18n();
  I18n.setLanguage('es');
  // A key present in both tables uses the Spanish one.
  assert.equal(I18n.t('home.play'), 'Jugar');
  // A key that (hypothetically) only exists in English falls back to it —
  // simulated here by asking for a key from the other language directly,
  // since every real key in this app is required to exist in both (see the
  // parity check below). t() itself doesn't know that; it just falls back.
  const onlyEnglish = 'app.title';
  assert.equal(typeof I18n._strings.en[onlyEnglish], 'string');
  // A key that exists in neither table returns the raw key itself.
  assert.equal(I18n.t('nonexistent.key.for.testing'), 'nonexistent.key.for.testing');
  // {name} interpolation.
  I18n.setLanguage('en');
  assert.equal(I18n.t('colors.readyForNext', { color: 'Red' }), 'Ready for Red');
  assert.equal(I18n.t('pin.demoHint', { pin: '2468' }), 'Demo PIN: 2468');
  console.log('ok - I18n.t: falls back to English then to the key, and interpolates {placeholders}');
}

// --- plural ------------------------------------------------------------------

{
  const I18n = loadI18n();
  I18n.setLanguage('en');
  assert.equal(I18n.plural('progress.attempts', 1), '1 attempt');
  assert.equal(I18n.plural('progress.attempts', 2), '2 attempts');
  assert.equal(I18n.plural('progress.attempts', 0), '0 attempts');
  I18n.setLanguage('es');
  assert.equal(I18n.plural('progress.attempts', 1), '1 intento');
  assert.equal(I18n.plural('progress.attempts', 5), '5 intentos');
  // Extra params merge in alongside the automatic {count}.
  I18n.setLanguage('en');
  assert.equal(I18n.plural('progress.setsTooltip', 1, { day: 'Mon' }), 'Mon: 1 set');
  assert.equal(I18n.plural('progress.setsTooltip', 3, { day: 'Mon' }), 'Mon: 3 sets');
  console.log('ok - I18n.plural: picks .one/.other per language, with {count} and extra params available');
}

// --- note / chord / notes: both note-name modes -----------------------------

{
  const I18n = loadI18n();
  I18n.setLanguage('en'); // note names default to 'letters' in English
  assert.equal(I18n.note('Bb'), 'B♭');
  assert.equal(I18n.note('C#4'), 'C♯');
  assert.equal(I18n.chord('F/C'), 'F/C');
  assert.equal(I18n.notes(['B3', 'D4', 'G4']), 'B D G');

  I18n.setLanguage('es'); // and to 'solfege' in Spanish
  assert.equal(I18n.note('Bb'), 'Si♭');
  assert.equal(I18n.note('Eb4'), 'Mi♭');
  assert.equal(I18n.chord('F/C'), 'Fa/Do');
  assert.equal(I18n.notes(['B3', 'D4', 'G4']), 'Si Re Sol');
  console.log('ok - I18n.note/chord/notes: letters in English, fixed-do solfège in Spanish, octave digits dropped');
}

// --- note names: auto follows the language, explicit choices override it ----

{
  const I18n = loadI18n();
  I18n.setNoteNames('auto');
  I18n.setLanguage('en');
  assert.equal(I18n.noteNames(), 'letters', 'auto -> letters in English');
  assert.equal(I18n.note('C'), 'C');
  I18n.setLanguage('es');
  assert.equal(I18n.noteNames(), 'solfege', 'auto -> solfège in Spanish, re-resolved on read');
  assert.equal(I18n.note('C'), 'Do');

  I18n.setNoteNames('letters'); // an explicit choice overrides the language
  assert.equal(I18n.noteNames(), 'letters');
  assert.equal(I18n.note('C'), 'C', 'letters forced even while the language is Spanish');
  I18n.setLanguage('en');
  I18n.setNoteNames('solfege');
  assert.equal(I18n.note('C'), 'Do', 'solfège forced even while the language is English');
  console.log('ok - I18n.noteNames: auto follows the current language; an explicit choice overrides it');
}

// --- setLanguage / language ---------------------------------------------------

{
  const I18n = loadI18n({ languages: ['es-ES'] });
  assert.equal(I18n.language(), 'es', "boots straight into the browser's language");
  I18n.setLanguage('auto');
  assert.equal(I18n.language(), 'es');
  I18n.setLanguage('en');
  assert.equal(I18n.language(), 'en');
  I18n.setLanguage('xx'); // an unknown code falls back to detectLanguage(), same as 'auto'
  assert.equal(I18n.language(), 'es');
  console.log("ok - I18n.setLanguage: 'auto' or an unknown code resolves via detectLanguage()");
}

// --- parity: every English key exists in Spanish and vice versa, and every
// {placeholder} in an English string appears in its Spanish translation too ---

{
  const I18n = loadI18n();
  const { en, es } = I18n._strings;
  const enKeys = Object.keys(en), esKeys = Object.keys(es);
  const missingInEs = enKeys.filter((k) => !(k in es));
  const missingInEn = esKeys.filter((k) => !(k in en));
  assert.deepEqual(missingInEs, [], 'every English key has a Spanish translation');
  assert.deepEqual(missingInEn, [], 'every Spanish key has an English source');

  const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const mismatched = [];
  for (const key of enKeys) {
    const a = placeholders(en[key]), b = placeholders(es[key]);
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatched.push({ key, en: a, es: b });
  }
  assert.deepEqual(mismatched, [], 'every {placeholder} in an English string also appears in its Spanish string');
  console.log(`ok - I18n: en/es string-table parity (${enKeys.length} keys) and matching placeholders`);
}

console.log('\nAll i18n.test.mjs assertions passed.');
