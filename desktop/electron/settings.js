'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  reportHubDir: '',
  autoJumpToReport: true,
  autoJumpSeconds: 5,
  gaugeProjectDir: '',
  gaugeSpecs: 'specs',
  gaugeEnv: '',
  gaugeBin: 'gauge',
  recentProjects: [],
  recentHubs: [],
  lastTab: 'run',
  restoreSession: true,
  autoCheckUpdates: false,
  notifyOnSuiteEnd: true,
  watchHubHistory: true,
  theme: 'system',
  outlinePaneWidth: 240,
  outlineQuery: '',
  outlineVerdict: 'all',
  discoverTimeoutMs: 20000,
  compareCardTemplate: 'default',
  compareCardTitle: '',
  compareScenarioKinds: null,
  historyQuery: '',
  historyVerdict: 'all',
  historyFailReasonQuery: '',
  historyTrendLimit: 12,
  historyTrendFlakyLimit: 20,
};


const OUTLINE_PANE_WIDTH_MIN = 180;
const OUTLINE_PANE_WIDTH_MAX = 480;
const OUTLINE_PANE_WIDTH_DEFAULT = 240;
const DISCOVER_TIMEOUT_MS_MIN = 5000;
const DISCOVER_TIMEOUT_MS_MAX = 120000;
const DISCOVER_TIMEOUT_MS_DEFAULT = 20000;

/**
 * Clamp outline pane width to a usable pixel range.
 * @param {unknown} width
 * @param {number} [fallback=OUTLINE_PANE_WIDTH_DEFAULT]
 */
function normalizeOutlinePaneWidth(width, fallback = OUTLINE_PANE_WIDTH_DEFAULT) {
  const n = Number(width);
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : OUTLINE_PANE_WIDTH_DEFAULT;
  if (!Number.isFinite(n)) return Math.round(base);
  return Math.round(Math.min(OUTLINE_PANE_WIDTH_MAX, Math.max(OUTLINE_PANE_WIDTH_MIN, n)));
}

/**
 * Clamp discover websocket wait timeout (ms).
 * @param {unknown} ms
 * @param {number} [fallback=DISCOVER_TIMEOUT_MS_DEFAULT]
 */
function normalizeDiscoverTimeoutMs(ms, fallback = DISCOVER_TIMEOUT_MS_DEFAULT) {
  const n = Number(ms);
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : DISCOVER_TIMEOUT_MS_DEFAULT;
  if (!Number.isFinite(n)) return Math.round(base);
  return Math.round(Math.min(DISCOVER_TIMEOUT_MS_MAX, Math.max(DISCOVER_TIMEOUT_MS_MIN, n)));
}



const COMPARE_CARD_TEMPLATES = new Set(['default', 'light', 'compact']);

/**
 * Normalize compare card template preference.
 * @param {unknown} value
 * @param {string} [fallback='default']
 */
function normalizeCompareCardTemplate(value, fallback = 'default') {
  const v = String(value || '').trim().toLowerCase();
  if (COMPARE_CARD_TEMPLATES.has(v)) return v;
  const fb = String(fallback || 'default').trim().toLowerCase();
  return COMPARE_CARD_TEMPLATES.has(fb) ? fb : 'default';
}

/**
 * Normalize optional compare card title (empty allowed).
 * @param {unknown} title
 */
function normalizeCompareCardTitle(title) {
  return String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Persistable scenario-diff kind allow-list for Desktop compare panel/export.
 * null / empty / all known kinds ⇒ null (no filter).
 * @param {unknown} kinds
 * @returns {string[]|null}
 */
function normalizeCompareScenarioKindsPref(kinds) {
  const { normalizeScenarioCompareKinds, SCENARIO_COMPARE_KIND_FILTERS } = require('./compare.js');
  const list = normalizeScenarioCompareKinds(kinds);
  if (!list) return null;
  if (list.length >= SCENARIO_COMPARE_KIND_FILTERS.length) return null;
  return list;
}


const OUTLINE_VERDICTS = new Set(['all', 'pass', 'fail', 'skip']);

/**
 * Normalize outline verdict filter.
 * @param {unknown} verdict
 * @param {string} [fallback='all']
 */
function normalizeOutlineVerdict(verdict, fallback = 'all') {
  const v = String(verdict || '').trim().toLowerCase();
  if (OUTLINE_VERDICTS.has(v)) return v;
  const fb = String(fallback || 'all').trim().toLowerCase();
  return OUTLINE_VERDICTS.has(fb) ? fb : 'all';
}

/**
 * Normalize outline search query (trim, cap length).
 * @param {unknown} query
 */
function normalizeOutlineQuery(query) {
  return String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Valid Desktop renderer tab ids (must match index.html data-tab). */
const VALID_TABS = new Set(['run', 'report', 'history', 'settings']);

/**
 * Normalize lastTab to a known pane id.
 * @param {unknown} tab
 * @param {string} [fallback='run']
 */
function normalizeLastTab(tab, fallback = 'run') {
  const t = String(tab || '').trim();
  if (VALID_TABS.has(t)) return t;
  return VALID_TABS.has(fallback) ? fallback : 'run';
}

function settingsPath(userDataDir) {
  return path.join(userDataDir, 'desktop-settings.json');
}

const HISTORY_VERDICTS = new Set(['all', 'pass', 'fail', 'skip']);
const HISTORY_TREND_LIMIT_MIN = 3;
const HISTORY_TREND_LIMIT_MAX = 50;
const HISTORY_TREND_LIMIT_DEFAULT = 12;
const HISTORY_TREND_FLAKY_LIMIT_MIN = 5;
const HISTORY_TREND_FLAKY_LIMIT_MAX = 50;
const HISTORY_TREND_FLAKY_LIMIT_DEFAULT = 20;

/**
 * Normalize history verdict chip.
 * @param {unknown} verdict
 * @param {string} [fallback='all']
 */
function normalizeHistoryVerdict(verdict, fallback = 'all') {
  const v = String(verdict || '').trim().toLowerCase();
  if (HISTORY_VERDICTS.has(v)) return v;
  const fb = String(fallback || 'all').trim().toLowerCase();
  return HISTORY_VERDICTS.has(fb) ? fb : 'all';
}

/**
 * Normalize history search / fail-reason query.
 * @param {unknown} query
 */
function normalizeHistoryQuery(query) {
  return String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Clamp history trend window size.
 * @param {unknown} n
 * @param {number} [fallback=HISTORY_TREND_LIMIT_DEFAULT]
 */
function normalizeHistoryTrendLimit(n, fallback = HISTORY_TREND_LIMIT_DEFAULT) {
  const v = Number(n);
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : HISTORY_TREND_LIMIT_DEFAULT;
  if (!Number.isFinite(v)) return Math.round(base);
  return Math.round(Math.min(HISTORY_TREND_LIMIT_MAX, Math.max(HISTORY_TREND_LIMIT_MIN, v)));
}

/**
 * Clamp flaky list size for history trend panel.
 * @param {unknown} n
 * @param {number} [fallback=HISTORY_TREND_FLAKY_LIMIT_DEFAULT]
 */
function normalizeHistoryTrendFlakyLimit(n, fallback = HISTORY_TREND_FLAKY_LIMIT_DEFAULT) {
  const v = Number(n);
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : HISTORY_TREND_FLAKY_LIMIT_DEFAULT;
  if (!Number.isFinite(v)) return Math.round(base);
  return Math.round(Math.min(HISTORY_TREND_FLAKY_LIMIT_MAX, Math.max(HISTORY_TREND_FLAKY_LIMIT_MIN, v)));
}


function loadSettings(userDataDir) {
  try {
    const raw = fs.readFileSync(settingsPath(userDataDir), 'utf8');
    const merged = { ...DEFAULTS, ...JSON.parse(raw) };
    merged.recentProjects = Array.isArray(merged.recentProjects) ? merged.recentProjects : [];
    merged.recentHubs = Array.isArray(merged.recentHubs) ? merged.recentHubs : [];
    merged.lastTab = normalizeLastTab(merged.lastTab);
    merged.restoreSession = merged.restoreSession !== false;
    merged.outlinePaneWidth = normalizeOutlinePaneWidth(merged.outlinePaneWidth);
    merged.outlineQuery = normalizeOutlineQuery(merged.outlineQuery);
    merged.outlineVerdict = normalizeOutlineVerdict(merged.outlineVerdict);
    merged.discoverTimeoutMs = normalizeDiscoverTimeoutMs(merged.discoverTimeoutMs);
    merged.compareCardTemplate = normalizeCompareCardTemplate(merged.compareCardTemplate);
    merged.compareCardTitle = normalizeCompareCardTitle(merged.compareCardTitle);
    merged.compareScenarioKinds = normalizeCompareScenarioKindsPref(merged.compareScenarioKinds);
    merged.historyQuery = normalizeHistoryQuery(merged.historyQuery);
    merged.historyFailReasonQuery = normalizeHistoryQuery(merged.historyFailReasonQuery);
    merged.historyVerdict = normalizeHistoryVerdict(merged.historyVerdict);
    merged.historyTrendLimit = normalizeHistoryTrendLimit(merged.historyTrendLimit);
    merged.historyTrendFlakyLimit = normalizeHistoryTrendFlakyLimit(merged.historyTrendFlakyLimit);
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(userDataDir, partial) {
  const patch = { ...(partial || {}) };
  if (Object.prototype.hasOwnProperty.call(patch, 'lastTab')) {
    patch.lastTab = normalizeLastTab(patch.lastTab);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'restoreSession')) {
    patch.restoreSession = patch.restoreSession !== false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'outlinePaneWidth')) {
    patch.outlinePaneWidth = normalizeOutlinePaneWidth(patch.outlinePaneWidth);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'outlineQuery')) {
    patch.outlineQuery = normalizeOutlineQuery(patch.outlineQuery);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'outlineVerdict')) {
    patch.outlineVerdict = normalizeOutlineVerdict(patch.outlineVerdict);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'discoverTimeoutMs')) {
    patch.discoverTimeoutMs = normalizeDiscoverTimeoutMs(patch.discoverTimeoutMs);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'compareCardTemplate')) {
    patch.compareCardTemplate = normalizeCompareCardTemplate(patch.compareCardTemplate);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'compareCardTitle')) {
    patch.compareCardTitle = normalizeCompareCardTitle(patch.compareCardTitle);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'compareScenarioKinds')) {
    patch.compareScenarioKinds = normalizeCompareScenarioKindsPref(patch.compareScenarioKinds);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'historyQuery')) {
    patch.historyQuery = normalizeHistoryQuery(patch.historyQuery);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'historyFailReasonQuery')) {
    patch.historyFailReasonQuery = normalizeHistoryQuery(patch.historyFailReasonQuery);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'historyVerdict')) {
    patch.historyVerdict = normalizeHistoryVerdict(patch.historyVerdict);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'historyTrendLimit')) {
    patch.historyTrendLimit = normalizeHistoryTrendLimit(patch.historyTrendLimit);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'historyTrendFlakyLimit')) {
    patch.historyTrendFlakyLimit = normalizeHistoryTrendFlakyLimit(patch.historyTrendFlakyLimit);
  }
  const next = { ...loadSettings(userDataDir), ...patch };
  next.recentProjects = Array.isArray(next.recentProjects) ? next.recentProjects : [];
  next.recentHubs = Array.isArray(next.recentHubs) ? next.recentHubs : [];
  next.lastTab = normalizeLastTab(next.lastTab);
  next.outlinePaneWidth = normalizeOutlinePaneWidth(next.outlinePaneWidth);
  next.outlineQuery = normalizeOutlineQuery(next.outlineQuery);
  next.outlineVerdict = normalizeOutlineVerdict(next.outlineVerdict);
  next.discoverTimeoutMs = normalizeDiscoverTimeoutMs(next.discoverTimeoutMs);
  next.compareCardTemplate = normalizeCompareCardTemplate(next.compareCardTemplate);
  next.compareCardTitle = normalizeCompareCardTitle(next.compareCardTitle);
  next.compareScenarioKinds = normalizeCompareScenarioKindsPref(next.compareScenarioKinds);
  next.historyQuery = normalizeHistoryQuery(next.historyQuery);
  next.historyFailReasonQuery = normalizeHistoryQuery(next.historyFailReasonQuery);
  next.historyVerdict = normalizeHistoryVerdict(next.historyVerdict);
  next.historyTrendLimit = normalizeHistoryTrendLimit(next.historyTrendLimit);
  next.historyTrendFlakyLimit = normalizeHistoryTrendFlakyLimit(next.historyTrendFlakyLimit);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(settingsPath(userDataDir), JSON.stringify(next, null, 2));
  return next;
}

/**
 * Read history.json from a studio-report hub directory.
 * @param {string} hubDir
 */
function readHistory(hubDir) {
  if (!hubDir) return { formatVersion: 0, runs: [], hubDir: '' };
  const file = path.join(hubDir, 'history.json');
  if (!fs.existsSync(file)) {
    return { formatVersion: 0, runs: [], hubDir, error: 'history.json not found' };
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    formatVersion: data.formatVersion || 0,
    runs: Array.isArray(data.runs) ? data.runs : [],
    hubDir,
  };
}

function resolveRunIndex(hubDir, entry) {
  if (!hubDir || !entry) return null;
  const rel = entry.href || (entry.relDir ? path.join(entry.relDir, 'index.html') : '');
  if (!rel) return null;
  return path.resolve(hubDir, rel);
}

/**
 * Resolve the archive directory for a history entry (dirname of index.html).
 * @param {string} hubDir
 * @param {object} entry
 * @returns {string|null}
 */
function resolveRunDir(hubDir, entry) {
  const indexPath = resolveRunIndex(hubDir, entry);
  return indexPath ? path.dirname(indexPath) : null;
}

/**
 * Resolve a portable .uhilreport path for a history entry (hub-relative).
 * Prefers entry.jsonPath / entry.uhilreport; falls back to sibling of index.html.
 * @param {string} hubDir
 * @param {object} entry
 * @returns {string|null}
 */
function resolveRunUhilreport(hubDir, entry) {
  if (!hubDir || !entry) return null;
  const candidates = [];
  if (entry.jsonPath) candidates.push(entry.jsonPath);
  if (entry.uhilreport) candidates.push(entry.uhilreport);
  if (entry.reportFile) candidates.push(entry.reportFile);
  const indexPath = resolveRunIndex(hubDir, entry);
  if (indexPath) {
    const dir = path.dirname(indexPath);
    try {
      const files = fs.readdirSync(dir).filter((n) => n.endsWith('.uhilreport'));
      files.sort();
      if (files.length) candidates.push(path.join(dir, files[files.length - 1]));
    } catch {
      /* ignore */
    }
  }
  for (const c of candidates) {
    const abs = path.isAbsolute(c) ? c : path.resolve(hubDir, c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Filter history runs by text query and/or verdict.
 * @param {Array<object>} runs
 * @param {{query?: string, verdict?: string}} [opts]
 */
function filterHistoryRuns(runs, opts = {}) {
  const list = Array.isArray(runs) ? runs : [];
  const query = String(opts.query || '')
    .trim()
    .toLowerCase();
  const failReasonQuery = String(opts.failReasonQuery || opts.reasonQuery || '')
    .trim()
    .toLowerCase();
  const verdict = String(opts.verdict || 'all')
    .trim()
    .toLowerCase();
  const wantVerdict = verdict && verdict !== 'all';
  return list.filter((run) => {
    if (wantVerdict && String(run.verdict || '').toLowerCase() !== verdict) return false;
    if (failReasonQuery) {
      const reason = String(run.topFailReason || run.failReason || '').toLowerCase();
      if (!reason.includes(failReasonQuery)) return false;
    }
    if (!query) return true;
    const hay = [
      run.id,
      run.projectName,
      run.timestamp,
      run.timestampISO,
      run.href,
      run.relDir,
      run.duration,
      run.topFailReason,
      run.failReason,
    ]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    return hay.includes(query);
  });
}

/**
 * Failed runs from a history list (verdict=fail or failed=true).
 * @param {Array<object>} runs
 * @returns {Array<object>}
 */
function listFailedHistoryRuns(runs) {
  const list = Array.isArray(runs) ? runs : [];
  return list.filter((run) => {
    const v = String(run?.verdict || '').toLowerCase();
    return v === 'fail' || run?.failed === true;
  });
}

const RESERVED_HISTORY_NAMES = new Set([
  '',
  '.',
  '..',
  'archives',
  'assets',
  'images',
  'index.html',
  'viewer.html',
  'manage.html',
  'history.json',
  'history-live.js',
  'report.json',
  'report-live.js',
]);

function isHistoryRunDir(dir) {
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
  } catch {
    return false;
  }
  return (
    fs.existsSync(path.join(dir, 'index.html')) ||
    fs.existsSync(path.join(dir, 'report.json'))
  );
}

/**
 * Atomically rewrite history.json + history-live.js (same payload as Go writeHistoryFile).
 * @param {string} hubDir
 * @param {{formatVersion?: number, runs?: object[]}} hist
 */
function writeHistoryFile(hubDir, hist) {
  const payload = {
    formatVersion: hist?.formatVersion || 1,
    runs: Array.isArray(hist?.runs) ? hist.runs : [],
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.mkdirSync(hubDir, { recursive: true });
  const histPath = path.join(hubDir, 'history.json');
  const histTmp = `${histPath}.tmp`;
  fs.writeFileSync(histTmp, json);
  fs.renameSync(histTmp, histPath);
  const jsPath = path.join(hubDir, 'history-live.js');
  const jsTmp = `${jsPath}.tmp`;
  fs.writeFileSync(jsTmp, `window.__GAUGE_HISTORY__=${json.trim()};`);
  fs.renameSync(jsTmp, jsPath);
  return payload;
}

/**
 * Delete one archived run (mirrors Go deleteHistoryRunLocked).
 * Removes archives/<id> (or hub/<id>) then drops the history.json entry.
 * @param {string} hubDir
 * @param {string} id
 */
function deleteHistoryRun(hubDir, id) {
  if (!hubDir) throw new Error('请先设置报告根目录');
  const absRoot = path.resolve(hubDir);
  const cleanId = path.basename(String(id || '').trim());
  if (
    RESERVED_HISTORY_NAMES.has(cleanId) ||
    /[\\/]/.test(String(id || '')) ||
    cleanId.endsWith('.uhilreport')
  ) {
    throw new Error('invalid history id');
  }
  const candidates = [
    path.join(absRoot, 'archives', cleanId),
    path.join(absRoot, cleanId),
  ];
  let removed = null;
  for (const cand of candidates) {
    const abs = path.resolve(cand);
    if (abs === absRoot || !abs.startsWith(`${absRoot}${path.sep}`)) continue;
    if (!isHistoryRunDir(abs)) continue;
    fs.rmSync(abs, { recursive: true, force: true });
    removed = abs;
    break;
  }
  if (!removed) throw new Error(`history run ${cleanId} not found`);
  const hist = readHistory(absRoot);
  const nextRuns = (hist.runs || []).filter((r) => r.id !== cleanId);
  writeHistoryFile(absRoot, {
    formatVersion: hist.formatVersion || 1,
    runs: nextRuns,
  });
  return { ok: true, id: cleanId, removed };
}

/**
 * Delete multiple runs sequentially.
 * @param {string} hubDir
 * @param {string[]} ids
 */
function deleteHistoryRuns(hubDir, ids) {
  const list = [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => path.basename(String(id || '').trim()))
        .filter(Boolean)
    ),
  ];
  if (!list.length) throw new Error('未选择要删除的运行');
  const deleted = [];
  for (const id of list) {
    deleteHistoryRun(hubDir, id);
    deleted.push(id);
  }
  return { ok: true, deleted };
}

module.exports = {
  DEFAULTS,
  VALID_TABS,
  settingsPath,
  loadSettings,
  saveSettings,
  normalizeLastTab,
  normalizeOutlinePaneWidth,
  normalizeOutlineQuery,
  normalizeOutlineVerdict,
  normalizeDiscoverTimeoutMs,
  normalizeCompareCardTemplate,
  normalizeCompareCardTitle,
  normalizeCompareScenarioKindsPref,
  normalizeHistoryVerdict,
  normalizeHistoryQuery,
  normalizeHistoryTrendLimit,
  normalizeHistoryTrendFlakyLimit,
  HISTORY_VERDICTS,
  HISTORY_TREND_LIMIT_MIN,
  HISTORY_TREND_LIMIT_MAX,
  HISTORY_TREND_LIMIT_DEFAULT,
  HISTORY_TREND_FLAKY_LIMIT_MIN,
  HISTORY_TREND_FLAKY_LIMIT_MAX,
  HISTORY_TREND_FLAKY_LIMIT_DEFAULT,
  COMPARE_CARD_TEMPLATES,
  OUTLINE_VERDICTS,
  OUTLINE_PANE_WIDTH_MIN,
  OUTLINE_PANE_WIDTH_MAX,
  OUTLINE_PANE_WIDTH_DEFAULT,
  DISCOVER_TIMEOUT_MS_MIN,
  DISCOVER_TIMEOUT_MS_MAX,
  DISCOVER_TIMEOUT_MS_DEFAULT,
  readHistory,
  resolveRunIndex,
  resolveRunDir,
  resolveRunUhilreport,
  filterHistoryRuns,
  listFailedHistoryRuns,
  writeHistoryFile,
  deleteHistoryRun,
  deleteHistoryRuns,
};
