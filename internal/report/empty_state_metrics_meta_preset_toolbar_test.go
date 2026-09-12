package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsMetaPresetToolbarChip verifies the tools-row named-preset
// chip cycles presets on click, opens the fields editor on Shift+click, and
// resets to default via the companion button.
func TestEmptyStateMetricsMetaPresetToolbarChip(t *testing.T) {
	r := &Report{
		ProjectName: "meta-preset-toolbar",
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
		`overview-empty-state-metrics-meta-preset-chip`,
		`overview-empty-state-metrics-meta-preset-reset`,
		`cycle-empty-state-metrics-meta-field-named-preset`,
		`reset-empty-state-metrics-meta-field-named-preset`,
		`StudioReportSyncEmptyStateMetricsMetaPresetToolbarChip`,
		`StudioReportOpenEmptyStateMetricsMetaFieldsEditor`,
		`StudioReportCycleEmptyStateMetricsMetaFieldNamedPreset`,
		`StudioReportActivateEmptyStateMetricsMetaPresetChip`,
		`StudioReportResetEmptyStateMetricsMetaFieldNamedPresetToDefault`,
		`预设·默认`,
		`回默认`,
		`Shift+点击`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-meta-preset-chip`) {
		t.Fatal("CSS missing meta-preset-chip")
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-meta-preset-chip.is-custom`) {
		t.Fatal("CSS missing meta-preset-chip.is-custom")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for meta-preset toolbar smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-meta-preset-toolbar', v); }
  function go() {
    var show = window.StudioReportShowEmptyStateMetricsPanel;
    var applyNamed = window.StudioReportApplyEmptyStateMetricsMetaFieldNamedPreset;
    var activeNamed = window.StudioReportGetActiveEmptyStateMetricsMetaFieldNamedPresetId;
    var syncChip = window.StudioReportSyncEmptyStateMetricsMetaPresetToolbarChip;
    var openEditor = window.StudioReportOpenEmptyStateMetricsMetaFieldsEditor;
    var cycle = window.StudioReportCycleEmptyStateMetricsMetaFieldNamedPreset;
    var activate = window.StudioReportActivateEmptyStateMetricsMetaPresetChip;
    var resetDefault = window.StudioReportResetEmptyStateMetricsMetaFieldNamedPresetToDefault;
    if (typeof show !== 'function' || typeof applyNamed !== 'function' || typeof activeNamed !== 'function'
      || typeof syncChip !== 'function' || typeof openEditor !== 'function' || typeof cycle !== 'function'
      || typeof activate !== 'function' || typeof resetDefault !== 'function') {
      mark('missing');
      return;
    }
    try { localStorage.removeItem('studio-report-empty-metrics-meta-fields'); } catch (e) {}
    try { localStorage.removeItem('studio-report-empty-metrics-meta-field-named-active'); } catch (e2) {}
    show();
    syncChip();
    var chip = document.getElementById('overview-empty-state-metrics-meta-preset-chip');
    var resetBtn = document.getElementById('overview-empty-state-metrics-meta-preset-reset');
    var editor = document.getElementById('overview-empty-state-metrics-meta-fields');
    if (!chip || !resetBtn || !editor) {
      mark('missing-dom');
      return;
    }
    var defLabelOk = (chip.textContent || '').indexOf('默认') >= 0;
    var defHiddenOk = resetBtn.hasAttribute('hidden') && !chip.classList.contains('is-custom');
    var actionOk = chip.getAttribute('data-action') === 'cycle-empty-state-metrics-meta-field-named-preset';

    // Plain click cycles default → ci-slim (first builtin after default).
    chip.click();
    syncChip();
    var cycle1Ok = activeNamed() === 'ci-slim'
      && ((chip.textContent || '').indexOf('CI') >= 0 || (chip.textContent || '').indexOf('精简') >= 0)
      && chip.classList.contains('is-custom')
      && !resetBtn.hasAttribute('hidden');

    chip.click();
    syncChip();
    var cycle2Ok = activeNamed() === 'debug-full'
      && ((chip.textContent || '').indexOf('排障') >= 0 || (chip.textContent || '').indexOf('完整') >= 0);

    // Bridge cycle with negative delta wraps back.
    cycle(-1);
    syncChip();
    var cycleBackOk = activeNamed() === 'ci-slim';

    // Shift+click opens editor without further cycling.
    var beforeShift = activeNamed();
    activate({ shiftKey: true });
    syncChip();
    var shiftOpenOk = !editor.hasAttribute('hidden') && activeNamed() === beforeShift;

    // Editor chip still applies and refreshes toolbar chip.
    var editorChip = document.querySelector('[data-action="apply-empty-state-metrics-meta-field-named"][data-named-preset="debug-full"]');
    var editorChipOk = !!editorChip;
    if (editorChip) editorChip.click();
    syncChip();
    var afterEditorOk = activeNamed() === 'debug-full'
      && chip.dataset.namedPreset === 'debug-full'
      && chip.classList.contains('is-custom')
      && !resetBtn.hasAttribute('hidden');

    resetBtn.click();
    syncChip();
    var resetOk = activeNamed() === 'default'
      && (chip.textContent || '').indexOf('默认') >= 0
      && !chip.classList.contains('is-custom')
      && resetBtn.hasAttribute('hidden');

    applyNamed('ci-slim');
    resetDefault();
    syncChip();
    var bridgeResetOk = activeNamed() === 'default' && resetBtn.hasAttribute('hidden');

    var ok = defLabelOk && defHiddenOk && actionOk && cycle1Ok && cycle2Ok && cycleBackOk
      && shiftOpenOk && editorChipOk && afterEditorOk && resetOk && bridgeResetOk;
    mark(ok ? 'ok' : ('fail:def=' + defLabelOk + ';dh=' + defHiddenOk + ';act=' + actionOk
      + ';c1=' + cycle1Ok + ';c2=' + cycle2Ok + ';cb=' + cycleBackOk + ';sh=' + shiftOpenOk
      + ';ec=' + editorChipOk + ';ae=' + afterEditorOk + ';rs=' + resetOk + ';br=' + bridgeResetOk
      + ';chip=' + (chip.textContent || '') + ';active=' + activeNamed()));
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
	if !strings.Contains(dom, `data-meta-preset-toolbar="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-meta-preset-toolbar="`); i >= 0 {
			rest := dom[i+len(`data-meta-preset-toolbar="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("meta-preset toolbar smoke failed; marker=%q", marker)
	}
}
