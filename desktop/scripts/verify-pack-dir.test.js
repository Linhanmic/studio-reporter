'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  findUnpackedAppDir,
  resolveResourcesDir,
  verifyUnpackedDesktop,
  verifyPackDist,
} = require('./verify-pack-dir.js');

function writeExec(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\necho ok\n', { mode: 0o755 });
}

describe('verify-pack-dir', () => {
  it('findUnpackedAppDir prefers linux-unpacked', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-dist-'));
    fs.mkdirSync(path.join(dist, 'linux-unpacked'));
    fs.mkdirSync(path.join(dist, 'win-unpacked'));
    assert.equal(findUnpackedAppDir(dist), path.join(dist, 'linux-unpacked'));
    assert.equal(findUnpackedAppDir(path.join(dist, 'missing')), null);
  });

  it('resolveResourcesDir supports linux and mac layouts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-unpacked-'));
    fs.mkdirSync(path.join(root, 'resources'));
    assert.equal(resolveResourcesDir(root), path.join(root, 'resources'));

    const mac = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-macapp-'));
    fs.mkdirSync(path.join(mac, 'Contents', 'Resources'), { recursive: true });
    assert.equal(resolveResourcesDir(mac), path.join(mac, 'Contents', 'Resources'));
  });

  it('verifyUnpackedDesktop passes a complete linux-unpacked fixture', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-ok-'));
    const resources = path.join(root, 'resources');
    const app = path.join(resources, 'app');
    fs.mkdirSync(path.join(app, 'electron'), { recursive: true });
    fs.writeFileSync(path.join(app, 'package.json'), '{"name":"x"}');
    fs.writeFileSync(path.join(app, 'electron', 'main.js'), "'use strict';");
    fs.writeFileSync(path.join(resources, 'viewer.html'), '<html></html>');
    fs.mkdirSync(path.join(resources, 'report-assets'), { recursive: true });
    fs.writeFileSync(path.join(resources, 'report-assets', 'report-app.js'), '/* */');
    writeExec(path.join(resources, 'bin', 'studio-reporter'));

    const result = verifyUnpackedDesktop(root);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.resourcesDir, resources);
  });

  it('verifyUnpackedDesktop reports missing extraResources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-bad-'));
    fs.mkdirSync(path.join(root, 'resources', 'app', 'electron'), { recursive: true });
    fs.writeFileSync(path.join(root, 'resources', 'app', 'package.json'), '{}');
    fs.writeFileSync(path.join(root, 'resources', 'app', 'electron', 'main.js'), '');
    const result = verifyUnpackedDesktop(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('viewer.html')));
    assert.ok(result.errors.some((e) => e.includes('bin/studio-reporter')));
  });

  it('verifyPackDist wires find + verify', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-packdist-'));
    const unpacked = path.join(dist, 'linux-unpacked');
    const resources = path.join(unpacked, 'resources');
    const app = path.join(resources, 'app');
    fs.mkdirSync(path.join(app, 'electron'), { recursive: true });
    fs.writeFileSync(path.join(app, 'package.json'), '{}');
    fs.writeFileSync(path.join(app, 'electron', 'main.js'), '');
    fs.writeFileSync(path.join(resources, 'viewer.html'), '<html></html>');
    fs.mkdirSync(path.join(resources, 'report-assets'), { recursive: true });
    fs.writeFileSync(path.join(resources, 'report-assets', 'report-app.js'), '');
    writeExec(path.join(resources, 'bin', 'studio-reporter'));
    const result = verifyPackDist(dist);
    assert.equal(result.ok, true, result.errors.join('; '));
  });
});
