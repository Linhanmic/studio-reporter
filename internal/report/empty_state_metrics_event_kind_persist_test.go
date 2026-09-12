package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsEventKindFilterPersist verifies the kind chip selection
// is stored in localStorage and restored after a simulated reload.
func TestEmptyStateMetricsEventKindFilterPersist(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-kind-persist",
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
		`studio-report-empty-metrics-event-kind`,
		`StudioReportSetEmptyStateMetricsEventKindFilter`,
		`StudioReportEmptyStateMetricsEventKindFilter`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics kind persist smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-kind-persist', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var getKind = window.StudioReportEmptyStateMetricsEventKindFilter;\n" +
		"    var sync = window.StudioReportSyncEmptyStateMetricsEvents;\n" +
		"    var eventsEl = document.getElementById('overview-empty-state-metrics-events');\n" +
		"    if (typeof show !== 'function' || typeof setKind !== 'function' || typeof getKind !== 'function' || typeof sync !== 'function' || !eventsEl) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    try { localStorage.removeItem('studio-report-empty-metrics-event-kind'); } catch (e) {}\n" +
		"    show();\n" +
		"    if (typeof clear === 'function') { clear(); clear({ source: 'esc' }); }\n" +
		"    if (typeof setExp === 'function') setExp(true);\n" +
		"    setKind('escClear');\n" +
		"    var stored = null;\n" +
		"    try { stored = localStorage.getItem('studio-report-empty-metrics-event-kind'); } catch (e2) {}\n" +
		"    var writeOk = getKind() === 'escClear' && stored === 'escClear';\n" +
		"    // Simulate reload: drop in-memory UI state, keep localStorage, re-sync.\n" +
		"    eventsEl.innerHTML = '';\n" +
		"    if (typeof setExp === 'function') setExp(true);\n" +
		"    sync();\n" +
		"    var restored = getKind() === 'escClear';\n" +
		"    var active = eventsEl.querySelector('[data-action=\"filter-empty-state-metrics-event-kind\"][data-kind=\"escClear\"]');\n" +
		"    var chipOk = !!(active && active.classList.contains('is-active'));\n" +
		"    var lines = eventsEl.querySelectorAll('[data-action=\"copy-empty-state-metrics-event\"]');\n" +
		"    var onlyEsc = lines.length >= 1;\n" +
		"    for (var i = 0; i < lines.length; i++) {\n" +
		"      if ((lines[i].textContent || '').indexOf('escClear') < 0) onlyEsc = false;\n" +
		"    }\n" +
		"    setKind('');\n" +
		"    var cleared = getKind() === '';\n" +
		"    try { cleared = cleared && !localStorage.getItem('studio-report-empty-metrics-event-kind'); } catch (e3) {}\n" +
		"    mark((writeOk && restored && chipOk && onlyEsc && cleared) ? 'ok' : ('fail:w=' + writeOk + ';r=' + restored + ';c=' + chipOk + ';e=' + onlyEsc + ';clr=' + cleared + ';st=' + stored));\n" +
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
	if !strings.Contains(dom, `data-kind-persist="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-kind-persist="`); i >= 0 {
			rest := dom[i+len(`data-kind-persist="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-kind-persist=ok; got %q", marker)
	}
}
