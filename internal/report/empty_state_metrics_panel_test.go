package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsPanelToggle verifies the Overview metrics strip appears
// when ?emptyMetrics=1 (or StudioReportShowEmptyStateMetrics) is enabled and
// updates after empty-state actions.
func TestEmptyStateMetricsPanelToggle(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-panel",
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
		`overview-empty-state-metrics`,
		`overview-empty-state-metrics-text`,
		`copy-empty-state-metrics-json`,
		`emptyMetrics=1`,
		`StudioReportSyncEmptyStateMetricsPanel`,
		`StudioReportEmptyStateMetricsPanelEnabled`,
		`StudioReportFormatEmptyStateMetricsJSON`,
		`StudioReportFormatEmptyStateMetricsReportSummary`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics`) {
		t.Fatal("CSS missing overview-empty-state-metrics")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics panel smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-panel', v); }
  function go() {
    var panel = document.getElementById('overview-empty-state-metrics');
    var enabled = window.StudioReportEmptyStateMetricsPanelEnabled;
    var sync = window.StudioReportSyncEmptyStateMetricsPanel;
    var clear = window.StudioReportClearReportFilters;
    if (!panel || typeof enabled !== 'function' || typeof sync !== 'function' || typeof clear !== 'function') {
      mark('missing');
      return;
    }
    // Default off.
    sync();
    if (!panel.hasAttribute('hidden')) { mark('fail-default-visible'); return; }
    window.StudioReportShowEmptyStateMetrics = true;
    sync();
    if (panel.hasAttribute('hidden')) { mark('fail-not-shown'); return; }
    clear();
    var textEl = document.getElementById('overview-empty-state-metrics-text');
    var text = String((textEl && textEl.textContent) || panel.textContent || '');
    var btn = panel.querySelector('[data-action="copy-empty-state-metrics-json"]');
    if (!btn) { mark('fail-no-export-btn'); return; }
    var summaryFn = window.StudioReportFormatEmptyStateMetricsReportSummary;
    var summary = typeof summaryFn === 'function' ? String(summaryFn() || '') : '';
    var summaryOk = summary.indexOf('metrics-panel') >= 0 && summary.indexOf('|') < 0;
    var textOk = /clear=1/.test(text) && text.indexOf('metrics-panel') >= 0 && text.indexOf('|') >= 0;
    var titleOk = String(panel.title || '').indexOf('metrics-panel') >= 0;
    mark((textOk && summaryOk && titleOk) ? ('ok:' + text) : ('fail-text:' + text + ';sum=' + summary + ';sumOk=' + summaryOk + ';titleOk=' + titleOk));
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
	if !strings.Contains(dom, `data-panel="ok`) {
		marker := ""
		if i := strings.Index(dom, `data-panel="`); i >= 0 {
			rest := dom[i+len(`data-panel="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-panel=ok…; got %q", marker)
	}
}
