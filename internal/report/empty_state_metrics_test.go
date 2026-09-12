package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsRecordsActions verifies StudioReportEmptyStateMetrics
// increments counters for clear / restoreFailOnly / undo (and Esc / Ctrl+Z sources).
func TestEmptyStateMetricsRecordsActions(t *testing.T) {
	r := &Report{
		ProjectName: "empty-metrics",
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
		`recordEmptyStateEvent`,
		`StudioReportEmptyStateMetrics`,
		`emptyStateMetrics`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-state metrics smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-metrics', v); }
  function go() {
    var metrics = window.StudioReportEmptyStateMetrics;
    var clear = window.StudioReportClearReportFilters;
    var restore = window.StudioReportRestoreFailOnlyView;
    var undo = window.StudioReportUndoClearReportFilters;
    if (typeof metrics !== 'function' || typeof clear !== 'function' || typeof restore !== 'function' || typeof undo !== 'function') {
      mark('missing');
      return;
    }
    restore();
    clear({ source: 'esc' });
    undo({ source: 'ctrlz' });
    clear();
    undo();
    var m = metrics();
    var ok = m.restoreFailOnly >= 1 && m.escClear >= 1 && m.ctrlZUndo >= 1 && m.clear >= 1 && m.undo >= 1
      && Array.isArray(m.events) && m.events.length >= 5;
    mark(ok ? ('ok:' + JSON.stringify({
      clear: m.clear, restoreFailOnly: m.restoreFailOnly, undo: m.undo, escClear: m.escClear, ctrlZUndo: m.ctrlZUndo, n: m.events.length
    })) : ('fail:' + JSON.stringify(m)));
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
	if !strings.Contains(dom, `data-metrics="ok`) {
		marker := ""
		if i := strings.Index(dom, `data-metrics="`); i >= 0 {
			rest := dom[i+len(`data-metrics="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-metrics=ok…; got %q", marker)
	}
}
