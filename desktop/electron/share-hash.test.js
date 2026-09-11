'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseShareHash,
  formatShareHash,
  reportOpenHashFromOutline,
  appendShareHash,
  reportFocusHash,
  resolveReportOpenHash,
} = require('./share-hash.js');

describe('share-hash', () => {
  it('round-trips filters', () => {
    const h = formatShareHash({
      focus: 'overview',
      query: 'login',
      scenario: 'fail',
      failSteps: true,
    });
    assert.match(h, /failSteps=1/);
    assert.match(h, /q=login/);
    const p = parseShareHash(h);
    assert.equal(p.query, 'login');
    assert.equal(p.scenario, 'fail');
    assert.equal(p.failSteps, true);
  });

  it('parses legacy fail-steps', () => {
    const p = parseShareHash('#fail-steps');
    assert.equal(p.focus, 'overview');
    assert.equal(p.failSteps, true);
  });

  it('accepts failSteps case and alias keys (parity with Go/static)', () => {
    assert.equal(parseShareHash('overview?failSteps=TRUE').failSteps, true);
    assert.equal(parseShareHash('overview?failsteps=1').failSteps, true);
    assert.equal(parseShareHash('overview?fail_steps=Yes').failSteps, true);
    assert.equal(parseShareHash('overview?fail-steps=true').failSteps, true);
    assert.equal(parseShareHash('overview?failSteps=FALSE').failSteps, false);
    assert.equal(parseShareHash('fail-steps&failSteps=0').failSteps, false);
  });

  it('reportOpenHashFromOutline maps fail verdict to failSteps', () => {
    assert.equal(
      reportOpenHashFromOutline({ query: 'x', verdict: 'fail' }),
      formatShareHash({ focus: 'overview', query: 'x', scenario: 'fail', failSteps: true })
    );
    assert.equal(reportOpenHashFromOutline({ verdict: 'all' }), 'overview');
  });

  it('reportFocusHash selects node without outline query', () => {
    assert.equal(reportFocusHash('scn:login', { failSteps: true }), 'scn:login?failSteps=1');
    assert.equal(reportFocusHash('scn:x'), 'scn:x');
  });

  it('resolveReportOpenHash supports failSteps-only digest opens', () => {
    assert.equal(resolveReportOpenHash({ failSteps: true }), 'overview?failSteps=1');
    assert.equal(
      resolveReportOpenHash({ focus: 'scn:a', failSteps: true }),
      'scn:a?failSteps=1',
    );
    assert.equal(resolveReportOpenHash({ hash: '#overview?failSteps=1' }), 'overview?failSteps=1');
    assert.equal(resolveReportOpenHash({}), '');
  });

  it('uhilreport open with failSteps-only (no focus) still resolves overview hash', () => {
    // Mirrors desktop/electron/main.js handleDeepLinkAction:
    // open?path=*.uhilreport&failSteps=1 must re-open with this hash after regenerate.
    const parsed = { focus: undefined, failSteps: true };
    assert.equal(
      !!(parsed.focus || parsed.failSteps),
      true,
      'main must re-open when failSteps set without focus',
    );
    assert.equal(resolveReportOpenHash(parsed), 'overview?failSteps=1');
    assert.equal(resolveReportOpenHash({ focus: '', failSteps: false }), '');
  });

  it('appendShareHash replaces existing fragment', () => {
    assert.equal(
      appendShareHash('http://127.0.0.1:9/index.html#old', 'overview?failSteps=1'),
      'http://127.0.0.1:9/index.html#overview?failSteps=1'
    );
  });

  it('round-trips Unicode/spaces in query and focus via URL.hash', () => {
    const cases = [
      { focus: 'overview', query: '登录 用例', scenario: 'fail', failSteps: true },
      { focus: 'overview', query: 'a+b = c', failSteps: true },
      { focus: 'scn:登录 失败', failSteps: true },
      { focus: 'overview', query: 'emoji 🧪 test' },
    ];
    for (const c of cases) {
      const h = formatShareHash(c);
      if (c.focus && c.focus !== 'overview' && /[\s\u0080-\uffff]/.test(c.focus)) {
        assert.ok(h.includes('%'), `focus should be encoded: ${h}`);
        assert.ok(!h.startsWith(c.focus + '?') && h !== c.focus, `raw focus leaked: ${h}`);
      }
      const url = appendShareHash('http://127.0.0.1:9/index.html', h);
      const parsed = parseShareHash(new URL(url).hash);
      assert.equal(parsed.focus, c.focus || 'overview');
      assert.equal(parsed.query, c.query || '');
      assert.equal(!!parsed.failSteps, !!c.failSteps);
      if (c.scenario) assert.equal(parsed.scenario, c.scenario);
    }
  });

  it('keeps path slash in focus so hash matches DOM ids like spec:specs/auth/login.spec', () => {
    const focus = 'spec:specs/auth/login.spec';
    const { encodeShareFocus } = require('./share-hash.js');
    assert.equal(encodeShareFocus(focus), focus);
    assert.ok(!encodeShareFocus(focus).includes('%2F'));
    const h = formatShareHash({ focus, failSteps: true });
    assert.ok(h.startsWith(focus + '?'));
    assert.ok(!h.includes('%2F'));
    const url = appendShareHash('http://127.0.0.1:9/index.html', h);
    const parsed = parseShareHash(new URL(url).hash);
    assert.equal(parsed.focus, focus);
    assert.equal(parsed.failSteps, true);
    // Legacy percent-encoded slash still resolves to the DOM id.
    assert.equal(parseShareHash('spec:specs%2Fauth%2Flogin.spec').focus, focus);
  });

  it('deep-link focus with path slash becomes hash with literal slash (query≠fragment encoding)', () => {
    const { buildOpenDeepLink, parseDeepLink } = require('./deeplink.js');
    const focus = 'spec:specs/auth/login.spec-scn-0';
    const link = buildOpenDeepLink({ run: 'r1', hub: '/hub', focus, failSteps: true });
    assert.ok(link.includes('%2F'), 'open query encodes /');
    const parsed = parseDeepLink(link);
    assert.equal(parsed.focus, focus);
    const hash = reportFocusHash(parsed.focus, { failSteps: parsed.failSteps });
    assert.equal(hash, `${focus}?failSteps=1`);
    assert.ok(!hash.includes('%2F'), 'fragment keeps / for getElementById');
    assert.equal(parseShareHash(hash).focus, focus);
    assert.equal(resolveReportOpenHash({ focus: parsed.focus, failSteps: true }), hash);
  });

});
