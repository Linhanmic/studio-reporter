'use strict';

/**
 * Mirror of internal/report ParseShareHash / FormatShareHash for Desktop.
 * Fragment: #<focus>[?q=&spec=&scenario=&failSteps=1]
 */

function normalizeVerdict(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'pass' || s === 'fail' || s === 'skip' ? s : 'all';
}

function parseShareHash(raw) {
  const out = { focus: 'overview', query: '', spec: 'all', scenario: 'all', failSteps: false };
  let input = String(raw || '').trim().replace(/^#/, '');
  if (!input) return out;
  let head = input;
  let qs = '';
  const qIdx = input.indexOf('?');
  if (qIdx >= 0) {
    head = input.slice(0, qIdx);
    qs = input.slice(qIdx + 1);
  }
  let failSteps = false;
  let focus = head;
  if (head === 'fail-steps' || head.startsWith('fail-steps&') || head.startsWith('fail-steps/')) {
    focus = 'overview';
    failSteps = true;
    if (head.startsWith('fail-steps&')) {
      const extra = head.slice('fail-steps&'.length);
      qs = qs ? `${extra}&${qs}` : extra;
    }
  }
  out.focus = focus || 'overview';
  out.failSteps = failSteps;
  if (qs) {
    const params = new URLSearchParams(qs);
    if (params.has('q')) out.query = String(params.get('q') || '');
    if (params.has('query')) out.query = String(params.get('query') || out.query);
    if (params.get('spec')) out.spec = normalizeVerdict(params.get('spec'));
    const sc = params.get('scenario') || params.get('scn');
    if (sc) out.scenario = normalizeVerdict(sc);
    const fs = params.get('failSteps') || params.get('fail-steps') || '';
    if (['1', 'true', 'yes'].includes(String(fs).toLowerCase())) out.failSteps = true;
    if (['0', 'false', 'no'].includes(String(fs).toLowerCase())) out.failSteps = false;
  }
  out.spec = normalizeVerdict(out.spec);
  out.scenario = normalizeVerdict(out.scenario);
  return out;
}

function formatShareHash(h = {}) {
  let focus = String(h.focus || 'overview').trim() || 'overview';
  if (focus === 'overview') focus = 'overview';
  const params = new URLSearchParams();
  const q = String(h.query || '').trim();
  if (q) params.set('q', q);
  const spec = normalizeVerdict(h.spec);
  const scenario = normalizeVerdict(h.scenario);
  if (spec !== 'all') params.set('spec', spec);
  if (scenario !== 'all') params.set('scenario', scenario);
  if (h.failSteps) params.set('failSteps', '1');
  const enc = params.toString();
  return enc ? `${focus}?${enc}` : focus;
}

/**
 * Build a report URL hash from Desktop outline filter state.
 * Fail verdict also enables failSteps so the static tree matches the outline.
 */
function reportOpenHashFromOutline(outline = {}) {
  const query = String(outline.query || '').trim();
  const verdict = normalizeVerdict(outline.verdict);
  return formatShareHash({
    focus: 'overview',
    query,
    scenario: verdict,
    failSteps: verdict === 'fail',
  });
}

function appendShareHash(url, hash) {
  const base = String(url || '');
  if (!base) return base;
  const frag = String(hash || '').replace(/^#/, '');
  if (!frag || frag === 'overview') {
    // Still attach bare overview when caller wants a stable hash target.
    if (frag === 'overview' && !base.includes('#')) return `${base}#overview`;
    return base;
  }
  const without = base.split('#')[0];
  return `${without}#${frag}`;
}

module.exports = {
  parseShareHash,
  formatShareHash,
  reportOpenHashFromOutline,
  appendShareHash,
  normalizeVerdict,
};
