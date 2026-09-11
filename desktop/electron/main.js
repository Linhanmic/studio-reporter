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
} = require('electron');
const { normalizeWsInput } = require('./discover.js');
const { checkPluginHello } = require('./compat.js');
const { detectInstalledPlugin } = require('./plugin-detect.js');
const {
  loadSettings,
  saveSettings,
  readHistory,
  resolveRunIndex,
} = require('./settings.js');
const {
  resolveBundleRoot,
  resolveStudioReporterBin,
  missingBundleResources,
} = require('./paths.js');
const {
  rememberRecentProject,
  GaugeSessionManager,
} = require('./sessions.js');
const { createUpdater } = require('./updater.js');
const { buildReportOutline, loadOutlineFromReportDir } = require('./outline.js');

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Studio Reporter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
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
    const dir = path.extname(abs).toLowerCase() === '.html' ? path.dirname(abs) : abs;
    await openReportDir(dir);
    return { dir };
  });

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

  ipcMain.handle('desktop:file-url', async (_evt, absPath) => pathToFileURL(absPath).href);

  ipcMain.handle('desktop:get-settings', async () => loadSettings(app.getPath('userData')));

  ipcMain.handle('desktop:save-settings', async (_evt, partial) =>
    saveSettings(app.getPath('userData'), partial || {})
  );

  ipcMain.handle('desktop:pick-hub-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 studio-report 报告根目录（含 history.json）',
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const hub = result.filePaths[0];
    saveSettings(app.getPath('userData'), { reportHubDir: hub });
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

  ipcMain.handle('desktop:export-report', async (_evt, kind) => {
    const settings = loadSettings(app.getPath('userData'));
    const hub = settings.reportHubDir;
    if (!hub) throw new Error('请先在设置中指定报告根目录');
    const matches = fs.readdirSync(hub).filter((n) => n.endsWith('.uhilreport'));
    if (!matches.length) throw new Error('报告根目录下没有 .uhilreport');
    matches.sort();
    const input = path.join(hub, matches[matches.length - 1]);
    const bin = resolveStudioReporterBin(BUNDLE_ROOT);
    if (!bin) throw new Error('找不到 studio-reporter 可执行文件（请先 make build）');
    const args = ['generate', '--input', input, '--out', hub];
    if (kind === 'pdf') args.push('--pdf');
    if (kind === 'single') args.push('--single');
    const result = spawnSync(bin, args, { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `export failed (${result.status})`);
    }
    return { ok: true, input, out: hub, kind, log: result.stdout };
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

app.whenReady().then(async () => {
  const missing = missingBundleResources(BUNDLE_ROOT);
  if (missing.length && !app.isPackaged) {
    console.warn('[desktop] missing bundle resources:', missing.join(', '));
  }
  registerIpc();
  buildMenu();
  await startAssetServer(BUNDLE_ROOT);
  createWindow();
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
