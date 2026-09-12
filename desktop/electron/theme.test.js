'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { THEMES, normalizeTheme, resolveTheme } = require('./theme.js');

describe('theme', () => {
  it('exposes supported preferences', () => {
    assert.deepEqual(THEMES, ['system', 'light', 'dark']);
  });

  it('normalizeTheme falls back to system', () => {
    assert.equal(normalizeTheme('light'), 'light');
    assert.equal(normalizeTheme('DARK'), 'dark');
    assert.equal(normalizeTheme('nope'), 'system');
    assert.equal(normalizeTheme(null), 'system');
  });

  it('resolveTheme maps system to OS preference', () => {
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
  });
});
