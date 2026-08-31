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

  function applyFilter(next) {
    filter = next || 'all';
    try { sessionStorage.setItem(KEY, filter); } catch (e) {}

    group.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.filter === filter);
      btn.setAttribute('aria-pressed', btn.dataset.filter === filter ? 'true' : 'false');
    });

    var blocks = Array.prototype.slice.call(document.querySelectorAll('.result-pane .report-block'));
    if (filter === 'all') {
      blocks.forEach(function (el) { el.classList.remove('filter-hidden'); });
      return;
    }

    blocks.sort(function (a, b) { return blockDepth(b) - blockDepth(a); });
    blocks.forEach(function (el) {
      var match = el.dataset.verdict === filter;
      var children = el.querySelectorAll(':scope > .block-body > .report-block');
      var anyVisible = false;
      for (var i = 0; i < children.length; i++) {
        if (!children[i].classList.contains('filter-hidden')) {
          anyVisible = true;
          break;
        }
      }
      el.classList.toggle('filter-hidden', !(match || anyVisible));
    });
  }

  group.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.filter-btn');
    if (!btn) return;
    applyFilter(btn.dataset.filter || 'all');
  });

  applyFilter(filter);
})();
