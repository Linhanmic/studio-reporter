package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsReset verifies 「清零」zeros counters and the event ring
// so a UX sampling pass can restart cleanly.
func TestEmptyStateMetricsReset(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-reset",
		Verdict:     VerdictFail,
		Failed:      true,
		Specs: []SpecReport{{
			ID:       "spec:specs/auth/login.spec",
			Heading:  "Login",
			FileName: "specs/auth/login.spec",
			Verdict:  VerdictFail,
			Scenarios: []ScenarioReport{{
				ID:      "spec:specs/auth/login.spec-scn-0",
				Heading: "Bad password",
				Verdict: VerdictFail,
				Items: []ItemReport{{
					Kind: "step",
					Step: &StepReport{
						ActualText:   "Assert password",
						Verdict:      VerdictFail,
						ErrorMessage: "assertion failed: password",
					},
				}},
			}},
		}},
	}
	html, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	for _, want := range []string{
		`reset-empty-state-metrics`,
		`StudioReportResetEmptyStateMetrics`,
		`清零`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics reset smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-reset', v); }
  function go() {
    var metrics = window.StudioReportEmptyStateMetrics;
    var reset = window.StudioReportResetEmptyStateMetrics;
    var clear = window.StudioReportClearReportFilters;
    var sync = window.StudioReportSyncEmptyStateMetricsPanel;
    var textEl = document.getElementById('overview-empty-state-metrics-text');
    var btn = document.querySelector('[data-action="reset-empty-state-metrics"]');
    if (typeof metrics !== 'function' || typeof reset !== 'function' || typeof clear !== 'function' || !btn) {
      mark('missing');
      return;
    }
    window.StudioReportShowEmptyStateMetrics = true;
    if (typeof sync === 'function') sync();
    clear();
    clear({ source: 'esc' });
    var before = metrics();
    if (!(before.clear >= 1 && before.escClear >= 1 && before.events.length >= 2)) {
      mark('fail-before:' + JSON.stringify(before));
      return;
    }
    var after = reset();
    var text = String((textEl && textEl.textContent) || '');
    var ok = after && after.clear === 0 && after.escClear === 0 && after.restoreFailOnly === 0
      && after.undo === 0 && after.ctrlZUndo === 0 && Array.isArray(after.events) && after.events.length === 0
      && /clear=0/.test(text) && /esc=0/.test(text);
    mark(ok ? 'ok' : ('fail-after:' + JSON.stringify(after) + ';text=' + text));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else setTimeout(go, 100);
})();
</script>`
	injected := body
	if strings.Contains(injected, "</body>") {
		injected = strings.Replace(injected, "</body>", probe+"</body>", 1)
	} else {
		injected += probe
	}
	if err := os.WriteFile(index, []byte(injected), 0o644); err != nil {
		t.Fatal(err)
	}
	dom := chromeDumpDOM(t, chrome, pathToFileURL(index))
	if !strings.Contains(dom, `data-reset="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-reset="`); i >= 0 {
			rest := dom[i+len(`data-reset="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-reset=ok; got %q", marker)
	}
}
