'use strict';

const PROTOCOL = 'studio-reporter';

/**
 * Parse a studio-reporter:// deep link into a normalized action.
 * Supported:
 *   studio-reporter://open?path=/abs/index.html
 *   studio-reporter://open?path=/abs/run.uhilreport
 *   studio-reporter://open?dir=/abs/report-dir
 *   studio-reporter://open?run=<runId>[&hub=/abs/hub][&focus=scn:…][&failSteps=1]
 *   studio-reporter://connect?url=ws://127.0.0.1:1234
 *   studio-reporter://hub?dir=/abs/hub
 *   studio-reporter://compare?base=<runId>&target=<runId>[&hub=/abs/hub][&kinds=regressed,fixed]
 *
 * @param {string} raw
 * @returns {{ok: true, action: string, path?: string, dir?: string, url?: string, base?: string, target?: string, hub?: string, kinds?: string[], run?: string, focus?: string, failSteps?: boolean}|{ok: false, error: string}}
 */
/**
 * Parse optional boolean failSteps from query string.
 * @param {URLSearchParams} params
 * @returns {boolean}
 */
function parseFailStepsParam(params) {
  const raw =
    params.get('failSteps') ||
    params.get('fail-steps') ||
    params.get('fail_steps') ||
    '';
  return ['1', 'true', 'yes'].includes(String(raw).toLowerCase());
}

/**
 * Parse optional compare kind filter from query string.
 * Accepts `kinds=a,b` and/or repeated `kind=a&kind=b`.
 * Unknown tokens are dropped; empty ⇒ null (no filter).
 * @param {URLSearchParams} params
 * @returns {string[]|null}
 */
function parseCompareKindsParam(params) {
  const { normalizeScenarioCompareKinds } = require('./compare.js');
  const raw = [];
  const joined = params.get('kinds') || params.get('kind') || '';
  if (joined) {
    for (const part of String(joined).split(/[,+\s]+/)) {
      const t = part.trim();
      if (t) raw.push(t);
    }
  }
  for (const v of params.getAll('kind')) {
    const t = String(v || '').trim();
    if (t) raw.push(t);
  }
  // Also allow repeated kinds=
  for (const v of params.getAll('kinds')) {
    for (const part of String(v || '').split(/[,+\s]+/)) {
      const t = part.trim();
      if (t) raw.push(t);
    }
  }
  return normalizeScenarioCompareKinds(raw);
}

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
    const run =
      url.searchParams.get('run') ||
      url.searchParams.get('runId') ||
      url.searchParams.get('id') ||
      '';
    const hub = url.searchParams.get('hub') || '';
    const focus =
      url.searchParams.get('focus') ||
      url.searchParams.get('scn') ||
      url.searchParams.get('node') ||
      '';
    const failSteps = parseFailStepsParam(url.searchParams);
    if (!filePath && !dir && !run) {
      return { ok: false, error: 'open requires path, dir, or run' };
    }
    return {
      ok: true,
      action: 'open',
      path: filePath || undefined,
      dir: dir || undefined,
      run: run || undefined,
      hub: hub || undefined,
      focus: focus || undefined,
      failSteps: failSteps || undefined,
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
    const kinds = parseCompareKindsParam(url.searchParams);
    return {
      ok: true,
      action: 'compare',
      base,
      target,
      hub: hub || undefined,
      kinds: kinds || undefined,
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

/**
 * Build a shareable compare deep link for two history run ids.
 * @param {{ base: string, target: string, hub?: string, kinds?: string[]|null }} opts
 * @returns {string}
 */
function buildCompareDeepLink(opts = {}) {
  const base = String(opts.base || '').trim();
  const target = String(opts.target || '').trim();
  if (!base || !target) {
    throw new Error('compare deep link requires base and target');
  }
  if (base === target) {
    throw new Error('compare deep link base and target must differ');
  }
  const params = new URLSearchParams();
  params.set('base', base);
  params.set('target', target);
  const hub = String(opts.hub || '').trim();
  if (hub) params.set('hub', hub);
  const { normalizeScenarioCompareKinds } = require('./compare.js');
  const kinds = normalizeScenarioCompareKinds(opts.kinds);
  if (kinds && kinds.length) params.set('kinds', kinds.join(','));
  return `${PROTOCOL}://compare?${params.toString()}`;
}

/**
 * Build a shareable open deep link (report dir/path or history run + optional focus).
 * @param {{
 *   path?: string,
 *   dir?: string,
 *   run?: string,
 *   hub?: string,
 *   focus?: string,
 *   failSteps?: boolean,
 * }} opts
 * @returns {string}
 */
function buildOpenDeepLink(opts = {}) {
  const filePath = String(opts.path || '').trim();
  const dir = String(opts.dir || '').trim();
  const run = String(opts.run || opts.runId || opts.id || '').trim();
  if (!filePath && !dir && !run) {
    throw new Error('open deep link requires path, dir, or run');
  }
  const params = new URLSearchParams();
  if (filePath) params.set('path', filePath);
  else if (dir) params.set('dir', dir);
  if (run) params.set('run', run);
  const hub = String(opts.hub || '').trim();
  if (hub) params.set('hub', hub);
  const focus = String(opts.focus || opts.scn || opts.node || '').trim();
  if (focus) params.set('focus', focus);
  if (opts.failSteps) params.set('failSteps', '1');
  return `${PROTOCOL}://open?${params.toString()}`;
}

/**
 * Queue deep links until the renderer is ready (cold start / early open-url).
 * Dedupes consecutive identical raw URLs while queued.
 *
 * @param {{
 *   parse?: (raw: string) => {ok: boolean, error?: string, [k: string]: unknown},
 *   handle: (parsed: object) => (object|Promise<object>),
 *   onIgnored?: (parsed: object, raw: string) => void,
 * }} options
 */
function createDeepLinkQueue(options = {}) {
  const parse = typeof options.parse === 'function' ? options.parse : parseDeepLink;
  const handle = options.handle;
  if (typeof handle !== 'function') {
    throw new Error('createDeepLinkQueue requires handle(parsed)');
  }
  const onIgnored = typeof options.onIgnored === 'function' ? options.onIgnored : null;
  let ready = false;
  /** @type {string[]} */
  const pending = [];

  return {
    get ready() {
      return ready;
    },
    get pendingCount() {
      return pending.length;
    },
    peekPending() {
      return pending.slice();
    },
    /**
     * @param {string} raw
     * @returns {Promise<{ok: boolean, queued?: boolean, error?: string, [k: string]: unknown}>}
     */
    async enqueue(raw) {
      const parsed = parse(raw);
      if (!parsed || !parsed.ok) {
        if (onIgnored) onIgnored(parsed || { ok: false, error: 'invalid' }, raw);
        return parsed && typeof parsed === 'object'
          ? parsed
          : { ok: false, error: 'invalid deep link' };
      }
      if (!ready) {
        const text = String(raw || '');
        if (pending[pending.length - 1] !== text) pending.push(text);
        return { ok: true, queued: true, action: parsed.action };
      }
      return handle(parsed);
    },
    /**
     * Mark ready and drain the queue in order.
     * @returns {Promise<object[]>}
     */
    async flush() {
      ready = true;
      const queued = pending.splice(0, pending.length);
      const results = [];
      for (const raw of queued) {
        results.push(await this.enqueue(raw));
      }
      return results;
    },
  };
}

module.exports = {
  PROTOCOL,
  parseDeepLink,
  parseCompareKindsParam,
  parseFailStepsParam,
  extractDeepLinkFromArgv,
  buildCompareDeepLink,
  buildOpenDeepLink,
  createDeepLinkQueue,
};
