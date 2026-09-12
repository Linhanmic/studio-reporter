package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsPanelToggle verifies the Overview metrics strip appears
// when ?emptyMetrics=1 (or StudioReportShowEmptyStateMetrics) is enabled and
// updates after empty-state actions.
func TestEmptyStateMetricsPanelToggle(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-panel",
		Meta: ReportMeta{HostName: "dev-laptop", PluginVersion: "0.5.2", ProjectRoot: "/opt/gauge/demo-suite"},
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
		`overview-empty-state-metrics`,
		`overview-empty-state-metrics-text`,
		`copy-empty-state-metrics-json`,
		`emptyMetrics=1`,
		`StudioReportSyncEmptyStateMetricsPanel`,
		`StudioReportEmptyStateMetricsPanelEnabled`,
		`StudioReportFormatEmptyStateMetricsJSON`,
		`StudioReportFormatEmptyStateMetricsReportSummary`,
		`meta+`,
		`StudioReportToggleEmptyStateMetricsMetaMore`,
		`overview-empty-state-metrics-meta-secondary`,
		`toggle-empty-state-metrics-meta-more`,
		`复制 meta`,
		`StudioReportCopyEmptyStateMetricsReportSummary`,
		`copy-empty-state-metrics-report-meta`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics`) {
		t.Fatal("CSS missing overview-empty-state-metrics")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics panel smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-panel', v); }
  function go() {
    var panel = document.getElementById('overview-empty-state-metrics');
    var enabled = window.StudioReportEmptyStateMetricsPanelEnabled;
    var sync = window.StudioReportSyncEmptyStateMetricsPanel;
    var clear = window.StudioReportClearReportFilters;
    if (!panel || typeof enabled !== 'function' || typeof sync !== 'function' || typeof clear !== 'function') {
      mark('missing');
      return;
    }
    // Default off.
    sync();
    if (!panel.hasAttribute('hidden')) { mark('fail-default-visible'); return; }
    window.StudioReportShowEmptyStateMetrics = true;
    sync();
    if (panel.hasAttribute('hidden')) { mark('fail-not-shown'); return; }
    clear();
    var textEl = document.getElementById('overview-empty-state-metrics-text');
    var text = String((textEl && textEl.textContent) || panel.textContent || '');
    var btn = panel.querySelector('[data-action="copy-empty-state-metrics-json"]');
    if (!btn) { mark('fail-no-export-btn'); return; }
    var summaryFn = window.StudioReportFormatEmptyStateMetricsReportSummary;
    var primaryFn = window.StudioReportFormatEmptyStateMetricsReportSummaryPrimary;
    var secondaryFn = window.StudioReportFormatEmptyStateMetricsReportSummarySecondary;
    var toggleMore = window.StudioReportToggleEmptyStateMetricsMetaMore;
    var copyMeta = window.StudioReportCopyEmptyStateMetricsReportSummary;
    var summary = typeof summaryFn === 'function' ? String(summaryFn() || '') : '';
    var primary = typeof primaryFn === 'function' ? String(primaryFn() || '') : '';
    var secondary = typeof secondaryFn === 'function' ? String(secondaryFn() || '') : '';
    var primaryOk = primary.indexOf('metrics-panel') >= 0 && primary.indexOf('dev-laptop') < 0 && primary.indexOf('plugin') < 0;
    var secondaryOk = secondary.indexOf('demo-suite') >= 0 && secondary.indexOf('dev-laptop') >= 0 && secondary.indexOf('plugin 0.5.2') >= 0;
    var summaryOk = summary.indexOf('metrics-panel') >= 0 && summary.indexOf('dev-laptop') >= 0 && summary.indexOf('|') < 0;
    var textOk = /clear=1/.test(text) && text.indexOf('metrics-panel') >= 0 && text.indexOf('|') >= 0 && text.indexOf('dev-laptop') < 0;
    var titleOk = String(panel.title || '').indexOf('metrics-panel') >= 0;
    var metaBtn = panel.querySelector('[data-action="copy-empty-state-metrics-report-meta"]');
    var moreBtn = panel.querySelector('[data-action="toggle-empty-state-metrics-meta-more"]');
    var secondaryEl = document.getElementById('overview-empty-state-metrics-meta-secondary');
    var collapsedOk = !!moreBtn && !!secondaryEl && secondaryEl.hasAttribute('hidden');
    if (typeof toggleMore === 'function') toggleMore();
    if (typeof sync === 'function') sync();
    var expandedOk = !!secondaryEl && !secondaryEl.hasAttribute('hidden') && String(secondaryEl.textContent || '').indexOf('dev-laptop') >= 0;
    var btnOk = !!metaBtn && typeof copyMeta === 'function';
    mark((textOk && primaryOk && secondaryOk && summaryOk && titleOk && btnOk && collapsedOk && expandedOk) ? ('ok:' + text) : ('fail-text:' + text + ';pri=' + primary + ';sec=' + secondary + ';sum=' + summary + ';c=' + collapsedOk + ';e=' + expandedOk + ';btnOk=' + btnOk));
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
	if !strings.Contains(dom, `data-panel="ok`) {
		marker := ""
		if i := strings.Index(dom, `data-panel="`); i >= 0 {
			rest := dom[i+len(`data-panel="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-panel=ok…; got %q", marker)
	}
}
