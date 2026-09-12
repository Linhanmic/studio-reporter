'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

/**
 * Build CLI argv for one PDF / single-file export.
 * @param {'pdf'|'single'|string} kind
 * @param {string} input absolute .uhilreport path
 * @param {string} [outDir]
 * @returns {string[]}
 */
function buildExportArgs(kind, input, outDir) {
  const inPath = path.resolve(String(input || ''));
  const out = path.resolve(outDir || path.dirname(inPath));
  const args = ['generate', '--input', inPath, '--out', out];
  if (kind === 'pdf') args.push('--pdf');
  if (kind === 'single') args.push('--single');
  return args;
}

/**
 * Run one generate export asynchronously (cancellable via kill).
 * @param {object} opts
 * @param {string} opts.bin
 * @param {'pdf'|'single'|string} opts.kind
 * @param {string} opts.input
 * @param {string} [opts.outDir]
 * @param {typeof spawn} [opts.spawnImpl]
 * @param {(child: import('node:child_process').ChildProcess) => void} [opts.onSpawn]
 * @returns {Promise<{input: string, out: string, log: string}>}
 */
function runOneExport(opts) {
  const bin = opts?.bin;
  const input = path.resolve(String(opts?.input || ''));
  const outDir = path.resolve(opts?.outDir || path.dirname(input));
  if (!bin) {
    return Promise.reject(new Error('找不到 studio-reporter 可执行文件（请先 make build）'));
  }
  if (!input) {
    return Promise.reject(new Error('缺少 .uhilreport 输入路径'));
  }

  const spawnImpl = opts.spawnImpl || spawn;
  const args = buildExportArgs(opts.kind, input, outDir);

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawnImpl(bin, args, { encoding: 'utf8' });
    if (typeof opts.onSpawn === 'function') opts.onSpawn(child);

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      });
    }

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (signal) {
        const err = new Error(`export cancelled (${signal})`);
        err.cancelled = true;
        err.signal = signal;
        reject(err);
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || stdout || `export failed (${code})`));
        return;
      }
      resolve({ input, out: outDir, log: stdout });
    });
  });
}

/**
 * Export many inputs sequentially with progress + cooperative cancel.
 * @param {object} opts
 * @param {string} opts.bin
 * @param {'pdf'|'single'|string} opts.kind
 * @param {string[]} opts.inputs
 * @param {(p: {current: number, total: number, input: string}) => void} [opts.onProgress]
 * @param {() => boolean} [opts.isCancelled]
 * @param {typeof spawn} [opts.spawnImpl]
 * @param {(child: import('node:child_process').ChildProcess) => void} [opts.onSpawn]
 * @returns {Promise<{ok: boolean, cancelled?: boolean, kind: string, exported: object[]}>}
 */
async function exportMany(opts) {
  const inputs = Array.isArray(opts?.inputs) ? opts.inputs.filter(Boolean) : [];
  const kind = opts?.kind || 'pdf';
  const exported = [];
  const total = inputs.length;

  for (let i = 0; i < inputs.length; i += 1) {
    if (typeof opts.isCancelled === 'function' && opts.isCancelled()) {
      return { ok: false, cancelled: true, kind, exported };
    }
    const input = inputs[i];
    if (typeof opts.onProgress === 'function') {
      opts.onProgress({ current: i + 1, total, input });
    }
    try {
      const one = await runOneExport({
        bin: opts.bin,
        kind,
        input,
        spawnImpl: opts.spawnImpl,
        onSpawn: opts.onSpawn,
      });
      exported.push(one);
    } catch (err) {
      if (err && err.cancelled) {
        return { ok: false, cancelled: true, kind, exported };
      }
      throw err;
    }
  }

  return { ok: true, kind, exported };
}

/**
 * Kill an in-flight export child (SIGTERM then SIGKILL).
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 * @param {{ kill?: Function, setTimeoutImpl?: Function }} [hooks]
 * @returns {boolean} whether a kill was attempted
 */
function killExportChild(child, hooks = {}) {
  if (!child) return false;
  const kill = hooks.kill || ((c, sig) => c.kill(sig));
  const setTimeoutImpl = hooks.setTimeoutImpl || setTimeout;
  try {
    kill(child, 'SIGTERM');
  } catch {
    return false;
  }
  setTimeoutImpl(() => {
    try {
      kill(child, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }, 2000);
  return true;
}

module.exports = {
  buildExportArgs,
  runOneExport,
  exportMany,
  killExportChild,
};
