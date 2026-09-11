'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseShareHash,
  formatShareHash,
  reportOpenHashFromOutline,
  appendShareHash,
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

  it('reportOpenHashFromOutline maps fail verdict to failSteps', () => {
    assert.equal(
      reportOpenHashFromOutline({ query: 'x', verdict: 'fail' }),
      formatShareHash({ focus: 'overview', query: 'x', scenario: 'fail', failSteps: true })
    );
    assert.equal(reportOpenHashFromOutline({ verdict: 'all' }), 'overview');
  });

  it('appendShareHash replaces existing fragment', () => {
    assert.equal(
      appendShareHash('http://127.0.0.1:9/index.html#old', 'overview?failSteps=1'),
      'http://127.0.0.1:9/index.html#overview?failSteps=1'
    );
  });
});
