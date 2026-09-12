'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  OUTLINE_ROW_HEIGHT,
  flattenOutlineRows,
  computeVirtualWindow,
  findOutlineRowIndex,
  scrollTopForRowIndex,
} = require('./outline-virtual.js');

describe('outline-virtual', () => {
  it('flattenOutlineRows walks specs then scenarios', () => {
    const rows = flattenOutlineRows({
      specs: [
        {
          id: 's1',
          heading: 'Login',
          verdict: 'fail',
          scenarios: [
            { id: 'a', heading: 'ok', verdict: 'pass' },
            { id: 'b', heading: 'bad', verdict: 'fail' },
          ],
        },
        { id: 's2', heading: 'Logout', verdict: 'pass', scenarios: [] },
      ],
    });
    assert.deepEqual(
      rows.map((r) => `${r.kind}:${r.id}`),
      ['spec:s1', 'scn:a', 'scn:b', 'spec:s2']
    );
    assert.equal(rows[2].parentId, 's1');
    assert.deepEqual(flattenOutlineRows(null), []);
  });

  it('computeVirtualWindow returns a bounded overscanned slice', () => {
    const win = computeVirtualWindow({
      scrollTop: 280,
      viewportHeight: 140,
      rowCount: 100,
      rowHeight: 28,
      overscan: 2,
    });
    assert.equal(win.rowHeight, 28);
    assert.equal(win.totalHeight, 2800);
    // floor(280/28)=10 → start 8 with overscan 2; visible ceil(140/28)=5 → end 8+5+4=17
    assert.equal(win.start, 8);
    assert.equal(win.end, 17);
    assert.equal(win.offsetY, 8 * 28);
  });

  it('computeVirtualWindow clamps at list ends', () => {
    assert.deepEqual(
      computeVirtualWindow({ scrollTop: 0, viewportHeight: 100, rowCount: 0 }),
      { start: 0, end: 0, offsetY: 0, totalHeight: 0, rowHeight: OUTLINE_ROW_HEIGHT }
    );
    const top = computeVirtualWindow({
      scrollTop: 0,
      viewportHeight: 56,
      rowCount: 3,
      rowHeight: 28,
      overscan: 1,
    });
    assert.equal(top.start, 0);
    assert.equal(top.end, 3);

    const bottom = computeVirtualWindow({
      scrollTop: 5000,
      viewportHeight: 56,
      rowCount: 10,
      rowHeight: 28,
      overscan: 1,
    });
    assert.equal(bottom.end, 10);
    assert.ok(bottom.start <= 10);
  });

  it('findOutlineRowIndex and scrollTopForRowIndex locate rows', () => {
    const rows = flattenOutlineRows({
      specs: [{ id: 's', heading: 'S', scenarios: [{ id: 'x', heading: 'X' }] }],
    });
    assert.equal(findOutlineRowIndex(rows, 'x'), 1);
    assert.equal(findOutlineRowIndex(rows, 'missing'), -1);
    assert.equal(scrollTopForRowIndex(10, { rowHeight: 28, viewportHeight: 0 }), 280);
    assert.ok(scrollTopForRowIndex(10, { rowHeight: 28, viewportHeight: 300 }) < 280);
  });
});
