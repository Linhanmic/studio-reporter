'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Watch a studio-report hub for history.json (and archives/) changes.
 * Pure Node fs.watch — no Electron dependency so unit tests stay light.
 *
 * @param {{
 *   onChange?: (info: { hubDir: string, reason: string }) => void,
 *   debounceMs?: number,
 *   watch?: typeof fs.watch,
 *   existsSync?: typeof fs.existsSync,
 * }} [opts]
 */
function createHubWatcher(opts = {}) {
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
  const debounceMs =
    Number.isFinite(Number(opts.debounceMs)) && Number(opts.debounceMs) >= 0
      ? Number(opts.debounceMs)
      : DEFAULT_DEBOUNCE_MS;
  const watchFn = opts.watch || fs.watch;
  const existsSync = opts.existsSync || fs.existsSync;

  let hubDir = '';
  /** @type {import('node:fs').FSWatcher[]} */
  let watchers = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function emit(reason) {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (!hubDir) return;
      onChange({ hubDir, reason: String(reason || 'change') });
    }, debounceMs);
  }

  function stop() {
    clearTimer();
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    watchers = [];
    hubDir = '';
  }

  /**
   * @param {string} dir
   * @returns {boolean} whether watching started
   */
  function start(dir) {
    stop();
    const abs = path.resolve(String(dir || '').trim());
    if (!abs || !existsSync(abs)) return false;
    hubDir = abs;

    const targets = [abs];
    const historyFile = path.join(abs, 'history.json');
    if (existsSync(historyFile)) targets.push(historyFile);
    const archives = path.join(abs, 'archives');
    if (existsSync(archives)) targets.push(archives);

    for (const target of targets) {
      try {
        const w = watchFn(target, { persistent: false }, (eventType, filename) => {
          const name = filename != null ? String(filename) : '';
          // Hub-dir watch fires for many files; only care about history index / archives.
          if (target === abs) {
            if (
              name &&
              name !== 'history.json' &&
              name !== 'history-live.js' &&
              name !== 'archives' &&
              !name.startsWith('archives')
            ) {
              return;
            }
          }
          emit(eventType || 'change');
        });
        w.on?.('error', () => {
          /* transient FS errors — next setHub/start can recover */
        });
        watchers.push(w);
      } catch {
        /* missing permissions / unsupported watch — skip this target */
      }
    }
    return watchers.length > 0;
  }

  /**
   * Replace the watched hub (empty string stops).
   * @param {string} dir
   */
  function setHub(dir) {
    const next = String(dir || '').trim();
    if (!next) {
      stop();
      return false;
    }
    if (hubDir && path.resolve(next) === hubDir && watchers.length) {
      return true;
    }
    return start(next);
  }

  return {
    start,
    stop,
    setHub,
    getHub: () => hubDir,
    isWatching: () => watchers.length > 0,
  };
}

module.exports = {
  createHubWatcher,
  DEFAULT_DEBOUNCE_MS,
};
