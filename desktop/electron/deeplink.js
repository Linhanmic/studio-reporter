'use strict';

const PROTOCOL = 'studio-reporter';

/**
 * Parse a studio-reporter:// deep link into a normalized action.
 * Supported:
 *   studio-reporter://open?path=/abs/index.html
 *   studio-reporter://open?path=/abs/run.uhilreport
 *   studio-reporter://open?dir=/abs/report-dir
 *   studio-reporter://connect?url=ws://127.0.0.1:1234
 *   studio-reporter://hub?dir=/abs/hub
 *   studio-reporter://compare?base=<runId>&target=<runId>[&hub=/abs/hub]
 *
 * @param {string} raw
 * @returns {{ok: true, action: string, path?: string, dir?: string, url?: string, base?: string, target?: string, hub?: string}|{ok: false, error: string}}
 */
function parseDeepLink(raw) {
  const input = String(raw || '').trim();
  if (!input) return { ok: false, error: 'empty deep link' };

  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: 'invalid URL' };
  }

  if (url.protocol !== `${PROTOCOL}:`) {
    return { ok: false, error: `unsupported protocol: ${url.protocol}` };
  }

  const action = (url.hostname || url.pathname.replace(/^\/+/, '').split('/')[0] || '')
    .toLowerCase()
    .trim();
  if (!action) return { ok: false, error: 'missing action' };

  if (action === 'open') {
    const filePath = url.searchParams.get('path') || url.searchParams.get('file') || '';
    const dir = url.searchParams.get('dir') || '';
    if (!filePath && !dir) return { ok: false, error: 'open requires path or dir' };
    return {
      ok: true,
      action: 'open',
      path: filePath || undefined,
      dir: dir || undefined,
    };
  }

  if (action === 'connect') {
    const wsUrl = url.searchParams.get('url') || url.searchParams.get('ws') || '';
    if (!wsUrl) return { ok: false, error: 'connect requires url' };
    if (!/^wss?:\/\//i.test(wsUrl)) {
      return { ok: false, error: 'connect url must be ws:// or wss://' };
    }
    return { ok: true, action: 'connect', url: wsUrl };
  }

  if (action === 'hub') {
    const dir = url.searchParams.get('dir') || url.searchParams.get('path') || '';
    if (!dir) return { ok: false, error: 'hub requires dir' };
    return { ok: true, action: 'hub', dir };
  }

  if (action === 'compare') {
    const base =
      url.searchParams.get('base') ||
      url.searchParams.get('a') ||
      url.searchParams.get('from') ||
      '';
    const target =
      url.searchParams.get('target') ||
      url.searchParams.get('b') ||
      url.searchParams.get('to') ||
      '';
    const hub = url.searchParams.get('hub') || url.searchParams.get('dir') || '';
    if (!base || !target) {
      return { ok: false, error: 'compare requires base and target' };
    }
    if (base === target) {
      return { ok: false, error: 'compare base and target must differ' };
    }
    return {
      ok: true,
      action: 'compare',
      base,
      target,
      hub: hub || undefined,
    };
  }

  return { ok: false, error: `unknown action: ${action}` };
}

/**
 * Find a studio-reporter:// URL among process argv (Windows/Linux second-instance / cold start).
 * @param {string[]} argv
 * @returns {string|null}
 */
function extractDeepLinkFromArgv(argv) {
  const list = Array.isArray(argv) ? argv : [];
  for (const arg of list) {
    if (typeof arg === 'string' && arg.toLowerCase().startsWith(`${PROTOCOL}://`)) {
      return arg;
    }
  }
  return null;
}

module.exports = {
  PROTOCOL,
  parseDeepLink,
  extractDeepLinkFromArgv,
};
