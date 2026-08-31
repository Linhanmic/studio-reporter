package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

func TestHistoryDeleteAPIRequiresLoopbackAndRunDir(t *testing.T) {
	root := t.TempDir()
	t.Setenv(report.ReportsDirEnv, root)
	t.Setenv(report.OverwriteReportsEnv, "true")
	hub := filepath.Join(root, report.FolderName)
	if err := os.MkdirAll(hub, 0o755); err != nil {
		t.Fatal(err)
	}
	r := report.FromSuite(sampleSuite())
	if err := os.WriteFile(filepath.Join(hub, report.IndexFile), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := report.WriteLiveSnapshot(hub, &report.LiveSnapshot{Rev: 1, Running: false, Report: r}); err != nil {
		t.Fatal(err)
	}
	if err := recordCompletedRun(hub, r); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(hub, historyFileName))
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
	id := hist.Runs[0].ID

	srv := httptest.NewServer(historyServeMux(hub))
	defer srv.Close()

	req, err := http.NewRequest(http.MethodDelete, srv.URL+"/api/history/"+id, nil)
	if err != nil {
		t.Fatal(err)
	}
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("localhost delete status = %d", res.StatusCode)
	}

	req, err = http.NewRequest(http.MethodDelete, srv.URL+"/api/history/"+report.IndexFile, nil)
	if err != nil {
		t.Fatal(err)
	}
	res, err = srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode == http.StatusOK {
		t.Fatal("deleting index.html must fail")
	}
	if _, err := os.Stat(filepath.Join(hub, report.IndexFile)); err != nil {
		t.Fatal("index.html removed")
	}
}
