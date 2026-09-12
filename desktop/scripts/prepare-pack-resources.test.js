'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkPackResources, parseArgs } = require('./prepare-pack-resources.js');

function touch(file, contents = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function fixtureRoot({ unix = false, win = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-packres-'));
  touch(path.join(root, 'viewer.html'), '<html></html>');
  touch(path.join(root, 'report-assets', 'report-app.js'), '/* */');
  if (unix) touch(path.join(root, 'bin', 'studio-reporter'), '#!/bin/sh\n');
  if (win) touch(path.join(root, 'bin', 'studio-reporter.exe'), 'MZ');
  if (unix) fs.chmodSync(path.join(root, 'bin', 'studio-reporter'), 0o755);
  return root;
}

describe('prepare-pack-resources', () => {
  it('parseArgs recognizes --win and --platform', () => {
    assert.deepEqual(parseArgs(['node', 'x', '--win']), { requireWin: true, requireUnix: false });
    assert.deepEqual(parseArgs(['node', 'x', '--platform=linux']), {
      requireWin: false,
      requireUnix: true,
    });
    assert.deepEqual(parseArgs(['node', 'x']), { requireWin: false, requireUnix: false });
    assert.deepEqual(parseArgs(['node', 'x'], { SR_PACK_PLATFORM: 'win' }), {
      requireWin: true,
      requireUnix: false,
    });
  });

  it('accepts either unix or windows CLI by default', () => {
    const unixRoot = fixtureRoot({ unix: true });
    assert.equal(checkPackResources({ repoRoot: unixRoot }).ok, true);

    const winRoot = fixtureRoot({ win: true });
    const win = checkPackResources({ repoRoot: winRoot });
    assert.equal(win.ok, true);
    assert.equal(win.hasWin, true);
  });

  it('requireWin demands studio-reporter.exe', () => {
    const unixOnly = fixtureRoot({ unix: true });
    const result = checkPackResources({ repoRoot: unixOnly, requireWin: true });
    assert.equal(result.ok, false);
    assert.ok(result.missing.some((m) => m.includes('studio-reporter.exe')));

    const both = fixtureRoot({ unix: true, win: true });
    assert.equal(checkPackResources({ repoRoot: both, requireWin: true }).ok, true);
  });

  it('reports missing viewer/report-assets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-packres-empty-'));
    const result = checkPackResources({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.ok(result.missing.some((m) => m.includes('viewer.html')));
  });
});
