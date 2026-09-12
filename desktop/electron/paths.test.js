'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  resolveBundleRoot,
  resolveStudioReporterBin,
  missingBundleResources,
} = require('./paths.js');

describe('paths', () => {
  it('resolveBundleRoot uses repo parent in development', () => {
    const desktopDir = path.join('/tmp', 'repo', 'desktop');
    assert.equal(
      resolveBundleRoot(false, '/unused', desktopDir),
      path.resolve('/tmp/repo')
    );
  });

  it('resolveBundleRoot uses resourcesPath when packaged', () => {
    assert.equal(
      resolveBundleRoot(true, '/opt/Studio Reporter/resources', '/ignored'),
      path.resolve('/opt/Studio Reporter/resources')
    );
  });

  it('resolveStudioReporterBin prefers bundle bin/', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-bin-'));
    try {
      fs.mkdirSync(path.join(dir, 'bin'));
      const bin = path.join(dir, 'bin', 'studio-reporter');
      fs.writeFileSync(bin, 'x');
      assert.equal(resolveStudioReporterBin(dir), bin);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('missingBundleResources lists absent viewer assets', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-miss-'));
    try {
      const missing = missingBundleResources(dir);
      assert.ok(missing.includes('viewer.html'));
      assert.ok(missing.some((m) => m.includes('report-app.js')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
