(function () {
  var KEY = 'studio-report-filter';
  var state = { spec: 'all', scenario: 'all' };
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && saved.spec) state.spec = saved.spec;
    if (saved && saved.scenario) state.scenario = saved.scenario;
  } catch (e) {}

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

  function applyFilter() {
    syncButtons();
    persist();

    var blocks = document.querySelectorAll('.result-pane .report-block');
    blocks.forEach(function (el) { el.classList.remove('filter-hidden'); });

    var specFilter = state.spec;
    var scenarioFilter = state.scenario;

    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"]').forEach(function (scn) {
      if (scenarioFilter !== 'all' && scn.dataset.verdict !== scenarioFilter) {
        scn.classList.add('filter-hidden');
      } else {
        showSubtree(scn);
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
      el.classList.toggle('filter-hidden', !anyVisible);
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
      spec.classList.toggle('filter-hidden', !anyVisibleScenario || !specVerdictMatch);
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

  applyFilter();
})();
