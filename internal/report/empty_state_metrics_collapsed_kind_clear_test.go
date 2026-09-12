package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsCollapsedKindClear verifies a collapsed-only clear-kind
// control appears beside the events toggle and clears without expanding.
func TestEmptyStateMetricsCollapsedKindClear(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-collapsed-clear",
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
		`clear-empty-state-metrics-event-kind-collapsed`,
		`overview-empty-state-metrics-kind-clear-collapsed`,
		`清除 kind`,
		`syncEmptyStateMetricsCollapsedKindClear`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for collapsed kind-clear smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-collapsed-clear', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var getKind = window.StudioReportEmptyStateMetricsEventKindFilter;\n" +
		"    var sync = window.StudioReportSyncEmptyStateMetricsEvents;\n" +
		"    var clearBtn = document.querySelector('[data-action=\"clear-empty-state-metrics-event-kind-collapsed\"]');\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    if (typeof show !== 'function' || typeof setExp !== 'function' || typeof setKind !== 'function' || typeof getKind !== 'function' || typeof sync !== 'function' || !clearBtn || !eventsEl) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    setKind('escClear');\n" +
		"    setExp(false);\n" +
		"    sync();\n" +
		"    var shownOk = !clearBtn.hasAttribute('hidden') && getKind() === 'escClear' && eventsEl.hasAttribute('hidden');\n" +
		"    try { history.replaceState(null, '', location.pathname + '?emptyMetrics=1&emptyMetricsKind=escClear#overview'); } catch (e) {}\n" +
		"    clearBtn.click();\n" +
		"    var clearedOk = getKind() === '' && clearBtn.hasAttribute('hidden') && !/[?&]emptyMetricsKind=/.test(location.search) && eventsEl.hasAttribute('hidden');\n" +
		"    setKind('undo');\n" +
		"    setExp(true);\n" +
		"    sync();\n" +
		"    var hiddenWhenExpanded = clearBtn.hasAttribute('hidden');\n" +
		"    mark((shownOk && clearedOk && hiddenWhenExpanded) ? 'ok' : ('fail:show=' + shownOk + ';clr=' + clearedOk + ';hid=' + hiddenWhenExpanded));\n" +
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
	if !strings.Contains(dom, `data-collapsed-clear="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-collapsed-clear="`); i >= 0 {
			rest := dom[i+len(`data-collapsed-clear="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-collapsed-clear=ok; got %q", marker)
	}
}
