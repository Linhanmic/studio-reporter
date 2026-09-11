package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildHistoryFailDigestGroupsReasons(t *testing.T) {
	runs := []HistoryEntry{
		{ID: "r1", Verdict: "fail", TopFailReason: "timeout after 30s", TimestampISO: "2026-09-01T10:00:00Z"},
		{ID: "r2", Verdict: "pass"},
		{ID: "r3", Verdict: "fail", TopFailReason: "timeout after 30s", TimestampISO: "2026-09-02T10:00:00Z"},
		{ID: "r4", Failed: true, TopFailReason: "null pointer", TimestampISO: "2026-09-03T10:00:00Z"},
		{ID: "r5", Verdict: "fail", TimestampISO: "2026-09-04T10:00:00Z"},
	}
	d := buildHistoryFailDigest(runs, 10)
	if d.RunCount != 5 || d.FailRunCount != 4 || d.PassRunCount != 1 {
		t.Fatalf("counts: %+v", d)
	}
	if len(d.Groups) != 2 {
		t.Fatalf("groups=%d want 2: %+v", len(d.Groups), d.Groups)
	}
	if d.Groups[0].Reason != "timeout after 30s" || d.Groups[0].Count != 2 || d.Groups[0].LastRunID != "r3" {
		t.Fatalf("first group: %+v", d.Groups[0])
	}
	if d.Groups[1].Reason != "null pointer" {
		t.Fatalf("second group: %+v", d.Groups[1])
	}
	if len(d.RunsWithoutReason) != 1 || d.RunsWithoutReason[0] != "r5" {
		t.Fatalf("without reason: %+v", d.RunsWithoutReason)
	}
	md := formatHistoryFailDigestMarkdown(d, "CI")
	if !strings.Contains(md, "timeout after 30s") || !strings.Contains(md, "null pointer") {
		t.Fatalf("markdown missing reasons:\n%s", md)
	}
}

func TestNormalizeHistoryFailReason(t *testing.T) {
	if got := normalizeHistoryFailReason("  boom   \n stack"); got != "boom" {
		t.Fatalf("got %q", got)
	}
	long := strings.Repeat("x", 300)
	got := normalizeHistoryFailReason(long)
	if strings.Count(got, "x") != 240 || !strings.HasSuffix(got, "…") {
		t.Fatalf("cap failed: len=%d got=%q", len(got), got)
	}
}

func TestLoadHistoryFailDigestFromHub(t *testing.T) {
	dir := t.TempDir()
	hist := &HistoryFile{
		FormatVersion: 1,
		Runs: []HistoryEntry{
			{ID: "a", Verdict: "fail", TopFailReason: "boom"},
			{ID: "b", Verdict: "pass"},
		},
	}
	if err := writeHistoryFile(dir, hist); err != nil {
		t.Fatal(err)
	}
	d, err := loadHistoryFailDigestFromHub(dir, 5)
	if err != nil {
		t.Fatal(err)
	}
	if d.FailRunCount != 1 || len(d.Groups) != 1 || d.Groups[0].Reason != "boom" {
		t.Fatalf("%+v", d)
	}
	abs, _ := filepath.Abs(dir)
	if d.HubDir != abs {
		t.Fatalf("hubDir=%q want %q", d.HubDir, abs)
	}
}

func TestRunDigestCmd(t *testing.T) {
	dir := t.TempDir()
	hist := &HistoryFile{
		FormatVersion: 1,
		Runs:          []HistoryEntry{{ID: "a", Verdict: "fail", TopFailReason: "x"}},
	}
	if err := writeHistoryFile(dir, hist); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr strings.Builder
	code := runDigestCmd([]string{"--dir", dir, "--format", "json"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code=%d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), `"reason": "x"`) {
		t.Fatalf("stdout=%s", stdout.String())
	}
}
