'use strict';

/**
 * Desktop ↔ plugin compatibility gate (ServerHello).
 * Min version: control channel with versioned ServerHello (0.5.0+).
 */

const MIN_PLUGIN_VERSION = '0.5.0';
const REQUIRED_CAPABILITIES = ['ReportSnapshot', 'ReportGenerated', 'RequestSnapshot'];

/**
 * @param {string} version
 * @returns {{major:number,minor:number,patch:number}|null}
 */
function parseSemver(version) {
  const m = String(version || '')
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)/i);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/**
 * @returns {number} negative if a < b, 0 if equal, positive if a > b; nulls sort lowest
 */
function compareSemver(a, b) {
  const pa = typeof a === 'string' ? parseSemver(a) : a;
  const pb = typeof b === 'string' ? parseSemver(b) : b;
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/**
 * Evaluate ServerHello payload for Desktop compatibility.
 * @param {object|null|undefined} hello
 */
function checkPluginHello(hello) {
  const version = hello?.version ? String(hello.version) : '';
  const caps = Array.isArray(hello?.capabilities)
    ? hello.capabilities.map(String)
    : [];
  const missingCaps = REQUIRED_CAPABILITIES.filter((c) => !caps.includes(c));

  if (!version) {
    return {
      ok: false,
      level: 'warn',
      version: '',
      missingCaps,
      message: '插件未返回版本（ServerHello）；功能可能不完整',
    };
  }

  if (compareSemver(version, MIN_PLUGIN_VERSION) < 0) {
    return {
      ok: false,
      level: 'error',
      version,
      missingCaps,
      message: `插件版本 ${version} 过旧，Desktop 需要 ≥ ${MIN_PLUGIN_VERSION}`,
    };
  }

  if (missingCaps.length) {
    return {
      ok: false,
      level: 'warn',
      version,
      missingCaps,
      message: `插件缺少能力：${missingCaps.join(', ')}`,
    };
  }

  return {
    ok: true,
    level: 'ok',
    version,
    missingCaps: [],
    message: `插件 ${version} 兼容`,
  };
}

module.exports = {
  MIN_PLUGIN_VERSION,
  REQUIRED_CAPABILITIES,
  parseSemver,
  compareSemver,
  checkPluginHello,
};
