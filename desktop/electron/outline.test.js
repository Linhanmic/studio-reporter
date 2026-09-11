'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildReportOutline, loadOutlineFromReportDir, filterOutline } = require('./outline.js');

describe('outline', () => {
  it('builds slim spec→scenario tree', () => {
    const outline = buildReportOutline({
      rev: 3,
      running: true,
      currentSpecId: 'spec-a',
      currentScenarioId: 'scn-1',
      report: {
        projectName: 'demo',
        specs: [
          {
            id: 'spec-a',
            heading: 'Login',
            fileName: 'specs/login.spec',
            verdict: 'fail',
            scenarios: [
              { id: 'scn-1', heading: 'ok path', verdict: 'pass', items: [{ kind: 'step' }] },
              { id: 'scn-2', heading: 'bad path', verdict: 'fail' },
            ],
          },
        ],
      },
    });
    assert.equal(outline.projectName, 'demo');
    assert.equal(outline.running, true);
    assert.equal(outline.source, 'live');
    assert.equal(outline.specs.length, 1);
    assert.equal(outline.specs[0].scenarios.length, 2);
    assert.equal(outline.specs[0].scenarios[0].heading, 'ok path');
    assert.equal(outline.specs[0].scenarios[0].items, undefined);
    assert.equal(outline.currentScenarioId, 'scn-1');
  });

  it('handles empty / null payload', () => {
    const empty = buildReportOutline(null);
    assert.deepEqual(empty.specs, []);
    assert.equal(empty.running, false);
    assert.equal(empty.projectName, '');
  });

  it('loadOutlineFromReportDir reads report.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-outline-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'report.json'),
        JSON.stringify({
          running: false,
          report: {
            projectName: 'final-demo',
            specs: [{ id: 's1', heading: 'Spec', verdict: 'pass', scenarios: [] }],
          },
        })
      );
      const outline = loadOutlineFromReportDir(dir);
      assert.equal(outline.source, 'final');
      assert.equal(outline.projectName, 'final-demo');
      assert.equal(outline.specs[0].id, 's1');
      assert.equal(loadOutlineFromReportDir(path.join(dir, 'missing')), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('filterOutline filters by query and verdict', () => {
    const base = buildReportOutline({
      report: {
        projectName: 'demo',
        specs: [
          {
            id: 'login',
            heading: 'Login',
            fileName: 'specs/login.spec',
            verdict: 'fail',
            scenarios: [
              { id: 'ok', heading: 'happy path', verdict: 'pass' },
              { id: 'bad', heading: 'bad password', verdict: 'fail' },
            ],
          },
          {
            id: 'logout',
            heading: 'Logout',
            fileName: 'specs/logout.spec',
            verdict: 'pass',
            scenarios: [{ id: 'bye', heading: 'sign out', verdict: 'pass' }],
          },
        ],
      },
    });
    const byQuery = filterOutline(base, { query: 'password' });
    assert.equal(byQuery.specs.length, 1);
    assert.equal(byQuery.specs[0].scenarios.length, 1);
    assert.equal(byQuery.specs[0].scenarios[0].id, 'bad');

    const fails = filterOutline(base, { verdict: 'fail' });
    assert.equal(fails.specs.length, 1);
    assert.equal(fails.specs[0].id, 'login');
    assert.ok(fails.specs[0].scenarios.every((s) => s.verdict === 'fail'));

    assert.equal(filterOutline(null, { query: 'x' }), null);
  });
});
