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
  autoCheckUpdates: false,
};

function settingsPath(userDataDir) {
  return path.join(userDataDir, 'desktop-settings.json');
}

function loadSettings(userDataDir) {
  try {
    const raw = fs.readFileSync(settingsPath(userDataDir), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(userDataDir, partial) {
  const next = { ...loadSettings(userDataDir), ...partial };
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
  const verdict = String(opts.verdict || 'all')
    .trim()
    .toLowerCase();
  const wantVerdict = verdict && verdict !== 'all';
  return list.filter((run) => {
    if (wantVerdict && String(run.verdict || '').toLowerCase() !== verdict) return false;
    if (!query) return true;
    const hay = [
      run.id,
      run.projectName,
      run.timestamp,
      run.timestampISO,
      run.href,
      run.relDir,
      run.duration,
    ]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    return hay.includes(query);
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
  settingsPath,
  loadSettings,
  saveSettings,
  readHistory,
  resolveRunIndex,
  resolveRunDir,
  resolveRunUhilreport,
  filterHistoryRuns,
  writeHistoryFile,
  deleteHistoryRun,
  deleteHistoryRuns,
};
