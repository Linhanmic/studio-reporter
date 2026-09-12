'use strict';

/**
 * Clamp export progress percent from 1-based current/total.
 * @param {number} current
 * @param {number} total
 * @returns {number} 0–100
 */
function exportProgressPercent(current, total) {
  const t = Math.max(0, Number(total) || 0);
  if (t <= 0) return 0;
  const c = Math.max(0, Number(current) || 0);
  return Math.min(100, Math.round((c / t) * 100));
}

/**
 * Basename of a .uhilreport (or any) path for progress UI.
 * @param {string} [input]
 * @returns {string}
 */
function exportProgressBasename(input) {
  if (input == null || input === '') return '';
  const s = String(input);
  const norm = s.replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : s;
}

/**
 * Human-readable label for export kind.
 * @param {'pdf'|'single'|string} [kind]
 * @returns {string}
 */
function exportKindLabel(kind) {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'single') return '单文件 HTML';
  return kind ? String(kind) : '导出';
}

/**
 * Format a desktop:export-progress payload for status text + progress bar.
 * @param {object} [p]
 * @param {number} [p.current]
 * @param {number} [p.total]
 * @param {string} [p.input]
 * @param {string} [p.kind]
 * @param {string} [fallbackLabel] override kind label
 * @returns {{
 *   percent: number,
 *   current: number,
 *   total: number,
 *   basename: string,
 *   kindLabel: string,
 *   statusText: string,
 *   barLabel: string,
 * }}
 */
function formatExportProgress(p, fallbackLabel) {
  const current = Math.max(0, Number(p?.current) || 0);
  const total = Math.max(0, Number(p?.total) || 0);
  const percent = exportProgressPercent(current, total);
  const basename = exportProgressBasename(p?.input);
  const kindLabel = fallbackLabel || exportKindLabel(p?.kind);
  const counts = total > 0 ? `${current}/${total}` : `${current}`;
  const barLabel = total > 0 ? `${counts} · ${percent}%` : `${percent}%`;
  let statusText = `正在导出 ${kindLabel}（${barLabel}）`;
  if (basename) statusText += ` · ${basename}`;
  else statusText += '…';
  return {
    percent,
    current,
    total,
    basename,
    kindLabel,
    statusText,
    barLabel,
  };
}

module.exports = {
  exportProgressPercent,
  exportProgressBasename,
  exportKindLabel,
  formatExportProgress,
};
