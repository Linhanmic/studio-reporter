'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const {
  compareHistoryRuns,
  formatDurationDelta,
  formatCountsDelta,
} = require('./compare.js');

contextBridge.exposeInMainWorld('desktopAPI', {
  info: () => ipcRenderer.invoke('desktop:info'),
  connectWs: (input) => ipcRenderer.invoke('desktop:connect-ws', input),
  disconnect: () => ipcRenderer.invoke('desktop:disconnect'),
  openReportPath: (p) => ipcRenderer.invoke('desktop:open-report-path', p),
  pickReportDir: () => ipcRenderer.invoke('desktop:pick-report-dir'),
  showInFolder: (p) => ipcRenderer.invoke('desktop:show-in-folder', p),
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  saveSettings: (partial) => ipcRenderer.invoke('desktop:save-settings', partial),
  pickHubDir: () => ipcRenderer.invoke('desktop:pick-hub-dir'),
  listHistory: (hubDir) => ipcRenderer.invoke('desktop:list-history', hubDir),
  openHistoryRun: (entry) => ipcRenderer.invoke('desktop:open-history-run', entry),
  exportReport: (kind) => ipcRenderer.invoke('desktop:export-report', kind),
  pickGaugeProject: () => ipcRenderer.invoke('desktop:pick-gauge-project'),
  gaugeStatus: () => ipcRenderer.invoke('desktop:gauge-status'),
  startGauge: (opts) => ipcRenderer.invoke('desktop:start-gauge', opts),
  stopGauge: (sessionId) => ipcRenderer.invoke('desktop:stop-gauge', sessionId),
  listSessions: () => ipcRenderer.invoke('desktop:list-sessions'),
  setActiveSession: (id) => ipcRenderer.invoke('desktop:set-active-session', id),
  compareHistoryRuns,
  formatDurationDelta,
  formatCountsDelta,
  onBridgeStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('bridge-status', handler);
    return () => ipcRenderer.removeListener('bridge-status', handler);
  },
  onReportGenerated: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('report-generated', handler);
    return () => ipcRenderer.removeListener('report-generated', handler);
  },
  onNavigateLive: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('navigate-live', handler);
    return () => ipcRenderer.removeListener('navigate-live', handler);
  },
  onNavigateReport: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('navigate-report', handler);
    return () => ipcRenderer.removeListener('navigate-report', handler);
  },
  onSnapshotMeta: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('report-snapshot-meta', handler);
    return () => ipcRenderer.removeListener('report-snapshot-meta', handler);
  },
  onGaugeLog: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('gauge-log', handler);
    return () => ipcRenderer.removeListener('gauge-log', handler);
  },
  onGaugeDiscover: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('gauge-discover', handler);
    return () => ipcRenderer.removeListener('gauge-discover', handler);
  },
  onGaugeStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('gauge-status', handler);
    return () => ipcRenderer.removeListener('gauge-status', handler);
  },
  onSessionsUpdated: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('sessions-updated', handler);
    return () => ipcRenderer.removeListener('sessions-updated', handler);
  },
});
