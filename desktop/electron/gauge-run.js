'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { extractReporterWsUrl } = require('./discover.js');

/**
 * Build `gauge run` argv (without the gauge binary itself).
 * @param {{ specs?: string, env?: string, tags?: string, extraArgs?: string[] }} opts
 */
function buildGaugeArgs(opts = {}) {
  const specs = String(opts.specs || 'specs').trim() || 'specs';
  const env = String(opts.env || '').trim();
  const tags = String(opts.tags || '').trim();
  const extra = Array.isArray(opts.extraArgs) ? opts.extraArgs.filter(Boolean) : [];
  const args = ['run'];
  if (env) {
    args.push('--env', env);
  }
  if (tags) {
    args.push('--tags', tags);
  }
  for (const a of extra) args.push(String(a));
  args.push(specs);
  return args;
}

/**
 * Resolve gauge binary: settings override, then PATH name.
 * @param {string} [configured]
 */
function resolveGaugeBin(configured) {
  const c = String(configured || '').trim();
  if (c) {
    if (c === 'gauge' || c === 'gauge.exe') return c;
    if (fs.existsSync(c)) return c;
  }
  return 'gauge';
}

/**
 * Validate a Gauge project directory (manifest.json or specs/).
 * @param {string} projectDir
 * @returns {string|null} error message or null if ok
 */
function validateGaugeProject(projectDir) {
  const dir = String(projectDir || '').trim();
  if (!dir) return '请先选择 Gauge 项目目录';
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return `项目目录不存在：${dir}`;
  }
  const manifest = path.join(dir, 'manifest.json');
  const specsDir = path.join(dir, 'specs');
  if (!fs.existsSync(manifest) && !fs.existsSync(specsDir)) {
    return `不像 Gauge 项目（缺少 manifest.json / specs）：${dir}`;
  }
  return null;
}

/**
 * Line-buffered stdout/stderr scanner that detects discover URLs.
 */
function createDiscoverScanner(onDiscover) {
  let buf = '';
  let found = null;
  return {
    get found() {
      return found;
    },
    push(chunk) {
      buf += String(chunk ?? '');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const url = extractReporterWsUrl(line);
        if (url && !found) {
          found = url;
          if (typeof onDiscover === 'function') onDiscover(url, line);
        }
      }
      // Also check incomplete buffer for discover (line may arrive without newline yet)
      const url = extractReporterWsUrl(buf);
      if (url && !found) {
        found = url;
        if (typeof onDiscover === 'function') onDiscover(url, buf);
      }
    },
  };
}

/**
 * Spawn+supervise one gauge run. Pure enough to inject spawnImpl for tests.
 */
class GaugeRunner {
  /**
   * @param {{ spawnImpl?: typeof spawn }} [opts]
   */
  constructor(opts = {}) {
    this.spawnImpl = opts.spawnImpl || spawn;
    this.child = null;
    this.discoveredUrl = null;
  }

  get running() {
    return Boolean(this.child);
  }

  /**
   * @param {object} opts
   * @param {string} opts.projectDir
   * @param {string} [opts.gaugeBin]
   * @param {string} [opts.specs]
   * @param {string} [opts.env]
   * @param {string} [opts.tags]
   * @param {string[]} [opts.extraArgs]
   * @param {(chunk: string, stream: 'stdout'|'stderr') => void} [opts.onLog]
   * @param {(url: string) => void} [opts.onDiscover]
   * @param {(code: number|null, signal: string|null) => void} [opts.onExit]
   */
  start(opts) {
    if (this.child) {
      throw new Error('已有 Gauge 进程在运行');
    }
    const err = validateGaugeProject(opts.projectDir);
    if (err) throw new Error(err);

    const bin = resolveGaugeBin(opts.gaugeBin);
    const args = buildGaugeArgs(opts);
    const child = this.spawnImpl(bin, args, {
      cwd: path.resolve(opts.projectDir),
      env: process.env,
      shell: false,
    });
    this.child = child;
    this.discoveredUrl = null;

    const scanner = createDiscoverScanner((url) => {
      this.discoveredUrl = url;
      if (typeof opts.onDiscover === 'function') opts.onDiscover(url);
    });

    const feed = (stream) => (chunk) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      scanner.push(text);
      if (typeof opts.onLog === 'function') opts.onLog(text, stream);
    };

    if (child.stdout) child.stdout.on('data', feed('stdout'));
    if (child.stderr) child.stderr.on('data', feed('stderr'));

    child.on('error', (e) => {
      this.child = null;
      if (typeof opts.onExit === 'function') opts.onExit(null, null);
      if (typeof opts.onLog === 'function') {
        opts.onLog(`\n[gauge spawn error] ${e.message}\n`, 'stderr');
      }
    });

    child.on('close', (code, signal) => {
      this.child = null;
      if (typeof opts.onExit === 'function') opts.onExit(code, signal);
    });

    return { bin, args, pid: child.pid };
  }

  stop() {
    if (!this.child) return false;
    const child = this.child;
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    // Force kill shortly after if still alive
    setTimeout(() => {
      try {
        if (this.child === child) child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, 2000);
    return true;
  }
}

module.exports = {
  buildGaugeArgs,
  resolveGaugeBin,
  validateGaugeProject,
  createDiscoverScanner,
  GaugeRunner,
};
