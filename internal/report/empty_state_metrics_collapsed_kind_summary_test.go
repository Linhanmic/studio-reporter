package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsCollapsedKindSummary verifies the events toggle shows
// the active kind label while the ring is collapsed.
func TestEmptyStateMetricsCollapsedKindSummary(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-kind-summary",
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
		`data-kind-filter`,
		`已过滤 kind=`,
		`toggle-empty-state-metrics-events`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `[data-action="toggle-empty-state-metrics-events"][data-kind-filter]`) {
		t.Fatal("CSS missing collapsed kind-filter toggle styling")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics collapsed kind summary smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-kind-summary', v); }\n" +
		"  function go() {\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var sync = window.StudioReportSyncEmptyStateMetricsEvents;\n" +
		"    var btn = document.querySelector('#overview-empty-state-metrics [data-action=\"toggle-empty-state-metrics-events\"]');\n" +
		"    if (typeof show !== 'function' || typeof setExp !== 'function' || typeof setKind !== 'function' || typeof sync !== 'function' || !btn) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    if (typeof clear === 'function') { clear(); clear({ source: 'esc' }); }\n" +
		"    setKind('escClear');\n" +
		"    setExp(false);\n" +
		"    sync();\n" +
		"    var collapsedOk = btn.getAttribute('aria-expanded') === 'false'\n" +
		"      && btn.getAttribute('data-kind-filter') === 'escClear'\n" +
		"      && /事件\\(\\d+\\) · esc/.test(btn.textContent || '')\n" +
		"      && /已过滤 kind=esc/.test(btn.title || '');\n" +
		"    setExp(true);\n" +
		"    sync();\n" +
		"    var expandedOk = btn.getAttribute('aria-expanded') === 'true'\n" +
		"      && btn.getAttribute('data-kind-filter') === 'escClear'\n" +
		"      && /事件\\(\\d+\\) · esc/.test(btn.textContent || '');\n" +
		"    setKind('');\n" +
		"    setExp(false);\n" +
		"    sync();\n" +
		"    var clearedOk = !btn.hasAttribute('data-kind-filter')\n" +
		"      && /事件\\(\\d+\\)/.test(btn.textContent || '')\n" +
		"      && (btn.textContent || '').indexOf(' · ') < 0;\n" +
		"    mark((collapsedOk && expandedOk && clearedOk) ? 'ok' : ('fail:col=' + collapsedOk + ';exp=' + expandedOk + ';clr=' + clearedOk + ';t=' + btn.textContent + ';title=' + btn.title));\n" +
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
	if !strings.Contains(dom, `data-kind-summary="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-kind-summary="`); i >= 0 {
			rest := dom[i+len(`data-kind-summary="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-kind-summary=ok; got %q", marker)
	}
}
