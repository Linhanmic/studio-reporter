package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsKindEmptyGuidance verifies filtered-empty event rings
// offer clear-filter / show-all affordances.
func TestEmptyStateMetricsKindEmptyGuidance(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-kind-empty",
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
		`当前 kind（`,
		`显示全部`,
		`clear-empty-state-metrics-event-kind`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics kind-empty guidance smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-kind-empty', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var getKind = window.StudioReportEmptyStateMetricsEventKindFilter;\n" +
		"    var reset = window.StudioReportResetEmptyStateMetrics;\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    if (typeof show !== 'function' || typeof setExp !== 'function' || typeof setKind !== 'function' || typeof getKind !== 'function' || typeof reset !== 'function' || !eventsEl) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    setExp(true);\n" +
		"    // Persist a kind with no matching events after reset.\n" +
		"    setKind('escClear');\n" +
		"    reset();\n" +
		"    setExp(true);\n" +
		"    setKind('escClear');\n" +
		"    var empty = eventsEl.querySelector('.overview-empty-state-metrics-events-empty');\n" +
		"    var clearBtn = eventsEl.querySelector('[data-action=\"clear-empty-state-metrics-event-kind\"]');\n" +
		"    var allBtn = eventsEl.querySelector('[data-action=\"filter-empty-state-metrics-event-kind\"][data-kind=\"\"]');\n" +
		"    var guidanceOk = !!(empty && /当前 kind/.test(empty.textContent || '') && clearBtn && allBtn && getKind() === 'escClear');\n" +
		"    if (allBtn) allBtn.click();\n" +
		"    var clearedOk = getKind() === '' && !eventsEl.querySelector('[data-action=\"clear-empty-state-metrics-event-kind\"]');\n" +
		"    mark((guidanceOk && clearedOk) ? 'ok' : ('fail:g=' + guidanceOk + ';c=' + clearedOk + ';k=' + getKind() + ';t=' + String(empty && empty.textContent || '').slice(0, 80)));\n" +
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
	if !strings.Contains(dom, `data-kind-empty="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-kind-empty="`); i >= 0 {
			rest := dom[i+len(`data-kind-empty="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-kind-empty=ok; got %q", marker)
	}
}
