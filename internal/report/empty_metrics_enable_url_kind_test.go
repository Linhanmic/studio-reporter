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
		`StudioReportDescribeEmptyMetricsEnableURLPreview`,
		` · kind=`,
		`当前未过滤`,
		`emptyMetricsMeta`,
		` · meta+`,
		`StudioReportApplyEmptyMetricsMetaMoreFromQuery`,
		`StudioReportSyncEmptyMetricsEnableURLButtons`,
		`StudioReportDescribeEmptyMetricsEnableKindSummary`,
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
		"    var describe = window.StudioReportDescribeEmptyMetricsEnableURLPreview;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var getKind = window.StudioReportEmptyStateMetricsEventKindFilter;\n" +
		"    var readQ = window.StudioReportReadEmptyMetricsKindFromQuery;\n" +
		"    var applyQ = window.StudioReportApplyEmptyMetricsKindFromQuery;\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    if (typeof format !== 'function' || typeof setKind !== 'function' || typeof getKind !== 'function' || typeof readQ !== 'function' || typeof applyQ !== 'function' || typeof show !== 'function' || typeof describe !== 'function') {\n" +
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
		"    var preview = describe(url);\n" +
		"    var previewOk = typeof preview === 'string' && preview.indexOf('kind=escClear') >= 0;\n" +
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
		"    var clearPreview = describe(clearUrl);\n" +
		"    var clearPreviewOk = typeof clearPreview === 'string' && clearPreview.indexOf('当前未过滤') >= 0 && clearPreview.indexOf('kind=') < 0;\n" +
		"    var withKindPreviewOk = preview.indexOf('当前未过滤') < 0;\n" +
		"    var syncBtns = window.StudioReportSyncEmptyMetricsEnableURLButtons;\n" +
		"    var summaryFn = window.StudioReportDescribeEmptyMetricsEnableKindSummary;\n" +
		"    setKind('escClear');\n" +
		"    if (typeof syncBtns === 'function') syncBtns();\n" +
		"    var btn = document.querySelector('[data-action=copy-empty-metrics-enable-url]');\n" +
		"    var titleKindOk = !!btn && /kind=escClear/.test(btn.title || '') && /kind=escClear/.test(btn.getAttribute('aria-label') || '');\n" +
		"    setKind('');\n" +
		"    if (typeof syncBtns === 'function') syncBtns();\n" +
		"    var titleClearOk = !!btn && /当前未过滤/.test(btn.title || '') && /当前未过滤/.test(btn.getAttribute('aria-label') || '');\n" +
		"    var summaryOk = typeof summaryFn === 'function' && summaryFn('') === '当前未过滤' && summaryFn('escClear') === 'kind=escClear';\n" +
		"    var setMeta = window.StudioReportSetEmptyStateMetricsMetaMoreExpanded;\n" +
		"    var applyMeta = window.StudioReportApplyEmptyMetricsMetaMoreFromQuery;\n" +
		"    var metaOk = false;\n" +
		"    if (typeof setMeta === 'function' && typeof applyMeta === 'function') {\n" +
		"      setMeta(true);\n" +
		"      var metaUrl = format();\n" +
		"      var metaPreview = describe(metaUrl);\n" +
		"      var metaUrlOk = typeof metaUrl === 'string' && /[?&]emptyMetricsMeta=1(?:&|#|$)/.test(metaUrl);\n" +
		"      var metaPrevOk = typeof metaPreview === 'string' && metaPreview.indexOf('meta+') >= 0;\n" +
		"      try { history.replaceState(null, '', location.pathname + '?emptyMetrics=1&emptyMetricsMeta=1#overview'); } catch (eMeta) {}\n" +
		"      try { localStorage.setItem('studio-report-empty-metrics-meta-more', '0'); } catch (eMeta2) {}\n" +
		"      var appliedMeta = applyMeta();\n" +
		"      metaOk = metaUrlOk && metaPrevOk && appliedMeta === true;\n" +
		"      setMeta(false);\n" +
		"    }\n" +
		"    mark((urlOk && previewOk && withKindPreviewOk && shortOk && applyOk && clearOk && clearPreviewOk && titleKindOk && titleClearOk && summaryOk && metaOk) ? 'ok' : ('fail:url=' + urlOk + ';prev=' + previewOk + ';wk=' + withKindPreviewOk + ';short=' + shortOk + ';apply=' + applyOk + ';clear=' + clearOk + ';cprev=' + clearPreviewOk + ';tk=' + titleKindOk + ';tc=' + titleClearOk + ';sum=' + summaryOk + ';meta=' + metaOk + ';u=' + String(url).slice(0, 120) + ';p=' + String(preview).slice(0, 80) + ';cp=' + String(clearPreview).slice(0, 80) + ';title=' + String(btn && btn.title).slice(0, 80)));\n" +
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
