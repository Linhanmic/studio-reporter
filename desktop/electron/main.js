'use strict';

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
  clipboard,
  Notification,
  screen,
} = require('electron');
const { normalizeWsInput } = require('./discover.js');
const { checkPluginHello } = require('./compat.js');
const { detectInstalledPlugin } = require('./plugin-detect.js');
const {
  loadSettings,
  saveSettings,
  readHistory,
  resolveRunIndex,
  resolveRunDir,
  resolveRunUhilreport,
  deleteHistoryRuns,
} = require('./settings.js');
const { withHubLock } = require('./hublock.js');
const {
  shouldNotifySuiteEnd,
  formatSuiteEndNotification,
} = require('./notify.js');
const {
  PROTOCOL,
  parseDeepLink,
  extractDeepLinkFromArgv,
} = require('./deeplink.js');
const {
  buildCompareShareCardHtml,
  buildCompareShareMarkdown,
  buildCompareShareJson,
  suggestedCompareShareBasename,
} = require('./compare.js');
const {
  resolveBundleRoot,
  resolveStudioReporterBin,
  missingBundleResources,
} = require('./paths.js');
const {
  isUhilreportPath,
  regenerateFromUhilreport,
} = require('./uhil-open.js');
const {
  rememberRecentProject,
  rememberRecentHub,
  GaugeSessionManager,
} = require('./sessions.js');
const { createUpdater } = require('./updater.js');
const { buildReportOutline, loadOutlineFromReportDir } = require('./outline.js');
const {
  loadWindowState,
  saveWindowState,
  sanitizeWindowState,
  captureWindowState,
  browserWindowOptionsFromState,
  MIN_WIDTH,
  MIN_HEIGHT,
} = require('./window-state.js');

/**
 * Persist report hub dir and push onto recentHubs.
 * @param {string} hubDir
 */
function persistReportHub(hubDir) {
  const userData = app.getPath('userData');
  const settings = loadSettings(userData);
  const hub = path.resolve(String(hubDir || '').trim());
  return saveSettings(userData, {
    reportHubDir: hub,
    recentHubs: rememberRecentHub(settings.recentHubs, hub),
  });
}
const DESKTOP_VERSION = '0.5.2';
/** Dev: repo root. Packaged: Electron extraResources (viewer + report-assets + bin). */
const BUNDLE_ROOT = resolveBundleRoot(
  app.isPackaged,
  process.resourcesPath,
  path.join(__dirname, '..')
);
const RENDERER = path.join(__dirname, '..', 'renderer', 'index.html');

let mainWindow = null;
let assetServer = null;
let assetPort = 0;
let bridge = null;
const sessionManager = new GaugeSessionManager();
const updater = createUpdater({
  isPackaged: app.isPackaged,
  autoDownload: true,
  logger: console,
});
updater.setStatusListener((status) => {
  sendToRenderer('updater-status', status);
});

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function connectLiveWs(input) {
  const url = normalizeWsInput(input);
  if (!url) {
    throw new Error('无法解析 WebSocket 地址。请粘贴 ws://127.0.0.1:<port> 或 discover 整行。');
  }
  if (!bridge) bridge = new ReporterBridge();
  await bridge.connect(url);
  await startAssetServer(BUNDLE_ROOT);
  const liveUrl = `http://127.0.0.1:${assetPort}/viewer.html?ws=${encodeURIComponent(url)}`;
  sendToRenderer('navigate-live', { url: liveUrl });
  return { url, liveUrl };
}

function createAssetServer(rootDir) {
  const root = path.resolve(rootDir);
  return http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let rel = urlPath === '/' ? '/viewer.html' : urlPath;
      if (rel.startsWith('/assets/')) {
        rel = '/report-assets/' + rel.slice('/assets/'.length);
      }
      const filePath = path.normalize(path.join(root, rel));
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  });
}

function startAssetServer(rootDir) {
  return new Promise((resolve, reject) => {
    if (assetServer) {
      assetServer.close();
      assetServer = null;
    }
    const srv = createAssetServer(rootDir);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      assetServer = srv;
      assetPort = addr.port;
      resolve(assetPort);
    });
    srv.on('error', reject);
  });
}


function maybeNotifySuiteEnd(payload) {
  try {
    const settings = loadSettings(app.getPath('userData'));
    const focused = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused());
    if (!shouldNotifySuiteEnd({ enabled: settings.notifyOnSuiteEnd !== false, windowFocused: focused })) {
      return;
    }
    if (!Notification.isSupported()) return;
    const { title, body, reportPath, reportDir } = formatSuiteEndNotification(payload || {});
    const note = new Notification({ title, body });
    note.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        const target = reportPath || reportDir;
        if (target) {
          const abs = path.resolve(target);
          const url = pathToFileURL(
            abs.endsWith('.html') ? abs : path.join(abs, 'index.html')
          ).href;
          mainWindow.webContents.send('navigate-report', { path: abs, url });
        }
      }
    });
    note.show();
  } catch (err) {
    console.warn('suite-end notification failed:', err);
  }
}

/** Minimal WS client for control + ReportGenerated (Node 22+ global WebSocket). */
class ReporterBridge {
  constructor() {
    this.ws = null;
    this.url = null;
  }

  connect(url) {
    this.close();
    this.url = url;
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.addEventListener('open', () => {
        this.send({
          type: 'ClientHello',
          timestamp: new Date().toISOString(),
          payload: {
            app: 'studio-reporter-desktop',
            version: DESKTOP_VERSION,
            capabilities: ['live', 'final', 'RequestSnapshot'],
          },
        });
        this.send({
          type: 'RequestSnapshot',
          timestamp: new Date().toISOString(),
          payload: {},
        });
        if (!settled) {
          settled = true;
          resolve();
        }
        this.emitStatus({ connected: true, url });
      });
      ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.type === 'ServerHello') {
          const compat = checkPluginHello(msg.payload);
          this.emitStatus({
            hello: msg.payload,
            compat,
            connected: true,
            url,
          });
        }
        if (msg.type === 'ReportGenerated' && msg.payload) {
          this.emitStatus({ reportGenerated: msg.payload });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('report-generated', msg.payload);
          }
          maybeNotifySuiteEnd(msg.payload);
        }
        if (msg.type === 'ReportSnapshot' && mainWindow && !mainWindow.isDestroyed()) {
          const payload = msg.payload || {};
          mainWindow.webContents.send('report-snapshot-meta', {
            running: payload.running,
            rev: payload.rev,
            projectName: payload.report?.projectName,
          });
          mainWindow.webContents.send('report-outline', buildReportOutline(payload));
        }
      });
      ws.addEventListener('close', () => {
        this.emitStatus({ connected: false, url });
      });
      ws.addEventListener('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err.error || err);
        }
        this.emitStatus({ connected: false, error: String(err.message || err), url });
      });
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  emitStatus(partial) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bridge-status', partial);
    }
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }
}

function buildMenu() {
  const helpItems = [];
  if (!app.isPackaged) {
    helpItems.push({
      label: 'DESKTOP.md',
      click: () => shell.openPath(path.join(BUNDLE_ROOT, 'DESKTOP.md')),
    });
  }
  helpItems.push({
    label: `Studio Reporter Desktop ${DESKTOP_VERSION}`,
    enabled: false,
  });
  helpItems.push({
    label: '检查更新…',
    click: async () => {
      const status = await updater.checkForUpdates();
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: status.state === 'error' ? 'error' : 'info',
          message: '检查更新',
          detail: status.message,
        });
      }
    },
  });

  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开报告目录…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: '选择含 index.html 的报告目录',
            });
            if (result.canceled || !result.filePaths[0]) return;
            await openReportDir(result.filePaths[0]);
          },
        },
        {
          label: '打开 .uhilreport…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            try {
              await pickAndOpenUhilreport();
            } catch (err) {
              dialog.showErrorBox('打开 .uhilreport 失败', String(err.message || err));
            }
          },
        },
        {
          label: '打开仓库 viewer（开发）',
          visible: !app.isPackaged,
          click: async () => {
            await startAssetServer(BUNDLE_ROOT);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('navigate-live', {
                url: `http://127.0.0.1:${assetPort}/viewer.html`,
              });
            }
          },
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '查看',
      submenu: [
        {
          label: '运行',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('navigate-tab', { tab: 'run' });
            }
          },
        },
        {
          label: '报告',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('navigate-tab', { tab: 'report' });
            }
          },
        },
        {
          label: '历史',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('navigate-tab', { tab: 'history' });
            }
          },
        },
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+4',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('navigate-tab', { tab: 'settings' });
            }
          },
        },
        { type: 'separator' },
        {
          label: '刷新历史',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('desktop-shortcut', { type: 'refresh-history' });
            }
          },
        },
        {
          label: '连接 WebSocket',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('desktop-shortcut', { type: 'connect' });
            }
          },
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '帮助',
      submenu: helpItems,
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openReportDir(dir) {
  const indexPath = path.join(dir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    dialog.showErrorBox('无效报告目录', `未找到 ${indexPath}`);
    return;
  }
  await startAssetServer(dir);
  const url = `http://127.0.0.1:${assetPort}/index.html`;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('navigate-report', { url, dir });
    const outline = loadOutlineFromReportDir(dir);
    if (outline) {
      mainWindow.webContents.send('report-outline', outline);
    }
  }
}

/**
 * Regenerate HTML from a portable .uhilreport and open the report tab.
 * @param {string} uhilPath
 */
async function openUhilreport(uhilPath) {
  const bin = resolveStudioReporterBin(BUNDLE_ROOT);
  if (!bin) throw new Error('找不到 studio-reporter 可执行文件（请先 make build）');
  const result = regenerateFromUhilreport({ bin, uhilPath });
  await openReportDir(result.outDir);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('navigate-tab', { tab: 'report' });
  }
  return result;
}

async function pickAndOpenUhilreport() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: '选择 .uhilreport（将再生 HTML 并打开）',
    filters: [
      { name: 'Studio Reporter', extensions: ['uhilreport'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, canceled: true };
  }
  const opened = await openUhilreport(result.filePaths[0]);
  return { ok: true, ...opened };
}

function displayWorkAreas() {
  return screen.getAllDisplays().map((d) => d.workArea);
}

function createWindow() {
  const userData = app.getPath('userData');
  let windowState = sanitizeWindowState(loadWindowState(userData), displayWorkAreas());
  const bounds = browserWindowOptionsFromState(windowState);
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: 'Studio Reporter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  let persistTimer = null;
  const persist = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        windowState = captureWindowState(mainWindow, windowState);
        saveWindowState(userData, windowState);
      } catch {
        /* ignore */
      }
    }, 200);
  };
  mainWindow.on('resize', persist);
  mainWindow.on('move', persist);
  mainWindow.on('maximize', persist);
  mainWindow.on('unmaximize', persist);
  mainWindow.on('close', () => {
    clearTimeout(persistTimer);
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        windowState = captureWindowState(mainWindow, windowState);
        saveWindowState(userData, windowState);
      }
    } catch {
      /* ignore */
    }
  });
  mainWindow.once('ready-to-show', () => {
    if (windowState.isMaximized) mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.loadFile(RENDERER);
}

function registerIpc() {
  ipcMain.handle('desktop:info', async () => ({
    version: DESKTOP_VERSION,
    bundleRoot: BUNDLE_ROOT,
    packaged: app.isPackaged,
    assetPort,
  }));

  ipcMain.handle('desktop:detect-plugin', async () => detectInstalledPlugin());

  ipcMain.handle('desktop:updater-status', async () => updater.getStatus());
  ipcMain.handle('desktop:check-updates', async () => updater.checkForUpdates());
  ipcMain.handle('desktop:quit-and-install', async () => updater.quitAndInstall());

  ipcMain.handle('desktop:connect-ws', async (_evt, input) => connectLiveWs(input));

  ipcMain.handle('desktop:disconnect', async () => {
    if (bridge) bridge.close();
    return { ok: true };
  });

  ipcMain.handle('desktop:open-report-path', async (_evt, reportPath) => {
    if (!reportPath) throw new Error('empty reportPath');
    const abs = path.resolve(reportPath);
    if (isUhilreportPath(abs)) {
      const opened = await openUhilreport(abs);
      return { dir: opened.outDir, uhilreport: opened.input, regenerated: true };
    }
    const dir = path.extname(abs).toLowerCase() === '.html' ? path.dirname(abs) : abs;
    await openReportDir(dir);
    return { dir };
  });

  ipcMain.handle('desktop:open-uhilreport', async (_evt, uhilPath) => {
    if (!uhilPath) throw new Error('empty uhilPath');
    return openUhilreport(uhilPath);
  });

  ipcMain.handle('desktop:pick-uhilreport', async () => pickAndOpenUhilreport());

  ipcMain.handle('desktop:pick-report-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择报告目录',
    });
    if (result.canceled || !result.filePaths[0]) return null;
    await openReportDir(result.filePaths[0]);
    return result.filePaths[0];
  });

  ipcMain.handle('desktop:show-in-folder', async (_evt, targetPath) => {
    if (targetPath) shell.showItemInFolder(path.resolve(targetPath));
  });

  ipcMain.handle('desktop:reveal-history-run', async (_evt, entry) => {
    const settings = loadSettings(app.getPath('userData'));
    const hub = settings.reportHubDir;
    if (!hub) throw new Error('请先在设置中指定报告根目录');
    const dir = resolveRunDir(hub, entry);
    const indexPath = resolveRunIndex(hub, entry);
    const target = indexPath && fs.existsSync(indexPath) ? indexPath : dir;
    if (!target || !fs.existsSync(target)) {
      throw new Error('找不到该次运行的归档目录');
    }
    shell.showItemInFolder(path.resolve(target));
    return { ok: true, path: target };
  });

  ipcMain.handle('desktop:copy-history-path', async (_evt, entry, kind = 'dir') => {
    const settings = loadSettings(app.getPath('userData'));
    const hub = settings.reportHubDir;
    if (!hub) throw new Error('请先在设置中指定报告根目录');
    const indexPath = resolveRunIndex(hub, entry);
    const dir = resolveRunDir(hub, entry);
    const text = kind === 'index' ? indexPath : dir;
    if (!text) throw new Error('找不到该次运行的路径');
    clipboard.writeText(text);
    return { ok: true, path: text };
  });

  ipcMain.handle('desktop:export-compare-card', async (_evt, cmp, opts = {}) => {
    if (!cmp?.base || !cmp?.target) throw new Error('对比结果无效');
    const basename = suggestedCompareShareBasename(cmp);
    const defaultPath = path.join(app.getPath('documents'), `${basename}.html`);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出对比分享卡片',
      defaultPath,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    const html = buildCompareShareCardHtml(cmp, {
      title: opts.title || 'Studio Reporter 运行对比',
      generatedAt: opts.generatedAt || new Date().toISOString(),
    });
    fs.writeFileSync(result.filePath, html, 'utf8');
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle('desktop:copy-compare-markdown', async (_evt, cmp, opts = {}) => {
    const md = buildCompareShareMarkdown(cmp, opts);
    clipboard.writeText(md);
    return { ok: true, bytes: Buffer.byteLength(md, 'utf8') };
  });

  ipcMain.handle('desktop:copy-compare-json', async (_evt, cmp, opts = {}) => {
    const json = buildCompareShareJson(cmp, opts);
    clipboard.writeText(json);
    return { ok: true, bytes: Buffer.byteLength(json, 'utf8') };
  });

  ipcMain.handle('desktop:open-path', async (_evt, absPath) => {
    const target = path.resolve(String(absPath || ''));
    if (!target || !fs.existsSync(target)) {
      throw new Error('文件不存在');
    }
    const err = await shell.openPath(target);
    if (err) throw new Error(err);
    return { ok: true, path: target };
  });

  ipcMain.handle('desktop:reveal-path', async (_evt, absPath) => {
    const target = path.resolve(String(absPath || ''));
    if (!target || !fs.existsSync(target)) {
      throw new Error('路径不存在');
    }
    shell.showItemInFolder(target);
    return { ok: true, path: target };
  });

  ipcMain.handle('desktop:file-url', async (_evt, absPath) => pathToFileURL(absPath).href);

  ipcMain.handle('desktop:get-settings', async () => loadSettings(app.getPath('userData')));

  ipcMain.handle('desktop:save-settings', async (_evt, partial) => {
    const userData = app.getPath('userData');
    const patch = { ...(partial || {}) };
    if (patch.reportHubDir) {
      const cur = loadSettings(userData);
      patch.recentHubs = rememberRecentHub(cur.recentHubs, patch.reportHubDir);
    }
    return saveSettings(userData, patch);
  });

  ipcMain.handle('desktop:pick-hub-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 studio-report 报告根目录（含 history.json）',
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const hub = result.filePaths[0];
    persistReportHub(hub);
    return hub;
  });

  ipcMain.handle('desktop:list-history', async (_evt, hubDir) => {
    const settings = loadSettings(app.getPath('userData'));
    const dir = hubDir || settings.reportHubDir;
    return readHistory(dir);
  });

  ipcMain.handle('desktop:open-history-run', async (_evt, entry) => {
    const settings = loadSettings(app.getPath('userData'));
    const indexPath = resolveRunIndex(settings.reportHubDir, entry);
    if (!indexPath || !fs.existsSync(indexPath)) {
      throw new Error('找不到该次运行的 index.html，请检查报告根目录设置');
    }
    await openReportDir(path.dirname(indexPath));
    return { indexPath, dir: path.dirname(indexPath) };
  });

  ipcMain.handle('desktop:export-report', async (_evt, kind, entryOrEntries) => {
    const settings = loadSettings(app.getPath('userData'));
    const hub = settings.reportHubDir;
    if (!hub) throw new Error('请先在设置中指定报告根目录');
    const entries = Array.isArray(entryOrEntries)
      ? entryOrEntries.filter(Boolean)
      : entryOrEntries
        ? [entryOrEntries]
        : [];
    const bin = resolveStudioReporterBin(BUNDLE_ROOT);
    if (!bin) throw new Error('找不到 studio-reporter 可执行文件（请先 make build）');

    const exportOne = (input) => {
      const outDir = path.dirname(input);
      const args = ['generate', '--input', input, '--out', outDir];
      if (kind === 'pdf') args.push('--pdf');
      if (kind === 'single') args.push('--single');
      const result = spawnSync(bin, args, { encoding: 'utf8' });
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `export failed (${result.status})`);
      }
      return { input, out: outDir, log: result.stdout };
    };

    if (!entries.length) {
      const matches = fs.readdirSync(hub).filter((n) => n.endsWith('.uhilreport'));
      if (!matches.length) throw new Error('报告根目录下没有 .uhilreport');
      matches.sort();
      const one = exportOne(path.join(hub, matches[matches.length - 1]));
      return { ok: true, kind, exported: [one] };
    }

    const exported = [];
    for (const entry of entries) {
      const input = resolveRunUhilreport(hub, entry);
      if (!input) {
        throw new Error(`运行 ${entry.id || entry.href || '?'} 找不到 .uhilreport`);
      }
      exported.push(exportOne(input));
    }
    return { ok: true, kind, exported };
  });

  ipcMain.handle('desktop:delete-history-runs', async (_evt, ids) => {
    const settings = loadSettings(app.getPath('userData'));
    const hub = settings.reportHubDir;
    if (!hub) throw new Error('请先在设置中指定报告根目录');
    const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!list.length) throw new Error('未选择要删除的运行');
    const detail =
      list.length === 1
        ? `删除运行 ${list[0]}？\n归档文件将被移除且无法恢复。`
        : `删除所选 ${list.length} 次运行？\n${list.join('\n')}\n\n归档文件将被移除且无法恢复。`;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['删除', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '删除历史运行',
      message: '确认删除历史运行',
      detail,
      noLink: true,
    });
    if (response !== 0) return { ok: false, cancelled: true, deleted: [] };
    return withHubLock(hub, () => deleteHistoryRuns(hub, list));
  });

  ipcMain.handle('desktop:pick-gauge-project', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 Gauge 项目目录（含 manifest.json 或 specs/）',
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const projectDir = result.filePaths[0];
    const settings = loadSettings(app.getPath('userData'));
    saveSettings(app.getPath('userData'), {
      gaugeProjectDir: projectDir,
      recentProjects: rememberRecentProject(settings.recentProjects, projectDir),
    });
    return projectDir;
  });

  ipcMain.handle('desktop:list-sessions', async () => ({
    sessions: sessionManager.list(),
    activeId: sessionManager.activeId,
  }));

  ipcMain.handle('desktop:set-active-session', async (_evt, id) => {
    const session = sessionManager.setActive(id);
    if (!session) throw new Error('会话不存在');
    if (session.liveUrl) {
      sendToRenderer('navigate-live', { url: session.liveUrl });
    } else if (session.discoveredUrl) {
      const live = await connectLiveWs(session.discoveredUrl);
      sessionManager.markLive(id, live.liveUrl);
    }
    sendToRenderer('sessions-updated', {
      sessions: sessionManager.list(),
      activeId: sessionManager.activeId,
    });
    return sessionManager.get(id);
  });

  ipcMain.handle('desktop:gauge-status', async () => {
    const active = sessionManager.active;
    return {
      running: Boolean(active && active.status === 'running'),
      discoveredUrl: active?.discoveredUrl || null,
      sessions: sessionManager.list(),
      activeId: sessionManager.activeId,
    };
  });

  ipcMain.handle('desktop:start-gauge', async (_evt, opts = {}) => {
    const settings = loadSettings(app.getPath('userData'));
    const projectDir = opts.projectDir || settings.gaugeProjectDir;
    const specs = opts.specs || settings.gaugeSpecs || 'specs';
    const env = opts.env != null ? opts.env : settings.gaugeEnv || '';
    const gaugeBin = opts.gaugeBin || settings.gaugeBin || 'gauge';
    const recentProjects = rememberRecentProject(settings.recentProjects, projectDir);
    saveSettings(app.getPath('userData'), {
      gaugeProjectDir: projectDir || '',
      gaugeSpecs: specs,
      gaugeEnv: env,
      gaugeBin,
      recentProjects,
    });

    const session = sessionManager.start({
      projectDir,
      specs,
      env,
      gaugeBin,
      onLog: (text, stream, sessionId) =>
        sendToRenderer('gauge-log', { text, stream, sessionId }),
      onDiscover: async (url, sessionId) => {
        sendToRenderer('gauge-discover', { url, sessionId });
        if (sessionManager.activeId !== sessionId) return;
        try {
          const live = await connectLiveWs(url);
          sessionManager.markLive(sessionId, live.liveUrl);
          sendToRenderer('gauge-status', {
            running: true,
            sessionId,
            discoveredUrl: url,
            autoConnected: true,
            liveUrl: live.liveUrl,
            sessions: sessionManager.list(),
            activeId: sessionManager.activeId,
          });
        } catch (err) {
          sendToRenderer('gauge-status', {
            running: true,
            sessionId,
            discoveredUrl: url,
            autoConnected: false,
            error: String(err.message || err),
            sessions: sessionManager.list(),
            activeId: sessionManager.activeId,
          });
        }
      },
      onExit: (code, signal, sessionId) => {
        sendToRenderer('gauge-status', {
          running: false,
          sessionId,
          code,
          signal,
          discoveredUrl: sessionManager.get(sessionId)?.discoveredUrl || null,
          sessions: sessionManager.list(),
          activeId: sessionManager.activeId,
        });
        sendToRenderer('sessions-updated', {
          sessions: sessionManager.list(),
          activeId: sessionManager.activeId,
        });
      },
    });

    sendToRenderer('gauge-status', {
      running: true,
      sessionId: session.id,
      pid: session.pid,
      sessions: sessionManager.list(),
      activeId: sessionManager.activeId,
    });
    sendToRenderer('sessions-updated', {
      sessions: sessionManager.list(),
      activeId: sessionManager.activeId,
    });
    return { ok: true, session, sessions: sessionManager.list() };
  });

  ipcMain.handle('desktop:stop-gauge', async (_evt, sessionId) => {
    const stopped = sessionManager.stop(sessionId);
    return {
      ok: true,
      stopped,
      sessions: sessionManager.list(),
      activeId: sessionManager.activeId,
    };
  });

}


/** @type {string[]} */
let pendingDeepLinks = [];
let deepLinksReady = false;

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function handleDeepLinkAction(action) {
  if (!action || !action.ok) return { ok: false, error: action?.error || 'invalid' };
  focusMainWindow();
  if (action.action === 'open') {
    if (action.path && isUhilreportPath(action.path)) {
      const opened = await openUhilreport(action.path);
      return { ok: true, action: 'open', dir: opened.outDir, uhilreport: opened.input, regenerated: true };
    }
    let dir = action.dir || '';
    if (action.path) {
      const abs = path.resolve(action.path);
      dir = abs.toLowerCase().endsWith('.html') ? path.dirname(abs) : abs;
    }
    dir = path.resolve(dir);
    await openReportDir(dir);
    return { ok: true, action: 'open', dir };
  }
  if (action.action === 'connect') {
    await connectLiveWs(action.url);
    return { ok: true, action: 'connect', url: action.url };
  }
  if (action.action === 'hub') {
    const dir = path.resolve(action.dir);
    const settings = persistReportHub(dir);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-updated', settings);
      mainWindow.webContents.send('navigate-tab', { tab: 'history' });
    }
    return { ok: true, action: 'hub', dir };
  }
  return { ok: false, error: `unhandled action ${action.action}` };
}

async function enqueueDeepLink(raw) {
  const parsed = parseDeepLink(raw);
  if (!parsed.ok) {
    console.warn('[desktop] deep link ignored:', parsed.error, raw);
    return parsed;
  }
  if (!deepLinksReady) {
    pendingDeepLinks.push(raw);
    return { ok: true, queued: true };
  }
  try {
    return await handleDeepLinkAction(parsed);
  } catch (err) {
    console.warn('[desktop] deep link failed:', err);
    return { ok: false, error: String(err.message || err) };
  }
}

async function flushPendingDeepLinks() {
  deepLinksReady = true;
  const queued = pendingDeepLinks.splice(0, pendingDeepLinks.length);
  for (const raw of queued) {
    await enqueueDeepLink(raw);
  }
}


const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_evt, argv) => {
    const link = extractDeepLinkFromArgv(argv);
    focusMainWindow();
    if (link) enqueueDeepLink(link);
  });
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

app.on('open-url', (evt, url) => {
  evt.preventDefault();
  enqueueDeepLink(url);
});

// Cold-start deep link (Windows/Linux)
{
  const cold = extractDeepLinkFromArgv(process.argv);
  if (cold) pendingDeepLinks.push(cold);
}

app.whenReady().then(async () => {
  const missing = missingBundleResources(BUNDLE_ROOT);
  if (missing.length && !app.isPackaged) {
    console.warn('[desktop] missing bundle resources:', missing.join(', '));
  }
  registerIpc();
  buildMenu();
  await startAssetServer(BUNDLE_ROOT);
  createWindow();
  await flushPendingDeepLinks();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  try {
    const settings = loadSettings(app.getPath('userData'));
    if (app.isPackaged && settings.autoCheckUpdates) {
      setTimeout(() => {
        updater.checkForUpdates().catch(() => {});
      }, 2500);
    }
  } catch {
    /* ignore */
  }
});

app.on('window-all-closed', () => {
  if (bridge) bridge.close();
  sessionManager.stopAll();
  if (assetServer) assetServer.close();
  if (process.platform !== 'darwin') app.quit();
});
