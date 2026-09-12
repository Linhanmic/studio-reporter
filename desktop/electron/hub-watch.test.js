'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHubWatcher } = require('./hub-watch.js');

describe('hub-watch', () => {
  /** @type {string} */
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-watch-'));
    fs.writeFileSync(path.join(tmp, 'history.json'), JSON.stringify({ formatVersion: 1, runs: [] }));
    fs.mkdirSync(path.join(tmp, 'archives'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('setHub no-ops on empty and missing dirs', () => {
    const events = [];
    const w = createHubWatcher({ onChange: (e) => events.push(e), debounceMs: 0 });
    assert.equal(w.setHub(''), false);
    assert.equal(w.isWatching(), false);
    assert.equal(w.setHub(path.join(tmp, 'nope')), false);
    assert.equal(events.length, 0);
    w.stop();
  });

  it('debounces fs events into a single onChange', async () => {
    const events = [];
    /** @type {Array<(e: string, f: string) => void>} */
    const listeners = [];
    const fakeWatch = (_target, _opts, listener) => {
      listeners.push(listener);
      return {
        close() {},
        on() {
          return this;
        },
      };
    };
    const w = createHubWatcher({
      onChange: (e) => events.push(e),
      debounceMs: 40,
      watch: fakeWatch,
      existsSync: (p) => fs.existsSync(p),
    });
    assert.equal(w.setHub(tmp), true);
    assert.ok(listeners.length >= 1);
    listeners[0]('change', 'history.json');
    listeners[0]('change', 'history.json');
    listeners[0]('rename', 'archives');
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(events.length, 1);
    assert.equal(events[0].hubDir, path.resolve(tmp));
    w.stop();
    assert.equal(w.isWatching(), false);
  });

  it('ignores unrelated files in hub root watch', async () => {
    const events = [];
    /** @type {(e: string, f: string) => void} */
    let rootListener = () => {};
    const fakeWatch = (target, _opts, listener) => {
      if (target === path.resolve(tmp)) rootListener = listener;
      return { close() {}, on() { return this; } };
    };
    const w = createHubWatcher({
      onChange: (e) => events.push(e),
      debounceMs: 20,
      watch: fakeWatch,
      existsSync: (p) => fs.existsSync(p),
    });
    w.setHub(tmp);
    rootListener('change', 'index.html');
    rootListener('change', 'noise.bin');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(events.length, 0);
    rootListener('change', 'history.json');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(events.length, 1);
    w.stop();
  });
});
