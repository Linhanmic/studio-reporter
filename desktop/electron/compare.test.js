'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseReportDuration,
  compareHistoryRuns,
  formatDurationDelta,
  formatCountsDelta,
  suggestedCompareShareBasename,
  buildCompareShareMarkdown,
  buildCompareShareCardHtml,
  resolveCompareShareDeepLink,
  invertCompareResult,
  buildCompareShareJson,
  normalizeCompareCardTemplate,
  normalizeCompareCardTitle,
} = require('./compare.js');

function sampleEntries() {
  return {
    base: {
      id: 'a/run-1',
      projectName: 'demo',
      timestamp: 't1',
      duration: '00:00:02.000',
      verdict: 'pass',
      summary: {
        specs: { total: 2, passed: 2, failed: 0, skipped: 0 },
        scenarios: { total: 3, passed: 3, failed: 0, skipped: 0 },
        steps: { total: 10, passed: 10, failed: 0, skipped: 0 },
      },
    },
    target: {
      id: 'b/run-2',
      projectName: 'demo',
      timestamp: 't2',
      duration: '00:00:03.500',
      verdict: 'fail',
      summary: {
        specs: { total: 2, passed: 1, failed: 1, skipped: 0 },
        scenarios: { total: 4, passed: 3, failed: 1, skipped: 0 },
        steps: { total: 12, passed: 9, failed: 3, skipped: 0 },
      },
    },
  };
}

describe('compareHistoryRuns', () => {
  it('parses HH:MM:SS.mmm durations', () => {
    assert.equal(parseReportDuration('00:00:01.500'), 1500);
    assert.equal(parseReportDuration('01:02:03.000'), 3_723_000);
    assert.equal(parseReportDuration('bad'), 0);
  });

  it('diffs verdict duration and counts (target − base)', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    assert.equal(cmp.verdictSame, false);
    assert.equal(cmp.durationMs.delta, 1500);
    assert.equal(cmp.specs.failed, 1);
    assert.equal(cmp.scenarios.total, 1);
    assert.equal(cmp.steps.passed, -1);
    assert.equal(cmp.base.projectName, 'demo');
    assert.equal(formatDurationDelta(cmp.durationMs.delta), '+1.500s');
    assert.match(formatCountsDelta(cmp.steps), /败\+3/);
  });
});

describe('compare share card', () => {
  it('builds markdown and self-contained HTML', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    const md = buildCompareShareMarkdown(cmp, { title: '回归对比' });
    assert.match(md, /# 回归对比/);
    assert.match(md, /结论变化/);
    assert.match(md, /\+1\.500s/);
    assert.match(md, /项目：demo/);

    const html = buildCompareShareCardHtml(cmp, {
      title: '回归对比',
      generatedAt: '2026-09-11T00:00:00.000Z',
    });
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /studio-reporter-desktop-compare-card/);
    assert.match(html, /回归对比/);
    assert.match(html, /a\/run-1/);
    assert.match(html, /b\/run-2/);
    assert.match(html, /结论变化/);
    assert.doesNotMatch(html, /<script/i);

    assert.equal(suggestedCompareShareBasename(cmp), 'compare-a_run-1-vs-b_run-2');
  });


  it('includes compare deep link in markdown, HTML, and JSON', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    const hub = '/tmp/demo-hub';
    const md = buildCompareShareMarkdown(cmp, { hub });
    assert.match(md, /studio-reporter:\/\/compare\?base=/);
    assert.match(md, /hub=/);
    assert.match(md, /打开对比/);

    const html = buildCompareShareCardHtml(cmp, { hub });
    assert.match(html, /class="deep-link"/);
    assert.match(html, /studio-reporter:\/\/compare\?/);
    assert.match(html, /href="studio-reporter:\/\/compare\?/);

    const json = JSON.parse(buildCompareShareJson(cmp, { hub }));
    assert.match(json.deepLink, /^studio-reporter:\/\/compare\?/);
    assert.ok(json.deepLink.includes('hub='));
    assert.equal(
      resolveCompareShareDeepLink(cmp, { hub }),
      json.deepLink
    );
  });

  it('rejects empty compare payloads', () => {
    assert.throws(() => buildCompareShareMarkdown(null), /无效/);
    assert.throws(() => buildCompareShareCardHtml({}), /无效/);
  });
  it('includes scenarioCompare in markdown, HTML, and JSON', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    cmp.scenarioCompare = {
      changed: [
        {
          kind: 'regressed',
          specName: 'Login',
          scnName: 'valid user',
          baseVerdict: 'pass',
          targetVerdict: 'fail',
          targetReason: 'timeout after 30s',
        },
        {
          kind: 'fixed',
          specName: 'Pay',
          scnName: 'ok path',
          baseVerdict: 'fail',
          targetVerdict: 'pass',
          baseReason: 'null pointer',
        },
      ],
      unchangedCount: 2,
      baseCount: 4,
      targetCount: 4,
    };

    const md = buildCompareShareMarkdown(cmp, { title: '场景 diff' });
    assert.match(md, /## 场景级差异/);
    assert.match(md, /变差/);
    assert.match(md, /Login · valid user/);
    assert.match(md, /timeout after 30s/);

    const html = buildCompareShareCardHtml(cmp, { title: '场景 diff' });
    assert.match(html, /scenario-diff/);
    assert.match(html, /变差/);
    assert.match(html, /timeout after 30s/);
    assert.match(html, /修复/);

    const json = JSON.parse(buildCompareShareJson(cmp));
    assert.equal(json.scenarioCompare.changedCount, 2);
    assert.equal(json.scenarioCompare.changed[0].kind, 'regressed');
    assert.equal(json.scenarioCompare.unchangedCount, 2);
  });
});

describe('compare invert and json', () => {
  it('invertCompareResult swaps sides and negates deltas', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    const inv = invertCompareResult(cmp);
    assert.equal(inv.base.id, cmp.target.id);
    assert.equal(inv.target.id, cmp.base.id);
    assert.equal(inv.durationMs.delta, -cmp.durationMs.delta);
    assert.equal(inv.specs.failed, -cmp.specs.failed);
    assert.equal(inv.verdictSame, cmp.verdictSame);
  });

  it('buildCompareShareJson emits versioned payload', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    const raw = buildCompareShareJson(cmp, { generatedAt: '2026-09-11T00:00:00.000Z' });
    const json = JSON.parse(raw);
    assert.equal(json.format, 'studio-reporter.compare/v1');
    assert.equal(json.base.id, 'a/run-1');
    assert.equal(json.target.id, 'b/run-2');
    assert.match(json.summary.durationDelta, /\+/);
  });
});

describe('compare card templates', () => {
  it('normalizeCompareCardTemplate accepts default/light/compact', () => {
    assert.equal(normalizeCompareCardTemplate('light'), 'light');
    assert.equal(normalizeCompareCardTemplate('COMPACT'), 'compact');
    assert.equal(normalizeCompareCardTemplate('nope'), 'default');
    assert.equal(normalizeCompareCardTitle('  Nightly  '), 'Nightly');
    assert.equal(normalizeCompareCardTitle(''), 'Studio Reporter 运行对比');
  });

  it('buildCompareShareCardHtml applies light and compact templates', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    const light = buildCompareShareCardHtml(cmp, {
      title: '浅色卡片',
      template: 'light',
      generatedAt: '2026-09-11T00:00:00.000Z',
    });
    assert.match(light, /data-template="light"/);
    assert.match(light, /studio-reporter-compare-template" content="light"/);
    assert.match(light, /浅色卡片/);
    assert.match(light, /--bg:\s*#eef2f6/);

    const compact = buildCompareShareCardHtml(cmp, { template: 'compact' });
    assert.match(compact, /data-template="compact"/);
    assert.match(compact, /--pad:\s*16px/);
  });
});
