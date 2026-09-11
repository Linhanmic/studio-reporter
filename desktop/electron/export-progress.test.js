'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  exportProgressPercent,
  exportProgressBasename,
  exportKindLabel,
  formatExportProgress,
} = require('./export-progress.js');

describe('export-progress', () => {
  it('exportProgressPercent clamps and rounds', () => {
    assert.equal(exportProgressPercent(0, 4), 0);
    assert.equal(exportProgressPercent(1, 4), 25);
    assert.equal(exportProgressPercent(2, 3), 67);
    assert.equal(exportProgressPercent(5, 4), 100);
    assert.equal(exportProgressPercent(1, 0), 0);
  });

  it('exportProgressBasename handles unix and windows paths', () => {
    assert.equal(exportProgressBasename('/hub/archives/run-1/run.uhilreport'), 'run.uhilreport');
    assert.equal(exportProgressBasename('C:\\hub\\a.uhilreport'), 'a.uhilreport');
    assert.equal(exportProgressBasename(''), '');
    assert.equal(exportProgressBasename(null), '');
  });

  it('exportKindLabel maps known kinds', () => {
    assert.equal(exportKindLabel('pdf'), 'PDF');
    assert.equal(exportKindLabel('single'), '单文件 HTML');
    assert.equal(exportKindLabel('other'), 'other');
  });

  it('formatExportProgress builds status and bar labels', () => {
    const f = formatExportProgress({
      current: 2,
      total: 5,
      input: '/tmp/archives/demo/suite.uhilreport',
      kind: 'pdf',
    });
    assert.equal(f.percent, 40);
    assert.equal(f.basename, 'suite.uhilreport');
    assert.equal(f.kindLabel, 'PDF');
    assert.equal(f.barLabel, '2/5 · 40%');
    assert.match(f.statusText, /PDF/);
    assert.match(f.statusText, /suite\.uhilreport/);
    assert.match(f.statusText, /40%/);

    const idle = formatExportProgress({ current: 0, total: 3, kind: 'single' }, '单文件 HTML');
    assert.equal(idle.percent, 0);
    assert.match(idle.statusText, /0\/3 · 0%/);
  });
});
