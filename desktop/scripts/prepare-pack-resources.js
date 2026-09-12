'use strict';

/**
 * Verify (and optionally describe) repo artifacts that electron-builder copies
 * via extraResources.
 *
 * Usage:
 *   node scripts/prepare-pack-resources.js
 *   node scripts/prepare-pack-resources.js --win
 *   node scripts/prepare-pack-resources.js --platform=win
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {{ repoRoot: string, requireWin?: boolean, requireUnix?: boolean }} opts
 * @returns {{ ok: boolean, missing: string[], binLabel: string, hasUnix: boolean, hasWin: boolean }}
 */
function checkPackResources(opts) {
  const repoRoot = opts.repoRoot;
  const requireWin = Boolean(opts.requireWin);
  const requireUnix = Boolean(opts.requireUnix);
  const required = [
    path.join(repoRoot, 'viewer.html'),
    path.join(repoRoot, 'report-assets', 'report-app.js'),
  ];
  const binUnix = path.join(repoRoot, 'bin', 'studio-reporter');
  const binWin = path.join(repoRoot, 'bin', 'studio-reporter.exe');
  const hasUnix = fs.existsSync(binUnix);
  const hasWin = fs.existsSync(binWin);

  const missing = required.filter((p) => !fs.existsSync(p));
  if (requireWin && !hasWin) {
    missing.push(`${binWin} — run: make build-windows`);
  }
  if (requireUnix && !hasUnix) {
    missing.push(`${binUnix} — run: make build`);
  }
  if (!requireWin && !requireUnix && !hasUnix && !hasWin) {
    missing.push(`${binUnix} (or .exe) — run: make build`);
  }

  let binLabel = '';
  if (hasUnix && hasWin) binLabel = 'bin/studio-reporter + .exe';
  else if (hasWin) binLabel = 'bin/studio-reporter.exe';
  else if (hasUnix) binLabel = 'bin/studio-reporter';

  return { ok: missing.length === 0, missing, binLabel, hasUnix, hasWin };
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 */
function parseArgs(argv, env = process.env) {
  const args = argv.slice(2);
  let platform = '';
  for (const a of args) {
    if (a === '--win' || a === '--windows') platform = 'win';
    else if (a === '--unix' || a === '--linux' || a === '--mac') platform = 'unix';
    else if (a.startsWith('--platform=')) platform = a.slice('--platform='.length).toLowerCase();
  }
  if (!platform && env.SR_PACK_PLATFORM) {
    platform = String(env.SR_PACK_PLATFORM).toLowerCase();
  }
  return {
    requireWin: platform === 'win' || platform === 'windows',
    requireUnix: platform === 'unix' || platform === 'linux' || platform === 'mac' || platform === 'darwin',
  };
}

function main(argv = process.argv) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const flags = parseArgs(argv);
  const result = checkPackResources({ repoRoot, ...flags });
  if (!result.ok) {
    console.error('Desktop pack prerequisites missing:');
    for (const m of result.missing) console.error(`  - ${m}`);
    process.exitCode = 1;
    return result;
  }
  console.log('Pack resources OK:');
  console.log('  viewer.html + report-assets/');
  console.log(`  ${result.binLabel}`);
  return result;
}

if (require.main === module) {
  main();
}

module.exports = {
  checkPackResources,
  parseArgs,
  main,
};
