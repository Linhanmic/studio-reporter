'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdater } = require('./updater.js');

function fakeAutoUpdater() {
  const ee = new EventEmitter();
  ee.autoDownload = true;
  ee.checkForUpdates = async () => {
    ee.emit('checking-for-update');
    ee.emit('update-not-available', { version: '0.5.2' });
    return { updateInfo: { version: '0.5.2' } };
  };
  ee.quitAndInstall = () => {};
  return ee;
}

describe('updater', () => {
  it('skips check when not packaged', async () => {
    const u = createUpdater({ isPackaged: false });
    const status = await u.checkForUpdates();
    assert.equal(status.state, 'skipped');
  });

  it('reports current when packaged and no update', async () => {
    const fake = fakeAutoUpdater();
    const u = createUpdater({
      isPackaged: true,
      autoUpdater: fake,
      autoDownload: false,
    });
    const status = await u.checkForUpdates();
    assert.equal(status.state, 'current');
    assert.match(status.message, /最新/);
  });

  it('reports available update', async () => {
    const ee = new EventEmitter();
    ee.checkForUpdates = async () => {
      ee.emit('update-available', { version: '0.6.0' });
      return { updateInfo: { version: '0.6.0' } };
    };
    const u = createUpdater({ isPackaged: true, autoUpdater: ee });
    await u.checkForUpdates();
    assert.equal(u.getStatus().state, 'available');
    assert.equal(u.getStatus().version, '0.6.0');
  });

  it('surfaces check errors', async () => {
    const ee = new EventEmitter();
    ee.checkForUpdates = async () => {
      throw new Error('network down');
    };
    const u = createUpdater({
      isPackaged: true,
      autoUpdater: ee,
      logger: { warn() {} },
    });
    const status = await u.checkForUpdates();
    assert.equal(status.state, 'error');
    assert.match(status.message, /network down/);
  });

  it('reports download progress and ready, then quitAndInstall', async () => {
    const ee = new EventEmitter();
    let installed = false;
    ee.checkForUpdates = async () => {
      ee.emit('update-available', { version: '0.6.1' });
      ee.emit('download-progress', { percent: 41.2 });
      ee.emit('update-downloaded', { version: '0.6.1' });
      return { updateInfo: { version: '0.6.1' } };
    };
    ee.quitAndInstall = () => {
      installed = true;
    };
    const seen = [];
    const u = createUpdater({ isPackaged: true, autoUpdater: ee, autoDownload: true });
    u.setStatusListener((s) => seen.push(s.state));
    await u.checkForUpdates();
    assert.equal(u.getStatus().state, 'ready');
    assert.equal(u.getStatus().version, '0.6.1');
    assert.ok(seen.includes('available') || seen.includes('downloading') || seen.includes('ready'));
    await u.quitAndInstall();
    assert.equal(installed, true);
  });

  it('skips quitAndInstall when not packaged', async () => {
    const u = createUpdater({ isPackaged: false });
    const status = await u.quitAndInstall();
    assert.equal(status.state, 'skipped');
  });

});
