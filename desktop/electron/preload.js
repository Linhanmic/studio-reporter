'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const {
  compareHistoryRuns,
  invertCompareResult,
  formatDurationDelta,
  formatCountsDelta,
  buildCompareShareMarkdown,
  buildCompareShareCardHtml,
  inspectCompareShareCardHtml,
  buildCompareShareJson,
  suggestedCompareShareBasename,
  COMPARE_CARD_TEMPLATES,
  normalizeCompareCardTemplate,
  normalizeCompareCardTitle,
  filterScenarioCompare,
  normalizeScenarioCompareKinds,
  SCENARIO_COMPARE_KIND_FILTERS,
} = require('./compare.js');
const {
  filterHistoryRuns,
  listFailedHistoryRuns,
  normalizeHistoryVerdict,
  normalizeHistoryQuery,
  normalizeHistoryTrendLimit,
  normalizeHistoryTrendFlakyLimit,
  HISTORY_TREND_LIMIT_DEFAULT,
  HISTORY_TREND_FLAKY_LIMIT_DEFAULT,
} = require('./settings.js');
const {
  buildHistoryTrend,
  listFlakyScenarios,
  sparkline,
  formatTrendDuration,
  DEFAULT_TREND_LIMIT,
  DEFAULT_FLAKY_LIMIT,
} = require('./history-trend.js');
const {
  buildHistoryFailDigest,
  formatHistoryFailDigestMarkdown,
  formatHistoryFailDigestJson,
  buildHistoryFailDigestOpenLinks,
  probeHistoryFailDigestSidecars,
} = require('./history-digest.js');
const { buildCompareDeepLink, buildOpenDeepLink, buildHistoryOpenDeepLinks } = require('./deeplink.js');
const {
  parseShareHash,
  formatShareHash,
  reportOpenHashFromOutline,
  reportFocusHash,
  appendShareHash,
} = require('./share-hash.js');
const {
  listFailScenarioIds,
  nextFailScenarioId,
  prepareFailJumpFilter,
} = require('./outline.js');
const {
  OUTLINE_ROW_HEIGHT,
  OUTLINE_OVERSCAN,
  flattenOutlineRows,
  computeVirtualWindow,
  findOutlineRowIndex,
  scrollTopForRowIndex,
} = require('./outline-virtual.js');
const {
  matchShortcut,
  shouldIgnoreShortcutTarget,
  nextTab,
  TAB_ORDER,
} = require('./shortcuts.js');
const { normalizeTheme, resolveTheme, THEMES } = require('./theme.js');
const {
  scenarioDiffKindLabel,
  invertScenarioCompare,
} = require('./scenario-compare.js');
const {
  exportProgressPercent,
  exportProgressBasename,
  exportKindLabel,
  formatExportProgress,
} = require('./export-progress.js');

contextBridge.exposeInMainWorld('desktopAPI', {
  info: () => ipcRenderer.invoke('desktop:info'),
  connectWs: (input) => ipcRenderer.invoke('desktop:connect-ws', input),
  disconnect: () => ipcRenderer.invoke('desktop:disconnect'),
  openReportPath: (p) => ipcRenderer.invoke('desktop:open-report-path', p),
  pickReportDir: () => ipcRenderer.invoke('desktop:pick-report-dir'),
  openUhilreport: (p) => ipcRenderer.invoke('desktop:open-uhilreport', p),
  pickUhilreport: () => ipcRenderer.invoke('desktop:pick-uhilreport'),
  showInFolder: (p) => ipcRenderer.invoke('desktop:show-in-folder', p),
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  saveSettings: (partial) => ipcRenderer.invoke('desktop:save-settings', partial),
  detectPlugin: () => ipcRenderer.invoke('desktop:detect-plugin'),
  getUpdaterStatus: () => ipcRenderer.invoke('desktop:updater-status'),
  checkUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
  quitAndInstall: () => ipcRenderer.invoke('desktop:quit-and-install'),
  pickHubDir: () => ipcRenderer.invoke('desktop:pick-hub-dir'),
  listHistory: (hubDir) => ipcRenderer.invoke('desktop:list-history', hubDir),
  openHistoryRun: (entry, opts) => ipcRenderer.invoke('desktop:open-history-run', entry, opts || {}),
  exportReport: (kind, entry) => ipcRenderer.invoke('desktop:export-report', kind, entry),
  cancelExport: () => ipcRenderer.invoke('desktop:cancel-export'),
  onExportProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('desktop:export-progress', handler);
    return () => ipcRenderer.removeListener('desktop:export-progress', handler);
  },
  formatExportProgress,
  exportProgressPercent,
  exportProgressBasename,
  exportKindLabel,
  deleteHistoryRuns: (ids) => ipcRenderer.invoke('desktop:delete-history-runs', ids),
  revealHistoryRun: (entry) => ipcRenderer.invoke('desktop:reveal-history-run', entry),
  copyHistoryPath: (entry, kind) => ipcRenderer.invoke('desktop:copy-history-path', entry, kind),
  exportCompareCard: (cmp, opts) => ipcRenderer.invoke('desktop:export-compare-card', cmp, opts),
  copyCompareMarkdown: (cmp, opts) => ipcRenderer.invoke('desktop:copy-compare-markdown', cmp, opts),
  copyCompareJson: (cmp, opts) => ipcRenderer.invoke('desktop:copy-compare-json', cmp, opts),
  copyCompareDeepLink: (payload) => ipcRenderer.invoke('desktop:copy-compare-deeplink', payload),
  copyOpenDeepLink: (payload) => ipcRenderer.invoke('desktop:copy-open-deeplink', payload),
  copyOpenDeepLinks: (payload) => ipcRenderer.invoke('desktop:copy-open-deeplinks', payload),
  popupHistoryMenu: (opts) => ipcRenderer.invoke('desktop:popup-history-menu', opts || {}),
  buildCompareDeepLink,
  buildOpenDeepLink,
  buildHistoryOpenDeepLinks,
  parseShareHash,
  formatShareHash,
  reportOpenHashFromOutline,
  reportFocusHash,
  appendShareHash,
  openPath: (p) => ipcRenderer.invoke('desktop:open-path', p),
  revealPath: (p) => ipcRenderer.invoke('desktop:reveal-path', p),
  filterHistoryRuns,
  listFailedHistoryRuns,
  matchShortcut,
  shouldIgnoreShortcutTarget,
  nextTab,
  TAB_ORDER,
  normalizeTheme,
  resolveTheme,
  THEMES,
  pickGaugeProject: () => ipcRenderer.invoke('desktop:pick-gauge-project'),
  gaugeStatus: () => ipcRenderer.invoke('desktop:gauge-status'),
  startGauge: (opts) => ipcRenderer.invoke('desktop:start-gauge', opts),
  stopGauge: (sessionId) => ipcRenderer.invoke('desktop:stop-gauge', sessionId),
  listSessions: () => ipcRenderer.invoke('desktop:list-sessions'),
  setActiveSession: (id) => ipcRenderer.invoke('desktop:set-active-session', id),
  compareHistoryRuns,
  invertCompareResult,
  buildHistoryTrend,
  listFlakyScenarios,
  sparkline,
  formatTrendDuration,
  DEFAULT_TREND_LIMIT,
  DEFAULT_FLAKY_LIMIT,
  normalizeHistoryVerdict,
  normalizeHistoryQuery,
  normalizeHistoryTrendLimit,
  normalizeHistoryTrendFlakyLimit,
  buildHistoryFailDigest,
  formatHistoryFailDigestMarkdown,
  formatHistoryFailDigestJson,
  buildHistoryFailDigestOpenLinks,
  probeHistoryFailDigestSidecars,
  refreshFailDigestSidecars: (hubDir) => ipcRenderer.invoke('desktop:refresh-fail-digest', hubDir),
  loadHistoryTrendBundle: (opts) => ipcRenderer.invoke('desktop:history-trend-bundle', opts || {}),
  compareScenariosForRuns: (base, target) =>
    ipcRenderer.invoke('desktop:compare-scenarios', base, target),
  scenarioDiffKindLabel,
  invertScenarioCompare,
  filterScenarioCompare,
  normalizeScenarioCompareKinds,
  SCENARIO_COMPARE_KIND_FILTERS,
  formatDurationDelta,
  formatCountsDelta,
  buildCompareShareMarkdown,
  buildCompareShareCardHtml,
  inspectCompareShareCardHtml,
  buildCompareShareJson,
  suggestedCompareShareBasename,
  COMPARE_CARD_TEMPLATES,
  normalizeCompareCardTemplate,
  normalizeCompareCardTitle,
  listFailScenarioIds,
  nextFailScenarioId,
  prepareFailJumpFilter,
  OUTLINE_ROW_HEIGHT,
  OUTLINE_OVERSCAN,
  flattenOutlineRows,
  computeVirtualWindow,
  findOutlineRowIndex,
  scrollTopForRowIndex,
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
  onSettingsUpdated: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('settings-updated', handler);
    return () => ipcRenderer.removeListener('settings-updated', handler);
  },
  onHistoryChanged: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('history-changed', handler);
    return () => ipcRenderer.removeListener('history-changed', handler);
  },
  onNavigateTab: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('navigate-tab', handler);
    return () => ipcRenderer.removeListener('navigate-tab', handler);
  },
  onNavigateCompare: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('navigate-compare', handler);
    return () => ipcRenderer.removeListener('navigate-compare', handler);
  },
  onDesktopShortcut: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('desktop-shortcut', handler);
    return () => ipcRenderer.removeListener('desktop-shortcut', handler);
  },
  onSnapshotMeta: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('report-snapshot-meta', handler);
    return () => ipcRenderer.removeListener('report-snapshot-meta', handler);
  },
  onReportOutline: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('report-outline', handler);
    return () => ipcRenderer.removeListener('report-outline', handler);
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
  onUpdaterStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('updater-status', handler);
    return () => ipcRenderer.removeListener('updater-status', handler);
  },
});
