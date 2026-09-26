// Chord Garden — sw.js's CACHE_NAME and js/app.js's APP_VERSION must always
// move together: a browser decides a new sw.js exists by diffing its bytes,
// so the release number has to live there literally (see sw.js's own
// comment) rather than in an imported script — but that means nothing
// besides a test catches the two drifting apart on a release that bumps one
// and forgets the other.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const appJs = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

const cacheMatch = sw.match(/CACHE_NAME\s*=\s*'rainbow-pitch-v([^']+)'/);
const versionMatch = appJs.match(/APP_VERSION\s*=\s*'([^']+)'/);

assert.ok(cacheMatch, "sw.js must define CACHE_NAME as 'rainbow-pitch-v<version>'");
assert.ok(versionMatch, "js/app.js must define APP_VERSION = '<version>'");
assert.match(versionMatch[1], /^\d+\.\d+\.\d+$/, 'APP_VERSION must be MAJOR.MINOR.PATCH');
assert.equal(versionMatch[1], cacheMatch[1],
  `APP_VERSION (${versionMatch[1]}) must equal sw.js's CACHE_NAME version (${cacheMatch[1]})`);

console.log(`ok - sw.js's CACHE_NAME and js/app.js's APP_VERSION agree (v${cacheMatch[1]})`);
