package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsEventLineCopy verifies expanded event rows are
// clickable and copy a single formatted line via the bridge.
func TestEmptyStateMetricsEventLineCopy(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-event-copy",
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
		`copy-empty-state-metrics-event`,
		`StudioReportCopyEmptyStateMetricsEventLine`,
		`StudioReportFormatEmptyStateMetricsEventLine`,
		`overview-empty-state-metrics-event-line`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-event-line`) {
		t.Fatal("CSS missing overview-empty-state-metrics-event-line")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics event copy smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-event-copy', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var format = window.StudioReportFormatEmptyStateMetricsEventLine;\n" +
		"    var copy = window.StudioReportCopyEmptyStateMetricsEventLine;\n" +
		"    var snap = window.StudioReportEmptyStateMetrics;\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    if (typeof show !== 'function' || typeof setExp !== 'function' || typeof format !== 'function' || typeof copy !== 'function' || typeof snap !== 'function' || !eventsEl) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    if (typeof clear === 'function') { clear(); clear({ source: 'esc' }); }\n" +
		"    setExp(true);\n" +
		"    var metrics = snap();\n" +
		"    var events = (metrics && metrics.events) || [];\n" +
		"    if (!events.length) { mark('no-events'); return; }\n" +
		"    var expected = format(events[0]);\n" +
		"    var btn = eventsEl.querySelector('[data-action=\"copy-empty-state-metrics-event\"][data-event-index=\"0\"]');\n" +
		"    if (!btn) { mark('no-btn'); return; }\n" +
		"    var labelOk = String(btn.textContent || '') === String(expected || '');\n" +
		"    var lineClassOk = btn.classList.contains('overview-empty-state-metrics-event-line');\n" +
		"    var formattedOk = typeof expected === 'string' && expected.indexOf('clear') >= 0;\n" +
		"    // Bridge returns a Promise; resolve to confirm copy path is wired (clipboard may be denied in headless).\n" +
		"    Promise.resolve(copy(0)).then(function () {\n" +
		"      mark((labelOk && lineClassOk && formattedOk) ? 'ok' : ('fail:label=' + labelOk + ';cls=' + lineClassOk + ';fmt=' + formattedOk + ';line=' + String(expected).slice(0, 80)));\n" +
		"    }).catch(function () {\n" +
		"      // Clipboard denial is acceptable; markup + format still prove the affordance.\n" +
		"      mark((labelOk && lineClassOk && formattedOk) ? 'ok' : ('fail-copy:label=' + labelOk + ';cls=' + lineClassOk + ';fmt=' + formattedOk));\n" +
		"    });\n" +
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
	if !strings.Contains(dom, `data-event-copy="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-event-copy="`); i >= 0 {
			rest := dom[i+len(`data-event-copy="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-event-copy=ok; got %q", marker)
	}
}
