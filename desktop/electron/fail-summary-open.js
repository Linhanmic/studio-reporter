'use strict';

/**
 * Plan opening a static report focused on the first path-style locator
 * embedded in a "复制失败摘要" Markdown blob (clipboard paste flow).
 */

const {
  extractFailSummaryFocusHashes,
  resolveReportOpenHash,
} = require('./share-hash.js');

/** Example locator line matching static-report collectFailSummary output. */
const FAIL_SUMMARY_LOCATOR_EXAMPLE =
  '  - 定位: `#spec:specs/auth/login.spec-scn-0`';

/**
 * Diagnose why a clipboard blob cannot yield a path-style focus.
 * @param {string} markdown
 * @returns {{ ok: false, code: string, message: string, hint?: string, example?: string } | null}
 */
function diagnoseFailSummaryMarkdown(markdown) {
  const text = String(markdown || '');
  if (!text.trim()) {
    return {
      ok: false,
      code: 'empty-clipboard',
      message: '剪贴板为空，没有可解析的失败摘要。',
      hint: '请先在静态报告工具栏点击「复制失败摘要」，再回到 Desktop 使用「粘贴摘要定位」。',
      example: FAIL_SUMMARY_LOCATOR_EXAMPLE,
    };
  }
  const focuses = extractFailSummaryFocusHashes(text);
  if (!focuses.length) {
    return {
      ok: false,
      code: 'no-focus',
      message: '剪贴板内容中未找到失败摘要定位深链。',
      hint:
        '需要包含形如下列的行（path-style focus 中的 `/` 保持字面量，不要写成 %2F）：\n' +
        '也可重新打开静态报告 →「复制失败摘要」后再试。',
      example: FAIL_SUMMARY_LOCATOR_EXAMPLE,
    };
  }
  return null;
}

/**
 * @param {string} markdown
 * @param {{ reportDir?: string, failSteps?: boolean }} [opts]
 * @returns {{
 *   ok: boolean,
 *   code?: string,
 *   message?: string,
 *   hint?: string,
 *   example?: string,
 *   focus?: string,
 *   focuses?: string[],
 *   failSteps?: boolean,
 *   hash?: string,
 *   reportDir?: string,
 *   needsReportDir?: boolean,
 * }}
 */
function planOpenFromFailSummaryMarkdown(markdown, opts = {}) {
  const diagnosed = diagnoseFailSummaryMarkdown(markdown);
  if (diagnosed) return diagnosed;

  const focuses = extractFailSummaryFocusHashes(String(markdown || ''));
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
  FAIL_SUMMARY_LOCATOR_EXAMPLE,
  diagnoseFailSummaryMarkdown,
  planOpenFromFailSummaryMarkdown,
};
