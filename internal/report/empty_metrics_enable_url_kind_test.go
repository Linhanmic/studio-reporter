package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyMetricsEnableURLKindFilter verifies enable URLs carry the active
// event kind and query emptyMetricsKind restores that chip on open.
func TestEmptyMetricsEnableURLKindFilter(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-enable-kind",
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
		`emptyMetricsKind`,
		`StudioReportReadEmptyMetricsKindFromQuery`,
		`StudioReportApplyEmptyMetricsKindFromQuery`,
		`StudioReportFormatEmptyMetricsEnableURL`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics enable-url kind smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-enable-kind', v); }\n" +
		"  function go() {\n" +
		"    var format = window.StudioReportFormatEmptyMetricsEnableURL;\n" +
		"    var shorten = window.StudioReportShortenEmptyMetricsEnableURL;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var getKind = window.StudioReportEmptyStateMetricsEventKindFilter;\n" +
		"    var readQ = window.StudioReportReadEmptyMetricsKindFromQuery;\n" +
		"    var applyQ = window.StudioReportApplyEmptyMetricsKindFromQuery;\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    if (typeof format !== 'function' || typeof setKind !== 'function' || typeof getKind !== 'function' || typeof readQ !== 'function' || typeof applyQ !== 'function' || typeof show !== 'function') {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    try { localStorage.removeItem('studio-report-empty-metrics-event-kind'); } catch (e) {}\n" +
		"    show();\n" +
		"    setKind('escClear');\n" +
		"    try { history.replaceState(null, '', location.pathname + '?foo=1&emptyMetrics=0#overview?scenario=fail'); } catch (e2) {}\n" +
		"    var url = format();\n" +
		"    var urlOk = typeof url === 'string'\n" +
		"      && /[?&]emptyMetrics=1(?:&|#|$)/.test(url)\n" +
		"      && /[?&]emptyMetricsKind=escClear(?:&|#|$)/.test(url)\n" +
		"      && url.indexOf('#overview?scenario=fail') >= 0;\n" +
		"    var shortOk = true;\n" +
		"    if (typeof shorten === 'function') {\n" +
		"      var longUrl = 'https://example.test/reports/very/long/path/to/index.html?foo=1&emptyMetrics=1&emptyMetricsKind=escClear&bar=2#overview?scenario=fail&q=' + encodeURIComponent('assertion failed password');\n" +
		"      var short = shorten(longUrl);\n" +
		"      shortOk = typeof short === 'string' && short.indexOf('emptyMetrics=1') >= 0 && short.indexOf('emptyMetricsKind=escClear') >= 0;\n" +
		"    }\n" +
		"    // Simulate opening a shared enable deep link with kind.\n" +
		"    try { localStorage.setItem('studio-report-empty-metrics-event-kind', 'undo'); } catch (e3) {}\n" +
		"    try { history.replaceState(null, '', location.pathname + '?emptyMetrics=1&emptyMetricsKind=escClear#overview'); } catch (e4) {}\n" +
		"    var fromQ = readQ();\n" +
		"    var applied = applyQ();\n" +
		"    var applyOk = fromQ === 'escClear' && applied === 'escClear' && getKind() === 'escClear';\n" +
		"    setKind('');\n" +
		"    try { history.replaceState(null, '', location.pathname + '?emptyMetrics=1#overview'); } catch (e5) {}\n" +
		"    var clearUrl = format();\n" +
		"    var clearOk = typeof clearUrl === 'string' && /[?&]emptyMetrics=1(?:&|#|$)/.test(clearUrl) && !/[?&]emptyMetricsKind=/.test(clearUrl);\n" +
		"    mark((urlOk && shortOk && applyOk && clearOk) ? 'ok' : ('fail:url=' + urlOk + ';short=' + shortOk + ';apply=' + applyOk + ';clear=' + clearOk + ';u=' + String(url).slice(0, 120)));\n" +
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
	if !strings.Contains(dom, `data-enable-kind="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-enable-kind="`); i >= 0 {
			rest := dom[i+len(`data-enable-kind="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-enable-kind=ok; got %q", marker)
	}
}
