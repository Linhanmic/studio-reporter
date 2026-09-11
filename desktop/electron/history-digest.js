'use strict';

/**
 * Cross-run failure digest from hub history.json entries.
 * Aggregates topFailReason for CI comments / shareable Markdown.
 */

const DEFAULT_DIGEST_LIMIT = 15;

/**
 * Mirror Go normalizeFailReason: first non-empty line, collapse spaces, cap length.
 * @param {unknown} msg
 * @returns {string}
 */
function normalizeFailReason(msg) {
  let s = String(msg ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const line of s.split('\n')) {
    const t = line.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t.length > 240) return `${t.slice(0, 240)}…`;
    return t;
  }
  return '';
}

/**
 * @param {object[]} runs  history entries (filtered window ok)
 * @param {{ limit?: number }} [opts]
 * @returns {{
 *   runCount: number,
 *   failRunCount: number,
 *   passRunCount: number,
 *   skipRunCount: number,
 *   unknownRunCount: number,
 *   groups: Array<{ reason: string, count: number, runIds: string[], lastRunId: string, lastTimestamp: string }>,
 *   runsWithoutReason: string[],
 * }}
 */
function buildHistoryFailDigest(runs, opts = {}) {
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || DEFAULT_DIGEST_LIMIT));
  const list = Array.isArray(runs) ? runs : [];
  const map = new Map();
  let failRunCount = 0;
  let passRunCount = 0;
  let skipRunCount = 0;
  let unknownRunCount = 0;
  const runsWithoutReason = [];

  for (const run of list) {
    const verdict = String(run?.verdict || '').toLowerCase();
    const failed = Boolean(run?.failed) || verdict === 'fail';
    if (failed) failRunCount += 1;
    else if (verdict === 'pass') passRunCount += 1;
    else if (verdict === 'skip') skipRunCount += 1;
    else unknownRunCount += 1;

    if (!failed) continue;
    const reason = normalizeFailReason(run?.topFailReason || run?.failReason || '');
    const id = String(run?.id || '');
    const ts = String(run?.timestampISO || run?.timestamp || '');
    if (!reason) {
      if (id) runsWithoutReason.push(id);
      continue;
    }
    let g = map.get(reason);
    if (!g) {
      g = { reason, count: 0, runIds: [], lastRunId: '', lastTimestamp: '' };
      map.set(reason, g);
    }
    g.count += 1;
    if (id) g.runIds.push(id);
    // Prefer chronologically latest timestamp when parseable; else last seen.
    const prev = Date.parse(g.lastTimestamp) || 0;
    const next = Date.parse(ts) || 0;
    if (!g.lastRunId || next >= prev) {
      g.lastRunId = id;
      g.lastTimestamp = ts;
    }
  }

  const groups = [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.reason.localeCompare(b.reason);
  });

  return {
    runCount: list.length,
    failRunCount,
    passRunCount,
    skipRunCount,
    unknownRunCount,
    groups: groups.slice(0, limit),
    runsWithoutReason,
  };
}

/**
 * @param {ReturnType<typeof buildHistoryFailDigest>} digest
 * @param {{ title?: string, hubDir?: string }} [opts]
 * @returns {string}
 */
function formatHistoryFailDigestMarkdown(digest, opts = {}) {
  const d = digest || buildHistoryFailDigest([]);
  const title = String(opts.title || '历史失败摘要').trim() || '历史失败摘要';
  const lines = [];
  lines.push(`## ${title}`);
  if (opts.hubDir) lines.push(`- Hub: \`${opts.hubDir}\``);
  lines.push(
    `- 窗口：${d.runCount} 次运行（失败 ${d.failRunCount} / 通过 ${d.passRunCount} / 跳过 ${d.skipRunCount}）`,
  );
  lines.push('');
  if (!d.groups.length) {
    lines.push(d.failRunCount ? '_失败运行未写入 topFailReason。_' : '_窗口内无失败运行。_');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| # | 次数 | 最近运行 | 失败原因 |');
  lines.push('|---|------|----------|----------|');
  d.groups.forEach((g, i) => {
    const reason = g.reason.replace(/\|/g, '\\|');
    lines.push(`| ${i + 1} | ${g.count} | \`${g.lastRunId || '—'}\` | ${reason} |`);
  });
  if (d.runsWithoutReason?.length) {
    lines.push('');
    lines.push(`_另有 ${d.runsWithoutReason.length} 次失败无原因文本。_`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {ReturnType<typeof buildHistoryFailDigest>} digest
 * @param {{ hubDir?: string }} [opts]
 */
function formatHistoryFailDigestJson(digest, opts = {}) {
  return {
    format: 'studio-reporter.historyFailDigest/v1',
    hubDir: opts.hubDir || '',
    ...digest,
  };
}

module.exports = {
  DEFAULT_DIGEST_LIMIT,
  normalizeFailReason,
  buildHistoryFailDigest,
  formatHistoryFailDigestMarkdown,
  formatHistoryFailDigestJson,
};
