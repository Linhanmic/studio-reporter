package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsPanelHide verifies 「隐藏」sets window+localStorage off
// so the panel can be dismissed without editing the URL.
func TestEmptyStateMetricsPanelHide(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-hide",
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
		`hide-empty-state-metrics-panel`,
		`StudioReportHideEmptyStateMetricsPanel`,
		`StudioReportSetEmptyStateMetricsPanelVisible`,
		`隐藏`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics hide smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-hide', v); }
  function go() {
    var panel = document.getElementById('overview-empty-state-metrics');
    var hide = window.StudioReportHideEmptyStateMetricsPanel;
    var setVis = window.StudioReportSetEmptyStateMetricsPanelVisible;
    var enabled = window.StudioReportEmptyStateMetricsPanelEnabled;
    var sync = window.StudioReportSyncEmptyStateMetricsPanel;
    var btn = document.querySelector('[data-action="hide-empty-state-metrics-panel"]');
    if (!panel || typeof hide !== 'function' || typeof setVis !== 'function' || typeof enabled !== 'function' || !btn) {
      mark('missing');
      return;
    }
    setVis(true);
    sync();
    if (panel.hasAttribute('hidden') || !enabled()) { mark('fail-not-shown'); return; }
    hide();
    var ls = '';
    try { ls = String(localStorage.getItem('studio-report-empty-metrics') || ''); } catch (e) {}
    var ok = panel.hasAttribute('hidden') && enabled() === false && (ls === '0' || ls === 'false')
      && window.StudioReportShowEmptyStateMetrics === false;
    // Re-open via setter (simulates ?emptyMetrics=1 / debug toggle).
    setVis(true);
    var reopened = !panel.hasAttribute('hidden') && enabled() === true;
    mark((ok && reopened) ? ('ok:ls=' + ls) : ('fail:hidden=' + panel.hasAttribute('hidden') + ';en=' + enabled() + ';ls=' + ls + ';re=' + reopened));
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
	if !strings.Contains(dom, `data-hide="ok`) {
		marker := ""
		if i := strings.Index(dom, `data-hide="`); i >= 0 {
			rest := dom[i+len(`data-hide="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-hide=ok…; got %q", marker)
	}
}
