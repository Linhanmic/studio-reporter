'use strict';

/**
 * Verify repo artifacts that electron-builder copies via extraResources.
 * Run from desktop/: node scripts/prepare-pack-resources.js
 */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const required = [
  path.join(repoRoot, 'viewer.html'),
  path.join(repoRoot, 'report-assets', 'report-app.js'),
];

const binUnix = path.join(repoRoot, 'bin', 'studio-reporter');
const binWin = path.join(repoRoot, 'bin', 'studio-reporter.exe');
const hasBin = fs.existsSync(binUnix) || fs.existsSync(binWin);

const missing = required.filter((p) => !fs.existsSync(p));
if (!hasBin) {
  missing.push(binUnix + ' (or .exe) — run: make build');
}

if (missing.length) {
  console.error('Desktop pack prerequisites missing:');
  for (const m of missing) console.error('  -', m);
  process.exit(1);
}

console.log('Pack resources OK:');
console.log('  viewer.html + report-assets/');
console.log('  bin/studio-reporter' + (fs.existsSync(binWin) ? '.exe' : ''));
