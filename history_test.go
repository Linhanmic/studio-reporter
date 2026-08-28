package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

func TestRecordAndDeleteHistory(t *testing.T) {
	root := t.TempDir()
	t.Setenv(reportsDirEnv, root)
	t.Setenv(overwriteReportsEnv, "true")

	runDir := filepath.Join(root, reportFolderName)
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		t.Fatal(err)
	}
	report := toReport(sampleSuite())
	html, err := renderReportHTML(report)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(runDir, reportIndexFile), html, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeLiveSnapshot(runDir, &LiveSnapshot{Rev: 1, Running: false, Report: report}); err != nil {
		t.Fatal(err)
	}

	if err := recordCompletedRun(runDir, report); err != nil {
		t.Fatal(err)
	}
	histPath := filepath.Join(runDir, historyFileName)
	raw, err := os.ReadFile(histPath)
	if err != nil {
		t.Fatal(err)
	}
	var hist HistoryFile
	if err := json.Unmarshal(raw, &hist); err != nil {
		t.Fatal(err)
	}
	if len(hist.Runs) != 1 {
		t.Fatalf("runs = %+v", hist.Runs)
	}
	entry := hist.Runs[0]
	if entry.ID == "" || entry.RelDir == "" {
		t.Fatalf("entry = %+v", entry)
	}
	if _, err := os.Stat(filepath.Join(runDir, entry.RelDir, reportIndexFile)); err != nil {
		t.Fatalf("archive missing: %v", err)
	}

	if err := deleteHistoryRun(runDir, entry.ID); err != nil {
		t.Fatal(err)
	}
	raw, err = os.ReadFile(histPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &hist); err != nil {
		t.Fatal(err)
	}
	if len(hist.Runs) != 0 {
		t.Fatalf("expected empty history, got %+v", hist.Runs)
	}
}

func TestLiveSnapshotTracksCurrentAndElapsed(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(reportsDirEnv, dir)
	t.Setenv(overwriteReportsEnv, "true")

	p := newLivePublisher()
	p.onExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	time.Sleep(15 * time.Millisecond)
	p.onSpecStarting(&gauge_messages.ExecutionInfo{
		ProjectName: "demo-project",
		CurrentSpec: &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"},
	})
	p.onScenarioStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"},
		CurrentScenario: &gauge_messages.ScenarioInfo{Name: "Successful login"},
	})

	raw, err := os.ReadFile(filepath.Join(dir, reportFolderName, liveReportJSONFile))
	if err != nil {
		t.Fatal(err)
	}
	var snap LiveSnapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		t.Fatal(err)
	}
	if !snap.Running {
		t.Fatal("expected running")
	}
	if snap.StartedAt == 0 {
		t.Fatal("startedAt missing")
	}
	if snap.CurrentSpecID != "spec:specs/auth/login.spec" {
		t.Fatalf("currentSpecId = %s", snap.CurrentSpecID)
	}
	if snap.CurrentScenarioID == "" {
		t.Fatal("currentScenarioId empty")
	}
	if snap.Report == nil || snap.Report.ExecutionTime < 10 {
		t.Fatalf("elapsed = %+v", snap.Report)
	}

	html, err := os.ReadFile(filepath.Join(dir, reportFolderName, reportIndexFile))
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	if !strings.Contains(body, `"running":true`) || !strings.Contains(body, "currentSpecId") {
		t.Fatalf("live html seed missing running flag")
	}
}

func TestRecountAlwaysUpdatesSuccessRate(t *testing.T) {
	r := &Report{
		SuccessRate: 100,
		Specs: []SpecReport{
			{Verdict: verdictPass, Scenarios: []ScenarioReport{{Verdict: verdictPass}}},
			{Verdict: verdictFail, Scenarios: []ScenarioReport{{Verdict: verdictFail}}},
		},
	}
	recountReport(r)
	if r.SuccessRate != 50 {
		t.Fatalf("successRate = %v", r.SuccessRate)
	}
}
