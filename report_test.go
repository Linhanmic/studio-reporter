package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
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
											StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
												ExecutionResult: &gauge_messages.ProtoExecutionResult{
													Failed:        false,
													ExecutionTime: 80,
													Message:       []string{"typed admin"},
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
				ScenarioCount:        1,
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
								Rows:    []*gauge_messages.ProtoTableRow{{Cells: []string{"book"}}},
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
		},
	}
}

func TestToReportHierarchyAndCounts(t *testing.T) {
	r := toReport(sampleSuite())
	if r.ProjectName != "demo-project" || r.Environment != "default" {
		t.Fatalf("unexpected header: %+v", r)
	}
	if r.Verdict != verdictFail {
		t.Fatalf("suite verdict = %s, want fail", r.Verdict)
	}
	if r.Duration != "00:00:01.234" {
		t.Fatalf("duration = %s", r.Duration)
	}
	if len(r.Specs) != 3 {
		t.Fatalf("specs = %d", len(r.Specs))
	}
	if r.Summary.Specs != (Counts{Total: 3, Passed: 1, Failed: 1, Skipped: 1}) {
		t.Fatalf("spec counts = %+v", r.Summary.Specs)
	}
	if r.Summary.Scenarios != (Counts{Total: 3, Passed: 1, Failed: 1, Skipped: 1}) {
		t.Fatalf("scenario counts = %+v", r.Summary.Scenarios)
	}
	if r.Summary.Steps.Total < 4 || r.Summary.Steps.Failed != 1 || r.Summary.Steps.Skipped != 1 {
		t.Fatalf("step counts = %+v", r.Summary.Steps)
	}

	login := r.Specs[0]
	if login.Heading != "Login" || login.Verdict != verdictPass || login.FileName != "specs/auth/login.spec" {
		t.Fatalf("login spec = %+v", login)
	}
	if got := strings.Join(login.Folders, "/"); got != "specs/auth" {
		t.Fatalf("folders = %v", login.Folders)
	}
	if len(login.Scenarios) != 1 || login.Scenarios[0].Heading != "Successful login" {
		t.Fatalf("login scenarios = %+v", login.Scenarios)
	}
	scn := login.Scenarios[0]
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

	checkout := r.Specs[1]
	if checkout.Verdict != verdictFail || checkout.Datatable == nil || checkout.Datatable.Rows[0][0] != "book" {
		t.Fatalf("checkout spec = %+v", checkout)
	}
	pay := checkout.Scenarios[0]
	if pay.Verdict != verdictFail || pay.TableRowIndex != 0 || pay.PreHookFailure == nil {
		t.Fatalf("pay scenario = %+v", pay)
	}
	if pay.Items[0].Step.ErrorMessage != "insufficient funds" {
		t.Fatalf("failed step = %+v", pay.Items[0].Step)
	}
	if pay.Items[1].Kind != "comment" || pay.Items[1].Comment != "note" {
		t.Fatalf("comment item = %+v", pay.Items[1])
	}
	if r.Specs[2].Verdict != verdictSkip || r.Specs[2].Errors[0].Message != "missing step" {
		t.Fatalf("skipped spec = %+v", r.Specs[2])
	}
}

func TestSpecFolders(t *testing.T) {
	if got := specFolders("specs/auth/login.spec"); strings.Join(got, "/") != "specs/auth" {
		t.Fatalf("nested = %v", got)
	}
	if got := specFolders("login.spec"); len(got) != 0 {
		t.Fatalf("root file = %v", got)
	}
	if got := specFolders(`specs\win.spec`); strings.Join(got, "/") != "specs" {
		t.Fatalf("backslash = %v", got)
	}
}

func TestFormatDurationAndVerdicts(t *testing.T) {
	if got := formatDuration(0); got != "00:00:00.000" {
		t.Fatalf("zero duration = %s", got)
	}
	if got := formatDuration(3723004); got != "01:02:03.004" {
		t.Fatalf("long duration = %s", got)
	}
	if stepVerdict(nil) != verdictNone {
		t.Fatal("nil step should be none")
	}
	empty := toReport(&gauge_messages.ProtoSuiteResult{ProjectName: ""})
	if empty.ProjectName != "Gauge Suite" || empty.Verdict != verdictNone {
		t.Fatalf("empty suite = %+v", empty)
	}
}

func TestWriteAndRegenerateReport(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(reportsDirEnv, dir)
	t.Setenv(overwriteReportsEnv, "true")

	suite := &gauge_messages.SuiteExecutionResult{SuiteResult: sampleSuite()}
	generated, err := generateReportFromSuite(suite)
	if err != nil {
		t.Fatal(err)
	}
	index := generated.IndexPath
	body, err := os.ReadFile(index)
	if err != nil {
		t.Fatal(err)
	}
	html := string(body)
	for _, want := range []string{
		"Test Report Viewer",
		"Execution Tree",
		"demo-project",
		"Successful login",
		"insufficient funds",
		"Checkout",
		"specs/auth",
		"Context",
		"Teardown",
		"tree-cell",
		`"folders":["specs","auth"]`,
		`"verdict":"fail"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("generated HTML missing %q", want)
		}
	}
	if _, err := os.Stat(generated.JSONPath); err != nil {
		t.Fatalf("json not written: %v", err)
	}

	out := filepath.Join(dir, "regenerated")
	again, err := generateReportFromJSON(generated.JSONPath, out)
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
}

func TestOverwriteAndTimestampedDirs(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(reportsDirEnv, dir)
	t.Setenv(overwriteReportsEnv, "false")
	a, err := resolveReportDir()
	if err != nil {
		t.Fatal(err)
	}
	b, err := resolveReportDir()
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(filepath.Dir(a)) != reportFolderName {
		t.Fatalf("parent = %s", filepath.Dir(a))
	}
	if a == b {
		t.Fatal("timestamped dirs should differ when overwrite is false")
	}

	t.Setenv(overwriteReportsEnv, "true")
	c, err := resolveReportDir()
	if err != nil {
		t.Fatal(err)
	}
	d, err := resolveReportDir()
	if err != nil {
		t.Fatal(err)
	}
	if c != d || filepath.Base(c) != reportFolderName {
		t.Fatalf("overwrite dirs = %s %s", c, d)
	}
}

func TestCopyAndRewriteScreenshots(t *testing.T) {
	srcDir := t.TempDir()
	src := filepath.Join(srcDir, "fail.png")
	if err := os.WriteFile(src, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := &Report{
		Specs: []SpecReport{{
			Scenarios: []ScenarioReport{{
				Items: []ItemReport{{
					Kind: "step",
					Step: &StepReport{FailureScreenshot: src, Screenshots: []string{src}},
				}},
			}},
		}},
	}
	dest := filepath.Join(t.TempDir(), "images")
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}
	mapping := copyScreenshots(collectScreenshotFiles(r), dest)
	if mapping[src] != "images/fail.png" {
		t.Fatalf("mapping = %#v", mapping)
	}
	rewriteScreenshotPaths(r, mapping)
	step := r.Specs[0].Scenarios[0].Items[0].Step
	if step.FailureScreenshot != "images/fail.png" || step.Screenshots[0] != "images/fail.png" {
		t.Fatalf("rewritten = %+v", step)
	}
}

func TestSkipReportEnv(t *testing.T) {
	t.Setenv(skipReportEnv, "true")
	if !shouldSkipReport() {
		t.Fatal("expected skip")
	}
	t.Setenv(skipReportEnv, "")
	if shouldSkipReport() {
		t.Fatal("did not expect skip")
	}
}

func TestRenderReportHTMLEscapesScript(t *testing.T) {
	html, err := renderReportHTML(&Report{ProjectName: "</script>xss"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(html), "</script>xss") {
		t.Fatal("raw script break should be escaped")
	}
	start := strings.Index(string(html), `<script type="application/json" id="report-data">`)
	if start < 0 {
		t.Fatal("missing report data script")
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
	if _, err := generateReportFromJSON(path, t.TempDir()); err == nil {
		t.Fatal("expected error")
	}
}
