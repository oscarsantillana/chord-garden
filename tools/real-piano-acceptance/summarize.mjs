#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RealPianoAcceptance = require('../../js/real-piano-acceptance.js');
const paths = process.argv.slice(2);

if (!paths.length) {
  console.error(
    'Usage: node tools/real-piano-acceptance/summarize.mjs <session.json> [...]'
  );
  process.exitCode = 2;
} else {
  try {
    const sessions = paths.map((filePath) =>
      JSON.parse(fs.readFileSync(filePath, 'utf8'))
    );
    const summary = RealPianoAcceptance.summarizeSessions(sessions);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  }
}
