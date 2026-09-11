'use strict';

const path = require('node:path');
const { GaugeRunner } = require('./gauge-run.js');

const MAX_RECENT_PROJECTS = 8;
const MAX_SESSIONS = 12;

/**
 * Push projectDir to the front of recent list (dedupe, cap).
 * @param {string[]} recent
 * @param {string} projectDir
 * @param {number} [limit]
 */
function rememberRecentProject(recent, projectDir, limit = MAX_RECENT_PROJECTS) {
  const dir = path.resolve(String(projectDir || '').trim());
  if (!dir) return Array.isArray(recent) ? recent.slice(0, limit) : [];
  const prev = Array.isArray(recent) ? recent : [];
  const next = [dir, ...prev.filter((p) => path.resolve(p) !== dir)];
  return next.slice(0, limit);
}

function newSessionId() {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Manages multiple Gauge runs (one runner per session).
 */
class GaugeSessionManager {
  /**
   * @param {{ createRunner?: () => GaugeRunner }} [opts]
   */
  constructor(opts = {}) {
    this.createRunner = opts.createRunner || (() => new GaugeRunner());
    /** @type {Map<string, object>} */
    this.sessions = new Map();
    this.activeId = null;
  }

  list() {
    return [...this.sessions.values()].map((s) => this.#public(s));
  }

  get(id) {
    const s = this.sessions.get(id);
    return s ? this.#public(s) : null;
  }

  get active() {
    return this.activeId ? this.get(this.activeId) : null;
  }

  setActive(id) {
    if (!this.sessions.has(id)) return null;
    this.activeId = id;
    return this.get(id);
  }

  /**
   * Start a new gauge session.
   * @param {object} opts same as GaugeRunner.start plus callbacks wrapped
   */
  start(opts) {
    const running = [...this.sessions.values()].filter((s) => s.status === 'running');
    if (running.length >= 3) {
      throw new Error('最多同时运行 3 个 Gauge 会话');
    }
    const id = newSessionId();
    const runner = this.createRunner();
    const session = {
      id,
      projectDir: path.resolve(opts.projectDir),
      specs: opts.specs || 'specs',
      env: opts.env || '',
      status: 'running',
      discoveredUrl: null,
      liveUrl: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      exitCode: null,
      runner,
    };
    this.sessions.set(id, session);
    this.activeId = id;
    this.#trim();

    const started = runner.start({
      ...opts,
      onLog: (text, stream) => {
        if (typeof opts.onLog === 'function') opts.onLog(text, stream, id);
      },
      onDiscover: (url) => {
        session.discoveredUrl = url;
        if (typeof opts.onDiscover === 'function') opts.onDiscover(url, id);
      },
      onExit: (code, signal) => {
        session.status = 'exited';
        session.endedAt = new Date().toISOString();
        session.exitCode = code;
        if (typeof opts.onExit === 'function') opts.onExit(code, signal, id);
      },
    });

    session.pid = started.pid;
    session.bin = started.bin;
    session.args = started.args;
    return this.#public(session);
  }

  markLive(id, liveUrl) {
    const s = this.sessions.get(id);
    if (!s) return null;
    s.liveUrl = liveUrl;
    return this.#public(s);
  }

  stop(id) {
    const targetId = id || this.activeId;
    const s = targetId ? this.sessions.get(targetId) : null;
    if (!s) return false;
    if (s.status !== 'running') return false;
    return s.runner.stop();
  }

  stopAll() {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.status === 'running' && s.runner.stop()) n += 1;
    }
    return n;
  }

  #trim() {
    while (this.sessions.size > MAX_SESSIONS) {
      const oldest = [...this.sessions.values()].find((s) => s.status !== 'running');
      if (!oldest) break;
      this.sessions.delete(oldest.id);
    }
  }

  #public(s) {
    return {
      id: s.id,
      projectDir: s.projectDir,
      projectName: path.basename(s.projectDir),
      specs: s.specs,
      env: s.env,
      status: s.status,
      discoveredUrl: s.discoveredUrl,
      liveUrl: s.liveUrl,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      exitCode: s.exitCode,
      pid: s.pid,
    };
  }
}

module.exports = {
  MAX_RECENT_PROJECTS,
  MAX_SESSIONS,
  rememberRecentProject,
  newSessionId,
  GaugeSessionManager,
};
