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
		`StudioReportFormatEmptyStateMetricsJSON`,
		`StudioReportCopyEmptyStateMetricsJSON`,
		`overview-empty-state-metrics-text`,
		`studio-report-empty-state-metrics`,
		`复制 JSON`,
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
    var clear = window.StudioReportClearReportFilters;
    var sync = window.StudioReportSyncEmptyStateMetricsPanel;
    var btn = document.querySelector('[data-action="copy-empty-state-metrics-json"]');
    if (typeof format !== 'function' || typeof copy !== 'function' || typeof clear !== 'function' || !btn) {
      mark('missing');
      return;
    }
    window.StudioReportShowEmptyStateMetrics = true;
    if (typeof sync === 'function') sync();
    clear();
    clear({ source: 'esc' });
    var raw = format();
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { mark('fail-parse:' + String(e)); return; }
    var ok = parsed && parsed.kind === 'studio-report-empty-state-metrics'
      && parsed.counts && parsed.counts.clear >= 1 && parsed.counts.escClear >= 1
      && Array.isArray(parsed.events) && parsed.events.length >= 2
      && typeof parsed.exportedAt === 'string' && parsed.exportedAt.length > 0;
    mark(ok ? ('ok:clear=' + parsed.counts.clear + ';esc=' + parsed.counts.escClear + ';n=' + parsed.events.length) : ('fail:' + raw.slice(0, 240)));
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
