'use strict';

/**
 * Plan opening a static report focused on the first path-style locator
 * embedded in a "复制失败摘要" Markdown blob (clipboard paste flow).
 */

const {
  extractFailSummaryFocusHashes,
  resolveReportOpenHash,
} = require('./share-hash.js');

/**
 * @param {string} markdown
 * @param {{ reportDir?: string, failSteps?: boolean }} [opts]
 * @returns {{
 *   ok: boolean,
 *   code?: string,
 *   message?: string,
 *   focus?: string,
 *   focuses?: string[],
 *   failSteps?: boolean,
 *   hash?: string,
 *   reportDir?: string,
 *   needsReportDir?: boolean,
 * }}
 */
function planOpenFromFailSummaryMarkdown(markdown, opts = {}) {
  const text = String(markdown || '');
  const focuses = extractFailSummaryFocusHashes(text);
  if (!focuses.length) {
    return {
      ok: false,
      code: 'no-focus',
      message: '剪贴板内容中未找到失败摘要定位深链（需要形如 `定位: \`#spec:…\`` 的行）',
    };
  }
  const focus = focuses[0];
  const reportDir = String(opts.reportDir || '').trim();
  const failSteps = opts.failSteps !== false;
  const hash = resolveReportOpenHash({ focus, failSteps });
  return {
    ok: true,
    focus,
    focuses,
    failSteps,
    hash,
    reportDir,
    needsReportDir: !reportDir,
  };
}

module.exports = {
  planOpenFromFailSummaryMarkdown,
};
