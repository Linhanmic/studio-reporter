'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Build a slim native outline from a ReportSnapshot payload.
 * Keeps only spec → scenario ids/headings/verdicts for the Desktop sidebar.
 *
 * @param {object|null|undefined} payload LiveSnapshot JSON
 * @param {string} [source='live']
 * @returns {{
 *   rev: number|null,
 *   running: boolean,
 *   projectName: string,
 *   currentSpecId: string,
 *   currentScenarioId: string,
 *   source: string,
 *   specs: Array<{id:string,heading:string,fileName:string,verdict:string,scenarios:Array<{id:string,heading:string,verdict:string}>}>
 * }}
 */
function buildReportOutline(payload, source = 'live') {
  const p = payload && typeof payload === 'object' ? payload : {};
  const report = p.report && typeof p.report === 'object' ? p.report : {};
  const specsIn = Array.isArray(report.specs) ? report.specs : [];
  const specs = specsIn.map((spec) => {
    const scenarios = Array.isArray(spec?.scenarios) ? spec.scenarios : [];
    return {
      id: String(spec?.id || ''),
      heading: String(spec?.heading || spec?.fileName || spec?.id || ''),
      fileName: String(spec?.fileName || ''),
      verdict: String(spec?.verdict || ''),
      scenarios: scenarios.map((scn) => ({
        id: String(scn?.id || ''),
        heading: String(scn?.heading || scn?.id || ''),
        verdict: String(scn?.verdict || ''),
      })),
    };
  });
  return {
    rev: p.rev == null ? null : Number(p.rev),
    running: Boolean(p.running),
    projectName: String(report.projectName || ''),
    currentSpecId: String(p.currentSpecId || ''),
    currentScenarioId: String(p.currentScenarioId || ''),
    source: String(source || 'live'),
    specs,
  };
}

/**
 * Load outline from a final report directory (`report.json` next to `index.html`).
 * @param {string} reportDir
 * @returns {ReturnType<typeof buildReportOutline>|null}
 */
function loadOutlineFromReportDir(reportDir) {
  if (!reportDir) return null;
  const jsonPath = path.join(reportDir, 'report.json');
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const payload = JSON.parse(raw);
    return buildReportOutline(payload, 'final');
  } catch {
    return null;
  }
}

/**
 * Filter an outline by text query and/or verdict.
 * Specs stay visible if they match or any child scenario matches.
 *
 * @param {ReturnType<typeof buildReportOutline>|null|undefined} outline
 * @param {{query?: string, verdict?: string}} [opts]
 * @returns {ReturnType<typeof buildReportOutline>|null}
 */
function filterOutline(outline, opts = {}) {
  if (!outline) return null;
  const query = String(opts.query || '')
    .trim()
    .toLowerCase();
  const verdict = String(opts.verdict || 'all')
    .trim()
    .toLowerCase();
  const wantVerdict = verdict && verdict !== 'all';

  const matchText = (text) => {
    if (!query) return true;
    return String(text || '')
      .toLowerCase()
      .includes(query);
  };
  const matchVerdict = (v) => {
    if (!wantVerdict) return true;
    return String(v || '').toLowerCase() === verdict;
  };

  const specs = (outline.specs || [])
    .map((spec) => {
      const scenarios = (spec.scenarios || []).filter(
        (scn) =>
          matchVerdict(scn.verdict) &&
          (matchText(scn.heading) || matchText(scn.id) || matchText(spec.heading) || matchText(spec.fileName))
      );
      const specSelf =
        matchVerdict(spec.verdict) &&
        (matchText(spec.heading) || matchText(spec.fileName) || matchText(spec.id));
      if (!specSelf && scenarios.length === 0) return null;
      // If query matched the spec itself, keep all verdict-matching scenarios.
      const keepScenarios =
        query && specSelf && !scenarios.length
          ? (spec.scenarios || []).filter((scn) => matchVerdict(scn.verdict))
          : scenarios.length
            ? scenarios
            : query
              ? scenarios
              : (spec.scenarios || []).filter((scn) => matchVerdict(scn.verdict));
      return { ...spec, scenarios: keepScenarios };
    })
    .filter(Boolean);

  return { ...outline, specs };
}

/**
 * Collect failed scenario ids in document order.
 * @param {ReturnType<typeof buildReportOutline>|null|undefined} outline
 * @returns {string[]}
 */
function listFailScenarioIds(outline) {
  const ids = [];
  for (const spec of outline?.specs || []) {
    for (const scn of spec.scenarios || []) {
      if (String(scn.verdict || '').toLowerCase() !== 'fail') continue;
      const id = String(scn.id || '').trim();
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * Pick the next/previous failed scenario id.
 * @param {ReturnType<typeof buildReportOutline>|null|undefined} outline
 * @param {string} [currentId]
 * @param {number} [delta=1]
 * @returns {{ id: string|null, index: number, total: number }}
 */
function nextFailScenarioId(outline, currentId = '', delta = 1) {
  const ids = listFailScenarioIds(outline);
  if (!ids.length) return { id: null, index: -1, total: 0 };
  const step = Number(delta);
  const dir = Number.isFinite(step) && step !== 0 ? Math.sign(step) : 1;
  let idx = ids.indexOf(String(currentId || ''));
  if (idx < 0) {
    idx = dir > 0 ? 0 : ids.length - 1;
  } else {
    idx = (idx + dir + ids.length) % ids.length;
  }
  return { id: ids[idx], index: idx, total: ids.length };
}

module.exports = {
  buildReportOutline,
  loadOutlineFromReportDir,
  filterOutline,
  listFailScenarioIds,
  nextFailScenarioId,
};
