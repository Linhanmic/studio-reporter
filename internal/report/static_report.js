(function () {
  var KEY = 'studio-report-filter';
  var state = { spec: 'all', scenario: 'all', query: '' };
  // Gate share-hash writes until the initial URL fragment is applied.
  // Otherwise the first applyFilter() rewrites #fail-steps → #overview and
  // headless PDF / deep links lose fail-steps-only before print.
  var applyingHash = true;
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && saved.spec) state.spec = saved.spec;
    if (saved && saved.scenario) state.scenario = saved.scenario;
    if (saved && typeof saved.query === 'string') state.query = saved.query;
  } catch (e) {}

  var searchInput = document.querySelector('.search-input');
  if (searchInput) searchInput.value = state.query || '';

  function blockDepth(el) {
    var d = 0;
    var cur = el.parentElement;
    while (cur) {
      if (cur.classList && cur.classList.contains('report-block')) d++;
      cur = cur.parentElement;
    }
    return d;
  }

  // Only structural nodes participate in filter toggles. Step/concept leaves stay
  // visible under an unhidden parent via CSS, so we avoid O(steps) class churn.
  var STRUCTURAL_SELECTOR =
    '.result-pane .report-block[data-kind="spec"],' +
    '.result-pane .report-block[data-kind="scenario"],' +
    '.result-pane .report-block[data-kind="datarow"],' +
    '.result-pane .report-block[data-kind="datadriven"]';

  function showStructural(el) {
    el.classList.remove('filter-hidden');
  }

  function persist() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function syncButtons() {
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      var scope = btn.dataset.scope || '';
      var active = state[scope] === btn.dataset.filter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function blockName(el) {
    if (el && el.dataset && typeof el.dataset.name === 'string' && el.dataset.name) {
      return el.dataset.name.toLowerCase();
    }
    var cell = el.querySelector(':scope > summary .name-cell, :scope > .leaf-summary .name-cell');
    return cell ? (cell.textContent || '').toLowerCase() : '';
  }

  function matchesQuery(el, q) {
    if (!q) return true;
    if (blockName(el).indexOf(q) >= 0) return true;
    var kids = el.querySelectorAll('.report-block[data-kind="scenario"], .report-block[data-kind="spec"]');
    for (var i = 0; i < kids.length; i++) {
      if (blockName(kids[i]).indexOf(q) >= 0) return true;
    }
    return false;
  }

  function visibleFailScenarios() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.result-pane .report-block[data-kind="scenario"][data-verdict="fail"]')
    ).filter(function (el) {
      if (el.classList.contains('filter-hidden')) return false;
      // fail-steps-mode hides non-fail scenarios via CSS; fail rows stay.
      return true;
    });
  }

  function visibleFailScenarioIdSet() {
    var ids = Object.create(null);
    visibleFailScenarios().forEach(function (el) {
      if (el.id) ids[el.id] = true;
    });
    return ids;
  }

  // Keep Overview fail-reason table aligned with the visible result tree.
  // Mirrors Go FilterFailReasonGroups: scenario refs need a visible fail scenario;
  // suite/spec hook refs (no data-scn-id) always stay.
  function syncFailReasonOverview() {
    var visible = visibleFailScenarioIdSet();
    var visibleRows = 0;
    document.querySelectorAll('.fail-reason-row').forEach(function (row) {
      var n = 0;
      row.querySelectorAll('.fail-reason-ref').forEach(function (ref) {
        var scnId = ref.getAttribute('data-scn-id') || '';
        var keep = !scnId || !!visible[scnId];
        ref.classList.toggle('ref-hidden', !keep);
        if (keep) n++;
      });
      var countEl = row.querySelector('.fail-reason-count');
      if (countEl) countEl.textContent = String(n);
      row.classList.toggle('filter-hidden', n === 0);
      row.setAttribute('data-fail-count-visible', String(n));
      if (n > 0) visibleRows++;
    });
    syncBulkFailReasonCopyButtons(visibleRows);
  }

  function syncBulkFailReasonCopyButtons(visibleRows) {
    var n = typeof visibleRows === 'number'
      ? visibleRows
      : document.querySelectorAll('.fail-reason-row:not(.filter-hidden)').length;
    var disabled = n === 0;
    document.querySelectorAll(
      '[data-action="copy-all-fail-reason-snippets"], [data-action="copy-all-fail-reason-links"]'
    ).forEach(function (btn) {
      if (!btn.getAttribute('data-title-enabled')) {
        btn.setAttribute('data-title-enabled', btn.getAttribute('title') || '');
      }
      btn.disabled = disabled;
      btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      btn.setAttribute(
        'title',
        disabled ? '当前过滤下无可复制的失败原因' : (btn.getAttribute('data-title-enabled') || '')
      );
    });
    document.querySelectorAll('.overview-fail-reason-empty-hint').forEach(function (hint) {
      if (disabled) hint.removeAttribute('hidden');
      else hint.setAttribute('hidden', '');
    });
    document.querySelectorAll('.fail-reason-empty-row').forEach(function (row) {
      if (disabled) row.removeAttribute('hidden');
      else row.setAttribute('hidden', '');
    });
    // Tools-row empty-state actions (table-cell clear stays always in DOM; tools ones toggle).
    document.querySelectorAll(
      '.overview-fail-reason-tools [data-action="clear-report-filters"],' +
      '.overview-fail-reason-tools [data-action="restore-fail-only-view"]'
    ).forEach(function (btn) {
      if (disabled) {
        btn.removeAttribute('hidden');
        btn.setAttribute('tabindex', '0');
      } else {
        btn.setAttribute('hidden', '');
        btn.removeAttribute('tabindex');
      }
    });
    syncUndoClearFiltersButton();
  }

  var lastFilterSnapshot = null;
  var emptyStateMetrics = {
    clear: 0,
    restoreFailOnly: 0,
    undo: 0,
    escClear: 0,
    ctrlZUndo: 0
  };
  var emptyStateEvents = [];

  function recordEmptyStateEvent(kind, detail) {
    emptyStateMetrics[kind] = (emptyStateMetrics[kind] || 0) + 1;
    var entry = {
      kind: kind,
      at: Date.now(),
      detail: detail || null
    };
    emptyStateEvents.push(entry);
    if (emptyStateEvents.length > 50) emptyStateEvents.shift();
    try {
      if (window.StudioReportDebugEmptyState) {
        // Opt-in verbose console tracing for UX evaluation.
        console.debug('[studio-report:empty-state]', kind, detail || {});
      }
    } catch (e) {}
    syncEmptyStateMetricsPanel();
  }

  function emptyStateMetricsPanelEnabled() {
    try {
      if (window.StudioReportShowEmptyStateMetrics === true) return true;
      if (window.StudioReportShowEmptyStateMetrics === false) return false;
    } catch (e) {}
    try {
      var q = String(location.search || '');
      if (/[?&]emptyMetrics=1(?:&|$)/i.test(q) || /[?&]empty-metrics=1(?:&|$)/i.test(q)) return true;
      if (/[?&]emptyMetrics=0(?:&|$)/i.test(q) || /[?&]empty-metrics=0(?:&|$)/i.test(q)) return false;
    } catch (e2) {}
    try {
      var ls = localStorage.getItem('studio-report-empty-metrics');
      if (ls === '1' || ls === 'true') return true;
      if (ls === '0' || ls === 'false') return false;
    } catch (e3) {}
    return false;
  }

  function shortenEmptyStateMetricsProjectRoot(root) {
    var s = String(root || '').trim();
    if (!s) return '';
    s = s.replace(/\\/g, '/');
    var parts = s.split('/').filter(Boolean);
    if (parts.length >= 2) return '…/' + parts.slice(-2).join('/');
    return parts.length ? parts[parts.length - 1] : s;
  }

  var EMPTY_STATE_METRICS_META_FIELD_DEFS = [
    { id: 'projectName', label: '项目', defaultGroup: 'primary' },
    { id: 'verdict', label: '结论', defaultGroup: 'primary' },
    { id: 'generatedAt', label: '生成时间', defaultGroup: 'primary' },
    { id: 'projectRoot', label: '根目录', defaultGroup: 'secondary' },
    { id: 'hostName', label: '主机', defaultGroup: 'secondary' },
    { id: 'pluginVersion', label: '插件', defaultGroup: 'secondary' },
    { id: 'environment', label: '环境', defaultGroup: 'hidden' },
    { id: 'duration', label: '耗时', defaultGroup: 'hidden' }
  ];

  function defaultEmptyStateMetricsMetaFieldPrefs() {
    var primary = [];
    var secondary = [];
    EMPTY_STATE_METRICS_META_FIELD_DEFS.forEach(function (def) {
      if (def.defaultGroup === 'primary') primary.push(def.id);
      else if (def.defaultGroup === 'secondary') secondary.push(def.id);
    });
    return { primary: primary, secondary: secondary };
  }

  function normalizeEmptyStateMetricsMetaFieldPrefs(raw) {
    var defaults = defaultEmptyStateMetricsMetaFieldPrefs();
    var known = {};
    EMPTY_STATE_METRICS_META_FIELD_DEFS.forEach(function (def) { known[def.id] = true; });
    var primary = [];
    var secondary = [];
    var seen = {};
    function takeList(list, out) {
      if (!Array.isArray(list)) return;
      list.forEach(function (id) {
        id = String(id || '');
        if (!known[id] || seen[id]) return;
        seen[id] = true;
        out.push(id);
      });
    }
    if (!raw || typeof raw !== 'object') return defaults;
    takeList(raw.primary, primary);
    takeList(raw.secondary, secondary);
    return { primary: primary, secondary: secondary };
  }

  function getEmptyStateMetricsMetaFieldPrefs() {
    try {
      var raw = localStorage.getItem('studio-report-empty-metrics-meta-fields');
      if (!raw) return defaultEmptyStateMetricsMetaFieldPrefs();
      return normalizeEmptyStateMetricsMetaFieldPrefs(JSON.parse(raw));
    } catch (e) {
      return defaultEmptyStateMetricsMetaFieldPrefs();
    }
  }

  function setEmptyStateMetricsMetaFieldPrefs(prefs) {
    var next = normalizeEmptyStateMetricsMetaFieldPrefs(prefs || {});
    try {
      localStorage.setItem('studio-report-empty-metrics-meta-fields', JSON.stringify(next));
    } catch (e) {}
    syncEmptyStateMetricsMetaFieldsEditor();
    syncEmptyStateMetricsPanel();
    try { syncEmptyMetricsMetaPresetInLocation(getActiveEmptyStateMetricsMetaFieldNamedPresetId()); } catch (e2) {}
    try { syncEmptyMetricsEnableURLButtons(); } catch (e3) {}
    try { syncEmptyStateMetricsMetaPresetToolbarChip(); } catch (e4) {}
    return next;
  }

  function resetEmptyStateMetricsMetaFieldPrefs() {
    try { localStorage.removeItem('studio-report-empty-metrics-meta-fields'); } catch (e) {}
    setActiveEmptyStateMetricsMetaFieldNamedPresetId('default');
    syncEmptyStateMetricsMetaFieldsEditor();
    syncEmptyStateMetricsPanel();
    try { syncEmptyMetricsMetaPresetInLocation('default'); } catch (e2) {}
    try { syncEmptyMetricsEnableURLButtons(); } catch (e3) {}
    try { syncEmptyStateMetricsMetaPresetToolbarChip(); } catch (e4) {}
    flashStatus('已恢复 meta 字段默认（主三项）');
    return getEmptyStateMetricsMetaFieldPrefs();
  }

  var EMPTY_STATE_METRICS_META_FIELD_BUILTIN_PRESETS = [
    {
      id: 'default',
      name: '默认',
      primary: ['projectName', 'verdict', 'generatedAt'],
      secondary: ['projectRoot', 'hostName', 'pluginVersion']
    },
    {
      id: 'ci-slim',
      name: 'CI 精简',
      primary: ['projectName', 'verdict'],
      secondary: []
    },
    {
      id: 'debug-full',
      name: '排障完整',
      primary: ['projectName', 'verdict', 'generatedAt', 'duration'],
      secondary: ['projectRoot', 'hostName', 'pluginVersion', 'environment']
    }
  ];

  function sanitizeEmptyStateMetricsMetaFieldNamedPresetName(name) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    name = name.replace(/[<>&"'`]/g, '');
    if (!name) return '';
    if (name.length > 40) name = name.slice(0, 40);
    return name;
  }

  function normalizeEmptyStateMetricsMetaFieldNamedPreset(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || fallbackId || '').trim();
    var name = sanitizeEmptyStateMetricsMetaFieldNamedPresetName(raw.name);
    if (!id || !name) return null;
    if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(id)) return null;
    var prefs = normalizeEmptyStateMetricsMetaFieldPrefs(raw);
    return {
      id: id,
      name: name,
      primary: prefs.primary.slice(),
      secondary: prefs.secondary.slice()
    };
  }

  function getEmptyStateMetricsMetaFieldCustomNamedPresets() {
    try {
      var raw = localStorage.getItem('studio-report-empty-metrics-meta-field-named');
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      var list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.custom) ? parsed.custom : []);
      var out = [];
      var seen = {};
      list.forEach(function (item, i) {
        var p = normalizeEmptyStateMetricsMetaFieldNamedPreset(item, 'custom-' + (i + 1));
        if (!p || seen[p.id]) return;
        // Custom ids must not collide with builtins.
        if (EMPTY_STATE_METRICS_META_FIELD_BUILTIN_PRESETS.some(function (b) { return b.id === p.id; })) return;
        seen[p.id] = true;
        out.push(p);
      });
      return out;
    } catch (e) {
      return [];
    }
  }

  function setEmptyStateMetricsMetaFieldCustomNamedPresets(list) {
    var next = [];
    var seen = {};
    (list || []).forEach(function (item, i) {
      var p = normalizeEmptyStateMetricsMetaFieldNamedPreset(item, 'custom-' + (i + 1));
      if (!p || seen[p.id]) return;
      if (EMPTY_STATE_METRICS_META_FIELD_BUILTIN_PRESETS.some(function (b) { return b.id === p.id; })) return;
      seen[p.id] = true;
      next.push(p);
    });
    try {
      localStorage.setItem('studio-report-empty-metrics-meta-field-named', JSON.stringify({ version: 1, custom: next }));
    } catch (e) {}
    return next;
  }

  function listEmptyStateMetricsMetaFieldNamedPresets() {
    return EMPTY_STATE_METRICS_META_FIELD_BUILTIN_PRESETS.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        builtin: true,
        primary: p.primary.slice(),
        secondary: p.secondary.slice()
      };
    }).concat(getEmptyStateMetricsMetaFieldCustomNamedPresets().map(function (p) {
      return {
        id: p.id,
        name: p.name,
        builtin: false,
        primary: p.primary.slice(),
        secondary: p.secondary.slice()
      };
    }));
  }

  function findEmptyStateMetricsMetaFieldNamedPreset(id) {
    id = String(id || '');
    var all = listEmptyStateMetricsMetaFieldNamedPresets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  function equalEmptyStateMetricsMetaFieldPrefs(a, b) {
    a = normalizeEmptyStateMetricsMetaFieldPrefs(a || {});
    b = normalizeEmptyStateMetricsMetaFieldPrefs(b || {});
    return a.primary.join(',') === b.primary.join(',') && a.secondary.join(',') === b.secondary.join(',');
  }

  function getActiveEmptyStateMetricsMetaFieldNamedPresetId() {
    var prefs = getEmptyStateMetricsMetaFieldPrefs();
    try {
      var raw = localStorage.getItem('studio-report-empty-metrics-meta-field-named-active');
      if (raw) {
        var id = String(raw || '').trim();
        var stored = findEmptyStateMetricsMetaFieldNamedPreset(id);
        if (stored && equalEmptyStateMetricsMetaFieldPrefs(prefs, stored)) return id;
      }
    } catch (e) {}
    // Infer from current prefs when no matching explicit active id.
    var all = listEmptyStateMetricsMetaFieldNamedPresets();
    for (var i = 0; i < all.length; i++) {
      if (equalEmptyStateMetricsMetaFieldPrefs(prefs, all[i])) return all[i].id;
    }
    return '';
  }

  function setActiveEmptyStateMetricsMetaFieldNamedPresetId(id) {
    id = String(id || '').trim();
    try {
      if (!id) localStorage.removeItem('studio-report-empty-metrics-meta-field-named-active');
      else localStorage.setItem('studio-report-empty-metrics-meta-field-named-active', id);
    } catch (e) {}
    return id;
  }

  function applyEmptyStateMetricsMetaFieldNamedPreset(id) {
    var preset = findEmptyStateMetricsMetaFieldNamedPreset(id);
    if (!preset) {
      flashStatus('未找到字段预设：' + String(id || ''));
      return null;
    }
    setActiveEmptyStateMetricsMetaFieldNamedPresetId(preset.id);
    var next = setEmptyStateMetricsMetaFieldPrefs({
      primary: preset.primary,
      secondary: preset.secondary
    });
    try { syncEmptyMetricsMetaPresetInLocation(preset.id); } catch (e) {}
    flashStatus('已切换字段预设：' + preset.name);
    return { id: preset.id, name: preset.name, prefs: next };
  }

  function readEmptyMetricsMetaPresetFromQuery() {
    try {
      var q = String(location.search || '');
      var m = q.match(/[?&](?:emptyMetricsMetaPreset|empty-metrics-meta-preset)=([^&#]*)/i);
      if (!m) return '';
      var raw = decodeURIComponent(String(m[1] || '').replace(/\+/g, ' ')).trim();
      return raw || '';
    } catch (e) {
      return '';
    }
  }

  function syncEmptyMetricsMetaPresetInLocation(id) {
    try {
      var href = String(location.href || '');
      var hashIdx = href.indexOf('#');
      var base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      var hash = hashIdx >= 0 ? href.slice(hashIdx) : '';
      var qIdx = base.indexOf('?');
      var path = qIdx >= 0 ? base.slice(0, qIdx) : base;
      var params = new URLSearchParams(qIdx >= 0 ? base.slice(qIdx + 1) : '');
      params.delete('empty-metrics-meta-preset');
      var nextId = String(id || '').trim();
      if (!nextId || nextId === 'default') {
        if (!params.has('emptyMetricsMetaPreset') && !params.has('empty-metrics-meta-preset')) return false;
        params.delete('emptyMetricsMetaPreset');
      } else {
        params.set('emptyMetricsMetaPreset', nextId);
      }
      var qs = params.toString();
      history.replaceState(null, '', path + (qs ? ('?' + qs) : '') + hash);
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyEmptyMetricsMetaPresetFromQuery() {
    var id = readEmptyMetricsMetaPresetFromQuery();
    if (!id) return getActiveEmptyStateMetricsMetaFieldNamedPresetId();
    var preset = findEmptyStateMetricsMetaFieldNamedPreset(id);
    if (!preset) {
      flashStatus('URL 字段预设无效：' + id);
      return getActiveEmptyStateMetricsMetaFieldNamedPresetId();
    }
    // Query wins over prior localStorage when sharing an enable deep link.
    var applied = applyEmptyStateMetricsMetaFieldNamedPreset(preset.id);
    return applied ? applied.id : getActiveEmptyStateMetricsMetaFieldNamedPresetId();
  }

  function saveEmptyStateMetricsMetaFieldNamedPreset(name) {
    name = sanitizeEmptyStateMetricsMetaFieldNamedPresetName(name);
    if (!name) {
      flashStatus('请输入预设名称');
      return null;
    }
    var prefs = getEmptyStateMetricsMetaFieldPrefs();
    var custom = getEmptyStateMetricsMetaFieldCustomNamedPresets();
    var existing = null;
    for (var i = 0; i < custom.length; i++) {
      if (custom[i].name === name) {
        existing = custom[i];
        break;
      }
    }
    var id = existing ? existing.id : ('custom-' + Date.now().toString(36));
    var entry = {
      id: id,
      name: name,
      primary: prefs.primary.slice(),
      secondary: prefs.secondary.slice()
    };
    if (existing) {
      custom = custom.map(function (p) { return p.id === id ? entry : p; });
    } else {
      custom.push(entry);
    }
    setEmptyStateMetricsMetaFieldCustomNamedPresets(custom);
    setActiveEmptyStateMetricsMetaFieldNamedPresetId(id);
    syncEmptyStateMetricsMetaFieldsEditor();
    flashStatus('已保存字段预设：' + name);
    return entry;
  }

  function saveEmptyStateMetricsMetaFieldNamedPresetFromPrompt() {
    var active = findEmptyStateMetricsMetaFieldNamedPreset(getActiveEmptyStateMetricsMetaFieldNamedPresetId());
    var hint = (active && !active.builtin) ? active.name : '';
    var name = window.prompt('另存为命名字段预设（如「团队 CI」）', hint);
    if (name == null) return null;
    return saveEmptyStateMetricsMetaFieldNamedPreset(name);
  }

  function deleteEmptyStateMetricsMetaFieldNamedPreset(id) {
    id = String(id || '');
    var preset = findEmptyStateMetricsMetaFieldNamedPreset(id);
    if (!preset) {
      flashStatus('未找到字段预设');
      return false;
    }
    if (preset.builtin) {
      flashStatus('内置预设不可删除');
      return false;
    }
    var next = getEmptyStateMetricsMetaFieldCustomNamedPresets().filter(function (p) { return p.id !== id; });
    setEmptyStateMetricsMetaFieldCustomNamedPresets(next);
    if (getActiveEmptyStateMetricsMetaFieldNamedPresetId() === id) {
      setActiveEmptyStateMetricsMetaFieldNamedPresetId('');
    }
    syncEmptyStateMetricsMetaFieldsEditor();
    flashStatus('已删除字段预设：' + preset.name);
    return true;
  }

  function deleteActiveEmptyStateMetricsMetaFieldNamedPreset() {
    var id = getActiveEmptyStateMetricsMetaFieldNamedPresetId();
    if (!id) {
      flashStatus('当前无命名预设可删');
      return false;
    }
    return deleteEmptyStateMetricsMetaFieldNamedPreset(id);
  }

  function formatEmptyStateMetricsMetaFieldNamedPresetsJSON() {
    return JSON.stringify({
      kind: 'studio-report-empty-metrics-meta-field-named',
      version: 1,
      activeId: getActiveEmptyStateMetricsMetaFieldNamedPresetId() || '',
      custom: getEmptyStateMetricsMetaFieldCustomNamedPresets().map(function (p) {
        return {
          id: p.id,
          name: p.name,
          primary: p.primary.slice(),
          secondary: p.secondary.slice()
        };
      })
    }, null, 2);
  }

  function copyEmptyStateMetricsMetaFieldNamedPresetsJSON() {
    var text = formatEmptyStateMetricsMetaFieldNamedPresetsJSON();
    return copyText(text).then(function () {
      flashStatus('已复制命名字段预设库 JSON');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  function applyEmptyStateMetricsMetaFieldNamedPresetsJSON(raw) {
    var parsed = null;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      flashStatus('命名字段预设 JSON 解析失败');
      return null;
    }
    if (!parsed || typeof parsed !== 'object') {
      flashStatus('命名字段预设无效');
      return null;
    }
    var list = Array.isArray(parsed.custom) ? parsed.custom : (Array.isArray(parsed.presets) ? parsed.presets : (Array.isArray(parsed) ? parsed : null));
    if (!list) {
      flashStatus('命名字段预设缺少 custom 列表');
      return null;
    }
    var next = setEmptyStateMetricsMetaFieldCustomNamedPresets(list);
    var activeId = String(parsed.activeId || '').trim();
    if (activeId && findEmptyStateMetricsMetaFieldNamedPreset(activeId)) {
      applyEmptyStateMetricsMetaFieldNamedPreset(activeId);
    } else {
      syncEmptyStateMetricsMetaFieldsEditor();
    }
    flashStatus('已导入命名字段预设（自定义 ' + next.length + ' 套）');
    return { custom: next, activeId: getActiveEmptyStateMetricsMetaFieldNamedPresetId() };
  }

  function importEmptyStateMetricsMetaFieldNamedPresetsFromPrompt() {
    var sample = formatEmptyStateMetricsMetaFieldNamedPresetsJSON();
    var raw = window.prompt('粘贴命名字段预设库 JSON（custom 列表）', sample);
    if (raw == null) return null;
    return applyEmptyStateMetricsMetaFieldNamedPresetsJSON(raw);
  }

  function formatEmptyStateMetricsMetaFieldPrefsJSON() {
    var prefs = getEmptyStateMetricsMetaFieldPrefs();
    return JSON.stringify({
      kind: 'studio-report-empty-metrics-meta-fields',
      version: 1,
      primary: prefs.primary.slice(),
      secondary: prefs.secondary.slice(),
      activeNamedId: getActiveEmptyStateMetricsMetaFieldNamedPresetId() || ''
    }, null, 2);
  }

  function copyEmptyStateMetricsMetaFieldPrefsJSON() {
    var text = formatEmptyStateMetricsMetaFieldPrefsJSON();
    return copyText(text).then(function () {
      flashStatus('已复制 meta 字段预设 JSON');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  function downloadEmptyStateMetricsMetaFieldPrefsJSON() {
    var text = formatEmptyStateMetricsMetaFieldPrefsJSON();
    var blob = new Blob([text + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'studio-report-empty-metrics-meta-fields.json';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 0);
    flashStatus('已下载 meta 字段预设 JSON');
    return text;
  }

  function applyEmptyStateMetricsMetaFieldPrefsJSON(raw) {
    var parsed = null;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      flashStatus('meta 字段预设 JSON 解析失败');
      return null;
    }
    if (!parsed || typeof parsed !== 'object') {
      flashStatus('meta 字段预设无效');
      return null;
    }
    if (parsed.kind === 'studio-report-empty-metrics-meta-field-named') {
      var namedResult = applyEmptyStateMetricsMetaFieldNamedPresetsJSON(parsed);
      return namedResult ? getEmptyStateMetricsMetaFieldPrefs() : null;
    }
    // Accept bare {primary,secondary} or wrapped kind payload.
    var payload = parsed;
    if (parsed.prefs && typeof parsed.prefs === 'object') payload = parsed.prefs;
    var next = setEmptyStateMetricsMetaFieldPrefs({
      primary: payload.primary,
      secondary: payload.secondary
    });
    var namedId = String(parsed.activeNamedId || payload.activeNamedId || '').trim();
    if (namedId) {
      var named = findEmptyStateMetricsMetaFieldNamedPreset(namedId);
      if (named && equalEmptyStateMetricsMetaFieldPrefs(next, named)) {
        setActiveEmptyStateMetricsMetaFieldNamedPresetId(namedId);
      } else {
        setActiveEmptyStateMetricsMetaFieldNamedPresetId('');
      }
    } else {
      setActiveEmptyStateMetricsMetaFieldNamedPresetId(getActiveEmptyStateMetricsMetaFieldNamedPresetId() || '');
    }
    syncEmptyStateMetricsMetaFieldsEditor();
    flashStatus('已导入 meta 字段预设（主 ' + next.primary.length + ' / 次 ' + next.secondary.length + '）');
    return next;
  }

  function importEmptyStateMetricsMetaFieldPrefsFromPrompt() {
    var sample = formatEmptyStateMetricsMetaFieldPrefsJSON();
    var raw = window.prompt('粘贴 meta 字段预设 JSON（primary/secondary）', sample);
    if (raw == null) return null;
    return applyEmptyStateMetricsMetaFieldPrefsJSON(raw);
  }

  function emptyStateMetricsMetaFieldsEditorOpen() {
    try {
      var ls = localStorage.getItem('studio-report-empty-metrics-meta-fields-open');
      return ls === '1' || ls === 'true' || ls === 'open';
    } catch (e) {
      return false;
    }
  }

  function setEmptyStateMetricsMetaFieldsEditorOpen(on) {
    try {
      localStorage.setItem('studio-report-empty-metrics-meta-fields-open', on ? '1' : '0');
    } catch (e) {}
    syncEmptyStateMetricsMetaFieldsEditor();
  }

  function toggleEmptyStateMetricsMetaFieldsEditor() {
    setEmptyStateMetricsMetaFieldsEditorOpen(!emptyStateMetricsMetaFieldsEditorOpen());
  }

  function formatEmptyStateMetricsMetaFieldValue(id, report) {
    report = report || emptyStateMetricsReportMeta();
    if (id === 'projectName') return report.projectName ? String(report.projectName) : '';
    if (id === 'verdict') return report.verdict ? String(report.verdict) : '';
    if (id === 'generatedAt') {
      var when = report.generatedAtISO || report.generatedAt || '';
      if (!when) return '';
      when = String(when);
      if (when.length >= 19) when = when.slice(0, 19).replace('T', ' ');
      return when;
    }
    if (id === 'projectRoot') return shortenEmptyStateMetricsProjectRoot(report.projectRoot);
    if (id === 'hostName') return report.hostName ? String(report.hostName) : '';
    if (id === 'pluginVersion') return report.pluginVersion ? ('plugin ' + String(report.pluginVersion)) : '';
    if (id === 'environment') return report.environment ? String(report.environment) : '';
    if (id === 'duration') return report.duration ? String(report.duration) : '';
    return '';
  }

  function formatEmptyStateMetricsMetaFieldGroup(group) {
    var prefs = getEmptyStateMetricsMetaFieldPrefs();
    var ids = group === 'secondary' ? prefs.secondary : prefs.primary;
    var report = emptyStateMetricsReportMeta();
    var parts = [];
    (ids || []).forEach(function (id) {
      var v = formatEmptyStateMetricsMetaFieldValue(id, report);
      if (v) parts.push(v);
    });
    return parts.join(' · ');
  }

  function formatEmptyStateMetricsReportSummaryPrimary() {
    return formatEmptyStateMetricsMetaFieldGroup('primary');
  }

  function formatEmptyStateMetricsReportSummarySecondary() {
    return formatEmptyStateMetricsMetaFieldGroup('secondary');
  }

  function formatEmptyStateMetricsReportSummary() {
    var primary = formatEmptyStateMetricsReportSummaryPrimary();
    var secondary = formatEmptyStateMetricsReportSummarySecondary();
    if (!secondary) return primary;
    return primary ? (primary + ' · ' + secondary) : secondary;
  }

  function setEmptyStateMetricsMetaFieldGroup(id, group) {
    id = String(id || '');
    group = String(group || 'hidden');
    if (group !== 'primary' && group !== 'secondary' && group !== 'hidden') group = 'hidden';
    var prefs = getEmptyStateMetricsMetaFieldPrefs();
    prefs.primary = (prefs.primary || []).filter(function (x) { return x !== id; });
    prefs.secondary = (prefs.secondary || []).filter(function (x) { return x !== id; });
    if (group === 'primary') prefs.primary.push(id);
    if (group === 'secondary') prefs.secondary.push(id);
    return setEmptyStateMetricsMetaFieldPrefs(prefs);
  }

  function moveEmptyStateMetricsMetaField(id, delta) {
    id = String(id || '');
    delta = delta < 0 ? -1 : 1;
    var prefs = getEmptyStateMetricsMetaFieldPrefs();
    var list = null;
    if ((prefs.primary || []).indexOf(id) >= 0) list = prefs.primary;
    else if ((prefs.secondary || []).indexOf(id) >= 0) list = prefs.secondary;
    else return prefs;
    var i = list.indexOf(id);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return prefs;
    var tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
    return setEmptyStateMetricsMetaFieldPrefs(prefs);
  }

  function syncEmptyStateMetricsMetaPresetToolbarChip() {
    var chip = document.getElementById('overview-empty-state-metrics-meta-preset-chip');
    var resetBtn = document.getElementById('overview-empty-state-metrics-meta-preset-reset');
    if (!chip) return;
    var activeId = '';
    var preset = null;
    try {
      activeId = getActiveEmptyStateMetricsMetaFieldNamedPresetId() || '';
      if (activeId) preset = findEmptyStateMetricsMetaFieldNamedPreset(activeId);
    } catch (e) {}
    var name = preset && preset.name ? preset.name : (activeId && activeId !== 'default' ? activeId : '默认');
    var isDefault = !activeId || activeId === 'default';
    chip.dataset.namedPreset = isDefault ? 'default' : activeId;
    chip.textContent = '预设·' + name;
    chip.title = isDefault
      ? '当前 meta 字段命名预设：默认；点击循环切换；Shift+点击打开字段编辑器；右键/↓/Alt+点击打开预设菜单'
      : ('当前 meta 字段命名预设：' + name + '；点击循环切换；Shift+点击打开字段编辑器；右键/↓/Alt+点击打开预设菜单');
    chip.setAttribute('aria-label', chip.title);
    chip.setAttribute('aria-haspopup', 'menu');
    if (!chip.hasAttribute('aria-expanded')) chip.setAttribute('aria-expanded', 'false');
    chip.classList.toggle('is-custom', !isDefault);
    if (resetBtn) {
      if (isDefault) {
        resetBtn.setAttribute('hidden', '');
        resetBtn.setAttribute('aria-hidden', 'true');
      } else {
        resetBtn.removeAttribute('hidden');
        resetBtn.setAttribute('aria-hidden', 'false');
        resetBtn.title = '一键切回默认命名预设（当前：' + name + '）';
      }
    }
  }

  function openEmptyStateMetricsMetaFieldsEditor() {
    try { closeEmptyStateMetricsMetaPresetMenu(); } catch (eClose) {}
    setEmptyStateMetricsMetaFieldsEditorOpen(true);
    syncEmptyStateMetricsMetaPresetToolbarChip();
  }

  function emptyStateMetricsMetaFieldLabel(id) {
    id = String(id || '');
    for (var i = 0; i < EMPTY_STATE_METRICS_META_FIELD_DEFS.length; i++) {
      if (EMPTY_STATE_METRICS_META_FIELD_DEFS[i].id === id) return EMPTY_STATE_METRICS_META_FIELD_DEFS[i].label;
    }
    return id;
  }

  function formatEmptyStateMetricsMetaFieldIdList(ids) {
    var labels = [];
    (ids || []).forEach(function (id) {
      var label = emptyStateMetricsMetaFieldLabel(id);
      if (label) labels.push(label);
    });
    return labels.length ? labels.join(' · ') : '（无）';
  }

  function describeEmptyStateMetricsMetaFieldNamedPreset(preset) {
    if (!preset) return '';
    var primary = formatEmptyStateMetricsMetaFieldIdList(preset.primary);
    var secondary = formatEmptyStateMetricsMetaFieldIdList(preset.secondary);
    return '主 ' + primary + '；次 ' + secondary;
  }

  function emptyStateMetricsMetaPresetMenuIsOpen() {
    var menu = document.getElementById('overview-empty-state-metrics-meta-preset-menu');
    return !!(menu && !menu.hasAttribute('hidden'));
  }

  function emptyStateMetricsMetaPresetMenuItems() {
    var menu = document.getElementById('overview-empty-state-metrics-meta-preset-menu');
    if (!menu || menu.hasAttribute('hidden')) return [];
    return Array.prototype.slice.call(menu.querySelectorAll('[role="menuitemradio"], [role="menuitem"]'));
  }

  function focusEmptyStateMetricsMetaPresetMenuItem(index) {
    var items = emptyStateMetricsMetaPresetMenuItems();
    if (!items.length) return null;
    var i = ((index % items.length) + items.length) % items.length;
    var el = items[i];
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (e) {}
    }
    return el;
  }

  function navigateEmptyStateMetricsMetaPresetMenu(ev) {
    if (!emptyStateMetricsMetaPresetMenuIsOpen()) return false;
    var items = emptyStateMetricsMetaPresetMenuItems();
    if (!items.length) return false;
    var current = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i] === document.activeElement) { current = i; break; }
    }
    if (ev.key === 'ArrowDown' || ev.key === 'Down') {
      ev.preventDefault();
      focusEmptyStateMetricsMetaPresetMenuItem(current < 0 ? 0 : current + 1);
      return true;
    }
    if (ev.key === 'ArrowUp' || ev.key === 'Up') {
      ev.preventDefault();
      focusEmptyStateMetricsMetaPresetMenuItem(current < 0 ? items.length - 1 : current - 1);
      return true;
    }
    if (ev.key === 'Home') {
      ev.preventDefault();
      focusEmptyStateMetricsMetaPresetMenuItem(0);
      return true;
    }
    if (ev.key === 'End') {
      ev.preventDefault();
      focusEmptyStateMetricsMetaPresetMenuItem(items.length - 1);
      return true;
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (current >= 0 && items[current]) {
        ev.preventDefault();
        items[current].click();
        return true;
      }
    }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      focusEmptyStateMetricsMetaPresetMenuItem(ev.shiftKey
        ? (current < 0 ? items.length - 1 : current - 1)
        : (current < 0 ? 0 : current + 1));
      return true;
    }
    return false;
  }

  function closeEmptyStateMetricsMetaPresetMenu() {
    var menu = document.getElementById('overview-empty-state-metrics-meta-preset-menu');
    if (!menu) return;
    menu.setAttribute('hidden', '');
    menu.setAttribute('aria-hidden', 'true');
    menu.innerHTML = '';
    var chip = document.getElementById('overview-empty-state-metrics-meta-preset-chip');
    if (chip) chip.setAttribute('aria-expanded', 'false');
  }

  function openEmptyStateMetricsMetaPresetMenu(anchor, opts) {
    opts = opts || {};
    var chip = anchor || document.getElementById('overview-empty-state-metrics-meta-preset-chip');
    if (!chip) return null;
    var menu = document.getElementById('overview-empty-state-metrics-meta-preset-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'overview-empty-state-metrics-meta-preset-menu';
      menu.className = 'overview-empty-state-metrics-meta-preset-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', '命名字段预设');
      document.body.appendChild(menu);
    }
    var activeId = getActiveEmptyStateMetricsMetaFieldNamedPresetId() || 'default';
    var listed = listEmptyStateMetricsMetaFieldNamedPresets();
    var html = '';
    listed.forEach(function (p) {
      var active = p.id === activeId;
      var summary = describeEmptyStateMetricsMetaFieldNamedPreset(p);
      var tip = (p.builtin ? '内置预设' : '自定义预设') + '：' + p.name + (summary ? ('；' + summary) : '');
      html += '<button type="button" role="menuitemradio" class="overview-empty-state-metrics-meta-preset-menu-item' + (active ? ' is-active' : '') + '" data-action="apply-empty-state-metrics-meta-field-named" data-named-preset="' + p.id + '" aria-checked="' + (active ? 'true' : 'false') + '" title="' + tip + '" aria-description="' + tip + '">';
      html += '<span class="overview-empty-state-metrics-meta-preset-menu-item-name">' + p.name + (active ? ' ✓' : '') + '</span>';
      if (summary) html += '<span class="overview-empty-state-metrics-meta-preset-menu-item-summary">' + summary + '</span>';
      html += '</button>';
    });
    html += '<button type="button" role="menuitem" class="overview-empty-state-metrics-meta-preset-menu-item overview-empty-state-metrics-meta-preset-menu-edit" data-action="open-empty-state-metrics-meta-fields" title="打开字段编辑器">字段编辑器…</button>';
    menu.innerHTML = html;
    menu.removeAttribute('hidden');
    menu.setAttribute('aria-hidden', 'false');
    chip.setAttribute('aria-expanded', 'true');
    chip.setAttribute('aria-haspopup', 'menu');
    var rect = chip.getBoundingClientRect();
    var left = typeof opts.x === 'number' ? opts.x : rect.left;
    var top = typeof opts.y === 'number' ? opts.y : (rect.bottom + 4);
    menu.style.left = Math.max(8, Math.min(left, window.innerWidth - 180)) + 'px';
    menu.style.top = Math.max(8, Math.min(top, window.innerHeight - 40)) + 'px';
    var first = menu.querySelector('[role="menuitemradio"], [role="menuitem"]');
    if (first && typeof first.focus === 'function') {
      try { first.focus(); } catch (e) {}
    }
    return menu;
  }

  function cycleEmptyStateMetricsMetaFieldNamedPreset(delta) {
    var list = listEmptyStateMetricsMetaFieldNamedPresets();
    if (!list || !list.length) return null;
    var step = Number(delta);
    if (!step || !isFinite(step)) step = 1;
    var activeId = getActiveEmptyStateMetricsMetaFieldNamedPresetId() || 'default';
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === activeId) { idx = i; break; }
    }
    if (idx < 0) idx = 0;
    var next = list[(idx + step % list.length + list.length) % list.length];
    if (!next) return null;
    return applyEmptyStateMetricsMetaFieldNamedPreset(next.id);
  }

  function activateEmptyStateMetricsMetaPresetChip(ev) {
    if (ev && ev.shiftKey) {
      openEmptyStateMetricsMetaFieldsEditor();
      return { openedEditor: true };
    }
    if (ev && (ev.altKey || ev.metaKey)) {
      openEmptyStateMetricsMetaPresetMenu(document.getElementById('overview-empty-state-metrics-meta-preset-chip'));
      return { openedMenu: true };
    }
    return cycleEmptyStateMetricsMetaFieldNamedPreset(1);
  }

  function resetEmptyStateMetricsMetaFieldNamedPresetToDefault() {
    return applyEmptyStateMetricsMetaFieldNamedPreset('default');
  }

  function syncEmptyStateMetricsMetaFieldsEditor() {
    var el = document.getElementById('overview-empty-state-metrics-meta-fields');
    var btn = document.querySelector('#overview-empty-state-metrics [data-action="toggle-empty-state-metrics-meta-fields"]');
    if (!el) return;
    var open = emptyStateMetricsMetaFieldsEditorOpen();
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? '字段▴' : '字段';
    }
    if (!open) {
      el.setAttribute('hidden', '');
      el.innerHTML = '';
      return;
    }
    var prefs = getEmptyStateMetricsMetaFieldPrefs();
    var groupOf = {};
    (prefs.primary || []).forEach(function (id) { groupOf[id] = 'primary'; });
    (prefs.secondary || []).forEach(function (id) { groupOf[id] = 'secondary'; });
    var activeNamed = getActiveEmptyStateMetricsMetaFieldNamedPresetId();
    var named = listEmptyStateMetricsMetaFieldNamedPresets();
    var html = '';
    html += '<div class="overview-empty-state-metrics-meta-fields-named" role="group" aria-label="命名字段预设">';
    html += '<span class="overview-empty-state-metrics-meta-fields-named-label">预设</span>';
    named.forEach(function (p) {
      var active = p.id === activeNamed;
      html += '<button type="button" class="action-btn action-btn-tiny overview-empty-state-metrics-meta-fields-named-chip' + (active ? ' is-active' : '') + '" data-action="apply-empty-state-metrics-meta-field-named" data-named-preset="' + p.id + '" aria-pressed="' + (active ? 'true' : 'false') + '" title="' + (p.builtin ? '内置预设' : '自定义预设') + '：' + p.name + '">' + p.name + '</button>';
    });
    html += '<button type="button" class="action-btn action-btn-tiny" data-action="save-empty-state-metrics-meta-field-named" title="将当前字段配置另存为命名预设">另存为</button>';
    html += '<button type="button" class="action-btn action-btn-tiny" data-action="delete-empty-state-metrics-meta-field-named" title="删除当前选中的自定义命名预设（内置不可删）">删除预设</button>';
    html += '<button type="button" class="action-btn action-btn-tiny" data-action="copy-empty-state-metrics-meta-field-named-json" title="复制自定义命名预设库 JSON">复制库</button>';
    html += '<button type="button" class="action-btn action-btn-tiny" data-action="import-empty-state-metrics-meta-field-named-json" title="导入自定义命名预设库 JSON">导入库</button>';
    html += '</div>';
    EMPTY_STATE_METRICS_META_FIELD_DEFS.forEach(function (def) {
      var g = groupOf[def.id] || 'hidden';
      html += '<div class="overview-empty-state-metrics-meta-fields-row" data-meta-field="' + def.id + '">';
      html += '<span class="overview-empty-state-metrics-meta-fields-label">' + def.label + '</span>';
      html += '<select data-action="set-empty-state-metrics-meta-field-group" data-meta-field="' + def.id + '" title="主=常显；次=meta+；隐=不显示">';
      html += '<option value="primary"' + (g === 'primary' ? ' selected' : '') + '>主</option>';
      html += '<option value="secondary"' + (g === 'secondary' ? ' selected' : '') + '>次</option>';
      html += '<option value="hidden"' + (g === 'hidden' ? ' selected' : '') + '>隐</option>';
      html += '</select>';
      html += '<button type="button" class="action-btn action-btn-tiny" data-action="move-empty-state-metrics-meta-field" data-meta-field="' + def.id + '" data-delta="-1" title="同组上移">↑</button>';
      html += '<button type="button" class="action-btn action-btn-tiny" data-action="move-empty-state-metrics-meta-field" data-meta-field="' + def.id + '" data-delta="1" title="同组下移">↓</button>';
      html += '</div>';
    });
    html += '<div class="overview-empty-state-metrics-meta-fields-actions">';
    html += '<button type="button" class="action-btn action-btn-tiny" data-action="copy-empty-state-metrics-meta-fields-json" title="复制当前 meta 字段预设 JSON（便于团队共享）">复制预设</button>';
    html += '<button type="button" class="action-btn action-btn-tiny" data-action="download-empty-state-metrics-meta-fields-json" title="下载 meta 字段预设 JSON 文件">下载预设</button>';
    html += '<button type="button" class="action-btn action-btn-tiny" data-action="import-empty-state-metrics-meta-fields-json" title="粘贴/导入 meta 字段预设 JSON">导入预设</button>';
    html += '<button type="button" class="action-btn action-btn-tiny" data-action="reset-empty-state-metrics-meta-fields" title="恢复默认主三项（项目·结论·时间）">恢复默认</button>';
    html += '</div>';
    el.innerHTML = html;
    el.removeAttribute('hidden');
    try { syncEmptyStateMetricsMetaPresetToolbarChip(); } catch (eChip) {}
  }

  function readEmptyMetricsMetaMoreFromQuery() {
    try {
      var q = String(location.search || '');
      var m = q.match(/[?&](?:emptyMetricsMeta|empty-metrics-meta)=([^&#]*)/i);
      if (!m) return null;
      var raw = decodeURIComponent(String(m[1] || '').replace(/\+/g, ' ')).toLowerCase();
      if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on' || raw === 'expanded') return true;
      if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off' || raw === 'collapsed') return false;
      return null;
    } catch (e) {
      return null;
    }
  }

  function applyEmptyMetricsMetaMoreFromQuery() {
    var fromQ = readEmptyMetricsMetaMoreFromQuery();
    if (fromQ === null) return emptyStateMetricsMetaMoreExpanded();
    setEmptyStateMetricsMetaMoreExpanded(fromQ);
    return emptyStateMetricsMetaMoreExpanded();
  }

  function stripEmptyMetricsMetaFromLocation() {
    try {
      var href = String(location.href || '');
      var hashIdx = href.indexOf('#');
      var base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      var hash = hashIdx >= 0 ? href.slice(hashIdx) : '';
      var qIdx = base.indexOf('?');
      if (qIdx < 0) return false;
      var path = base.slice(0, qIdx);
      var params = new URLSearchParams(base.slice(qIdx + 1));
      var had = params.has('emptyMetricsMeta') || params.has('empty-metrics-meta');
      if (!had) return false;
      params.delete('emptyMetricsMeta');
      params.delete('empty-metrics-meta');
      var qs = params.toString();
      history.replaceState(null, '', path + (qs ? ('?' + qs) : '') + hash);
      return true;
    } catch (e) {
      return false;
    }
  }

  function syncEmptyMetricsMetaInLocation(expanded) {
    try {
      var href = String(location.href || '');
      var hashIdx = href.indexOf('#');
      var base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      var hash = hashIdx >= 0 ? href.slice(hashIdx) : '';
      var qIdx = base.indexOf('?');
      var path = qIdx >= 0 ? base.slice(0, qIdx) : base;
      var params = new URLSearchParams(qIdx >= 0 ? base.slice(qIdx + 1) : '');
      params.delete('empty-metrics-meta');
      if (expanded) params.set('emptyMetricsMeta', '1');
      else params.delete('emptyMetricsMeta');
      var qs = params.toString();
      history.replaceState(null, '', path + (qs ? ('?' + qs) : '') + hash);
      return true;
    } catch (e) {
      return false;
    }
  }

  function emptyStateMetricsMetaMoreExpanded() {
    try {
      var ls = localStorage.getItem('studio-report-empty-metrics-meta-more');
      return ls === '1' || ls === 'true' || ls === 'expanded';
    } catch (e) {
      return false;
    }
  }

  function setEmptyStateMetricsMetaMoreExpanded(on) {
    try {
      localStorage.setItem('studio-report-empty-metrics-meta-more', on ? '1' : '0');
    } catch (e) {}
    try { syncEmptyMetricsMetaInLocation(!!on); } catch (e2) {}
    syncEmptyStateMetricsPanel();
    try { syncEmptyMetricsEnableURLButtons(); } catch (e3) {}
  }

  function toggleEmptyStateMetricsMetaMore() {
    setEmptyStateMetricsMetaMoreExpanded(!emptyStateMetricsMetaMoreExpanded());
  }


  function copyEmptyStateMetricsReportSummary() {
    var text = formatEmptyStateMetricsReportSummary();
    if (!text) {
      flashStatus('无报告 meta 可复制');
      return Promise.reject(new Error('empty report meta'));
    }
    return copyText(text).then(function () {
      flashStatus('已复制报告 meta：' + text);
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  function formatEmptyStateMetricsPanel() {
    var head = formatEmptyStateMetricsReportSummaryPrimary();
    var counts = '空态计数 · clear=' + (emptyStateMetrics.clear || 0) +
      ' esc=' + (emptyStateMetrics.escClear || 0) +
      ' failOnly=' + (emptyStateMetrics.restoreFailOnly || 0) +
      ' undo=' + (emptyStateMetrics.undo || 0) +
      ' ctrlZ=' + (emptyStateMetrics.ctrlZUndo || 0);
    return head ? (head + ' | ' + counts) : counts;
  }

  function emptyStateMetricsEventsExpanded() {
    try {
      var ls = localStorage.getItem('studio-report-empty-metrics-events');
      return ls === '1' || ls === 'true' || ls === 'expanded';
    } catch (e) {
      return false;
    }
  }

  function setEmptyStateMetricsEventsExpanded(on) {
    try {
      localStorage.setItem('studio-report-empty-metrics-events', on ? '1' : '0');
    } catch (e) {}
    syncEmptyStateMetricsEvents();
  }

  function toggleEmptyStateMetricsEvents() {
    setEmptyStateMetricsEventsExpanded(!emptyStateMetricsEventsExpanded());
  }

  function formatEmptyStateMetricsEventLine(entry) {
    var kind = entry && entry.kind ? String(entry.kind) : '?';
    var when = '';
    try {
      if (entry && entry.at) when = new Date(entry.at).toISOString().slice(11, 19);
    } catch (e) {}
    var detail = '';
    try {
      if (entry && entry.detail != null) {
        detail = typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail);
        if (detail.length > 80) detail = detail.slice(0, 77) + '…';
      }
    } catch (e2) {}
    return (when ? (when + ' ') : '') + kind + (detail ? (' · ' + detail) : '');
  }

  var EMPTY_STATE_EVENT_KIND_LABELS = {
    clear: 'clear',
    escClear: 'esc',
    restoreFailOnly: 'failOnly',
    undo: 'undo',
    ctrlZUndo: 'ctrlZ'
  };

  function emptyStateMetricsEventKindFilter() {
    try {
      var v = localStorage.getItem('studio-report-empty-metrics-event-kind');
      return v ? String(v) : '';
    } catch (e) {
      return '';
    }
  }

  function setEmptyStateMetricsEventKindFilter(kind) {
    var next = kind ? String(kind) : '';
    if (next && !EMPTY_STATE_EVENT_KIND_LABELS[next]) next = '';
    try {
      if (next) localStorage.setItem('studio-report-empty-metrics-event-kind', next);
      else localStorage.removeItem('studio-report-empty-metrics-event-kind');
    } catch (e) {}
    syncEmptyStateMetricsEvents();
    try { syncEmptyMetricsEnableURLButtons(); } catch (e2) {}
    return emptyStateMetricsEventKindFilter();
  }

  function stripEmptyMetricsKindFromLocation() {
    try {
      var href = String(location.href || '');
      var hashIdx = href.indexOf('#');
      var base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      var hash = hashIdx >= 0 ? href.slice(hashIdx) : '';
      var qIdx = base.indexOf('?');
      if (qIdx < 0) return false;
      var path = base.slice(0, qIdx);
      var params = new URLSearchParams(base.slice(qIdx + 1));
      var had = params.has('emptyMetricsKind') || params.has('empty-metrics-kind');
      if (!had) return false;
      params.delete('emptyMetricsKind');
      params.delete('empty-metrics-kind');
      var qs = params.toString();
      history.replaceState(null, '', path + (qs ? ('?' + qs) : '') + hash);
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearEmptyStateMetricsEventKindFilter() {
    var prev = emptyStateMetricsEventKindFilter();
    setEmptyStateMetricsEventKindFilter('');
    var stripped = stripEmptyMetricsKindFromLocation();
    if (prev || stripped) {
      flashStatus('已清除事件 kind 过滤' + (prev ? ('（原 ' + prev + '）') : ''));
    } else {
      flashStatus('当前无 kind 过滤');
    }
    return emptyStateMetricsEventKindFilter();
  }

  function syncEmptyStateMetricsCollapsedKindClear(kindFilter, expanded) {
    var clearBtn = document.querySelector(
      '#overview-empty-state-metrics [data-action="clear-empty-state-metrics-event-kind-collapsed"]'
    );
    if (!clearBtn) return;
    var show = !!kindFilter && !expanded;
    if (show) {
      clearBtn.removeAttribute('hidden');
      clearBtn.setAttribute('aria-hidden', 'false');
      clearBtn.removeAttribute('tabindex');
      var label = EMPTY_STATE_EVENT_KIND_LABELS[kindFilter] || kindFilter;
      clearBtn.title = '清除 kind 过滤（当前 ' + label + '；无需展开；同步去掉 URL emptyMetricsKind）';
    } else {
      clearBtn.setAttribute('hidden', '');
      clearBtn.setAttribute('aria-hidden', 'true');
      clearBtn.setAttribute('tabindex', '-1');
    }
  }

  function syncEmptyStateMetricsEvents() {
    var listEl = document.getElementById('overview-empty-state-metrics-events');
    var toggleBtn = document.querySelector(
      '#overview-empty-state-metrics [data-action="toggle-empty-state-metrics-events"]'
    );
    var n = emptyStateEvents.length;
    var expanded = emptyStateMetricsEventsExpanded();
    var kindFilter = emptyStateMetricsEventKindFilter();
    if (toggleBtn) {
      var kindLabel = kindFilter ? (EMPTY_STATE_EVENT_KIND_LABELS[kindFilter] || kindFilter) : '';
      // Collapsed (and expanded) show active kind so filters stay visible when the ring is folded.
      var kindPart = kindLabel ? (' · ' + kindLabel) : '';
      toggleBtn.textContent = '事件(' + n + ')' + kindPart + (expanded ? ' ▾' : ' ▸');
      toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (kindFilter) toggleBtn.setAttribute('data-kind-filter', kindFilter);
      else toggleBtn.removeAttribute('data-kind-filter');
      toggleBtn.title = expanded
        ? ('折叠事件环' + (kindLabel ? ('（当前 kind=' + kindLabel + '）') : '（减少噪音）'))
        : ('展开事件环' + (kindLabel ? ('（已过滤 kind=' + kindLabel + '）') : '（默认折叠）'));
    }
    syncEmptyStateMetricsCollapsedKindClear(kindFilter, expanded);
    if (!listEl) return;
    if (!expanded) {
      listEl.setAttribute('hidden', '');
      listEl.innerHTML = '';
      return;
    }
    listEl.removeAttribute('hidden');
    if (!n) {
      var emptyHtml = '';
      if (kindFilter) {
        var emptyLabel = EMPTY_STATE_EVENT_KIND_LABELS[kindFilter] || kindFilter;
        emptyHtml = '<div class="overview-empty-state-metrics-event-kinds" role="toolbar" aria-label="按事件类型过滤">' +
          '<button type="button" class="overview-empty-state-metrics-event-kind overview-empty-state-metrics-event-kind-clear"' +
          ' data-action="clear-empty-state-metrics-event-kind" title="清除 kind 过滤，并去掉 URL 中的 emptyMetricsKind">清除过滤</button>' +
          '<button type="button" class="overview-empty-state-metrics-event-kind"' +
          ' data-action="filter-empty-state-metrics-event-kind" data-kind="" title="显示全部事件">显示全部</button>' +
          '</div>' +
          '<div class="overview-empty-state-metrics-events-empty" role="status">' +
          '当前 kind（' + escapeHTML(emptyLabel) + '）无事件。</div>';
      } else {
        emptyHtml = '<div class="overview-empty-state-metrics-events-empty">暂无事件</div>';
      }
      listEl.innerHTML = emptyHtml;
      var emptyPanel = document.getElementById('overview-empty-state-metrics');
      if (emptyPanel && !emptyPanel.hasAttribute('hidden')) {
        syncEmptyStateMetricsPanelButtons(emptyPanel, true);
      }
      return;
    }
    var kindCounts = {};
    var i;
    for (i = 0; i < emptyStateEvents.length; i++) {
      var k = emptyStateEvents[i] && emptyStateEvents[i].kind
        ? String(emptyStateEvents[i].kind)
        : '';
      if (k) kindCounts[k] = (kindCounts[k] || 0) + 1;
    }
    var html = '<div class="overview-empty-state-metrics-event-kinds" role="toolbar" aria-label="按事件类型过滤">';
    html += '<button type="button" class="overview-empty-state-metrics-event-kind' +
      (!kindFilter ? ' is-active' : '') +
      '" data-action="filter-empty-state-metrics-event-kind" data-kind="" title="显示全部事件">全部(' +
      n + ')</button>';
    Object.keys(EMPTY_STATE_EVENT_KIND_LABELS).forEach(function (kind) {
      var count = kindCounts[kind] || 0;
      if (!count) return;
      var label = EMPTY_STATE_EVENT_KIND_LABELS[kind] || kind;
      html += '<button type="button" class="overview-empty-state-metrics-event-kind' +
        (kindFilter === kind ? ' is-active' : '') +
        '" data-action="filter-empty-state-metrics-event-kind" data-kind="' + kind +
        '" title="仅显示 ' + label + ' 事件">' + label + '(' + count + ')</button>';
    });
    if (kindFilter) {
      html += '<button type="button" class="overview-empty-state-metrics-event-kind overview-empty-state-metrics-event-kind-clear"' +
        ' data-action="clear-empty-state-metrics-event-kind"' +
        ' title="清除 kind 过滤，并去掉 URL 中的 emptyMetricsKind">清除过滤</button>';
    }
    html += '</div>';
    var visibleIdxs = visibleEmptyStateMetricsEventIndexes();
    var shown = visibleIdxs.length;
    html += '<div class="overview-empty-state-metrics-event-actions">';
    html += '<button type="button" class="overview-empty-state-metrics-event-kind' +
      (!shown ? ' is-disabled' : '') +
      '" data-action="copy-empty-state-metrics-visible-events"' +
      (shown ? '' : ' disabled') +
      ' title="复制当前可见事件行（尊重 kind 过滤）">复制可见(' + shown + ')</button>';
    html += '<button type="button" class="overview-empty-state-metrics-event-kind' +
      (!shown ? ' is-disabled' : '') +
      '" data-action="copy-empty-state-metrics-visible-json"' +
      (shown ? '' : ' disabled') +
      ' title="复制仅含当前可见事件的 JSON（尊重 kind 过滤；可贴 issue）">可见 JSON(' + shown + ')</button>';
    html += '</div>';
    html += '<ol class="overview-empty-state-metrics-events-list">';
    var vi;
    for (vi = 0; vi < visibleIdxs.length; vi++) {
      var i = visibleIdxs[vi];
      var entry = emptyStateEvents[i];
      var line = formatEmptyStateMetricsEventLine(entry);
      html += '<li><button type="button" class="overview-empty-state-metrics-event-line"' +
        ' data-action="copy-empty-state-metrics-event" data-event-index="' + i + '"' +
        ' title="复制本行事件（可贴 issue）">' +
        escapeHTML(line) +
        '</button></li>';
    }
    html += '</ol>';
    if (!shown) {
      if (kindFilter) {
        var kindLabel = EMPTY_STATE_EVENT_KIND_LABELS[kindFilter] || kindFilter;
        html += '<div class="overview-empty-state-metrics-events-empty" role="status">' +
          '当前 kind（' + escapeHTML(kindLabel) + '）无事件。' +
          '<button type="button" class="overview-empty-state-metrics-event-kind overview-empty-state-metrics-event-kind-clear"' +
          ' data-action="clear-empty-state-metrics-event-kind" title="清除 kind 过滤">清除过滤</button>' +
          '<button type="button" class="overview-empty-state-metrics-event-kind"' +
          ' data-action="filter-empty-state-metrics-event-kind" data-kind="" title="显示全部事件">显示全部</button>' +
          '</div>';
      } else {
        html += '<div class="overview-empty-state-metrics-events-empty">暂无事件</div>';
      }
    }
    listEl.innerHTML = html;
    // Newly rendered event buttons inherit panel keyboard policy.
    var panel = document.getElementById('overview-empty-state-metrics');
    if (panel && !panel.hasAttribute('hidden')) {
      syncEmptyStateMetricsPanelButtons(panel, true);
    }
  }

  function copyEmptyStateMetricsEventLine(index) {
    var i = typeof index === 'number' ? index : parseInt(String(index), 10);
    if (!isFinite(i) || i < 0 || i >= emptyStateEvents.length) {
      flashStatus('事件行无效或已过期，请展开后重试');
      return Promise.reject(new Error('bad event index'));
    }
    var text = formatEmptyStateMetricsEventLine(emptyStateEvents[i]);
    return copyText(text).then(function () {
      var preview = text.length > 64 ? (text.slice(0, 61) + '…') : text;
      flashStatus('已复制事件行：' + preview);
    }).catch(function () {
      flashStatus('复制事件行失败，请检查剪贴板权限');
    });
  }

  function visibleEmptyStateMetricsEventIndexes() {
    var kindFilter = emptyStateMetricsEventKindFilter();
    var out = [];
    var i;
    for (i = 0; i < emptyStateEvents.length; i++) {
      var entryKind = emptyStateEvents[i] && emptyStateEvents[i].kind
        ? String(emptyStateEvents[i].kind)
        : '';
      if (kindFilter && entryKind !== kindFilter) continue;
      out.push(i);
    }
    return out;
  }

  function formatEmptyStateMetricsVisibleEventLines() {
    var idxs = visibleEmptyStateMetricsEventIndexes();
    var lines = [];
    var i;
    for (i = 0; i < idxs.length; i++) {
      lines.push(formatEmptyStateMetricsEventLine(emptyStateEvents[idxs[i]]));
    }
    return lines.join('\n');
  }

  function copyEmptyStateMetricsVisibleEventLines() {
    var text = formatEmptyStateMetricsVisibleEventLines();
    if (!text) {
      flashStatus('当前无可见事件可复制');
      return Promise.reject(new Error('no visible events'));
    }
    var n = text.split('\n').length;
    return copyText(text + '\n').then(function () {
      flashStatus('已复制可见事件 ' + n + ' 行（可贴 issue）');
    }).catch(function () {
      flashStatus('复制可见事件失败，请检查剪贴板权限');
    });
  }

  function escapeHTML(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function snapshotEmptyStateMetrics() {
    return {
      clear: emptyStateMetrics.clear || 0,
      restoreFailOnly: emptyStateMetrics.restoreFailOnly || 0,
      undo: emptyStateMetrics.undo || 0,
      escClear: emptyStateMetrics.escClear || 0,
      ctrlZUndo: emptyStateMetrics.ctrlZUndo || 0,
      events: emptyStateEvents.slice()
    };
  }

  function readEmptyStateMetricsLocalStorage() {
    try {
      return localStorage.getItem('studio-report-empty-metrics');
    } catch (e) {
      return null;
    }
  }

  function emptyStateMetricsPanelSnapshot() {
    var windowFlag = null;
    try {
      if (window.StudioReportShowEmptyStateMetrics === true) windowFlag = true;
      else if (window.StudioReportShowEmptyStateMetrics === false) windowFlag = false;
    } catch (e) {}
    var query = null;
    try {
      var q = String(location.search || '');
      if (/[?&]emptyMetrics=1(?:&|$)/i.test(q) || /[?&]empty-metrics=1(?:&|$)/i.test(q)) query = '1';
      else if (/[?&]emptyMetrics=0(?:&|$)/i.test(q) || /[?&]empty-metrics=0(?:&|$)/i.test(q)) query = '0';
    } catch (e2) {}
    return {
      enabled: emptyStateMetricsPanelEnabled(),
      windowFlag: windowFlag,
      query: query,
      localStorage: readEmptyStateMetricsLocalStorage()
    };
  }


  function readStudioReportMeta() {
    try {
      var el = document.getElementById('studio-report-meta');
      if (!el) return null;
      var raw = String(el.textContent || el.innerText || '').trim();
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function emptyStateMetricsReportMeta() {
    var meta = readStudioReportMeta() || {};
    return {
      projectName: meta.projectName || '',
      verdict: meta.verdict || '',
      failed: !!meta.failed,
      environment: meta.environment || '',
      timestamp: meta.timestamp || '',
      timestampISO: meta.timestampISO || '',
      duration: meta.duration || '',
      pluginVersion: meta.pluginVersion || '',
      formatVersion: meta.formatVersion || 0,
      hostName: meta.hostName || '',
      generatedAt: meta.generatedAt || '',
      generatedAtISO: meta.generatedAtISO || '',
      projectRoot: meta.projectRoot || ''
    };
  }

  function formatEmptyStateMetricsJSON() {
    var payload = {
      kind: 'studio-report-empty-state-metrics',
      exportedAt: new Date().toISOString(),
      href: '',
      report: emptyStateMetricsReportMeta(),
      panel: emptyStateMetricsPanelSnapshot(),
      eventKindFilter: emptyStateMetricsEventKindFilter() || null,
      counts: {
        clear: emptyStateMetrics.clear || 0,
        escClear: emptyStateMetrics.escClear || 0,
        restoreFailOnly: emptyStateMetrics.restoreFailOnly || 0,
        undo: emptyStateMetrics.undo || 0,
        ctrlZUndo: emptyStateMetrics.ctrlZUndo || 0
      },
      events: emptyStateEvents.slice()
    };
    try { payload.href = String(location.href || ''); } catch (e) {}
    return JSON.stringify(payload, null, 2);
  }

  function formatEmptyStateMetricsVisibleJSON() {
    var idxs = visibleEmptyStateMetricsEventIndexes();
    var events = [];
    var i;
    for (i = 0; i < idxs.length; i++) {
      events.push(emptyStateEvents[idxs[i]]);
    }
    var payload = {
      kind: 'studio-report-empty-state-metrics-visible',
      exportedAt: new Date().toISOString(),
      href: '',
      report: emptyStateMetricsReportMeta(),
      panel: emptyStateMetricsPanelSnapshot(),
      eventKindFilter: emptyStateMetricsEventKindFilter() || null,
      visibleCount: events.length,
      totalCount: emptyStateEvents.length,
      counts: {
        clear: emptyStateMetrics.clear || 0,
        escClear: emptyStateMetrics.escClear || 0,
        restoreFailOnly: emptyStateMetrics.restoreFailOnly || 0,
        undo: emptyStateMetrics.undo || 0,
        ctrlZUndo: emptyStateMetrics.ctrlZUndo || 0
      },
      events: events
    };
    try { payload.href = String(location.href || ''); } catch (e) {}
    return JSON.stringify(payload, null, 2);
  }


  function sanitizeEmptyStateMetricsFilenamePart(value, fallback) {
    var s = String(value == null ? '' : value).trim();
    if (!s) s = fallback || 'unknown';
    s = s.replace(/[\\/:*?"<>|\s]+/g, '-');
    s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!s) s = fallback || 'unknown';
    if (s.length > 48) s = s.slice(0, 48);
    return s;
  }

  function formatEmptyStateMetricsDownloadStamp(date) {
    var d = date || new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) + '-' +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds());
  }

  function buildEmptyStateMetricsDownloadName(kind, ext) {
    var report = emptyStateMetricsReportMeta();
    var project = sanitizeEmptyStateMetricsFilenamePart(report.projectName, 'project');
    var filter = emptyStateMetricsEventKindFilter();
    var kindPart = sanitizeEmptyStateMetricsFilenamePart(filter || 'all', 'all');
    var stamp = formatEmptyStateMetricsDownloadStamp();
    var base = kind || 'empty-state-metrics';
    return 'studio-report-' + base + '__' + project + '__' + kindPart + '__' + stamp + '.' + (ext || 'json');
  }

  function downloadEmptyStateMetricsVisibleJSON() {
    var text = formatEmptyStateMetricsVisibleJSON();
    var blob = new Blob([text + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = buildEmptyStateMetricsDownloadName('empty-state-metrics-visible', 'json');
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 0);
    flashStatus('已下载可见空态 metrics JSON');
    return text;
  }

  function copyEmptyStateMetricsVisibleJSON() {
    var text = formatEmptyStateMetricsVisibleJSON();
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    var n = parsed && parsed.events ? parsed.events.length : 0;
    return copyText(text + '\n').then(function () {
      flashStatus('已复制可见空态 metrics JSON（' + n + ' 条事件）');
    }).catch(function () {
      try {
        downloadEmptyStateMetricsVisibleJSON();
        flashStatus('剪贴板不可用，已改为下载可见 JSON');
      } catch (e2) {
        flashStatus('复制可见 JSON 失败，请检查剪贴板权限');
      }
    });
  }

  function downloadEmptyStateMetricsJSON() {
    var text = formatEmptyStateMetricsJSON();
    var blob = new Blob([text + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = buildEmptyStateMetricsDownloadName('empty-state-metrics', 'json');
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 0);
    flashStatus('已下载空态 metrics JSON');
    return text;
  }

  function copyEmptyStateMetricsJSON() {
    var text = formatEmptyStateMetricsJSON();
    return copyText(text + '\n').then(function () {
      flashStatus('已复制空态 metrics JSON（可贴到 issue）');
    }).catch(function () {
      try {
        downloadEmptyStateMetricsJSON();
        flashStatus('剪贴板不可用，已改为下载 JSON');
      } catch (e) {
        flashStatus('复制失败，请检查剪贴板权限');
      }
    });
  }

  function formatEmptyStateMetricsIssueMarkdown() {
    var enableURL = formatEmptyMetricsEnableURL();
    var filter = describeFilterSnapshot(captureFilterSnapshot());
    var kindFilter = emptyStateMetricsEventKindFilter();
    var report = emptyStateMetricsReportMeta();
    // Prefer visible-subset JSON so kind chips shrink the issue payload by default.
    var json = formatEmptyStateMetricsVisibleJSON();
    var lines = [
      '### studio-reporter 空态 metrics',
      '',
      '- 项目: ' + (report.projectName ? ('`' + report.projectName + '`') : '_（未知）_'),
      '- 结果: ' + (report.verdict ? ('`' + report.verdict + '`') : '_（未知）_'),
      '- 生成时间: ' + (report.generatedAtISO || report.generatedAt || '_（未知）_'),
      '- 项目根目录: ' + (report.projectRoot ? ('`' + report.projectRoot + '`') : '_（未知）_'),
      '- 主机: ' + (report.hostName ? ('`' + report.hostName + '`') : '_（未知）_'),
      '- 插件版本: ' + (report.pluginVersion ? ('`' + report.pluginVersion + '`') : '_（未知）_'),
      '- 开启链接: ' + (enableURL ? ('`' + enableURL + '`') : '_（无法生成）_'),
      '- 当前过滤: ' + filter,
      '- 事件 kind: ' + (kindFilter ? ('`' + kindFilter + '`（可见子集）') : '当前未过滤'),
      '',
      '```json',
      json,
      '```',
      ''
    ];
    return lines.join('\n');
  }

  function downloadEmptyStateMetricsIssueMarkdown() {
    var text = formatEmptyStateMetricsIssueMarkdown();
    var blob = new Blob([text], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = buildEmptyStateMetricsDownloadName('empty-state-metrics-issue', 'md');
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 0);
    flashStatus('已下载空态 metrics issue Markdown');
    return text;
  }

  function copyEmptyStateMetricsIssueMarkdown() {
    var text = formatEmptyStateMetricsIssueMarkdown();
    return copyText(text).then(function () {
      flashStatus('已复制空态 metrics issue 模板（链接 + 过滤 + JSON）');
    }).catch(function () {
      try {
        downloadEmptyStateMetricsIssueMarkdown();
        flashStatus('剪贴板不可用，已改为下载 issue Markdown');
      } catch (e) {
        flashStatus('复制失败，请检查剪贴板权限');
      }
    });
  }

  function resetEmptyStateMetrics() {
    emptyStateMetrics.clear = 0;
    emptyStateMetrics.restoreFailOnly = 0;
    emptyStateMetrics.undo = 0;
    emptyStateMetrics.escClear = 0;
    emptyStateMetrics.ctrlZUndo = 0;
    emptyStateEvents.length = 0;
    syncEmptyStateMetricsPanel();
    flashStatus('已清零空态 metrics');
    return snapshotEmptyStateMetrics();
  }

  function formatEmptyMetricsEnableURL() {
    try {
      var href = String(location.href || '');
      var hashIdx = href.indexOf('#');
      var base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      var hash = hashIdx >= 0 ? href.slice(hashIdx) : '';
      var qIdx = base.indexOf('?');
      var path = qIdx >= 0 ? base.slice(0, qIdx) : base;
      var search = qIdx >= 0 ? base.slice(qIdx + 1) : '';
      var params = new URLSearchParams(search);
      params.delete('empty-metrics');
      params.delete('emptyMetrics');
      params.delete('empty-metrics-kind');
      params.delete('emptyMetricsKind');
      params.delete('empty-metrics-meta');
      params.delete('emptyMetricsMeta');
      params.delete('empty-metrics-meta-preset');
      params.delete('emptyMetricsMetaPreset');
      params.set('emptyMetrics', '1');
      var kind = emptyStateMetricsEventKindFilter();
      if (kind) params.set('emptyMetricsKind', kind);
      if (emptyStateMetricsMetaMoreExpanded()) params.set('emptyMetricsMeta', '1');
      var presetId = '';
      try { presetId = getActiveEmptyStateMetricsMetaFieldNamedPresetId(); } catch (ePreset) { presetId = ''; }
      if (presetId && presetId !== 'default') params.set('emptyMetricsMetaPreset', presetId);
      var qs = params.toString();
      return path + (qs ? ('?' + qs) : '') + hash;
    } catch (e) {
      return '';
    }
  }

  function readEmptyMetricsKindFromQuery() {
    try {
      var q = String(location.search || '');
      var m = q.match(/[?&](?:emptyMetricsKind|empty-metrics-kind)=([^&#]*)/i);
      if (!m) return '';
      var raw = decodeURIComponent(String(m[1] || '').replace(/\+/g, ' '));
      return raw ? String(raw) : '';
    } catch (e) {
      return '';
    }
  }

  function applyEmptyMetricsKindFromQuery() {
    var kind = readEmptyMetricsKindFromQuery();
    if (!kind) return emptyStateMetricsEventKindFilter();
    // Query wins over prior localStorage when sharing an enable deep link.
    return setEmptyStateMetricsEventKindFilter(kind);
  }

  function shortenEmptyMetricsEnableURL(url) {
    var s = String(url || '');
    if (s.length <= 72) return s;
    var hashIdx = s.indexOf('#');
    var hash = hashIdx >= 0 ? s.slice(hashIdx) : '';
    var base = hashIdx >= 0 ? s.slice(0, hashIdx) : s;
    var qIdx = base.indexOf('?');
    var path = qIdx >= 0 ? base.slice(0, qIdx) : base;
    var search = qIdx >= 0 ? base.slice(qIdx) : '';
    if (path.length > 36) path = path.slice(0, 20) + '…' + path.slice(-12);
    // Keep emptyMetrics (+ optional kind/preset) visible in the status preview.
    if (search.length > 28) {
      var kindMatch = search.match(/[?&](?:emptyMetricsKind|empty-metrics-kind)=([^&#]*)/i);
      var kindPart = kindMatch ? ('&emptyMetricsKind=' + kindMatch[1]) : '';
      var presetMatch = search.match(/[?&](?:emptyMetricsMetaPreset|empty-metrics-meta-preset)=([^&#]*)/i);
      var presetPart = presetMatch ? ('&emptyMetricsMetaPreset=' + presetMatch[1]) : '';
      if (/[?&]emptyMetrics=1(?:&|$)/i.test(search)) {
        search = '?emptyMetrics=1' + kindPart + presetPart + ((kindPart || presetPart || search.length > 40) ? '…' : '');
      } else {
        search = search.slice(0, 14) + '…' + search.slice(-10);
      }
    }
    if (hash.length > 24) hash = hash.slice(0, 12) + '…' + hash.slice(-8);
    return path + search + hash;
  }

  function describeEmptyMetricsEnableKindSummary(kind) {
    var k = kind == null ? '' : String(kind || '');
    if (!k) {
      try { k = emptyStateMetricsEventKindFilter(); } catch (e) { k = ''; }
    }
    if (k && EMPTY_STATE_EVENT_KIND_LABELS[k]) return 'kind=' + k;
    return '当前未过滤';
  }

  function describeEmptyMetricsEnableURLButtonSummary() {
    var parts = [describeEmptyMetricsEnableKindSummary()];
    try {
      if (emptyStateMetricsMetaMoreExpanded()) parts.push('meta+');
    } catch (e) {}
    try {
      var presetId = getActiveEmptyStateMetricsMetaFieldNamedPresetId();
      if (presetId && presetId !== 'default') {
        var preset = findEmptyStateMetricsMetaFieldNamedPreset(presetId);
        parts.push('preset=' + (preset && preset.name ? preset.name : presetId));
      }
    } catch (e2) {}
    return parts.join(' · ');
  }

  function syncEmptyMetricsEnableURLButtons() {
    var summary = describeEmptyMetricsEnableURLButtonSummary();
    var title = '复制带 ?emptyMetrics=1 的可分享 URL（' + summary + '；保留当前 hash 过滤）';
    var label = '复制空态 metrics 开启链接（' + summary + '）';
    document.querySelectorAll('[data-action="copy-empty-metrics-enable-url"]').forEach(function (btn) {
      btn.title = title;
      btn.setAttribute('aria-label', label);
    });
  }

  function describeEmptyMetricsEnableURLPreview(url) {
    var preview = shortenEmptyMetricsEnableURL(url);
    var kind = '';
    try {
      var m = String(url || '').match(/[?&](?:emptyMetricsKind|empty-metrics-kind)=([^&#]*)/i);
      if (m) kind = decodeURIComponent(String(m[1] || '').replace(/\+/g, ' '));
    } catch (e) {}
    if (!kind) {
      try { kind = emptyStateMetricsEventKindFilter(); } catch (e2) {}
    }
    // Keep contiguous " · kind=" for status-bar / static contract checks.
    var out;
    if (kind && EMPTY_STATE_EVENT_KIND_LABELS[kind]) {
      out = preview + ' · kind=' + kind;
    } else {
      out = preview + ' · 当前未过滤';
    }
    var metaOn = false;
    try {
      var mm = String(url || '').match(/[?&](?:emptyMetricsMeta|empty-metrics-meta)=([^&#]*)/i);
      if (mm) {
        var mv = decodeURIComponent(String(mm[1] || '').replace(/\+/g, ' ')).toLowerCase();
        metaOn = mv === '1' || mv === 'true' || mv === 'yes' || mv === 'on' || mv === 'expanded';
      } else {
        metaOn = emptyStateMetricsMetaMoreExpanded();
      }
    } catch (e3) {}
    if (metaOn) out += ' · meta+';
    var presetId = '';
    try {
      var pm = String(url || '').match(/[?&](?:emptyMetricsMetaPreset|empty-metrics-meta-preset)=([^&#]*)/i);
      if (pm) presetId = decodeURIComponent(String(pm[1] || '').replace(/\+/g, ' ')).trim();
    } catch (e4) {}
    if (!presetId) {
      try { presetId = getActiveEmptyStateMetricsMetaFieldNamedPresetId(); } catch (e5) { presetId = ''; }
    }
    if (presetId && presetId !== 'default') {
      var preset = null;
      try { preset = findEmptyStateMetricsMetaFieldNamedPreset(presetId); } catch (e6) {}
      out += ' · preset=' + (preset && preset.name ? preset.name : presetId);
    }
    return out;
  }

  function copyEmptyMetricsEnableURL() {
    var url = formatEmptyMetricsEnableURL();
    if (!url) {
      flashStatus('无法生成空态 metrics 开启链接');
      return Promise.reject(new Error('empty enable url'));
    }
    return copyText(url).then(function () {
      flashStatus('已复制开启链接：' + describeEmptyMetricsEnableURLPreview(url));
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  function emptyMetricsEnableHintDismissed() {
    try {
      var ls = localStorage.getItem('studio-report-empty-metrics-hint');
      return ls === '0' || ls === 'dismissed' || ls === 'false';
    } catch (e) {
      return false;
    }
  }

  function dismissEmptyMetricsEnableHint() {
    try { localStorage.setItem('studio-report-empty-metrics-hint', 'dismissed'); } catch (e) {}
    syncEmptyMetricsEnableHint();
    flashStatus('已关闭空态 metrics 首次引导');
  }

  function showEmptyStateMetricsPanel() {
    setEmptyStateMetricsPanelVisible(true);
    try { localStorage.setItem('studio-report-empty-metrics-hint', 'dismissed'); } catch (e) {}
    syncEmptyMetricsEnableHint();
    applyEmptyMetricsKindFromQuery();
    try { applyEmptyMetricsMetaPresetFromQuery(); } catch (ePreset) {}
    flashStatus('已开启空态 metrics 面板');
  }

  function syncEmptyMetricsEnableHint() {
    var el = document.getElementById('overview-empty-metrics-enable-hint');
    if (!el) return;
    if (emptyStateMetricsPanelEnabled()) {
      el.setAttribute('hidden', '');
      el.classList.remove('is-compact');
      try { syncEmptyMetricsEnableURLButtons(); } catch (e) {}
      return;
    }
    el.removeAttribute('hidden');
    if (emptyMetricsEnableHintDismissed()) el.classList.add('is-compact');
    else el.classList.remove('is-compact');
    try { syncEmptyMetricsEnableURLButtons(); } catch (e2) {}
  }

  function setEmptyStateMetricsPanelVisible(visible) {
    var on = !!visible;
    try { window.StudioReportShowEmptyStateMetrics = on; } catch (e) {}
    try {
      localStorage.setItem('studio-report-empty-metrics', on ? '1' : '0');
    } catch (e2) {}
    syncEmptyStateMetricsPanel();
    syncEmptyMetricsEnableHint();
    return emptyStateMetricsPanelEnabled();
  }

  function hideEmptyStateMetricsPanel() {
    var panel = document.getElementById('overview-empty-state-metrics');
    var active = null;
    try { active = document.activeElement; } catch (e) {}
    setEmptyStateMetricsPanelVisible(false);
    flashStatus('已隐藏空态 metrics 面板（localStorage=0）');
    // Keep keyboard focus out of the now-hidden strip.
    if (panel && active && panel.contains(active)) {
      var fallback = document.querySelector(
        '.overview-fail-reason-tools [data-action]:not([hidden]):not([disabled])'
      ) || document.getElementById('report-status') || document.body;
      try {
        if (fallback && typeof fallback.focus === 'function') fallback.focus();
      } catch (e2) {}
    }
  }

  function syncEmptyStateMetricsPanelButtons(panel, enabled) {
    if (!panel) return;
    panel.querySelectorAll('[data-action]').forEach(function (btn) {
      if (enabled) {
        btn.removeAttribute('tabindex');
        btn.removeAttribute('aria-hidden');
      } else {
        btn.setAttribute('tabindex', '-1');
        btn.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function syncEmptyStateMetricsPanel() {
    var el = document.getElementById('overview-empty-state-metrics');
    if (!el) return;
    var enabled = emptyStateMetricsPanelEnabled();
    if (!enabled) {
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
      syncEmptyStateMetricsPanelButtons(el, false);
      syncEmptyStateMetricsEvents();
      return;
    }
    var textEl = document.getElementById('overview-empty-state-metrics-text');
    var panelText = formatEmptyStateMetricsPanel();
    if (textEl) textEl.textContent = panelText;
    else el.textContent = panelText;
    var primary = formatEmptyStateMetricsReportSummaryPrimary();
    var secondary = formatEmptyStateMetricsReportSummarySecondary();
    var moreBtn = el.querySelector('[data-action="toggle-empty-state-metrics-meta-more"]');
    var secondaryEl = document.getElementById('overview-empty-state-metrics-meta-secondary');
    var expanded = emptyStateMetricsMetaMoreExpanded();
    if (moreBtn) {
      if (secondary) {
        moreBtn.removeAttribute('hidden');
        moreBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        moreBtn.textContent = expanded ? 'meta−' : 'meta+';
        moreBtn.title = expanded ? '折叠次要报告 meta（根目录/主机/插件）' : '展开次要报告 meta（根目录/主机/插件）';
      } else {
        moreBtn.setAttribute('hidden', '');
        moreBtn.setAttribute('aria-expanded', 'false');
      }
    }
    if (secondaryEl) {
      if (secondary && expanded) {
        secondaryEl.textContent = secondary;
        secondaryEl.removeAttribute('hidden');
      } else {
        secondaryEl.textContent = '';
        secondaryEl.setAttribute('hidden', '');
      }
    }
    var head = formatEmptyStateMetricsReportSummary();
    el.title = '空态操作计数（本地 UX 抽检；?emptyMetrics=1 或 localStorage studio-report-empty-metrics=1 开启）' +
      (head ? ('；报告 ' + head) : '');
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', head ? ('空态操作 metrics（' + head + '）') : '空态操作 metrics');
    syncEmptyStateMetricsPanelButtons(el, true);
    syncEmptyStateMetricsMetaFieldsEditor();
    try { syncEmptyStateMetricsMetaPresetToolbarChip(); } catch (eChip) {}
    syncEmptyStateMetricsEvents();
  }

  function captureFilterSnapshot() {
    return {
      query: state.query || '',
      spec: state.spec || 'all',
      scenario: state.scenario || 'all',
      failStepsOnly: !!failStepsOnly
    };
  }

  function applyFilterSnapshot(snap) {
    if (!snap) return;
    state.query = snap.query || '';
    state.spec = snap.spec || 'all';
    state.scenario = snap.scenario || 'all';
    if (searchInput) searchInput.value = state.query;
    var wantFailSteps = !!snap.failStepsOnly;
    if (wantFailSteps !== failStepsOnly) {
      setFailStepsOnly(wantFailSteps, { silent: true, skipHash: true });
    }
    applyFilter();
  }

  function syncUndoClearFiltersButton() {
    var btn = document.querySelector('.overview-fail-reason-tools [data-action="undo-clear-report-filters"]');
    if (!btn) return;
    var show = !!lastFilterSnapshot && !failReasonEmptyStateActive();
    if (show) {
      btn.removeAttribute('hidden');
      btn.setAttribute('tabindex', '0');
    } else {
      btn.setAttribute('hidden', '');
      btn.removeAttribute('tabindex');
    }
  }

  function failReasonEmptyStateActive() {
    var btn = document.querySelector('.overview-fail-reason-tools [data-action="clear-report-filters"]');
    return !!(btn && !btn.hasAttribute('hidden'));
  }

  function clearReportFilters(opts) {
    opts = opts || {};
    var before = captureFilterSnapshot();
    lastFilterSnapshot = before;
    state.query = '';
    state.spec = 'all';
    state.scenario = 'all';
    if (searchInput) searchInput.value = '';
    if (failStepsOnly) setFailStepsOnly(false, { silent: true, skipHash: true });
    applyFilter();
    syncUndoClearFiltersButton();
    recordEmptyStateEvent(opts.source === 'esc' ? 'escClear' : 'clear', {
      source: opts.source || 'button',
      before: before
    });
    flashStatus('已清除过滤（可撤销）');
  }

  // Clear search/spec noise but keep a fail-focused view (scenario=fail).
  function restoreFailOnlyView() {
    var before = captureFilterSnapshot();
    lastFilterSnapshot = before;
    state.query = '';
    state.spec = 'all';
    state.scenario = 'fail';
    if (searchInput) searchInput.value = '';
    if (failStepsOnly) setFailStepsOnly(false, { silent: true, skipHash: true });
    applyFilter();
    syncUndoClearFiltersButton();
    recordEmptyStateEvent('restoreFailOnly', { source: 'button', before: before });
    flashStatus('已切换到仅失败视图（可撤销）');
  }

  function describeFilterSnapshot(snap) {
    if (!snap) return '无过滤';
    var bits = [];
    var q = String(snap.query || '').trim();
    if (q) bits.push('搜索="' + q + '"');
    if (snap.spec && snap.spec !== 'all') bits.push('规格书=' + snap.spec);
    if (snap.scenario && snap.scenario !== 'all') bits.push('场景=' + snap.scenario);
    if (snap.failStepsOnly) bits.push('仅失败步骤');
    return bits.length ? bits.join(' · ') : '完整报告（无过滤）';
  }

  function undoClearReportFilters(opts) {
    opts = opts || {};
    if (!lastFilterSnapshot) {
      flashStatus('没有可撤销的过滤快照');
      return;
    }
    var snap = lastFilterSnapshot;
    lastFilterSnapshot = null;
    applyFilterSnapshot(snap);
    syncUndoClearFiltersButton();
    recordEmptyStateEvent(opts.source === 'ctrlz' ? 'ctrlZUndo' : 'undo', {
      source: opts.source || 'button',
      restored: snap
    });
    flashStatus('已撤销清除，已恢复：' + describeFilterSnapshot(snap));
  }

  // First visible jump target for an Overview fail-reason row (filter / fail-steps aware).
  // Prefer scenario refs; fall back to a visible hook's spec id.
  function firstVisibleFailReasonTarget(row) {
    if (!row || row.classList.contains('filter-hidden')) return '';
    var refs = row.querySelectorAll('.fail-reason-ref:not(.ref-hidden)');
    var i;
    var scn = '';
    var hook = '';
    for (i = 0; i < refs.length; i++) {
      var ref = refs[i];
      var scnId = (ref.getAttribute('data-scn-id') || '').trim();
      if (scnId) {
        scn = scnId;
        break;
      }
      if (!hook) {
        var specId = (ref.getAttribute('data-spec-id') || '').trim();
        var nav = ref.querySelector('[data-nav-target]');
        if (specId) hook = specId;
        else if (nav && nav.getAttribute('data-nav-target')) {
          hook = nav.getAttribute('data-nav-target').trim();
        }
      }
    }
    return scn || hook || '';
  }

  function jumpFailReasonRow(row) {
    var id = firstVisibleFailReasonTarget(row);
    if (!id) {
      flashStatus('当前过滤下该失败原因无可跳转场景');
      return false;
    }
    return selectNode(id);
  }


  function emptyCounts() {
    return { total: 0, passed: 0, failed: 0, skipped: 0 };
  }

  function bumpCounts(c, verdict) {
    c.total++;
    if (verdict === 'pass') c.passed++;
    else if (verdict === 'fail') c.failed++;
    else if (verdict === 'skip') c.skipped++;
  }

  function formatCountsRatio(c) {
    return String(c.passed) + '/' + String(c.total);
  }

  function formatCountsSub(c) {
    return '通过 ' + c.passed + ' · 失败 ' + c.failed + ' · 跳过 ' + c.skipped;
  }

  function isNodeVisuallyCounted(el) {
    if (!el || el.classList.contains('filter-hidden')) return false;
    var p = el.parentElement;
    while (p) {
      if (p.classList && p.classList.contains('filter-hidden')) return false;
      if (p.classList && p.classList.contains('result-pane')) break;
      p = p.parentElement;
    }
    if (document.documentElement.classList.contains('fail-steps-mode')) {
      var kind = el.getAttribute('data-kind') || '';
      if (kind === 'scenario' || kind === 'step' || kind === 'concept') {
        return el.getAttribute('data-verdict') === 'fail';
      }
      if (kind === 'spec') {
        return !!el.querySelector('.report-block[data-kind="scenario"][data-verdict="fail"]:not(.filter-hidden)');
      }
    }
    return true;
  }

  // Keep header stat cards + Overview count table aligned with the visible tree.

  function updateFilterGroupCounts(scope, c) {
    document.querySelectorAll('.filter-group[data-scope="' + scope + '"] .filter-btn').forEach(function (btn) {
      var f = btn.dataset.filter || 'all';
      var n = 0;
      if (f === 'all') n = c.total;
      else if (f === 'pass') n = c.passed;
      else if (f === 'fail') n = c.failed;
      else if (f === 'skip') n = c.skipped;
      var span = btn.querySelector('.filter-count');
      if (span) span.textContent = String(n);
      btn.setAttribute('data-filter-count', String(n));
    });
  }

  // Toolbar filter badges reflect what each chip would show under the *other*
  // active constraints (search, opposite scope filter, fail-steps-mode).
  function syncFilterBadges() {
    var q = (state.query || '').trim().toLowerCase();
    var failSteps = document.documentElement.classList.contains('fail-steps-mode');
    var scCounts = emptyCounts();
    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"]').forEach(function (scn) {
      var spec = scn.closest('.report-block[data-kind="spec"]');
      if (spec && state.spec !== 'all' && spec.dataset.verdict !== state.spec) return;
      var queryOK = !q || blockName(scn).indexOf(q) >= 0 || (spec && blockName(spec).indexOf(q) >= 0);
      if (!queryOK) return;
      if (failSteps && scn.dataset.verdict !== 'fail') return;
      bumpCounts(scCounts, scn.dataset.verdict || '');
    });
    var spCounts = emptyCounts();
    document.querySelectorAll('.result-pane .report-block[data-kind="spec"]').forEach(function (spec) {
      var scns = spec.querySelectorAll('.report-block[data-kind="scenario"]');
      var any = false;
      for (var i = 0; i < scns.length; i++) {
        var scn = scns[i];
        var verdictOK = state.scenario === 'all' || scn.dataset.verdict === state.scenario;
        var queryOK = !q || blockName(scn).indexOf(q) >= 0 || blockName(spec).indexOf(q) >= 0;
        if (failSteps && scn.dataset.verdict !== 'fail') continue;
        if (verdictOK && queryOK) { any = true; break; }
      }
      if (!any) return;
      bumpCounts(spCounts, spec.dataset.verdict || '');
    });
    updateFilterGroupCounts('scenario', scCounts);
    updateFilterGroupCounts('spec', spCounts);
  }



  function syncNavCounts() {
    document.querySelectorAll('.nav-pane .nav-spec[data-spec-id]').forEach(function (navSpec) {
      var specId = navSpec.getAttribute('data-spec-id') || '';
      var specEl = specId ? document.getElementById(specId) : null;
      var counts = emptyCounts();
      navSpec.querySelectorAll('.nav-scn[data-scn-id]').forEach(function (navScn) {
        var scnId = navScn.getAttribute('data-scn-id') || '';
        var scnEl = scnId && specEl ? document.getElementById(scnId) : null;
        var keep = !!(scnEl && isNodeVisuallyCounted(scnEl));
        navScn.classList.toggle('filter-hidden', !keep);
        if (keep) bumpCounts(counts, (scnEl.getAttribute('data-verdict') || navScn.getAttribute('data-verdict') || ''));
      });
      var el = navSpec.querySelector('[data-nav-scn-count]');
      if (el) el.textContent = formatCountsRatio(counts);
      navSpec.classList.toggle('filter-hidden', counts.total === 0);
    });
  }

  function syncOverviewSpecList() {
    document.querySelectorAll('.overview-spec-row[data-spec-id]').forEach(function (row) {
      var specId = row.getAttribute('data-spec-id') || '';
      var specEl = specId ? document.getElementById(specId) : null;
      if (!specEl) {
        row.classList.add('filter-hidden');
        return;
      }
      var visible = isNodeVisuallyCounted(specEl);
      row.classList.toggle('filter-hidden', !visible);
      if (!visible) return;
      var counts = emptyCounts();
      specEl.querySelectorAll('.report-block[data-kind="scenario"]').forEach(function (scn) {
        if (isNodeVisuallyCounted(scn)) bumpCounts(counts, scn.getAttribute('data-verdict') || '');
      });
      var cell = row.querySelector('[data-spec-scn-count]');
      if (cell) cell.textContent = formatCountsRatio(counts);
    });
  }

  function syncOverviewCounts() {
    var specs = emptyCounts();
    var scenarios = emptyCounts();
    var steps = emptyCounts();
    document.querySelectorAll('.result-pane .report-block[data-kind="spec"]').forEach(function (el) {
      if (isNodeVisuallyCounted(el)) bumpCounts(specs, el.getAttribute('data-verdict') || '');
    });
    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"]').forEach(function (el) {
      if (isNodeVisuallyCounted(el)) bumpCounts(scenarios, el.getAttribute('data-verdict') || '');
    });
    document.querySelectorAll('.result-pane .report-block[data-kind="step"], .result-pane .report-block[data-kind="concept"]').forEach(function (el) {
      if (isNodeVisuallyCounted(el)) bumpCounts(steps, el.getAttribute('data-verdict') || '');
    });
    var byKind = { specs: specs, scenarios: scenarios, steps: steps };
    Object.keys(byKind).forEach(function (kind) {
      var c = byKind[kind];
      document.querySelectorAll('.stat-card[data-stat-kind="' + kind + '"]').forEach(function (card) {
        var valueEl = card.querySelector('[data-stat-value]');
        var subEl = card.querySelector('[data-stat-sub]');
        if (valueEl) valueEl.textContent = formatCountsRatio(c);
        if (subEl) subEl.textContent = formatCountsSub(c);
      });
      document.querySelectorAll('.overview-count-row[data-count-kind="' + kind + '"]').forEach(function (row) {
        var map = { total: c.total, passed: c.passed, failed: c.failed, skipped: c.skipped };
        Object.keys(map).forEach(function (key) {
          var cell = row.querySelector('[data-count="' + key + '"]');
          if (cell) cell.textContent = String(map[key]);
        });
      });
    });
  }

  function applyFilter() {
    syncButtons();
    persist();

    document.querySelectorAll(STRUCTURAL_SELECTOR).forEach(function (el) {
      el.classList.remove('filter-hidden');
    });

    var specFilter = state.spec;
    var scenarioFilter = state.scenario;
    var q = (state.query || '').trim().toLowerCase();

    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"]').forEach(function (scn) {
      var verdictOK = scenarioFilter === 'all' || scn.dataset.verdict === scenarioFilter;
      var queryOK = !q || blockName(scn).indexOf(q) >= 0;
      if (verdictOK && queryOK) {
        showStructural(scn);
      } else {
        scn.classList.add('filter-hidden');
      }
    });

    var mid = Array.prototype.slice.call(document.querySelectorAll(
      '.result-pane .report-block[data-kind="datarow"],' +
      '.result-pane .report-block[data-kind="datadriven"]'
    ));
    mid.sort(function (a, b) { return blockDepth(b) - blockDepth(a); });
    mid.forEach(function (el) {
      var scns = el.querySelectorAll('.report-block[data-kind="scenario"]');
      var anyVisible = false;
      for (var i = 0; i < scns.length; i++) {
        if (!scns[i].classList.contains('filter-hidden')) {
          anyVisible = true;
          break;
        }
      }
      var selfQuery = !q || blockName(el).indexOf(q) >= 0;
      el.classList.toggle('filter-hidden', !(anyVisible || (selfQuery && scns.length === 0)));
    });

    document.querySelectorAll('.result-pane .report-block[data-kind="spec"]').forEach(function (spec) {
      var scns = spec.querySelectorAll('.report-block[data-kind="scenario"]');
      var anyVisibleScenario = false;
      for (var j = 0; j < scns.length; j++) {
        if (!scns[j].classList.contains('filter-hidden')) {
          anyVisibleScenario = true;
          break;
        }
      }
      var specVerdictMatch = specFilter === 'all' || spec.dataset.verdict === specFilter;
      var specQueryMatch = matchesQuery(spec, q);
      // If query matches the spec name, reveal all scenarios that still pass verdict filter.
      if (q && blockName(spec).indexOf(q) >= 0) {
        scns.forEach(function (scn) {
          if (scenarioFilter === 'all' || scn.dataset.verdict === scenarioFilter) {
            showStructural(scn);
            anyVisibleScenario = true;
          }
        });
      }
      spec.classList.toggle('filter-hidden', !anyVisibleScenario || !specVerdictMatch || !specQueryMatch);
    });
    syncFailReasonOverview();
    syncOverviewCounts();
    syncFilterBadges();
    syncOverviewSpecList();
    syncNavCounts();
    if (!applyingHash) syncShareHash();
  }

  document.querySelectorAll('.filter-group').forEach(function (group) {
    group.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.filter-btn');
      if (!btn) return;
      var scope = btn.dataset.scope;
      if (!scope) return;
      state[scope] = btn.dataset.filter || 'all';
      applyFilter();
    });
  });

  var searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.query = searchInput.value || '';
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { applyFilter(); }, 120);
    });
  }

  applyFilter();

  function setDetailsOpen(open) {
    // Structural details only — avoids forcing open every step/concept <details>
    // (keeps lazy screenshots lazy and cuts expand-all layout cost).
    document.querySelectorAll(
      '.result-pane details.report-block[data-kind="spec"],' +
      '.result-pane details.report-block[data-kind="scenario"],' +
      '.result-pane details.report-block[data-kind="datarow"],' +
      '.result-pane details.report-block[data-kind="datadriven"]'
    ).forEach(function (el) {
      if (el.classList.contains('filter-hidden')) return;
      el.open = open;
    });
  }

  var failStepsOnly = false;
  var FAIL_STEPS_KEY = 'studio-report-fail-steps-only';

  function openFailStepsAncestors() {
    document.querySelectorAll(
      '.result-pane details.report-block[data-kind="step"][data-verdict="fail"],' +
      '.result-pane details.report-block[data-kind="concept"][data-verdict="fail"]'
    ).forEach(function (el) {
      if (!el.classList.contains('filter-hidden')) el.open = true;
    });
    document.querySelectorAll(
      '.result-pane details.report-block[data-kind="scenario"][data-verdict="fail"],' +
      '.result-pane details.report-block[data-kind="spec"]'
    ).forEach(function (el) {
      if (el.classList.contains('filter-hidden')) return;
      if (el.dataset.kind === 'spec') {
        var hasFail = el.querySelector('.report-block[data-kind="scenario"][data-verdict="fail"]:not(.filter-hidden)');
        if (!hasFail) return;
      }
      el.open = true;
    });
  }

  function setFailStepsOnly(on, opts) {
    opts = opts || {};
    failStepsOnly = !!on;
    document.documentElement.classList.toggle('fail-steps-mode', failStepsOnly);
    document.querySelectorAll('[data-action="fail-steps-only"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', failStepsOnly ? 'true' : 'false');
      btn.classList.toggle('active', failStepsOnly);
    });
    if (failStepsOnly) openFailStepsAncestors();
    try { sessionStorage.setItem(FAIL_STEPS_KEY, failStepsOnly ? '1' : '0'); } catch (e) {}
    syncFailReasonOverview();
    syncOverviewCounts();
    syncFilterBadges();
    syncOverviewSpecList();
    syncNavCounts();
    if (!opts.skipHash && !applyingHash) syncShareHash();
    if (opts.silent) return;
    if (typeof flashStatus === 'function') {
      flashStatus(failStepsOnly ? '已开启：仅显示失败场景与失败步骤' : '已关闭：仅失败步骤');
    }
  }

  // Keep token folding aligned with Go ParseShareHash / Desktop share-hash.js.
  function parseFailStepsFlag(raw) {
    var v = String(raw || '').toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    return null;
  }

  function failStepsParamValue(params) {
    return (
      params.get('failSteps') ||
      params.get('fail-steps') ||
      params.get('failsteps') ||
      params.get('fail_steps') ||
      ''
    );
  }

  function wantFailStepsFromURL() {
    try {
      var h = (location.hash || '').replace(/^#/, '');
      if (parseShareHash(h).failSteps) return true;
      var q = new URLSearchParams(location.search || '');
      return parseFailStepsFlag(failStepsParamValue(q)) === true;
    } catch (e) {
      return false;
    }
  }


  function describePrintScope() {
    var bits = [];
    if (state.spec && state.spec !== 'all') bits.push('规格书=' + state.spec);
    if (state.scenario && state.scenario !== 'all') bits.push('场景=' + state.scenario);
    var q = (state.query || '').trim();
    if (q) bits.push('搜索="' + q + '"');
    if (document.documentElement.classList.contains('fail-steps-mode')) bits.push('仅失败步骤');
    if (!bits.length) return '打印范围：完整报告（无过滤）';
    return '打印范围：当前可见树（' + bits.join(' · ') + '）— 非全量报告';
  }

  function updatePrintScopeBanner() {
    var el = document.getElementById('print-scope-banner');
    if (!el) return;
    el.textContent = describePrintScope();
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
  }

  function prepareFailStepsForPrint() {
    updatePrintScopeBanner();
    if (!failStepsOnly) return;
    openFailStepsAncestors();
    // Closed <details> omit body content from print in Chromium; keep fail path open.
  }

  document.querySelectorAll('.toolbar-actions').forEach(function (group) {
    group.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'expand-all') setDetailsOpen(true);
      if (btn.dataset.action === 'collapse-all') setDetailsOpen(false);
      if (btn.dataset.action === 'fail-steps-only') setFailStepsOnly(!failStepsOnly);
      if (btn.dataset.action === 'copy-fail-summary') copyFailSummary();
      if (btn.dataset.action === 'copy-fail-summary-locator-example') copyFailSummaryLocatorExample();
      if (btn.dataset.action === 'copy-share-link') copyShareLink();
    });
  });

  var overview = document.getElementById('overview');
  var results = document.getElementById('results');
  function showOverview(show, opts) {
    opts = opts || {};
    if (!overview || !results) return;
    overview.classList.toggle('is-hidden', !show);
    if (show) {
      overview.scrollIntoView({ block: 'start' });
    }
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('is-active', show ? el.dataset.navTarget === 'overview' : false);
    });
    if (opts.updateHash !== false) writeHash(show ? 'overview' : (opts.hashId || ''));
  }
  function activateNav(id) {
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.navTarget === id);
    });
  }

  function flashStatus(msg) {
    var el = document.querySelector('.status-msg');
    if (!el) return;
    el.textContent = msg || '';
    if (flashStatus._t) clearTimeout(flashStatus._t);
    if (msg) {
      flashStatus._t = setTimeout(function () { el.textContent = ''; }, 2400);
    }
  }

  try {
    if (wantFailStepsFromURL() || sessionStorage.getItem(FAIL_STEPS_KEY) === '1') {
      setFailStepsOnly(true, { silent: true });
    }
  } catch (e) {}

  window.addEventListener('beforeprint', prepareFailStepsForPrint);

  
  // Shareable URL fragment: #<focus>[?q=&spec=&scenario=&failSteps=1]
  // Legacy: #fail-steps, #overview, #<nodeId>
  var currentFocusId = 'overview';
  // applyingHash starts true (see top of IIFE) until first applyHashFromLocation.

  function encodeShareFocus(focus) {
    try {
      // Keep ':' and '/' literal — DOM ids are path-stable ("spec:specs/auth/login.spec").
      return encodeURIComponent(String(focus || ''))
        .replace(/%3A/gi, ':')
        .replace(/%2F/gi, '/');
    } catch (e) {
      return String(focus || '');
    }
  }

  function decodeShareFocus(focus) {
    var raw = String(focus || '');
    if (!raw) return raw;
    try {
      return decodeURIComponent(raw);
    } catch (e) {
      return raw;
    }
  }

  function parseShareHash(raw) {
    var input = String(raw || '').replace(/^#/, '');
    var focus = '';
    var query = '';
    var spec = 'all';
    var scenario = 'all';
    // null = not specified in fragment (preserve session / early init)
    var failSteps = null;
    if (!input) {
      return { focus: 'overview', query: '', spec: 'all', scenario: 'all', failSteps: null };
    }
    var qIdx = input.indexOf('?');
    var head = qIdx >= 0 ? input.slice(0, qIdx) : input;
    var qs = qIdx >= 0 ? input.slice(qIdx + 1) : '';
    // Legacy: fail-steps as focus (optionally followed by & or / junk)
    if (head === 'fail-steps' || head.indexOf('fail-steps&') === 0 || head.indexOf('fail-steps/') === 0) {
      focus = 'overview';
      failSteps = true;
      if (head.indexOf('fail-steps&') === 0) {
        qs = head.slice('fail-steps&'.length) + (qs ? '&' + qs : '');
      }
    } else {
      focus = decodeShareFocus(head) || 'overview';
    }
    if (qs) {
      try {
        var params = new URLSearchParams(qs);
        if (params.has('q')) query = String(params.get('q') || '');
        if (params.has('query')) query = String(params.get('query') || query);
        var sp = params.get('spec') || params.get('specVerdict') || '';
        var sc = params.get('scenario') || params.get('scn') || params.get('scenarioVerdict') || '';
        if (sp) spec = String(sp);
        if (sc) scenario = String(sc);
        var parsedFs = parseFailStepsFlag(failStepsParamValue(params));
        if (parsedFs != null) failSteps = parsedFs;
      } catch (e) {}
    }
    if (spec !== 'all' && spec !== 'pass' && spec !== 'fail' && spec !== 'skip') spec = 'all';
    if (scenario !== 'all' && scenario !== 'pass' && scenario !== 'fail' && scenario !== 'skip') scenario = 'all';
    return { focus: focus || 'overview', query: query, spec: spec, scenario: scenario, failSteps: failSteps };
  }

  function buildShareHash(parts) {
    parts = parts || {};
    var focus = parts.focus || currentFocusId || 'overview';
    if (!focus || focus === 'overview') focus = 'overview';
    focus = encodeShareFocus(focus);
    var params = new URLSearchParams();
    var q = parts.query != null ? String(parts.query) : String(state.query || '');
    q = q.trim();
    if (q) params.set('q', q);
    var spec = parts.spec != null ? String(parts.spec) : String(state.spec || 'all');
    var scenario = parts.scenario != null ? String(parts.scenario) : String(state.scenario || 'all');
    if (spec && spec !== 'all') params.set('spec', spec);
    if (scenario && scenario !== 'all') params.set('scenario', scenario);
    var fs = parts.failSteps != null ? !!parts.failSteps : !!failStepsOnly;
    if (fs) params.set('failSteps', '1');
    var qs = params.toString();
    return qs ? (focus + '?' + qs) : focus;
  }

  function syncShareHash(opts) {
    opts = opts || {};
    try {
      var next = '#' + buildShareHash({
        focus: opts.focus != null ? opts.focus : currentFocusId,
        query: state.query,
        spec: state.spec,
        scenario: state.scenario,
        failSteps: failStepsOnly,
      });
      if (location.hash === next) return;
      if (history.replaceState) history.replaceState(null, '', next);
      else location.hash = next;
    } catch (e) {}
  }

function writeHash(id) {
    currentFocusId = (!id || id === 'overview') ? 'overview' : String(id);
    syncShareHash({ focus: currentFocusId });
  }

  function openAncestors(target) {
    var parent = target.parentElement;
    while (parent) {
      if (parent.tagName === 'DETAILS') parent.open = true;
      parent = parent.parentElement;
    }
  }

  function selectNode(id, opts) {
    opts = opts || {};
    if (!id || id === 'overview') {
      showOverview(true, opts);
      return true;
    }
    var target = document.getElementById(id);
    if (!target) return false;
    showOverview(false, { updateHash: false });
    activateNav(id);
    if (target.tagName === 'DETAILS') target.open = true;
    openAncestors(target);
    target.scrollIntoView({ block: 'start' });
    if (opts.updateHash !== false) writeHash(id);
    return true;
  }

  function applyHashFromLocation() {
    applyingHash = true;
    try {
      var raw = '';
      try { raw = (location.hash || '').replace(/^#/, ''); } catch (e) {}
      var parsed = parseShareHash(raw);
      var filterChanged = false;
      if (typeof parsed.query === 'string' && parsed.query !== state.query) {
        state.query = parsed.query;
        if (searchInput) searchInput.value = state.query;
        filterChanged = true;
      }
      if (parsed.spec && parsed.spec !== state.spec) {
        state.spec = parsed.spec;
        filterChanged = true;
      }
      if (parsed.scenario && parsed.scenario !== state.scenario) {
        state.scenario = parsed.scenario;
        filterChanged = true;
      }
      if (filterChanged) {
        syncButtons();
        applyFilter();
      } else {
        syncButtons();
      }
      if (parsed.failSteps != null && parsed.failSteps !== failStepsOnly) {
        setFailStepsOnly(parsed.failSteps, { silent: true, skipHash: true });
      }
      currentFocusId = parsed.focus || 'overview';
      if (!currentFocusId || currentFocusId === 'overview') {
        showOverview(true, { updateHash: false });
      } else if (!selectNode(currentFocusId, { updateHash: false })) {
        currentFocusId = 'overview';
        showOverview(true, { updateHash: false });
      }
      syncShareHash({ focus: currentFocusId });
    } finally {
      applyingHash = false;
    }
  }

  function blockLabel(el) {
    var cell = el.querySelector(':scope > summary .name-cell, :scope > .leaf-summary .name-cell');
    return cell ? (cell.textContent || '').trim() : (el.id || '');
  }

  // Keep in sync with desktop/electron/fail-summary-open.js FAIL_SUMMARY_LOCATOR_EXAMPLE.
  var FAIL_SUMMARY_LOCATOR_EXAMPLE = '  - 定位: `#spec:specs/auth/login.spec-scn-0`';

  function copyFailSummaryLocatorExample() {
    return copyText(FAIL_SUMMARY_LOCATOR_EXAMPLE + '\n').then(function () {
      flashStatus('已复制定位示例（path-style focus，/ 为字面量）');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  function failSummaryDeepLink(focusId) {
    var id = String(focusId || '').trim();
    if (!id) return '';
    return '#' + buildShareHash({
      focus: id,
      query: state.query,
      spec: state.spec,
      scenario: state.scenario,
      failSteps: failStepsOnly,
    });
  }

  function failReasonShareURL(row) {
    syncFailReasonOverview();
    var jump = firstVisibleFailReasonTarget(row);
    var hash = failSummaryDeepLink(jump);
    if (!hash) return '';
    try {
      return String(location.href || '').split('#')[0] + hash;
    } catch (e) {
      return hash;
    }
  }

  function copyFailReasonLink(row) {
    var url = failReasonShareURL(row);
    if (!url) {
      flashStatus('当前过滤下该失败原因无可复制定位');
      return Promise.resolve();
    }
    return copyText(url).then(function () {
      flashStatus('已复制失败原因定位深链（path-style focus）');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  function formatFailReasonSnippet(row) {
    if (!row) return '';
    syncFailReasonOverview();
    var countEl = row.querySelector('.fail-reason-count');
    var count = countEl ? String(countEl.textContent || '').trim() : '';
    if (!count) count = String(row.getAttribute('data-fail-count-visible') || row.getAttribute('data-fail-count-total') || '').trim();
    var reason = String(row.getAttribute('data-fail-reason') || '').trim();
    var refs = [];
    row.querySelectorAll('.fail-reason-ref:not(.ref-hidden)').forEach(function (ref) {
      var a = ref.querySelector('a');
      var label = a ? (a.textContent || '').trim() : (ref.textContent || '').trim();
      if (label) refs.push(label);
    });
    var line = '- (' + (count || '?') + ') ' + reason + (refs.length ? ' — ' + refs.join(', ') : '');
    var url = failReasonShareURL(row);
    if (url) line += '\n  - 定位: `' + url + '`';
    return line;
  }

  function copyFailReasonSnippet(row) {
    var snip = formatFailReasonSnippet(row);
    if (!snip) {
      flashStatus('当前过滤下该失败原因无可复制摘要');
      return Promise.resolve();
    }
    return copyText(snip + '\n').then(function () {
      flashStatus('已复制失败原因摘要片段（含定位深链）');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  // Markdown list of all visible fail-reason snippets (same shape as per-row「复制摘要」).
  function formatAllFailReasonSnippets() {
    syncFailReasonOverview();
    var parts = [];
    document.querySelectorAll('.fail-reason-row:not(.filter-hidden)').forEach(function (row) {
      var snip = formatFailReasonSnippet(row);
      if (snip) parts.push(snip);
    });
    return parts.join('\n');
  }

  function copyAllFailReasonSnippets() {
    var text = formatAllFailReasonSnippets();
    if (!text) {
      flashStatus('当前过滤下无可复制的失败原因摘要');
      return Promise.resolve();
    }
    var n = (text.match(/^- /gm) || []).length;
    return copyText(text + '\n').then(function () {
      flashStatus('已复制全部失败原因摘要（' + n + ' 条，含定位深链）');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  // Newline-separated share URLs for each visible fail-reason row (first visible jump).
  function formatAllFailReasonLinks() {
    syncFailReasonOverview();
    var urls = [];
    document.querySelectorAll('.fail-reason-row:not(.filter-hidden)').forEach(function (row) {
      var url = failReasonShareURL(row);
      if (url) urls.push(url);
    });
    return urls.join('\n');
  }

  function copyAllFailReasonLinks() {
    var text = formatAllFailReasonLinks();
    if (!text) {
      flashStatus('当前过滤下无可复制的失败原因定位深链');
      return Promise.resolve();
    }
    var n = text.split('\n').filter(Boolean).length;
    return copyText(text + '\n').then(function () {
      flashStatus('已复制全部失败原因定位深链（' + n + ' 条）');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  function collectFailSummary() {
    syncFailReasonOverview();
    var fails = visibleFailScenarios();
    var reasonRows = Array.prototype.slice.call(
      document.querySelectorAll('.fail-reason-row:not(.filter-hidden)')
    );
    if (!fails.length && !reasonRows.length) return '';
    var lines = ['# Studio Reporter — 失败摘要', ''];
    if (reasonRows.length) {
      lines.push('## 失败原因聚合');
      reasonRows.forEach(function (row) {
        var count = (row.querySelector('.fail-reason-count') || {}).textContent || '';
        var reason = row.getAttribute('data-fail-reason') || '';
        var refs = [];
        row.querySelectorAll('.fail-reason-ref:not(.ref-hidden)').forEach(function (ref) {
          var a = ref.querySelector('a');
          var label = a ? (a.textContent || '').trim() : (ref.textContent || '').trim();
          if (label) refs.push(label);
        });
        lines.push('- (' + String(count).trim() + ') ' + reason + (refs.length ? ' — ' + refs.join(', ') : ''));
        var jump = firstVisibleFailReasonTarget(row);
        var link = failSummaryDeepLink(jump);
        if (link) {
          // Path-style focus keeps literal '/' (encodeShareFocus); share hash is pasteable.
          lines.push('  - 定位: `' + link + '`');
        }
      });
      lines.push('');
    }
    if (fails.length) {
      lines.push('## 失败场景');
      fails.forEach(function (scn, idx) {
        lines.push((idx + 1) + '. ' + blockLabel(scn) + (scn.id ? ' (`' + scn.id + '`)' : ''));
        var bits = [];
        scn.querySelectorAll('.err, .stack, .hook-alert').forEach(function (node) {
          var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) bits.push(text);
        });
        if (bits.length) lines.push('   - ' + bits.slice(0, 4).join(' | '));
        var link = failSummaryDeepLink(scn.id);
        if (link) lines.push('   - 定位: `' + link + '`');
      });
      lines.push('');
    }
    lines.push('_由静态报告轻交互复制 · 与结果树可见失败对齐 · 非完整报告真源_');
    return lines.join('\n');
  }

  function copyText(text) {
    if (!text) return Promise.reject(new Error('empty'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy failed');
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  
  function currentShareURL() {
    try {
      syncShareHash({ focus: currentFocusId });
      var href = String(location.href || '');
      var hash = '#' + buildShareHash({
        focus: currentFocusId,
        query: state.query,
        spec: state.spec,
        scenario: state.scenario,
        failSteps: failStepsOnly,
      });
      return href.split('#')[0] + hash;
    } catch (e) {
      return '';
    }
  }

  
  function describeShareScope() {
    var bits = [];
    var q = (state.query || '').trim();
    if (q) bits.push('搜索="' + q + '"');
    if (state.spec && state.spec !== 'all') bits.push('规格书=' + state.spec);
    if (state.scenario && state.scenario !== 'all') bits.push('场景=' + state.scenario);
    if (failStepsOnly) bits.push('仅失败步骤');
    if (currentFocusId && currentFocusId !== 'overview') bits.push('定位=' + currentFocusId);
    return bits.length ? bits.join(' · ') : '完整报告（无过滤）';
  }

function copyShareLink() {
    var url = currentShareURL();
    if (!url) {
      flashStatus('无法生成分享链接');
      return;
    }
    copyText(url).then(function () {
      flashStatus('已复制可见范围链接（' + describeShareScope() + '）');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

function copyFailSummary() {
    var text = collectFailSummary();
    if (!text) {
      // If fails are filtered out, briefly switch scenario filter to fail.
      var prev = state.scenario;
      if (prev !== 'fail') {
        state.scenario = 'fail';
        applyFilter();
        text = collectFailSummary();
        state.scenario = prev;
        applyFilter();
      }
    }
    if (!text) {
      flashStatus('当前没有失败场景可复制');
      return;
    }
    copyText(text).then(function () {
      flashStatus('已复制失败摘要');
    }).catch(function () {
      flashStatus('复制失败，请检查剪贴板权限');
    });
  }

  function closeLightbox() {
    var dlg = document.getElementById('shot-lightbox');
    if (dlg && typeof dlg.close === 'function' && dlg.open) dlg.close();
  }

  function isLightboxOpen() {
    var dlg = document.getElementById('shot-lightbox');
    return !!(dlg && dlg.open);
  }

  // Mirrors Go StepLightboxIndex — keep behavior aligned with lightbox_nav.go.
  function stepLightboxIndex(current, delta, total) {
    if (total <= 0) return -1;
    if (current < 0 || current >= total) return delta >= 0 ? 0 : total - 1;
    var n = total;
    return (current + (delta % n) + n) % n;
  }

  var lightboxShots = [];
  var lightboxIndex = -1;

  function collectShotThumbs() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-shot-src]'));
  }

  function updateLightboxPos() {
    var pos = document.getElementById('shot-lightbox-pos');
    if (!pos) return;
    if (lightboxIndex < 0 || !lightboxShots.length) {
      pos.textContent = '';
      return;
    }
    pos.textContent = (lightboxIndex + 1) + ' / ' + lightboxShots.length;
  }

  function showLightboxAt(index) {
    var dlg = document.getElementById('shot-lightbox');
    var img = document.getElementById('shot-lightbox-img');
    var cap = document.getElementById('shot-lightbox-cap');
    if (!dlg || !img || !lightboxShots.length) return;
    var i = stepLightboxIndex(index, 0, lightboxShots.length);
    if (i < 0) return;
    lightboxIndex = i;
    var thumb = lightboxShots[i];
    img.src = thumb.dataset.shotSrc;
    if (cap) cap.textContent = thumb.dataset.shotCaption || '截图';
    updateLightboxPos();
    if (!dlg.open && typeof dlg.showModal === 'function') dlg.showModal();
  }

  function openLightboxFromThumb(thumb) {
    lightboxShots = collectShotThumbs();
    var idx = lightboxShots.indexOf(thumb);
    if (idx < 0) {
      lightboxShots = [thumb];
      idx = 0;
    }
    showLightboxAt(idx);
  }

  function stepLightbox(delta) {
    if (!isLightboxOpen() || !lightboxShots.length) return false;
    showLightboxAt(stepLightboxIndex(lightboxIndex, delta, lightboxShots.length));
    return true;
  }

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
  }

  function jumpFail(delta) {
    var fails = visibleFailScenarios();
    if (!fails.length) {
      flashStatus('没有可见的失败场景（可先过滤「失败」）');
      return;
    }
    var activeId = '';
    document.querySelectorAll('.nav-item.is-active').forEach(function (el) {
      activeId = el.dataset.navTarget || activeId;
    });
    var current = -1;
    if (activeId) {
      for (var i = 0; i < fails.length; i++) {
        if (fails[i].id === activeId) { current = i; break; }
      }
    }
    var next = current < 0 ? (delta > 0 ? 0 : fails.length - 1)
      : (current + delta + fails.length) % fails.length;
    selectNode(fails[next].id);
  }

  document.addEventListener('contextmenu', function (ev) {
    var chip = ev.target && ev.target.closest
      ? ev.target.closest('#overview-empty-state-metrics-meta-preset-chip')
      : null;
    if (!chip) return;
    ev.preventDefault();
    openEmptyStateMetricsMetaPresetMenu(chip, { x: ev.clientX, y: ev.clientY });
  });

  document.addEventListener('click', function (ev) {
    var menu = document.getElementById('overview-empty-state-metrics-meta-preset-menu');
    if (menu && !menu.hasAttribute('hidden')) {
      var inMenu = ev.target && ev.target.closest && ev.target.closest('#overview-empty-state-metrics-meta-preset-menu');
      var onChip = ev.target && ev.target.closest && ev.target.closest('#overview-empty-state-metrics-meta-preset-chip');
      if (!inMenu && !onChip) {
        try { closeEmptyStateMetricsMetaPresetMenu(); } catch (eClose) {}
      }
    }
    var actionBtn = ev.target.closest('[data-action]');
    if (actionBtn) {
      if (actionBtn.dataset.action === 'show-overview') {
        selectNode('overview');
        return;
      }
      if (actionBtn.dataset.action === 'export-pdf') {
        // Structured print → PDF (text/links/images). Not a raster collage.
        // Respect current filters + fail-steps-only (CSS + beforeprint open ancestors).
        prepareFailStepsForPrint();
        showOverview(true, { updateHash: false });
        if (failStepsOnly) flashStatus('打印：仅失败步骤模式（所见即所打）');
        window.print();
        return;
      }
      if (actionBtn.dataset.action === 'copy-fail-summary') {
        copyFailSummary();
        return;
      }
      if (actionBtn.dataset.action === 'copy-fail-summary-locator-example') {
        copyFailSummaryLocatorExample();
        return;
      }
      if (actionBtn.dataset.action === 'copy-fail-reason-link') {
        var reasonRow = actionBtn.closest('.fail-reason-row');
        if (reasonRow) copyFailReasonLink(reasonRow);
        return;
      }
      if (actionBtn.dataset.action === 'copy-fail-reason-snippet') {
        var snippetRow = actionBtn.closest('.fail-reason-row');
        if (snippetRow) copyFailReasonSnippet(snippetRow);
        return;
      }
      if (actionBtn.dataset.action === 'copy-all-fail-reason-snippets') {
        copyAllFailReasonSnippets();
        return;
      }
      if (actionBtn.dataset.action === 'copy-all-fail-reason-links') {
        copyAllFailReasonLinks();
        return;
      }
      if (actionBtn.dataset.action === 'clear-report-filters') {
        clearReportFilters();
        return;
      }
      if (actionBtn.dataset.action === 'restore-fail-only-view') {
        restoreFailOnlyView();
        return;
      }
      if (actionBtn.dataset.action === 'undo-clear-report-filters') {
        undoClearReportFilters();
        return;
      }
      if (actionBtn.dataset.action === 'toggle-empty-state-metrics-meta-more') {
        toggleEmptyStateMetricsMetaMore();
        return;
      }
      if (actionBtn.dataset.action === 'toggle-empty-state-metrics-meta-fields') {
        toggleEmptyStateMetricsMetaFieldsEditor();
        return;
      }
      if (actionBtn.dataset.action === 'open-empty-state-metrics-meta-fields') {
        openEmptyStateMetricsMetaFieldsEditor();
        return;
      }
      if (actionBtn.dataset.action === 'cycle-empty-state-metrics-meta-field-named-preset') {
        activateEmptyStateMetricsMetaPresetChip(ev);
        return;
      }
      if (actionBtn.dataset.action === 'reset-empty-state-metrics-meta-field-named-preset') {
        resetEmptyStateMetricsMetaFieldNamedPresetToDefault();
        return;
      }
      if (actionBtn.dataset.action === 'copy-empty-state-metrics-meta-fields-json') {
        copyEmptyStateMetricsMetaFieldPrefsJSON();
        return;
      }
      if (actionBtn.dataset.action === 'download-empty-state-metrics-meta-fields-json') {
        downloadEmptyStateMetricsMetaFieldPrefsJSON();
        return;
      }
      if (actionBtn.dataset.action === 'import-empty-state-metrics-meta-fields-json') {
        importEmptyStateMetricsMetaFieldPrefsFromPrompt();
        return;
      }
      if (actionBtn.dataset.action === 'reset-empty-state-metrics-meta-fields') {
        resetEmptyStateMetricsMetaFieldPrefs();
        return;
      }
      if (actionBtn.dataset.action === 'apply-empty-state-metrics-meta-field-named') {
        applyEmptyStateMetricsMetaFieldNamedPreset(actionBtn.dataset.namedPreset);
        try { closeEmptyStateMetricsMetaPresetMenu(); } catch (eClose) {}
        return;
      }
      if (actionBtn.dataset.action === 'save-empty-state-metrics-meta-field-named') {
        saveEmptyStateMetricsMetaFieldNamedPresetFromPrompt();
        return;
      }
      if (actionBtn.dataset.action === 'delete-empty-state-metrics-meta-field-named') {
        deleteActiveEmptyStateMetricsMetaFieldNamedPreset();
        return;
      }
      if (actionBtn.dataset.action === 'copy-empty-state-metrics-meta-field-named-json') {
        copyEmptyStateMetricsMetaFieldNamedPresetsJSON();
        return;
      }
      if (actionBtn.dataset.action === 'import-empty-state-metrics-meta-field-named-json') {
        importEmptyStateMetricsMetaFieldNamedPresetsFromPrompt();
        return;
      }
      if (actionBtn.dataset.action === 'move-empty-state-metrics-meta-field') {
        moveEmptyStateMetricsMetaField(actionBtn.dataset.metaField, Number(actionBtn.dataset.delta || 0));
        return;
      }
      if (actionBtn.dataset.action === 'copy-empty-state-metrics-report-meta') {
        copyEmptyStateMetricsReportSummary();
        return;
      }
if (actionBtn.dataset.action === 'copy-empty-state-metrics-json') {
        copyEmptyStateMetricsJSON();
        return;
      }
      if (actionBtn.dataset.action === 'copy-empty-state-metrics-issue') {
        copyEmptyStateMetricsIssueMarkdown();
        return;
      }
      if (actionBtn.dataset.action === 'toggle-empty-state-metrics-events') {
        toggleEmptyStateMetricsEvents();
        return;
      }
      if (actionBtn.dataset.action === 'copy-empty-state-metrics-event') {
        copyEmptyStateMetricsEventLine(actionBtn.dataset.eventIndex);
        return;
      }
      if (actionBtn.dataset.action === 'copy-empty-state-metrics-visible-events') {
        copyEmptyStateMetricsVisibleEventLines();
        return;
      }
      if (actionBtn.dataset.action === 'copy-empty-state-metrics-visible-json') {
        copyEmptyStateMetricsVisibleJSON();
        return;
      }
      if (actionBtn.dataset.action === 'filter-empty-state-metrics-event-kind') {
        if (!actionBtn.dataset.kind) clearEmptyStateMetricsEventKindFilter();
        else setEmptyStateMetricsEventKindFilter(actionBtn.dataset.kind);
        return;
      }
      if (actionBtn.dataset.action === 'clear-empty-state-metrics-event-kind') {
        clearEmptyStateMetricsEventKindFilter();
        return;
      }
      if (actionBtn.dataset.action === 'clear-empty-state-metrics-event-kind-collapsed') {
        clearEmptyStateMetricsEventKindFilter();
        return;
      }
      if (actionBtn.dataset.action === 'download-empty-state-metrics-json') {
        downloadEmptyStateMetricsJSON();
        return;
      }
      if (actionBtn.dataset.action === 'reset-empty-state-metrics') {
        resetEmptyStateMetrics();
        return;
      }
      if (actionBtn.dataset.action === 'hide-empty-state-metrics-panel') {
        hideEmptyStateMetricsPanel();
        return;
      }
      if (actionBtn.dataset.action === 'show-empty-state-metrics-panel') {
        showEmptyStateMetricsPanel();
        return;
      }
      if (actionBtn.dataset.action === 'dismiss-empty-metrics-enable-hint') {
        dismissEmptyMetricsEnableHint();
        return;
      }
      if (actionBtn.dataset.action === 'copy-empty-metrics-enable-url') {
        copyEmptyMetricsEnableURL();
        return;
      }
    }
    var nav = ev.target.closest('[data-nav-target]');
    if (nav) {
      selectNode(nav.dataset.navTarget);
      return;
    }
    // Click count/reason (not a scenario link / copy button) → jump to first visible matching fail.
    var failJump = ev.target.closest('.fail-reason-count, .fail-reason-text, .fail-reason-row');
    if (failJump) {
      if (ev.target.closest('[data-action="copy-fail-reason-link"], [data-action="copy-fail-reason-snippet"], [data-action="copy-all-fail-reason-snippets"], [data-action="copy-all-fail-reason-links"], [data-action="clear-report-filters"], [data-action="restore-fail-only-view"], [data-action="undo-clear-report-filters"]')) return;
      var row = failJump.classList.contains('fail-reason-row')
        ? failJump
        : failJump.closest('.fail-reason-row');
      // Ignore clicks that originated on a scenario/hook link (handled above).
      if (row && !ev.target.closest('a[data-nav-target]')) {
        // Only treat count/text as the intentional row jump affordance.
        if (ev.target.closest('.fail-reason-count, .fail-reason-text')) {
          jumpFailReasonRow(row);
          return;
        }
      }
    }
    var thumb = ev.target.closest('[data-shot-src]');
    if (thumb) {
      openLightboxFromThumb(thumb);
      return;
    }
    var navBtn = ev.target.closest('[data-lightbox-nav]');
    if (navBtn) {
      ev.preventDefault();
      stepLightbox(parseInt(navBtn.dataset.lightboxNav, 10) || 0);
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (navigateEmptyStateMetricsMetaPresetMenu(ev)) return;
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      var presetMenu = document.getElementById('overview-empty-state-metrics-meta-preset-menu');
      if (presetMenu && !presetMenu.hasAttribute('hidden')) {
        ev.preventDefault();
        closeEmptyStateMetricsMetaPresetMenu();
        var chipFocus = document.getElementById('overview-empty-state-metrics-meta-preset-chip');
        if (chipFocus && typeof chipFocus.focus === 'function') {
          try { chipFocus.focus(); } catch (eFocus) {}
        }
        return;
      }
      if (isLightboxOpen()) {
        closeLightbox();
        return;
      }
      // Empty fail-reason state: Esc clears filters (unless typing in an input).
      if (!isTypingTarget(ev.target) && failReasonEmptyStateActive()) {
        ev.preventDefault();
        clearReportFilters({ source: 'esc' });
        return;
      }
      return;
    }
    if ((ev.key === 'ArrowDown' || ev.key === 'Down') && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
      var chipKey = document.getElementById('overview-empty-state-metrics-meta-preset-chip');
      if (chipKey && document.activeElement === chipKey && !isTypingTarget(ev.target)) {
        ev.preventDefault();
        openEmptyStateMetricsMetaPresetMenu(chipKey);
        return;
      }
    }
    // Ctrl/Cmd+Z undoes last clear / fail-only restore when a snapshot exists.
    // Skip while typing so native text undo still works in search.
    if ((ev.key === 'z' || ev.key === 'Z') && (ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey) {
      if (!isTypingTarget(ev.target) && lastFilterSnapshot) {
        ev.preventDefault();
        undoClearReportFilters({ source: 'ctrlz' });
        return;
      }
    }
    if (isLightboxOpen() && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      ev.preventDefault();
      stepLightbox(ev.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (isTypingTarget(ev.target)) return;
    if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (searchInput) {
        ev.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
      return;
    }
    if (ev.key === 'j' || ev.key === 'J') {
      ev.preventDefault();
      jumpFail(1);
      return;
    }
    if (ev.key === 'k' || ev.key === 'K') {
      ev.preventDefault();
      jumpFail(-1);
    }
  });

  window.addEventListener('hashchange', function () {
    applyHashFromLocation();
  });

  // Default: overview first; URL hash can override for deep links.
  showOverview(true, { updateHash: false });
  applyHashFromLocation();

  window.addEventListener('message', function (ev) {
    var data = ev && ev.data;
    if (!data) return;
    if (data.type === 'studio-reporter:filter') {
      state.query = data.query != null ? String(data.query) : state.query;
      if (data.verdict && data.verdict !== 'all') {
        state.scenario = String(data.verdict);
        state.spec = String(data.verdict);
      } else if (data.verdict === 'all') {
        state.scenario = 'all';
        state.spec = 'all';
      }
      if (searchInput) searchInput.value = state.query || '';
      syncButtons();
      applyFilter();
      persist();
      return;
    }
    if (data.type !== 'studio-reporter:select-node') return;
    selectNode(data.id ? String(data.id) : '');
  });

  // Test / Desktop bridge: sync collect for clipboard smokes (path-style focus deep links).
  window.StudioReportCollectFailSummary = collectFailSummary;
  window.StudioReportFailSummaryLocatorExample = FAIL_SUMMARY_LOCATOR_EXAMPLE;
  window.StudioReportCopyFailSummaryLocatorExample = copyFailSummaryLocatorExample;
  window.StudioReportFailReasonShareURL = failReasonShareURL;
  window.StudioReportCopyFailReasonLink = copyFailReasonLink;
  window.StudioReportFormatFailReasonSnippet = formatFailReasonSnippet;
  window.StudioReportCopyFailReasonSnippet = copyFailReasonSnippet;
  window.StudioReportFormatAllFailReasonSnippets = formatAllFailReasonSnippets;
  window.StudioReportCopyAllFailReasonSnippets = copyAllFailReasonSnippets;
  window.StudioReportFormatAllFailReasonLinks = formatAllFailReasonLinks;
  window.StudioReportCopyAllFailReasonLinks = copyAllFailReasonLinks;
  window.StudioReportSyncFailReasonOverview = syncFailReasonOverview;
  window.StudioReportSyncBulkFailReasonCopyButtons = syncBulkFailReasonCopyButtons;
  window.StudioReportClearReportFilters = clearReportFilters;
  window.StudioReportRestoreFailOnlyView = restoreFailOnlyView;
  window.StudioReportUndoClearReportFilters = undoClearReportFilters;
  window.StudioReportDescribeFilterSnapshot = describeFilterSnapshot;
  window.StudioReportFailReasonEmptyStateActive = failReasonEmptyStateActive;
  window.StudioReportEmptyStateMetrics = snapshotEmptyStateMetrics;
  window.StudioReportReadStudioReportMeta = readStudioReportMeta;
  window.StudioReportEmptyStateMetricsReportMeta = emptyStateMetricsReportMeta;
  window.StudioReportBuildEmptyStateMetricsDownloadName = buildEmptyStateMetricsDownloadName;
  window.StudioReportFormatEmptyStateMetricsJSON = formatEmptyStateMetricsJSON;
  window.StudioReportCopyEmptyStateMetricsJSON = copyEmptyStateMetricsJSON;
  window.StudioReportDownloadEmptyStateMetricsJSON = downloadEmptyStateMetricsJSON;
  window.StudioReportFormatEmptyStateMetricsIssueMarkdown = formatEmptyStateMetricsIssueMarkdown;
  window.StudioReportCopyEmptyStateMetricsIssueMarkdown = copyEmptyStateMetricsIssueMarkdown;
  window.StudioReportDownloadEmptyStateMetricsIssueMarkdown = downloadEmptyStateMetricsIssueMarkdown;
  window.StudioReportToggleEmptyStateMetricsEvents = toggleEmptyStateMetricsEvents;
  window.StudioReportEmptyStateMetricsEventsExpanded = emptyStateMetricsEventsExpanded;
  window.StudioReportSetEmptyStateMetricsEventsExpanded = setEmptyStateMetricsEventsExpanded;
  window.StudioReportSyncEmptyStateMetricsEvents = syncEmptyStateMetricsEvents;
  window.StudioReportFormatEmptyStateMetricsEventLine = formatEmptyStateMetricsEventLine;
  window.StudioReportCopyEmptyStateMetricsEventLine = copyEmptyStateMetricsEventLine;
  window.StudioReportFormatEmptyStateMetricsVisibleEventLines = formatEmptyStateMetricsVisibleEventLines;
  window.StudioReportCopyEmptyStateMetricsVisibleEventLines = copyEmptyStateMetricsVisibleEventLines;
  window.StudioReportVisibleEmptyStateMetricsEventIndexes = visibleEmptyStateMetricsEventIndexes;
  window.StudioReportFormatEmptyStateMetricsVisibleJSON = formatEmptyStateMetricsVisibleJSON;
  window.StudioReportCopyEmptyStateMetricsVisibleJSON = copyEmptyStateMetricsVisibleJSON;
  window.StudioReportDownloadEmptyStateMetricsVisibleJSON = downloadEmptyStateMetricsVisibleJSON;
  window.StudioReportEmptyStateMetricsEventKindFilter = emptyStateMetricsEventKindFilter;
  window.StudioReportSetEmptyStateMetricsEventKindFilter = setEmptyStateMetricsEventKindFilter;
  window.StudioReportClearEmptyStateMetricsEventKindFilter = clearEmptyStateMetricsEventKindFilter;
  window.StudioReportStripEmptyMetricsKindFromLocation = stripEmptyMetricsKindFromLocation;
  window.StudioReportEmptyStateMetricsPanelSnapshot = emptyStateMetricsPanelSnapshot;
  window.StudioReportResetEmptyStateMetrics = resetEmptyStateMetrics;
  window.StudioReportHideEmptyStateMetricsPanel = hideEmptyStateMetricsPanel;
  window.StudioReportSetEmptyStateMetricsPanelVisible = setEmptyStateMetricsPanelVisible;
  window.StudioReportShowEmptyStateMetricsPanel = showEmptyStateMetricsPanel;
  window.StudioReportDismissEmptyMetricsEnableHint = dismissEmptyMetricsEnableHint;
  window.StudioReportFormatEmptyMetricsEnableURL = formatEmptyMetricsEnableURL;
  window.StudioReportCopyEmptyMetricsEnableURL = copyEmptyMetricsEnableURL;
  window.StudioReportShortenEmptyMetricsEnableURL = shortenEmptyMetricsEnableURL;
  window.StudioReportDescribeEmptyMetricsEnableURLPreview = describeEmptyMetricsEnableURLPreview;
  window.StudioReportDescribeEmptyMetricsEnableKindSummary = describeEmptyMetricsEnableKindSummary;
  window.StudioReportDescribeEmptyMetricsEnableURLButtonSummary = describeEmptyMetricsEnableURLButtonSummary;
  window.StudioReportSyncEmptyMetricsEnableURLButtons = syncEmptyMetricsEnableURLButtons;
  window.StudioReportSyncEmptyMetricsEnableHint = syncEmptyMetricsEnableHint;
  window.StudioReportFormatEmptyStateMetricsReportSummary = formatEmptyStateMetricsReportSummary;
  window.StudioReportGetEmptyStateMetricsMetaFieldPrefs = getEmptyStateMetricsMetaFieldPrefs;
  window.StudioReportSetEmptyStateMetricsMetaFieldPrefs = setEmptyStateMetricsMetaFieldPrefs;
  window.StudioReportResetEmptyStateMetricsMetaFieldPrefs = resetEmptyStateMetricsMetaFieldPrefs;
  window.StudioReportSetEmptyStateMetricsMetaFieldGroup = setEmptyStateMetricsMetaFieldGroup;
  window.StudioReportMoveEmptyStateMetricsMetaField = moveEmptyStateMetricsMetaField;
  window.StudioReportToggleEmptyStateMetricsMetaFieldsEditor = toggleEmptyStateMetricsMetaFieldsEditor;
  window.StudioReportFormatEmptyStateMetricsMetaFieldPrefsJSON = formatEmptyStateMetricsMetaFieldPrefsJSON;
  window.StudioReportCopyEmptyStateMetricsMetaFieldPrefsJSON = copyEmptyStateMetricsMetaFieldPrefsJSON;
  window.StudioReportDownloadEmptyStateMetricsMetaFieldPrefsJSON = downloadEmptyStateMetricsMetaFieldPrefsJSON;
  window.StudioReportApplyEmptyStateMetricsMetaFieldPrefsJSON = applyEmptyStateMetricsMetaFieldPrefsJSON;
  window.StudioReportImportEmptyStateMetricsMetaFieldPrefsFromPrompt = importEmptyStateMetricsMetaFieldPrefsFromPrompt;
  window.StudioReportListEmptyStateMetricsMetaFieldNamedPresets = listEmptyStateMetricsMetaFieldNamedPresets;
  window.StudioReportGetActiveEmptyStateMetricsMetaFieldNamedPresetId = getActiveEmptyStateMetricsMetaFieldNamedPresetId;
  window.StudioReportApplyEmptyStateMetricsMetaFieldNamedPreset = applyEmptyStateMetricsMetaFieldNamedPreset;
  window.StudioReportSaveEmptyStateMetricsMetaFieldNamedPreset = saveEmptyStateMetricsMetaFieldNamedPreset;
  window.StudioReportSaveEmptyStateMetricsMetaFieldNamedPresetFromPrompt = saveEmptyStateMetricsMetaFieldNamedPresetFromPrompt;
  window.StudioReportDeleteEmptyStateMetricsMetaFieldNamedPreset = deleteEmptyStateMetricsMetaFieldNamedPreset;
  window.StudioReportDeleteActiveEmptyStateMetricsMetaFieldNamedPreset = deleteActiveEmptyStateMetricsMetaFieldNamedPreset;
  window.StudioReportFormatEmptyStateMetricsMetaFieldNamedPresetsJSON = formatEmptyStateMetricsMetaFieldNamedPresetsJSON;
  window.StudioReportCopyEmptyStateMetricsMetaFieldNamedPresetsJSON = copyEmptyStateMetricsMetaFieldNamedPresetsJSON;
  window.StudioReportApplyEmptyStateMetricsMetaFieldNamedPresetsJSON = applyEmptyStateMetricsMetaFieldNamedPresetsJSON;
  window.StudioReportImportEmptyStateMetricsMetaFieldNamedPresetsFromPrompt = importEmptyStateMetricsMetaFieldNamedPresetsFromPrompt;
  window.StudioReportReadEmptyMetricsMetaPresetFromQuery = readEmptyMetricsMetaPresetFromQuery;
  window.StudioReportApplyEmptyMetricsMetaPresetFromQuery = applyEmptyMetricsMetaPresetFromQuery;
  window.StudioReportSyncEmptyMetricsMetaPresetInLocation = syncEmptyMetricsMetaPresetInLocation;
  window.StudioReportSyncEmptyStateMetricsMetaPresetToolbarChip = syncEmptyStateMetricsMetaPresetToolbarChip;
  window.StudioReportOpenEmptyStateMetricsMetaFieldsEditor = openEmptyStateMetricsMetaFieldsEditor;
  window.StudioReportOpenEmptyStateMetricsMetaPresetMenu = openEmptyStateMetricsMetaPresetMenu;
  window.StudioReportCloseEmptyStateMetricsMetaPresetMenu = closeEmptyStateMetricsMetaPresetMenu;
  window.StudioReportNavigateEmptyStateMetricsMetaPresetMenu = navigateEmptyStateMetricsMetaPresetMenu;
  window.StudioReportEmptyStateMetricsMetaPresetMenuIsOpen = emptyStateMetricsMetaPresetMenuIsOpen;
  window.StudioReportDescribeEmptyStateMetricsMetaFieldNamedPreset = describeEmptyStateMetricsMetaFieldNamedPreset;
  window.StudioReportFormatEmptyStateMetricsMetaFieldIdList = formatEmptyStateMetricsMetaFieldIdList;
  window.StudioReportCycleEmptyStateMetricsMetaFieldNamedPreset = cycleEmptyStateMetricsMetaFieldNamedPreset;
  window.StudioReportActivateEmptyStateMetricsMetaPresetChip = activateEmptyStateMetricsMetaPresetChip;
  window.StudioReportResetEmptyStateMetricsMetaFieldNamedPresetToDefault = resetEmptyStateMetricsMetaFieldNamedPresetToDefault;

  window.StudioReportFormatEmptyStateMetricsMetaFieldValue = formatEmptyStateMetricsMetaFieldValue;
  window.StudioReportSyncEmptyStateMetricsMetaFieldsEditor = syncEmptyStateMetricsMetaFieldsEditor;

  window.StudioReportSetEmptyStateMetricsMetaMoreExpanded = setEmptyStateMetricsMetaMoreExpanded;
  window.StudioReportToggleEmptyStateMetricsMetaMore = toggleEmptyStateMetricsMetaMore;
  window.StudioReportSyncEmptyMetricsMetaInLocation = syncEmptyMetricsMetaInLocation;
  window.StudioReportApplyEmptyMetricsMetaMoreFromQuery = applyEmptyMetricsMetaMoreFromQuery;
  window.StudioReportReadEmptyMetricsMetaMoreFromQuery = readEmptyMetricsMetaMoreFromQuery;
  window.StudioReportFormatEmptyStateMetricsReportSummarySecondary = formatEmptyStateMetricsReportSummarySecondary;
  window.StudioReportFormatEmptyStateMetricsReportSummaryPrimary = formatEmptyStateMetricsReportSummaryPrimary;
  window.StudioReportCopyEmptyStateMetricsReportSummary = copyEmptyStateMetricsReportSummary;
  window.StudioReportSyncEmptyStateMetricsPanel = syncEmptyStateMetricsPanel;
  window.StudioReportEmptyStateMetricsPanelEnabled = emptyStateMetricsPanelEnabled;
  // Initial paint when enabled via query/localStorage before any action.
  
  document.addEventListener('change', function (ev) {
    var t = ev && ev.target;
    if (t && t.dataset && t.dataset.action === 'set-empty-state-metrics-meta-field-group') {
      setEmptyStateMetricsMetaFieldGroup(t.dataset.metaField, t.value);
    }
  });
try { syncEmptyStateMetricsPanel(); } catch (e) {}
  try { syncEmptyMetricsEnableHint(); } catch (e2) {}
  try { applyEmptyMetricsKindFromQuery(); } catch (e3) {}
  try { applyEmptyMetricsMetaMoreFromQuery(); } catch (eMeta) {}
  try { applyEmptyMetricsMetaPresetFromQuery(); } catch (ePreset) {}
  try { syncEmptyMetricsEnableURLButtons(); } catch (e4) {}
  window.StudioReportReadEmptyMetricsKindFromQuery = readEmptyMetricsKindFromQuery;
  window.StudioReportApplyEmptyMetricsKindFromQuery = applyEmptyMetricsKindFromQuery;
  window.StudioReportFilterState = function () {
    return { query: state.query, spec: state.spec, scenario: state.scenario, failStepsOnly: !!failStepsOnly };
  };
  window.StudioReportLastFilterSnapshot = function () {
    return lastFilterSnapshot ? {
      query: lastFilterSnapshot.query,
      spec: lastFilterSnapshot.spec,
      scenario: lastFilterSnapshot.scenario,
      failStepsOnly: !!lastFilterSnapshot.failStepsOnly
    } : null;
  };
})();
