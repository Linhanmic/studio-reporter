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
	if hist.FormatVersion != reportFormatVersion {
		t.Fatalf("history formatVersion = %d", hist.FormatVersion)
	}
	if len(hist.Runs) != 1 {
		t.Fatalf("runs = %+v", hist.Runs)
	}
	entry := hist.Runs[0]
	if entry.ID == "" || entry.RelDir == "" {
		t.Fatalf("entry = %+v", entry)
	}
	archive := filepath.Join(runDir, entry.RelDir)
	if _, err := os.Stat(filepath.Join(archive, liveReportJSONFile)); err != nil {
		t.Fatalf("archive missing report.json: %v", err)
	}
	if _, err := os.Stat(filepath.Join(archive, "assets")); err == nil {
		t.Fatal("archive should not copy Vue assets")
	}
	if _, err := os.Stat(filepath.Join(archive, reportIndexFile)); err == nil {
		t.Fatal("archive should not copy index.html")
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

	body := viewerSource(t, filepath.Join(dir, reportFolderName))
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

func TestDeleteHistoryDoesNotRemoveHubFiles(t *testing.T) {
	root := t.TempDir()
	hub := filepath.Join(root, reportFolderName)
	if err := os.MkdirAll(hub, 0o755); err != nil {
		t.Fatal(err)
	}
	index := filepath.Join(hub, reportIndexFile)
	if err := os.WriteFile(index, []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := deleteHistoryRun(hub, reportIndexFile); err == nil {
		t.Fatal("expected error deleting index.html")
	}
	if _, err := os.Stat(index); err != nil {
		t.Fatal("hub index.html must remain")
	}
}

func TestRecordCompletedRunIgnoresExternalDir(t *testing.T) {
	root := t.TempDir()
	t.Setenv(reportsDirEnv, root)
	out := filepath.Join(root, "elsewhere")
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := recordCompletedRun(out, toReport(sampleSuite())); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, reportFolderName, historyFileName)); err == nil {
		t.Fatal("external --out should not write project history")
	}
}

func TestHistoryDeleteRejectsNonRunFiles(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(reportsDirEnv, dir)
	t.Setenv(overwriteReportsEnv, "true")
	runDir := filepath.Join(dir, reportFolderName)
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		t.Fatal(err)
	}
	report := toReport(sampleSuite())
	if err := os.WriteFile(filepath.Join(runDir, reportIndexFile), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeLiveSnapshot(runDir, &LiveSnapshot{Rev: 1, Running: false, Report: report}); err != nil {
		t.Fatal(err)
	}
	if err := recordCompletedRun(runDir, report); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(runDir, historyFileName+".bak"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := deleteHistoryRun(runDir, historyFileName); err == nil {
		t.Fatal("should not delete history.json")
	}
	if _, err := os.Stat(filepath.Join(runDir, historyFileName)); err != nil {
		t.Fatal("history.json missing after rejected delete")
	}
}
