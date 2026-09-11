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

module.exports = {
  DEFAULTS,
  settingsPath,
  loadSettings,
  saveSettings,
  readHistory,
  resolveRunIndex,
  resolveRunUhilreport,
  filterHistoryRuns,
};
