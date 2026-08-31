package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"github.com/gaugestudio/studio-reporter/internal/report"
)

func requireSnap(t *testing.T, p *report.LivePublisher) report.LiveSnapshot {
	t.Helper()
	snap := p.Snapshot()
	if snap == nil || snap.Report == nil {
		t.Fatal("expected in-memory snapshot")
	}
	return *snap
}

func TestLivePublisherWritesSnapshotWithoutJumpingIDs(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(report.ReportsDirEnv, dir)
	t.Setenv(report.OverwriteReportsEnv, "true")

	p := report.NewLivePublisher(nil)
	p.OnExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	p.OnSpecStarting(&gauge_messages.ExecutionInfo{
		ProjectName: "demo-project",
		CurrentSpec: &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec", Tags: []string{"auth"}},
	})
	p.OnScenarioStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"},
		CurrentScenario: &gauge_messages.ScenarioInfo{Name: "Successful login"},
	})
	p.OnStepStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"},
		CurrentScenario: &gauge_messages.ScenarioInfo{Name: "Successful login"},
		CurrentStep:     &gauge_messages.StepInfo{Step: &gauge_messages.ExecuteStepRequest{ActualStepText: "Open browser"}},
	})

	out := filepath.Join(dir, report.FolderName)
	if _, err := os.Stat(filepath.Join(out, report.LiveReportJSONFile)); err == nil {
		t.Fatal("report.json must not be written during live updates")
	}

	snap := requireSnap(t, p)
	if !snap.Running || snap.Report.ProjectName != "demo-project" {
		t.Fatalf("snapshot = %+v", snap)
	}
	if len(snap.Report.Specs) != 1 || snap.Report.Specs[0].ID != "spec:specs/auth/login.spec" {
		t.Fatalf("specs = %+v", snap.Report.Specs)
	}
	if len(snap.Report.Specs[0].Scenarios) != 1 || snap.Report.Specs[0].Scenarios[0].Heading != "Successful login" {
		t.Fatalf("scenarios = %+v", snap.Report.Specs[0].Scenarios)
	}
	if len(snap.Report.Specs[0].Scenarios[0].Items) != 0 {
		t.Fatalf("live snapshot should stop at scenario; got items %+v", snap.Report.Specs[0].Scenarios[0].Items)
	}

	p.OnSpecEnding(&gauge_messages.SpecExecutionEndingRequest{
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
	snap = requireSnap(t, p)
	if snap.Report.Specs[0].ID != "spec:specs/auth/login.spec" {
		t.Fatalf("spec id changed: %s", snap.Report.Specs[0].ID)
	}
	if snap.Report.Specs[0].Duration != "00:00:00.400" {
		t.Fatalf("spec duration = %s", snap.Report.Specs[0].Duration)
	}

	p.FinishWithReport(report.FromSuite(sampleSuite()))
	snap = requireSnap(t, p)
	if snap.Running {
		t.Fatal("expected running=false after suite result")
	}
	if snap.Report.Verdict != report.VerdictFail {
		t.Fatalf("final verdict = %s", snap.Report.Verdict)
	}
	if snap.Rev > 9007199254740991 {
		t.Fatalf("rev %d is not JS-safe", snap.Rev)
	}
}

func TestLiveSkipsStepAndConceptDetail(t *testing.T) {
	p := report.NewLivePublisher(nil)
	spec := &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"}
	scn := &gauge_messages.ScenarioInfo{Name: "Successful login"}
	p.OnExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	p.OnSpecStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec})
	p.OnScenarioStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec, CurrentScenario: scn})
	p.OnConceptStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     spec,
		CurrentScenario: scn,
		CurrentStep:     &gauge_messages.StepInfo{Step: &gauge_messages.ExecuteStepRequest{ActualStepText: "Log in"}},
	})
	p.OnStepStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     spec,
		CurrentScenario: scn,
		CurrentStep:     &gauge_messages.StepInfo{Step: &gauge_messages.ExecuteStepRequest{ActualStepText: "Click submit"}},
	})

	got := requireSnap(t, p).Report.Specs[0].Scenarios[0]
	if len(got.Items) != 0 || len(got.Contexts) != 0 || len(got.Teardowns) != 0 {
		t.Fatalf("live report must stay at scenario level, got %+v", got)
	}
}

func TestLiveTableDrivenScenariosKeepBothRows(t *testing.T) {
	p := report.NewLivePublisher(nil)
	spec := &gauge_messages.SpecInfo{Name: "Checkout", FileName: "specs/checkout.spec"}
	heading := &gauge_messages.ScenarioInfo{Name: "Pay with card"}
	info := &gauge_messages.ExecutionInfo{CurrentSpec: spec, CurrentScenario: heading}
	p.OnExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	p.OnSpecStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec})
	p.OnScenarioStarting(info)
	p.OnScenarioEnding(&gauge_messages.ScenarioExecutionEndingRequest{
		CurrentExecutionInfo: info,
		ScenarioResult: &gauge_messages.ProtoScenarioResult{
			ProtoItem: tableDrivenSpecItem(0, "Pay with card", gauge_messages.ExecutionStatus_FAILED),
		},
	})
	p.OnScenarioStarting(info)
	p.OnScenarioEnding(&gauge_messages.ScenarioExecutionEndingRequest{
		CurrentExecutionInfo: info,
		ScenarioResult: &gauge_messages.ProtoScenarioResult{
			ProtoItem: tableDrivenSpecItem(1, "Pay with card", gauge_messages.ExecutionStatus_PASSED),
		},
	})

	scns := requireSnap(t, p).Report.Specs[0].Scenarios
	if len(scns) != 2 {
		t.Fatalf("scenarios = %+v", scns)
	}
	if scns[0].ID == "" || scns[1].ID == "" || scns[0].ID == scns[1].ID {
		t.Fatalf("ids = %+v", scns)
	}
	if scns[0].TableRowIndex != 0 || scns[0].Verdict != report.VerdictFail {
		t.Fatalf("row 0 = %+v", scns[0])
	}
	if scns[1].TableRowIndex != 1 || scns[1].Verdict != report.VerdictPass {
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

func TestLiveScenarioEndingDropsStepTree(t *testing.T) {
	p := report.NewLivePublisher(nil)
	spec := &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"}
	scn := &gauge_messages.ScenarioInfo{Name: "Successful login"}
	info := &gauge_messages.ExecutionInfo{CurrentSpec: spec, CurrentScenario: scn}
	p.OnExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	p.OnSpecStarting(&gauge_messages.ExecutionInfo{CurrentSpec: spec})
	p.OnScenarioStarting(info)
	p.OnScenarioEnding(&gauge_messages.ScenarioExecutionEndingRequest{
		CurrentExecutionInfo: info,
		ScenarioResult: &gauge_messages.ProtoScenarioResult{
			ProtoItem: &gauge_messages.ProtoItem{
				ItemType: gauge_messages.ProtoItem_Scenario,
				Scenario: sampleSuite().SpecResults[0].ProtoSpec.Items[0].Scenario,
			},
		},
	})

	got := requireSnap(t, p).Report.Specs[0].Scenarios[0]
	if got.Heading != "Successful login" || got.Verdict != report.VerdictPass {
		t.Fatalf("scenario = %+v", got)
	}
	if len(got.Items) != 0 || len(got.Contexts) != 0 || len(got.Teardowns) != 0 {
		t.Fatalf("live scenario ending must drop step trees, got %+v", got)
	}

	p.FinishWithReport(report.FromSuite(sampleSuite()))
	final := requireSnap(t, p).Report.Specs[0].Scenarios[0]
	if len(final.Items) == 0 && len(final.Contexts) == 0 {
		t.Fatal("final suite report should restore full step detail")
	}
}

func TestLiveBroadcastsSnapshots(t *testing.T) {
	var got []*report.LiveSnapshot
	p := report.NewLivePublisher(func(snap *report.LiveSnapshot) {
		got = append(got, snap)
	})
	p.OnExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	if len(got) != 1 || !got[0].Running {
		t.Fatalf("broadcasts = %+v", got)
	}
}

func TestLiveHTMLNotWrittenUntilFinalize(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(report.ReportsDirEnv, dir)
	p := report.NewLivePublisher(nil)
	p.OnExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	hub := filepath.Join(dir, report.FolderName)
	if _, err := os.Stat(filepath.Join(hub, report.IndexFile)); err == nil {
		t.Fatal("index.html should not exist during live run")
	}
	generated, err := (&report.FinalWriter{History: historyRecorder{}}).Write(hub, report.FromSuite(sampleSuite()), &gauge_messages.SuiteExecutionResult{SuiteResult: sampleSuite()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(generated.IndexPath); err != nil {
		t.Fatalf("index.html missing after finalize: %v", err)
	}
	body, err := os.ReadFile(generated.IndexPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), "demo-project") {
		t.Fatal("final html should embed report data")
	}
}
