package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenderReportHTMLOverviewNavShots(t *testing.T) {
	t.Setenv("GAUGE_STUDIO_REPORT_META", "DUT=ECU-A,Build=42")
	r := &Report{
		ProjectName: "canoe-like",
		Duration:    "00:00:02.000",
		Verdict:     VerdictFail,
		Environment: "ci",
		Timestamp:   "2026-09-11 12:00:00",
		Specs: []SpecReport{{
			ID:                 "spec:login",
			Heading:            "Login",
			Verdict:            VerdictFail,
			Duration:           "00:00:02.000",
			PreHookScreenshots: []string{"images/spec-before.png"},
			Scenarios: []ScenarioReport{{
				ID:       "scn:fail",
				Heading:  "Fail path",
				Verdict:  VerdictFail,
				Duration: "00:00:02.000",
				Items: []ItemReport{
					{Kind: "step", Duration: "00:00:01.000", Step: &StepReport{
						ActualText:          "Capture",
						Verdict:             VerdictFail,
						Duration:            "00:00:01.000",
						ErrorMessage:        "boom",
						Screenshots:         []string{"images/step-a.png", "images/step-b.png"},
						FailureScreenshot:   "images/step-fail.png",
						PreHookScreenshots:  []string{"images/step-before.png"},
						PostHookScreenshots: []string{"images/step-after.png"},
					}},
				},
			}},
		}},
	}
	html, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	for _, want := range []string{
		`id="overview"`,
		`class="nav-pane"`,
		`class="content-pane"`,
		`class="workspace"`,
		`data-nav-target="overview"`,
		`data-nav-target="spec:login"`,
		`data-nav-target="scn:fail"`,
		`data-action="export-pdf"`,
		`data-action="show-overview"`,
		`id="shot-lightbox"`,
		`data-shot-gallery`,
		`data-lightbox-nav="-1"`,
		`data-lightbox-nav="1"`,
		`id="shot-lightbox-pos"`,
		`data-shot-src="images/step-a.png"`,
		`data-shot-src="images/step-fail.png"`,
		`shot-fail`,
		`Spec before 截图`,
		`步骤截图`,
		`DUT`,
		`ECU-A`,
		`Build`,
		`截图显示策略`,
		`插件版本`,
		`操作系统`,
		`失败原因聚合`,
		`fail-reason-table`,
		`data-stat-kind="specs"`,
		`data-count-kind="scenarios"`,
		`overview-count-row`,
		`overview-spec-row`,
		`data-nav-scn-count`,
		`nav-count`,
		`data-scn-id=`,
		`print-scope-banner`,
		`data-spec-id=`,
		`fail-reason-ref`,
		`data-fail-ref-kind="scenario"`,
		`data-scn-id="scn:fail"`,
		`data-fail-count-total=`,
		`copy-fail-reason-link`,
		`复制深链`,
		`复制摘要`,
		`copy-fail-reason-snippet`,
		`复制全部摘要`,
		`copy-all-fail-reason-snippets`,
		`复制全部深链`,
		`copy-all-fail-reason-links`,
		`overview-fail-reason-empty-hint`,
		`当前过滤下无可见失败原因（Esc 可清除过滤）`,
		`clear-report-filters`,
		`清除过滤`,
		`restore-fail-only-view`,
		`仅看失败`,
		`undo-clear-report-filters`,
		`撤销清除`,
		`fail-reason-empty-row`,
		`当前过滤下无匹配的失败原因`,
		`boom`,
		`data-nav-target="scn:fail"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q", want)
		}
	}
	if !strings.Contains(body, `id="spec:login"`) {
		t.Fatal("spec block missing id for nav anchors")
	}
	if !strings.Contains(body, `id="scn:fail"`) {
		t.Fatal("scenario block missing id for nav anchors")
	}
	if r.Meta.PluginVersion == "" || r.Meta.FormatVersion == 0 {
		t.Fatal("EnrichMeta should fill plugin/format version on report")
	}
}

func TestWritePDFWithChrome(t *testing.T) {
	if _, err := findChrome(); err != nil {
		t.Skip(err.Error())
	}
	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	html := `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title>
<style>@media print{.nav{display:none}}</style></head>
<body><h1>Overview</h1><p>structured pdf</p><a href="#s">link</a><h2 id="s">Spec</h2></body></html>`
	if err := os.WriteFile(index, []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}
	pdfPath := filepath.Join(dir, "report.pdf")
	if err := WritePDF(index, pdfPath); err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(pdfPath)
	if err != nil || st.Size() < 100 {
		t.Fatalf("expected non-trivial pdf, got size=%v err=%v", st, err)
	}
}

func TestPathToFileURL(t *testing.T) {
	got := pathToFileURL("/tmp/a b/index.html")
	if !strings.HasPrefix(got, "file://") {
		t.Fatalf("got %q", got)
	}
}

func TestWithURLFragment(t *testing.T) {
	got := withURLFragment("file:///tmp/index.html", "fail-steps")
	if got != "file:///tmp/index.html#fail-steps" {
		t.Fatalf("got %q", got)
	}
	got = withURLFragment("file:///tmp/index.html#overview", "#fail-steps")
	if got != "file:///tmp/index.html#fail-steps" {
		t.Fatalf("replace frag: %q", got)
	}
	if withURLFragment("file:///x", "") != "file:///x" {
		t.Fatal("empty frag should no-op")
	}
}

func TestStaticReportCSSPrintRespectsFailSteps(t *testing.T) {
	css := staticReportCSS
	printIdx := strings.Index(css, "@media print")
	if printIdx < 0 {
		t.Fatal("missing @media print")
	}
	printBlock := css[printIdx:]
	for _, want := range []string{
		`html.fail-steps-mode`,
		`data-kind="step"`,
		`data-kind="concept"`,
		`data-kind="scenario"`,
		`data-kind="spec"`,
		`:has(`,
		`filter-hidden`,
		`print-scope-banner`,
		`print-color-adjust: exact`,
		`-webkit-print-color-adjust: exact`,
	} {
		if !strings.Contains(printBlock, want) {
			t.Fatalf("print CSS missing %q", want)
		}
	}
	screenBlock := css[:printIdx]
	for _, want := range []string{
		`.fail-steps-mode .result-pane .report-block[data-kind="scenario"]:not([data-verdict="fail"])`,
		`data-kind="datarow"`,
		`data-kind="datadriven"`,
		`.fail-steps-mode .nav-pane .nav-item.nav-scn:not(.tone-fail)`,
		`.fail-steps-mode .nav-pane .nav-spec:not(:has(.nav-item.nav-scn.tone-fail))`,
	} {
		if !strings.Contains(screenBlock, want) {
			t.Fatalf("screen CSS missing scenario/nav collapse %q", want)
		}
	}
	js := staticReportJS
	for _, want := range []string{
		`beforeprint`,
		`prepareFailStepsForPrint`,
		`wantFailStepsFromURL`,
		`fail-steps`,
		`syncFailReasonOverview`,
		`syncBulkFailReasonCopyButtons`,
		`firstVisibleFailReasonTarget`,
		`jumpFailReasonRow`,
		`collectFailSummary`,
		`failSummaryDeepLink`,
		`failReasonShareURL`,
		`copyFailReasonLink`,
		`StudioReportFailReasonShareURL`,
		`StudioReportCopyFailReasonLink`,
		`StudioReportCopyFailReasonSnippet`,
		`StudioReportFormatFailReasonSnippet`,
		`StudioReportCopyAllFailReasonSnippets`,
		`StudioReportFormatAllFailReasonSnippets`,
		`StudioReportCopyAllFailReasonLinks`,
		`StudioReportFormatAllFailReasonLinks`,
		`StudioReportSyncFailReasonOverview`,
		`StudioReportSyncBulkFailReasonCopyButtons`,
		`StudioReportClearReportFilters`,
		`StudioReportRestoreFailOnlyView`,
		`StudioReportUndoClearReportFilters`,
		`clearReportFilters`,
		`restoreFailOnlyView`,
		`undoClearReportFilters`,
		`已撤销清除，已恢复：`,
		`StudioReportDescribeFilterSnapshot`,
		`describeFilterSnapshot`,
		`emptyStateMetrics`,
		`StudioReportEmptyStateMetrics`,
		`StudioReportFormatEmptyStateMetricsJSON`,
		`StudioReportEmptyStateMetricsPanelSnapshot`,
		`StudioReportDismissEmptyMetricsEnableHint`,
		`StudioReportCopyEmptyMetricsEnableURL`,
		`StudioReportShortenEmptyMetricsEnableURL`,
		`StudioReportFormatEmptyMetricsEnableURL`,
		`copy-empty-metrics-enable-url`,
		`StudioReportShowEmptyStateMetricsPanel`,
		`dismiss-empty-metrics-enable-hint`,
		`show-empty-state-metrics-panel`,
		`overview-empty-metrics-enable-hint`,
		`syncEmptyStateMetricsPanelButtons`,
		`StudioReportCopyEmptyStateMetricsJSON`,
		`StudioReportDownloadEmptyStateMetricsJSON`,
		`StudioReportResetEmptyStateMetrics`,
		`StudioReportHideEmptyStateMetricsPanel`,
		`StudioReportSetEmptyStateMetricsPanelVisible`,
		`copy-empty-state-metrics-json`,
		`download-empty-state-metrics-json`,
		`reset-empty-state-metrics`,
		`hide-empty-state-metrics-panel`,
		`emptyMetrics=1`,
		`StudioReportSyncEmptyStateMetricsPanel`,
		`overview-empty-state-metrics`,
		`overview-empty-state-metrics-text`,
		`recordEmptyStateEvent`,
		`lastFilterSnapshot`,
		`Ctrl/Cmd+Z`,
		`failReasonEmptyStateActive`,
		`clear-report-filters`,
		`restore-fail-only-view`,
		`undo-clear-report-filters`,
		`copyFailReasonSnippet`,
		`formatFailReasonSnippet`,
		`copyAllFailReasonSnippets`,
		`formatAllFailReasonSnippets`,
		`copyAllFailReasonLinks`,
		`formatAllFailReasonLinks`,
		`copy-all-fail-reason-snippets`,
		`copy-all-fail-reason-links`,
		`FAIL_SUMMARY_LOCATOR_EXAMPLE`,
		`copyFailSummaryLocatorExample`,
		`StudioReportCollectFailSummary`,
		`StudioReportFailSummaryLocatorExample`,
		`StudioReportCopyFailSummaryLocatorExample`,
		`syncOverviewCounts`,
		`syncFilterBadges`,
		`syncOverviewSpecList`,
		`syncNavCounts`,
		`updatePrintScopeBanner`,
		`describePrintScope`,
		`updateFilterGroupCounts`,
		`isNodeVisuallyCounted`,
		`visibleFailScenarioIdSet`,
		`FilterFailReasonGroups`,
		`applyingHash = true`,
		`failSteps = null`,
		`parseFailStepsFlag`,
		`failStepsParamValue`,
		`failsteps`,
		`fail_steps`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("static JS missing %q", want)
		}
	}
	if !strings.Contains(staticReportCSS, `.fail-reason-row.filter-hidden`) {
		t.Fatal("CSS missing fail-reason-row filter-hidden")
	}
	if !strings.Contains(staticReportCSS, `.fail-reason-ref.ref-hidden`) {
		t.Fatal("CSS missing fail-reason-ref ref-hidden")
	}
	if !strings.Contains(staticReportCSS, `.action-btn.action-btn-tiny`) {
		t.Fatal("CSS missing action-btn-tiny for fail-reason deep-link button")
	}
	if !strings.Contains(staticReportCSS, `.overview-fail-reason-tools`) {
		t.Fatal("CSS missing overview-fail-reason-tools for bulk copy affordance")
	}
	if !strings.Contains(staticReportCSS, `.action-btn:disabled`) {
		t.Fatal("CSS missing disabled action-btn style for bulk copy when no visible reasons")
	}
	if !strings.Contains(staticReportCSS, `.overview-fail-reason-empty-hint`) {
		t.Fatal("CSS missing overview-fail-reason-empty-hint for filtered empty state")
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics`) {
		t.Fatal("CSS missing overview-empty-state-metrics panel")
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-metrics-enable-hint`) {
		t.Fatal("CSS missing overview-empty-metrics-enable-hint")
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics-text`) {
		t.Fatal("CSS missing overview-empty-state-metrics-text for JSON export panel")
	}
	if !strings.Contains(staticReportCSS, `.overview-empty-state-metrics .action-btn:focus-visible`) {
		t.Fatal("CSS missing metrics panel action-btn:focus-visible")
	}
	if !strings.Contains(staticReportCSS, `.fail-reason-empty-row`) {
		t.Fatal("CSS missing fail-reason-empty-row for filtered empty table placeholder")
	}
	if !strings.Contains(staticReportCSS, `.action-btn:focus-visible`) {
		t.Fatal("CSS missing action-btn:focus-visible for keyboard affordance")
	}
}
