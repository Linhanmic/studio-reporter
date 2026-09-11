'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readHistory, resolveRunIndex, resolveRunDir, resolveRunUhilreport, filterHistoryRuns, deleteHistoryRun, deleteHistoryRuns, loadSettings, saveSettings, normalizeLastTab, DEFAULTS } = require('./settings.js');

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

  it('deleteHistoryRun removes archive and history entry', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-hist-del-'));
    const arch = path.join(dir, 'archives', 'run-1');
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(path.join(arch, 'index.html'), '<html></html>');
    fs.writeFileSync(
      path.join(dir, 'history.json'),
      JSON.stringify({
        formatVersion: 1,
        runs: [
          { id: 'run-1', href: 'archives/run-1/index.html', projectName: 'demo', verdict: 'pass' },
          { id: 'run-2', href: 'archives/run-2/index.html', projectName: 'demo', verdict: 'fail' },
        ],
      })
    );
    const result = deleteHistoryRun(dir, 'run-1');
    assert.equal(result.id, 'run-1');
    assert.equal(fs.existsSync(arch), false);
    const hist = readHistory(dir);
    assert.equal(hist.runs.length, 1);
    assert.equal(hist.runs[0].id, 'run-2');
    assert.ok(fs.existsSync(path.join(dir, 'history-live.js')));
  });

  it('deleteHistoryRun rejects reserved hub files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-hist-reserved-'));
    fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ formatVersion: 1, runs: [] }));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    assert.throws(() => deleteHistoryRun(dir, 'index.html'));
    assert.throws(() => deleteHistoryRun(dir, 'history.json'));
    assert.ok(fs.existsSync(path.join(dir, 'index.html')));
  });

  it('deleteHistoryRuns deletes multiple ids', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-hist-batch-'));
    for (const id of ['a', 'b', 'c']) {
      const arch = path.join(dir, 'archives', id);
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(arch, 'index.html'), '<html></html>');
    }
    fs.writeFileSync(
      path.join(dir, 'history.json'),
      JSON.stringify({
        formatVersion: 1,
        runs: [
          { id: 'a', href: 'archives/a/index.html' },
          { id: 'b', href: 'archives/b/index.html' },
          { id: 'c', href: 'archives/c/index.html' },
        ],
      })
    );
    const result = deleteHistoryRuns(dir, ['a', 'c']);
    assert.deepEqual(result.deleted, ['a', 'c']);
    const hist = readHistory(dir);
    assert.equal(hist.runs.length, 1);
    assert.equal(hist.runs[0].id, 'b');
  });


  it('resolveRunDir returns archive directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-rundir-'));
    const entry = { id: 'run-1', href: 'archives/run-1/index.html' };
    assert.equal(
      resolveRunDir(dir, entry),
      path.resolve(dir, 'archives/run-1')
    );
  });

});

describe('settings session restore fields', () => {
  it('normalizeLastTab accepts known tabs only', () => {
    assert.equal(normalizeLastTab('history'), 'history');
    assert.equal(normalizeLastTab('nope'), 'run');
    assert.equal(normalizeLastTab('', 'settings'), 'settings');
  });

  it('defaults include recentHubs / lastTab / restoreSession', () => {
    assert.deepEqual(DEFAULTS.recentHubs, []);
    assert.equal(DEFAULTS.lastTab, 'run');
    assert.equal(DEFAULTS.restoreSession, true);
  });

  it('load/save round-trips recentHubs and lastTab', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-settings-'));
    const saved = saveSettings(dir, {
      reportHubDir: '/tmp/hub-a',
      recentHubs: ['/tmp/hub-a', '/tmp/hub-b'],
      lastTab: 'history',
      restoreSession: false,
    });
    assert.equal(saved.lastTab, 'history');
    assert.equal(saved.restoreSession, false);
    assert.deepEqual(saved.recentHubs, ['/tmp/hub-a', '/tmp/hub-b']);
    const loaded = loadSettings(dir);
    assert.equal(loaded.lastTab, 'history');
    assert.equal(loaded.restoreSession, false);
    assert.deepEqual(loaded.recentHubs, ['/tmp/hub-a', '/tmp/hub-b']);
    const coerced = saveSettings(dir, { lastTab: 'bogus' });
    assert.equal(coerced.lastTab, 'run');
  });
});
