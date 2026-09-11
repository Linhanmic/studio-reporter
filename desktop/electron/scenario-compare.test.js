'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  scenarioLitesFromReport,
  compareScenarios,
  invertScenarioCompare,
  compareScenarioReportsFromDirs,
  scenarioDiffKindLabel,
} = require('./scenario-compare.js');

function sampleReports() {
  const base = {
    report: {
      specs: [
        {
          id: 'spec:login.spec',
          heading: 'Login',
          fileName: 'login.spec',
          scenarios: [
            { id: 's1', heading: 'valid user', verdict: 'pass', items: [] },
            {
              id: 's2',
              heading: 'bad password',
              verdict: 'fail',
              items: [{ kind: 'step', step: { verdict: 'fail', errorMessage: 'invalid credentials' } }],
            },
            {
              id: 's3',
              heading: 'locked account',
              verdict: 'fail',
              items: [{ kind: 'step', step: { verdict: 'fail', errorMessage: 'account locked' } }],
            },
          ],
        },
      ],
    },
  };
  const target = {
    report: {
      specs: [
        {
          id: 'spec:login.spec',
          heading: 'Login',
          fileName: 'login.spec',
          scenarios: [
            {
              id: 's1',
              heading: 'valid user',
              verdict: 'fail',
              items: [{ kind: 'step', step: { verdict: 'fail', errorMessage: 'timeout' } }],
            },
            {
              id: 's2',
              heading: 'bad password',
              verdict: 'fail',
              items: [{ kind: 'step', step: { verdict: 'fail', errorMessage: 'wrong password' } }],
            },
            {
              id: 's4',
              heading: 'otp required',
              verdict: 'fail',
              items: [{ kind: 'step', step: { verdict: 'fail', errorMessage: 'otp missing' } }],
            },
          ],
        },
      ],
    },
  };
  return { base, target };
}

describe('scenario-compare', () => {
  it('compareScenarios classifies regress/fix/add/remove', () => {
    const { base, target } = sampleReports();
    const cmp = compareScenarios(
      scenarioLitesFromReport(base),
      scenarioLitesFromReport(target),
    );
    const counts = {};
    for (const d of cmp.changed) counts[d.kind] = (counts[d.kind] || 0) + 1;
    assert.equal(counts.regressed, 1);
    assert.equal(counts.reason_changed, 1);
    assert.equal(counts.removed, 1);
    assert.equal(counts.added, 1);
    assert.equal(cmp.unchangedCount, 0);
  });

  it('invertScenarioCompare swaps regress/fixed and add/remove', () => {
    const { base, target } = sampleReports();
    const cmp = compareScenarios(
      scenarioLitesFromReport(base),
      scenarioLitesFromReport(target),
    );
    const inv = invertScenarioCompare(cmp);
    const counts = {};
    for (const d of inv.changed) counts[d.kind] = (counts[d.kind] || 0) + 1;
    assert.equal(counts.fixed, 1);
    assert.equal(counts.added, 1);
    assert.equal(counts.removed, 1);
    assert.equal(inv.baseCount, cmp.targetCount);
  });

  it('compareScenarioReportsFromDirs reads report.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scn-cmp-'));
    try {
      const { base, target } = sampleReports();
      const bDir = path.join(root, 'base');
      const tDir = path.join(root, 'target');
      fs.mkdirSync(bDir);
      fs.mkdirSync(tDir);
      fs.writeFileSync(path.join(bDir, 'report.json'), JSON.stringify(base));
      fs.writeFileSync(path.join(tDir, 'report.json'), JSON.stringify(target));
      const result = compareScenarioReportsFromDirs(bDir, tDir);
      assert.equal(result.ok, true);
      assert.ok(result.compare.changed.length >= 4);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('scenarioDiffKindLabel maps known kinds', () => {
    assert.equal(scenarioDiffKindLabel('regressed'), '变差');
    assert.equal(scenarioDiffKindLabel('fixed'), '修复');
  });
});

describe('scenario compare ids for report focus', () => {
  it('changed diffs carry base/target scn ids', () => {
    const base = [
      { key: 'a', specId: 'spec:a', scnId: 'scn:a', specName: 'A', scnName: 'a', verdict: 'pass' },
      { key: 'b', specId: 'spec:b', scnId: 'scn:b', specName: 'B', scnName: 'b', verdict: 'fail', failReason: 'x' },
    ];
    const target = [
      { key: 'a', specId: 'spec:a', scnId: 'scn:a', specName: 'A', scnName: 'a', verdict: 'fail', failReason: 'y' },
      { key: 'c', specId: 'spec:c', scnId: 'scn:c', specName: 'C', scnName: 'c', verdict: 'pass' },
    ];
    const cmp = compareScenarios(base, target);
    const reg = cmp.changed.find((d) => d.kind === 'regressed');
    assert.equal(reg.baseScnId, 'scn:a');
    assert.equal(reg.targetScnId, 'scn:a');
    const rem = cmp.changed.find((d) => d.kind === 'removed');
    assert.equal(rem.baseScnId, 'scn:b');
    assert.equal(rem.targetScnId, '');
    const add = cmp.changed.find((d) => d.kind === 'added');
    assert.equal(add.targetScnId, 'scn:c');
    assert.equal(add.baseScnId, '');
  });
});
