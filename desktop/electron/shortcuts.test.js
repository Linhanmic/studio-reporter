'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TAB_ORDER,
  shouldIgnoreShortcutTarget,
  matchShortcut,
  nextTab,
} = require('./shortcuts.js');

describe('shortcuts', () => {
  it('exposes tab order', () => {
    assert.deepEqual(TAB_ORDER, ['run', 'report', 'history', 'settings']);
  });

  it('matchShortcut maps modifiers and F5', () => {
    assert.deepEqual(matchShortcut({ key: '1', ctrlKey: true }), {
      type: 'tab',
      tab: 'run',
    });
    assert.deepEqual(matchShortcut({ key: '3', metaKey: true }), {
      type: 'tab',
      tab: 'history',
    });
    assert.deepEqual(matchShortcut({ key: 'Enter', ctrlKey: true }), {
      type: 'connect',
    });
    assert.deepEqual(matchShortcut({ key: 'h', ctrlKey: true, shiftKey: true }), {
      type: 'refresh-history',
    });
    assert.deepEqual(matchShortcut({ key: 'F5' }), { type: 'refresh-history' });
    assert.equal(matchShortcut({ key: '1' }), null);
  });

  it('shouldIgnoreShortcutTarget blocks text inputs', () => {
    assert.equal(
      shouldIgnoreShortcutTarget({ tagName: 'INPUT', type: 'text' }),
      true
    );
    assert.equal(
      shouldIgnoreShortcutTarget({ tagName: 'INPUT', type: 'checkbox' }),
      false
    );
    assert.equal(shouldIgnoreShortcutTarget({ tagName: 'TEXTAREA' }), true);
    assert.equal(shouldIgnoreShortcutTarget({ tagName: 'BUTTON' }), false);
  });

  it('nextTab wraps around', () => {
    assert.equal(nextTab('run', 'ArrowRight'), 'report');
    assert.equal(nextTab('settings', 'ArrowRight'), 'run');
    assert.equal(nextTab('run', 'ArrowLeft'), 'settings');
    assert.equal(nextTab('history', 'Home'), 'run');
    assert.equal(nextTab('run', 'End'), 'settings');
  });
});
