'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldNotifySuiteEnd,
  formatSuiteEndNotification,
} = require('./notify.js');

describe('suite-end notify helpers', () => {
  it('shouldNotifySuiteEnd respects enabled and focus', () => {
    assert.equal(shouldNotifySuiteEnd({ enabled: true, windowFocused: false }), true);
    assert.equal(shouldNotifySuiteEnd({ enabled: true, windowFocused: true }), false);
    assert.equal(shouldNotifySuiteEnd({ enabled: false, windowFocused: false }), false);
    assert.equal(shouldNotifySuiteEnd({}), true);
  });

  it('formatSuiteEndNotification prefers reportPath', () => {
    const n = formatSuiteEndNotification({
      reportPath: '/tmp/hub/index.html',
      reportDir: '/tmp/hub',
    });
    assert.match(n.title, /套件已结束/);
    assert.match(n.body, /\/tmp\/hub\/index\.html/);
    assert.equal(n.reportPath, '/tmp/hub/index.html');
  });

  it('formatSuiteEndNotification falls back when empty', () => {
    const n = formatSuiteEndNotification({});
    assert.match(n.body, /终态报告/);
  });
});
