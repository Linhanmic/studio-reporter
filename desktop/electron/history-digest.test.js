'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeFailReason,
  buildHistoryFailDigest,
  formatHistoryFailDigestMarkdown,
  formatHistoryFailDigestJson,
} = require('./history-digest.js');

describe('history-digest', () => {
  it('normalizeFailReason collapses whitespace and caps length', () => {
    assert.equal(normalizeFailReason('  boom   \n stack'), 'boom');
    const long = 'x'.repeat(300);
    assert.equal(normalizeFailReason(long).length, 241);
    assert.ok(normalizeFailReason(long).endsWith('…'));
  });

  it('aggregates fail reasons across runs', () => {
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
    assert.equal(digest.groups[1].reason, 'null pointer');
    assert.deepEqual(digest.runsWithoutReason, ['r5']);

    const md = formatHistoryFailDigestMarkdown(digest, { title: 'CI Fail Digest', hubDir: '/hub' });
    assert.match(md, /CI Fail Digest/);
    assert.match(md, /timeout after 30s/);
    assert.match(md, /null pointer/);
    assert.match(md, /r3/);

    const json = formatHistoryFailDigestJson(digest, { hubDir: '/hub' });
    assert.equal(json.format, 'studio-reporter.historyFailDigest/v1');
    assert.equal(json.hubDir, '/hub');
    assert.equal(json.groups[0].count, 2);
  });

  it('empty window yields empty groups', () => {
    const digest = buildHistoryFailDigest([{ id: 'a', verdict: 'pass' }]);
    assert.equal(digest.failRunCount, 0);
    assert.equal(digest.groups.length, 0);
    assert.match(formatHistoryFailDigestMarkdown(digest), /无失败运行/);
  });
});
