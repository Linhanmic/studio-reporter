'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { planOpenFromFailSummaryMarkdown } = require('./fail-summary-open.js');

describe('fail-summary-open', () => {
  it('plans open opts from path-style 定位 deep links in Markdown', () => {
    const focus = 'spec:specs/auth/login.spec-scn-0';
    const md = [
      '# Studio Reporter — 失败摘要',
      '',
      '## 失败场景',
      `1. Bad password (\`${focus}\`)`,
      '   - assertion failed',
      `   - 定位: \`#${focus}\``,
      '',
    ].join('\n');
    const plan = planOpenFromFailSummaryMarkdown(md, {
      reportDir: '/tmp/reports/run-1',
      failSteps: true,
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.focus, focus);
    assert.ok(plan.focus.includes('/'));
    assert.equal(plan.failSteps, true);
    assert.equal(plan.hash, `${focus}?failSteps=1`);
    assert.ok(!plan.hash.includes('%2F'));
    assert.equal(plan.needsReportDir, false);
    assert.equal(plan.reportDir, '/tmp/reports/run-1');
  });

  it('flags needsReportDir when no report dir is known', () => {
    const focus = 'spec:specs/checkout/pay.spec-scn-1';
    const plan = planOpenFromFailSummaryMarkdown(`定位: \`#${focus}?failSteps=1\``, {});
    assert.equal(plan.ok, true);
    assert.equal(plan.focus, focus);
    assert.equal(plan.needsReportDir, true);
  });

  it('returns no-focus when Markdown has no locator lines', () => {
    const plan = planOpenFromFailSummaryMarkdown('# empty\n\nno locators\n', {
      reportDir: '/tmp/x',
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.code, 'no-focus');
  });
});
