'use strict';

const $ = (id) => document.getElementById(id);

/** Normalize absolute hub paths for equality checks (renderer has no node:path). */
function pathResolveSafe(p) {
  return String(p || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

const state = {
  lastGenerated: null,
  countdown: null,
  settings: null,
  jumpSeconds: 5,
  autoJump: true,
  historyRuns: [],
  historyFilteredRuns: [],
  historyQuery: '',
  historyFailReasonQuery: '',
  historyVerdict: 'all',
  selectedIds: [],
  exporting: false,
  unsubExportProgress: null,
  lastCompare: null,
  lastHistoryTrend: null,
  failDigestSidecar: null,
  compareScenarioKinds: null, // null = all kinds; string[] = export/view filter
  lastExportedComparePath: null,
  discoverTimer: null,
  pluginInstall: null,
  outline: null,
  outlineQuery: '',
  outlineVerdict: 'all',
  outlineFocusId: '',
  outlineRows: [],
  activeTab: 'run',
};

const VALID_TABS = new Set(['run', 'report', 'history', 'settings']);
let lastTabSaveTimer = null;
let outlineFilterSaveTimer = null;

const OUTLINE_WIDTH_MIN = 180;
const OUTLINE_WIDTH_MAX = 480;
const OUTLINE_WIDTH_DEFAULT = 240;
let outlineWidthSaveTimer = null;

function clampOutlineWidth(width) {
  const n = Number(width);
  if (!Number.isFinite(n)) return OUTLINE_WIDTH_DEFAULT;
  return Math.round(Math.min(OUTLINE_WIDTH_MAX, Math.max(OUTLINE_WIDTH_MIN, n)));
}

function applyOutlinePaneWidth(width) {
  const px = clampOutlineWidth(width);
  const ws = $('workspace');
  if (ws) ws.style.setProperty('--outline-pane-width', `${px}px`);
  const splitter = $('outlineSplitter');
  if (splitter) {
    splitter.setAttribute('aria-valuenow', String(px));
    splitter.setAttribute('aria-valuemin', String(OUTLINE_WIDTH_MIN));
    splitter.setAttribute('aria-valuemax', String(OUTLINE_WIDTH_MAX));
  }
  if (state.settings) state.settings.outlinePaneWidth = px;
  return px;
}

function persistOutlinePaneWidth(width) {
  const px = applyOutlinePaneWidth(width);
  clearTimeout(outlineWidthSaveTimer);
  outlineWidthSaveTimer = setTimeout(async () => {
    try {
      state.settings = await window.desktopAPI.saveSettings({ outlinePaneWidth: px });
      applyOutlinePaneWidth(state.settings.outlinePaneWidth);
    } catch {
      /* ignore */
    }
  }, 250);
  return px;
}

function wireOutlineSplitter() {
  const splitter = $('outlineSplitter');
  const workspace = $('workspace');
  if (!splitter || !workspace || splitter.dataset.wired === '1') return;
  splitter.dataset.wired = '1';
  let dragging = false;

  const onMove = (clientX) => {
    const rect = workspace.getBoundingClientRect();
    const next = clampOutlineWidth(clientX - rect.left);
    applyOutlinePaneWidth(next);
  };

  splitter.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) return;
    dragging = true;
    workspace.classList.add('outline-resizing');
    splitter.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  splitter.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    onMove(ev.clientX);
  });
  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = false;
    workspace.classList.remove('outline-resizing');
    try {
      splitter.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    const current = clampOutlineWidth(
      state.settings?.outlinePaneWidth ||
        parseInt(getComputedStyle(workspace).getPropertyValue('--outline-pane-width'), 10)
    );
    persistOutlinePaneWidth(current);
  };
  splitter.addEventListener('pointerup', endDrag);
  splitter.addEventListener('pointercancel', endDrag);
  splitter.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const cur = clampOutlineWidth(state.settings?.outlinePaneWidth || OUTLINE_WIDTH_DEFAULT);
    let next = cur;
    if (ev.key === 'ArrowLeft') next = cur - (ev.shiftKey ? 24 : 12);
    if (ev.key === 'ArrowRight') next = cur + (ev.shiftKey ? 24 : 12);
    if (ev.key === 'Home') next = OUTLINE_WIDTH_MIN;
    if (ev.key === 'End') next = OUTLINE_WIDTH_MAX;
    persistOutlinePaneWidth(next);
  });
}


function setTab(name, opts = {}) {
  if (!VALID_TABS.has(name)) return;
  document.querySelectorAll('.tab').forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `pane-${name}`);
  });
  const hideChrome = name === 'history' || name === 'settings';
  $('connectBar').classList.toggle('hidden', hideChrome);
  $('runBar').classList.toggle('hidden', hideChrome);
  $('workspace')?.classList.toggle('outline-hidden', hideChrome);
  if (hideChrome) {
    $('gaugeLog').classList.add('hidden');
    $('sessionBar').classList.add('hidden');
  }
  state.activeTab = name;
  if (opts.persist !== false) persistLastTab(name);
  if (name === 'history' && opts.refresh !== false) refreshHistory();
  if (name === 'settings') {
    fillSettingsForm();
    refreshPluginDetect();
  }
  if (name === 'run' || name === 'report') {
    applyOutlineFilterToUi();
    postFilterToFrames();
  }
}


function persistOutlineFilter() {
  clearTimeout(outlineFilterSaveTimer);
  outlineFilterSaveTimer = setTimeout(async () => {
    try {
      state.settings = await window.desktopAPI.saveSettings({
        outlineQuery: state.outlineQuery || '',
        outlineVerdict: state.outlineVerdict || 'all',
      });
    } catch {
      /* ignore */
    }
  }, 300);
}

function applyOutlineFilterToUi() {
  const input = $('outlineQuery');
  if (input && input.value !== (state.outlineQuery || '')) {
    input.value = state.outlineQuery || '';
  }
  document.querySelectorAll('.outline-filter-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.verdict || 'all') === (state.outlineVerdict || 'all'));
  });
}

function focusOutlineSearch() {
  const input = $('outlineQuery');
  if (!input) return;
  // Ensure outline chrome is visible (run/report tabs).
  if (state.activeTab === 'history' || state.activeTab === 'settings') {
    setTab('run', { persist: false });
  }
  input.focus();
  input.select();
}

function wireFrameFilterReplay() {
  for (const id of ['liveFrame', 'reportFrame']) {
    const frame = $(id);
    if (!frame || frame.dataset.filterReplayWired === '1') continue;
    frame.dataset.filterReplayWired = '1';
    frame.addEventListener('load', () => {
      // Live/report documents may boot async; retry briefly so host filter sticks.
      postFilterToFrames();
      setTimeout(() => postFilterToFrames(), 200);
      setTimeout(() => postFilterToFrames(), 800);
    });
  }
}

function persistLastTab(name) {
  if (!VALID_TABS.has(name)) return;
  clearTimeout(lastTabSaveTimer);
  lastTabSaveTimer = setTimeout(async () => {
    try {
      state.settings = await window.desktopAPI.saveSettings({ lastTab: name });
    } catch {
      /* ignore */
    }
  }, 250);
}

function setStatus(text, kind) {
  const el = $('connStatus');
  el.textContent = text;
  el.classList.remove('ok', 'warn', 'error');
  if (kind) el.classList.add(kind);
}

function showLive(url) {
  $('liveFrame').src = url;
  $('liveEmpty').classList.add('hidden');
}


function updateOutlineFailMeta() {
  const el = $('outlineFailMeta');
  if (!el) return;
  const ids = window.desktopAPI.listFailScenarioIds(state.outline);
  if (!ids.length) {
    el.textContent = '无失败';
    return;
  }
  const idx = ids.indexOf(state.outlineFocusId);
  el.textContent = idx >= 0 ? `失败 ${idx + 1}/${ids.length}` : `失败 ${ids.length}`;
}

function jumpOutlineFail(delta) {
  const result = window.desktopAPI.nextFailScenarioId(
    state.outline,
    state.outlineFocusId,
    delta
  );
  if (!result.id) {
    setStatus('当前大纲没有失败场景', 'warn');
    updateOutlineFailMeta();
    return;
  }
  if (state.activeTab !== 'run' && state.activeTab !== 'report') {
    setTab('run', { persist: false });
  }
  // Relax search/verdict so the fail stays visible in sidebar + iframe.
  const nextFilter = window.desktopAPI.prepareFailJumpFilter(state.outline, result.id, {
    query: state.outlineQuery,
    verdict: state.outlineVerdict,
  });
  const filterChanged =
    nextFilter.query !== (state.outlineQuery || '') ||
    nextFilter.verdict !== (state.outlineVerdict || 'all');
  if (filterChanged) {
    state.outlineQuery = nextFilter.query;
    state.outlineVerdict = nextFilter.verdict;
    applyOutlineFilterToUi();
    persistOutlineFilter();
  }
  state.outlineFocusId = result.id;
  renderOutline();
  if (filterChanged) postFilterToFrames();
  scrollOutlineToId(result.id);
  postSelectNode(result.id);
  setStatus(`失败场景 ${result.index + 1}/${result.total}`, 'ok');
  updateOutlineFailMeta();
}

function postSelectNode(id) {
  if (!id) return;
  state.outlineFocusId = id;
  updateOutlineFailMeta();
  const tab = state.activeTab || 'run';
  const frame = tab === 'report' ? $('reportFrame') : $('liveFrame');
  if (!frame || !frame.contentWindow) return;
  try {
    frame.contentWindow.postMessage(
      { type: 'studio-reporter:select-node', id },
      '*'
    );
  } catch {
    /* not ready */
  }
}

function verdictChip(verdict) {
  const v = String(verdict || '').toLowerCase();
  if (!v) return '';
  const cls = v === 'pass' || v === 'fail' || v === 'skip' ? v : '';
  return `<span class="outline-verdict ${cls}">${escapeHtml(v)}</span>`;
}

function postFilterToFrames() {
  const payload = {
    type: 'studio-reporter:filter',
    query: state.outlineQuery || '',
    verdict: state.outlineVerdict || 'all',
  };
  for (const id of ['liveFrame', 'reportFrame']) {
    const frame = $(id);
    if (!frame?.contentWindow) continue;
    try {
      frame.contentWindow.postMessage(payload, '*');
    } catch {
      /* ignore */
    }
  }
}

function visibleOutline() {
  const raw = state.outline;
  if (!raw) return null;
  // filterOutline is pure; duplicate minimal client-side filter to avoid bundling.
  const query = String(state.outlineQuery || '')
    .trim()
    .toLowerCase();
  const verdict = String(state.outlineVerdict || 'all')
    .trim()
    .toLowerCase();
  const wantVerdict = verdict && verdict !== 'all';
  const matchText = (text) =>
    !query ||
    String(text || '')
      .toLowerCase()
      .includes(query);
  const matchVerdict = (v) => !wantVerdict || String(v || '').toLowerCase() === verdict;

  const specs = (raw.specs || [])
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
  return { ...raw, specs };
}

function renderOutline(outline) {
  if (outline) state.outline = outline;
  const view = visibleOutline();
  const meta = $('outlineMeta');
  const tree = $('outlineTree');
  if (!meta || !tree) return;
  if (!state.outline || !state.outline.specs?.length) {
    meta.textContent = state.outline?.running ? '运行中…' : '等待快照…';
    state.outlineRows = [];
    tree.innerHTML = '<div class="outline-empty">连接并运行后显示规格书 / 场景大纲</div>';
    updateOutlineFailMeta();
    return;
  }
  if (!view?.specs?.length) {
    meta.textContent = '无匹配';
    state.outlineRows = [];
    tree.innerHTML = '<div class="outline-empty">没有匹配当前搜索 / 过滤的节点</div>';
    updateOutlineFailMeta();
    return;
  }
  const parts = [];
  if (view.projectName) parts.push(view.projectName);
  if (view.source === 'final') parts.push('终态');
  else if (view.running) parts.push('live');
  if (view.rev != null) parts.push(`rev ${view.rev}`);
  const totalScn = (state.outline.specs || []).reduce((n, s) => n + (s.scenarios?.length || 0), 0);
  const shownScn = view.specs.reduce((n, s) => n + (s.scenarios?.length || 0), 0);
  if (state.outlineQuery || (state.outlineVerdict && state.outlineVerdict !== 'all')) {
    parts.push(`${shownScn}/${totalScn}`);
  }
  const rows = window.desktopAPI.flattenOutlineRows(view);
  parts.push(`${rows.length} 行`);
  meta.textContent = parts.join(' · ') || '大纲';
  state.outlineRows = rows;
  paintOutlineVirtualWindow();
  updateOutlineFailMeta();
}

function paintOutlineVirtualWindow() {
  const tree = $('outlineTree');
  if (!tree) return;
  const rows = state.outlineRows || [];
  if (!rows.length) return;

  const rowHeight = window.desktopAPI.OUTLINE_ROW_HEIGHT || 28;
  const scrollTop = tree.scrollTop;
  const win = window.desktopAPI.computeVirtualWindow({
    scrollTop,
    viewportHeight: tree.clientHeight || 1,
    rowCount: rows.length,
    rowHeight,
    overscan: window.desktopAPI.OUTLINE_OVERSCAN,
  });

  const focusId = state.outlineFocusId || '';
  const currentSpecId = state.outline?.currentSpecId;
  const currentScenarioId = state.outline?.currentScenarioId;
  const slice = rows.slice(win.start, win.end);
  const buttons = slice
    .map((row) => {
      const isCurrent =
        (row.id && row.id === focusId) ||
        (!focusId &&
          ((row.kind === 'spec' && row.id === currentSpecId) ||
            (row.kind === 'scn' && row.id === currentScenarioId)));
      const cls = `${row.kind === 'spec' ? 'outline-spec' : 'outline-scn'}${isCurrent ? ' current' : ''}`;
      return `<button type="button" class="${cls}" data-node-id="${escapeHtml(row.id)}" style="height:${rowHeight}px">${verdictChip(row.verdict)}${escapeHtml(row.heading || row.id)}</button>`;
    })
    .join('');

  tree.innerHTML =
    `<div class="outline-virt-spacer" style="height:${win.totalHeight}px">` +
    `<div class="outline-virt-window" style="transform:translateY(${win.offsetY}px)">${buttons}</div>` +
    `</div>`;
  // Re-applying innerHTML resets scrollTop; restore so virtualization stays stable.
  if (tree.scrollTop !== scrollTop) tree.scrollTop = scrollTop;
}

function scrollOutlineToId(id) {
  const tree = $('outlineTree');
  if (!tree) return;
  const rows = state.outlineRows || [];
  const idx = window.desktopAPI.findOutlineRowIndex(rows, id);
  if (idx < 0) return;
  const rowHeight = window.desktopAPI.OUTLINE_ROW_HEIGHT || 28;
  tree.scrollTop = window.desktopAPI.scrollTopForRowIndex(idx, {
    rowHeight,
    viewportHeight: tree.clientHeight || 0,
  });
  paintOutlineVirtualWindow();
}

function wireOutlineVirtualScroll() {
  const tree = $('outlineTree');
  if (!tree || tree.dataset.virtScrollWired === '1') return;
  tree.dataset.virtScrollWired = '1';
  let ticking = false;
  tree.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        paintOutlineVirtualWindow();
      });
    },
    { passive: true }
  );
}


function reportOpenShareHash() {
  if (typeof window.desktopAPI.reportOpenHashFromOutline === 'function') {
    return window.desktopAPI.reportOpenHashFromOutline({
      query: state.outlineQuery || state.settings?.outlineQuery || '',
      verdict: state.outlineVerdict || state.settings?.outlineVerdict || 'all',
    });
  }
  return 'overview';
}

function showReport(url) {
  let finalUrl = url;
  // Preserve an explicit focus hash (e.g. compare "view in report"); otherwise apply outline filters.
  if (url && !String(url).includes('#') && typeof window.desktopAPI.appendShareHash === 'function') {
    finalUrl = window.desktopAPI.appendShareHash(url, reportOpenShareHash());
  }
  $('reportFrame').src = finalUrl;
  $('reportEmpty').classList.add('hidden');
  setTab('report');
}

function showEndBanner(payload) {
  state.lastGenerated = payload;
  $('endBannerText').textContent = payload?.reportPath
    ? `报告已生成：${payload.reportPath}`
    : '套件已结束，报告已生成';
  $('endBanner').classList.remove('hidden');
  clearInterval(state.countdown);
  if (!state.autoJump) {
    $('btnOpenFinal').textContent = '打开终态报告';
    return;
  }
  let left = state.jumpSeconds;
  const tick = () => {
    $('btnOpenFinal').textContent = left > 0 ? `打开终态报告（${left}）` : '打开终态报告';
    if (left <= 0) {
      clearInterval(state.countdown);
      state.countdown = null;
      openFinal();
      return;
    }
    left -= 1;
  };
  tick();
  state.countdown = setInterval(tick, 1000);
}

async function openFinal() {
  clearInterval(state.countdown);
  state.countdown = null;
  $('btnOpenFinal').textContent = '打开终态报告';
  const payload = state.lastGenerated;
  if (!payload) return;
  try {
    await window.desktopAPI.openReportPath(payload.reportPath || payload.reportDir);
    $('endBanner').classList.add('hidden');
    refreshHistory();
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function connect() {
  const input = $('wsInput').value;
  $('btnConnect').disabled = true;
  try {
    const { liveUrl, url } = await window.desktopAPI.connectWs(input);
    $('btnDisconnect').disabled = false;
    setStatus(`已连接 ${url}`, 'ok');
    showLive(liveUrl);
    setTab('run');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  } finally {
    $('btnConnect').disabled = false;
  }
}

async function disconnect() {
  await window.desktopAPI.disconnect();
  $('btnDisconnect').disabled = true;
  setStatus('未连接');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function verdictClass(v) {
  if (v === 'pass') return 'ok';
  if (v === 'fail') return 'warn';
  return '';
}

function deltaClass(ms) {
  if (ms > 0) return 'delta-up';
  if (ms < 0) return 'delta-down';
  return 'delta-same';
}

const MAX_HISTORY_SELECTION = 50;
const HISTORY_ROW_HEIGHT = 56;
const HISTORY_OVERSCAN = 6;

function filteredHistoryRuns() {
  return window.desktopAPI.filterHistoryRuns(state.historyRuns, {
    query: state.historyQuery,
    failReasonQuery: state.historyFailReasonQuery,
    verdict: state.historyVerdict,
  });
}

function historyTrendLimitsFromSettings() {
  const s = state.settings || {};
  const api = window.desktopAPI || {};
  const limitRaw = Number(s.historyTrendLimit);
  const flakyRaw = Number(s.historyTrendFlakyLimit);
  const limit =
    typeof api.normalizeHistoryTrendLimit === 'function'
      ? api.normalizeHistoryTrendLimit(limitRaw)
      : Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(50, Math.max(3, Math.round(limitRaw)))
        : api.DEFAULT_TREND_LIMIT || 12;
  const flakyLimit =
    typeof api.normalizeHistoryTrendFlakyLimit === 'function'
      ? api.normalizeHistoryTrendFlakyLimit(flakyRaw)
      : Number.isFinite(flakyRaw) && flakyRaw > 0
        ? Math.min(50, Math.max(5, Math.round(flakyRaw)))
        : api.DEFAULT_FLAKY_LIMIT || 20;
  return { trendLimit: limit, flakyLimit };
}

let historyFilterPersistTimer = null;

function schedulePersistHistoryFilters() {
  clearTimeout(historyFilterPersistTimer);
  historyFilterPersistTimer = setTimeout(() => {
    historyFilterPersistTimer = null;
    void persistHistoryFilters();
  }, 400);
}

async function persistHistoryFilters() {
  if (typeof window.desktopAPI?.saveSettings !== 'function') return;
  try {
    const next = await window.desktopAPI.saveSettings({
      historyQuery: state.historyQuery || '',
      historyFailReasonQuery: state.historyFailReasonQuery || '',
      historyVerdict: state.historyVerdict || 'all',
    });
    state.settings = next;
  } catch {
    /* filters still work in-session */
  }
}

function applyHistoryFiltersToUi() {
  if ($('historyQuery') && $('historyQuery').value !== (state.historyQuery || '')) {
    $('historyQuery').value = state.historyQuery || '';
  }
  if ($('historyFailReasonQuery') && $('historyFailReasonQuery').value !== (state.historyFailReasonQuery || '')) {
    $('historyFailReasonQuery').value = state.historyFailReasonQuery || '';
  }
  const verdict = state.historyVerdict || 'all';
  document.querySelectorAll('.history-filter-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.verdict || 'all') === verdict);
  });
}

function setExportBusy(busy) {
  state.exporting = Boolean(busy);
  const pdf = $('btnExportPdf');
  const single = $('btnExportSingle');
  const cancel = $('btnCancelExport');
  if (pdf) pdf.disabled = state.exporting;
  if (single) single.disabled = state.exporting;
  if (cancel) cancel.classList.toggle('hidden', !state.exporting);
  if (!state.exporting) {
    updateExportProgressUI(null);
  }
  updateHistoryActionButtons();
}

function updateExportProgressUI(payload, fallbackLabel) {
  const wrap = $('exportProgress');
  const bar = $('exportProgressBar');
  const labelEl = $('exportProgressLabel');
  const fileEl = $('exportProgressFile');
  if (!wrap || !bar || !labelEl || !fileEl) return;
  if (!payload) {
    wrap.classList.add('hidden');
    bar.style.width = '0%';
    bar.removeAttribute('aria-valuenow');
    labelEl.textContent = '导出中…';
    fileEl.textContent = '';
    fileEl.removeAttribute('title');
    return;
  }
  const fmt =
    typeof window.desktopAPI.formatExportProgress === 'function'
      ? window.desktopAPI.formatExportProgress(payload, fallbackLabel)
      : {
          percent: 0,
          barLabel: '',
          basename: payload.input || '',
          statusText: `正在导出…`,
        };
  wrap.classList.remove('hidden');
  bar.style.width = `${fmt.percent}%`;
  bar.setAttribute('aria-valuenow', String(fmt.percent));
  labelEl.textContent = fmt.barLabel
    ? `导出 ${fmt.kindLabel || fallbackLabel || ''}（${fmt.barLabel}）`.trim()
    : `导出 ${fmt.kindLabel || fallbackLabel || ''}…`.trim();
  fileEl.textContent = fmt.basename || '';
  if (fmt.basename) fileEl.setAttribute('title', payload.input || fmt.basename);
  else fileEl.removeAttribute('title');
  setStatus(fmt.statusText, 'ok');
}

function updateHistoryActionButtons() {
  const n = state.selectedIds.length;
  const compareBtn = $('btnCompareRuns');
  if (compareBtn) {
    compareBtn.disabled = state.exporting || n !== 2;
    compareBtn.textContent = `对比所选（${n}/2）`;
  }
  const revealBtn = $('btnRevealRun');
  if (revealBtn) revealBtn.disabled = state.exporting || n !== 1;
  const copyBtn = $('btnCopyPath');
  if (copyBtn) copyBtn.disabled = state.exporting || n !== 1;
  const copyOpenBtn = $('btnCopyOpenLinks');
  if (copyOpenBtn) {
    copyOpenBtn.disabled = state.exporting || n < 1;
    copyOpenBtn.textContent = n > 1 ? `复制打开深链（${n}）` : '复制打开深链';
  }
  const copyFailBtn = $('btnCopyFailOpenLinks');
  if (copyFailBtn) {
    const failCount = failedRunsInCurrentHistoryView().length;
    copyFailBtn.disabled = state.exporting || failCount < 1;
    copyFailBtn.textContent =
      failCount > 0 ? `复制失败打开深链（${failCount}）` : '复制失败打开深链';
  }
  const deleteBtn = $('btnDeleteRuns');
  if (deleteBtn) {
    deleteBtn.disabled = state.exporting || n < 1;
    deleteBtn.textContent = n > 0 ? `删除所选（${n}）` : '删除所选';
  }
  const clearBtn = $('btnClearSelection');
  if (clearBtn) clearBtn.disabled = state.exporting || n < 1;
  const selectBtn = $('btnSelectFiltered');
  if (selectBtn) selectBtn.disabled = state.exporting;
  const pdf = $('btnExportPdf');
  const single = $('btnExportSingle');
  if (pdf && !state.exporting) {
    pdf.textContent = n > 0 ? `导出 PDF（${n}）` : '导出 PDF';
  }
  if (single && !state.exporting) {
    single.textContent = n > 0 ? `导出单文件 HTML（${n}）` : '导出单文件 HTML';
  }
}

function selectFilteredHistory() {
  const filtered = filteredHistoryRuns();
  const ids = filtered.slice(0, MAX_HISTORY_SELECTION).map((r) => r.id).filter(Boolean);
  state.selectedIds = ids;
  renderHistoryList({ hubDir: state.settings?.reportHubDir || '' });
  updateHistoryActionButtons();
  const capped = filtered.length > MAX_HISTORY_SELECTION;
  setStatus(
    capped
      ? `已勾选过滤结果前 ${ids.length} 条（上限 ${MAX_HISTORY_SELECTION}）`
      : `已勾选过滤结果 ${ids.length} 条`,
    'ok',
  );
}

function clearHistorySelection() {
  state.selectedIds = [];
  renderHistoryList({ hubDir: state.settings?.reportHubDir || '' });
  updateHistoryActionButtons();
  setStatus('已清除历史勾选', 'ok');
}

function toggleSelect(id, checked) {
  if (checked) {
    if (!state.selectedIds.includes(id)) state.selectedIds.push(id);
    while (state.selectedIds.length > MAX_HISTORY_SELECTION) {
      const dropped = state.selectedIds.shift();
      const box = document.querySelector(`input.pick[data-id="${CSS.escape(dropped)}"]`);
      if (box) box.checked = false;
    }
  } else {
    state.selectedIds = state.selectedIds.filter((x) => x !== id);
  }
  updateHistoryActionButtons();
}

function defaultCompareScenarioKinds() {
  const list = window.desktopAPI.SCENARIO_COMPARE_KIND_FILTERS;
  return Array.isArray(list) ? list.slice() : ['regressed', 'fixed', 'added', 'removed', 'reason_changed'];
}

function activeCompareScenarioKinds() {
  if (!Array.isArray(state.compareScenarioKinds) || !state.compareScenarioKinds.length) {
    return null; // all
  }
  const all = defaultCompareScenarioKinds();
  const allow = new Set(all);
  const picked = state.compareScenarioKinds.filter((k) => allow.has(k));
  if (!picked.length || picked.length === all.length) return null;
  return picked;
}

function compareShareKindOpts() {
  const kinds = activeCompareScenarioKinds();
  return kinds ? { kinds } : {};
}

function renderScenarioKindFilters(sc) {
  if (!sc) return '';
  const kindLabel =
    typeof window.desktopAPI.scenarioDiffKindLabel === 'function'
      ? window.desktopAPI.scenarioDiffKindLabel
      : (k) => k;
  const all = defaultCompareScenarioKinds();
  const active = activeCompareScenarioKinds();
  const selected = new Set(active || all);
  const chips = all
    .map((kind) => {
      const count = (sc.changed || []).filter((d) => d.kind === kind).length;
      const checked = selected.has(kind) ? 'checked' : '';
      return `<label class="compare-kind-chip">
        <input type="checkbox" data-compare-kind="${escapeHtml(kind)}" ${checked}>
        <span>${escapeHtml(kindLabel(kind))}</span>
        <span class="muted">${count}</span>
      </label>`;
    })
    .join('');
  return `<div class="compare-kind-filters" role="group" aria-label="场景差异类型过滤（影响面板展示与导出）">
    <span class="muted compare-kind-filters-label">导出/展示类型</span>
    ${chips}
    <button type="button" class="btn linkish" id="btnCompareKindsAll" title="全选类型">全选</button>
  </div>`;
}


async function openScenarioDiffInReport(side, scnId, failSteps) {
  const cmp = state.lastCompare;
  if (!cmp) {
    setStatus('请先对比两次运行', 'warn');
    return;
  }
  const runId = side === 'base' ? cmp.base?.id : cmp.target?.id;
  const run = state.historyRuns.find((r) => r.id === runId);
  if (!run) {
    setStatus(`找不到${side === 'base' ? '基线' : '目标'}运行 ${runId || ''}`, 'warn');
    return;
  }
  const focus = String(scnId || '').trim();
  if (!focus) {
    setStatus('该差异缺少场景 id，无法定位', 'warn');
    return;
  }
  try {
    await window.desktopAPI.openHistoryRun(run, {
      focus,
      failSteps: !!failSteps,
    });
    setTab('report');
    setStatus(`已在${side === 'base' ? '基线' : '目标'}报告中定位：${focus}`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

function wireScenarioDiffViewButtons() {
  document.querySelectorAll('.scenario-diff-actions [data-view-side]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const side = btn.getAttribute('data-view-side');
      const scnId = btn.getAttribute('data-scn-id');
      const failSteps = btn.getAttribute('data-fail-steps') === '1';
      void openScenarioDiffInReport(side, scnId, failSteps);
    });
  });
  document.querySelectorAll('.scenario-diff-actions [data-copy-side]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const side = btn.getAttribute('data-copy-side');
      const scnId = btn.getAttribute('data-scn-id');
      const failSteps = btn.getAttribute('data-fail-steps') === '1';
      void copyScenarioOpenDeepLink(side, scnId, failSteps);
    });
  });
}

async function copyScenarioOpenDeepLink(side, scnId, failSteps) {
  const cmp = state.lastCompare;
  if (!cmp) {
    setStatus('请先对比两次运行', 'warn');
    return;
  }
  const runId = side === 'base' ? cmp.base?.id : cmp.target?.id;
  if (!runId) {
    setStatus(`找不到${side === 'base' ? '基线' : '目标'}运行 id`, 'warn');
    return;
  }
  const focus = String(scnId || '').trim();
  if (!focus) {
    setStatus('该差异缺少场景 id，无法复制深链', 'warn');
    return;
  }
  try {
    const result = await window.desktopAPI.copyOpenDeepLink({
      run: runId,
      hub: state.settings?.reportHubDir || '',
      focus,
      failSteps: !!failSteps,
    });
    setStatus(
      `已复制${side === 'base' ? '基线' : '目标'}打开深链：${result?.url || 'studio-reporter://open…'}`,
      'ok'
    );
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

function renderScenarioCompareSection(cmp) {
  const raw = cmp?.scenarioCompare;
  if (!raw) {
    if (cmp?.scenarioCompareWarning) {
      return `<p class="muted compare-scenario-warn">${escapeHtml(cmp.scenarioCompareWarning)}</p>`;
    }
    return '';
  }
  const kinds = activeCompareScenarioKinds();
  const sc =
    kinds && typeof window.desktopAPI.filterScenarioCompare === 'function'
      ? window.desktopAPI.filterScenarioCompare(raw, { kinds }) || raw
      : raw;
  const kindLabel =
    typeof window.desktopAPI.scenarioDiffKindLabel === 'function'
      ? window.desktopAPI.scenarioDiffKindLabel
      : (k) => k;
  const rows = (sc.changed || [])
    .slice(0, 40)
    .map((d) => {
      const verdict =
        d.kind === 'added'
          ? escapeHtml(d.targetVerdict || '—')
          : d.kind === 'removed'
            ? escapeHtml(d.baseVerdict || '—')
            : `${escapeHtml(d.baseVerdict || '—')} → ${escapeHtml(d.targetVerdict || '—')}`;
      const reason =
        d.kind === 'reason_changed' || d.kind === 'regressed' || d.kind === 'added'
          ? escapeHtml(d.targetReason || d.baseReason || '')
          : d.kind === 'removed'
            ? escapeHtml(d.baseReason || '')
            : '';
      const canBase = d.kind !== 'added' && d.baseScnId;
      const canTarget = d.kind !== 'removed' && d.targetScnId;
      const actions = `<span class="scenario-diff-actions">
        ${canTarget ? `<button type="button" class="btn linkish" data-view-side="target" data-scn-id="${escapeHtml(d.targetScnId)}" data-fail-steps="${d.targetVerdict === 'fail' ? '1' : '0'}">目标报告</button>
        <button type="button" class="btn linkish" data-copy-side="target" data-scn-id="${escapeHtml(d.targetScnId)}" data-fail-steps="${d.targetVerdict === 'fail' ? '1' : '0'}" title="复制目标报告打开深链">复制深链</button>` : ''}
        ${canBase ? `<button type="button" class="btn linkish" data-view-side="base" data-scn-id="${escapeHtml(d.baseScnId)}" data-fail-steps="${d.baseVerdict === 'fail' ? '1' : '0'}">基线报告</button>
        <button type="button" class="btn linkish" data-copy-side="base" data-scn-id="${escapeHtml(d.baseScnId)}" data-fail-steps="${d.baseVerdict === 'fail' ? '1' : '0'}" title="复制基线报告打开深链">复制深链</button>` : ''}
      </span>`;
      return `<li class="scenario-diff-item kind-${escapeHtml(d.kind)}">
        <span class="scenario-diff-kind">${escapeHtml(kindLabel(d.kind))}</span>
        <span class="scenario-diff-name">${escapeHtml(d.specName)} · ${escapeHtml(d.scnName)}</span>
        <span class="scenario-diff-verdict muted">${verdict}</span>
        ${reason ? `<span class="scenario-diff-reason muted" title="${reason}">${reason}</span>` : ''}
        ${actions}
      </li>`;
    })
    .join('');
  const more =
    (sc.changed || []).length > 40
      ? `<p class="muted">另有 ${(sc.changed || []).length - 40} 条未显示</p>`
      : '';
  const empty =
    !(sc.changed || []).length
      ? `<p class="muted">${kinds ? '当前类型过滤下无场景差异' : '场景结论与失败原因均无变化'}</p>`
      : `<ul class="scenario-diff-list">${rows}</ul>${more}`;
  const filterNote = kinds ? ` · 已筛 ${kinds.length} 类` : '';
  return `<div class="compare-scenario-block">
    <h4>场景级差异 <span class="muted">${sc.changed?.length || 0} 变 · ${raw.unchangedCount || 0} 不变 · ${raw.baseCount || 0}→${raw.targetCount || 0}${filterNote}</span></h4>
    ${renderScenarioKindFilters(raw)}
    ${empty}
  </div>`;
}

function renderCompare(cmp) {
  state.lastCompare = cmp;
  const panel = $('comparePanel');
  panel.classList.remove('hidden');
  const vText = cmp.verdictSame
    ? `结论相同（${cmp.base.verdict || '—'}）`
    : `结论变化：${cmp.base.verdict || '—'} → ${cmp.target.verdict || '—'}`;
  const baseMeta = `${cmp.base.timestamp || '—'} · ${cmp.base.duration || '—'} · ${cmp.base.verdict || '—'}`;
  const targetMeta = `${cmp.target.timestamp || '—'} · ${cmp.target.duration || '—'} · ${cmp.target.verdict || '—'}`;
  const exported = state.lastExportedComparePath
    ? `<div class="compare-export-row">
        <span class="muted">上次导出：${escapeHtml(state.lastExportedComparePath)}</span>
        <button type="button" class="btn" id="btnOpenCompareCard">打开卡片</button>
        <button type="button" class="btn" id="btnRevealCompareCard">显示文件夹</button>
      </div>`
    : '';
  const tpl = window.desktopAPI.normalizeCompareCardTemplate?.(state.settings?.compareCardTemplate) || state.settings?.compareCardTemplate || 'default';
  const cardTitle = state.settings?.compareCardTitle || '';
  panel.innerHTML = `
    <div class="compare-panel-head">
      <h3>对比 ${escapeHtml(cmp.base.id || 'base')} → ${escapeHtml(cmp.target.id || 'target')}</h3>
      <div class="compare-actions">
        <button type="button" class="btn" id="btnSwapCompare" title="交换基线与目标">交换方向</button>
        <button type="button" class="btn" id="btnPreviewCompareCard" title="按当前模板/标题预览分享卡片（不落盘）">预览卡片</button>
        <button type="button" class="btn" id="btnExportCompareCard" title="导出可离线打开的 HTML 分享卡片">导出对比卡片</button>
        <button type="button" class="btn" id="btnCopyCompareMd" title="复制 Markdown 摘要到剪贴板">复制 Markdown</button>
        <button type="button" class="btn" id="btnCopyCompareJson" title="复制结构化 JSON 到剪贴板">复制 JSON</button>
        <button type="button" class="btn" id="btnCopyCompareLink" title="复制 studio-reporter://compare 深链（含当前 hub）">复制深链</button>
      </div>
    </div>
    <div class="compare-share-opts">
      <label class="field inline">
        <span>卡片模板</span>
        <select id="compareCardTemplate" aria-label="对比卡片模板">
          <option value="default"${tpl === 'default' ? ' selected' : ''}>深色（默认）</option>
          <option value="light"${tpl === 'light' ? ' selected' : ''}>浅色</option>
          <option value="compact"${tpl === 'compact' ? ' selected' : ''}>紧凑</option>
        </select>
      </label>
      <label class="field inline grow">
        <span>标题</span>
        <input id="compareCardTitle" type="text" maxlength="120" placeholder="Studio Reporter 运行对比" value="${escapeHtml(cardTitle)}" aria-label="对比卡片标题">
      </label>
    </div>
    <div class="compare-sides muted">
      <div><strong>基线</strong> ${escapeHtml(baseMeta)}</div>
      <div><strong>目标</strong> ${escapeHtml(targetMeta)}</div>
    </div>
    <div class="compare-grid">
      <div>${escapeHtml(vText)}</div>
      <div class="${deltaClass(cmp.durationMs.delta)}">时长 ${escapeHtml(window.desktopAPI.formatDurationDelta(cmp.durationMs.delta))}</div>
      <div>规格书 ${escapeHtml(window.desktopAPI.formatCountsDelta(cmp.specs))}</div>
      <div>场景 ${escapeHtml(window.desktopAPI.formatCountsDelta(cmp.scenarios))}</div>
      <div>步骤 ${escapeHtml(window.desktopAPI.formatCountsDelta(cmp.steps))}</div>
    </div>
    ${renderScenarioCompareSection(cmp)}
    ${exported}
  `;
  $('btnSwapCompare')?.addEventListener('click', swapCompareDirection);
  $('btnPreviewCompareCard')?.addEventListener('click', previewCompareCard);
  $('btnExportCompareCard')?.addEventListener('click', exportCompareCard);
  $('btnCopyCompareMd')?.addEventListener('click', copyCompareMarkdown);
  $('btnCopyCompareJson')?.addEventListener('click', copyCompareJson);
  $('btnCopyCompareLink')?.addEventListener('click', copyCompareDeepLink);
  $('btnOpenCompareCard')?.addEventListener('click', openLastCompareCard);
  $('btnRevealCompareCard')?.addEventListener('click', revealLastCompareCard);
  $('compareCardTemplate')?.addEventListener('change', async () => {
    await persistCompareShareOpts();
    refreshCompareCardPreviewIfOpen();
  });
  $('compareCardTitle')?.addEventListener('change', async () => {
    await persistCompareShareOpts();
    refreshCompareCardPreviewIfOpen();
  });
  $('compareCardTitle')?.addEventListener('input', () => {
    // live title preview without waiting for blur
    refreshCompareCardPreviewIfOpen();
  });
  document.querySelectorAll('[data-compare-kind]').forEach((input) => {
    input.addEventListener('change', () => {
      const picked = [...document.querySelectorAll('[data-compare-kind]:checked')].map((el) =>
        el.getAttribute('data-compare-kind')
      );
      state.compareScenarioKinds = picked;
      void persistCompareScenarioKinds();
      if (state.lastCompare) renderCompare(state.lastCompare);
    });
  });
  $('btnCompareKindsAll')?.addEventListener('click', () => {
    state.compareScenarioKinds = null;
    void persistCompareScenarioKinds();
    if (state.lastCompare) renderCompare(state.lastCompare);
  });
  wireScenarioDiffViewButtons();
}

function swapCompareDirection() {
  if (!state.lastCompare) return;
  const inverted = window.desktopAPI.invertCompareResult(state.lastCompare);
  if (state.selectedIds.length === 2) {
    state.selectedIds = [state.selectedIds[1], state.selectedIds[0]];
  }
  renderCompare(inverted);
  setStatus('已交换对比方向（基线 ↔ 目标）', 'ok');
}

async function runCompare() {
  if (state.selectedIds.length !== 2) return;
  const [baseId, targetId] = state.selectedIds;
  const base = state.historyRuns.find((r) => r.id === baseId);
  const target = state.historyRuns.find((r) => r.id === targetId);
  if (!base || !target) {
    setStatus('所选运行已不存在，请刷新历史', 'warn');
    return;
  }
  const cmp = window.desktopAPI.compareHistoryRuns(base, target);
  renderCompare(cmp);
  if (typeof window.desktopAPI.compareScenariosForRuns !== 'function') return;
  try {
    const result = await window.desktopAPI.compareScenariosForRuns(base, target);
    if (result?.ok) {
      cmp.scenarioCompare = result.compare;
      delete cmp.scenarioCompareWarning;
    } else {
      const miss = (result?.missing || []).join('/');
      cmp.scenarioCompareWarning = miss
        ? `无法加载 ${miss} 侧 report.json，仅显示汇总对比`
        : '无法加载 report.json，仅显示汇总对比';
      delete cmp.scenarioCompare;
    }
    if (state.lastCompare === cmp) renderCompare(cmp);
  } catch (err) {
    cmp.scenarioCompareWarning = String(err.message || err);
    if (state.lastCompare === cmp) renderCompare(cmp);
  }
}

/**
 * Open history compare for two run ids (UI button + deep link studio-reporter://compare).
 * Refreshes history once, selects base→target, then reuses runCompare().
 */
async function openCompareByIds(baseId, targetId, opts = {}) {
  const base = String(baseId || '').trim();
  const target = String(targetId || '').trim();
  if (!base || !target) {
    setStatus('深链对比需要 base 与 target', 'warn');
    return false;
  }
  if (base === target) {
    setStatus('深链对比的两侧运行不能相同', 'warn');
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(opts || {}, 'kinds')) {
    const norm =
      typeof window.desktopAPI.normalizeScenarioCompareKinds === 'function'
        ? window.desktopAPI.normalizeScenarioCompareKinds(opts.kinds)
        : opts.kinds;
    state.compareScenarioKinds = Array.isArray(norm) && norm.length ? norm : null;
    void persistCompareScenarioKinds();
  }
  setTab('history', { refresh: false });
  await refreshHistory();
  const baseRun = state.historyRuns.find((r) => r.id === base);
  const targetRun = state.historyRuns.find((r) => r.id === target);
  if (!baseRun || !targetRun) {
    const miss = !baseRun ? base : target;
    setStatus(`深链对比失败：当前 hub 中找不到运行 ${miss}`, 'warn');
    return false;
  }
  state.selectedIds = [base, target];
  renderHistoryList({
    hubDir: state.settings?.reportHubDir || '',
    runs: state.historyRuns,
  });
  updateHistoryActionButtons();
  await runCompare();
  const kindNote = activeCompareScenarioKinds()
    ? `（已筛 ${activeCompareScenarioKinds().length} 类）`
    : '';
  setStatus(`已打开对比：${base} → ${target}${kindNote}`, 'ok');
  return true;
}

async function persistCompareScenarioKinds() {
  const kinds = activeCompareScenarioKinds();
  try {
    state.settings = await window.desktopAPI.saveSettings({
      compareScenarioKinds: kinds,
    });
    const saved = state.settings?.compareScenarioKinds;
    state.compareScenarioKinds = Array.isArray(saved) && saved.length ? saved : null;
  } catch {
    /* ignore */
  }
}

async function persistCompareShareOpts() {
  const template = window.desktopAPI.normalizeCompareCardTemplate(
    $('compareCardTemplate')?.value || state.settings?.compareCardTemplate || 'default'
  );
  const title = window.desktopAPI.normalizeCompareCardTitle(
    $('compareCardTitle')?.value ?? state.settings?.compareCardTitle ?? ''
  );
  try {
    state.settings = await window.desktopAPI.saveSettings({
      compareCardTemplate: template,
      compareCardTitle: title,
    });
  } catch {
    /* ignore */
  }
}


function currentCompareCardShareOpts() {
  return {
    template:
      window.desktopAPI.normalizeCompareCardTemplate?.(
        $('compareCardTemplate')?.value || state.settings?.compareCardTemplate || 'default'
      ) || 'default',
    title:
      window.desktopAPI.normalizeCompareCardTitle?.(
        $('compareCardTitle')?.value ?? state.settings?.compareCardTitle ?? ''
      ) ||
      $('compareCardTitle')?.value ||
      state.settings?.compareCardTitle ||
      '',
    hub: state.settings?.reportHubDir || '',
    ...compareShareKindOpts(),
  };
}

function ensureCompareCardPreviewModal() {
  let root = $('compareCardPreviewModal');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'compareCardPreviewModal';
  root.className = 'compare-card-preview-modal hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '对比分享卡片预览');
  root.innerHTML = `
    <div class="compare-card-preview-backdrop" data-preview-close="1"></div>
    <div class="compare-card-preview-sheet">
      <header class="compare-card-preview-head">
        <h3>分享卡片预览 <span class="muted" id="compareCardPreviewMeta"></span></h3>
        <div class="compare-card-preview-actions">
          <button type="button" class="btn" id="btnExportCompareCardFromPreview" title="按当前预览导出 HTML">导出此卡片</button>
          <button type="button" class="btn" id="btnCloseCompareCardPreview" title="关闭预览">关闭</button>
        </div>
      </header>
      <iframe id="compareCardPreviewFrame" class="compare-card-preview-frame" title="对比分享卡片预览" sandbox=""></iframe>
    </div>
  `;
  document.body.appendChild(root);
  if (document.documentElement.dataset.comparePreviewEscapeWired !== '1') {
    document.documentElement.dataset.comparePreviewEscapeWired = '1';
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      const modal = $('compareCardPreviewModal');
      if (!modal || modal.classList.contains('hidden')) return;
      ev.preventDefault();
      closeCompareCardPreview();
    });
  }
  root.addEventListener('click', (ev) => {
    if (ev.target?.getAttribute?.('data-preview-close') === '1') closeCompareCardPreview();
  });
  $('btnCloseCompareCardPreview')?.addEventListener('click', () => closeCompareCardPreview());
  $('btnExportCompareCardFromPreview')?.addEventListener('click', () => {
    closeCompareCardPreview();
    void exportCompareCard();
  });
  return root;
}

function closeCompareCardPreview() {
  const root = $('compareCardPreviewModal');
  if (!root) return;
  root.classList.add('hidden');
  const frame = $('compareCardPreviewFrame');
  if (frame) frame.removeAttribute('srcdoc');
}

function renderCompareCardPreview(html, opts = {}) {
  const root = ensureCompareCardPreviewModal();
  const frame = $('compareCardPreviewFrame');
  const meta = $('compareCardPreviewMeta');
  if (frame) frame.srcdoc = String(html || '');
  if (meta) {
    const tpl = opts.template || 'default';
    const title = String(opts.title || '').trim();
    meta.textContent = title ? `· ${tpl} · ${title}` : `· ${tpl}`;
  }
  root.classList.remove('hidden');
}

function previewCompareCard() {
  const cmp = state.lastCompare;
  if (!cmp) {
    setStatus('请先对比两次运行', 'warn');
    return;
  }
  if (typeof window.desktopAPI.buildCompareShareCardHtml !== 'function') {
    setStatus('当前版本不支持卡片预览', 'warn');
    return;
  }
  try {
    const opts = currentCompareCardShareOpts();
    const html = window.desktopAPI.buildCompareShareCardHtml(cmp, opts);
    renderCompareCardPreview(html, opts);
    setStatus(`已预览「${opts.template}」模板分享卡片`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

function refreshCompareCardPreviewIfOpen() {
  const root = $('compareCardPreviewModal');
  if (!root || root.classList.contains('hidden')) return;
  if (!state.lastCompare) return;
  if (typeof window.desktopAPI.buildCompareShareCardHtml !== 'function') return;
  try {
    const opts = currentCompareCardShareOpts();
    const html = window.desktopAPI.buildCompareShareCardHtml(state.lastCompare, opts);
    renderCompareCardPreview(html, opts);
  } catch {
    /* ignore live refresh errors */
  }
}

async function exportCompareCard() {
  const cmp = state.lastCompare;
  if (!cmp) {
    setStatus('请先对比两次运行', 'warn');
    return;
  }
  try {
    await persistCompareShareOpts();
    const result = await window.desktopAPI.exportCompareCard(cmp, {
      template: state.settings?.compareCardTemplate || $('compareCardTemplate')?.value || 'default',
      title: state.settings?.compareCardTitle || $('compareCardTitle')?.value || '',
      hub: state.settings?.reportHubDir || '',
      ...compareShareKindOpts(),
    });
    if (result?.canceled) {
      setStatus('已取消导出对比卡片', 'warn');
      return;
    }
    state.lastExportedComparePath = result.path;
    renderCompare(cmp);
    const check = result.check;
    if (check && check.ok === false) {
      setStatus(
        `已导出但一致性抽检未通过：${(check.issues || []).join('；') || '未知问题'}（${result.path}）`,
        'warn',
      );
    } else {
      const openedNote = result.opened ? '，已自动打开预览' : '';
      setStatus(`已导出对比卡片并完成一致性抽检${openedNote}：${result.path}`, 'ok');
    }
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function copyCompareMarkdown() {
  const cmp = state.lastCompare;
  if (!cmp) {
    setStatus('请先对比两次运行', 'warn');
    return;
  }
  try {
    await window.desktopAPI.copyCompareMarkdown(cmp, {
      hub: state.settings?.reportHubDir || '',
      ...compareShareKindOpts(),
    });
    setStatus('已复制对比 Markdown 到剪贴板', 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function copyCompareJson() {
  const cmp = state.lastCompare;
  if (!cmp) {
    setStatus('请先对比两次运行', 'warn');
    return;
  }
  try {
    await window.desktopAPI.copyCompareJson(cmp, {
      hub: state.settings?.reportHubDir || '',
      ...compareShareKindOpts(),
    });
    setStatus('已复制对比 JSON 到剪贴板', 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}


async function copyCompareDeepLink() {
  const cmp = state.lastCompare;
  if (!cmp?.base?.id || !cmp?.target?.id) {
    setStatus('请先对比两次运行', 'warn');
    return;
  }
  try {
    const result = await window.desktopAPI.copyCompareDeepLink({
      base: cmp.base.id,
      target: cmp.target.id,
      hub: state.settings?.reportHubDir || '',
      ...compareShareKindOpts(),
    });
    setStatus(`已复制深链：${result?.url || 'studio-reporter://compare…'}`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}


async function openLastCompareCard() {
  const filePath = state.lastExportedComparePath;
  if (!filePath) {
    setStatus('还没有导出过对比卡片', 'warn');
    return;
  }
  try {
    await window.desktopAPI.openPath(filePath);
    setStatus(`已打开 ${filePath}`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function revealLastCompareCard() {
  const filePath = state.lastExportedComparePath;
  if (!filePath) {
    setStatus('还没有导出过对比卡片', 'warn');
    return;
  }
  try {
    await window.desktopAPI.revealPath(filePath);
    setStatus(`已在文件夹中显示 ${filePath}`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function refreshHistory(opts = {}) {
  const preserve = Boolean(opts.preserveSelection);
  const list = $('historyList');
  const empty = $('historyEmpty');
  const prevSelected = preserve ? new Set(state.selectedIds || []) : null;
  const prevCompare = preserve ? state.lastCompare : null;
  const prevExportPath = preserve ? state.lastExportedComparePath : null;
  if (!preserve) {
    list.innerHTML = '';
    state.selectedIds = [];
    state.lastCompare = null;
    state.lastExportedComparePath = null;
    updateHistoryActionButtons();
    $('comparePanel').classList.add('hidden');
  }
  try {
    const hist = await window.desktopAPI.listHistory();
    state.historyRuns = hist.runs || [];
    state.historyRuns.forEach((run, idx) => {
      run.id = run.id || run.href || run.relDir || `run-${idx}`;
    });
    if (preserve && prevSelected) {
      const alive = new Set(state.historyRuns.map((r) => r.id));
      state.selectedIds = [...prevSelected].filter((id) => alive.has(id));
      state.lastCompare = prevCompare;
      state.lastExportedComparePath = prevExportPath;
      if (prevCompare && state.selectedIds.length < 2) {
        state.lastCompare = null;
        state.lastExportedComparePath = null;
        $('comparePanel')?.classList.add('hidden');
      }
    }
    renderHistoryList(hist);
    refreshFailDigestSidecarUi(hist);
    updateHistoryActionButtons();
  } catch (err) {
    empty.classList.remove('hidden');
    refreshFailDigestSidecarUi();
    setStatus(String(err.message || err), 'warn');
  }
}

function hideHistoryTrendPanel() {
  const panel = $('historyTrendPanel');
  if (panel) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }
  state.lastHistoryTrend = null;
}

function renderHistoryTrendPanel(bundle) {
  const panel = $('historyTrendPanel');
  if (!panel || !bundle?.trend) return;
  state.lastHistoryTrend = bundle;
  const { trend, flaky = [], scenarioLoad } = bundle;
  const stats = trend.stats || {};
  const points = trend.points || [];
  const spark =
    typeof window.desktopAPI.sparkline === 'function'
      ? window.desktopAPI.sparkline(points.map((p) => p.durationMs))
      : '';
  const fmt =
    typeof window.desktopAPI.formatTrendDuration === 'function'
      ? window.desktopAPI.formatTrendDuration
      : (ms) => `${ms}ms`;
  const failPct = Math.round((stats.failRate || 0) * 100);
  const chips = points
    .map((p) => {
      const cls = p.failed || p.verdict === 'fail' ? 'fail' : p.verdict === 'pass' ? 'pass' : '';
      const title = `${p.id} · ${p.timestamp || p.timestampISO || ''} · ${p.duration || fmt(p.durationMs)} · ${p.verdict || '—'}`;
      return `<button type="button" class="history-trend-chip ${cls}" data-trend-run="${escapeHtml(p.id)}" title="${escapeHtml(title)}">${escapeHtml(p.id || '—')}</button>`;
    })
    .join('');
  const flakyRows = (flaky || [])
    .map((f) => {
      const series = (f.verdictSeries || [])
        .map((v) => (v.verdict === 'fail' ? '✗' : v.verdict === 'pass' ? '✓' : '·'))
        .join('');
      const lastRun = [...(f.verdictSeries || [])].reverse().find((v) => v.runId)?.runId || '';
      return `<tr>
        <td><button type="button" class="linkish" data-flaky-run="${escapeHtml(lastRun)}" data-flaky-focus="${escapeHtml(f.scnId || '')}" title="${escapeHtml(f.specFile || '')}">${escapeHtml(f.scnName || f.key)}</button>
          <div class="muted">${escapeHtml(f.specName || '')}</div></td>
        <td>${f.flips}/${f.seen}</td>
        <td>${Math.round((f.failRate || 0) * 100)}%</td>
        <td class="mono">${escapeHtml(series)}</td>
        <td class="muted">${escapeHtml(f.lastFailReason || '—')}</td>
      </tr>`;
    })
    .join('');
  const loadNote =
    scenarioLoad && scenarioLoad.missing
      ? `（${scenarioLoad.loaded}/${scenarioLoad.attempted} 次运行可读 report.json）`
      : '';
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="history-trend-head">
      <h3>运行趋势 · 最近 ${stats.runCount || 0} 次${escapeHtml(loadNote)}</h3>
      <button type="button" class="btn" id="btnCloseHistoryTrend">关闭</button>
    </div>
    <div class="history-trend-stats">
      <span>失败率 <strong>${failPct}%</strong>（${stats.failCount || 0}/${stats.runCount || 0}）</span>
      <span>平均时长 <strong>${escapeHtml(fmt(stats.avgDurationMs || 0))}</strong></span>
      <span>最长 <strong>${escapeHtml(fmt(stats.maxDurationMs || 0))}</strong></span>
    </div>
    <div class="history-trend-spark" title="时长 sparkline（左旧右新）">${escapeHtml(spark) || '—'}</div>
    <div class="history-trend-points">${chips || '<span class="muted">无运行点</span>'}</div>
    <div class="history-trend-digest">
      <div class="history-trend-digest-head">
        <h4 style="margin:8px 0 6px;font-size:12px;">失败原因摘要 ${bundle.digest?.groups?.length ? `（${bundle.digest.groups.length}）` : ''}</h4>
        <button type="button" class="btn" id="btnCopyTrendDigest" title="复制 Markdown 失败摘要">复制摘要</button>
      </div>
      ${
        (bundle.digest?.groups || []).length
          ? `<ol class="history-digest-list">${(bundle.digest.groups || [])
              .slice(0, 8)
              .map(
                (g) =>
                  `<li><strong>${g.count}×</strong> ${escapeHtml(g.reason)} <span class="muted">· ${escapeHtml(g.lastRunId || '')}</span></li>`,
              )
              .join('')}</ol>`
          : '<p class="muted">窗口内无失败原因可汇总。</p>'
      }
    </div>
    <h4 style="margin:8px 0 6px;font-size:12px;">不稳定场景 ${flaky.length ? `（${flaky.length}）` : ''}</h4>
    ${
      flakyRows
        ? `<table class="history-flaky-table"><thead><tr><th>场景</th><th>翻转/出现</th><th>失败率</th><th>序列</th><th>最近失败原因</th></tr></thead><tbody>${flakyRows}</tbody></table>`
        : '<p class="muted">窗口内未发现翻转场景（需 ≥2 次运行且可读 report.json）。</p>'
    }
  `;
  $('btnCloseHistoryTrend')?.addEventListener('click', hideHistoryTrendPanel);
  $('btnCopyTrendDigest')?.addEventListener('click', async () => {
    const md =
      bundle.digestMarkdown ||
      (typeof window.desktopAPI.formatHistoryFailDigestMarkdown === 'function'
        ? window.desktopAPI.formatHistoryFailDigestMarkdown(bundle.digest || {}, { title: '历史失败摘要' })
        : '');
    if (!md) {
      setStatus('没有可复制的失败摘要', 'warn');
      return;
    }
    try {
      await navigator.clipboard.writeText(md);
      setStatus('已复制失败摘要 Markdown', 'ok');
    } catch (err) {
      setStatus(String(err.message || err), 'warn');
    }
  });
  panel.querySelectorAll('[data-trend-run]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-trend-run');
      const run = state.historyRuns.find((r) => r.id === id);
      if (run) await openHistoryRunEntry(run);
    });
  });
  panel.querySelectorAll('[data-flaky-run]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-flaky-run');
      const focus = btn.getAttribute('data-flaky-focus') || '';
      const run = state.historyRuns.find((r) => r.id === id);
      if (!run) {
        setStatus('找不到对应历史运行', 'warn');
        return;
      }
      await openHistoryRunEntry(run, { focus: focus || undefined, failSteps: true });
    });
  });
}



async function copyHistoryFailDigestOpenLinks() {
  const runs = filteredHistoryRuns();
  if (!runs.length) {
    setStatus('当前过滤结果没有历史运行', 'warn');
    return;
  }
  const api = window.desktopAPI;
  if (typeof api.buildHistoryFailDigest !== 'function' || typeof api.buildHistoryFailDigestOpenLinks !== 'function') {
    setStatus('当前版本不支持失败摘要深链', 'warn');
    return;
  }
  try {
    const digest = api.buildHistoryFailDigest(runs, { limit: 15 });
    const hub = state.settings?.reportHubDir || '';
    const links = api.buildHistoryFailDigestOpenLinks(digest, { hubDir: hub, mode: 'latest' });
    if (!links.trim()) {
      setStatus('没有可复制的失败打开深链', 'warn');
      return;
    }
    await navigator.clipboard.writeText(links);
    const n = links.split('\n').filter(Boolean).length;
    setStatus(`已复制 ${n} 条失败摘要打开深链`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function copyHistoryFailDigest() {
  const runs = filteredHistoryRuns();
  if (!runs.length) {
    setStatus('当前过滤结果没有历史运行', 'warn');
    return;
  }
  if (typeof window.desktopAPI.buildHistoryFailDigest !== 'function') {
    setStatus('当前版本不支持失败摘要', 'warn');
    return;
  }
  try {
    const digest = window.desktopAPI.buildHistoryFailDigest(runs, { limit: 15 });
    const hubDir = state.settings?.reportHubDir || '';
    const md = window.desktopAPI.formatHistoryFailDigestMarkdown(digest, {
      title: '历史失败摘要',
      hubDir,
      includeOpenLinks: Boolean(hubDir),
    });
    await navigator.clipboard.writeText(md);
    setStatus(
      digest.failRunCount
        ? `已复制失败摘要：${digest.groups.length} 类原因 / ${digest.failRunCount} 次失败`
        : '已复制失败摘要（窗口内无失败）',
      'ok',
    );
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

function currentHistoryHubDir(histMeta) {
  return String(histMeta?.hubDir || state.settings?.reportHubDir || '').trim();
}

function refreshFailDigestSidecarUi(histMeta) {
  const hub = currentHistoryHubDir(histMeta);
  const mdBtn = $('btnOpenFailDigestMd');
  const jsonBtn = $('btnOpenFailDigestJson');
  const revealBtn = $('btnRevealFailDigest');
  const refreshBtn = $('btnRefreshFailDigest');
  const hint = $('failDigestSidecarHint');
  const probe =
    hub && typeof window.desktopAPI.probeHistoryFailDigestSidecars === 'function'
      ? window.desktopAPI.probeHistoryFailDigestSidecars(hub)
      : { hubDir: hub, md: false, json: false, mdPath: '', jsonPath: '' };
  state.failDigestSidecar = probe;
  if (mdBtn) mdBtn.disabled = !probe.md;
  if (jsonBtn) jsonBtn.disabled = !probe.json;
  if (revealBtn) revealBtn.disabled = !(probe.md || probe.json);
  if (refreshBtn) refreshBtn.disabled = !hub;
  if (hint) {
    if (!hub) {
      hint.textContent = '选择 hub 后可打开 / 刷新 fail-digest 旁路';
    } else if (probe.md || probe.json) {
      hint.textContent = `旁路：${probe.md ? 'md' : ''}${probe.md && probe.json ? '+' : ''}${probe.json ? 'json' : ''}`;
    } else {
      hint.textContent = '尚无 fail-digest 旁路（点「刷新旁路」或导出 / digest --write）';
    }
  }
  return probe;
}

async function openFailDigestSidecar(kind) {
  const probe =
    state.failDigestSidecar ||
    refreshFailDigestSidecarUi({ hubDir: currentHistoryHubDir() });
  const target = kind === 'json' ? probe.jsonPath : probe.mdPath;
  const ok = kind === 'json' ? probe.json : probe.md;
  if (!ok || !target) {
    setStatus('旁路文件尚不存在', 'warn');
    refreshFailDigestSidecarUi({ hubDir: currentHistoryHubDir() });
    return;
  }
  try {
    await window.desktopAPI.openPath(target);
    setStatus(`已打开 ${kind === 'json' ? 'fail-digest.json' : 'fail-digest.md'}`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function revealFailDigestSidecar() {
  const probe =
    state.failDigestSidecar ||
    refreshFailDigestSidecarUi({ hubDir: currentHistoryHubDir() });
  const target = probe.mdPath || probe.jsonPath;
  if (!(probe.md || probe.json) || !target) {
    setStatus('旁路文件尚不存在', 'warn');
    refreshFailDigestSidecarUi({ hubDir: currentHistoryHubDir() });
    return;
  }
  try {
    await window.desktopAPI.revealPath(target);
    setStatus('已在文件管理器中显示 fail-digest 旁路', 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function refreshFailDigestSidecarsFromHub() {
  const hub = currentHistoryHubDir();
  if (!hub) {
    setStatus('请先选择报告根目录（hub）', 'warn');
    return;
  }
  if (typeof window.desktopAPI.refreshFailDigestSidecars !== 'function') {
    setStatus('当前版本不支持刷新失败摘要旁路', 'warn');
    return;
  }
  const btn = $('btnRefreshFailDigest');
  if (btn) btn.disabled = true;
  try {
    setStatus('正在刷新 fail-digest 旁路…', 'ok');
    const result = await window.desktopAPI.refreshFailDigestSidecars(hub);
    refreshFailDigestSidecarUi({ hubDir: result?.hubDir || hub });
    setStatus(
      `已刷新旁路：${result?.groupCount || 0} 类原因 / ${result?.failRunCount || 0} 次失败（共 ${result?.runCount || 0} 次运行）`,
      'ok',
    );
  } catch (err) {
    refreshFailDigestSidecarUi({ hubDir: hub });
    setStatus(String(err.message || err), 'warn');
  } finally {
    const probe = state.failDigestSidecar;
    if (btn) btn.disabled = !currentHistoryHubDir();
    // keep enabled whenever hub is set (write creates files even if previously missing)
    if (btn && currentHistoryHubDir()) btn.disabled = false;
    void probe;
  }
}

async function showHistoryTrend() {
  const runs = filteredHistoryRuns();
  if (!runs.length) {
    setStatus('当前过滤结果没有可分析的历史运行', 'warn');
    return;
  }
  if (typeof window.desktopAPI.loadHistoryTrendBundle !== 'function') {
    setStatus('当前版本不支持运行趋势分析', 'warn');
    return;
  }
  try {
    setStatus('正在分析运行趋势…', 'ok');
    const limits = historyTrendLimitsFromSettings();
    const bundle = await window.desktopAPI.loadHistoryTrendBundle({
      runs,
      trendLimit: limits.trendLimit,
      flakyLimit: limits.flakyLimit,
    });
    renderHistoryTrendPanel(bundle);
    setStatus(
      `趋势已更新：失败率 ${Math.round((bundle.trend?.stats?.failRate || 0) * 100)}%，不稳定场景 ${bundle.flaky?.length || 0}`,
      'ok',
    );
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

function renderHistoryList(histMeta) {
  const list = $('historyList');
  const empty = $('historyEmpty');
  const filtered = filteredHistoryRuns();
  state.historyFilteredRuns = filtered;
  const hubHint = histMeta?.hubDir || state.settings?.reportHubDir || '';
  $('historyMeta').textContent = hubHint
    ? `${hubHint} · ${filtered.length}/${state.historyRuns.length} 次运行`
    : `${filtered.length}/${state.historyRuns.length} 次运行`;
  if (!state.historyRuns.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = histMeta?.error || '暂无历史运行';
    return;
  }
  if (!filtered.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = '没有匹配当前搜索 / 过滤的运行';
    return;
  }
  empty.classList.add('hidden');
  wireHistoryListInteractions();
  wireHistoryVirtualScroll();
  paintHistoryVirtualWindow();
}

function paintHistoryVirtualWindow() {
  const list = $('historyList');
  if (!list) return;
  const rows = state.historyFilteredRuns || [];
  if (!rows.length) {
    list.innerHTML = '';
    return;
  }
  const rowHeight = HISTORY_ROW_HEIGHT;
  const scrollTop = list.scrollTop;
  const win = window.desktopAPI.computeVirtualWindow({
    scrollTop,
    viewportHeight: list.clientHeight || 1,
    rowCount: rows.length,
    rowHeight,
    overscan: HISTORY_OVERSCAN,
  });
  const slice = rows.slice(win.start, win.end);
  const html = slice
    .map((run) => {
      const id = run.id;
      const checked = state.selectedIds.includes(id) ? 'checked' : '';
      return (
        `<div class="history-row" data-id="${escapeHtml(id)}" style="height:${rowHeight}px">` +
        `<input class="pick" type="checkbox" data-id="${escapeHtml(id)}" title="勾选以对比、导出、打开文件夹或删除" ${checked}>` +
        `<span class="verdict ${verdictClass(run.verdict)}">${escapeHtml(run.verdict || '—')}</span>` +
        `<span class="hist-main">` +
        `<strong>${escapeHtml(run.projectName || id)}</strong>` +
        `<span class="muted">${escapeHtml(run.timestamp || run.timestampISO || '')}</span>` +
        `</span>` +
        `<span class="muted">${escapeHtml(run.duration || '')}</span>` +
        (run.topFailReason || run.failReason
          ? `<span class="hist-fail-reason muted" title="${escapeHtml(run.topFailReason || run.failReason)}">${escapeHtml(run.topFailReason || run.failReason)}</span>`
          : '') +
        `</div>`
      );
    })
    .join('');
  list.innerHTML =
    `<div class="history-virt-spacer" style="height:${win.totalHeight}px">` +
    `<div class="history-virt-window" style="transform:translateY(${win.offsetY}px)">${html}</div>` +
    `</div>`;
  if (list.scrollTop !== scrollTop) list.scrollTop = scrollTop;
}

function wireHistoryVirtualScroll() {
  const list = $('historyList');
  if (!list || list.dataset.virtScrollWired === '1') return;
  list.dataset.virtScrollWired = '1';
  let ticking = false;
  list.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        paintHistoryVirtualWindow();
      });
    },
    { passive: true },
  );
}

function wireHistoryListInteractions() {
  const list = $('historyList');
  if (!list || list.dataset.interactWired === '1') return;
  list.dataset.interactWired = '1';
  list.addEventListener('change', (e) => {
    const pick = e.target.closest('input.pick');
    if (!pick || !list.contains(pick)) return;
    toggleSelect(pick.dataset.id, pick.checked);
  });
  list.addEventListener('click', async (e) => {
    if (e.target.closest('input.pick')) return;
    const row = e.target.closest('.history-row');
    if (!row || !list.contains(row)) return;
    const id = row.dataset.id;
    const run = (state.historyFilteredRuns || state.historyRuns).find((r) => r.id === id);
    if (!run) return;
    try {
      await openHistoryRunEntry(run);
    } catch (err) {
      setStatus(String(err.message || err), 'warn');
    }
  });
  list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.history-row');
    if (!row || !list.contains(row)) return;
    e.preventDefault();
    const id = row.dataset.id;
    const run = (state.historyFilteredRuns || state.historyRuns).find((r) => r.id === id);
    if (!run) return;
    void handleHistoryRowContextMenu(run, e);
  });
}

async function openHistoryRunEntry(run, opts = {}) {
  const failSteps =
    opts.failSteps != null
      ? !!opts.failSteps
      : String(run?.verdict || '').toLowerCase() === 'fail';
  await window.desktopAPI.openHistoryRun(run, {
    focus: opts.focus,
    failSteps,
  });
  setTab('report');
  setStatus(`已打开报告：${run.id || ''}`, 'ok');
}

async function handleHistoryRowContextMenu(run, ev) {
  if (typeof window.desktopAPI.popupHistoryMenu !== 'function') {
    setStatus('当前版本不支持历史右键菜单', 'warn');
    return;
  }
  try {
    const result = await window.desktopAPI.popupHistoryMenu({
      x: ev.x,
      y: ev.y,
    });
    const action = result?.action || 'dismiss';
    if (action === 'open') {
      await openHistoryRunEntry(run);
      return;
    }
    if (action === 'copy-open') {
      const copied = await window.desktopAPI.copyOpenDeepLink({
        run: run.id,
        hub: state.settings?.reportHubDir || '',
        failSteps: String(run.verdict || '').toLowerCase() === 'fail',
      });
      setStatus(`已复制打开深链：${copied?.url || ''}`, 'ok');
      return;
    }
    if (action === 'reveal') {
      const revealed = await window.desktopAPI.revealHistoryRun(run);
      setStatus(`已在文件管理器中显示：${revealed.path}`, 'ok');
      return;
    }
    if (action === 'copy-path') {
      const copied = await window.desktopAPI.copyHistoryPath(run, 'dir');
      setStatus(`已复制路径：${copied.path}`, 'ok');
      return;
    }
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

function selectedHistoryEntries() {
  return state.selectedIds
    .map((id) => state.historyRuns.find((r) => r.id === id))
    .filter(Boolean);
}

function selectedHistoryEntry() {
  const entries = selectedHistoryEntries();
  return entries.length === 1 ? entries[0] : null;
}

async function exportSelectedOrLatest(kind) {
  if (state.exporting) {
    setStatus('已有导出任务进行中', 'warn');
    return;
  }
  const entries = selectedHistoryEntries();
  const label = kind === 'pdf' ? 'PDF' : '单文件 HTML';
  const totalHint = entries.length || 1;
  setExportBusy(true);
  updateExportProgressUI({ current: 0, total: totalHint, kind, input: '' }, label);
  if (typeof state.unsubExportProgress === 'function') {
    state.unsubExportProgress();
    state.unsubExportProgress = null;
  }
  if (typeof window.desktopAPI.onExportProgress === 'function') {
    state.unsubExportProgress = window.desktopAPI.onExportProgress((p) => {
      updateExportProgressUI(
        {
          kind: p?.kind || kind,
          current: p?.current || 0,
          total: p?.total || totalHint,
          input: p?.input || '',
        },
        label,
      );
    });
  }
  try {
    const result = !entries.length
      ? await window.desktopAPI.exportReport(kind)
      : await window.desktopAPI.exportReport(
          kind,
          entries.length === 1 ? entries[0] : entries,
        );
    if (result?.cancelled) {
      setStatus(
        `已取消导出${result.exported?.length ? `（已完成 ${result.exported.length} 个）` : ''}${
          result.digest ? '；已刷新 hub 失败摘要旁路文件' : ''
        }`,
        'warn',
      );
      return;
    }
    const n = result?.exported?.length || entries.length || 1;
    const digestNote = result?.digest
      ? `；已写入 fail-digest.md/json（失败 ${result.digest.failRunCount || 0}）`
      : result?.digestError
        ? `；失败摘要旁路未写入：${result.digestError}`
        : '';
    if (result?.digest) refreshFailDigestSidecarUi();
    setStatus(
      entries.length <= 1
        ? `已导出${entries.length === 1 ? '所选' : '最新'}运行的 ${label}${digestNote}`
        : `已批量导出 ${n} 次运行的 ${label}${digestNote}`,
      'ok',
    );
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  } finally {
    if (typeof state.unsubExportProgress === 'function') {
      state.unsubExportProgress();
      state.unsubExportProgress = null;
    }
    setExportBusy(false);
  }
}

async function cancelActiveExport() {
  if (!state.exporting) return;
  try {
    await window.desktopAPI.cancelExport();
    setStatus('正在取消导出…', 'warn');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function deleteSelectedRuns() {
  const entries = selectedHistoryEntries();
  if (!entries.length) return;
  try {
    const result = await window.desktopAPI.deleteHistoryRuns(entries.map((e) => e.id));
    if (result?.cancelled) {
      setStatus('已取消删除', 'warn');
      return;
    }
    const n = (result?.deleted || []).length;
    setStatus(n ? `已删除 ${n} 次历史运行` : '未删除任何运行', n ? 'ok' : 'warn');
    await refreshHistory();
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function revealSelectedRun() {
  const entry = selectedHistoryEntry();
  if (!entry) {
    setStatus('请勾选恰好 1 次运行以打开所在文件夹', 'warn');
    return;
  }
  try {
    const result = await window.desktopAPI.revealHistoryRun(entry);
    setStatus(`已在文件管理器中显示：${result.path}`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function copySelectedPath() {
  const entry = selectedHistoryEntry();
  if (!entry) {
    setStatus('请勾选恰好 1 次运行以复制路径', 'warn');
    return;
  }
  try {
    const result = await window.desktopAPI.copyHistoryPath(entry, 'dir');
    setStatus(`已复制路径：${result.path}`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}


function fillRecentProjects(list) {
  const dl = $('recentProjectsList');
  if (!dl) return;
  dl.innerHTML = '';
  (list || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p;
    dl.appendChild(opt);
  });
}

function hubBasename(hubPath) {
  const parts = String(hubPath || '').split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || hubPath;
}

function fillRecentHubs(list, current) {
  const hubs = Array.isArray(list) ? list : [];
  const cur = String(current || '').trim();
  const fillSelect = (sel, placeholder) => {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    sel.appendChild(ph);
    hubs.forEach((hub) => {
      const opt = document.createElement('option');
      opt.value = hub;
      opt.textContent = `${hubBasename(hub)} — ${hub}`;
      if (cur && hub === cur) opt.selected = true;
      sel.appendChild(opt);
    });
    if (!cur && prev && hubs.includes(prev)) sel.value = prev;
  };
  fillSelect($('settingRecentHubs'), '选择最近 hub…');
  fillSelect($('historyRecentHubs'), '最近 hub…');
}



function failedRunsInCurrentHistoryView() {
  const filtered = filteredHistoryRuns();
  if (typeof window.desktopAPI.listFailedHistoryRuns === 'function') {
    return window.desktopAPI.listFailedHistoryRuns(filtered);
  }
  return filtered.filter((run) => {
    const v = String(run?.verdict || '').toLowerCase();
    return v === 'fail' || run?.failed === true;
  });
}

async function copyFailedOpenDeepLinks() {
  const fails = failedRunsInCurrentHistoryView();
  if (!fails.length) {
    setStatus('当前列表没有失败运行可复制', 'warn');
    return;
  }
  try {
    // Prefer fail filter so users see what they copy.
    if (state.historyVerdict !== 'fail') {
      state.historyVerdict = 'fail';
      document.querySelectorAll('.history-filter-btn').forEach((b) => {
        b.classList.toggle('active', (b.dataset.verdict || 'all') === 'fail');
      });
      paintHistoryVirtualWindow();
      updateHistoryActionButtons();
    }
    const result = await window.desktopAPI.copyOpenDeepLinks({
      entries: fails.map((e) => ({ id: e.id, verdict: e.verdict || 'fail' })),
      hub: state.settings?.reportHubDir || '',
    });
    setStatus(
      result.count > 1
        ? `已复制 ${result.count} 条失败打开深链（换行分隔）`
        : `已复制失败打开深链：${result.text || ''}`,
      'ok',
    );
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function copySelectedOpenDeepLinks() {
  const entries = selectedHistoryEntries();
  if (!entries.length) {
    setStatus('请至少勾选 1 次运行以复制打开深链', 'warn');
    return;
  }
  try {
    const result = await window.desktopAPI.copyOpenDeepLinks({
      entries: entries.map((e) => ({
        id: e.id,
        verdict: e.verdict,
      })),
      hub: state.settings?.reportHubDir || '',
    });
    setStatus(
      result.count > 1
        ? `已复制 ${result.count} 条打开深链（换行分隔）`
        : `已复制打开深链：${result.text || ''}`,
      'ok',
    );
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function applyHubDir(hub) {
  const dir = String(hub || '').trim();
  if (!dir) return null;
  state.settings = await window.desktopAPI.saveSettings({ reportHubDir: dir });
  fillSettingsForm();
  if (state.activeTab === 'history') refreshHistory();
  setStatus(`报告根目录：${dir}`, 'ok');
  return dir;
}

function renderSessions(payload) {
  const bar = $('sessionBar');
  if (!bar) return;
  const sessions = payload?.sessions || [];
  const activeId = payload?.activeId || null;
  if (!sessions.length) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML = sessions.map((s) => {
    const active = s.id === activeId ? ' active' : '';
    const status = s.status === 'running' ? '运行中' : (s.exitCode ? `退出 ${s.exitCode}` : '结束');
    return `<button type="button" class="session-chip${active}" data-session-id="${s.id}" title="${s.projectDir}">
      <strong>${s.projectName || s.id}</strong>
      <span class="muted">${status}</span>
    </button>`;
  }).join('');
  bar.querySelectorAll('.session-chip').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const session = await window.desktopAPI.setActiveSession(btn.dataset.sessionId);
        if (session?.discoveredUrl) $('wsInput').value = session.discoveredUrl;
        setStatus(`已切换会话 ${session?.projectName || ''}`, 'ok');
      } catch (err) {
        setStatus(String(err.message || err), 'warn');
      }
    });
  });
}


function prefersDarkScheme() {
  return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
}

function applyTheme(preference) {
  const pref = window.desktopAPI.normalizeTheme(preference ?? state.settings?.theme);
  const effective = window.desktopAPI.resolveTheme(pref, prefersDarkScheme());
  document.documentElement.dataset.theme = effective;
  document.documentElement.style.colorScheme = effective;
  const sel = $('settingTheme');
  if (sel && sel.value !== pref) sel.value = pref;
}

let themeMediaBound = false;
function watchSystemTheme() {
  if (themeMediaBound || !window.matchMedia) return;
  themeMediaBound = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (window.desktopAPI.normalizeTheme(state.settings?.theme) === 'system') {
      applyTheme('system');
    }
  });
}

function fillSettingsForm() {
  const s = state.settings || {};
  $('settingHubDir').value = s.reportHubDir || '';
  if ($('settingRestoreSession')) {
    $('settingRestoreSession').checked = s.restoreSession !== false;
  }
  $('settingAutoJump').checked = s.autoJumpToReport !== false;
  if ($('settingNotifySuiteEnd')) {
    $('settingNotifySuiteEnd').checked = s.notifyOnSuiteEnd !== false;
  }
  if ($('settingWatchHubHistory')) {
    $('settingWatchHubHistory').checked = s.watchHubHistory !== false;
  }
  if ($('settingHistoryTrendLimit')) {
    const n = Number(s.historyTrendLimit);
    $('settingHistoryTrendLimit').value = String(
      Number.isFinite(n) && n > 0 ? Math.round(n) : 12,
    );
  }
  if ($('settingHistoryTrendFlakyLimit')) {
    const n = Number(s.historyTrendFlakyLimit);
    $('settingHistoryTrendFlakyLimit').value = String(
      Number.isFinite(n) && n > 0 ? Math.round(n) : 20,
    );
  }
  if ($('settingTheme')) {
    $('settingTheme').value = window.desktopAPI.normalizeTheme(s.theme);
  }
  applyTheme(s.theme);
  $('settingJumpSeconds').value = s.autoJumpSeconds ?? 5;
  if ($('settingDiscoverTimeout')) {
    const ms = Number(s.discoverTimeoutMs);
    $('settingDiscoverTimeout').value = Number.isFinite(ms) ? Math.round(ms / 1000) : 20;
  }
  $('settingGaugeBin').value = s.gaugeBin || 'gauge';
  $('settingAutoCheckUpdates').checked = Boolean(s.autoCheckUpdates);
  $('gaugeProjectDir').value = s.gaugeProjectDir || $('gaugeProjectDir').value || '';
  $('gaugeSpecs').value = s.gaugeSpecs || $('gaugeSpecs').value || 'specs';
  $('gaugeEnv').value = s.gaugeEnv || '';
  fillRecentProjects(s.recentProjects || []);
  fillRecentHubs(s.recentHubs || [], s.reportHubDir || '');
  applyOutlinePaneWidth(s.outlinePaneWidth);
}

function renderPluginDetect(info) {
  state.pluginInstall = info || null;
  const el = $('pluginDetectStatus');
  const hint = $('pluginDetectHint');
  if (!el || !hint) return;
  el.classList.remove('ok', 'warn', 'error', 'muted');
  if (!info) {
    el.textContent = '未检测';
    el.classList.add('muted');
    hint.textContent = '';
    return;
  }
  el.textContent = info.message || (info.found ? `v${info.version}` : '未安装');
  el.classList.add(info.level || (info.ok ? 'ok' : 'error'));
  if (info.path) {
    hint.textContent = info.path;
  } else if (!info.found) {
    hint.textContent = '请执行 gauge install studio-reporter --file <zip>，或解压到 ~/.gauge/plugins/studio-reporter/<version>/';
  } else {
    hint.textContent = '';
  }
}

async function refreshPluginDetect() {
  const el = $('pluginDetectStatus');
  if (el) {
    el.classList.remove('ok', 'warn', 'error');
    el.classList.add('muted');
    el.textContent = '检测中…';
  }
  try {
    const info = await window.desktopAPI.detectPlugin();
    renderPluginDetect(info);
    return info;
  } catch (err) {
    renderPluginDetect({
      found: false,
      ok: false,
      level: 'error',
      message: String(err.message || err),
    });
    return null;
  }
}

function renderUpdaterStatus(status) {
  const el = $('updaterStatus');
  const installBtn = $('btnQuitInstall');
  if (!el) return;
  el.classList.remove('ok', 'warn', 'error', 'muted');
  if (!status) {
    el.textContent = '尚未检查';
    el.classList.add('muted');
    installBtn?.classList.add('hidden');
    return;
  }
  el.textContent = status.message || status.state || '';
  if (status.state === 'current' || status.state === 'ready') el.classList.add('ok');
  else if (status.state === 'error') el.classList.add('error');
  else if (status.state === 'available' || status.state === 'downloading' || status.state === 'checking') {
    el.classList.add('warn');
  } else el.classList.add('muted');
  if (installBtn) {
    installBtn.classList.toggle('hidden', status.state !== 'ready');
  }
}

async function checkUpdates() {
  renderUpdaterStatus({ state: 'checking', message: '正在检查更新…' });
  try {
    const status = await window.desktopAPI.checkUpdates();
    renderUpdaterStatus(status);
    return status;
  } catch (err) {
    renderUpdaterStatus({ state: 'error', message: String(err.message || err) });
    return null;
  }
}

function clearDiscoverWatch() {
  if (state.discoverTimer) {
    clearTimeout(state.discoverTimer);
    state.discoverTimer = null;
  }
}

function watchDiscoverTimeout(ms = 20000) {
  clearDiscoverWatch();
  state.discoverTimer = setTimeout(async () => {
    state.discoverTimer = null;
    const info = state.pluginInstall || await refreshPluginDetect();
    if (!info?.found) {
      setStatus('超时未发现 websocket：请检查是否已安装 studio-reporter 插件（见设置）', 'warn');
    } else if (!info.ok) {
      setStatus(`超时未发现 websocket：本机插件 ${info.version} 可能过旧`, 'warn');
    } else {
      setStatus('超时未发现 websocket：确认项目已启用 studio-reporter 报告插件', 'warn');
    }
  }, ms);
}

async function loadSettings() {
  state.settings = await window.desktopAPI.getSettings();
  state.autoJump = state.settings.autoJumpToReport !== false;
  state.jumpSeconds = Number(state.settings.autoJumpSeconds ?? 5);
  const pref =
    typeof window.desktopAPI.normalizeScenarioCompareKinds === 'function'
      ? window.desktopAPI.normalizeScenarioCompareKinds(state.settings.compareScenarioKinds)
      : state.settings.compareScenarioKinds;
  state.compareScenarioKinds = Array.isArray(pref) && pref.length ? pref : null;
  fillSettingsForm();
}

async function saveSettings() {
  const partial = {
    reportHubDir: $('settingHubDir').value.trim(),
    restoreSession: $('settingRestoreSession')
      ? $('settingRestoreSession').checked
      : true,
    autoJumpToReport: $('settingAutoJump').checked,
    notifyOnSuiteEnd: $('settingNotifySuiteEnd')
      ? $('settingNotifySuiteEnd').checked
      : true,
    watchHubHistory: $('settingWatchHubHistory')
      ? $('settingWatchHubHistory').checked
      : true,
    historyTrendLimit: Number($('settingHistoryTrendLimit')?.value || 12),
    historyTrendFlakyLimit: Number($('settingHistoryTrendFlakyLimit')?.value || 20),
    theme: $('settingTheme')
      ? window.desktopAPI.normalizeTheme($('settingTheme').value)
      : 'system',
    autoJumpSeconds: Number($('settingJumpSeconds').value) || 0,
    discoverTimeoutMs: (() => {
      const sec = Number($('settingDiscoverTimeout')?.value);
      return Number.isFinite(sec) ? Math.round(sec * 1000) : 20000;
    })(),
    gaugeBin: $('settingGaugeBin').value.trim() || 'gauge',
    gaugeProjectDir: $('gaugeProjectDir').value.trim(),
    gaugeSpecs: $('gaugeSpecs').value.trim() || 'specs',
    gaugeEnv: $('gaugeEnv').value.trim(),
    autoCheckUpdates: $('settingAutoCheckUpdates').checked,
    lastTab: state.activeTab || 'run',
  };
  state.settings = await window.desktopAPI.saveSettings(partial);
  state.autoJump = state.settings.autoJumpToReport;
  state.jumpSeconds = state.settings.autoJumpSeconds;
  fillRecentHubs(state.settings.recentHubs || [], state.settings.reportHubDir || '');
  $('settingsStatus').textContent = '已保存';
  setTimeout(() => { $('settingsStatus').textContent = ''; }, 1500);
}

function appendGaugeLog(text) {
  const el = $('gaugeLog');
  el.classList.remove('hidden');
  el.textContent += text;
  if (el.textContent.length > 200_000) {
    el.textContent = el.textContent.slice(-150_000);
  }
  el.scrollTop = el.scrollHeight;
}

function setGaugeRunning(runningCountOrBool) {
  const running = typeof runningCountOrBool === 'number'
    ? runningCountOrBool > 0
    : Boolean(runningCountOrBool);
  // Multi-session: allow starting another run while one is active (cap enforced in main).
  $('btnStartGauge').disabled = false;
  $('btnStopGauge').disabled = !running;
  $('btnPickGaugeProject').disabled = false;
}

async function startGauge() {
  const projectDir = $('gaugeProjectDir').value.trim();
  if (!projectDir) {
    setStatus('请先选择 Gauge 项目目录', 'warn');
    return;
  }
  $('gaugeLog').textContent = '';
  $('gaugeLog').classList.remove('hidden');
  setGaugeRunning(true);
  try {
    await window.desktopAPI.startGauge({
      projectDir,
      specs: $('gaugeSpecs').value.trim() || 'specs',
      env: $('gaugeEnv').value.trim(),
      gaugeBin: $('settingGaugeBin').value.trim() || state.settings?.gaugeBin || 'gauge',
    });
    setStatus('Gauge 已启动，等待 discover…', 'ok');
    const timeoutMs = Number(state.settings?.discoverTimeoutMs);
    watchDiscoverTimeout(Number.isFinite(timeoutMs) ? timeoutMs : 20000);
    setTab('run');
  } catch (err) {
    setGaugeRunning(false);
    clearDiscoverWatch();
    setStatus(String(err.message || err), 'warn');
  }
}

async function stopGauge() {
  try {
    clearDiscoverWatch();
    await window.desktopAPI.stopGauge();
    setStatus('正在停止 Gauge…', 'warn');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}


function applyDesktopShortcut(action) {
  if (!action || !action.type) return;
  if (action.type === 'tab' && action.tab) {
    setTab(action.tab);
    return;
  }
  if (action.type === 'connect') {
    connect();
    return;
  }
  if (action.type === 'refresh-history') {
    setTab('history');
    refreshHistory();
  }
}

function wire() {
  wireFrameFilterReplay();
  wireOutlineSplitter();
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  const tablist = document.querySelector('.tabs[role="tablist"]');
  tablist?.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const current =
      document.querySelector('.tab.active')?.dataset.tab ||
      state.activeTab ||
      'run';
    const next = window.desktopAPI.nextTab(current, e.key);
    setTab(next);
    document.querySelector(`.tab[data-tab="${next}"]`)?.focus();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!window.desktopAPI.shouldIgnoreShortcutTarget(e.target)) {
        e.preventDefault();
        focusOutlineSearch();
        return;
      }
    }
    if ((e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (
        (state.activeTab === 'run' || state.activeTab === 'report') &&
        !window.desktopAPI.shouldIgnoreShortcutTarget(e.target)
      ) {
        e.preventDefault();
        jumpOutlineFail(e.key === 'k' || e.key === 'K' ? -1 : 1);
        return;
      }
    }
    if (window.desktopAPI.shouldIgnoreShortcutTarget(e.target)) return;
    const action = window.desktopAPI.matchShortcut(e);
    if (!action || action.type === 'open-report') return;
    e.preventDefault();
    applyDesktopShortcut(action);
  });
  window.desktopAPI.onDesktopShortcut?.((action) => applyDesktopShortcut(action));
  $('btnConnect').addEventListener('click', connect);
  $('btnDisconnect').addEventListener('click', disconnect);
  $('btnOpenDir').addEventListener('click', async () => {
    const dir = await window.desktopAPI.pickReportDir();
    if (dir) setStatus(`已打开 ${dir}`, 'ok');
  });
  $('btnOpenFinal').addEventListener('click', openFinal);
  $('btnDismissBanner').addEventListener('click', () => {
    clearInterval(state.countdown);
    state.countdown = null;
    $('endBanner').classList.add('hidden');
    $('btnOpenFinal').textContent = '打开终态报告';
  });
  $('wsInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connect();
  });
  $('btnRefreshHistory').addEventListener('click', refreshHistory);
  $('btnCompareRuns').addEventListener('click', runCompare);
  $('btnCopyFailDigest')?.addEventListener('click', copyHistoryFailDigest);
  $('btnCopyFailDigestLinks')?.addEventListener('click', copyHistoryFailDigestOpenLinks);
  $('btnOpenFailDigestMd')?.addEventListener('click', () => openFailDigestSidecar('md'));
  $('btnOpenFailDigestJson')?.addEventListener('click', () => openFailDigestSidecar('json'));
  $('btnRevealFailDigest')?.addEventListener('click', revealFailDigestSidecar);
  $('btnRefreshFailDigest')?.addEventListener('click', refreshFailDigestSidecarsFromHub);
  $('btnHistoryTrend')?.addEventListener('click', showHistoryTrend);
  $('btnPickHub').addEventListener('click', async () => {
    const hub = await window.desktopAPI.pickHubDir();
    if (hub) {
      await loadSettings();
      refreshHistory();
    }
  });
  $('btnSettingPickHub').addEventListener('click', async () => {
    const hub = await window.desktopAPI.pickHubDir();
    if (hub) {
      await loadSettings();
      fillSettingsForm();
    }
  });
  $('historyRecentHubs')?.addEventListener('change', async (e) => {
    const hub = e.target.value;
    if (!hub) return;
    try {
      await applyHubDir(hub);
      refreshHistory();
    } catch (err) {
      setStatus(String(err.message || err), 'warn');
    }
  });
  $('settingRecentHubs')?.addEventListener('change', async (e) => {
    const hub = e.target.value;
    if (!hub) return;
    try {
      await applyHubDir(hub);
    } catch (err) {
      setStatus(String(err.message || err), 'warn');
    }
  });
  $('btnSaveSettings').addEventListener('click', saveSettings);
  $('settingTheme')?.addEventListener('change', () => {
    applyTheme($('settingTheme').value);
  });
  watchSystemTheme();
  $('btnRefreshPlugin')?.addEventListener('click', () => {
    refreshPluginDetect();
  });
  $('btnCheckUpdates')?.addEventListener('click', () => {
    checkUpdates();
  });
  $('btnQuitInstall')?.addEventListener('click', async () => {
    try {
      await window.desktopAPI.quitAndInstall();
    } catch (err) {
      setStatus(String(err.message || err), 'warn');
    }
  });
  $('btnSelectFiltered')?.addEventListener('click', () => selectFilteredHistory());
  $('btnClearSelection')?.addEventListener('click', () => clearHistorySelection());
  $('btnExportPdf').addEventListener('click', () => exportSelectedOrLatest('pdf'));
  $('btnExportSingle').addEventListener('click', () => exportSelectedOrLatest('single'));
  $('btnCancelExport')?.addEventListener('click', () => cancelActiveExport());
  $('btnRevealRun')?.addEventListener('click', () => revealSelectedRun());
  $('btnCopyPath')?.addEventListener('click', () => copySelectedPath());
  $('btnCopyOpenLinks')?.addEventListener('click', () => copySelectedOpenDeepLinks());
  $('btnCopyFailOpenLinks')?.addEventListener('click', () => copyFailedOpenDeepLinks());
  $('btnDeleteRuns')?.addEventListener('click', () => deleteSelectedRuns());
  let historyQueryTimer = null;
  $('historyQuery')?.addEventListener('input', () => {
    state.historyQuery = $('historyQuery').value || '';
    clearTimeout(historyQueryTimer);
    historyQueryTimer = setTimeout(() => {
      renderHistoryList({ hubDir: state.settings?.reportHubDir || '' });
      updateHistoryActionButtons();
      schedulePersistHistoryFilters();
    }, 120);
  });
  $('historyFailReasonQuery')?.addEventListener('input', () => {
    state.historyFailReasonQuery = $('historyFailReasonQuery').value || '';
    clearTimeout(historyQueryTimer);
    historyQueryTimer = setTimeout(() => {
      renderHistoryList({ hubDir: state.settings?.reportHubDir || '' });
      updateHistoryActionButtons();
      schedulePersistHistoryFilters();
    }, 120);
  });
  document.querySelectorAll('.history-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.historyVerdict = btn.dataset.verdict || 'all';
      document.querySelectorAll('.history-filter-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderHistoryList({ hubDir: state.settings?.reportHubDir || '' });
      schedulePersistHistoryFilters();
    });
  });

  $('btnPickGaugeProject').addEventListener('click', async () => {
    const dir = await window.desktopAPI.pickGaugeProject();
    if (dir) {
      $('gaugeProjectDir').value = dir;
      await loadSettings();
    }
  });
  $('btnStartGauge').addEventListener('click', startGauge);
  $('btnStopGauge').addEventListener('click', stopGauge);

  window.desktopAPI.onBridgeStatus((data) => {
    if (data?.compat) {
      const level = data.compat.level === 'error' ? 'error' : data.compat.ok ? 'ok' : 'warn';
      setStatus(data.compat.message || `插件 ${data.compat.version || ''}`, level);
      return;
    }
    if (data?.hello?.version) {
      setStatus(`已连接 · 插件 ${data.hello.version}`, 'ok');
      return;
    }
    if (data?.connected) setStatus(`已连接 ${data.url || ''}`.trim(), 'ok');
    else if (data?.error) setStatus(data.error, 'warn');
    else if (data && data.connected === false) setStatus('已断开', 'warn');
  });
  window.desktopAPI.onReportGenerated((payload) => showEndBanner(payload));
  window.desktopAPI.onHistoryChanged?.((info) => {
    if (state.settings?.watchHubHistory === false) return;
    const currentHub = String(state.settings?.reportHubDir || '').trim();
    if (info?.hubDir && currentHub && pathResolveSafe(info.hubDir) !== pathResolveSafe(currentHub)) {
      return;
    }
    refreshHistory({ preserveSelection: true }).then(() => {
      if (state.activeTab === 'history') {
        setStatus('历史列表已随报告根目录变更自动刷新', 'ok');
      }
    });
  });
  // When compare deep links also switch hub, main sends settings-updated then
  // navigate-compare. Skip the intermediate history wipe so selection sticks.
  let compareDeepLinkPending = false;
  window.desktopAPI.onSettingsUpdated?.((settings) => {
    state.settings = settings || state.settings;
    fillSettingsForm();
    if (!compareDeepLinkPending) refreshHistory?.();
  });
  window.desktopAPI.onNavigateTab?.((data) => {
    if (data?.tab) setTab(data.tab);
  });
  window.desktopAPI.onNavigateCompare?.((data) => {
    if (data?.base && data?.target) {
      compareDeepLinkPending = true;
      const opts = Object.prototype.hasOwnProperty.call(data, 'kinds')
        ? { kinds: data.kinds }
        : {};
      Promise.resolve(openCompareByIds(data.base, data.target, opts)).finally(() => {
        compareDeepLinkPending = false;
      });
    }
  });
  window.desktopAPI.onNavigateLive((data) => {
    if (data?.url) {
      showLive(data.url);
      setTab('run');
    }
  });
  window.desktopAPI.onNavigateReport((data) => {
    if (data?.url) showReport(data.url);
  });
  window.desktopAPI.onSnapshotMeta((meta) => {
    if (!meta) return;
    if (meta.running === false) setStatus('运行结束（等待落盘）', 'warn');
    else if (meta.projectName) setStatus(`运行中 · ${meta.projectName}`, 'ok');
  });
  window.desktopAPI.onReportOutline((outline) => {
    renderOutline(outline);
    postFilterToFrames();
  });
  wireOutlineVirtualScroll();
  $('outlineTree')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-node-id]');
    if (!btn) return;
    postSelectNode(btn.getAttribute('data-node-id'));
    renderOutline();
  });
  $('btnOutlinePrevFail')?.addEventListener('click', () => jumpOutlineFail(-1));
  $('btnOutlineNextFail')?.addEventListener('click', () => jumpOutlineFail(1));
  $('outlineQuery')?.addEventListener('input', () => {
    state.outlineQuery = $('outlineQuery').value || '';
    renderOutline();
    postFilterToFrames();
    persistOutlineFilter();
  });
  document.querySelectorAll('.outline-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.outlineVerdict = btn.dataset.verdict || 'all';
      document.querySelectorAll('.outline-filter-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderOutline();
      postFilterToFrames();
      persistOutlineFilter();
    });
  });
  window.desktopAPI.onGaugeLog((data) => {
    if (data?.text) appendGaugeLog(data.text);
  });
  window.desktopAPI.onGaugeDiscover((data) => {
    if (data?.url) {
      clearDiscoverWatch();
      $('wsInput').value = data.url;
      setStatus(`已发现 ${data.url}，正在连接…`, 'ok');
    }
  });
  window.desktopAPI.onGaugeStatus((data) => {
    if (!data) return;
    if (data.sessions) renderSessions(data);
    const runningN = (data.sessions || []).filter((s) => s.status === 'running').length;
    setGaugeRunning(runningN > 0 || Boolean(data.running));
    if (data.autoConnected && data.liveUrl) {
      clearDiscoverWatch();
      showLive(data.liveUrl);
      setTab('run');
      setStatus(`已自动连接 ${data.discoveredUrl || ''}`.trim(), 'ok');
      $('btnDisconnect').disabled = false;
      fillRecentProjects(state.settings?.recentProjects || []);
    } else if (data.running === false) {
      clearDiscoverWatch();
      const code = data.code != null ? ` code=${data.code}` : '';
      setStatus(`Gauge 已退出${code}`, data.code ? 'warn' : 'ok');
    } else if (data.error) {
      setStatus(data.error, 'warn');
    }
  });
  window.desktopAPI.onSessionsUpdated((data) => {
    renderSessions(data || {});
    const runningN = (data?.sessions || []).filter((s) => s.status === 'running').length;
    setGaugeRunning(runningN);
  });
  window.desktopAPI.onUpdaterStatus((data) => {
    renderUpdaterStatus(data);
  });
}

(async function init() {
  wire();
  try {
    const info = await window.desktopAPI.info();
    $('version').textContent = `Desktop ${info.version}`;
  } catch {
    $('version').textContent = 'Desktop';
  }
  try {
    await loadSettings();
    const s = state.settings;
    state.outlineQuery = s?.outlineQuery || '';
    state.outlineVerdict = s?.outlineVerdict || 'all';
    state.historyQuery = s?.historyQuery || '';
    state.historyFailReasonQuery = s?.historyFailReasonQuery || '';
    state.historyVerdict = s?.historyVerdict || 'all';
    applyOutlineFilterToUi();
    applyHistoryFiltersToUi();
    renderOutline();
    postFilterToFrames();
    if (s?.restoreSession !== false && VALID_TABS.has(s.lastTab) && s.lastTab !== state.activeTab) {
      setTab(s.lastTab, { persist: false });
    } else if (state.activeTab === 'run' || state.activeTab === 'report') {
      postFilterToFrames();
    }
  } catch {
    /* ignore */
  }
  try {
    await refreshPluginDetect();
  } catch {
    /* ignore */
  }
  try {
    const st = await window.desktopAPI.getUpdaterStatus();
    renderUpdaterStatus(st);
  } catch {
    /* ignore */
  }
  try {
    const sess = await window.desktopAPI.listSessions();
    renderSessions(sess || {});
  } catch {
    /* ignore */
  }
})();
