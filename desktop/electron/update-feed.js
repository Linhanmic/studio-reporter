'use strict';

/**
 * Offline helpers for electron-updater GitHub release feeds (latest*.yml).
 * Pure parsing/validation — no network. Used by unit tests and pack/release checks.
 */

const FEED_FILES = {
  linux: 'latest-linux.yml',
  win: 'latest.yml',
  mac: 'latest-mac.yml',
};

/**
 * @param {string} platform  linux | win | mac
 * @returns {string}
 */
function expectedFeedFileName(platform) {
  const key = String(platform || '')
    .trim()
    .toLowerCase();
  if (key === 'windows' || key === 'win32') return FEED_FILES.win;
  if (key === 'darwin' || key === 'macos') return FEED_FILES.mac;
  if (key === 'linux') return FEED_FILES.linux;
  if (FEED_FILES[key]) return FEED_FILES[key];
  throw new Error(`unsupported update feed platform: ${platform}`);
}

/**
 * Minimal YAML subset parser for electron-builder latest*.yml.
 * Supports: top-level scalars, `files:` list of maps with indented keys.
 * @param {string} text
 * @returns {{ version?: string, path?: string, sha512?: string, releaseDate?: string, files: Array<Record<string, string|number>> }}
 */
function parseUpdateFeedYaml(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = { files: [] };
  let currentFile = null;
  let inFiles = false;

  const flushFile = () => {
    if (currentFile && Object.keys(currentFile).length) {
      out.files.push(currentFile);
    }
    currentFile = null;
  };

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const filesMatch = raw.match(/^files:\s*$/);
    if (filesMatch) {
      flushFile();
      inFiles = true;
      continue;
    }
    if (inFiles) {
      const item = raw.match(/^\s*-\s+(.*)$/);
      if (item) {
        flushFile();
        currentFile = {};
        const rest = item[1].trim();
        if (rest.includes(':')) {
          const idx = rest.indexOf(':');
          const k = rest.slice(0, idx).trim();
          const v = rest.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
          if (k) currentFile[k] = coerceScalar(v);
        }
        continue;
      }
      const nested = raw.match(/^\s{2,}([A-Za-z0-9_]+):\s*(.*)$/);
      if (nested && currentFile) {
        const k = nested[1];
        const v = nested[2].trim().replace(/^["']|["']$/g, '');
        currentFile[k] = coerceScalar(v);
        continue;
      }
      // Dedented non-list key ends files block
      if (/^[A-Za-z0-9_]+:/.test(raw)) {
        flushFile();
        inFiles = false;
      } else {
        continue;
      }
    }
    const kv = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      const k = kv[1];
      const v = kv[2].trim().replace(/^["']|["']$/g, '');
      if (k === 'files') {
        inFiles = true;
        continue;
      }
      out[k] = coerceScalar(v);
    }
  }
  flushFile();
  return out;
}

function coerceScalar(v) {
  if (v === '') return '';
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

/**
 * Validate a parsed feed against electron-updater expectations.
 * @param {object} feed
 * @param {{ platform?: string, requireSha512?: boolean }} [opts]
 * @returns {{ ok: boolean, errors: string[], warnings: string[], feed: object }}
 */
function validateUpdateFeed(feed, opts = {}) {
  const errors = [];
  const warnings = [];
  const f = feed && typeof feed === 'object' ? feed : {};
  const version = String(f.version || '').trim();
  if (!version) errors.push('missing version');
  else if (!/^\d+\.\d+\.\d+/.test(version)) {
    warnings.push(`version looks non-semver: ${version}`);
  }

  const files = Array.isArray(f.files) ? f.files : [];
  if (!files.length) errors.push('missing files[]');
  for (let i = 0; i < files.length; i++) {
    const file = files[i] || {};
    if (!file.url && !file.path) errors.push(`files[${i}] missing url/path`);
    if (opts.requireSha512 !== false && !file.sha512 && !f.sha512) {
      errors.push(`files[${i}] missing sha512 (and top-level sha512)`);
    }
  }

  if (!f.path && files[0]?.url) {
    warnings.push('missing top-level path (electron-builder usually sets it)');
  }
  if (opts.platform) {
    try {
      expectedFeedFileName(opts.platform);
    } catch (err) {
      errors.push(String(err.message || err));
    }
  }

  return { ok: errors.length === 0, errors, warnings, feed: f };
}

/**
 * Validate electron-builder publish config used by auto-update.
 * @param {unknown} publish
 * @param {{ owner: string, repo: string }} expected
 */
function validatePublishConfig(publish, expected) {
  const errors = [];
  const list = Array.isArray(publish) ? publish : publish ? [publish] : [];
  if (!list.length) {
    return { ok: false, errors: ['publish config missing'] };
  }
  const github = list.find((p) => p && p.provider === 'github') || list[0];
  if (!github || github.provider !== 'github') {
    errors.push('expected publish.provider=github for electron-updater');
  }
  if (expected?.owner && github?.owner !== expected.owner) {
    errors.push(`publish.owner mismatch: got ${github?.owner}, want ${expected.owner}`);
  }
  if (expected?.repo && github?.repo !== expected.repo) {
    errors.push(`publish.repo mismatch: got ${github?.repo}, want ${expected.repo}`);
  }
  return { ok: errors.length === 0, errors, publish: github };
}

/**
 * Build a sample latest-linux.yml body for fixtures / docs.
 * @param {{ version: string, fileName: string, sha512?: string, size?: number }} opts
 */
function buildSampleLinuxFeed(opts) {
  const version = opts.version;
  const fileName = opts.fileName;
  const sha512 = opts.sha512 || 'deadbeef';
  const size = opts.size ?? 1;
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${fileName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${fileName}`,
    `sha512: ${sha512}`,
    `releaseDate: '2026-09-11T00:00:00.000Z'`,
    '',
  ].join('\n');
}

module.exports = {
  FEED_FILES,
  expectedFeedFileName,
  parseUpdateFeedYaml,
  validateUpdateFeed,
  validatePublishConfig,
  buildSampleLinuxFeed,
};
