package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsPanelKeyboardA11y verifies metrics-panel action buttons
// join the tab order when shown and are removed (tabindex=-1) when hidden.
func TestEmptyStateMetricsPanelKeyboardA11y(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-a11y",
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
		`syncEmptyStateMetricsPanelButtons`,
		`tabindex`,
		`aria-label`,
		`空态操作 metrics`,
		`.overview-empty-state-metrics .action-btn:focus-visible`,
	} {
		if !strings.Contains(body, want) && !strings.Contains(staticReportCSS, want) && !strings.Contains(staticReportJS, want) {
			// body embeds JS+CSS; check either embedded HTML or package vars
			if !strings.Contains(staticReportJS, want) && !strings.Contains(staticReportCSS, want) && !strings.Contains(body, want) {
				t.Fatalf("missing a11y affordance %q", want)
			}
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics .action-btn:focus-visible`) {
		t.Fatal("CSS missing metrics panel focus-visible ring")
	}
	if !strings.Contains(staticReportJS, `syncEmptyStateMetricsPanelButtons`) {
		t.Fatal("JS missing syncEmptyStateMetricsPanelButtons")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics keyboard a11y smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-a11y', v); }
  function go() {
    var panel = document.getElementById('overview-empty-state-metrics');
    var setVis = window.StudioReportSetEmptyStateMetricsPanelVisible;
    var sync = window.StudioReportSyncEmptyStateMetricsPanel;
    var hide = window.StudioReportHideEmptyStateMetricsPanel;
    if (!panel || typeof setVis !== 'function' || typeof sync !== 'function' || typeof hide !== 'function') {
      mark('missing');
      return;
    }
    var actions = ['copy-empty-state-metrics-json', 'download-empty-state-metrics-json', 'reset-empty-state-metrics', 'hide-empty-state-metrics-panel'];
    function btns() {
      return actions.map(function (a) {
        return panel.querySelector('[data-action="' + a + '"]');
      });
    }
    // Shown: natural tab order (no tabindex=-1), aria-hidden false.
    setVis(true);
    sync();
    var shown = btns();
    if (shown.some(function (b) { return !b; })) { mark('fail-missing-btn'); return; }
    var shownOk = shown.every(function (b) {
      return b.getAttribute('tabindex') !== '-1' && b.getAttribute('aria-hidden') !== 'true';
    }) && panel.getAttribute('aria-hidden') === 'false' && panel.getAttribute('role') === 'group';
    if (!shownOk) {
      mark('fail-shown:' + shown.map(function (b) { return b.getAttribute('tabindex') + '/' + b.getAttribute('aria-hidden'); }).join(','));
      return;
    }
    // Focus hide, then hide → focus must leave the panel; buttons tabindex=-1.
    shown[3].focus();
    if (document.activeElement !== shown[3]) { mark('fail-focus-hide-btn'); return; }
    hide();
    var hidden = btns();
    var hiddenOk = hidden.every(function (b) {
      return b.getAttribute('tabindex') === '-1' && b.getAttribute('aria-hidden') === 'true';
    }) && panel.hasAttribute('hidden') && panel.getAttribute('aria-hidden') === 'true'
      && !(panel.contains(document.activeElement));
    mark(hiddenOk ? 'ok' : ('fail-hidden:tab=' + hidden.map(function (b) { return b.getAttribute('tabindex'); }).join(',')
      + ';activeInPanel=' + panel.contains(document.activeElement)));
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
	if !strings.Contains(dom, `data-a11y="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-a11y="`); i >= 0 {
			rest := dom[i+len(`data-a11y="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-a11y=ok; got %q", marker)
	}
}
