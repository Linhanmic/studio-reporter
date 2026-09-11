'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeFailReason,
  buildHistoryFailDigest,
  formatHistoryFailDigestMarkdown,
  formatHistoryFailDigestJson,
  buildHistoryFailDigestOpenLinks,
} = require('./history-digest.js');

describe('report-assets/history-digest', () => {
  it('normalizeFailReason collapses whitespace and caps length', () => {
    assert.equal(normalizeFailReason('  boom   \n stack'), 'boom');
    const long = 'x'.repeat(300);
    assert.equal(normalizeFailReason(long).length, 241);
    assert.ok(normalizeFailReason(long).endsWith('…'));
  });

  it('aggregates fail reasons and emits open deep links', () => {
    const runs = [
      { id: 'r1', verdict: 'fail', topFailReason: 'timeout after 30s', timestampISO: '2026-09-01T10:00:00Z' },
      { id: 'r2', verdict: 'pass' },
      { id: 'r3', verdict: 'fail', topFailReason: 'timeout after 30s', timestampISO: '2026-09-02T10:00:00Z' },
      { id: 'r4', failed: true, failReason: 'null pointer', timestampISO: '2026-09-03T10:00:00Z' },
      { id: 'r5', verdict: 'fail', topFailReason: '', timestampISO: '2026-09-04T10:00:00Z' },
    ];
    const digest = buildHistoryFailDigest(runs, { limit: 10 });
    assert.equal(digest.runCount, 5);
    assert.equal(digest.failRunCount, 4);
    assert.equal(digest.passRunCount, 1);
    assert.equal(digest.groups.length, 2);
    assert.equal(digest.groups[0].reason, 'timeout after 30s');
    assert.equal(digest.groups[0].count, 2);
    assert.equal(digest.groups[0].lastRunId, 'r3');
    assert.deepEqual(digest.runsWithoutReason, ['r5']);

    const md = formatHistoryFailDigestMarkdown(digest, {
      title: 'CI Fail Digest',
      hubDir: '/hub',
      includeOpenLinks: true,
    });
    assert.match(md, /CI Fail Digest/);
    assert.match(md, /timeout after 30s/);
    assert.match(md, /studio-reporter:\/\/open\?/);
    assert.match(md, /run=r3/);
    assert.match(md, /failSteps=1/);

    const links = buildHistoryFailDigestOpenLinks(digest, { hubDir: '/hub', mode: 'latest' });
    assert.match(links, /run=r3/);
    assert.match(links, /run=r4/);
    assert.ok(!/run=r1/.test(links));

    const json = formatHistoryFailDigestJson(digest, { hubDir: '/hub' });
    assert.equal(json.format, 'studio-reporter.historyFailDigest/v1');
    assert.ok(json.openLinksLatest.length >= 2);

    const hubless = buildHistoryFailDigestOpenLinks(digest, { hubDir: '', mode: 'latest' });
    assert.match(hubless, /studio-reporter:\/\/open\?run=/);
    assert.match(hubless, /failSteps=1/);
    assert.ok(!/hub=/.test(hubless));
  });

  it('buildOpenDeepLinkForRun encodes special hub paths', () => {
    const {
      buildOpenDeepLinkForRun,
    } = require('./history-digest.js');
    const hubs = [
      '/tmp/hub path/x',
      '/tmp/hub#frag/x',
      '/tmp/hub?a=1&b=2/x',
      '/tmp/中文 hub/x',
      'C:\\Users\\foo\\bar hub',
    ];
    for (const hub of hubs) {
      const link = buildOpenDeepLinkForRun('run/1', hub);
      assert.match(link, /^studio-reporter:\/\/open\?/);
      assert.match(link, /failSteps=1/);
      if (/[ ?#&=]/.test(hub)) {
        assert.ok(!link.includes('hub=' + hub), `hub should be encoded: ${link}`);
      }
      const u = new URL(link);
      assert.equal(u.searchParams.get('hub'), hub);
      assert.equal(u.searchParams.get('run'), 'run/1');
      assert.equal(u.searchParams.get('failSteps'), '1');
    }
  });
});
