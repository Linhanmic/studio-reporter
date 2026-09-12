'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const {
  buildExportArgs,
  runOneExport,
  exportMany,
  killExportChild,
} = require('./export-report.js');

function fakeChild({ code = 0, signal = null, stdout = 'ok\n', stderr = '', emitError = null } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (sig) => {
    child._killed = sig;
    queueMicrotask(() => child.emit('close', null, sig || 'SIGTERM'));
    return true;
  };
  queueMicrotask(() => {
    if (emitError) {
      child.emit('error', emitError);
      return;
    }
    if (stdout) child.stdout.emit('data', stdout);
    if (stderr) child.stderr.emit('data', stderr);
    child.emit('close', code, signal);
  });
  return child;
}

describe('export-report', () => {
  it('buildExportArgs adds pdf/single flags', () => {
    assert.deepEqual(buildExportArgs('pdf', '/r/a.uhilreport', '/r'), [
      'generate',
      '--input',
      '/r/a.uhilreport',
      '--out',
      '/r',
      '--pdf',
    ]);
    assert.ok(buildExportArgs('single', '/r/a.uhilreport').includes('--single'));
    assert.ok(!buildExportArgs('html', '/r/a.uhilreport').includes('--pdf'));
  });

  it('runOneExport resolves on exit 0', async () => {
    const result = await runOneExport({
      bin: '/bin/studio-reporter',
      kind: 'pdf',
      input: '/tmp/run.uhilreport',
      spawnImpl: () => fakeChild({ code: 0, stdout: 'done' }),
    });
    assert.equal(result.out, '/tmp');
    assert.equal(result.log, 'done');
  });

  it('runOneExport rejects on non-zero and marks cancel on signal', async () => {
    await assert.rejects(
      () =>
        runOneExport({
          bin: '/bin/studio-reporter',
          kind: 'single',
          input: '/tmp/run.uhilreport',
          spawnImpl: () => fakeChild({ code: 2, stderr: 'boom' }),
        }),
      /boom/,
    );

    try {
      await runOneExport({
        bin: '/bin/studio-reporter',
        kind: 'pdf',
        input: '/tmp/run.uhilreport',
        spawnImpl: () => fakeChild({ code: null, signal: 'SIGTERM' }),
      });
      assert.fail('expected reject');
    } catch (err) {
      assert.equal(err.cancelled, true);
    }
  });

  it('exportMany reports progress and stops on cancel', async () => {
    const progress = [];
    let cancelAfter = 1;
    const result = await exportMany({
      bin: '/bin/studio-reporter',
      kind: 'pdf',
      inputs: ['/a.uhilreport', '/b.uhilreport', '/c.uhilreport'],
      onProgress: (p) => progress.push(p.current),
      isCancelled: () => {
        cancelAfter -= 1;
        return cancelAfter < 0;
      },
      spawnImpl: () => fakeChild({ code: 0 }),
    });
    assert.equal(result.cancelled, true);
    assert.equal(result.exported.length, 1);
    assert.deepEqual(progress, [1]);
  });

  it('killExportChild sends SIGTERM then SIGKILL', () => {
    const kills = [];
    const timers = [];
    const child = { kill() {} };
    const ok = killExportChild(child, {
      kill: (_c, sig) => {
        kills.push(sig);
      },
      setTimeoutImpl: (fn) => {
        timers.push(fn);
      },
    });
    assert.equal(ok, true);
    assert.deepEqual(kills, ['SIGTERM']);
    timers[0]();
    assert.deepEqual(kills, ['SIGTERM', 'SIGKILL']);
  });
});
