package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"github.com/gaugestudio/studio-reporter/internal/report"
)

func sampleSuite() *gauge_messages.ProtoSuiteResult {
	return &gauge_messages.ProtoSuiteResult{
		ProjectName:       "demo-project",
		Environment:       "default",
		Tags:              "smoke",
		ExecutionTime:     1234,
		SuccessRate:       50,
		Failed:            true,
		SpecsFailedCount:  1,
		SpecsSkippedCount: 0,
		TimestampISO:      "2026-08-27T01:00:00Z",
		PreHookMessages:   []string{"suite started"},
		SpecResults: []*gauge_messages.ProtoSpecResult{
			{
				Failed:               false,
				ExecutionTime:        400,
				ScenarioCount:        1,
				ScenarioFailedCount:  0,
				ScenarioSkippedCount: 0,
				ProtoSpec: &gauge_messages.ProtoSpec{
					SpecHeading: "Login",
					FileName:    "specs/auth/login.spec",
					Tags:        []string{"auth"},
					Items: []*gauge_messages.ProtoItem{
						{
							ItemType: gauge_messages.ProtoItem_Scenario,
							Scenario: &gauge_messages.ProtoScenario{
								ScenarioHeading: "Successful login",
								Tags:            []string{"happy-path"},
								ExecutionTime:   250,
								ExecutionStatus: gauge_messages.ExecutionStatus_PASSED,
								Contexts: []*gauge_messages.ProtoItem{
									{
										ItemType: gauge_messages.ProtoItem_Step,
										Step: &gauge_messages.ProtoStep{
											ActualText: "Open browser",
											ParsedText: "Open browser",
											StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
												ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: 20},
											},
										},
									},
								},
								TearDownSteps: []*gauge_messages.ProtoItem{
									{
										ItemType: gauge_messages.ProtoItem_Step,
										Step: &gauge_messages.ProtoStep{
											ActualText: "Close browser",
											ParsedText: "Close browser",
											StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
												ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: 15},
											},
										},
									},
								},
								ScenarioItems: []*gauge_messages.ProtoItem{
									{
										ItemType: gauge_messages.ProtoItem_Step,
										Step: &gauge_messages.ProtoStep{
											ActualText: "Enter username as \"admin\"",
											ParsedText: "Enter username as {}",
											Fragments: []*gauge_messages.Fragment{
												{FragmentType: gauge_messages.Fragment_Text, Text: "Enter username as "},
												{FragmentType: gauge_messages.Fragment_Parameter, Parameter: &gauge_messages.Parameter{
													ParameterType: gauge_messages.Parameter_Static,
													Value:         "admin",
												}},
											},
											PreHookMessages:  []string{"hook: before type"},
											PostHookMessages: []string{"hook: after type"},
											StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
												ExecutionResult: &gauge_messages.ProtoExecutionResult{
													Failed:        false,
													ExecutionTime: 80,
													Message:       []string{"typed admin", "login form ready"},
												},
											},
										},
									},
									{
										ItemType: gauge_messages.ProtoItem_Concept,
										Concept: &gauge_messages.ProtoConcept{
											ConceptStep: &gauge_messages.ProtoStep{
												ActualText: "Log in",
												ParsedText: "Log in",
											},
											ConceptExecutionResult: &gauge_messages.ProtoStepExecutionResult{
												ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: 90},
											},
											Steps: []*gauge_messages.ProtoItem{
												{
													ItemType: gauge_messages.ProtoItem_Step,
													Step: &gauge_messages.ProtoStep{
														ActualText: "Click submit",
														ParsedText: "Click submit",
														StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
															ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: 40},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			{
				Failed:               true,
				ExecutionTime:        800,
				ScenarioCount:        2,
				ScenarioFailedCount:  1,
				ScenarioSkippedCount: 0,
				ProtoSpec: &gauge_messages.ProtoSpec{
					SpecHeading: "Checkout",
					FileName:    "specs/checkout.spec",
					Items: []*gauge_messages.ProtoItem{
						{
							ItemType: gauge_messages.ProtoItem_Table,
							Table: &gauge_messages.ProtoTable{
								Headers: &gauge_messages.ProtoTableRow{Cells: []string{"item"}},
								Rows: []*gauge_messages.ProtoTableRow{
									{Cells: []string{"book"}},
									{Cells: []string{"pen"}},
								},
							},
						},
						{
							ItemType: gauge_messages.ProtoItem_TableDrivenScenario,
							TableDrivenScenario: &gauge_messages.ProtoTableDrivenScenario{
								IsSpecTableDriven: true,
								TableRowIndex:     0,
								Scenario: &gauge_messages.ProtoScenario{
									ScenarioHeading: "Pay with card",
									ExecutionTime:   700,
									ExecutionStatus: gauge_messages.ExecutionStatus_FAILED,
									PreHookFailure: &gauge_messages.ProtoHookFailure{
										ErrorMessage: "before scenario boom",
										StackTrace:   "stack",
									},
									ScenarioItems: []*gauge_messages.ProtoItem{
										{
											ItemType: gauge_messages.ProtoItem_Step,
											Step: &gauge_messages.ProtoStep{
												ActualText: "Pay 10",
												ParsedText: "Pay {}",
												StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
													ExecutionResult: &gauge_messages.ProtoExecutionResult{
														Failed:                true,
														ErrorMessage:          "insufficient funds",
														StackTrace:            "at pay()",
														ExecutionTime:         120,
														FailureScreenshotFile: "",
													},
												},
											},
										},
										{
											ItemType: gauge_messages.ProtoItem_Comment,
											Comment:  &gauge_messages.ProtoComment{Text: "note"},
										},
									},
								},
							},
						},
						{
							ItemType: gauge_messages.ProtoItem_TableDrivenScenario,
							TableDrivenScenario: &gauge_messages.ProtoTableDrivenScenario{
								IsSpecTableDriven: true,
								TableRowIndex:     1,
								Scenario: &gauge_messages.ProtoScenario{
									ScenarioHeading: "Pay with card",
									ExecutionTime:   80,
									ExecutionStatus: gauge_messages.ExecutionStatus_PASSED,
									ScenarioItems: []*gauge_messages.ProtoItem{
										{
											ItemType: gauge_messages.ProtoItem_Step,
											Step: &gauge_messages.ProtoStep{
												ActualText: "Pay 5",
												ParsedText: "Pay {}",
												StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
													ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: 80},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			{
				Failed:               false,
				Skipped:              true,
				ExecutionTime:        0,
				ScenarioCount:        1,
				ScenarioFailedCount:  0,
				ScenarioSkippedCount: 1,
				Errors: []*gauge_messages.Error{{
					Type:       gauge_messages.Error_VALIDATION_ERROR,
					Filename:   "specs/skip.spec",
					LineNumber: 3,
					Message:    "missing step",
				}},
				ProtoSpec: &gauge_messages.ProtoSpec{
					SpecHeading: "Skipped spec",
					FileName:    "specs/skip.spec",
					Items: []*gauge_messages.ProtoItem{
						{
							ItemType: gauge_messages.ProtoItem_Scenario,
							Scenario: &gauge_messages.ProtoScenario{
								ScenarioHeading: "Not run",
								ExecutionStatus: gauge_messages.ExecutionStatus_SKIPPED,
								SkipErrors:      []string{"missing step"},
								ScenarioItems: []*gauge_messages.ProtoItem{
									{
										ItemType: gauge_messages.ProtoItem_Step,
										Step: &gauge_messages.ProtoStep{
											ActualText: "Do nothing",
											StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
												Skipped:       true,
												SkippedReason: "missing step",
											},
										},
									},
								},
							},
						},
					},
				},
			},
			{
				Failed:        false,
				ExecutionTime: 12,
				ScenarioCount: 1,
				ProtoSpec: &gauge_messages.ProtoSpec{
					SpecHeading: "Very long payment gateway specification covering nested directory wrapping",
					FileName:    "specs/modules/payments/gateway/very-long-payment-gateway-specification.spec",
					Items: []*gauge_messages.ProtoItem{
						{
							ItemType: gauge_messages.ProtoItem_Scenario,
							Scenario: &gauge_messages.ProtoScenario{
								ScenarioHeading: "Charge card",
								ExecutionTime:   12,
								ExecutionStatus: gauge_messages.ExecutionStatus_PASSED,
								ScenarioItems: []*gauge_messages.ProtoItem{
									{
										ItemType: gauge_messages.ProtoItem_Step,
										Step: &gauge_messages.ProtoStep{
											ActualText: "Charge 1",
											ParsedText: "Charge {}",
											StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
												ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: 12},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			{
				Failed:        false,
				ExecutionTime: 90,
				ScenarioCount: 2,
				ProtoSpec: &gauge_messages.ProtoSpec{
					SpecHeading: "Search",
					FileName:    "specs/search.spec",
					Items: []*gauge_messages.ProtoItem{
						searchTableScenario(0, "laptop"),
						searchTableScenario(1, "phone"),
					},
				},
			},
		},
	}
}

func searchTableScenario(row int32, query string) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_TableDrivenScenario,
		TableDrivenScenario: &gauge_messages.ProtoTableDrivenScenario{
			IsScenarioTableDriven: true,
			ScenarioTableRowIndex: row,
			ScenarioDataTable: &gauge_messages.ProtoTable{
				Headers: &gauge_messages.ProtoTableRow{Cells: []string{"query"}},
				Rows: []*gauge_messages.ProtoTableRow{
					{Cells: []string{"laptop"}},
					{Cells: []string{"phone"}},
				},
			},
			Scenario: &gauge_messages.ProtoScenario{
				ScenarioHeading: "Search item",
				ExecutionTime:   45,
				ExecutionStatus: gauge_messages.ExecutionStatus_PASSED,
				ScenarioItems: []*gauge_messages.ProtoItem{
					{
						ItemType: gauge_messages.ProtoItem_Step,
						Step: &gauge_messages.ProtoStep{
							ActualText: "Search " + query,
							ParsedText: "Search {}",
							StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
								ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: 45},
							},
						},
					},
				},
			},
		},
	}
}

func TestToReportHierarchyAndCounts(t *testing.T) {
	r := report.FromSuite(sampleSuite())
	if r.ProjectName != "demo-project" || r.Environment != "default" {
		t.Fatalf("unexpected header: %+v", r)
	}
	if r.Verdict != report.VerdictFail {
		t.Fatalf("suite verdict = %s, want fail", r.Verdict)
	}
	if r.Duration != "00:00:01.234" {
		t.Fatalf("duration = %s", r.Duration)
	}
	if len(r.Specs) != 5 {
		t.Fatalf("specs = %d", len(r.Specs))
	}
	if r.Summary.Specs != (report.Counts{Total: 5, Passed: 3, Failed: 1, Skipped: 1}) {
		t.Fatalf("spec counts = %+v", r.Summary.Specs)
	}
	if r.Summary.Scenarios != (report.Counts{Total: 7, Passed: 5, Failed: 1, Skipped: 1}) {
		t.Fatalf("scenario counts = %+v", r.Summary.Scenarios)
	}
	if r.Summary.Steps.Total < 4 || r.Summary.Steps.Failed != 1 || r.Summary.Steps.Skipped != 1 {
		t.Fatalf("step counts = %+v", r.Summary.Steps)
	}

	login := r.Specs[0]
	if login.Heading != "Login" || login.Verdict != report.VerdictPass || login.FileName != "specs/auth/login.spec" {
		t.Fatalf("login spec = %+v", login)
	}
	if login.Duration != "00:00:00.400" || login.ExecutionTime != 400 {
		t.Fatalf("login duration = %s / %d", login.Duration, login.ExecutionTime)
	}
	if got := strings.Join(login.Folders, "/"); got != "specs/auth" {
		t.Fatalf("folders = %v", login.Folders)
	}
	if len(login.Scenarios) != 1 || login.Scenarios[0].Heading != "Successful login" {
		t.Fatalf("login scenarios = %+v", login.Scenarios)
	}
	scn := login.Scenarios[0]
	if scn.Duration != "00:00:00.250" || scn.ExecutionTime != 250 {
		t.Fatalf("scenario duration = %s / %d", scn.Duration, scn.ExecutionTime)
	}
	if len(scn.Contexts) != 1 || scn.Contexts[0].Step.ActualText != "Open browser" {
		t.Fatalf("contexts = %+v", scn.Contexts)
	}
	if len(scn.Teardowns) != 1 || scn.Teardowns[0].Step.ActualText != "Close browser" {
		t.Fatalf("teardowns = %+v", scn.Teardowns)
	}
	items := scn.Items
	if len(items) != 2 || items[0].Kind != "step" || items[1].Kind != "concept" {
		t.Fatalf("login items = %+v", items)
	}
	if items[0].ID == "" || items[1].ID == "" || items[1].Concept.Items[0].ID == "" {
		t.Fatalf("item ids missing: %+v", items)
	}
	if items[0].Step.Fragments[1].Kind != "static" || items[0].Step.Fragments[1].Text != "admin" {
		t.Fatalf("fragments = %+v", items[0].Step.Fragments)
	}
	if items[1].Concept == nil || len(items[1].Concept.Items) != 1 || items[1].Concept.Items[0].Step.ActualText != "Click submit" {
		t.Fatalf("concept items = %+v", items[1].Concept)
	}
	if scn.Contexts[0].Duration != "00:00:00.020" || items[0].Duration != "00:00:00.080" {
		t.Fatalf("step durations = ctx %s item %s", scn.Contexts[0].Duration, items[0].Duration)
	}
	if items[1].Duration != "00:00:00.090" || items[1].Concept.Duration != "00:00:00.090" {
		t.Fatalf("concept duration = %s / %s", items[1].Duration, items[1].Concept.Duration)
	}
	if items[1].Concept.Items[0].Duration != "00:00:00.040" || scn.Teardowns[0].Duration != "00:00:00.015" {
		t.Fatalf("nested durations = child %s teardown %s", items[1].Concept.Items[0].Duration, scn.Teardowns[0].Duration)
	}

	checkout := r.Specs[1]
	if checkout.Verdict != report.VerdictFail || checkout.Datatable == nil || len(checkout.Datatable.Rows) != 2 || checkout.Datatable.Rows[0][0] != "book" {
		t.Fatalf("checkout spec = %+v", checkout)
	}
	pay := checkout.Scenarios[0]
	if pay.Verdict != report.VerdictFail || pay.TableRowIndex != 0 || pay.PreHookFailure == nil {
		t.Fatalf("pay scenario = %+v", pay)
	}
	if pay.Items[0].Step.ErrorMessage != "insufficient funds" {
		t.Fatalf("failed step = %+v", pay.Items[0].Step)
	}
	if pay.Items[1].Kind != "comment" || pay.Items[1].Comment != "note" {
		t.Fatalf("comment item = %+v", pay.Items[1])
	}
	if len(checkout.Scenarios) != 2 || checkout.Scenarios[1].TableRowIndex != 1 || checkout.Scenarios[1].Verdict != report.VerdictPass {
		t.Fatalf("checkout rows = %+v", checkout.Scenarios)
	}
	if r.Specs[2].Verdict != report.VerdictSkip || r.Specs[2].Errors[0].Message != "missing step" {
		t.Fatalf("skipped spec = %+v", r.Specs[2])
	}
	nested := r.Specs[3]
	if nested.Heading != "Very long payment gateway specification covering nested directory wrapping" {
		t.Fatalf("nested spec heading = %s", nested.Heading)
	}
	if got := strings.Join(nested.Folders, "/"); got != "specs/modules/payments/gateway" {
		t.Fatalf("nested folders = %v", nested.Folders)
	}
	search := r.Specs[4]
	if search.Heading != "Search" || len(search.Scenarios) != 2 {
		t.Fatalf("search spec = %+v", search)
	}
	if !search.Scenarios[0].IsScenarioTableDriven || search.Scenarios[0].ScenarioTableRowIndex != 0 || search.Scenarios[1].ScenarioTableRowIndex != 1 {
		t.Fatalf("search table rows = %+v", search.Scenarios)
	}
	if search.Scenarios[0].ScenarioDataTable == nil || search.Scenarios[0].ScenarioDataTable.Rows[0][0] != "laptop" {
		t.Fatalf("search data = %+v", search.Scenarios[0].ScenarioDataTable)
	}
}

func viewerSource(t *testing.T, dir string) string {
	t.Helper()
	html, err := os.ReadFile(filepath.Join(dir, report.IndexFile))
	if err != nil {
		t.Fatal(err)
	}
	return string(html)
}

func TestWriteAndRegenerateReport(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(report.ReportsDirEnv, dir)
	t.Setenv(report.OverwriteReportsEnv, "true")

	generated, err := newReportEngine(nil).FinalizeSuite(&gauge_messages.SuiteExecutionResult{SuiteResult: sampleSuite()})
	if err != nil {
		t.Fatal(err)
	}
	html := viewerSource(t, generated.Dir)
	for _, want := range []string{
		"Test Report Viewer",
		"运行时间",
		"tone-pass",
		"tone-fail",
		"summary-right",
		"data-kv",
		"out-card",
		"report-block",
		"<details",
		"demo-project",
		"Successful login",
		"insufficient funds",
		"Checkout",
		"specs / auth",
		"前置",
		"清理",
		"步骤",
		"Very long payment gateway specification covering nested directory wrapping",
		`class="badge fail"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("generated HTML missing %q", want)
		}
	}
	for _, not := range []string{
		"function buildItemNodes",
		"id: 'suite'",
		"el-tree",
		"el-table",
		"pinia",
		"vue.global",
		"report-data",
		"step-table",
		"nested-block",
		"script-pane",
		">脚本<",
		"row.fileName",
		`label="详情"`,
		"rows.filter(matchItem)",
		"'场景 · ' + spec.heading",
		"步骤 · {{ scn.heading }}",
		"数据驱动 · ' + spec.heading",
		"specBodyTitle",
		"数据行（",
		"class=\"nested-title\">步骤",
		"class=\"nested-title\">场景",
		"pageFromHash",
		"store.page",
		"push('前置输出'",
		"push('控制台'",
		"总览",
		"createWebHashHistory",
		"router-view",
		"tpl-overview",
		"tpl-history",
	} {
		if strings.Contains(html, not) {
			t.Fatalf("generated HTML should not contain %q", not)
		}
	}
	if _, err := os.Stat(generated.JSONPath); err != nil {
		t.Fatalf("json not written: %v", err)
	}
	reportFile := filepath.Base(generated.JSONPath)
	if !strings.HasPrefix(reportFile, "demo-project-") || !strings.HasSuffix(reportFile, report.UhilReportExt) {
		t.Fatalf("report file should be <project>-<timestamp>%s, got %s", report.UhilReportExt, reportFile)
	}
	if _, err := os.Stat(filepath.Join(generated.Dir, report.ViewerFile)); err != nil {
		t.Fatalf("viewer.html missing: %v", err)
	}
	for _, asset := range []string{"vue.global.prod.js", "element-plus.full.min.js", "element-plus.css", "pinia.iife.prod.js", "report-app.js"} {
		if _, err := os.Stat(filepath.Join(generated.Dir, "assets", asset)); err != nil {
			t.Fatalf("asset %s missing: %v", asset, err)
		}
	}
	if _, err := os.Stat(filepath.Join(generated.Dir, report.LiveReportJSONFile)); err != nil {
		t.Fatalf("live report.json missing: %v", err)
	}
	liveJSON, err := os.ReadFile(filepath.Join(generated.Dir, report.LiveReportJSONFile))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(liveJSON), `"formatVersion":1`) {
		t.Fatalf("report.json missing formatVersion: %s", string(liveJSON)[:120])
	}
	managePage, err := os.ReadFile(filepath.Join(generated.Dir, report.ManageIndexFile))
	if err != nil {
		t.Fatalf("manage.html missing: %v", err)
	}
	for _, want := range []string{"报告管理", "api/history/", "/index.html", "__GAUGE_HISTORY__"} {
		if !strings.Contains(string(managePage), want) {
			t.Fatalf("manage.html missing %q", want)
		}
	}
	root := filepath.Join(dir, report.FolderName)
	if _, err := os.Stat(filepath.Join(root, historyFileName)); err != nil {
		t.Fatalf("history.json missing: %v", err)
	}
	histRaw, err := os.ReadFile(filepath.Join(root, historyFileName))
	if err != nil {
		t.Fatal(err)
	}
	var hist HistoryFile
	if err := json.Unmarshal(histRaw, &hist); err != nil {
		t.Fatal(err)
	}
	if len(hist.Runs) == 0 {
		t.Fatal("history has no runs")
	}
	if !strings.HasPrefix(hist.Runs[0].ID, "demo-project-") {
		t.Fatalf("archive id should be <project>-<timestamp>, got %s", hist.Runs[0].ID)
	}
	archived, err := filepath.Glob(filepath.Join(root, filepath.FromSlash(hist.Runs[0].RelDir), "*"+report.UhilReportExt))
	if err != nil || len(archived) != 1 || !strings.HasPrefix(filepath.Base(archived[0]), "demo-project-") {
		t.Fatalf("archive missing <project>-<timestamp>%s: %v %v", report.UhilReportExt, archived, err)
	}

	out := filepath.Join(dir, "regenerated")
	again, err := report.GenerateFromJSON(generated.JSONPath, out, &report.FinalWriter{History: historyRecorder{}})
	if err != nil {
		t.Fatal(err)
	}
	regen, err := os.ReadFile(again.IndexPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(regen), "Pay with card") {
		t.Fatal("regenerated report missing scenario")
	}
	if dest := strings.TrimSpace(os.Getenv("STUDIO_REPORT_DEMO")); dest != "" {
		if err := os.MkdirAll(dest, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.CopyFS(dest, os.DirFS(generated.Dir)); err != nil {
			t.Fatal(err)
		}
	}
}

func TestReportDirAlwaysHub(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(report.ReportsDirEnv, dir)
	t.Setenv(report.OverwriteReportsEnv, "false")
	a, err := report.ResolveDir()
	if err != nil {
		t.Fatal(err)
	}
	b, err := report.ResolveDir()
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(a) != report.FolderName {
		t.Fatalf("hub = %s", a)
	}
	if a != b {
		t.Fatalf("live hub should be stable: %s vs %s", a, b)
	}

	t.Setenv(report.OverwriteReportsEnv, "true")
	c, err := report.ResolveDir()
	if err != nil {
		t.Fatal(err)
	}
	d, err := report.ResolveDir()
	if err != nil {
		t.Fatal(err)
	}
	if c != d || c != a || filepath.Base(c) != report.FolderName {
		t.Fatalf("overwrite dirs = %s %s %s", a, c, d)
	}
}

func TestOverwriteReportsAliasAndProjectRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv(report.GaugeProjectRootEnv, root)
	t.Setenv(report.ReportsDirEnv, "out-reports")
	t.Setenv(report.OverwriteReportsEnv, "")
	t.Setenv(report.OverwriteReportsEnvAlias, "false")
	if report.ShouldOverwriteReports() {
		t.Fatal("over_write_reports=false should keep each run")
	}
	a, err := report.ResolveDir()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "out-reports", report.FolderName)
	if a != want && !strings.HasSuffix(a, filepath.Join("out-reports", report.FolderName)) {
		t.Fatalf("dir = %s, want under %s", a, want)
	}
	if filepath.Base(a) != report.FolderName {
		t.Fatalf("hub dir = %s", a)
	}
	t.Setenv(report.OverwriteReportsEnv, "true")
	t.Setenv(report.OverwriteReportsEnvAlias, "false")
	if !report.ShouldOverwriteReports() {
		t.Fatal("overwrite_reports should win over over_write_reports")
	}
}

func TestLiveAndFinalReportShareDirectoryWhenNotOverwriting(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(report.ReportsDirEnv, dir)
	t.Setenv(report.OverwriteReportsEnv, "false")

	p := report.NewLivePublisher(nil)
	p.OnExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	if p.Dir() != "" {
		t.Fatalf("live run should not create hub dir yet, got %s", p.Dir())
	}

	generated, err := newReportEngine(nil).FinalizeSuite(&gauge_messages.SuiteExecutionResult{SuiteResult: sampleSuite()})
	if err != nil {
		t.Fatal(err)
	}
	liveDir := generated.Dir
	if filepath.Base(liveDir) != report.FolderName {
		t.Fatalf("hub = %s", generated.Dir)
	}

	hub2, err := report.ResolveDir()
	if err != nil {
		t.Fatal(err)
	}
	if hub2 != generated.Dir {
		t.Fatalf("hub should be stable: %s vs %s", hub2, generated.Dir)
	}
}

func TestSkipReportEnv(t *testing.T) {
	t.Setenv(report.SkipReportEnv, "true")
	if !report.ShouldSkipReport() {
		t.Fatal("expected skip")
	}
	t.Setenv(report.SkipReportEnv, "")
	if report.ShouldSkipReport() {
		t.Fatal("did not expect skip")
	}
}

func TestRenderReportHTMLEscapesScript(t *testing.T) {
	html, err := report.RenderReportHTML(&report.Report{ProjectName: "</script>xss"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(html), "</script>xss") {
		t.Fatal("raw script break should be escaped")
	}
	if !strings.Contains(string(html), "&lt;/script&gt;xss") {
		t.Fatal("project name should be HTML-escaped")
	}
	if strings.Contains(string(html), `id="report-data"`) {
		t.Fatal("static report must not embed JSON")
	}
}

func TestReportGeneratedPayloadRoundTrip(t *testing.T) {
	payload, err := json.Marshal(map[string]string{"reportPath": "/tmp/index.html"})
	if err != nil {
		t.Fatal(err)
	}
	ev := newStudioEventPayload(EventReportGenerated, payload)
	if ev.Type != EventReportGenerated {
		t.Fatalf("type = %s", ev.Type)
	}
	if !strings.Contains(string(ev.Payload), "index.html") {
		t.Fatalf("payload = %s", ev.Payload)
	}
}

func TestGenerateReportFromJSONRejectsBadInput(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(path, []byte(`{"nope":true}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := report.GenerateFromJSON(path, t.TempDir(), &report.FinalWriter{}); err == nil {
		t.Fatal("expected error")
	}
}
