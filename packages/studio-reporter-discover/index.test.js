'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  REPORTER_WS_LINE_RE,
  extractReporterWsUrl,
  normalizeWsInput,
} = require('./index.js');

describe('@studio-reporter/discover', () => {
  it('matches stdout discover line', () => {
    assert.ok(REPORTER_WS_LINE_RE.test('studio-reporter websocket: ws://127.0.0.1:45678'));
    assert.equal(
      extractReporterWsUrl('info\nstudio-reporter websocket: ws://127.0.0.1:9\nmore'),
      'ws://127.0.0.1:9'
    );
  });

  it('normalizes paste variants', () => {
    assert.equal(normalizeWsInput('8765'), 'ws://127.0.0.1:8765');
    assert.equal(normalizeWsInput('ws://127.0.0.1:1234'), 'ws://127.0.0.1:1234');
    assert.equal(
      normalizeWsInput('studio-reporter websocket: ws://127.0.0.1:5555'),
      'ws://127.0.0.1:5555'
    );
    assert.equal(normalizeWsInput(''), null);
    assert.equal(normalizeWsInput('not-a-url'), null);
  });
});
