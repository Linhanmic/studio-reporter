'use strict';

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
} = require('electron');
const { normalizeWsInput } = require('./discover.js');
const {
  loadSettings,
  saveSettings,
  readHistory,
  resolveRunIndex,
} = require('./settings.js');

const DESKTOP_VERSION = '0.5.2';
/** Repo root (parent of desktop/) — viewer.html / report-assets live here in dev. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RENDERER = path.join(__dirname, '..', 'renderer', 'index.html');

let mainWindow = null;
let assetServer = null;
let assetPort = 0;
let bridge = null;

function createAssetServer(rootDir) {
  const root = path.resolve(rootDir);
  return http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let rel = urlPath === '/' ? '/viewer.html' : urlPath;
      // Map /assets/* to report-assets for hub-style URLs
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
          this.emitStatus({ hello: msg.payload, connected: true, url });
        }
        if (msg.type === 'ReportGenerated' && msg.payload) {
          this.emitStatus({ reportGenerated: msg.payload });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('report-generated', msg.payload);
          }
        }
        if (msg.type === 'ReportSnapshot' && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('report-snapshot-meta', {
            running: msg.payload?.running,
            rev: msg.payload?.rev,
            projectName: msg.payload?.report?.projectName,
          });
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
          click: async () => {
            await startAssetServer(REPO_ROOT);
            mainWindow.webContents.send('navigate-live', {
              url: `http://127.0.0.1:${assetPort}/viewer.html`,
            });
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
      submenu: [
        {
          label: 'DESKTOP.md',
          click: () => shell.openPath(path.join(REPO_ROOT, 'DESKTOP.md')),
        },
      ],
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
  // Prefer hub assets: if dir is a gauge hub it may have viewer + assets copied
  const url = `http://127.0.0.1:${assetPort}/index.html`;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('navigate-report', { url, dir });
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
    repoRoot: REPO_ROOT,
    assetPort,
  }));

  ipcMain.handle('desktop:connect-ws', async (_evt, input) => {
    const url = normalizeWsInput(input);
    if (!url) {
      throw new Error('无法解析 WebSocket 地址。请粘贴 ws://127.0.0.1:<port> 或 discover 整行。');
    }
    if (!bridge) bridge = new ReporterBridge();
    await bridge.connect(url);
    // Live viewer needs plugin hub assets OR repo root assets; serve repo for Vue/CSS
    await startAssetServer(REPO_ROOT);
    const liveUrl = `http://127.0.0.1:${assetPort}/viewer.html?ws=${encodeURIComponent(url)}`;
    return { url, liveUrl };
  });

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
    const binCandidates = [
      path.join(REPO_ROOT, 'bin', 'studio-reporter'),
      path.join(REPO_ROOT, 'bin', 'studio-reporter.exe'),
      'studio-reporter',
    ];
    const { spawnSync } = require('node:child_process');
    let bin = binCandidates.find((c) => c === 'studio-reporter' || fs.existsSync(c));
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

}

app.whenReady().then(async () => {
  registerIpc();
  buildMenu();
  await startAssetServer(REPO_ROOT);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (bridge) bridge.close();
  if (assetServer) assetServer.close();
  if (process.platform !== 'darwin') app.quit();
});
