'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  sortRunsChrono,
  buildHistoryTrend,
  listFlakyScenarios,
  resolveFlakyOpenTarget,
  sparkline,
  formatTrendDuration,
  loadScenarioLitesForEntry,
  buildHistoryTrendBundle,
} = require('./history-trend.js');

function sampleRuns() {
  return [
    {
      id: 'r3',
      projectName: 'Demo',
      timestamp: '2026-09-11 12:00',
      timestampISO: '2026-09-11T12:00:00Z',
      duration: '00:00:03.000',
      verdict: 'fail',
      failed: true,
      topFailReason: 'timeout',
      summary: { scenarios: { total: 4, passed: 2, failed: 2, skipped: 0 } },
    },
    {
      id: 'r1',
      projectName: 'Demo',
      timestamp: '2026-09-11 10:00',
      timestampISO: '2026-09-11T10:00:00Z',
      duration: '00:00:01.000',
      verdict: 'pass',
      summary: { scenarios: { total: 4, passed: 4, failed: 0, skipped: 0 } },
    },
    {
      id: 'r2',
      projectName: 'Demo',
      timestamp: '2026-09-11 11:00',
      timestampISO: '2026-09-11T11:00:00Z',
      duration: '00:00:02.000',
      verdict: 'pass',
      summary: { scenarios: { total: 4, passed: 3, failed: 1, skipped: 0 } },
    },
  ];
}

describe('history-trend', () => {
  it('sortRunsChrono orders oldest to newest', () => {
    assert.deepEqual(
      sortRunsChrono(sampleRuns()).map((r) => r.id),
      ['r1', 'r2', 'r3'],
    );
  });

  it('buildHistoryTrend computes points and fail rate', () => {
    const trend = buildHistoryTrend(sampleRuns(), { limit: 10 });
    assert.equal(trend.points.length, 3);
    assert.equal(trend.points[0].id, 'r1');
    assert.equal(trend.points[2].id, 'r3');
    assert.equal(trend.points[0].durationMs, 1000);
    assert.equal(trend.stats.runCount, 3);
    assert.equal(trend.stats.failCount, 1);
    assert.ok(Math.abs(trend.stats.failRate - 1 / 3) < 1e-9);
    assert.equal(trend.stats.avgDurationMs, 2000);
  });

  it('sparkline and formatTrendDuration are stable', () => {
    assert.equal(sparkline([0, 1, 2, 3]), '▁▃▆█');
    assert.equal(formatTrendDuration(1500), '1.5s');
    assert.equal(formatTrendDuration(125000), '2m05s');
  });

  it('listFlakyScenarios ranks flip-heavy scenarios', () => {
    const flaky = listFlakyScenarios([
      {
        runId: 'a',
        lites: [
          { key: 'k1', specName: 'S', scnName: 'flaky', scnId: '1', verdict: 'pass' },
          { key: 'k2', specName: 'S', scnName: 'stable', scnId: '2', verdict: 'pass' },
        ],
      },
      {
        runId: 'b',
        lites: [
          { key: 'k1', specName: 'S', scnName: 'flaky', scnId: '1', verdict: 'fail', failReason: 'boom' },
          { key: 'k2', specName: 'S', scnName: 'stable', scnId: '2', verdict: 'pass' },
        ],
      },
      {
        runId: 'c',
        lites: [
          { key: 'k1', specName: 'S', scnName: 'flaky', scnId: '1', verdict: 'pass' },
          { key: 'k2', specName: 'S', scnName: 'stable', scnId: '2', verdict: 'pass' },
        ],
      },
    ]);
    assert.equal(flaky.length, 1);
    assert.equal(flaky[0].key, 'k1');
    assert.equal(flaky[0].flips, 2);
    assert.equal(flaky[0].fails, 1);
    assert.equal(flaky[0].lastFailReason, 'boom');
    assert.equal(flaky[0].lastFailRunId, 'b');
    const target = resolveFlakyOpenTarget(flaky[0]);
    assert.deepEqual(target, { runId: 'b', focus: '1', failSteps: true });
  });

  it('resolveFlakyOpenTarget falls back to latest run when no fail id', () => {
    const target = resolveFlakyOpenTarget({
      scnId: 'scn-9',
      verdictSeries: [
        { runId: 'r1', verdict: 'pass' },
        { runId: 'r2', verdict: 'pass' },
      ],
    });
    assert.deepEqual(target, { runId: 'r2', focus: 'scn-9', failSteps: true });
    assert.equal(resolveFlakyOpenTarget(null), null);
    assert.equal(resolveFlakyOpenTarget({}), null);
  });

  it('loadScenarioLitesForEntry reads report.json via resolveRunDir', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-trend-'));
    const runDir = path.join(tmp, 'archives', 'run-a');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'report.json'),
      JSON.stringify({
        specs: [
          {
            id: 'sp1',
            heading: 'Login',
            fileName: 'login.spec',
            scenarios: [
              { id: 'scn1', heading: 'ok', verdict: 'pass' },
              {
                id: 'scn2',
                heading: 'bad',
                verdict: 'fail',
                items: [{ kind: 'step', verdict: 'fail', errorMessage: 'x' }],
              },
            ],
          },
        ],
      }),
    );
    const loaded = loadScenarioLitesForEntry(tmp, { id: 'run-a' }, () => runDir);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.lites.length, 2);
    assert.ok(loaded.lites.some((l) => l.scnName === 'bad' && l.verdict === 'fail'));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('buildHistoryTrendBundle combines trend + flaky', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-bundle-'));
    const runs = sampleRuns();
    for (const run of runs) {
      const runDir = path.join(tmp, 'archives', run.id);
      fs.mkdirSync(runDir, { recursive: true });
      const fail = run.verdict === 'fail';
      fs.writeFileSync(
        path.join(runDir, 'report.json'),
        JSON.stringify({
          specs: [
            {
              id: 'sp1',
              heading: 'Suite',
              fileName: 'a.spec',
              scenarios: [
                {
                  id: 'flip',
                  heading: 'Flip',
                  verdict: fail ? 'fail' : 'pass',
                  ...(fail
                    ? { items: [{ kind: 'step', verdict: 'fail', errorMessage: 't' }] }
                    : {}),
                },
                { id: 'ok', heading: 'Always', verdict: 'pass' },
              ],
            },
          ],
        }),
      );
    }
    const resolve = (_hub, entry) => path.join(tmp, 'archives', entry.id);
    const bundle = buildHistoryTrendBundle(tmp, runs, resolve, { trendLimit: 10 });
    assert.equal(bundle.trend.stats.runCount, 3);
    assert.equal(bundle.scenarioLoad.loaded, 3);
    assert.ok(bundle.flaky.some((f) => f.scnName === 'Flip' && f.flips >= 1));
    assert.ok(bundle.digest);
    assert.equal(bundle.digest.failRunCount, 1);
    assert.equal(typeof bundle.digestMarkdown, 'string');
    assert.match(bundle.digestMarkdown, /timeout|失败/);
    assert.match(bundle.digestMarkdown, /studio-reporter:\/\/open\?/);
    assert.match(bundle.digestMarkdown, /最近失败打开深链/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
