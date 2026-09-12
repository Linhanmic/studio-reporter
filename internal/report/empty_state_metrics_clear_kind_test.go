package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsClearEventKindFilter verifies the clear-filter control
// resets kind chips and strips emptyMetricsKind from the page URL.
func TestEmptyStateMetricsClearEventKindFilter(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-clear-kind",
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
		`clear-empty-state-metrics-event-kind`,
		`StudioReportClearEmptyStateMetricsEventKindFilter`,
		`StudioReportStripEmptyMetricsKindFromLocation`,
		`overview-empty-state-metrics-event-kind-clear`,
		`清除过滤`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-event-kind-clear`) {
		t.Fatal("CSS missing overview-empty-state-metrics-event-kind-clear")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics clear-kind smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-clear-kind', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clearFilters = window.StudioReportClearReportFilters;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var getKind = window.StudioReportEmptyStateMetricsEventKindFilter;\n" +
		"    var clearKind = window.StudioReportClearEmptyStateMetricsEventKindFilter;\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    if (typeof show !== 'function' || typeof setKind !== 'function' || typeof getKind !== 'function' || typeof clearKind !== 'function' || typeof setExp !== 'function' || !eventsEl) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    if (typeof clearFilters === 'function') { clearFilters(); clearFilters({ source: 'esc' }); }\n" +
		"    setExp(true);\n" +
		"    setKind('escClear');\n" +
		"    try { history.replaceState(null, '', location.pathname + '?emptyMetrics=1&emptyMetricsKind=escClear&foo=1#overview'); } catch (e) {}\n" +
		"    var beforeBtn = eventsEl.querySelector('[data-action=\"clear-empty-state-metrics-event-kind\"]');\n" +
		"    var beforeOk = getKind() === 'escClear' && !!beforeBtn && /emptyMetricsKind=escClear/.test(location.search);\n" +
		"    clearKind();\n" +
		"    var afterBtn = eventsEl.querySelector('[data-action=\"clear-empty-state-metrics-event-kind\"]');\n" +
		"    var afterOk = getKind() === '' && !afterBtn\n" +
		"      && /[?&]emptyMetrics=1(?:&|#|$)/.test(location.href)\n" +
		"      && !/[?&]emptyMetricsKind=/.test(location.search)\n" +
		"      && /[?&]foo=1(?:&|#|$)/.test(location.href);\n" +
		"    // 「全部」chip also clears URL kind via the same path.\n" +
		"    setKind('undo');\n" +
		"    try { history.replaceState(null, '', location.pathname + '?emptyMetrics=1&emptyMetricsKind=undo#overview'); } catch (e2) {}\n" +
		"    var allBtn = eventsEl.querySelector('[data-action=\"filter-empty-state-metrics-event-kind\"][data-kind=\"\"]');\n" +
		"    if (allBtn) allBtn.click();\n" +
		"    var viaAllOk = getKind() === '' && !/[?&]emptyMetricsKind=/.test(location.search);\n" +
		"    mark((beforeOk && afterOk && viaAllOk) ? 'ok' : ('fail:before=' + beforeOk + ';after=' + afterOk + ';all=' + viaAllOk + ';search=' + location.search));\n" +
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
	if !strings.Contains(dom, `data-clear-kind="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-clear-kind="`); i >= 0 {
			rest := dom[i+len(`data-clear-kind="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-clear-kind=ok; got %q", marker)
	}
}
