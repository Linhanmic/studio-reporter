'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  rememberRecentProject,
  GaugeSessionManager,
} = require('./sessions.js');

describe('sessions', () => {
  it('rememberRecentProject dedupes and caps', () => {
    const a = path.resolve('/proj/a');
    const b = path.resolve('/proj/b');
    let list = rememberRecentProject([], a);
    list = rememberRecentProject(list, b);
    list = rememberRecentProject(list, a);
    assert.deepEqual(list.slice(0, 2), [a, b]);
    let many = [];
    for (let i = 0; i < 12; i += 1) {
      many = rememberRecentProject(many, `/p/${i}`);
    }
    assert.equal(many.length, 8);
    assert.equal(many[0], path.resolve('/p/11'));
  });

  it('GaugeSessionManager tracks multiple runs', () => {
    class FakeChild extends EventEmitter {
      constructor() {
        super();
        this.pid = 7;
        this.stdout = new EventEmitter();
        this.stderr = new EventEmitter();
      }
      kill(sig) {
        this.emit('close', 0, sig);
      }
    }
    const mgr = new GaugeSessionManager({
      createRunner: () => {
        const { GaugeRunner } = require('./gauge-run.js');
        return new GaugeRunner({
          spawnImpl: () => new FakeChild(),
        });
      },
    });

    // Bypass validate by stubbing start via fake project check — use runner that doesn't validate?
    // GaugeRunner validates project dir; create temp-less by overriding start through createRunner
    // that returns object with start/stop.
    const mgr2 = new GaugeSessionManager({
      createRunner: () => ({
        start(opts) {
          setImmediate(() => opts.onDiscover && opts.onDiscover('ws://127.0.0.1:1'));
          return { bin: 'gauge', args: ['run', 'specs'], pid: 1 };
        },
        stop() {
          return true;
        },
      }),
    });

    const s1 = mgr2.start({ projectDir: '/tmp/p1', specs: 'specs' });
    const s2 = mgr2.start({ projectDir: '/tmp/p2', specs: 'specs' });
    assert.equal(mgr2.list().length, 2);
    assert.equal(mgr2.active.id, s2.id);
    assert.equal(mgr2.setActive(s1.id).id, s1.id);
    assert.equal(mgr2.stop(s1.id), true);
  });
});
