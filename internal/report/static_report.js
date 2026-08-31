(function () {
  var group = document.querySelector('.filter-group');
  if (!group) return;

  var KEY = 'studio-report-filter';
  var filter = 'all';
  try {
    var saved = sessionStorage.getItem(KEY);
    if (saved) filter = saved;
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

  function scenarioMatchesFilter(scn, f) {
    if (scn.dataset.verdict === f) return true;
    var inner = scn.querySelectorAll('.report-block[data-kind="step"], .report-block[data-kind="concept"]');
    for (var i = 0; i < inner.length; i++) {
      if (inner[i].dataset.verdict === f) return true;
    }
    return false;
  }

  function showScenarioSubtree(scn) {
    scn.classList.remove('filter-hidden');
    scn.querySelectorAll('.report-block').forEach(function (el) {
      el.classList.remove('filter-hidden');
    });
  }

  function applyFilter(next) {
    filter = next || 'all';
    try { sessionStorage.setItem(KEY, filter); } catch (e) {}

    group.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.filter === filter);
      btn.setAttribute('aria-pressed', btn.dataset.filter === filter ? 'true' : 'false');
    });

    var blocks = document.querySelectorAll('.result-pane .report-block');
    blocks.forEach(function (el) { el.classList.remove('filter-hidden'); });

    if (filter === 'all') return;

    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"]').forEach(function (scn) {
      if (scenarioMatchesFilter(scn, filter)) {
        showScenarioSubtree(scn);
      } else {
        scn.classList.add('filter-hidden');
      }
    });

    var ancestors = Array.prototype.slice.call(document.querySelectorAll(
      '.result-pane .report-block[data-kind="spec"],' +
      '.result-pane .report-block[data-kind="datarow"],' +
      '.result-pane .report-block[data-kind="datadriven"]'
    ));
    ancestors.sort(function (a, b) { return blockDepth(b) - blockDepth(a); });
    ancestors.forEach(function (el) {
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
  }

  group.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.filter-btn');
    if (!btn) return;
    applyFilter(btn.dataset.filter || 'all');
  });

  applyFilter(filter);
})();
