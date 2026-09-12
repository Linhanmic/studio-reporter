package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsMetaFieldPrefs verifies customizable primary/secondary
// meta field order & visibility (localStorage) with the fields editor UI.
func TestEmptyStateMetricsMetaFieldPrefs(t *testing.T) {
	r := &Report{
		ProjectName: "meta-fields",
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
		`toggle-empty-state-metrics-meta-fields`,
		`overview-empty-state-metrics-meta-fields`,
		`StudioReportGetEmptyStateMetricsMetaFieldPrefs`,
		`StudioReportSetEmptyStateMetricsMetaFieldPrefs`,
		`StudioReportResetEmptyStateMetricsMetaFieldPrefs`,
		`StudioReportSetEmptyStateMetricsMetaFieldGroup`,
		`StudioReportMoveEmptyStateMetricsMetaField`,
		`studio-report-empty-metrics-meta-fields`,
		`字段`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-meta-fields-row`) {
		t.Fatal("CSS missing meta-fields-row")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics meta-fields smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-meta-fields', v); }
  function go() {
    var get = window.StudioReportGetEmptyStateMetricsMetaFieldPrefs;
    var set = window.StudioReportSetEmptyStateMetricsMetaFieldPrefs;
    var setGroup = window.StudioReportSetEmptyStateMetricsMetaFieldGroup;
    var move = window.StudioReportMoveEmptyStateMetricsMetaField;
    var reset = window.StudioReportResetEmptyStateMetricsMetaFieldPrefs;
    var primary = window.StudioReportFormatEmptyStateMetricsReportSummaryPrimary;
    var secondary = window.StudioReportFormatEmptyStateMetricsReportSummarySecondary;
    var show = window.StudioReportShowEmptyStateMetricsPanel || window.StudioReportSetEmptyStateMetricsPanelVisible;
    var sync = window.StudioReportSyncEmptyStateMetricsPanel;
    if (typeof get !== 'function' || typeof set !== 'function' || typeof setGroup !== 'function' || typeof move !== 'function' || typeof reset !== 'function' || typeof primary !== 'function' || typeof secondary !== 'function') {
      mark('missing');
      return;
    }
    try { localStorage.removeItem('studio-report-empty-metrics-meta-fields'); } catch (e) {}
    try { localStorage.removeItem('studio-report-empty-metrics-meta-fields-open'); } catch (e2) {}
    try { localStorage.setItem('studio-report-empty-metrics', '1'); } catch (e3) {}
    if (typeof show === 'function') {
      try { show(true); } catch (e4) { try { show(); } catch (e5) {} }
    }
    if (typeof sync === 'function') sync();

    var def = get();
    var defOk = def && Array.isArray(def.primary) && def.primary.join(',') === 'projectName,verdict,generatedAt'
      && Array.isArray(def.secondary) && def.secondary.join(',') === 'projectRoot,hostName,pluginVersion';
    var p0 = String(primary() || '');
    var s0 = String(secondary() || '');
    var defTextOk = p0.indexOf('meta-fields') >= 0 && p0.indexOf('ci-host') < 0
      && s0.indexOf('demo-suite') >= 0 && s0.indexOf('ci-host') >= 0;

    set({ primary: ['verdict', 'projectName'], secondary: ['hostName', 'environment'] });
    var custom = get();
    var customOk = custom.primary.join(',') === 'verdict,projectName' && custom.secondary.join(',') === 'hostName,environment';
    var p1 = String(primary() || '');
    var s1 = String(secondary() || '');
    var customTextOk = p1.indexOf('meta-fields') >= 0 && p1.indexOf('ci-host') < 0
      && s1.indexOf('ci-host') >= 0 && s1.indexOf('ci') >= 0 && s1.indexOf('demo-suite') < 0;

    setGroup('duration', 'primary');
    move('duration', -1);
    var moved = get();
    var movedOk = moved.primary.indexOf('duration') >= 0 && moved.primary.indexOf('duration') < moved.primary.length - 1;

    reset();
    var after = get();
    var resetOk = after.primary.join(',') === 'projectName,verdict,generatedAt';

    var btn = document.querySelector('[data-action="toggle-empty-state-metrics-meta-fields"]');
    var editor = document.getElementById('overview-empty-state-metrics-meta-fields');
    var uiOk = !!btn && !!editor;
    if (btn) btn.click();
    var openOk = editor && !editor.hasAttribute('hidden') && editor.querySelectorAll('[data-meta-field]').length >= 6;

    mark((defOk && defTextOk && customOk && customTextOk && movedOk && resetOk && uiOk && openOk) ? 'ok' : ('fail:def=' + defOk + ';dt=' + defTextOk + ';c=' + customOk + ';ct=' + customTextOk + ';m=' + movedOk + ';r=' + resetOk + ';ui=' + uiOk + ';open=' + openOk + ';p0=' + p0 + ';s0=' + s0 + ';p1=' + p1 + ';s1=' + s1));
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
	if !strings.Contains(dom, `data-meta-fields="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-meta-fields="`); i >= 0 {
			rest := dom[i+len(`data-meta-fields="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-meta-fields=ok; got %q", marker)
	}
}
