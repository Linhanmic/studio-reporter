package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

func TestLivePublisherWritesSnapshotWithoutJumpingIDs(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(reportsDirEnv, dir)
	t.Setenv(overwriteReportsEnv, "true")

	p := newLivePublisher()
	p.onExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	p.onSpecStarting(&gauge_messages.ExecutionInfo{
		ProjectName: "demo-project",
		CurrentSpec: &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec", Tags: []string{"auth"}},
	})
	p.onScenarioStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"},
		CurrentScenario: &gauge_messages.ScenarioInfo{Name: "Successful login"},
	})
	p.onStepStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"},
		CurrentScenario: &gauge_messages.ScenarioInfo{Name: "Successful login"},
		CurrentStep:     &gauge_messages.StepInfo{Step: &gauge_messages.ExecuteStepRequest{ActualStepText: "Open browser"}},
	})

	out := filepath.Join(dir, reportFolderName)
	raw, err := os.ReadFile(filepath.Join(out, liveReportJSONFile))
	if err != nil {
		t.Fatal(err)
	}
	var snap LiveSnapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		t.Fatal(err)
	}
	if !snap.Running || snap.Report == nil || snap.Report.ProjectName != "demo-project" {
		t.Fatalf("snapshot = %+v", snap)
	}
	if len(snap.Report.Specs) != 1 || snap.Report.Specs[0].ID != "spec:specs/auth/login.spec" {
		t.Fatalf("specs = %+v", snap.Report.Specs)
	}
	if len(snap.Report.Specs[0].Scenarios) != 1 || snap.Report.Specs[0].Scenarios[0].Heading != "Successful login" {
		t.Fatalf("scenarios = %+v", snap.Report.Specs[0].Scenarios)
	}
	items := snap.Report.Specs[0].Scenarios[0].Items
	if len(items) != 1 || items[0].Step == nil || items[0].Step.ActualText != "Open browser" {
		t.Fatalf("items = %+v", items)
	}

	p.onSpecEnding(&gauge_messages.SpecExecutionEndingRequest{
		SpecResult: &gauge_messages.ProtoSpecResult{
			Failed:        false,
			ExecutionTime: 400,
			ProtoSpec: &gauge_messages.ProtoSpec{
				SpecHeading: "Login",
				FileName:    "specs/auth/login.spec",
				Items: []*gauge_messages.ProtoItem{{
					ItemType: gauge_messages.ProtoItem_Scenario,
					Scenario: sampleSuite().SpecResults[0].ProtoSpec.Items[0].Scenario,
				}},
			},
		},
	})
	raw, err = os.ReadFile(filepath.Join(out, liveReportJSONFile))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &snap); err != nil {
		t.Fatal(err)
	}
	if snap.Report.Specs[0].ID != "spec:specs/auth/login.spec" {
		t.Fatalf("spec id changed: %s", snap.Report.Specs[0].ID)
	}
	if snap.Report.Specs[0].Duration != "00:00:00.400" {
		t.Fatalf("spec duration = %s", snap.Report.Specs[0].Duration)
	}

	html, err := os.ReadFile(filepath.Join(out, reportIndexFile))
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	for _, want := range []string{"pinia", "dense-table", "row-pass", "row-fail", "accordion"} {
		if !strings.Contains(body, want) {
			t.Fatalf("live html missing %q", want)
		}
	}

	p.onSuiteResult(sampleSuite())
	raw, err = os.ReadFile(filepath.Join(out, liveReportJSONFile))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &snap); err != nil {
		t.Fatal(err)
	}
	if snap.Running {
		t.Fatal("expected running=false after suite result")
	}
	if snap.Report.Verdict != verdictFail {
		t.Fatalf("final verdict = %s", snap.Report.Verdict)
	}
	if snap.Rev > 9007199254740991 {
		t.Fatalf("rev %d is not JS-safe", snap.Rev)
	}
}

func TestLiveConceptNestsSteps(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(reportsDirEnv, dir)
	t.Setenv(overwriteReportsEnv, "true")

	p := newLivePublisher()
	spec := &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"}
	scn := &gauge_messages.ScenarioInfo{Name: "Successful login"}
	p.onExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	p.onSpecStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec})
	p.onScenarioStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec, CurrentScenario: scn})
	p.onConceptStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     spec,
		CurrentScenario: scn,
		CurrentStep:     &gauge_messages.StepInfo{Step: &gauge_messages.ExecuteStepRequest{ActualStepText: "Log in"}},
	})
	p.onStepStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     spec,
		CurrentScenario: scn,
		CurrentStep:     &gauge_messages.StepInfo{Step: &gauge_messages.ExecuteStepRequest{ActualStepText: "Click submit"}},
	})

	got := p.report.Specs[0].Scenarios[0]
	if len(got.Items) != 1 || got.Items[0].Kind != "concept" {
		t.Fatalf("concept should be the only scenario item, got %+v", got.Items)
	}
	nested := got.Items[0].Concept.Items
	if len(nested) != 1 || nested[0].Step == nil || nested[0].Step.ActualText != "Click submit" {
		t.Fatalf("step should nest under concept, got %+v", nested)
	}
}

func TestLiveTableDrivenScenariosKeepBothRows(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(reportsDirEnv, dir)
	t.Setenv(overwriteReportsEnv, "true")

	p := newLivePublisher()
	spec := &gauge_messages.SpecInfo{Name: "Checkout", FileName: "specs/checkout.spec"}
	heading := &gauge_messages.ScenarioInfo{Name: "Pay with card"}
	info := &gauge_messages.ExecutionInfo{CurrentSpec: spec, CurrentScenario: heading}
	p.onExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	p.onSpecStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec})
	p.onScenarioStarting(info)
	firstID := p.currentScnID
	p.onScenarioEnding(&gauge_messages.ScenarioExecutionEndingRequest{
		CurrentExecutionInfo: info,
		ScenarioResult: &gauge_messages.ProtoScenarioResult{
			ProtoItem: tableDrivenSpecItem(0, "Pay with card", gauge_messages.ExecutionStatus_FAILED),
		},
	})
	p.onScenarioStarting(info)
	secondID := p.currentScnID
	p.onScenarioEnding(&gauge_messages.ScenarioExecutionEndingRequest{
		CurrentExecutionInfo: info,
		ScenarioResult: &gauge_messages.ProtoScenarioResult{
			ProtoItem: tableDrivenSpecItem(1, "Pay with card", gauge_messages.ExecutionStatus_PASSED),
		},
	})

	scns := p.report.Specs[0].Scenarios
	if firstID == "" || secondID == "" || firstID == secondID {
		t.Fatalf("ids = %s / %s", firstID, secondID)
	}
	if len(scns) != 2 {
		t.Fatalf("scenarios = %+v", scns)
	}
	if scns[0].ID != firstID || scns[1].ID != secondID {
		t.Fatalf("ids overwritten: %+v", scns)
	}
	if scns[0].TableRowIndex != 0 || scns[0].Verdict != verdictFail {
		t.Fatalf("row 0 = %+v", scns[0])
	}
	if scns[1].TableRowIndex != 1 || scns[1].Verdict != verdictPass {
		t.Fatalf("row 1 = %+v", scns[1])
	}
}

func tableDrivenSpecItem(row int32, heading string, status gauge_messages.ExecutionStatus) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_TableDrivenScenario,
		TableDrivenScenario: &gauge_messages.ProtoTableDrivenScenario{
			IsSpecTableDriven: true,
			TableRowIndex:     row,
			Scenario: &gauge_messages.ProtoScenario{
				ScenarioHeading: heading,
				ExecutionStatus: status,
				ExecutionTime:   10,
				ScenarioItems: []*gauge_messages.ProtoItem{{
					ItemType: gauge_messages.ProtoItem_Step,
					Step: &gauge_messages.ProtoStep{
						ActualText: "Pay",
						StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
							ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: status == gauge_messages.ExecutionStatus_FAILED, ExecutionTime: 10},
						},
					},
				}},
			},
		},
	}
}

func TestLiveStepMessagesAppearUnderStep(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(reportsDirEnv, dir)
	t.Setenv(overwriteReportsEnv, "true")

	p := newLivePublisher()
	spec := &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"}
	scn := &gauge_messages.ScenarioInfo{Name: "Successful login"}
	info := &gauge_messages.ExecutionInfo{
		CurrentSpec:     spec,
		CurrentScenario: scn,
		CurrentStep:     &gauge_messages.StepInfo{Step: &gauge_messages.ExecuteStepRequest{ActualStepText: "Enter username as \"admin\""}},
	}
	p.onExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	p.onSpecStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec})
	p.onScenarioStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec, CurrentScenario: scn})
	p.onStepStarting(info)
	p.onStepOrConceptEnding(&gauge_messages.ProtoStepResult{
		ProtoItem: &gauge_messages.ProtoItem{
			ItemType: gauge_messages.ProtoItem_Step,
			Step: &gauge_messages.ProtoStep{
				ActualText: "Enter username as \"admin\"",
				ParsedText: "Enter username as {}",
				StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
					ExecutionResult: &gauge_messages.ProtoExecutionResult{
						Failed:        false,
						ExecutionTime: 80,
						Message:       []string{"typed admin", "login form ready"},
					},
				},
			},
		},
	}, info)

	items := p.report.Specs[0].Scenarios[0].Items
	if len(items) != 1 || items[0].Step == nil {
		t.Fatalf("items = %+v", items)
	}
	got := items[0].Step.Messages
	if len(got) != 2 || got[0] != "typed admin" || got[1] != "login form ready" {
		t.Fatalf("messages = %#v", got)
	}
}
