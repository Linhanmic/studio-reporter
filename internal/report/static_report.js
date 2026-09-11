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

  function showSubtree(el) {
    el.classList.remove('filter-hidden');
    el.querySelectorAll('.report-block').forEach(function (inner) {
      inner.classList.remove('filter-hidden');
    });
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

    var blocks = document.querySelectorAll('.result-pane .report-block');
    blocks.forEach(function (el) { el.classList.remove('filter-hidden'); });

    var specFilter = state.spec;
    var scenarioFilter = state.scenario;
    var q = (state.query || '').trim().toLowerCase();

    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"]').forEach(function (scn) {
      var verdictOK = scenarioFilter === 'all' || scn.dataset.verdict === scenarioFilter;
      var queryOK = !q || blockName(scn).indexOf(q) >= 0;
      if (verdictOK && queryOK) {
        showSubtree(scn);
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
            showSubtree(scn);
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

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.query = searchInput.value || '';
      applyFilter();
    });
  }

  applyFilter();

  function setDetailsOpen(open) {
    document.querySelectorAll('.result-pane details.report-block').forEach(function (el) {
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
    });
  });

  var overview = document.getElementById('overview');
  var results = document.getElementById('results');
  function showOverview(show) {
    if (!overview || !results) return;
    overview.classList.toggle('is-hidden', !show);
    if (show) {
      overview.scrollIntoView({ block: 'start' });
    }
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('is-active', show ? el.dataset.navTarget === 'overview' : false);
    });
  }
  function activateNav(id) {
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.navTarget === id);
    });
  }
  document.addEventListener('click', function (ev) {
    var actionBtn = ev.target.closest('[data-action]');
    if (actionBtn) {
      if (actionBtn.dataset.action === 'show-overview') {
        showOverview(true);
        return;
      }
      if (actionBtn.dataset.action === 'export-pdf') {
        // Structured print → PDF (text/links/images). Not a raster collage.
        showOverview(true);
        window.print();
        return;
      }
    }
    var nav = ev.target.closest('[data-nav-target]');
    if (nav) {
      var targetId = nav.dataset.navTarget;
      if (targetId === 'overview') {
        showOverview(true);
        return;
      }
      showOverview(false);
      activateNav(targetId);
      var target = document.getElementById(targetId);
      if (target) {
        if (target.tagName === 'DETAILS') target.open = true;
        target.scrollIntoView({ block: 'start' });
      }
    }
    var thumb = ev.target.closest('[data-shot-src]');
    if (thumb) {
      var dlg = document.getElementById('shot-lightbox');
      var img = document.getElementById('shot-lightbox-img');
      var cap = document.getElementById('shot-lightbox-cap');
      if (dlg && img) {
        img.src = thumb.dataset.shotSrc;
        if (cap) cap.textContent = thumb.dataset.shotCaption || '截图';
        if (typeof dlg.showModal === 'function') dlg.showModal();
      }
    }
  });

  // Default: show overview first (CANoe-style home), keep results below.
  showOverview(true);

  window.addEventListener('message', function (ev) {
    var data = ev && ev.data;
    if (!data || data.type !== 'studio-reporter:select-node') return;
    var id = data.id ? String(data.id) : '';
    if (!id) return;
    if (id === 'overview') {
      showOverview(true);
      return;
    }
    showOverview(false);
    activateNav(id);
    var target = document.getElementById(id);
    if (target) {
      if (target.tagName === 'DETAILS') target.open = true;
      // Open ancestor details so nested scenarios are visible.
      var parent = target.parentElement;
      while (parent) {
        if (parent.tagName === 'DETAILS') parent.open = true;
        parent = parent.parentElement;
      }
      target.scrollIntoView({ block: 'start' });
    }
  });
})();
