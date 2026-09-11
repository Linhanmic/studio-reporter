'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readHistory, resolveRunIndex, resolveRunDir, resolveRunUhilreport, filterHistoryRuns, listFailedHistoryRuns, deleteHistoryRun, deleteHistoryRuns, loadSettings, saveSettings, normalizeLastTab, normalizeOutlinePaneWidth, normalizeOutlineQuery, normalizeOutlineVerdict, normalizeDiscoverTimeoutMs, normalizeCompareCardTemplate, normalizeCompareCardTitle, normalizeCompareScenarioKindsPref, DEFAULTS, OUTLINE_PANE_WIDTH_MIN, OUTLINE_PANE_WIDTH_MAX, DISCOVER_TIMEOUT_MS_MIN, DISCOVER_TIMEOUT_MS_MAX, DISCOVER_TIMEOUT_MS_DEFAULT } = require('./settings.js');

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


  it('filterHistoryRuns matches topFailReason and listFailedHistoryRuns', () => {
    const runs = [
      { id: 'a', projectName: 'Login', verdict: 'pass' },
      { id: 'b', projectName: 'Pay', verdict: 'fail', topFailReason: 'timeout after 30s' },
      { id: 'c', projectName: 'Cart', verdict: 'fail', topFailReason: 'null pointer', failed: true },
      { id: 'd', projectName: 'Hook', failed: true, verdict: '' },
    ];
    assert.equal(filterHistoryRuns(runs, { verdict: 'fail', failReasonQuery: 'timeout' }).length, 1);
    assert.equal(filterHistoryRuns(runs, { failReasonQuery: 'null' })[0].id, 'c');
    assert.equal(filterHistoryRuns(runs, { query: 'timeout' })[0].id, 'b');
    assert.deepEqual(
      listFailedHistoryRuns(runs).map((r) => r.id),
      ['b', 'c', 'd']
    );
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

describe('settings outline pane width', () => {
  it('normalizeOutlinePaneWidth clamps to range', () => {
    assert.equal(normalizeOutlinePaneWidth(240), 240);
    assert.equal(normalizeOutlinePaneWidth(50), OUTLINE_PANE_WIDTH_MIN);
    assert.equal(normalizeOutlinePaneWidth(9999), OUTLINE_PANE_WIDTH_MAX);
    assert.equal(normalizeOutlinePaneWidth('nope'), 240);
  });

  it('load/save round-trips outlinePaneWidth', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-outline-w-'));
    const saved = saveSettings(dir, { outlinePaneWidth: 320 });
    assert.equal(saved.outlinePaneWidth, 320);
    assert.equal(loadSettings(dir).outlinePaneWidth, 320);
    assert.equal(saveSettings(dir, { outlinePaneWidth: 12 }).outlinePaneWidth, OUTLINE_PANE_WIDTH_MIN);
    assert.equal(DEFAULTS.outlinePaneWidth, 240);
  });
});

describe('settings outline search persistence', () => {
  it('normalizeOutlineQuery trims and caps', () => {
    assert.equal(normalizeOutlineQuery('  login  '), 'login');
    assert.equal(normalizeOutlineQuery('x'.repeat(300)).length, 200);
  });

  it('normalizeOutlineVerdict accepts known values', () => {
    assert.equal(normalizeOutlineVerdict('FAIL'), 'fail');
    assert.equal(normalizeOutlineVerdict('nope'), 'all');
  });

  it('load/save round-trips outlineQuery and outlineVerdict', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-outline-q-'));
    const saved = saveSettings(dir, { outlineQuery: '  smoke  ', outlineVerdict: 'fail' });
    assert.equal(saved.outlineQuery, 'smoke');
    assert.equal(saved.outlineVerdict, 'fail');
    const loaded = loadSettings(dir);
    assert.equal(loaded.outlineQuery, 'smoke');
    assert.equal(loaded.outlineVerdict, 'fail');
    assert.equal(DEFAULTS.outlineQuery, '');
    assert.equal(DEFAULTS.outlineVerdict, 'all');
  });
});

describe('settings discover timeout', () => {
  it('normalizeDiscoverTimeoutMs clamps to range', () => {
    assert.equal(normalizeDiscoverTimeoutMs(20000), 20000);
    assert.equal(normalizeDiscoverTimeoutMs(100), DISCOVER_TIMEOUT_MS_MIN);
    assert.equal(normalizeDiscoverTimeoutMs(999999), DISCOVER_TIMEOUT_MS_MAX);
    assert.equal(normalizeDiscoverTimeoutMs('nope'), DISCOVER_TIMEOUT_MS_DEFAULT);
  });

  it('load/save round-trips discoverTimeoutMs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-discover-t-'));
    const saved = saveSettings(dir, { discoverTimeoutMs: 45000 });
    assert.equal(saved.discoverTimeoutMs, 45000);
    assert.equal(loadSettings(dir).discoverTimeoutMs, 45000);
    assert.equal(saveSettings(dir, { discoverTimeoutMs: 1 }).discoverTimeoutMs, DISCOVER_TIMEOUT_MS_MIN);
    assert.equal(DEFAULTS.discoverTimeoutMs, 20000);
  });
});

describe('settings compare card prefs', () => {
  it('normalizeCompareCardTemplate and title', () => {
    assert.equal(normalizeCompareCardTemplate('light'), 'light');
    assert.equal(normalizeCompareCardTemplate('x'), 'default');
    assert.equal(normalizeCompareCardTitle('  Hello  '), 'Hello');
  });

  it('load/save round-trips compareCardTemplate/title', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-compare-card-'));
    const saved = saveSettings(dir, { compareCardTemplate: 'compact', compareCardTitle: '  QA  ' });
    assert.equal(saved.compareCardTemplate, 'compact');
    assert.equal(saved.compareCardTitle, 'QA');
    const loaded = loadSettings(dir);
    assert.equal(loaded.compareCardTemplate, 'compact');
    assert.equal(loaded.compareCardTitle, 'QA');
    assert.equal(DEFAULTS.compareCardTemplate, 'default');
  });
});


describe('settings compare scenario kinds', () => {
  it('normalizeCompareScenarioKindsPref collapses all/empty to null', () => {
    assert.equal(normalizeCompareScenarioKindsPref(null), null);
    assert.equal(normalizeCompareScenarioKindsPref([]), null);
    assert.deepEqual(normalizeCompareScenarioKindsPref(['regressed', 'fixed']), ['regressed', 'fixed']);
    assert.equal(
      normalizeCompareScenarioKindsPref(['regressed', 'fixed', 'added', 'removed', 'reason_changed']),
      null
    );
  });

  it('load/save round-trips compareScenarioKinds', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-compare-kinds-'));
    const saved = saveSettings(dir, { compareScenarioKinds: ['added', 'bogus', 'removed'] });
    assert.deepEqual(saved.compareScenarioKinds, ['added', 'removed']);
    const loaded = loadSettings(dir);
    assert.deepEqual(loaded.compareScenarioKinds, ['added', 'removed']);
    assert.equal(DEFAULTS.compareScenarioKinds, null);
    assert.equal(saveSettings(dir, { compareScenarioKinds: null }).compareScenarioKinds, null);
  });
});
