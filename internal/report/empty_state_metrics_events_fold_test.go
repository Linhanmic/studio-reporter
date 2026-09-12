package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsEventsFold verifies counts stay visible while the event
// ring stays collapsed by default and expands on toggle.
func TestEmptyStateMetricsEventsFold(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-fold",
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
		`toggle-empty-state-metrics-events`,
		`overview-empty-state-metrics-events`,
		`StudioReportToggleEmptyStateMetricsEvents`,
		`StudioReportSetEmptyStateMetricsEventsExpanded`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-events`) {
		t.Fatal("CSS missing overview-empty-state-metrics-events")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics events fold smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-fold', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var toggle = window.StudioReportToggleEmptyStateMetricsEvents;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var expanded = window.StudioReportEmptyStateMetricsEventsExpanded;\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    var textEl = document.getElementById('overview-empty-state-metrics-text');\n" +
		"    var btn = document.querySelector('[data-action=\"toggle-empty-state-metrics-events\"]');\n" +
		"    if (typeof show !== 'function' || typeof toggle !== 'function' || typeof setExp !== 'function' || !eventsEl || !textEl || !btn) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    try { localStorage.removeItem('studio-report-empty-metrics-events'); } catch (e) {}\n" +
		"    setExp(false);\n" +
		"    show();\n" +
		"    if (typeof clear === 'function') { clear(); clear({ source: 'esc' }); }\n" +
		"    var countsOk = /clear=/.test(String(textEl.textContent || ''));\n" +
		"    var collapsedOk = eventsEl.hasAttribute('hidden') && expanded() === false && /事件\\(\\d+\\)/.test(btn.textContent || '');\n" +
		"    toggle();\n" +
		"    var openOk = !eventsEl.hasAttribute('hidden') && expanded() === true && (eventsEl.textContent || '').length > 0;\n" +
		"    toggle();\n" +
		"    var recloseOk = eventsEl.hasAttribute('hidden') && expanded() === false;\n" +
		"    mark((countsOk && collapsedOk && openOk && recloseOk) ? 'ok' : ('fail:c=' + countsOk + ';col=' + collapsedOk + ';open=' + openOk + ';re=' + recloseOk + ';btn=' + btn.textContent));\n" +
		"  }\n" +
		"  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);\n" +
		"  else setTimeout(go, 100);\n" +
		"})();\n</script>"
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
	if !strings.Contains(dom, `data-fold="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-fold="`); i >= 0 {
			rest := dom[i+len(`data-fold="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-fold=ok; got %q", marker)
	}
}
