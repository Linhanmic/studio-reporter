'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HUB_LOCK_FILE, withHubLock } = require('./hublock.js');

describe('hublock', () => {
  it('exports Go-compatible lock basename', () => {
    assert.equal(HUB_LOCK_FILE, '.hub.lock');
  });

  it('withHubLock creates lock file and runs critical section', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-hublock-'));
    let ran = false;
    const out = await withHubLock(dir, async () => {
      ran = true;
      assert.ok(fs.existsSync(path.join(dir, HUB_LOCK_FILE)));
      return 42;
    });
    assert.equal(out, 42);
    assert.equal(ran, true);
  });

  it('withHubLock serializes overlapping callers', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-hublock-serial-'));
    const order = [];
    const slow = withHubLock(dir, async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 40));
      order.push('a-end');
    });
    const fast = withHubLock(dir, async () => {
      order.push('b');
    });
    await Promise.all([slow, fast]);
    assert.deepEqual(order, ['a-start', 'a-end', 'b']);
  });
});
