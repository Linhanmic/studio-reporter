package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsIssueMarkdown verifies the 「贴 issue」 Markdown wraps
// enable URL + filter summary + EmptyStateMetrics JSON.
func TestEmptyStateMetricsIssueMarkdown(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-issue",
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
		`copy-empty-state-metrics-issue`,
		`StudioReportFormatEmptyStateMetricsIssueMarkdown`,
		`StudioReportCopyEmptyStateMetricsIssueMarkdown`,
		`贴 issue`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics issue markdown smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	// Avoid nested backticks in a Go raw string: fence check uses fromCharCode(96).
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-issue-md', v); }\n" +
		"  function go() {\n" +
		"    var format = window.StudioReportFormatEmptyStateMetricsIssueMarkdown;\n" +
		"    var copy = window.StudioReportCopyEmptyStateMetricsIssueMarkdown;\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var btn = document.querySelector('[data-action=\"copy-empty-state-metrics-issue\"]');\n" +
		"    if (typeof format !== 'function' || typeof copy !== 'function' || typeof show !== 'function' || !btn) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    if (typeof clear === 'function') clear();\n" +
		"    try { history.replaceState(null, '', location.pathname + '?foo=1#overview?scenario=fail'); } catch (e) {}\n" +
		"    var md = format();\n" +
		"    var fence = String.fromCharCode(96, 96, 96);\n" +
		"    var ok = typeof md === 'string'\n" +
		"      && md.indexOf('### studio-reporter 空态 metrics') >= 0\n" +
		"      && md.indexOf('emptyMetrics=1') >= 0\n" +
		"      && md.indexOf(fence) >= 0\n" +
		"      && md.indexOf('studio-report-empty-state-metrics') >= 0\n" +
		"      && md.indexOf('当前过滤') >= 0;\n" +
		"    mark(ok ? 'ok' : ('fail:' + String(md).slice(0, 280)));\n" +
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
	if !strings.Contains(dom, `data-issue-md="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-issue-md="`); i >= 0 {
			rest := dom[i+len(`data-issue-md="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-issue-md=ok; got %q", marker)
	}
}
