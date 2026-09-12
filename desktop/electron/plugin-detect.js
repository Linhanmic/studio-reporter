'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MIN_PLUGIN_VERSION, compareSemver, parseSemver } = require('./compat.js');

const PLUGIN_ID = 'studio-reporter';

/**
 * Candidate Gauge plugins roots (first existing wins for default scan;
 * detectInstalledPlugin scans all and merges versions).
 * @param {{homedir?: string, env?: NodeJS.ProcessEnv, platform?: string}} [opts]
 * @returns {string[]}
 */
function candidatePluginsRoots(opts = {}) {
  const env = opts.env || process.env;
  const home = opts.homedir || os.homedir();
  const platform = opts.platform || process.platform;
  const roots = [];
  if (env.GAUGE_HOME) {
    roots.push(path.join(env.GAUGE_HOME, 'plugins'));
  }
  roots.push(path.join(home, '.gauge', 'plugins'));
  if (platform === 'win32' && env.APPDATA) {
    roots.push(path.join(env.APPDATA, 'Gauge', 'plugins'));
  }
  return [...new Set(roots)];
}

/**
 * Read one version directory; prefer plugin.json.version.
 * @returns {{version: string, path: string}|null}
 */
function readPluginVersionDir(versionDir) {
  const jsonPath = path.join(versionDir, 'plugin.json');
  let version = null;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed.id !== PLUGIN_ID) return null;
    if (parsed?.version) version = String(parsed.version).trim();
  } catch {
    /* fall through to dirname */
  }
  if (!version) {
    version = path.basename(versionDir);
  }
  if (!parseSemver(version)) return null;
  return { version, path: versionDir };
}

/**
 * List installed studio-reporter versions under a plugins root.
 * @param {string} pluginsRoot
 * @returns {{version: string, path: string}[]}
 */
function listInstalledVersions(pluginsRoot) {
  const base = path.join(pluginsRoot, PLUGIN_ID);
  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const info = readPluginVersionDir(path.join(base, ent.name));
    if (info) out.push(info);
  }
  return out;
}

/**
 * Evaluate install against Desktop min version.
 * @param {{found: boolean, version: string|null}} install
 * @param {string} [minVersion]
 */
function evaluateInstall(install, minVersion = MIN_PLUGIN_VERSION) {
  if (!install?.found || !install.version) {
    return {
      ok: false,
      level: 'error',
      message: `未检测到 Gauge 插件 ${PLUGIN_ID}（期望目录 ~/.gauge/plugins/${PLUGIN_ID}/）`,
    };
  }
  if (compareSemver(install.version, minVersion) < 0) {
    return {
      ok: false,
      level: 'warn',
      message: `已安装插件 ${install.version}，Desktop 需要 ≥ ${minVersion}`,
    };
  }
  return {
    ok: true,
    level: 'ok',
    message: `已安装插件 ${install.version}`,
  };
}

/**
 * Detect on-disk Gauge studio-reporter plugin (highest semver).
 * @param {{
 *   pluginsRoot?: string,
 *   pluginsRoots?: string[],
 *   homedir?: string,
 *   env?: NodeJS.ProcessEnv,
 *   platform?: string,
 *   minVersion?: string,
 * }} [opts]
 */
function detectInstalledPlugin(opts = {}) {
  const roots = opts.pluginsRoot
    ? [opts.pluginsRoot]
    : opts.pluginsRoots || candidatePluginsRoots(opts);
  /** @type {Map<string, {version: string, path: string}>} */
  const byVersion = new Map();
  for (const root of roots) {
    for (const info of listInstalledVersions(root)) {
      const prev = byVersion.get(info.version);
      if (!prev) byVersion.set(info.version, info);
    }
  }
  const versions = [...byVersion.values()].sort((a, b) =>
    compareSemver(b.version, a.version)
  );
  const latest = versions[0] || null;
  const base = {
    found: Boolean(latest),
    version: latest?.version || null,
    path: latest?.path || null,
    latest: latest?.version || null,
    versions: versions.map((v) => v.version),
    pluginsRoots: roots,
  };
  const evaled = evaluateInstall(base, opts.minVersion);
  return { ...base, ...evaled };
}

module.exports = {
  PLUGIN_ID,
  candidatePluginsRoots,
  listInstalledVersions,
  readPluginVersionDir,
  evaluateInstall,
  detectInstalledPlugin,
};
