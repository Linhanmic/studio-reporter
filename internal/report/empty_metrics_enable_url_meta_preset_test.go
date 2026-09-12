package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyMetricsEnableURLMetaPreset verifies enable URLs carry the active
// named meta-field preset and query emptyMetricsMetaPreset restores it on open.
func TestEmptyMetricsEnableURLMetaPreset(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-enable-preset",
		Verdict:     VerdictFail,
		Failed:      true,
		Environment: "ci",
		Duration:    "12.3s",
		Meta: ReportMeta{
			HostName:       "ci-host",
			PluginVersion:  "0.5.2",
			ProjectRoot:    "/tmp/workspace/demo-suite",
			GeneratedAt:    "2026-09-12 10:00:00",
			GeneratedAtISO: "2026-09-12T10:00:00Z",
		},
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
		`emptyMetricsMetaPreset`,
		`StudioReportReadEmptyMetricsMetaPresetFromQuery`,
		`StudioReportApplyEmptyMetricsMetaPresetFromQuery`,
		`StudioReportSyncEmptyMetricsMetaPresetInLocation`,
		`StudioReportApplyEmptyStateMetricsMetaFieldNamedPreset`,
		`ci-slim`,
		` · preset=`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics meta-preset smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-enable-preset', v); }
  function go() {
    var format = window.StudioReportFormatEmptyMetricsEnableURL;
    var describe = window.StudioReportDescribeEmptyMetricsEnableURLPreview;
    var shorten = window.StudioReportShortenEmptyMetricsEnableURL;
    var applyNamed = window.StudioReportApplyEmptyStateMetricsMetaFieldNamedPreset;
    var getActive = window.StudioReportGetActiveEmptyStateMetricsMetaFieldNamedPresetId;
    var getPrefs = window.StudioReportGetEmptyStateMetricsMetaFieldPrefs;
    var readQ = window.StudioReportReadEmptyMetricsMetaPresetFromQuery;
    var applyQ = window.StudioReportApplyEmptyMetricsMetaPresetFromQuery;
    var show = window.StudioReportShowEmptyStateMetricsPanel;
    if (typeof format !== 'function' || typeof describe !== 'function' || typeof applyNamed !== 'function'
      || typeof getActive !== 'function' || typeof getPrefs !== 'function' || typeof readQ !== 'function'
      || typeof applyQ !== 'function' || typeof show !== 'function') {
      mark('missing');
      return;
    }
    try { localStorage.removeItem('studio-report-empty-metrics-meta-fields'); } catch (e) {}
    try { localStorage.removeItem('studio-report-empty-metrics-meta-field-named-active'); } catch (e2) {}
    show();
    applyNamed('ci-slim');
    try { history.replaceState(null, '', location.pathname + '?foo=1#overview'); } catch (e3) {}
    var url = format();
    var urlOk = typeof url === 'string'
      && /[?&]emptyMetrics=1(?:&|#|$)/.test(url)
      && /[?&]emptyMetricsMetaPreset=ci-slim(?:&|#|$)/.test(url);
    var preview = describe(url);
    var previewOk = typeof preview === 'string' && preview.indexOf('preset=') >= 0
      && (preview.indexOf('ci-slim') >= 0 || preview.indexOf('CI 精简') >= 0);
    var shortOk = true;
    if (typeof shorten === 'function') {
      var longUrl = 'https://example.test/reports/very/long/path/to/index.html?foo=1&emptyMetrics=1&emptyMetricsMetaPreset=ci-slim&bar=2#overview';
      var short = shorten(longUrl);
      shortOk = typeof short === 'string' && short.indexOf('emptyMetrics=1') >= 0 && short.indexOf('emptyMetricsMetaPreset=ci-slim') >= 0;
    }
    applyNamed('default');
    var clearUrl = format();
    var clearOk = typeof clearUrl === 'string' && /[?&]emptyMetrics=1(?:&|#|$)/.test(clearUrl)
      && !/[?&]emptyMetricsMetaPreset=/.test(clearUrl);

    // Simulate shared enable deep link with preset.
    try { localStorage.setItem('studio-report-empty-metrics-meta-fields', JSON.stringify({ primary: ['hostName'], secondary: [] })); } catch (e4) {}
    try { localStorage.setItem('studio-report-empty-metrics-meta-field-named-active', 'default'); } catch (e5) {}
    try { history.replaceState(null, '', location.pathname + '?emptyMetrics=1&emptyMetricsMetaPreset=debug-full#overview'); } catch (e6) {}
    var fromQ = readQ();
    var applied = applyQ();
    var prefs = getPrefs();
    var applyOk = fromQ === 'debug-full' && applied === 'debug-full' && getActive() === 'debug-full'
      && prefs.primary.indexOf('duration') >= 0 && prefs.secondary.indexOf('environment') >= 0
      && /[?&]emptyMetricsMetaPreset=debug-full(?:&|#|$)/.test(location.search);

    applyNamed('ci-slim');
    var syncOk = /[?&]emptyMetricsMetaPreset=ci-slim(?:&|#|$)/.test(location.search);
    applyNamed('default');
    var stripOk = !/[?&]emptyMetricsMetaPreset=/.test(location.search);

    mark((urlOk && previewOk && shortOk && clearOk && applyOk && syncOk && stripOk) ? 'ok'
      : ('fail:url=' + urlOk + ';prev=' + previewOk + ';short=' + shortOk + ';clear=' + clearOk + ';apply=' + applyOk + ';sync=' + syncOk + ';strip=' + stripOk + ';u=' + String(url).slice(0, 140) + ';p=' + String(preview).slice(0, 80) + ';fromQ=' + fromQ + ';active=' + getActive()));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else setTimeout(go, 100);
})();
</script>`
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
	if !strings.Contains(dom, `data-enable-preset="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-enable-preset="`); i >= 0 {
			rest := dom[i+len(`data-enable-preset="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-enable-preset=ok; got %q", marker)
	}
}
