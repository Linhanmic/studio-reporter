(function () {
  var KEY = 'studio-report-filter';
  var state = { spec: 'all', scenario: 'all', query: '' };
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

  document.querySelectorAll('.toolbar-actions').forEach(function (group) {
    group.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'expand-all') setDetailsOpen(true);
      if (btn.dataset.action === 'collapse-all') setDetailsOpen(false);
      if (btn.dataset.action === 'copy-fail-summary') copyFailSummary();
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

  function writeHash(id) {
    try {
      var next = (!id || id === 'overview') ? '#overview' : ('#' + id);
      if (location.hash === next) return;
      if (history.replaceState) history.replaceState(null, '', next);
      else location.hash = next;
    } catch (e) {}
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
    var raw = '';
    try { raw = (location.hash || '').replace(/^#/, ''); } catch (e) {}
    if (!raw || raw === 'overview') {
      showOverview(true, { updateHash: false });
      return;
    }
    if (!selectNode(raw, { updateHash: false })) {
      showOverview(true, { updateHash: false });
    }
  }

  function visibleFailScenarios() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.result-pane .report-block[data-kind="scenario"][data-verdict="fail"]')
    ).filter(function (el) { return !el.classList.contains('filter-hidden'); });
  }

  function blockLabel(el) {
    var cell = el.querySelector(':scope > summary .name-cell, :scope > .leaf-summary .name-cell');
    return cell ? (cell.textContent || '').trim() : (el.id || '');
  }

  function collectFailSummary() {
    var fails = visibleFailScenarios();
    if (!fails.length) return '';
    var lines = ['# Studio Reporter — 失败摘要', ''];
    var reasonRows = document.querySelectorAll('.fail-reason-row');
    if (reasonRows.length) {
      lines.push('## 失败原因聚合');
      reasonRows.forEach(function (row) {
        var count = (row.querySelector('.fail-reason-count') || {}).textContent || '';
        var reason = row.getAttribute('data-fail-reason') || '';
        var refs = [];
        row.querySelectorAll('.fail-reason-refs a').forEach(function (a) {
          refs.push((a.textContent || '').trim());
        });
        lines.push('- (' + String(count).trim() + ') ' + reason + (refs.length ? ' — ' + refs.join(', ') : ''));
      });
      lines.push('');
    }
    lines.push('## 失败场景');
    fails.forEach(function (scn, idx) {
      lines.push((idx + 1) + '. ' + blockLabel(scn) + (scn.id ? ' (`' + scn.id + '`)' : ''));
      var bits = [];
      scn.querySelectorAll('.err, .stack, .hook-alert').forEach(function (node) {
        var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) bits.push(text);
      });
      if (bits.length) lines.push('   - ' + bits.slice(0, 4).join(' | '));
    });
    lines.push('');
    lines.push('_由静态报告轻交互复制 · 非完整报告真源_');
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

  document.addEventListener('click', function (ev) {
    var actionBtn = ev.target.closest('[data-action]');
    if (actionBtn) {
      if (actionBtn.dataset.action === 'show-overview') {
        selectNode('overview');
        return;
      }
      if (actionBtn.dataset.action === 'export-pdf') {
        // Structured print → PDF (text/links/images). Not a raster collage.
        showOverview(true);
        window.print();
        return;
      }
      if (actionBtn.dataset.action === 'copy-fail-summary') {
        copyFailSummary();
        return;
      }
    }
    var nav = ev.target.closest('[data-nav-target]');
    if (nav) {
      selectNode(nav.dataset.navTarget);
      return;
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
    if (ev.key === 'Escape') {
      closeLightbox();
      return;
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
})();
