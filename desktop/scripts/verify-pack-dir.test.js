'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  findMacAppBundle,
  findUnpackedAppDir,
  resolveResourcesDir,
  detectUnpackedPlatform,
  verifyUnpackedDesktop,
  verifyPackDist,
} = require('./verify-pack-dir.js');

function writeExec(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\necho ok\n', { mode: 0o755 });
}

function writeFile(file, contents = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

/** Minimal Electron resources payload shared by linux/mac/win fixtures. */
function seedResources(resources, { binName = 'studio-reporter', executable = true } = {}) {
  const app = path.join(resources, 'app');
  writeFile(path.join(app, 'package.json'), '{"name":"x"}');
  writeFile(path.join(app, 'electron', 'main.js'), "'use strict';");
  writeFile(path.join(resources, 'viewer.html'), '<html></html>');
  writeFile(path.join(resources, 'report-assets', 'report-app.js'), '/* */');
  const bin = path.join(resources, 'bin', binName);
  if (executable && !/\.exe$/i.test(binName)) writeExec(bin);
  else writeFile(bin, 'MZ');
  return resources;
}

describe('verify-pack-dir', () => {
  it('findUnpackedAppDir prefers linux-unpacked', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-dist-'));
    fs.mkdirSync(path.join(dist, 'linux-unpacked'));
    fs.mkdirSync(path.join(dist, 'win-unpacked'));
    assert.equal(findUnpackedAppDir(dist), path.join(dist, 'linux-unpacked'));
    assert.equal(findUnpackedAppDir(path.join(dist, 'missing')), null);
  });

  it('findUnpackedAppDir resolves mac/ to nested .app bundle', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-macdist-'));
    const mac = path.join(dist, 'mac');
    const app = path.join(mac, 'Studio Reporter.app');
    fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
    assert.equal(findMacAppBundle(mac), app);
    assert.equal(findUnpackedAppDir(dist), app);
  });

  it('findUnpackedAppDir resolves mac-arm64 and win-unpacked', () => {
    const macDist = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-macarm-'));
    const app = path.join(macDist, 'mac-arm64', 'Studio Reporter.app');
    fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
    fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
    assert.equal(findUnpackedAppDir(macDist), app);

    const winDist = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-windist-'));
    const win = path.join(winDist, 'win-unpacked');
    fs.mkdirSync(win);
    assert.equal(findUnpackedAppDir(winDist), win);
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
    seedResources(path.join(root, 'resources'));
    const result = verifyUnpackedDesktop(root);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.resourcesDir, path.join(root, 'resources'));
    assert.equal(result.platform, 'linux');
  });

  it('verifyUnpackedDesktop passes a mac .app fixture', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-macok-')) + '.app';
    fs.mkdirSync(app);
    fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
    writeFile(path.join(app, 'Contents', 'MacOS', 'Studio Reporter'), '#!/bin/sh\n');
    seedResources(path.join(app, 'Contents', 'Resources'));
    const result = verifyUnpackedDesktop(app);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.platform, 'mac');
    assert.equal(result.resourcesDir, path.join(app, 'Contents', 'Resources'));
  });

  it('verifyUnpackedDesktop passes a win-unpacked fixture with .exe bin', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-winok-'));
    writeFile(path.join(root, 'Studio Reporter.exe'), 'MZ');
    seedResources(path.join(root, 'resources'), { binName: 'studio-reporter.exe', executable: false });
    const result = verifyUnpackedDesktop(root);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.platform, 'win');
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

  it('verifyUnpackedDesktop flags win-unpacked without app exe', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-winnolaunch-'));
    seedResources(path.join(root, 'resources'), { binName: 'studio-reporter.exe', executable: false });
    // Force win detection via folder naming convention used by electron-builder
    const winRoot = path.join(root, 'win-unpacked');
    fs.mkdirSync(winRoot);
    // move resources under win-unpacked
    fs.renameSync(path.join(root, 'resources'), path.join(winRoot, 'resources'));
    const result = verifyUnpackedDesktop(winRoot);
    assert.equal(result.ok, false);
    assert.equal(result.platform, 'win');
    assert.ok(result.errors.some((e) => /application \.exe/i.test(e)));
  });

  it('verifyPackDist wires find + verify for mac nested .app', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-packmac-'));
    const app = path.join(dist, 'mac', 'Studio Reporter.app');
    fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
    writeFile(path.join(app, 'Contents', 'MacOS', 'Studio Reporter'), '#!/bin/sh\n');
    seedResources(path.join(app, 'Contents', 'Resources'));
    const result = verifyPackDist(dist);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.platform, 'mac');
    assert.equal(detectUnpackedPlatform(result.unpackedRoot), 'mac');
  });

  it('verifyPackDist wires find + verify for linux-unpacked', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-packdist-'));
    const unpacked = path.join(dist, 'linux-unpacked');
    fs.mkdirSync(unpacked);
    seedResources(path.join(unpacked, 'resources'));
    const result = verifyPackDist(dist);
    assert.equal(result.ok, true, result.errors.join('; '));
  });
});
