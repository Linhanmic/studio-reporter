'use strict';

/**
 * Desktop auto-update controller (electron-updater).
 * Packaged builds check GitHub Releases; dev mode skips unless forced.
 */

/**
 * @param {{
 *   isPackaged?: boolean,
 *   autoUpdater?: object|null,
 *   loadAutoUpdater?: () => object,
 *   autoDownload?: boolean,
 *   allowPrerelease?: boolean,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 * }} [opts]
 */
function createUpdater(opts = {}) {
  const isPackaged = Boolean(opts.isPackaged);
  const logger = opts.logger || console;
  let autoUpdater = opts.autoUpdater || null;
  let lastStatus = {
    state: 'idle',
    message: isPackaged ? '尚未检查更新' : '开发态不自动检查更新（需打包安装包）',
    version: null,
    error: null,
  };
  /** @type {((status: object) => void)|null} */
  let onStatus = null;

  function emit(partial) {
    lastStatus = { ...lastStatus, ...partial };
    if (typeof onStatus === 'function') onStatus(lastStatus);
    return lastStatus;
  }

  function resolveAutoUpdater() {
    if (autoUpdater) return autoUpdater;
    if (typeof opts.loadAutoUpdater === 'function') {
      autoUpdater = opts.loadAutoUpdater();
      return autoUpdater;
    }
    // Lazy require so unit tests never load electron-updater.
    // eslint-disable-next-line global-require
    const mod = require('electron-updater');
    autoUpdater = mod.autoUpdater || mod;
    return autoUpdater;
  }

  function wireEvents(updater) {
    if (updater.__srWired) return;
    updater.__srWired = true;
    updater.autoDownload = opts.autoDownload !== false;
    updater.allowPrerelease = Boolean(opts.allowPrerelease);
    const bind = (event, fn) => {
      if (typeof updater.on === 'function') updater.on(event, fn);
    };
    bind('checking-for-update', () => {
      emit({ state: 'checking', message: '正在检查更新…', error: null });
    });
    bind('update-available', (info) => {
      emit({
        state: 'available',
        message: `发现新版本 ${info?.version || ''}`.trim(),
        version: info?.version || null,
        error: null,
      });
    });
    bind('update-not-available', (info) => {
      emit({
        state: 'current',
        message: `已是最新版本${info?.version ? `（${info.version}）` : ''}`,
        version: info?.version || null,
        error: null,
      });
    });
    bind('download-progress', (p) => {
      const pct = Math.round(Number(p?.percent) || 0);
      emit({ state: 'downloading', message: `下载更新 ${pct}%`, error: null });
    });
    bind('update-downloaded', (info) => {
      emit({
        state: 'ready',
        message: `更新已下载${info?.version ? `（${info.version}）` : ''}，重启后安装`,
        version: info?.version || null,
        error: null,
      });
    });
    bind('error', (err) => {
      emit({
        state: 'error',
        message: `更新失败：${err?.message || err}`,
        error: String(err?.message || err),
      });
    });
  }

  return {
    getStatus() {
      return { ...lastStatus };
    },
    setStatusListener(fn) {
      onStatus = fn;
    },
    /**
     * @returns {Promise<object>}
     */
    async checkForUpdates() {
      if (!isPackaged && !opts.forceDevUpdateConfig) {
        return emit({
          state: 'skipped',
          message: '开发态跳过更新检查（打包后的安装包才会检查 GitHub Releases）',
          error: null,
        });
      }
      try {
        const updater = resolveAutoUpdater();
        if (opts.forceDevUpdateConfig && updater) {
          updater.forceDevUpdateConfig = true;
        }
        wireEvents(updater);
        emit({ state: 'checking', message: '正在检查更新…', error: null });
        const result = await updater.checkForUpdates();
        if (!result) {
          return emit({
            state: 'skipped',
            message: '更新器未激活',
            error: null,
          });
        }
        return lastStatus;
      } catch (err) {
        logger.warn?.('[updater]', err);
        return emit({
          state: 'error',
          message: `更新失败：${err?.message || err}`,
          error: String(err?.message || err),
        });
      }
    },
    async quitAndInstall() {
      if (!isPackaged) {
        return emit({
          state: 'skipped',
          message: '开发态无法安装更新',
        });
      }
      const updater = resolveAutoUpdater();
      if (typeof updater.quitAndInstall === 'function') {
        updater.quitAndInstall();
      }
      return lastStatus;
    },
  };
}

module.exports = {
  createUpdater,
};
