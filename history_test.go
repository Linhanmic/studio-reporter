package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"github.com/gaugestudio/studio-reporter/internal/report"
)

func TestRecordAndDeleteHistory(t *testing.T) {
	root := t.TempDir()
	t.Setenv(report.ReportsDirEnv, root)
	t.Setenv(report.OverwriteReportsEnv, "true")

	runDir := filepath.Join(root, report.FolderName)
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		t.Fatal(err)
	}
	r := report.FromSuite(sampleSuite())
	html, err := report.RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(runDir, report.IndexFile), html, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := report.WriteLiveSnapshot(runDir, &report.LiveSnapshot{Rev: 1, Running: false, Report: r}); err != nil {
		t.Fatal(err)
	}

	if err := recordCompletedRun(runDir, r); err != nil {
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
	if hist.FormatVersion != report.FormatVersion {
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
	if _, err := os.Stat(filepath.Join(archive, report.LiveReportJSONFile)); err != nil {
		t.Fatalf("archive missing report.json: %v", err)
	}
	if _, err := os.Stat(filepath.Join(archive, report.IndexFile)); err != nil {
		t.Fatalf("archive missing static index.html: %v", err)
	}
	if _, err := os.Stat(filepath.Join(archive, "assets")); err == nil {
		t.Fatal("archive should not copy Vue assets")
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
	t.Setenv(report.ReportsDirEnv, dir)
	t.Setenv(report.OverwriteReportsEnv, "true")

	p := report.NewLivePublisher(nil)
	p.OnExecutionStarting(&gauge_messages.ExecutionInfo{ProjectName: "demo-project"}, nil)
	time.Sleep(15 * time.Millisecond)

	snap := p.Snapshot()
	if snap == nil || !snap.Running {
		t.Fatal("expected running in-memory snapshot")
	}
	if snap.StartedAt == 0 {
		t.Fatal("startedAt missing")
	}
	p.OnSpecStarting(&gauge_messages.ExecutionInfo{
		ProjectName: "demo-project",
		CurrentSpec: &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"},
	})
	if snap := p.Snapshot(); snap.CurrentSpecID != "spec:specs/auth/login.spec" {
		t.Fatalf("currentSpecId = %s", snap.CurrentSpecID)
	}
	p.OnScenarioStarting(&gauge_messages.ExecutionInfo{
		CurrentSpec:     &gauge_messages.SpecInfo{Name: "Login", FileName: "specs/auth/login.spec"},
		CurrentScenario: &gauge_messages.ScenarioInfo{Name: "Successful login"},
	})
	snap = p.Snapshot()
	if snap.CurrentScenarioID == "" {
		t.Fatal("currentScenarioId empty")
	}
	if snap.Report == nil || snap.Report.ExecutionTime < 10 {
		t.Fatalf("elapsed = %+v", snap.Report)
	}
}

func TestRecountAlwaysUpdatesSuccessRate(t *testing.T) {
	r := &report.Report{
		SuccessRate: 100,
		Specs: []report.SpecReport{
			{Verdict: report.VerdictPass, Scenarios: []report.ScenarioReport{{Verdict: report.VerdictPass}}},
			{Verdict: report.VerdictFail, Scenarios: []report.ScenarioReport{{Verdict: report.VerdictFail}}},
		},
	}
	report.Recount(r)
	if r.SuccessRate != 50 {
		t.Fatalf("successRate = %v", r.SuccessRate)
	}
}

func TestDeleteHistoryDoesNotRemoveHubFiles(t *testing.T) {
	root := t.TempDir()
	hub := filepath.Join(root, report.FolderName)
	if err := os.MkdirAll(hub, 0o755); err != nil {
		t.Fatal(err)
	}
	index := filepath.Join(hub, report.IndexFile)
	if err := os.WriteFile(index, []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := deleteHistoryRun(hub, report.IndexFile); err == nil {
		t.Fatal("expected error deleting index.html")
	}
	if _, err := os.Stat(index); err != nil {
		t.Fatal("hub index.html must remain")
	}
}

func TestRecordCompletedRunIgnoresExternalDir(t *testing.T) {
	root := t.TempDir()
	t.Setenv(report.ReportsDirEnv, root)
	out := filepath.Join(root, "elsewhere")
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := recordCompletedRun(out, report.FromSuite(sampleSuite())); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, report.FolderName, historyFileName)); err == nil {
		t.Fatal("external --out should not write project history")
	}
}

func TestHistoryDeleteRejectsNonRunFiles(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(report.ReportsDirEnv, dir)
	t.Setenv(report.OverwriteReportsEnv, "true")
	runDir := filepath.Join(dir, report.FolderName)
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		t.Fatal(err)
	}
	r := report.FromSuite(sampleSuite())
	if err := os.WriteFile(filepath.Join(runDir, report.IndexFile), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := report.WriteLiveSnapshot(runDir, &report.LiveSnapshot{Rev: 1, Running: false, Report: r}); err != nil {
		t.Fatal(err)
	}
	if err := recordCompletedRun(runDir, r); err != nil {
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
