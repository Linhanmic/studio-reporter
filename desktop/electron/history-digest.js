'use strict';

/**
 * Cross-run failure digest from hub history.json entries.
 * Aggregates topFailReason for CI comments / shareable Markdown,
 * and can emit studio-reporter://open deep links for failed runs.
 */

const { buildOpenDeepLink } = require('./deeplink.js');

const DEFAULT_DIGEST_LIMIT = 15;

/**
 * Mirror Go normalizeFailReason: first non-empty line, collapse spaces, cap length.
 * @param {unknown} msg
 * @returns {string}
 */
function normalizeFailReason(msg) {
  const s = String(msg ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
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
 * studio-reporter://open deep link for one history run (failSteps=1).
 * @param {string} runId
 * @param {string} hub
 */
function buildOpenDeepLinkForRun(runId, hub) {
  const id = String(runId || '').trim();
  if (!id) return '';
  return buildOpenDeepLink({
    run: id,
    hub: String(hub || '').trim() || undefined,
    failSteps: true,
  });
}

/**
 * Newline-joined open deep links from a fail digest.
 * @param {ReturnType<typeof buildHistoryFailDigest>} digest
 * @param {{ hubDir?: string, mode?: 'latest'|'all' }} [opts]
 * @returns {string}
 */
function buildHistoryFailDigestOpenLinks(digest, opts = {}) {
  const d = digest || { groups: [] };
  const hub = String(opts.hubDir || '').trim();
  const mode = opts.mode === 'all' ? 'all' : 'latest';
  const ids = [];
  const seen = new Set();
  for (const g of d.groups || []) {
    const list = mode === 'all' ? g.runIds || [] : g.lastRunId ? [g.lastRunId] : [];
    for (const id of list) {
      const clean = String(id || '').trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      ids.push(clean);
    }
  }
  return ids.map((id) => buildOpenDeepLinkForRun(id, hub)).join('\n');
}

/**
 * @param {ReturnType<typeof buildHistoryFailDigest>} digest
 * @param {{ title?: string, hubDir?: string, includeOpenLinks?: boolean }} [opts]
 * @returns {string}
 */
function formatHistoryFailDigestMarkdown(digest, opts = {}) {
  const d = digest || buildHistoryFailDigest([]);
  const title = String(opts.title || '历史失败摘要').trim() || '历史失败摘要';
  const hub = String(opts.hubDir || '').trim();
  const lines = [];
  lines.push(`## ${title}`);
  if (hub) lines.push(`- Hub: \`${hub}\``);
  lines.push(
    `- 窗口：${d.runCount} 次运行（失败 ${d.failRunCount} / 通过 ${d.passRunCount} / 跳过 ${d.skipRunCount}）`,
  );
  lines.push('');
  if (!d.groups.length) {
    lines.push(d.failRunCount ? '_失败运行未写入 topFailReason。_' : '_窗口内无失败运行。_');
    lines.push('');
    return lines.join('\n');
  }
  const withLinks = opts.includeOpenLinks !== false && Boolean(hub);
  if (withLinks) {
    lines.push('| # | 次数 | 最近运行 | 打开 | 失败原因 |');
    lines.push('|---|------|----------|------|----------|');
  } else {
    lines.push('| # | 次数 | 最近运行 | 失败原因 |');
    lines.push('|---|------|----------|----------|');
  }
  d.groups.forEach((g, i) => {
    const reason = g.reason.replace(/\|/g, '\\|');
    if (withLinks) {
      const link = g.lastRunId ? buildOpenDeepLinkForRun(g.lastRunId, hub) : '';
      const linkCell = link ? `[open](${link})` : '—';
      lines.push(
        `| ${i + 1} | ${g.count} | \`${g.lastRunId || '—'}\` | ${linkCell} | ${reason} |`,
      );
    } else {
      lines.push(`| ${i + 1} | ${g.count} | \`${g.lastRunId || '—'}\` | ${reason} |`);
    }
  });
  if (d.runsWithoutReason?.length) {
    lines.push('');
    lines.push(`_另有 ${d.runsWithoutReason.length} 次失败无原因文本。_`);
  }
  if (withLinks) {
    const links = buildHistoryFailDigestOpenLinks(d, { hubDir: hub, mode: 'latest' });
    if (links) {
      lines.push('');
      lines.push('### 最近失败打开深链');
      lines.push('```');
      lines.push(links);
      lines.push('```');
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {ReturnType<typeof buildHistoryFailDigest>} digest
 * @param {{ hubDir?: string }} [opts]
 */
function formatHistoryFailDigestJson(digest, opts = {}) {
  const hubDir = opts.hubDir || '';
  const base = {
    format: 'studio-reporter.historyFailDigest/v1',
    hubDir,
    ...digest,
  };
  if (hubDir && digest?.groups?.length) {
    base.openLinksLatest = buildHistoryFailDigestOpenLinks(digest, {
      hubDir,
      mode: 'latest',
    })
      .split('\n')
      .filter(Boolean);
    base.openLinksAll = buildHistoryFailDigestOpenLinks(digest, {
      hubDir,
      mode: 'all',
    })
      .split('\n')
      .filter(Boolean);
  }
  return base;
}

/**
 * Write fail-digest.md + fail-digest.json beside hub history.json (CLI digest --write contract).
 * @param {string} hubDir
 * @param {object[]} [runs]
 * @param {{ limit?: number }} [opts]
 * @returns {{ mdPath: string, jsonPath: string, digest: ReturnType<typeof buildHistoryFailDigest> }}
 */
function writeHistoryFailDigestSidecars(hubDir, runs, opts = {}) {
  const fs = require('node:fs');
  const path = require('node:path');
  const hub = path.resolve(String(hubDir || '').trim());
  if (!hub) throw new Error('hubDir is required');
  const list = Array.isArray(runs) ? runs : [];
  const digest = buildHistoryFailDigest(list, { limit: opts.limit });
  const mdPath = path.join(hub, 'fail-digest.md');
  const jsonPath = path.join(hub, 'fail-digest.json');
  const md = formatHistoryFailDigestMarkdown(digest, {
    title: '历史失败摘要',
    hubDir: hub,
    includeOpenLinks: true,
  });
  const json = formatHistoryFailDigestJson(digest, { hubDir: hub });
  fs.writeFileSync(mdPath, md, 'utf8');
  fs.writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  return { mdPath, jsonPath, digest };
}

module.exports = {
  DEFAULT_DIGEST_LIMIT,
  normalizeFailReason,
  buildHistoryFailDigest,
  formatHistoryFailDigestMarkdown,
  formatHistoryFailDigestJson,
  buildHistoryFailDigestOpenLinks,
  buildOpenDeepLinkForRun,
  writeHistoryFailDigestSidecars,
};
