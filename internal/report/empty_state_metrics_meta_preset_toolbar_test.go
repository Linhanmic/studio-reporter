package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsMetaPresetToolbarChip verifies the tools-row named-preset
// chip + one-click reset-to-default stay in sync with the fields editor.
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
		`open-empty-state-metrics-meta-fields`,
		`reset-empty-state-metrics-meta-field-named-preset`,
		`StudioReportSyncEmptyStateMetricsMetaPresetToolbarChip`,
		`StudioReportOpenEmptyStateMetricsMetaFieldsEditor`,
		`StudioReportResetEmptyStateMetricsMetaFieldNamedPresetToDefault`,
		`预设·默认`,
		`回默认`,
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
    var resetDefault = window.StudioReportResetEmptyStateMetricsMetaFieldNamedPresetToDefault;
    if (typeof show !== 'function' || typeof applyNamed !== 'function' || typeof activeNamed !== 'function'
      || typeof syncChip !== 'function' || typeof openEditor !== 'function' || typeof resetDefault !== 'function') {
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
    applyNamed('ci-slim');
    syncChip();
    var slimLabelOk = (chip.textContent || '').indexOf('CI') >= 0 || (chip.textContent || '').indexOf('精简') >= 0;
    var slimCustomOk = chip.classList.contains('is-custom') && chip.dataset.namedPreset === 'ci-slim';
    var slimResetVisible = !resetBtn.hasAttribute('hidden');
    var editorWasHidden = editor.hasAttribute('hidden');
    chip.click();
    var openedOk = !editor.hasAttribute('hidden');
    var editorChip = document.querySelector('[data-action="apply-empty-state-metrics-meta-field-named"][data-named-preset="debug-full"]');
    var editorChipOk = !!editorChip;
    if (editorChip) editorChip.click();
    syncChip();
    var afterEditorOk = activeNamed() === 'debug-full'
      && ((chip.textContent || '').indexOf('排障') >= 0 || (chip.textContent || '').indexOf('完整') >= 0)
      && chip.dataset.namedPreset === 'debug-full'
      && chip.classList.contains('is-custom')
      && !resetBtn.hasAttribute('hidden');
    resetBtn.click();
    syncChip();
    var resetOk = activeNamed() === 'default'
      && (chip.textContent || '').indexOf('默认') >= 0
      && !chip.classList.contains('is-custom')
      && resetBtn.hasAttribute('hidden');
    // Also exercise the bridge reset helper (idempotent after click).
    applyNamed('ci-slim');
    resetDefault();
    syncChip();
    var bridgeResetOk = activeNamed() === 'default' && resetBtn.hasAttribute('hidden');
    // Open via bridge when closed.
    if (!editor.hasAttribute('hidden')) {
      var toggle = document.querySelector('#overview-empty-state-metrics [data-action="toggle-empty-state-metrics-meta-fields"]');
      if (toggle) toggle.click();
    }
    openEditor();
    var bridgeOpenOk = !editor.hasAttribute('hidden');
    var ok = defLabelOk && defHiddenOk && slimLabelOk && slimCustomOk && slimResetVisible
      && editorWasHidden && openedOk && editorChipOk && afterEditorOk && resetOk && bridgeResetOk && bridgeOpenOk;
    mark(ok ? 'ok' : ('fail:def=' + defLabelOk + ';dh=' + defHiddenOk + ';sl=' + slimLabelOk
      + ';sc=' + slimCustomOk + ';rv=' + slimResetVisible + ';ew=' + editorWasHidden + ';op=' + openedOk
      + ';ec=' + editorChipOk + ';ae=' + afterEditorOk + ';rs=' + resetOk + ';br=' + bridgeResetOk
      + ';bo=' + bridgeOpenOk + ';chip=' + (chip.textContent || '') + ';active=' + activeNamed()));
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
