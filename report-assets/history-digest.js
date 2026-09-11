/**
 * Browser-side history fail digest (mirrors Desktop/CLI).
 * Aggregates topFailReason and optionally emits studio-reporter://open deep links.
 * Attaches API on window.StudioReporterHistoryDigest.
 */
(function (global) {
  'use strict';

  var PROTOCOL = 'studio-reporter';
  var DEFAULT_DIGEST_LIMIT = 15;
  var HISTORY_FAIL_DIGEST_FORMAT_VERSION = 1;

  function normalizeFailReason(msg) {
    var s = String(msg == null ? '' : msg)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    var lines = s.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim().replace(/\s+/g, ' ');
      if (!t) continue;
      if (t.length > 240) return t.slice(0, 240) + '…';
      return t;
    }
    return '';
  }

  function buildOpenDeepLinkForRun(runId, hub) {
    var id = String(runId || '').trim();
    if (!id) return '';
    var params = new URLSearchParams();
    params.set('run', id);
    var h = String(hub || '').trim();
    if (h) params.set('hub', h);
    params.set('failSteps', '1');
    return PROTOCOL + '://open?' + params.toString();
  }

  function buildHistoryFailDigest(runs, opts) {
    opts = opts || {};
    var limit = Math.max(1, Math.min(50, Number(opts.limit) || DEFAULT_DIGEST_LIMIT));
    var list = Array.isArray(runs) ? runs : [];
    var map = Object.create(null);
    var order = [];
    var failRunCount = 0;
    var passRunCount = 0;
    var skipRunCount = 0;
    var unknownRunCount = 0;
    var runsWithoutReason = [];

    for (var i = 0; i < list.length; i++) {
      var run = list[i] || {};
      var verdict = String(run.verdict || '').toLowerCase();
      var failed = Boolean(run.failed) || verdict === 'fail';
      if (failed) failRunCount += 1;
      else if (verdict === 'pass') passRunCount += 1;
      else if (verdict === 'skip') skipRunCount += 1;
      else unknownRunCount += 1;

      if (!failed) continue;
      var reason = normalizeFailReason(run.topFailReason || run.failReason || '');
      var id = String(run.id || '');
      var ts = String(run.timestampISO || run.timestamp || '');
      if (!reason) {
        if (id) runsWithoutReason.push(id);
        continue;
      }
      var g = map[reason];
      if (!g) {
        g = { reason: reason, count: 0, runIds: [], lastRunId: '', lastTimestamp: '' };
        map[reason] = g;
        order.push(reason);
      }
      g.count += 1;
      if (id) g.runIds.push(id);
      var prev = Date.parse(g.lastTimestamp) || 0;
      var next = Date.parse(ts) || 0;
      if (!g.lastRunId || next >= prev) {
        g.lastRunId = id;
        g.lastTimestamp = ts;
      }
    }

    var groups = order
      .map(function (r) {
        return map[r];
      })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
      })
      .slice(0, limit);

    return {
      formatVersion: HISTORY_FAIL_DIGEST_FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      runCount: list.length,
      failRunCount: failRunCount,
      passRunCount: passRunCount,
      skipRunCount: skipRunCount,
      unknownRunCount: unknownRunCount,
      groups: groups,
      runsWithoutReason: runsWithoutReason,
    };
  }

  function buildHistoryFailDigestOpenLinks(digest, opts) {
    opts = opts || {};
    var d = digest || { groups: [] };
    var hub = String(opts.hubDir || '').trim();
    var mode = opts.mode === 'all' ? 'all' : 'latest';
    var ids = [];
    var seen = Object.create(null);
    var groups = d.groups || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var list = mode === 'all' ? g.runIds || [] : g.lastRunId ? [g.lastRunId] : [];
      for (var j = 0; j < list.length; j++) {
        var clean = String(list[j] || '').trim();
        if (!clean || seen[clean]) continue;
        seen[clean] = true;
        ids.push(clean);
      }
    }
    return ids
      .map(function (id) {
        return buildOpenDeepLinkForRun(id, hub);
      })
      .join('\n');
  }

  function formatHistoryFailDigestMarkdown(digest, opts) {
    opts = opts || {};
    var d = digest || buildHistoryFailDigest([]);
    var title = String(opts.title || '历史失败摘要').trim() || '历史失败摘要';
    var hub = String(opts.hubDir || '').trim();
    var lines = [];
    lines.push('## ' + title);
    if (hub) lines.push('- Hub: `' + hub + '`');
    lines.push(
      '- 窗口：' +
        d.runCount +
        ' 次运行（失败 ' +
        d.failRunCount +
        ' / 通过 ' +
        d.passRunCount +
        ' / 跳过 ' +
        d.skipRunCount +
        '）',
    );
    lines.push('');
    if (!d.groups.length) {
      lines.push(d.failRunCount ? '_失败运行未写入 topFailReason。_' : '_窗口内无失败运行。_');
    if (d.formatVersion) lines.push('- formatVersion: ' + d.formatVersion);
    if (d.generatedAt) lines.push('- generatedAt: `' + d.generatedAt + '`');
      lines.push('');
      return lines.join('\n');
    }
    var withLinks = opts.includeOpenLinks !== false;
    if (withLinks) {
      lines.push('| # | 次数 | 最近运行 | 打开 | 失败原因 |');
      lines.push('|---|------|----------|------|----------|');
    } else {
      lines.push('| # | 次数 | 最近运行 | 失败原因 |');
      lines.push('|---|------|----------|----------|');
    }
    d.groups.forEach(function (g, i) {
      var reason = g.reason.replace(/\|/g, '\\|');
      if (withLinks) {
        var link = g.lastRunId ? buildOpenDeepLinkForRun(g.lastRunId, hub) : '';
        var linkCell = link ? '[open](' + link + ')' : '—';
        lines.push(
          '| ' +
            (i + 1) +
            ' | ' +
            g.count +
            ' | `' +
            (g.lastRunId || '—') +
            '` | ' +
            linkCell +
            ' | ' +
            reason +
            ' |',
        );
      } else {
        lines.push(
          '| ' + (i + 1) + ' | ' + g.count + ' | `' + (g.lastRunId || '—') + '` | ' + reason + ' |',
        );
      }
    });
    if (d.runsWithoutReason && d.runsWithoutReason.length) {
      lines.push('');
      lines.push('_另有 ' + d.runsWithoutReason.length + ' 次失败无原因文本。_');
    }
    if (withLinks) {
      var links = buildHistoryFailDigestOpenLinks(d, { hubDir: hub, mode: 'latest' });
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

  function formatHistoryFailDigestJson(digest, opts) {
    opts = opts || {};
    var hubDir = opts.hubDir || '';
    var base = {
      format: 'studio-reporter.historyFailDigest/v1',
    formatVersion: (digest && digest.formatVersion) || HISTORY_FAIL_DIGEST_FORMAT_VERSION,
    generatedAt: (digest && digest.generatedAt) || new Date().toISOString(),
      hubDir: hubDir,
    };
    var d = digest || buildHistoryFailDigest([]);
    for (var k in d) {
      if (Object.prototype.hasOwnProperty.call(d, k)) base[k] = d[k];
    }
    if (d.groups && d.groups.length) {
      base.openLinksLatest = buildHistoryFailDigestOpenLinks(d, {
        hubDir: hubDir,
        mode: 'latest',
      })
        .split('\n')
        .filter(Boolean);
      base.openLinksAll = buildHistoryFailDigestOpenLinks(d, {
        hubDir: hubDir,
        mode: 'all',
      })
        .split('\n')
        .filter(Boolean);
    }
    return base;
  }

  var api = {
    HISTORY_FAIL_DIGEST_FORMAT_VERSION: HISTORY_FAIL_DIGEST_FORMAT_VERSION,
    DEFAULT_DIGEST_LIMIT: DEFAULT_DIGEST_LIMIT,
    PROTOCOL: PROTOCOL,
    normalizeFailReason: normalizeFailReason,
    buildHistoryFailDigest: buildHistoryFailDigest,
    buildHistoryFailDigestOpenLinks: buildHistoryFailDigestOpenLinks,
    buildOpenDeepLinkForRun: buildOpenDeepLinkForRun,
    formatHistoryFailDigestMarkdown: formatHistoryFailDigestMarkdown,
    formatHistoryFailDigestJson: formatHistoryFailDigestJson,
  };

  global.StudioReporterHistoryDigest = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
