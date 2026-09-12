package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsJSONExport verifies format/copy bridges and that the
// metrics panel "复制 JSON" button yields paste-ready EmptyStateMetrics JSON.
func TestEmptyStateMetricsJSONExport(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-export",
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
		`copy-empty-state-metrics-json`,
		`download-empty-state-metrics-json`,
		`StudioReportFormatEmptyStateMetricsJSON`,
		`StudioReportCopyEmptyStateMetricsJSON`,
		`StudioReportDownloadEmptyStateMetricsJSON`,
		`overview-empty-state-metrics-text`,
		`studio-report-empty-state-metrics`,
		`studio-report-meta`,
		`StudioReportEmptyStateMetricsReportMeta`,
		`studio-report-empty-state-metrics.json`,
		`复制 JSON`,
		`下载 JSON`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-text`) {
		t.Fatal("CSS missing overview-empty-state-metrics-text")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics export smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-export', v); }
  function go() {
    var format = window.StudioReportFormatEmptyStateMetricsJSON;
    var copy = window.StudioReportCopyEmptyStateMetricsJSON;
    var download = window.StudioReportDownloadEmptyStateMetricsJSON;
    var clear = window.StudioReportClearReportFilters;
    var sync = window.StudioReportSyncEmptyStateMetricsPanel;
    var btn = document.querySelector('[data-action="copy-empty-state-metrics-json"]');
    var dlBtn = document.querySelector('[data-action="download-empty-state-metrics-json"]');
    if (typeof format !== 'function' || typeof copy !== 'function' || typeof download !== 'function' || typeof clear !== 'function' || !btn || !dlBtn) {
      mark('missing');
      return;
    }
    window.StudioReportShowEmptyStateMetrics = true;
    try { localStorage.setItem('studio-report-empty-metrics', '1'); } catch (e) {}
    if (typeof sync === 'function') sync();
    clear();
    clear({ source: 'esc' });
    var raw = format();
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { mark('fail-parse:' + String(e)); return; }
    var ok = parsed && parsed.kind === 'studio-report-empty-state-metrics'
      && parsed.counts && parsed.counts.clear >= 1 && parsed.counts.escClear >= 1
      && Array.isArray(parsed.events) && parsed.events.length >= 2
      && typeof parsed.exportedAt === 'string' && parsed.exportedAt.length > 0
      && parsed.report && parsed.report.projectName === 'metrics-export'
      && typeof parsed.report.verdict === 'string' && parsed.report.verdict.length > 0
      && typeof parsed.report.generatedAtISO === 'string' && parsed.report.generatedAtISO.length > 0
      && parsed.panel && parsed.panel.enabled === true
      && parsed.panel.windowFlag === true
      && parsed.panel.localStorage === '1';
    // downloadEmptyStateMetricsJSON returns the same payload text (side-effect: trigger <a download>).
    var dlText = download();
    var dlOk = typeof dlText === 'string' && dlText.indexOf('studio-report-empty-state-metrics') >= 0
      && dlText.indexOf('"panel"') >= 0;
    mark((ok && dlOk) ? ('ok:clear=' + parsed.counts.clear + ';esc=' + parsed.counts.escClear + ';n=' + parsed.events.length + ';panel=1') : ('fail:' + raw.slice(0, 320)));
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
	if !strings.Contains(dom, `data-export="ok`) {
		marker := ""
		if i := strings.Index(dom, `data-export="`); i >= 0 {
			rest := dom[i+len(`data-export="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-export=ok…; got %q", marker)
	}
}
