'use strict';

/**
 * Port of internal/report.CompareHistoryRuns for Desktop (no Go round-trip).
 * Duration format: HH:MM:SS.mmm
 */

function parseReportDuration(s) {
  const raw = String(s || '').trim();
  if (!raw) return 0;
  const parts = raw.split(':');
  if (parts.length !== 3) return 0;
  const h = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10);
  const sec = Number.parseFloat(parts[2]);
  if (![h, m, sec].every((n) => Number.isFinite(n)) || h < 0 || m < 0 || sec < 0) {
    return 0;
  }
  return Math.trunc(h * 3_600_000 + m * 60_000 + sec * 1000 + 0.5);
}

function emptyCounts() {
  return { total: 0, passed: 0, failed: 0, skipped: 0 };
}

function normalizeCounts(c) {
  const src = c || {};
  return {
    total: Number(src.total) || 0,
    passed: Number(src.passed) || 0,
    failed: Number(src.failed) || 0,
    skipped: Number(src.skipped) || 0,
  };
}

function diffCounts(base, target) {
  const b = normalizeCounts(base);
  const t = normalizeCounts(target);
  return {
    total: t.total - b.total,
    passed: t.passed - b.passed,
    failed: t.failed - b.failed,
    skipped: t.skipped - b.skipped,
  };
}

function runLiteFromEntry(entry) {
  const summary = entry?.summary || {};
  return {
    id: entry?.id || '',
    timestamp: entry?.timestamp || entry?.timestampISO || '',
    duration: entry?.duration || '',
    verdict: entry?.verdict || '',
    summary: {
      specs: normalizeCounts(summary.specs),
      scenarios: normalizeCounts(summary.scenarios),
      steps: normalizeCounts(summary.steps),
    },
  };
}

/**
 * @param {object} baseEntry history.json run
 * @param {object} targetEntry history.json run
 */
function compareHistoryRuns(baseEntry, targetEntry) {
  const base = runLiteFromEntry(baseEntry);
  const target = runLiteFromEntry(targetEntry);
  const baseMs = parseReportDuration(base.duration);
  const targetMs = parseReportDuration(target.duration);
  return {
    base,
    target,
    verdictSame: base.verdict === target.verdict,
    durationMs: {
      base: baseMs,
      target: targetMs,
      delta: targetMs - baseMs,
    },
    specs: diffCounts(base.summary.specs, target.summary.specs),
    scenarios: diffCounts(base.summary.scenarios, target.summary.scenarios),
    steps: diffCounts(base.summary.steps, target.summary.steps),
  };
}

function formatDurationDelta(ms) {
  let n = Number(ms) || 0;
  if (n === 0) return '±0s';
  const sign = n < 0 ? '-' : '+';
  if (n < 0) n = -n;
  return `${sign}${(n / 1000).toFixed(3)}s`;
}

function formatCountsDelta(d) {
  const parts = [];
  for (const [k, label] of [
    ['total', '总'],
    ['passed', '过'],
    ['failed', '败'],
    ['skipped', '跳'],
  ]) {
    const v = d[k] || 0;
    if (v === 0) continue;
    parts.push(`${label}${v > 0 ? '+' : ''}${v}`);
  }
  return parts.length ? parts.join(' ') : '±0';
}

module.exports = {
  parseReportDuration,
  compareHistoryRuns,
  formatDurationDelta,
  formatCountsDelta,
  emptyCounts,
  runLiteFromEntry,
};
