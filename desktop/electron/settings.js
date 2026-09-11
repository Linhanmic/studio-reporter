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

module.exports = {
  DEFAULTS,
  settingsPath,
  loadSettings,
  saveSettings,
  readHistory,
  resolveRunIndex,
};
