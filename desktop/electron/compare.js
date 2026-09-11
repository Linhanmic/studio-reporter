'use strict';

/**
 * Port of internal/report.CompareHistoryRuns for Desktop (no Go round-trip).
 * Duration format: HH:MM:SS.mmm
 */

const { buildCompareDeepLink } = require('./deeplink.js');

/**
 * Best-effort compare deep link for share payloads (empty string if ids missing).
 * @param {object} cmp
 * @param {{ hub?: string }} [opts]
 * @returns {string}
 */
function resolveCompareShareDeepLink(cmp, opts = {}) {
  const base = String(cmp?.base?.id || '').trim();
  const target = String(cmp?.target?.id || '').trim();
  if (!base || !target || base === target) return '';
  try {
    return buildCompareDeepLink({
      base,
      target,
      hub: opts.hub != null ? opts.hub : '',
      kinds: opts.kinds,
    });
  } catch {
    return '';
  }
}

function parseReportDuration(s) {
  const raw = String(s || '').trim();
  if (!raw) return 0;
  const parts = raw.split(':');
  if (parts.length !== 3) return 0;
  const h = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10);
  const sec = Number.parseFloat(parts[2]);
  if (![h, m, sec].every((n) => Number.isFinite(n)) || h < 0 || m < 0 || sec < 0) {
    return 0;
  }
  return Math.trunc(h * 3_600_000 + m * 60_000 + sec * 1000 + 0.5);
}

function emptyCounts() {
  return { total: 0, passed: 0, failed: 0, skipped: 0 };
}

function normalizeCounts(c) {
  const src = c || {};
  return {
    total: Number(src.total) || 0,
    passed: Number(src.passed) || 0,
    failed: Number(src.failed) || 0,
    skipped: Number(src.skipped) || 0,
  };
}

function diffCounts(base, target) {
  const b = normalizeCounts(base);
  const t = normalizeCounts(target);
  return {
    total: t.total - b.total,
    passed: t.passed - b.passed,
    failed: t.failed - b.failed,
    skipped: t.skipped - b.skipped,
  };
}

function runLiteFromEntry(entry) {
  const summary = entry?.summary || {};
  return {
    id: entry?.id || '',
    projectName: entry?.projectName || '',
    timestamp: entry?.timestamp || entry?.timestampISO || '',
    duration: entry?.duration || '',
    verdict: entry?.verdict || '',
    summary: {
      specs: normalizeCounts(summary.specs),
      scenarios: normalizeCounts(summary.scenarios),
      steps: normalizeCounts(summary.steps),
    },
  };
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function verdictLabel(v) {
  const raw = String(v || '').toLowerCase();
  if (raw === 'pass') return '通过';
  if (raw === 'fail') return '失败';
  if (raw === 'skip') return '跳过';
  return v || '—';
}

function projectLabel(cmp) {
  const a = cmp?.base?.projectName || '';
  const b = cmp?.target?.projectName || '';
  if (a && b && a !== b) return `${a} → ${b}`;
  return a || b || '';
}

/**
 * Stable basename for share-card files (no path separators).
 * @param {ReturnType<typeof compareHistoryRuns>} cmp
 */

/** Scenario-diff kinds that can be included in share cards / clipboard. */
const SCENARIO_COMPARE_KIND_FILTERS = [
  'regressed',
  'fixed',
  'added',
  'removed',
  'reason_changed',
];

/**
 * Normalize an optional kind allow-list. Null/empty ⇒ no filtering (all kinds).
 * @param {unknown} kinds
 * @returns {string[]|null}
 */
function normalizeScenarioCompareKinds(kinds) {
  if (kinds == null) return null;
  const allow = new Set(SCENARIO_COMPARE_KIND_FILTERS);
  const list = (Array.isArray(kinds) ? kinds : [kinds])
    .map((k) => String(k || '').trim())
    .filter((k) => allow.has(k));
  const uniq = [...new Set(list)];
  return uniq.length ? uniq : null;
}

/**
 * Return a shallow-cloned scenarioCompare with changed[] filtered by kinds.
 * unchangedCount / baseCount / targetCount are preserved (suite-level context).
 * @param {object|null|undefined} sc
 * @param {{ kinds?: string[]|null }} [opts]
 */
function filterScenarioCompare(sc, opts = {}) {
  if (!sc || typeof sc !== 'object') return sc;
  const kinds = normalizeScenarioCompareKinds(opts.kinds);
  if (!kinds) return sc;
  const allow = new Set(kinds);
  const changed = (Array.isArray(sc.changed) ? sc.changed : []).filter((d) =>
    allow.has(String(d?.kind || ''))
  );
  return { ...sc, changed };
}

/**
 * Markdown bullets for optional cmp.scenarioCompare.
 * @param {object|null|undefined} sc
 * @param {{ limit?: number, kinds?: string[]|null }} [opts]
 */
function formatScenarioCompareMarkdown(sc, opts = {}) {
  if (!sc) return '';
  sc = filterScenarioCompare(sc, opts) || sc;
  const { scenarioDiffKindLabel } = require('./scenario-compare.js');
  const limit = Math.max(1, Number(opts.limit) || 20);
  const changed = Array.isArray(sc.changed) ? sc.changed : [];
  const kinds = normalizeScenarioCompareKinds(opts.kinds);
  const filterNote = kinds ? `（已筛：${kinds.map((k) => scenarioDiffKindLabel(k)).join('、')}）` : '';
  const lines = [
    '## 场景级差异',
    '',
    `共 ${changed.length} 变 · ${Number(sc.unchangedCount) || 0} 不变 · ${Number(sc.baseCount) || 0}→${Number(sc.targetCount) || 0}${filterNote}`,
  ];
  if (!changed.length) {
    lines.push('', kinds ? '_当前类型过滤下无场景差异_' : '_场景结论与失败原因均无变化_');
    return lines.join('\n');
  }
  lines.push('');
  for (const d of changed.slice(0, limit)) {
    const kind = scenarioDiffKindLabel(d.kind);
    const name = `${d.specName || '—'} · ${d.scnName || '—'}`;
    let verdict = '';
    if (d.kind === 'added') verdict = d.targetVerdict || '—';
    else if (d.kind === 'removed') verdict = d.baseVerdict || '—';
    else verdict = `${d.baseVerdict || '—'} → ${d.targetVerdict || '—'}`;
    let line = `- **${kind}** ${name}（${verdict}）`;
    const reason = d.targetReason || d.baseReason || '';
    if (
      reason &&
      (d.kind === 'reason_changed' ||
        d.kind === 'regressed' ||
        d.kind === 'added' ||
        d.kind === 'removed')
    ) {
      line += ` — ${reason}`;
    }
    lines.push(line);
  }
  if (changed.length > limit) {
    lines.push(`- _另有 ${changed.length - limit} 条未列出_`);
  }
  return lines.join('\n');
}

/**
 * HTML section for optional cmp.scenarioCompare inside the share card.
 * @param {object|null|undefined} sc
 * @param {{ limit?: number, kinds?: string[]|null }} [opts]
 */
function formatScenarioCompareHtml(sc, opts = {}) {
  if (!sc) return '';
  sc = filterScenarioCompare(sc, opts) || sc;
  const { scenarioDiffKindLabel } = require('./scenario-compare.js');
  const limit = Math.max(1, Number(opts.limit) || 20);
  const changed = Array.isArray(sc.changed) ? sc.changed : [];
  const kinds = normalizeScenarioCompareKinds(opts.kinds);
  const filterNote = kinds
    ? ` · 已筛 ${kinds.map((k) => scenarioDiffKindLabel(k)).join('、')}`
    : '';
  const head = `<section class="scenario-diff">
    <h2>场景级差异 <span class="muted">${changed.length} 变 · ${Number(sc.unchangedCount) || 0} 不变 · ${Number(sc.baseCount) || 0}→${Number(sc.targetCount) || 0}${filterNote}</span></h2>`;
  if (!changed.length) {
    return `${head}<p class="muted">${kinds ? '当前类型过滤下无场景差异' : '场景结论与失败原因均无变化'}</p></section>`;
  }
  const items = changed
    .slice(0, limit)
    .map((d) => {
      const kind = scenarioDiffKindLabel(d.kind);
      const name = `${d.specName || '—'} · ${d.scnName || '—'}`;
      let verdict = '';
      if (d.kind === 'added') verdict = d.targetVerdict || '—';
      else if (d.kind === 'removed') verdict = d.baseVerdict || '—';
      else verdict = `${d.baseVerdict || '—'} → ${d.targetVerdict || '—'}`;
      let reason = '';
      if (d.kind === 'reason_changed' || d.kind === 'regressed' || d.kind === 'added') {
        reason = d.targetReason || d.baseReason || '';
      } else if (d.kind === 'removed') {
        reason = d.baseReason || '';
      }
      return `<li class="scenario-diff-item kind-${escapeHtml(d.kind || '')}">
      <span class="scenario-diff-kind">${escapeHtml(kind)}</span>
      <span class="scenario-diff-name">${escapeHtml(name)}</span>
      <span class="scenario-diff-verdict muted">${escapeHtml(verdict)}</span>
      ${reason ? `<span class="scenario-diff-reason muted" title="${escapeHtml(reason)}">${escapeHtml(reason)}</span>` : ''}
    </li>`;
    })
    .join('');
  const more =
    changed.length > limit
      ? `<p class="muted">另有 ${changed.length - limit} 条未显示</p>`
      : '';
  return `${head}<ul class="scenario-diff-list">${items}</ul>${more}</section>`;
}

function suggestedCompareShareBasename(cmp) {
  const baseId = String(cmp?.base?.id || 'base').replace(/[^\w.-]+/g, '_').slice(0, 48);
  const targetId = String(cmp?.target?.id || 'target').replace(/[^\w.-]+/g, '_').slice(0, 48);
  return `compare-${baseId}-vs-${targetId}`;
}

/**
 * Markdown summary for clipboard / chat paste.
 * @param {ReturnType<typeof compareHistoryRuns>} cmp
 * @param {{ title?: string }} [opts]
 */
function buildCompareShareMarkdown(cmp, opts = {}) {
  if (!cmp?.base || !cmp?.target) {
    throw new Error('对比结果无效');
  }
  const title = opts.title || 'Studio Reporter 运行对比';
  const project = projectLabel(cmp);
  const verdictLine = cmp.verdictSame
    ? `结论相同（${verdictLabel(cmp.base.verdict)}）`
    : `结论变化：${verdictLabel(cmp.base.verdict)} → ${verdictLabel(cmp.target.verdict)}`;
  const lines = [
    `# ${title}`,
    '',
    project ? `项目：${project}` : null,
    `基线：\`${cmp.base.id || '—'}\` · ${cmp.base.timestamp || '—'} · ${cmp.base.duration || '—'} · ${verdictLabel(cmp.base.verdict)}`,
    `目标：\`${cmp.target.id || '—'}\` · ${cmp.target.timestamp || '—'} · ${cmp.target.duration || '—'} · ${verdictLabel(cmp.target.verdict)}`,
    '',
    `- ${verdictLine}`,
    `- 时长 Δ ${formatDurationDelta(cmp.durationMs?.delta)}`,
    `- 规格书 ${formatCountsDelta(cmp.specs)}`,
    `- 场景 ${formatCountsDelta(cmp.scenarios)}`,
    `- 步骤 ${formatCountsDelta(cmp.steps)}`,
    '',
  ];
  const scMd = formatScenarioCompareMarkdown(cmp.scenarioCompare, {
    kinds: opts.kinds,
  });
  if (scMd) {
    lines.push(scMd, '');
  } else if (cmp.scenarioCompareWarning) {
    lines.push('## 场景级差异', '', `_${cmp.scenarioCompareWarning}_`, '');
  }
  const deepLink = resolveCompareShareDeepLink(cmp, opts);
  if (deepLink) {
    lines.push(`打开对比：\`${deepLink}\``, '');
  }
  lines.push('_由 Studio Reporter Desktop 生成_');
  return lines.filter((x) => x != null).join('\n');
}

const COMPARE_CARD_TEMPLATES = new Set(['default', 'light', 'compact']);

/**
 * Normalize compare-card visual template id.
 * @param {unknown} value
 * @param {string} [fallback='default']
 */
function normalizeCompareCardTemplate(value, fallback = 'default') {
  const v = String(value || '').trim().toLowerCase();
  if (COMPARE_CARD_TEMPLATES.has(v)) return v;
  const fb = String(fallback || 'default').trim().toLowerCase();
  return COMPARE_CARD_TEMPLATES.has(fb) ? fb : 'default';
}

/**
 * Cap optional share-card title.
 * @param {unknown} title
 * @param {string} [fallback]
 */
function normalizeCompareCardTitle(title, fallback = 'Studio Reporter 运行对比') {
  const t = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return t || fallback;
}

/**
 * Self-contained HTML share card (offline-openable).
 * @param {ReturnType<typeof compareHistoryRuns>} cmp
 * @param {{ title?: string, generatedAt?: string, template?: string }} [opts]
 */
function buildCompareShareCardHtml(cmp, opts = {}) {
  if (!cmp?.base || !cmp?.target) {
    throw new Error('对比结果无效');
  }
  const title = normalizeCompareCardTitle(opts.title);
  const template = normalizeCompareCardTemplate(opts.template);
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const project = projectLabel(cmp);
  const verdictSame = Boolean(cmp.verdictSame);
  const verdictText = verdictSame
    ? `结论相同（${verdictLabel(cmp.base.verdict)}）`
    : `结论变化：${verdictLabel(cmp.base.verdict)} → ${verdictLabel(cmp.target.verdict)}`;
  const deltaMs = cmp.durationMs?.delta || 0;
  const durationTone = deltaMs > 0 ? 'worse' : deltaMs < 0 ? 'better' : 'same';

  const runBlock = (label, run) => `
    <section class="run">
      <h2>${escapeHtml(label)}</h2>
      <dl>
        <div><dt>ID</dt><dd><code>${escapeHtml(run.id || '—')}</code></dd></div>
        <div><dt>时间</dt><dd>${escapeHtml(run.timestamp || '—')}</dd></div>
        <div><dt>时长</dt><dd>${escapeHtml(run.duration || '—')}</dd></div>
        <div><dt>结论</dt><dd class="verdict ${escapeHtml(String(run.verdict || '').toLowerCase())}">${escapeHtml(verdictLabel(run.verdict))}</dd></div>
      </dl>
    </section>`;

  return `<!DOCTYPE html>
<html lang="zh-CN" data-template="${escapeHtml(template)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="studio-reporter-desktop-compare-card">
<meta name="studio-reporter-compare-template" content="${escapeHtml(template)}">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #0f1419;
    --panel: #1a222c;
    --ink: #e8eef4;
    --muted: #8b9aab;
    --line: #2a3542;
    --ok: #3dd68c;
    --bad: #f07178;
    --skip: #e6c07b;
    --accent: #5b9fd4;
    --pad: 28px;
    --gap: 14px;
    --radius: 12px;
    --font-size: 15px;
  }
  html[data-template="light"] {
    --bg: #eef2f6;
    --panel: #ffffff;
    --ink: #1a2430;
    --muted: #5b6b7c;
    --line: #d5dee8;
    --ok: #1f8a55;
    --bad: #c23b44;
    --skip: #a67c1f;
    --accent: #1f6fa8;
  }
  html[data-template="compact"] {
    --pad: 16px;
    --gap: 8px;
    --radius: 8px;
    --font-size: 13px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font: var(--font-size)/1.5 "IBM Plex Sans", "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
    color: var(--ink);
    background:
      radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 28%, transparent) 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, color-mix(in srgb, var(--ok) 14%, transparent) 0%, transparent 50%),
      var(--bg);
    padding: 32px 20px 48px;
  }
  html[data-template="compact"] body { padding: 16px 12px 28px; }
  .card {
    max-width: 720px;
    margin: 0 auto;
    background: color-mix(in srgb, var(--panel) 92%, black);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--pad);
    box-shadow: 0 18px 50px rgba(0,0,0,.35);
  }
  html[data-template="light"] .card {
    background: var(--panel);
    box-shadow: 0 12px 32px rgba(26, 36, 48, .12);
  }
  html[data-template="compact"] .card { max-width: 560px; }
  html[data-template="compact"] h1 { font-size: 1.15rem; }
  html[data-template="compact"] .run { padding: 10px; }
  html[data-template="compact"] .delta { padding: 8px; }
  html[data-template="compact"] .deltas { gap: var(--gap); }
  .brand {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 8px;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 1.45rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .sub { margin: 0 0 20px; color: var(--muted); font-size: 13px; }
  .runs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 18px;
  }
  @media (max-width: 640px) { .runs { grid-template-columns: 1fr; } }
  .run {
    background: rgba(255,255,255,.03);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 14px 10px;
  }
  .run h2 { margin: 0 0 10px; font-size: 12px; color: var(--muted); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  dl { margin: 0; display: grid; gap: 8px; }
  dl > div { display: grid; grid-template-columns: 48px 1fr; gap: 8px; align-items: baseline; }
  dt { margin: 0; color: var(--muted); font-size: 12px; }
  dd { margin: 0; word-break: break-all; }
  code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; }
  .verdict.pass { color: var(--ok); font-weight: 600; }
  .verdict.fail { color: var(--bad); font-weight: 600; }
  .verdict.skip { color: var(--skip); font-weight: 600; }
  .deltas {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .delta {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px;
    background: rgba(0,0,0,.18);
  }
  .delta .k { display: block; color: var(--muted); font-size: 11px; margin-bottom: 4px; letter-spacing: 0.04em; text-transform: uppercase; }
  .delta .v { font-weight: 600; font-variant-numeric: tabular-nums; }
  .delta.changed .v { color: var(--bad); }
  .delta.same .v { color: var(--ok); }
  .delta.worse .v { color: var(--bad); }
  .delta.better .v { color: var(--ok); }

  .scenario-diff {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  .scenario-diff h2 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .scenario-diff h2 .muted { font-weight: 500; text-transform: none; letter-spacing: 0; margin-left: 8px; }
  .scenario-diff-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .scenario-diff-item {
    display: grid;
    grid-template-columns: 72px 1fr auto;
    gap: 4px 10px;
    align-items: baseline;
    font-size: 12px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: rgba(255,255,255,.03);
  }
  html[data-template="light"] .scenario-diff-item { background: rgba(15,40,60,.04); }
  .scenario-diff-kind { font-weight: 650; }
  .scenario-diff-item.kind-regressed .scenario-diff-kind { color: var(--bad); }
  .scenario-diff-item.kind-fixed .scenario-diff-kind { color: var(--ok); }
  .scenario-diff-item.kind-added .scenario-diff-kind,
  .scenario-diff-item.kind-removed .scenario-diff-kind { color: var(--skip); }
  .scenario-diff-reason {
    grid-column: 2 / -1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .muted { color: var(--muted); }
  footer {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12px;
  }
  footer .deep-link {
    margin-top: 8px;
    word-break: break-all;
  }
  footer .deep-link a {
    color: var(--accent, #5b9fd4);
    text-decoration: none;
  }
  footer .deep-link a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <article class="card">
    <p class="brand">Studio Reporter</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="sub">${project ? `项目 ${escapeHtml(project)} · ` : ''}生成于 ${escapeHtml(generatedAt)}</p>
    <div class="runs">
      ${runBlock('基线', cmp.base)}
      ${runBlock('目标', cmp.target)}
    </div>
    <div class="deltas">
      <div class="delta ${verdictSame ? 'same' : 'changed'}"><span class="k">结论</span><span class="v">${escapeHtml(verdictText)}</span></div>
      <div class="delta ${durationTone}"><span class="k">时长 Δ</span><span class="v">${escapeHtml(formatDurationDelta(deltaMs))}</span></div>
      <div class="delta"><span class="k">规格书</span><span class="v">${escapeHtml(formatCountsDelta(cmp.specs))}</span></div>
      <div class="delta"><span class="k">场景</span><span class="v">${escapeHtml(formatCountsDelta(cmp.scenarios))}</span></div>
      <div class="delta"><span class="k">步骤</span><span class="v">${escapeHtml(formatCountsDelta(cmp.steps))}</span></div>
    </div>
    ${formatScenarioCompareHtml(cmp.scenarioCompare, { kinds: opts.kinds }) || (cmp.scenarioCompareWarning
      ? `<section class="scenario-diff"><h2>场景级差异</h2><p class="muted">${escapeHtml(cmp.scenarioCompareWarning)}</p></section>`
      : '')}
    <footer>${(() => {
      const deepLink = resolveCompareShareDeepLink(cmp, opts);
      const linkHtml = deepLink
        ? `<div class="deep-link"><a href="${escapeHtml(deepLink)}">${escapeHtml(deepLink)}</a></div>`
        : '';
      return `可离线打开的对比分享卡片 · 非完整报告真源${linkHtml}`;
    })()}</footer>
  </article>
</body>
</html>
`;
}

/**
 * @param {object} baseEntry history.json run
 * @param {object} targetEntry history.json run
 */
function compareHistoryRuns(baseEntry, targetEntry) {
  const base = runLiteFromEntry(baseEntry);
  const target = runLiteFromEntry(targetEntry);
  const baseMs = parseReportDuration(base.duration);
  const targetMs = parseReportDuration(target.duration);
  return {
    base,
    target,
    verdictSame: base.verdict === target.verdict,
    durationMs: {
      base: baseMs,
      target: targetMs,
      delta: targetMs - baseMs,
    },
    specs: diffCounts(base.summary.specs, target.summary.specs),
    scenarios: diffCounts(base.summary.scenarios, target.summary.scenarios),
    steps: diffCounts(base.summary.steps, target.summary.steps),
  };
}

function formatDurationDelta(ms) {
  let n = Number(ms) || 0;
  if (n === 0) return '±0s';
  const sign = n < 0 ? '-' : '+';
  if (n < 0) n = -n;
  return `${sign}${(n / 1000).toFixed(3)}s`;
}

function formatCountsDelta(d) {
  const parts = [];
  for (const [k, label] of [
    ['total', '总'],
    ['passed', '过'],
    ['failed', '败'],
    ['skipped', '跳'],
  ]) {
    const v = d[k] || 0;
    if (v === 0) continue;
    parts.push(`${label}${v > 0 ? '+' : ''}${v}`);
  }
  return parts.length ? parts.join(' ') : '±0';
}


/**
 * Swap base/target and negate deltas (same payload, reversed direction).
 * @param {ReturnType<typeof compareHistoryRuns>} cmp
 */
function invertCompareResult(cmp) {
  if (!cmp?.base || !cmp?.target) {
    throw new Error('对比结果无效');
  }
  const negateCounts = (d) => ({
    total: -(Number(d?.total) || 0),
    passed: -(Number(d?.passed) || 0),
    failed: -(Number(d?.failed) || 0),
    skipped: -(Number(d?.skipped) || 0),
  });
  const { invertScenarioCompare } = require('./scenario-compare.js');
  const out = {
    base: cmp.target,
    target: cmp.base,
    verdictSame: Boolean(cmp.verdictSame),
    durationMs: {
      base: Number(cmp.durationMs?.target) || 0,
      target: Number(cmp.durationMs?.base) || 0,
      delta: -(Number(cmp.durationMs?.delta) || 0),
    },
    specs: negateCounts(cmp.specs),
    scenarios: negateCounts(cmp.scenarios),
    steps: negateCounts(cmp.steps),
  };
  if (cmp.scenarioCompare) {
    out.scenarioCompare = invertScenarioCompare(cmp.scenarioCompare);
  }
  if (cmp.scenarioCompareWarning) {
    out.scenarioCompareWarning = cmp.scenarioCompareWarning;
  }
  return out;
}

/**
 * Structured JSON for clipboard / tooling.
 * @param {ReturnType<typeof compareHistoryRuns>} cmp
 * @param {{ pretty?: boolean, title?: string, generatedAt?: string }} [opts]
 */
function buildCompareShareJson(cmp, opts = {}) {
  if (!cmp?.base || !cmp?.target) {
    throw new Error('对比结果无效');
  }
  const payload = {
    format: 'studio-reporter.compare/v1',
    title: opts.title || 'Studio Reporter 运行对比',
    generatedAt: opts.generatedAt || new Date().toISOString(),
    project: projectLabel(cmp) || undefined,
    base: cmp.base,
    target: cmp.target,
    verdictSame: Boolean(cmp.verdictSame),
    durationMs: cmp.durationMs,
    specs: cmp.specs,
    scenarios: cmp.scenarios,
    steps: cmp.steps,
    summary: {
      verdict: cmp.verdictSame
        ? `same:${cmp.base.verdict || ''}`
        : `${cmp.base.verdict || ''}→${cmp.target.verdict || ''}`,
      durationDelta: formatDurationDelta(cmp.durationMs?.delta),
      specs: formatCountsDelta(cmp.specs),
      scenarios: formatCountsDelta(cmp.scenarios),
      steps: formatCountsDelta(cmp.steps),
    },
  };
  if (cmp.scenarioCompare) {
    const filtered = filterScenarioCompare(cmp.scenarioCompare, { kinds: opts.kinds }) || cmp.scenarioCompare;
    const kinds = normalizeScenarioCompareKinds(opts.kinds);
    payload.scenarioCompare = {
      changedCount: Array.isArray(filtered.changed) ? filtered.changed.length : 0,
      unchangedCount: Number(filtered.unchangedCount) || 0,
      baseCount: Number(filtered.baseCount) || 0,
      targetCount: Number(filtered.targetCount) || 0,
      changed: (filtered.changed || []).slice(0, 50),
    };
    if (kinds) payload.scenarioCompare.kindsFilter = kinds;
  } else if (cmp.scenarioCompareWarning) {
    payload.scenarioCompareWarning = String(cmp.scenarioCompareWarning);
  }
  const deepLink = resolveCompareShareDeepLink(cmp, opts);
  if (deepLink) payload.deepLink = deepLink;
  return JSON.stringify(payload, null, opts.pretty === false ? 0 : 2);
}

module.exports = {
  parseReportDuration,
  compareHistoryRuns,
  invertCompareResult,
  buildCompareShareJson,
  formatScenarioCompareMarkdown,
  formatScenarioCompareHtml,
  filterScenarioCompare,
  normalizeScenarioCompareKinds,
  SCENARIO_COMPARE_KIND_FILTERS,
  formatDurationDelta,
  formatCountsDelta,
  emptyCounts,
  runLiteFromEntry,
  escapeHtml,
  verdictLabel,
  projectLabel,
  suggestedCompareShareBasename,
  buildCompareShareMarkdown,
  buildCompareShareCardHtml,
  resolveCompareShareDeepLink,
  COMPARE_CARD_TEMPLATES,
  normalizeCompareCardTemplate,
  normalizeCompareCardTitle,
};
