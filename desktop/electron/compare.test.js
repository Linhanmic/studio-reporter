'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseReportDuration,
  compareHistoryRuns,
  formatDurationDelta,
  formatCountsDelta,
} = require('./compare.js');

describe('compareHistoryRuns', () => {
  it('parses HH:MM:SS.mmm durations', () => {
    assert.equal(parseReportDuration('00:00:01.500'), 1500);
    assert.equal(parseReportDuration('01:02:03.000'), 3_723_000);
    assert.equal(parseReportDuration('bad'), 0);
  });

  it('diffs verdict duration and counts (target − base)', () => {
    const base = {
      id: 'a',
      timestamp: 't1',
      duration: '00:00:02.000',
      verdict: 'pass',
      summary: {
        specs: { total: 2, passed: 2, failed: 0, skipped: 0 },
        scenarios: { total: 3, passed: 3, failed: 0, skipped: 0 },
        steps: { total: 10, passed: 10, failed: 0, skipped: 0 },
      },
    };
    const target = {
      id: 'b',
      timestamp: 't2',
      duration: '00:00:03.500',
      verdict: 'fail',
      summary: {
        specs: { total: 2, passed: 1, failed: 1, skipped: 0 },
        scenarios: { total: 4, passed: 3, failed: 1, skipped: 0 },
        steps: { total: 12, passed: 9, failed: 3, skipped: 0 },
      },
    };
    const cmp = compareHistoryRuns(base, target);
    assert.equal(cmp.verdictSame, false);
    assert.equal(cmp.durationMs.delta, 1500);
    assert.equal(cmp.specs.failed, 1);
    assert.equal(cmp.scenarios.total, 1);
    assert.equal(cmp.steps.passed, -1);
    assert.equal(formatDurationDelta(cmp.durationMs.delta), '+1.500s');
    assert.match(formatCountsDelta(cmp.steps), /败\+3/);
  });
});
