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
		`导入预设`,
		`复制预设`,
		`StudioReportApplyEmptyStateMetricsMetaFieldPrefsJSON`,
		`StudioReportFormatEmptyStateMetricsMetaFieldPrefsJSON`,
		`StudioReportDownloadEmptyStateMetricsMetaFieldPrefsJSON`,
		`StudioReportBuildEmptyStateMetricsMetaFieldPrefsDownloadName`,
		`studio-report-empty-metrics-meta-fields__`,
		`StudioReportApplyEmptyStateMetricsMetaFieldNamedPreset`,
		`StudioReportListEmptyStateMetricsMetaFieldNamedPresets`,
		`StudioReportBuildEmptyStateMetricsMetaFieldNamedPresetsDownloadName`,
		`StudioReportDownloadEmptyStateMetricsMetaFieldNamedPresetsJSON`,
		`download-empty-state-metrics-meta-field-named-json`,
		`下载库`,
		`CI 精简`,
		`排障完整`,
		`apply-empty-state-metrics-meta-field-named`,
		`studio-report-empty-metrics-meta-field-named`,
		`overview-empty-state-metrics-meta-preset-chip`,
		`cycle-empty-state-metrics-meta-field-named-preset`,
		`reset-empty-state-metrics-meta-field-named-preset`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-meta-fields-row`) {
		t.Fatal("CSS missing meta-fields-row")
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-meta-fields-named-chip`) {
		t.Fatal("CSS missing named-chip")
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
    try { localStorage.removeItem('studio-report-empty-metrics-meta-field-named'); } catch (eNamed) {}
    try { localStorage.removeItem('studio-report-empty-metrics-meta-field-named-active'); } catch (eActive) {}
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

    var formatPrefs = window.StudioReportFormatEmptyStateMetricsMetaFieldPrefsJSON;
    var applyPrefs = window.StudioReportApplyEmptyStateMetricsMetaFieldPrefsJSON;
    var prefsIOOk = false;
    if (typeof formatPrefs === 'function' && typeof applyPrefs === 'function') {
      set({ primary: ['hostName'], secondary: ['projectName', 'duration'] });
      var exported = formatPrefs();
      var parsed = null;
      try { parsed = JSON.parse(exported); } catch (e6) {}
      var exportOk = parsed && parsed.kind === 'studio-report-empty-metrics-meta-fields' && parsed.version === 1
        && Array.isArray(parsed.primary) && parsed.primary.join(',') === 'hostName'
        && Array.isArray(parsed.secondary) && parsed.secondary.join(',') === 'projectName,duration';
      reset();
      var applied = applyPrefs(exported);
      var afterImport = get();
      var importOk = !!applied && afterImport.primary.join(',') === 'hostName' && afterImport.secondary.join(',') === 'projectName,duration';
      var pImp = String(primary() || '');
      var sImp = String(secondary() || '');
      var importTextOk = pImp.indexOf('ci-host') >= 0 && sImp.indexOf('meta-fields') >= 0;
      prefsIOOk = exportOk && importOk && importTextOk;
      reset();
    }

    var listNamed = window.StudioReportListEmptyStateMetricsMetaFieldNamedPresets;
    var applyNamed = window.StudioReportApplyEmptyStateMetricsMetaFieldNamedPreset;
    var activeNamed = window.StudioReportGetActiveEmptyStateMetricsMetaFieldNamedPresetId;
    var saveNamed = window.StudioReportSaveEmptyStateMetricsMetaFieldNamedPreset;
    var deleteNamed = window.StudioReportDeleteEmptyStateMetricsMetaFieldNamedPreset;
    var formatNamedLib = window.StudioReportFormatEmptyStateMetricsMetaFieldNamedPresetsJSON;
    var applyNamedLib = window.StudioReportApplyEmptyStateMetricsMetaFieldNamedPresetsJSON;
    var buildPrefsName = window.StudioReportBuildEmptyStateMetricsMetaFieldPrefsDownloadName;
    var downloadPrefs = window.StudioReportDownloadEmptyStateMetricsMetaFieldPrefsJSON;
    var prefsDlOk = false;
    if (typeof buildPrefsName === 'function' && typeof downloadPrefs === 'function' && typeof applyNamed === 'function') {
      applyNamed('ci-slim');
      var expectedName = buildPrefsName();
      var nameOk = typeof expectedName === 'string'
        && expectedName.indexOf('studio-report-empty-metrics-meta-fields__') >= 0
        && expectedName.indexOf('preset-ci-slim') >= 0
        && /\.json$/.test(expectedName);
      var capturedName = '';
      var origCreate = document.createElement.bind(document);
      document.createElement = function (tag) {
        var el = origCreate(tag);
        if (String(tag).toLowerCase() === 'a') {
          el.click = function () { capturedName = String(el.download || ''); };
        }
        return el;
      };
      try { downloadPrefs(); } finally { document.createElement = origCreate; }
      var statusEl = document.querySelector('.status-msg');
      var statusText = statusEl ? String(statusEl.textContent || '') : '';
      var statusOk = statusText.indexOf('已下载 meta 字段预设 JSON：') >= 0
        && statusText.indexOf(expectedName) >= 0
        && statusText.indexOf('preset-ci-slim') >= 0;
      prefsDlOk = nameOk && capturedName === expectedName && statusOk;
      if (!prefsDlOk) {
        mark('fail:prefs-dl:nameOk=' + nameOk + ';cap=' + capturedName + ';exp=' + expectedName + ';status=' + statusText);
        return;
      }
      reset();
      try { localStorage.removeItem('studio-report-empty-metrics-meta-field-named-active'); } catch (eDl) {}
    }

    var namedOk = false;
    if (typeof listNamed === 'function' && typeof applyNamed === 'function' && typeof activeNamed === 'function'
      && typeof saveNamed === 'function' && typeof deleteNamed === 'function'
      && typeof formatNamedLib === 'function' && typeof applyNamedLib === 'function') {
      var listed = listNamed();
      var listOk = Array.isArray(listed) && listed.length >= 3
        && listed.some(function (p) { return p.id === 'ci-slim' && p.name === 'CI 精简'; })
        && listed.some(function (p) { return p.id === 'debug-full' && p.name === '排障完整'; });
      applyNamed('ci-slim');
      var slim = get();
      var slimOk = slim.primary.join(',') === 'projectName,verdict' && slim.secondary.join(',') === ''
        && activeNamed() === 'ci-slim';
      var pSlim = String(primary() || '');
      var sSlim = String(secondary() || '');
      var slimTextOk = pSlim.indexOf('meta-fields') >= 0 && pSlim.indexOf('fail') >= 0
        && sSlim === '';
      applyNamed('debug-full');
      var full = get();
      var fullOk = full.primary.indexOf('duration') >= 0 && full.secondary.indexOf('environment') >= 0
        && activeNamed() === 'debug-full';
      var pFull = String(primary() || '');
      var sFull = String(secondary() || '');
      var fullTextOk = pFull.indexOf('12.3s') >= 0 && sFull.indexOf('ci') >= 0;

      set({ primary: ['hostName', 'verdict'], secondary: ['duration'] });
      var saved = saveNamed('团队排障');
      var savedOk = !!saved && saved.name === '团队排障' && activeNamed() === saved.id;
      var afterSave = listNamed().some(function (p) { return !p.builtin && p.name === '团队排障'; });
      var lib = formatNamedLib();
      var libParsed = null;
      try { libParsed = JSON.parse(lib); } catch (e7) {}
      var libOk = libParsed && libParsed.kind === 'studio-report-empty-metrics-meta-field-named'
        && Array.isArray(libParsed.custom) && libParsed.custom.some(function (p) { return p.name === '团队排障'; });
      applyNamed('default');
      deleteNamed(saved.id);
      var deletedOk = !listNamed().some(function (p) { return p.id === saved.id; });
      applyNamedLib(lib);
      var reimportOk = listNamed().some(function (p) { return !p.builtin && p.name === '团队排障'; });
      // Ensure editor is open (earlier toggle may have left it open or closed).
      if (editor && editor.hasAttribute('hidden') && btn) btn.click();
      if (editor && editor.hasAttribute('hidden') && typeof window.StudioReportToggleEmptyStateMetricsMetaFieldsEditor === 'function') {
        window.StudioReportToggleEmptyStateMetricsMetaFieldsEditor();
      }
      var chip = document.querySelector('[data-action="apply-empty-state-metrics-meta-field-named"][data-named-preset="ci-slim"]');
      var chipOk = !!chip;
      if (chip) chip.click();
      var chipAppliedOk = activeNamed() === 'ci-slim' && get().primary.join(',') === 'projectName,verdict';
      namedOk = listOk && slimOk && slimTextOk && fullOk && fullTextOk && savedOk && afterSave && libOk && deletedOk && reimportOk && chipOk && chipAppliedOk;
      if (!namedOk) {
        mark('fail:named:list=' + listOk + ';slim=' + slimOk + ';st=' + slimTextOk + ';full=' + fullOk + ';ft=' + fullTextOk + ';save=' + savedOk + ';as=' + afterSave + ';lib=' + libOk + ';del=' + deletedOk + ';re=' + reimportOk + ';chip=' + chipOk + ';ca=' + chipAppliedOk + ';pSlim=' + pSlim + ';pFull=' + pFull + ';sFull=' + sFull);
        return;
      }

      var buildLibName = window.StudioReportBuildEmptyStateMetricsMetaFieldNamedPresetsDownloadName;
      var downloadLib = window.StudioReportDownloadEmptyStateMetricsMetaFieldNamedPresetsJSON;
      var libDlOk = false;
      if (typeof buildLibName === 'function' && typeof downloadLib === 'function') {
        // Ensure at least one custom preset exists for custom-N in filename.
        set({ primary: ['hostName'], secondary: ['duration'] });
        var savedForDl = saveNamed('下载库抽检');
        // Editor DOM may re-render after save; re-query the download button.
        var libDlBtn = document.querySelector('[data-action="download-empty-state-metrics-meta-field-named-json"]');
        var expectedLibName = buildLibName();
        var libNameOk = typeof expectedLibName === 'string'
          && expectedLibName.indexOf('studio-report-empty-metrics-meta-field-named__') >= 0
          && expectedLibName.indexOf('custom-') >= 0
          && /\.json$/.test(expectedLibName);
        var capturedLibName = '';
        var origCreateLib = document.createElement.bind(document);
        document.createElement = function (tag) {
          var el = origCreateLib(tag);
          if (String(tag).toLowerCase() === 'a') {
            el.click = function () { capturedLibName = String(el.download || ''); };
          }
          return el;
        };
        try {
          if (libDlBtn) libDlBtn.click();
          else downloadLib();
          // If button path did not capture (stale handler), call API directly.
          if (!capturedLibName) downloadLib();
        } finally { document.createElement = origCreateLib; }
        var statusLibEl = document.querySelector('.status-msg');
        var statusLibText = statusLibEl ? String(statusLibEl.textContent || '') : '';
        var statusLibOk = statusLibText.indexOf('已下载命名字段预设库 JSON：') >= 0
          && statusLibText.indexOf(expectedLibName) >= 0;
        libDlOk = libNameOk && capturedLibName === expectedLibName && statusLibOk && !!savedForDl && !!libDlBtn;
        if (!libDlOk) {
          mark('fail:lib-dl:nameOk=' + libNameOk + ';btn=' + !!libDlBtn + ';cap=' + capturedLibName + ';exp=' + expectedLibName + ';status=' + statusLibText);
          return;
        }
        if (savedForDl && savedForDl.id) deleteNamed(savedForDl.id);
      } else {
        mark('fail:lib-dl:missing-api');
        return;
      }
      namedOk = namedOk && libDlOk;

      reset();
      try { localStorage.removeItem('studio-report-empty-metrics-meta-field-named'); } catch (e8) {}
      try { localStorage.removeItem('studio-report-empty-metrics-meta-field-named-active'); } catch (e9) {}
    }

    mark((defOk && defTextOk && customOk && customTextOk && movedOk && resetOk && uiOk && openOk && prefsIOOk && prefsDlOk && namedOk) ? 'ok' : ('fail:def=' + defOk + ';dt=' + defTextOk + ';c=' + customOk + ';ct=' + customTextOk + ';m=' + movedOk + ';r=' + resetOk + ';ui=' + uiOk + ';open=' + openOk + ';io=' + prefsIOOk + ';dl=' + prefsDlOk + ';named=' + namedOk + ';p0=' + p0 + ';s0=' + s0 + ';p1=' + p1 + ';s1=' + s1));
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
