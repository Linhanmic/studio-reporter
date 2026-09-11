'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  defaultWindowState,
  normalizeWindowState,
  sanitizeWindowState,
  loadWindowState,
  saveWindowState,
  captureWindowState,
  browserWindowOptionsFromState,
  windowStatePath,
} = require('./window-state.js');

describe('window-state', () => {
  it('defaults match Desktop createWindow baseline', () => {
    const d = defaultWindowState();
    assert.equal(d.width, DEFAULT_WIDTH);
    assert.equal(d.height, DEFAULT_HEIGHT);
    assert.equal(d.isMaximized, false);
    assert.equal(d.x, undefined);
    assert.equal(MIN_WIDTH, 900);
    assert.equal(MIN_HEIGHT, 600);
  });

  it('normalizeWindowState coerces and clamps', () => {
    assert.deepEqual(normalizeWindowState(null).width, DEFAULT_WIDTH);
    const n = normalizeWindowState({
      width: 1100.6,
      height: 700.2,
      x: 10.4,
      y: -20.8,
      isMaximized: 1,
    });
    assert.equal(n.width, 1101);
    assert.equal(n.height, 700);
    assert.equal(n.x, 10);
    assert.equal(n.y, -21);
    assert.equal(n.isMaximized, true);
    const tiny = normalizeWindowState({ width: 100, height: 50 });
    assert.equal(tiny.width, DEFAULT_WIDTH);
    assert.equal(tiny.height, DEFAULT_HEIGHT);
  });

  it('sanitizeWindowState recenters when fully off-screen', () => {
    const areas = [{ x: 0, y: 0, width: 1600, height: 900 }];
    const fixed = sanitizeWindowState(
      { x: -4000, y: -3000, width: 1000, height: 700, isMaximized: true },
      areas
    );
    assert.equal(fixed.isMaximized, false);
    assert.equal(fixed.x, Math.round((1600 - 1000) / 2));
    assert.equal(fixed.y, Math.round((900 - 700) / 2));
  });

  it('sanitizeWindowState keeps on-screen bounds', () => {
    const areas = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ];
    const kept = sanitizeWindowState(
      { x: 2000, y: 100, width: 1100, height: 800, isMaximized: false },
      areas
    );
    assert.equal(kept.x, 2000);
    assert.equal(kept.y, 100);
    assert.equal(kept.isMaximized, false);
  });

  it('load/save round-trip', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-winstate-'));
    const saved = saveWindowState(dir, {
      width: 1400,
      height: 900,
      x: 40,
      y: 50,
      isMaximized: true,
    });
    assert.equal(saved.width, 1400);
    assert.ok(fs.existsSync(windowStatePath(dir)));
    const loaded = loadWindowState(dir);
    assert.deepEqual(loaded, saved);
    assert.deepEqual(loadWindowState(path.join(dir, 'missing')), defaultWindowState());
  });

  it('captureWindowState preserves normal bounds while maximized', () => {
    const prev = { width: 1200, height: 800, x: 12, y: 34, isMaximized: false };
    const maximized = captureWindowState(
      {
        isMaximized: () => true,
        getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
      },
      prev
    );
    assert.equal(maximized.isMaximized, true);
    assert.equal(maximized.width, 1200);
    assert.equal(maximized.x, 12);

    const normal = captureWindowState(
      {
        isMaximized: () => false,
        getBounds: () => ({ x: 88, y: 99, width: 1111, height: 777 }),
      },
      prev
    );
    assert.equal(normal.isMaximized, false);
    assert.equal(normal.width, 1111);
    assert.equal(normal.x, 88);
  });

  it('browserWindowOptionsFromState omits x/y when unset', () => {
    const withoutPos = browserWindowOptionsFromState({
      width: 1280,
      height: 840,
      x: undefined,
      y: undefined,
      isMaximized: false,
    });
    assert.equal(withoutPos.width, 1280);
    assert.equal(withoutPos.minWidth, MIN_WIDTH);
    assert.equal(withoutPos.x, undefined);

    const withPos = browserWindowOptionsFromState({
      width: 1000,
      height: 700,
      x: 15,
      y: 25,
      isMaximized: false,
    });
    assert.equal(withPos.x, 15);
    assert.equal(withPos.y, 25);
  });
});
