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
  inspectCompareShareCardHtml,
  resolveCompareShareDeepLink,
  invertCompareResult,
  buildCompareShareJson,
  normalizeCompareCardTemplate,
  normalizeCompareCardTitle,
  filterScenarioCompare,
  normalizeScenarioCompareKinds,
  SCENARIO_COMPARE_KIND_FILTERS,
  resolveScenarioDiffOpenLinks,
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

    const withKinds = JSON.parse(
      buildCompareShareJson(cmp, { hub, kinds: ['regressed', 'fixed'] })
    );
    assert.match(withKinds.deepLink, /kinds=/);
    assert.ok(
      withKinds.deepLink.includes('regressed') && withKinds.deepLink.includes('fixed')
    );

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

describe('scenario compare kind filter', () => {
  const sc = {
    changed: [
      { kind: 'regressed', specName: 'A', scnName: 'a', baseVerdict: 'pass', targetVerdict: 'fail' },
      { kind: 'fixed', specName: 'B', scnName: 'b', baseVerdict: 'fail', targetVerdict: 'pass' },
      { kind: 'added', specName: 'C', scnName: 'c', targetVerdict: 'fail' },
    ],
    unchangedCount: 2,
    baseCount: 4,
    targetCount: 5,
  };


  it('inspectCompareShareCardHtml validates template/title/kinds', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    const html = buildCompareShareCardHtml(cmp, {
      template: 'light',
      title: '抽检标题',
      kinds: ['regressed', 'fixed'],
    });
    const ok = inspectCompareShareCardHtml(html, {
      template: 'light',
      title: '抽检标题',
      kinds: ['fixed', 'regressed'],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.template, 'light');
    assert.equal(ok.title, '抽检标题');
    assert.deepEqual(new Set(ok.kinds), new Set(['regressed', 'fixed']));

    const bad = inspectCompareShareCardHtml(html, {
      template: 'compact',
      title: '抽检标题',
      kinds: ['added'],
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.issues.some((x) => /模板/.test(x)));
    assert.ok(bad.issues.some((x) => /场景类型/.test(x)));
  });

  it('inspectCompareShareCardHtml decodes escaped title meta', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    const html = buildCompareShareCardHtml(cmp, {
      template: 'default',
      title: 'A & B <diff>',
      kinds: null,
    });
    const ok = inspectCompareShareCardHtml(html, {
      template: 'default',
      title: 'A & B <diff>',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.title, 'A & B <diff>');
  });

  it('normalizeScenarioCompareKinds drops unknowns and empties', () => {
    assert.equal(normalizeScenarioCompareKinds(null), null);
    assert.equal(normalizeScenarioCompareKinds([]), null);
    assert.deepEqual(normalizeScenarioCompareKinds(['regressed', 'nope', 'fixed']), [
      'regressed',
      'fixed',
    ]);
    assert.ok(SCENARIO_COMPARE_KIND_FILTERS.includes('reason_changed'));
  });

  it('filterScenarioCompare keeps only selected kinds', () => {
    const filtered = filterScenarioCompare(sc, { kinds: ['regressed', 'added'] });
    assert.equal(filtered.changed.length, 2);
    assert.deepEqual(
      filtered.changed.map((d) => d.kind),
      ['regressed', 'added']
    );
    assert.equal(filtered.unchangedCount, 2);
  });

  it('share markdown/json honor kinds filter', () => {
    const cmp = {
      base: { id: 'b1', verdict: 'fail', timestamp: 't', duration: '1s' },
      target: { id: 't1', verdict: 'fail', timestamp: 't', duration: '1s' },
      verdictSame: true,
      durationMs: { delta: 0 },
      specs: { base: 1, target: 1, delta: 0 },
      scenarios: { base: 1, target: 1, delta: 0 },
      steps: { base: 1, target: 1, delta: 0 },
      scenarioCompare: sc,
    };
    const md = buildCompareShareMarkdown(cmp, { kinds: ['fixed'] });
    assert.match(md, /修复/);
    assert.doesNotMatch(md, /\*\*变差\*\*/);
    const json = JSON.parse(buildCompareShareJson(cmp, { kinds: ['added'] }));
    assert.equal(json.scenarioCompare.changedCount, 1);
    assert.equal(json.scenarioCompare.changed[0].kind, 'added');
    assert.deepEqual(json.scenarioCompare.kindsFilter, ['added']);
    const html = buildCompareShareCardHtml(cmp, { kinds: ['regressed'] });
    assert.match(html, /变差/);
    assert.match(html, /已筛/);
    assert.doesNotMatch(html, />修复</);
  });

  it('share card scenario diffs include open deep links when hub+scn ids present', () => {
    const { base, target } = sampleEntries();
    const cmp = compareHistoryRuns(base, target);
    cmp.scenarioCompare = {
      changed: [
        {
          kind: 'regressed',
          specName: 'Login',
          scnName: 'valid user',
          baseScnId: 'scn:login',
          targetScnId: 'scn:login',
          baseVerdict: 'pass',
          targetVerdict: 'fail',
          targetReason: 'timeout after 30s',
        },
      ],
      unchangedCount: 1,
      baseCount: 2,
      targetCount: 2,
    };
    const hub = '/tmp/report-hub';
    const md = buildCompareShareMarkdown(cmp, { hub });
    assert.match(md, /studio-reporter:\/\/open\?run=/);
    assert.match(md, /focus=scn%3Alogin|focus=scn:login/);
    assert.match(md, /目标报告/);

    const html = buildCompareShareCardHtml(cmp, { hub });
    assert.match(html, /scenario-diff-open/);
    assert.match(html, /studio-reporter:\/\/open\?run=/);
    assert.match(html, /failSteps=1/);

    const json = JSON.parse(buildCompareShareJson(cmp, { hub }));
    const links = json.scenarioCompare.changed[0].openLinks;
    assert.ok(links && links.target && links.base);
    assert.match(links.target, /failSteps=1/);
    assert.equal(decodeURIComponent(new URL(links.target).searchParams.get('run')), cmp.target.id);
    assert.equal(decodeURIComponent(new URL(links.base).searchParams.get('run')), cmp.base.id);
    assert.equal(decodeURIComponent(new URL(links.target).searchParams.get('focus')), 'scn:login');

    const built = resolveScenarioDiffOpenLinks(cmp.scenarioCompare.changed[0], {
      hub,
      base: cmp.base,
      target: cmp.target,
    });
    assert.equal(built.target, links.target);
    assert.equal(built.base, links.base);
  });

  it('share card open deep links encode path-style scn ids (slash in focus)', () => {
    const { parseDeepLink } = require('./deeplink.js');
    const { base, target } = sampleEntries();
    const pathFocus = 'spec:specs/auth/login.spec-scn-0';
    const cmp = compareHistoryRuns(base, target);
    cmp.scenarioCompare = {
      changed: [
        {
          kind: 'regressed',
          specName: 'Login',
          scnName: 'valid user',
          baseScnId: pathFocus,
          targetScnId: pathFocus,
          baseVerdict: 'pass',
          targetVerdict: 'fail',
          targetReason: 'timeout',
        },
      ],
      unchangedCount: 0,
      baseCount: 1,
      targetCount: 1,
    };
    const hub = '/tmp/hub/path with#hash';
    const json = JSON.parse(buildCompareShareJson(cmp, { hub }));
    const links = json.scenarioCompare.changed[0].openLinks;
    assert.ok(links.base && links.target);
    assert.ok(links.target.includes('%2F'), 'focus slash must be query-encoded');
    assert.match(links.target, /focus=spec%3Aspecs%2Fauth%2Flogin\.spec-scn-0/);
    const parsed = parseDeepLink(links.target);
    assert.equal(parsed.focus, pathFocus);
    assert.equal(parsed.failSteps, true);
    assert.equal(parsed.hub, hub);

    const md = buildCompareShareMarkdown(cmp, { hub });
    assert.match(md, /focus=spec%3Aspecs%2Fauth%2Flogin\.spec-scn-0/);
  });
});
