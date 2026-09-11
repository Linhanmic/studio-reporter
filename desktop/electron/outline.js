'use strict';

/**
 * Build a slim native outline from a ReportSnapshot payload.
 * Keeps only spec → scenario ids/headings/verdicts for the Desktop sidebar.
 *
 * @param {object|null|undefined} payload LiveSnapshot JSON
 * @returns {{
 *   rev: number|null,
 *   running: boolean,
 *   projectName: string,
 *   currentSpecId: string,
 *   currentScenarioId: string,
 *   specs: Array<{id:string,heading:string,fileName:string,verdict:string,scenarios:Array<{id:string,heading:string,verdict:string}>}>
 * }}
 */
function buildReportOutline(payload) {
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
    specs,
  };
}

module.exports = {
  buildReportOutline,
};
