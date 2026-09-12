package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyStateMetricsIssueMarkdown verifies the 「贴 issue」 Markdown wraps
// enable URL + filter summary + EmptyStateMetrics JSON.
func TestEmptyStateMetricsIssueMarkdown(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-issue",
		Verdict:     VerdictFail,
		Meta:        ReportMeta{HostName: "ci-host-1", PluginVersion: "0.5.2", ProjectRoot: "/tmp/workspace/demo-suite"},
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
		`copy-empty-state-metrics-issue`,
		`StudioReportFormatEmptyStateMetricsIssueMarkdown`,
		`StudioReportFormatEmptyStateMetricsIssueShortMarkdown`,
		`StudioReportCopyEmptyStateMetricsIssueMarkdown`,
		`StudioReportDownloadEmptyStateMetricsIssueShortMarkdown`,
		`StudioReportBuildEmptyStateMetricsIssueShortDownloadName`,
		`download-empty-state-metrics-issue-short`,
		`下载短卡片`,
		`贴 issue`,
		`Shift+点击复制短卡片`,
		`Alt+点击下载短卡片`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics issue markdown smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	// Avoid nested backticks in a Go raw string: fence check uses fromCharCode(96).
	probe := "<script>\n(function () {\n" +
		"  function mark(v) { document.documentElement.setAttribute('data-issue-md', v); }\n" +
		"  function go() {\n" +
		"    var applyNamed = window.StudioReportApplyEmptyStateMetricsMetaFieldNamedPreset;\n" +
		"    var format = window.StudioReportFormatEmptyStateMetricsIssueMarkdown;\n" +
		"    var formatShort = window.StudioReportFormatEmptyStateMetricsIssueShortMarkdown;\n" +
		"    var copy = window.StudioReportCopyEmptyStateMetricsIssueMarkdown;\n" +
		"    var downloadShort = window.StudioReportDownloadEmptyStateMetricsIssueShortMarkdown;\n" +
		"    var buildName = window.StudioReportBuildEmptyStateMetricsDownloadName;\n" +
		"    var buildShortName = window.StudioReportBuildEmptyStateMetricsIssueShortDownloadName;\n" +
		"    var show = window.StudioReportShowEmptyStateMetricsPanel;\n" +
		"    var clear = window.StudioReportClearReportFilters;\n" +
		"    var setExp = window.StudioReportSetEmptyStateMetricsEventsExpanded;\n" +
		"    var setKind = window.StudioReportSetEmptyStateMetricsEventKindFilter;\n" +
		"    var btn = document.querySelector('[data-action=\"copy-empty-state-metrics-issue\"]');\n" +
		"    var dlBtn = document.querySelector('[data-action=\"download-empty-state-metrics-issue-short\"]');\n" +
		"    if (typeof format !== 'function' || typeof formatShort !== 'function' || typeof copy !== 'function' || typeof downloadShort !== 'function' || typeof buildShortName !== 'function' || typeof show !== 'function' || typeof setKind !== 'function' || !btn || !dlBtn) {\n" +
		"      mark('missing');\n" +
		"      return;\n" +
		"    }\n" +
		"    show();\n" +
		"    if (typeof clear === 'function') { clear(); clear({ source: 'esc' }); }\n" +
		"    if (typeof setExp === 'function') setExp(true);\n" +
		"    try { history.replaceState(null, '', location.pathname + '?foo=1#overview?scenario=fail'); } catch (e) {}\n" +
		"    setKind('');\n" +
		"    var mdAll = format();\n" +
		"    var fence = String.fromCharCode(96, 96, 96);\n" +
		"    var allOk = typeof mdAll === 'string'\n" +
		"      && mdAll.indexOf('### studio-reporter 空态 metrics') >= 0\n" +
		"      && mdAll.indexOf('emptyMetrics=1') >= 0\n" +
		"      && mdAll.indexOf(fence) >= 0\n" +
		"      && mdAll.indexOf('studio-report-empty-state-metrics-visible') >= 0\n" +
		"      && mdAll.indexOf('当前过滤') >= 0\n" +
		"      && mdAll.indexOf('事件 kind') >= 0\n" +
		"      && mdAll.indexOf('当前未过滤') >= 0\n" +
		"      && mdAll.indexOf('项目') >= 0\n" +
		"      && mdAll.indexOf('生成时间') >= 0\n" +
		"      && mdAll.indexOf('项目根目录') >= 0\n" +
		"      && mdAll.indexOf('/tmp/workspace/demo-suite') >= 0\n" +
		"      && mdAll.indexOf('主机') >= 0\n" +
		"      && mdAll.indexOf('ci-host-1') >= 0\n" +
		"      && mdAll.indexOf('插件版本') >= 0\n" +
		"      && mdAll.indexOf('0.5.2') >= 0\n" +
		"      && mdAll.indexOf('### studio-reporter 空态 metrics · 预设') >= 0\n" +
		"      && mdAll.indexOf('meta 字段预设') >= 0;\n" +
		"    var presetOk = true;\n" +
		"    if (typeof applyNamed === 'function') {\n" +
		"      applyNamed('ci-slim');\n" +
		"      var mdPreset = format();\n" +
		"      presetOk = typeof mdPreset === 'string'\n" +
		"        && mdPreset.indexOf('### studio-reporter 空态 metrics · 预设') >= 0\n" +
		"        && (mdPreset.indexOf('CI') >= 0 || mdPreset.indexOf('精简') >= 0)\n" +
		"        && mdPreset.indexOf('ci-slim') >= 0\n" +
		"        && mdPreset.indexOf('meta 字段预设') >= 0;\n" +
		"      applyNamed('default');\n" +
		"    }\n" +
		"    var shortMd = formatShort();\n" +
		"    var shortOk = typeof shortMd === 'string'\n" +
		"      && shortMd.indexOf('### studio-reporter 空态 metrics · 预设') >= 0\n" +
		"      && shortMd.indexOf('meta 字段预设') >= 0\n" +
		"      && shortMd.indexOf('事件 kind') >= 0\n" +
		"      && shortMd.indexOf('当前未过滤') >= 0\n" +
		"      && shortMd.indexOf('开启链接') >= 0\n" +
		"      && shortMd.indexOf('```json') < 0;\n" +
		"    if (typeof applyNamed === 'function') {\n" +
		"      applyNamed('ci-slim');\n" +
		"      setKind('escClear');\n" +
		"      var shortPreset = formatShort();\n" +
		"      shortOk = shortOk && typeof shortPreset === 'string'\n" +
		"        && (shortPreset.indexOf('CI') >= 0 || shortPreset.indexOf('精简') >= 0)\n" +
		"        && shortPreset.indexOf('ci-slim') >= 0\n" +
		"        && shortPreset.indexOf('escClear') >= 0\n" +
		"        && shortPreset.indexOf('```json') < 0;\n" +
		"      setKind('');\n" +
		"      applyNamed('default');\n" +
		"    }\n" +
		"    var dlNameOk = typeof buildName !== 'function' || String(buildName('empty-state-metrics-issue-short', 'md') || '').indexOf('issue-short') >= 0;\n" +
		"    if (typeof applyNamed === 'function') applyNamed('ci-slim');\n" +
		"    setKind('escClear');\n" +
		"    var shortName = buildShortName();\n" +
		"    var shortNameOk = typeof shortName === 'string'\n" +
		"      && shortName.indexOf('issue-short') >= 0\n" +
		"      && shortName.indexOf('preset-ci-slim') >= 0\n" +
		"      && shortName.indexOf('metrics-issue') >= 0\n" +
		"      && shortName.indexOf('escClear') >= 0\n" +
		"      && /\\.md$/.test(shortName);\n" +
		"    var downloaded = '';\n" +
		"    var capturedName = '';\n" +
		"    var origCreate = document.createElement.bind(document);\n" +
		"    document.createElement = function (tag) {\n" +
		"      var el = origCreate(tag);\n" +
		"      if (String(tag).toLowerCase() === 'a') {\n" +
		"        el.click = function () { capturedName = String(el.download || ''); };\n" +
		"      }\n" +
		"      return el;\n" +
		"    };\n" +
		"    try {\n" +
		"      downloaded = downloadShort();\n" +
		"      copy({ short: true, download: true });\n" +
		"      // Explicit toolbar button should also trigger short-card download.\n" +
		"      capturedName = '';\n" +
		"      dlBtn.click();\n" +
		"    } finally {\n" +
		"      document.createElement = origCreate;\n" +
		"    }\n" +
		"    var downloadOk = typeof downloaded === 'string'\n" +
		"      && downloaded.indexOf('### studio-reporter 空态 metrics · 预设') >= 0\n" +
		"      && downloaded.indexOf('```json') < 0\n" +
		"      && dlNameOk && shortNameOk\n" +
		"      && capturedName.indexOf('preset-ci-slim') >= 0;\n" +
		"    setKind('');\n" +
		"    if (typeof applyNamed === 'function') applyNamed('default');\n" +
		"    setKind('escClear');\n" +
		"    var mdEsc = format();\n" +
		"    var escOk = typeof mdEsc === 'string'\n" +
		"      && mdEsc.indexOf('escClear') >= 0\n" +
		"      && mdEsc.indexOf('可见子集') >= 0\n" +
		"      && mdEsc.indexOf('studio-report-empty-state-metrics-visible') >= 0;\n" +
		"    // Embedded JSON should only keep escClear events when filtered.\n" +
		"    var jsonStart = mdEsc.indexOf(fence + 'json');\n" +
		"    var jsonEnd = mdEsc.indexOf(fence, jsonStart + 8);\n" +
		"    var embedded = '';\n" +
		"    if (jsonStart >= 0 && jsonEnd > jsonStart) embedded = mdEsc.slice(jsonStart + (fence + 'json').length, jsonEnd).trim();\n" +
		"    var parsed = null;\n" +
		"    try { parsed = JSON.parse(embedded); } catch (e2) {}\n" +
		"    var subsetOk = parsed && Array.isArray(parsed.events) && parsed.events.length >= 1\n" +
		"      && parsed.events.every(function (ev) { return ev && ev.kind === 'escClear'; });\n" +
		"    mark((allOk && escOk && subsetOk && presetOk && shortOk && downloadOk) ? 'ok' : ('fail:all=' + allOk + ';esc=' + escOk + ';sub=' + subsetOk + ';preset=' + presetOk + ';short=' + shortOk + ';dl=' + downloadOk + ';name=' + capturedName + ';md=' + String(mdEsc).slice(0, 220)));\n" +
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
	if !strings.Contains(dom, `data-issue-md="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-issue-md="`); i >= 0 {
			rest := dom[i+len(`data-issue-md="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-issue-md=ok; got %q", marker)
	}
}
