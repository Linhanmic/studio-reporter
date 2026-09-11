'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** Same basename as Go report.HubLockFileName — flock-compatible with plugin/CLI. */
const HUB_LOCK_FILE = '.hub.lock';

/** @type {Promise<unknown>} */
let queue = Promise.resolve();

/**
 * Acquire an exclusive flock on hub/.hub.lock via python3 fcntl (compatible with Go unix.Flock).
 * Falls back to process-local queue only when python3/fcntl is unavailable.
 * @param {string} lockPath
 * @returns {Promise<{release: () => Promise<void>, mode: 'flock'|'local'}>}
 */
function acquireCrossProcessLock(lockPath) {
  return new Promise((resolve) => {
    const script = `
import fcntl, sys
path = sys.argv[1]
f = open(path, "a+")
fcntl.flock(f.fileno(), fcntl.LOCK_EX)
sys.stdout.write("OK\\n")
sys.stdout.flush()
sys.stdin.read(1)
fcntl.flock(f.fileno(), fcntl.LOCK_UN)
f.close()
`;
    let child;
    try {
      child = spawn('python3', ['-c', script, lockPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      resolve({ mode: 'local', release: async () => {} });
      return;
    }

    let buf = '';
    let settled = false;
    const settleLocal = () => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve({ mode: 'local', release: async () => {} });
    };

    const timer = setTimeout(settleLocal, 30000);

    child.on('error', settleLocal);
    child.stdout.on('data', (chunk) => {
      buf += String(chunk);
      if (settled || !buf.includes('OK')) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        mode: 'flock',
        release: () =>
          new Promise((res) => {
            const done = () => res();
            child.once('exit', done);
            try {
              child.stdin.write('x');
              child.stdin.end();
            } catch {
              done();
              return;
            }
            setTimeout(done, 2000);
          }),
      });
    });
  });
}

/**
 * Run fn while holding the hub advisory lock (cross-process when possible).
 * Node callers are also serialized through an in-process queue.
 * @template T
 * @param {string} hubDir
 * @param {() => (T|Promise<T>)} fn
 * @returns {Promise<T>}
 */
function withHubLock(hubDir, fn) {
  const run = async () => {
    if (!hubDir) return fn();
    const abs = path.resolve(hubDir);
    fs.mkdirSync(abs, { recursive: true });
    const lockPath = path.join(abs, HUB_LOCK_FILE);
    fs.closeSync(fs.openSync(lockPath, 'a'));
    const holder = await acquireCrossProcessLock(lockPath);
    try {
      return await fn();
    } finally {
      await holder.release();
    }
  };
  const done = queue.then(run, run);
  queue = done.then(
    () => undefined,
    () => undefined
  );
  return done;
}

module.exports = {
  HUB_LOCK_FILE,
  withHubLock,
};
