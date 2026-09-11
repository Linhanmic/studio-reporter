'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readHistory, resolveRunIndex, resolveRunUhilreport, filterHistoryRuns } = require('./settings.js');

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

  it('filterHistoryRuns filters by query and verdict', () => {
    const runs = [
      { id: 'a', projectName: 'Login suite', verdict: 'pass', timestamp: '2026-01-01' },
      { id: 'b', projectName: 'Logout suite', verdict: 'fail', timestamp: '2026-01-02' },
      { id: 'c', projectName: 'Smoke', verdict: 'skip', timestamp: '2026-01-03' },
    ];
    assert.equal(filterHistoryRuns(runs, { query: 'login' }).length, 1);
    assert.equal(filterHistoryRuns(runs, { verdict: 'fail' })[0].id, 'b');
    assert.equal(filterHistoryRuns(runs, { query: 'suite', verdict: 'pass' })[0].id, 'a');
    assert.deepEqual(filterHistoryRuns(null, { query: 'x' }), []);
  });

  it('resolveRunUhilreport finds sibling portable report', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-uhil-'));
    const arch = path.join(dir, 'archives', 'run-1');
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(path.join(arch, 'index.html'), '<html></html>');
    const uhil = path.join(arch, 'demo-2026.uhilreport');
    fs.writeFileSync(uhil, '{}');
    const entry = { id: 'run-1', href: 'archives/run-1/index.html' };
    assert.equal(resolveRunUhilreport(dir, entry), uhil);
  });
});
