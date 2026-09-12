package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyMetricsEnableHint verifies the tools-row first-run guide:
// full hint → dismiss to compact 「开启」 → enable hides the hint.
func TestEmptyMetricsEnableHint(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-hint",
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
		`overview-empty-metrics-enable-hint`,
		`show-empty-state-metrics-panel`,
		`dismiss-empty-metrics-enable-hint`,
		`StudioReportShowEmptyStateMetricsPanel`,
		`StudioReportDismissEmptyMetricsEnableHint`,
		`StudioReportSyncEmptyMetricsEnableHint`,
		`?emptyMetrics=1`,
		`知道了`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-metrics-enable-hint`) {
		t.Fatal("CSS missing overview-empty-metrics-enable-hint")
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-metrics-enable-hint.is-compact`) {
		t.Fatal("CSS missing compact enable-hint mode")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics enable hint smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-hint', v); }
  function go() {
    var hint = document.getElementById('overview-empty-metrics-enable-hint');
    var sync = window.StudioReportSyncEmptyMetricsEnableHint;
    var dismiss = window.StudioReportDismissEmptyMetricsEnableHint;
    var show = window.StudioReportShowEmptyStateMetricsPanel;
    var enabled = window.StudioReportEmptyStateMetricsPanelEnabled;
    var hide = window.StudioReportHideEmptyStateMetricsPanel;
    if (!hint || typeof sync !== 'function' || typeof dismiss !== 'function' || typeof show !== 'function' || typeof enabled !== 'function') {
      mark('missing');
      return;
    }
    try { localStorage.removeItem('studio-report-empty-metrics-hint'); } catch (e) {}
    try { localStorage.removeItem('studio-report-empty-metrics'); } catch (e2) {}
    try { window.StudioReportShowEmptyStateMetrics = false; } catch (e3) {}
    sync();
    if (hint.hasAttribute('hidden') || hint.classList.contains('is-compact')) {
      mark('fail-initial');
      return;
    }
    dismiss();
    var ls = '';
    try { ls = String(localStorage.getItem('studio-report-empty-metrics-hint') || ''); } catch (e4) {}
    if (hint.hasAttribute('hidden') || !hint.classList.contains('is-compact') || ls !== 'dismissed') {
      mark('fail-dismiss:hidden=' + hint.hasAttribute('hidden') + ';compact=' + hint.classList.contains('is-compact') + ';ls=' + ls);
      return;
    }
    show();
    if (!enabled() || !hint.hasAttribute('hidden')) {
      mark('fail-show:en=' + enabled() + ';hintHidden=' + hint.hasAttribute('hidden'));
      return;
    }
    hide();
    // After hide, hint returns in compact form (dismissed).
    if (hint.hasAttribute('hidden') || !hint.classList.contains('is-compact')) {
      mark('fail-after-hide:hidden=' + hint.hasAttribute('hidden') + ';compact=' + hint.classList.contains('is-compact'));
      return;
    }
    mark('ok');
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
	if !strings.Contains(dom, `data-hint="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-hint="`); i >= 0 {
			rest := dom[i+len(`data-hint="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-hint=ok; got %q", marker)
	}
}
