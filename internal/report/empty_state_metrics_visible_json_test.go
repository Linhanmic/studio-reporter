package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsVisibleJSON verifies visible-subset JSON export respects
// the active kind filter and exposes copy/download bridges.
func TestEmptyStateMetricsVisibleJSON(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-visible-json",
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
		`copy-empty-state-metrics-visible-json`,
		`StudioReportFormatEmptyStateMetricsVisibleJSON`,
		`StudioReportCopyEmptyStateMetricsVisibleJSON`,
		`StudioReportDownloadEmptyStateMetricsVisibleJSON`,
		`可见 JSON`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics visible JSON smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-visible-json', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var formatVis = window.StudioReportFormatEmptyStateMetricsVisibleJSON;\n" +
		"    var copyVis = window.StudioReportCopyEmptyStateMetricsVisibleJSON;\n" +
		"    var dlVis = window.StudioReportDownloadEmptyStateMetricsVisibleJSON;\n" +
		"    var formatAll = window.StudioReportFormatEmptyStateMetricsJSON;\n" +
		"    var snap = window.StudioReportEmptyStateMetrics;\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    if (typeof show !== 'function' || typeof setExp !== 'function' || typeof setKind !== 'function' || typeof formatVis !== 'function' || typeof copyVis !== 'function' || typeof dlVis !== 'function' || typeof formatAll !== 'function' || typeof snap !== 'function' || !eventsEl) {\n" +
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
		"    setKind('escClear');\n" +
		"    var raw = formatVis();\n" +
		"    var parsed = null;\n" +
		"    try { parsed = JSON.parse(raw); } catch (e) {}\n" +
		"    var btn = eventsEl.querySelector('[data-action=\"copy-empty-state-metrics-visible-json\"]');\n" +
		"    var btnOk = !!(btn && /可见 JSON\\(\\d+\\)/.test(btn.textContent || '') && !btn.disabled);\n" +
		"    var all = null;\n" +
		"    try { all = JSON.parse(formatAll()); } catch (e2) {}\n" +
		"    var ok = parsed\n" +
		"      && parsed.kind === 'studio-report-empty-state-metrics-visible'\n" +
		"      && parsed.eventKindFilter === 'escClear'\n" +
		"      && Array.isArray(parsed.events)\n" +
		"      && parsed.events.length >= 1\n" +
		"      && parsed.events.length < events.length\n" +
		"      && parsed.visibleCount === parsed.events.length\n" +
		"      && parsed.totalCount === events.length\n" +
		"      && parsed.events.every(function (e) { return e && e.kind === 'escClear'; })\n" +
		"      && all && Array.isArray(all.events) && all.events.length === events.length;\n" +
		"    Promise.resolve(copyVis()).then(function () {\n" +
		"      mark((ok && btnOk) ? 'ok' : ('fail:ok=' + ok + ';btn=' + btnOk + ';raw=' + String(raw).slice(0, 180)));\n" +
		"    }).catch(function () {\n" +
		"      mark((ok && btnOk) ? 'ok' : ('fail-copy:ok=' + ok + ';btn=' + btnOk));\n" +
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
	if !strings.Contains(dom, `data-visible-json="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-visible-json="`); i >= 0 {
			rest := dom[i+len(`data-visible-json="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-visible-json=ok; got %q", marker)
	}
}
