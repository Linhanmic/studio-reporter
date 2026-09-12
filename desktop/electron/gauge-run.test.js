'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildGaugeArgs,
  resolveGaugeBin,
  validateGaugeProject,
  createDiscoverScanner,
  GaugeRunner,
} = require('./gauge-run.js');

describe('gauge-run', () => {
  it('buildGaugeArgs orders env/tags before specs', () => {
    assert.deepEqual(buildGaugeArgs({}), ['run', 'specs']);
    assert.deepEqual(buildGaugeArgs({ specs: 'specs/login.spec', env: 'ci', tags: 'smoke' }), [
      'run',
      '--env',
      'ci',
      '--tags',
      'smoke',
      'specs/login.spec',
    ]);
  });

  it('resolveGaugeBin falls back to gauge', () => {
    assert.equal(resolveGaugeBin(''), 'gauge');
    assert.equal(resolveGaugeBin('gauge'), 'gauge');
  });

  it('validateGaugeProject checks manifest or specs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-proj-'));
    try {
      assert.match(validateGaugeProject(dir), /不像 Gauge/);
      fs.mkdirSync(path.join(dir, 'specs'));
      assert.equal(validateGaugeProject(dir), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('createDiscoverScanner finds websocket line across chunks', () => {
    const found = [];
    const scanner = createDiscoverScanner((url) => found.push(url));
    scanner.push('boot\nstudio-reporter web');
    scanner.push('socket: ws://127.0.0.1:54321\nmore\n');
    assert.equal(found[0], 'ws://127.0.0.1:54321');
    assert.equal(scanner.found, 'ws://127.0.0.1:54321');
  });

  it('GaugeRunner start/stop with fake spawn', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-run-'));
    fs.mkdirSync(path.join(dir, 'specs'));
    const logs = [];
    let discovered = null;

    class FakeChild extends EventEmitter {
      constructor() {
        super();
        this.pid = 4242;
        this.stdout = new EventEmitter();
        this.stderr = new EventEmitter();
        this.killed = null;
      }
      kill(sig) {
        this.killed = sig;
        this.emit('close', sig === 'SIGTERM' ? null : 1, sig);
      }
    }

    let child;
    const runner = new GaugeRunner({
      spawnImpl: (bin, args, opts) => {
        assert.equal(bin, 'gauge');
        assert.deepEqual(args, ['run', '--env', 'default', 'specs']);
        assert.equal(opts.cwd, path.resolve(dir));
        child = new FakeChild();
        return child;
      },
    });

    const info = runner.start({
      projectDir: dir,
      env: 'default',
      onLog: (t, s) => logs.push([s, t]),
      onDiscover: (url) => {
        discovered = url;
      },
    });
    assert.equal(info.pid, 4242);
    assert.equal(runner.running, true);

    child.stdout.emit('data', Buffer.from('studio-reporter websocket: ws://127.0.0.1:6000\n'));
    assert.equal(discovered, 'ws://127.0.0.1:6000');

    assert.equal(runner.stop(), true);
    assert.equal(child.killed, 'SIGTERM');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
