'use strict';

/**
 * Decide whether to show a suite-end OS notification.
 * Default: only when the feature is enabled and the main window is not focused
 * (avoids noise while the user is already watching the live run).
 * @param {{enabled?: boolean, windowFocused?: boolean}} opts
 */
function shouldNotifySuiteEnd(opts = {}) {
  if (opts.enabled === false) return false;
  if (opts.windowFocused) return false;
  return true;
}

/**
 * Build notification title/body from ReportGenerated payload.
 * @param {object} [payload]
 * @returns {{title: string, body: string, reportPath: string, reportDir: string}}
 */
function formatSuiteEndNotification(payload = {}) {
  const reportPath = String(payload.reportPath || '');
  const reportDir = String(payload.reportDir || '');
  const title = 'Studio Reporter — 套件已结束';
  const body = reportPath
    ? `报告已生成\n${reportPath}`
    : reportDir
      ? `报告已生成\n${reportDir}`
      : '报告已生成，可在 Desktop 中打开终态报告';
  return { title, body, reportPath, reportDir };
}

module.exports = {
  shouldNotifySuiteEnd,
  formatSuiteEndNotification,
};
