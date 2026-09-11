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
});
