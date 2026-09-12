'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  candidatePluginsRoots,
  detectInstalledPlugin,
  evaluateInstall,
} = require('./plugin-detect.js');
const { MIN_PLUGIN_VERSION } = require('./compat.js');

describe('plugin-detect', () => {
  /** @type {string} */
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-plugin-detect-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('candidatePluginsRoots prefers GAUGE_HOME then ~/.gauge', () => {
    const roots = candidatePluginsRoots({
      homedir: '/home/u',
      env: { GAUGE_HOME: '/opt/gauge' },
      platform: 'linux',
    });
    assert.equal(roots[0], path.join('/opt/gauge', 'plugins'));
    assert.ok(roots.includes(path.join('/home/u', '.gauge', 'plugins')));
  });

  it('detectInstalledPlugin finds highest version', () => {
    const root = path.join(tmp, 'plugins');
    for (const ver of ['0.4.0', '0.5.2', '0.5.0']) {
      const dir = path.join(root, 'studio-reporter', ver);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'plugin.json'),
        JSON.stringify({ id: 'studio-reporter', version: ver })
      );
    }
    const hit = detectInstalledPlugin({ pluginsRoot: root });
    assert.equal(hit.found, true);
    assert.equal(hit.version, '0.5.2');
    assert.equal(hit.ok, true);
    assert.equal(hit.level, 'ok');
    assert.deepEqual(hit.versions, ['0.5.2', '0.5.0', '0.4.0']);
  });

  it('detectInstalledPlugin reports missing', () => {
    const hit = detectInstalledPlugin({ pluginsRoot: path.join(tmp, 'empty') });
    assert.equal(hit.found, false);
    assert.equal(hit.ok, false);
    assert.equal(hit.level, 'error');
  });

  it('evaluateInstall warns on old install', () => {
    const ev = evaluateInstall({ found: true, version: '0.4.9' }, MIN_PLUGIN_VERSION);
    assert.equal(ev.ok, false);
    assert.equal(ev.level, 'warn');
  });

  it('falls back to dirname when plugin.json missing', () => {
    const root = path.join(tmp, 'plugins');
    const dir = path.join(root, 'studio-reporter', '0.5.1');
    fs.mkdirSync(dir, { recursive: true });
    const hit = detectInstalledPlugin({ pluginsRoot: root });
    assert.equal(hit.version, '0.5.1');
    assert.equal(hit.ok, true);
  });
});
