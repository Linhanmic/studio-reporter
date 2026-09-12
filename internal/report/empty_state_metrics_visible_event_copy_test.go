package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsVisibleEventCopy verifies “复制可见” copies only the
// kind-filtered event lines (original indices preserved for per-row copy).
func TestEmptyStateMetricsVisibleEventCopy(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-visible-copy",
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
		`copy-empty-state-metrics-visible-events`,
		`StudioReportCopyEmptyStateMetricsVisibleEventLines`,
		`StudioReportFormatEmptyStateMetricsVisibleEventLines`,
		`overview-empty-state-metrics-event-actions`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-event-actions`) {
		t.Fatal("CSS missing overview-empty-state-metrics-event-actions")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics visible event copy smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-visible-copy', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var formatVis = window.StudioReportFormatEmptyStateMetricsVisibleEventLines;\n" +
		"    var copyVis = window.StudioReportCopyEmptyStateMetricsVisibleEventLines;\n" +
		"    var idxs = window.StudioReportVisibleEmptyStateMetricsEventIndexes;\n" +
		"    var format = window.StudioReportFormatEmptyStateMetricsEventLine;\n" +
		"    var snap = window.StudioReportEmptyStateMetrics;\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    if (typeof show !== 'function' || typeof setExp !== 'function' || typeof setKind !== 'function' || typeof formatVis !== 'function' || typeof copyVis !== 'function' || typeof idxs !== 'function' || typeof format !== 'function' || typeof snap !== 'function' || !eventsEl) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    if (typeof clear === 'function') { clear(); clear({ source: 'esc' }); }\n" +
		"    setExp(true);\n" +
		"    setKind('');\n" +
		"    var metrics = snap();\n" +
		"    var events = (metrics && metrics.events) || [];\n" +
		"    if (events.length < 2) { mark('need-events:' + events.length); return; }\n" +
		"    var allText = formatVis();\n" +
		"    var allLines = allText ? allText.split('\\n') : [];\n" +
		"    var allOk = allLines.length === events.length;\n" +
		"    setKind('escClear');\n" +
		"    var filteredIdx = idxs();\n" +
		"    var visText = formatVis();\n" +
		"    var visLines = visText ? visText.split('\\n') : [];\n" +
		"    var btn = eventsEl.querySelector('[data-action=\"copy-empty-state-metrics-visible-events\"]');\n" +
		"    var btnOk = !!(btn && /复制可见\\(\\d+\\)/.test(btn.textContent || '') && !btn.disabled);\n" +
		"    var onlyEsc = true;\n" +
		"    for (var i = 0; i < filteredIdx.length; i++) {\n" +
		"      if (!events[filteredIdx[i]] || events[filteredIdx[i]].kind !== 'escClear') onlyEsc = false;\n" +
		"    }\n" +
		"    var expected = [];\n" +
		"    for (var j = 0; j < filteredIdx.length; j++) expected.push(format(events[filteredIdx[j]]));\n" +
		"    var textOk = visLines.length === filteredIdx.length && visLines.length >= 1 && visLines.length < events.length && visText === expected.join('\\n') && onlyEsc;\n" +
		"    Promise.resolve(copyVis()).then(function () {\n" +
		"      mark((allOk && btnOk && textOk) ? 'ok' : ('fail:all=' + allOk + ';btn=' + btnOk + ';text=' + textOk + ';n=' + events.length + ';v=' + visLines.length));\n" +
		"    }).catch(function () {\n" +
		"      mark((allOk && btnOk && textOk) ? 'ok' : ('fail-copy:all=' + allOk + ';btn=' + btnOk + ';text=' + textOk));\n" +
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
	if !strings.Contains(dom, `data-visible-copy="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-visible-copy="`); i >= 0 {
			rest := dom[i+len(`data-visible-copy="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-visible-copy=ok; got %q", marker)
	}
}
