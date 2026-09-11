'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readHistory, resolveRunIndex } = require('./settings.js');

describe('settings history helpers', () => {
  it('reads history.json runs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-hist-'));
    fs.writeFileSync(
      path.join(dir, 'history.json'),
      JSON.stringify({
        formatVersion: 1,
        runs: [{ id: 'a', href: 'archives/a/index.html', projectName: 'demo', verdict: 'pass' }],
      })
    );
    const hist = readHistory(dir);
    assert.equal(hist.runs.length, 1);
    assert.equal(hist.runs[0].id, 'a');
    assert.equal(
      resolveRunIndex(dir, hist.runs[0]),
      path.resolve(dir, 'archives/a/index.html')
    );
  });

  it('returns empty when missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-hist-missing-'));
    const hist = readHistory(dir);
    assert.equal(hist.runs.length, 0);
    assert.ok(hist.error);
  });
});
