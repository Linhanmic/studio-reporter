'use strict';

/** Fixed row height used by the Desktop outline virtual list (px). */
const OUTLINE_ROW_HEIGHT = 28;

/** Extra rows rendered above/below the viewport. */
const OUTLINE_OVERSCAN = 8;

/**
 * Flatten a filtered outline into a linear list of rows for virtualization.
 * @param {{ specs?: Array<{id?:string,heading?:string,fileName?:string,verdict?:string,scenarios?:Array<{id?:string,heading?:string,verdict?:string}>}> }|null|undefined} outline
 * @returns {Array<{ kind: 'spec'|'scn', id: string, heading: string, verdict: string, parentId: string }>}
 */
function flattenOutlineRows(outline) {
  const rows = [];
  for (const spec of outline?.specs || []) {
    const specId = String(spec?.id || '').trim();
    rows.push({
      kind: 'spec',
      id: specId,
      heading: String(spec?.heading || spec?.fileName || specId || ''),
      verdict: String(spec?.verdict || ''),
      parentId: '',
    });
    for (const scn of spec?.scenarios || []) {
      const scnId = String(scn?.id || '').trim();
      rows.push({
        kind: 'scn',
        id: scnId,
        heading: String(scn?.heading || scnId || ''),
        verdict: String(scn?.verdict || ''),
        parentId: specId,
      });
    }
  }
  return rows;
}

/**
 * Compute the visible window into a virtualized list.
 * @param {{ scrollTop: number, viewportHeight: number, rowCount: number, rowHeight?: number, overscan?: number }} opts
 * @returns {{ start: number, end: number, offsetY: number, totalHeight: number, rowHeight: number }}
 */
function computeVirtualWindow(opts = {}) {
  const rowHeight = Math.max(1, Number(opts.rowHeight) || OUTLINE_ROW_HEIGHT);
  const overscan = Math.max(0, Number.isFinite(Number(opts.overscan)) ? Number(opts.overscan) : OUTLINE_OVERSCAN);
  const rowCount = Math.max(0, Math.floor(Number(opts.rowCount) || 0));
  const viewportHeight = Math.max(0, Number(opts.viewportHeight) || 0);
  const scrollTop = Math.max(0, Number(opts.scrollTop) || 0);
  const totalHeight = rowCount * rowHeight;
  if (!rowCount) {
    return { start: 0, end: 0, offsetY: 0, totalHeight: 0, rowHeight };
  }
  const visible = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  let start = Math.floor(scrollTop / rowHeight) - overscan;
  if (start < 0) start = 0;
  let end = start + visible + overscan * 2;
  if (end > rowCount) end = rowCount;
  // Keep window covering the scroll position when clamped at the end.
  if (end === rowCount) {
    start = Math.max(0, end - visible - overscan * 2);
  }
  return {
    start,
    end,
    offsetY: start * rowHeight,
    totalHeight,
    rowHeight,
  };
}

/**
 * Index of a node id in flattened rows, or -1.
 * @param {ReturnType<typeof flattenOutlineRows>} rows
 * @param {string} id
 */
function findOutlineRowIndex(rows, id) {
  const want = String(id || '').trim();
  if (!want) return -1;
  return rows.findIndex((row) => row.id === want);
}

/**
 * Scroll offset that brings a row near the top third of the viewport.
 * @param {number} index
 * @param {{ rowHeight?: number, viewportHeight?: number }} [opts]
 */
function scrollTopForRowIndex(index, opts = {}) {
  const rowHeight = Math.max(1, Number(opts.rowHeight) || OUTLINE_ROW_HEIGHT);
  const viewportHeight = Math.max(0, Number(opts.viewportHeight) || 0);
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const pad = Math.min(viewportHeight / 3, rowHeight * 3);
  return Math.max(0, i * rowHeight - pad);
}

module.exports = {
  OUTLINE_ROW_HEIGHT,
  OUTLINE_OVERSCAN,
  flattenOutlineRows,
  computeVirtualWindow,
  findOutlineRowIndex,
  scrollTopForRowIndex,
};
