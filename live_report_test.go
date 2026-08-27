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
	for _, want := range []string{"pinia", "dense-table", "row-pass", "row-fail"} {
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
