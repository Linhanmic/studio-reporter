package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsEventKindFilter verifies expanded event rows can be
// filtered by kind via chips + bridge, while copy still uses original indices.
func TestEmptyStateMetricsEventKindFilter(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-event-kind",
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
		`filter-empty-state-metrics-event-kind`,
		`StudioReportSetEmptyStateMetricsEventKindFilter`,
		`StudioReportEmptyStateMetricsEventKindFilter`,
		`overview-empty-state-metrics-event-kinds`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-event-kind`) {
		t.Fatal("CSS missing overview-empty-state-metrics-event-kind")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics event kind filter smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-kind-filter', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var getKind = window.StudioReportEmptyStateMetricsEventKindFilter;\n" +
		"    var snap = window.StudioReportEmptyStateMetrics;\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    if (typeof show !== 'function' || typeof setExp !== 'function' || typeof setKind !== 'function' || typeof getKind !== 'function' || typeof snap !== 'function' || !eventsEl) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    if (typeof clear === 'function') { clear(); clear({ source: 'esc' }); }\n" +
		"    setExp(true);\n" +
		"    var metrics = snap();\n" +
		"    var events = (metrics && metrics.events) || [];\n" +
		"    if (events.length < 2) { mark('need-events:' + events.length); return; }\n" +
		"    var allBtns = eventsEl.querySelectorAll('[data-action=\"copy-empty-state-metrics-event\"]');\n" +
		"    var allOk = allBtns.length === events.length;\n" +
		"    var chips = eventsEl.querySelectorAll('[data-action=\"filter-empty-state-metrics-event-kind\"]');\n" +
		"    var chipsOk = chips.length >= 2;\n" +
		"    setKind('escClear');\n" +
		"    var filtered = eventsEl.querySelectorAll('[data-action=\"copy-empty-state-metrics-event\"]');\n" +
		"    var onlyEsc = true;\n" +
		"    for (var i = 0; i < filtered.length; i++) {\n" +
		"      var idx = parseInt(filtered[i].getAttribute('data-event-index'), 10);\n" +
		"      if (!events[idx] || events[idx].kind !== 'escClear') onlyEsc = false;\n" +
		"    }\n" +
		"    var filterOk = getKind() === 'escClear' && filtered.length >= 1 && filtered.length < events.length && onlyEsc;\n" +
		"    var active = eventsEl.querySelector('[data-action=\"filter-empty-state-metrics-event-kind\"][data-kind=\"escClear\"]');\n" +
		"    var activeOk = !!(active && active.classList.contains('is-active'));\n" +
		"    setKind('');\n" +
		"    var resetOk = getKind() === '' && eventsEl.querySelectorAll('[data-action=\"copy-empty-state-metrics-event\"]').length === events.length;\n" +
		"    mark((allOk && chipsOk && filterOk && activeOk && resetOk) ? 'ok' : ('fail:all=' + allOk + ';chips=' + chipsOk + ';filter=' + filterOk + ';active=' + activeOk + ';reset=' + resetOk + ';n=' + events.length + ';f=' + filtered.length));\n" +
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
	if !strings.Contains(dom, `data-kind-filter="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-kind-filter="`); i >= 0 {
			rest := dom[i+len(`data-kind-filter="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-kind-filter=ok; got %q", marker)
	}
}
