'use strict';

const { parseReportDuration } = require('./compare.js');
const {
  scenarioKey,
  scenarioLitesFromReport,
  loadReportSnapshot,
} = require('./scenario-compare.js');
const {
  buildHistoryFailDigest,
  formatHistoryFailDigestMarkdown,
} = require('./history-digest.js');

const DEFAULT_TREND_LIMIT = 12;
const DEFAULT_FLAKY_LIMIT = 20;

/**
 * Chronological order: oldest → newest (sparkline left→right).
 * @param {object[]} runs
 * @returns {object[]}
 */
function sortRunsChrono(runs) {
  return [...(Array.isArray(runs) ? runs : [])].sort((a, b) => {
    const ta = Date.parse(String(a?.timestampISO || a?.timestamp || '')) || 0;
    const tb = Date.parse(String(b?.timestampISO || b?.timestamp || '')) || 0;
    if (ta !== tb) return ta - tb;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

/**
 * @param {object} summary
 */
function scenarioCounts(summary) {
  const sc = summary?.scenarios || {};
  return {
    total: Number(sc.total) || 0,
    passed: Number(sc.passed) || 0,
    failed: Number(sc.failed) || 0,
    skipped: Number(sc.skipped) || 0,
  };
}

/**
 * Suite-level trend from history.json runs (no report.json).
 * @param {object[]} runs
 * @param {{ limit?: number }} [opts]
 */
function buildHistoryTrend(runs, opts = {}) {
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || DEFAULT_TREND_LIMIT));
  const chrono = sortRunsChrono(runs).slice(-limit);
  const points = chrono.map((run) => {
    const durationMs = parseReportDuration(run.duration);
    const verdict = String(run.verdict || '').toLowerCase();
    const failed = Boolean(run.failed) || verdict === 'fail';
    const sc = scenarioCounts(run.summary);
    const passRate = sc.total > 0 ? sc.passed / sc.total : verdict === 'pass' ? 1 : 0;
    return {
      id: String(run.id || ''),
      projectName: String(run.projectName || ''),
      timestamp: String(run.timestamp || ''),
      timestampISO: String(run.timestampISO || ''),
      duration: String(run.duration || ''),
      durationMs,
      verdict: verdict || (failed ? 'fail' : ''),
      failed,
      topFailReason: String(run.topFailReason || run.failReason || ''),
      scenarios: sc,
      passRate,
    };
  });

  let failCount = 0;
  let passCount = 0;
  let skipCount = 0;
  let durationSum = 0;
  let maxDurationMs = 0;
  for (const p of points) {
    if (p.failed || p.verdict === 'fail') failCount += 1;
    else if (p.verdict === 'skip') skipCount += 1;
    else if (p.verdict === 'pass') passCount += 1;
    durationSum += p.durationMs;
    if (p.durationMs > maxDurationMs) maxDurationMs = p.durationMs;
  }
  const runCount = points.length;
  return {
    points,
    stats: {
      runCount,
      failCount,
      passCount,
      skipCount,
      avgDurationMs: runCount ? Math.round(durationSum / runCount) : 0,
      maxDurationMs,
      failRate: runCount ? failCount / runCount : 0,
    },
  };
}

/**
 * @param {number[]} values
 * @param {{ max?: number }} [opts]
 */
function sparkline(values, opts = {}) {
  const bars = '▁▂▃▄▅▆▇█';
  const nums = (Array.isArray(values) ? values : []).map((n) => Number(n) || 0);
  if (!nums.length) return '';
  const max =
    Number.isFinite(Number(opts.max)) && Number(opts.max) > 0
      ? Number(opts.max)
      : Math.max(...nums, 1);
  return nums
    .map((n) => {
      const idx = Math.max(0, Math.min(bars.length - 1, Math.round((n / max) * (bars.length - 1))));
      return bars[idx];
    })
    .join('');
}

/**
 * @param {number} ms
 */
function formatTrendDuration(ms) {
  const n = Number(ms) || 0;
  if (n < 1000) return `${n}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`;
  const m = Math.floor(n / 60_000);
  const s = Math.round((n % 60_000) / 1000);
  return `${m}m${String(s).padStart(2, '0')}s`;
}

/**
 * @param {{ runId: string, lites: object[] }[]} runsWithLites
 * @param {{ minRuns?: number, minFlips?: number, limit?: number }} [opts]
 */
function listFlakyScenarios(runsWithLites, opts = {}) {
  const window = Array.isArray(runsWithLites) ? runsWithLites : [];
  const minRuns = Math.max(2, Number(opts.minRuns) || 2);
  const minFlips = Math.max(1, Number(opts.minFlips) || 1);
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || DEFAULT_FLAKY_LIMIT));

  /** @type {Map<string, any>} */
  const byKey = new Map();
  for (const run of window) {
    const runId = String(run?.runId || '');
    const lites = Array.isArray(run?.lites) ? run.lites : [];
    for (const lite of lites) {
      const key = String(lite?.key || '');
      if (!key) continue;
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          specName: String(lite.specName || ''),
          scnName: String(lite.scnName || ''),
          specFile: String(lite.specFile || ''),
          scnId: String(lite.scnId || ''),
          verdicts: [],
        };
        byKey.set(key, row);
      }
      row.verdicts.push({
        runId,
        verdict: String(lite.verdict || '').toLowerCase(),
        failReason: lite.failReason ? String(lite.failReason) : '',
      });
    }
  }

  const out = [];
  for (const row of byKey.values()) {
    const seen = row.verdicts.length;
    if (seen < minRuns) continue;
    let fails = 0;
    let passes = 0;
    let flips = 0;
    let lastFailReason = '';
    let lastFailRunId = '';
    let prev = '';
    for (const v of row.verdicts) {
      const verd = v.verdict === 'fail' ? 'fail' : v.verdict === 'pass' ? 'pass' : v.verdict;
      if (verd === 'fail') {
        fails += 1;
        lastFailRunId = v.runId || lastFailRunId;
        if (v.failReason) lastFailReason = v.failReason;
      } else if (verd === 'pass') {
        passes += 1;
      }
      if (
        prev &&
        (prev === 'pass' || prev === 'fail') &&
        (verd === 'pass' || verd === 'fail') &&
        prev !== verd
      ) {
        flips += 1;
      }
      if (verd === 'pass' || verd === 'fail') prev = verd;
    }
    const failRate = seen ? fails / seen : 0;
    if (!(flips >= minFlips || (fails > 0 && passes > 0))) continue;
    out.push({
      key: row.key,
      specName: row.specName,
      scnName: row.scnName,
      specFile: row.specFile,
      scnId: row.scnId,
      seen,
      fails,
      passes,
      flips,
      failRate,
      lastFailReason,
      lastFailRunId,
      verdictSeries: row.verdicts.map((v) => ({ runId: v.runId, verdict: v.verdict })),
    });
  }

  out.sort((a, b) => {
    if (b.flips !== a.flips) return b.flips - a.flips;
    if (b.failRate !== a.failRate) return b.failRate - a.failRate;
    return String(a.scnName).localeCompare(String(b.scnName));
  });
  return out.slice(0, limit);
}

/**
 * Pick run + focus for opening/copying a flaky scenario deep link.
 * Prefers the last failing run so failSteps mode lands on a real failure.
 * @param {{ lastFailRunId?: string, scnId?: string, verdictSeries?: Array<{ runId?: string }> }} flaky
 * @returns {{ runId: string, focus: string, failSteps: true } | null}
 */
function resolveFlakyOpenTarget(flaky) {
  if (!flaky || typeof flaky !== 'object') return null;
  const series = Array.isArray(flaky.verdictSeries) ? flaky.verdictSeries : [];
  const lastAny = [...series].reverse().find((v) => v && v.runId)?.runId || '';
  const runId = String(flaky.lastFailRunId || lastAny || '').trim();
  if (!runId) return null;
  return {
    runId,
    focus: String(flaky.scnId || '').trim(),
    failSteps: true,
  };
}

/**
 * @param {string} hubDir
 * @param {object} entry
 * @param {(hubDir: string, entry: object) => string|null} resolveRunDir
 */
function loadScenarioLitesForEntry(hubDir, entry, resolveRunDir) {
  const runId = String(entry?.id || '');
  if (!hubDir || !entry || typeof resolveRunDir !== 'function') {
    return { runId, lites: [], ok: false, error: 'invalid args' };
  }
  const runDir = resolveRunDir(hubDir, entry);
  if (!runDir) return { runId, lites: [], ok: false, error: 'run dir not found' };
  const snap = loadReportSnapshot(runDir);
  if (!snap) return { runId, lites: [], ok: false, error: 'report.json missing', reportDir: runDir };
  return { runId, lites: scenarioLitesFromReport(snap), ok: true, reportDir: runDir };
}

/**
 * @param {string} hubDir
 * @param {object[]} runs
 * @param {(hubDir: string, entry: object) => string|null} resolveRunDir
 * @param {{ trendLimit?: number, flakyLimit?: number }} [opts]
 */
function buildHistoryTrendBundle(hubDir, runs, resolveRunDir, opts = {}) {
  const trend = buildHistoryTrend(runs, { limit: opts.trendLimit });
  const windowRuns = trend.points
    .map((p) => runs.find((r) => String(r.id) === p.id))
    .filter(Boolean);
  const withLites = windowRuns.map((entry) => {
    const loaded = loadScenarioLitesForEntry(hubDir, entry, resolveRunDir);
    return {
      runId: loaded.runId,
      timestamp: entry.timestampISO || entry.timestamp || '',
      lites: loaded.lites,
      ok: loaded.ok,
    };
  });
  const loadedOk = withLites.filter((r) => r.ok).length;
  const digest = buildHistoryFailDigest(windowRuns, {
    limit: Number(opts.digestLimit) > 0 ? Number(opts.digestLimit) : 15,
  });
  return {
    trend,
    flaky: listFlakyScenarios(withLites, { limit: opts.flakyLimit }),
    digest,
    digestMarkdown: formatHistoryFailDigestMarkdown(digest, {
      title: '历史失败摘要',
      hubDir: hubDir || '',
      includeOpenLinks: Boolean(hubDir),
    }),
    scenarioLoad: {
      attempted: withLites.length,
      loaded: loadedOk,
      missing: withLites.length - loadedOk,
    },
  };
}

module.exports = {
  sortRunsChrono,
  buildHistoryTrend,
  listFlakyScenarios,
  resolveFlakyOpenTarget,
  sparkline,
  formatTrendDuration,
  loadScenarioLitesForEntry,
  buildHistoryTrendBundle,
  buildHistoryFailDigest,
  formatHistoryFailDigestMarkdown,
  scenarioKey,
  DEFAULT_TREND_LIMIT,
  DEFAULT_FLAKY_LIMIT,
};
