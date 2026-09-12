package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gaugestudio/studio-reporter/internal/report"
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
	md := formatHistoryFailDigestMarkdown(d, "CI")
	if !strings.Contains(md, "studio-reporter://open?") || !strings.Contains(md, "最近失败打开深链") {
		t.Fatalf("markdown missing open links:\n%s", md)
	}
	if !strings.Contains(md, "[open](") {
		t.Fatalf("markdown missing open column:\n%s", md)
	}
}

func TestHistoryFailDigestOpenLinks(t *testing.T) {
	d := HistoryFailDigest{
		HubDir: "/hub",
		Groups: []FailDigestGroup{
			{Reason: "timeout", Count: 2, RunIDs: []string{"r1", "r2"}, LastRunID: "r2"},
			{Reason: "null", Count: 1, RunIDs: []string{"r3"}, LastRunID: "r3"},
		},
	}
	latest := historyFailDigestOpenLinks(d, "latest")
	if len(latest) != 2 || !strings.Contains(latest[0], "run=r2") || !strings.Contains(latest[1], "run=r3") {
		t.Fatalf("latest=%v", latest)
	}
	all := historyFailDigestOpenLinks(d, "all")
	if len(all) != 3 {
		t.Fatalf("all=%v", all)
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
	out := stdout.String()
	if !strings.Contains(out, `"reason": "x"`) {
		t.Fatalf("stdout=%s", out)
	}
	if !strings.Contains(out, `"openLinksLatest"`) || !strings.Contains(out, "studio-reporter://open?") {
		t.Fatalf("json missing open links: %s", out)
	}
}

func TestRunDigestCmdWriteSidecars(t *testing.T) {
	dir := t.TempDir()
	hist := &HistoryFile{
		FormatVersion: 1,
		Runs:          []HistoryEntry{{ID: "a", Verdict: "fail", TopFailReason: "boom"}},
	}
	if err := writeHistoryFile(dir, hist); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr strings.Builder
	code := runDigestCmd([]string{"--dir", dir, "--write"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code=%d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "boom") {
		t.Fatalf("stdout=%s", stdout.String())
	}
	mdPath := filepath.Join(dir, "fail-digest.md")
	jsonPath := filepath.Join(dir, "fail-digest.json")
	md, err := os.ReadFile(mdPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(md), "boom") {
		t.Fatalf("md=%s", md)
	}
	js, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(js), `"reason": "boom"`) {
		t.Fatalf("json=%s", js)
	}
	if !strings.Contains(string(js), `"formatVersion": 1`) {
		t.Fatalf("json missing formatVersion: %s", js)
	}
	if !strings.Contains(string(js), `"generatedAt"`) {
		t.Fatalf("json missing generatedAt: %s", js)
	}
	if !strings.Contains(string(md), "formatVersion: 1") || !strings.Contains(string(md), "generatedAt:") {
		t.Fatalf("md missing meta: %s", md)
	}
	if !strings.Contains(stderr.String(), "fail-digest.md") {
		t.Fatalf("stderr=%s", stderr.String())
	}
}

func TestCheckFailDigestSidecarFreshness(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "fail-digest.json")
	now := time.Date(2026, 9, 11, 22, 0, 0, 0, time.UTC)
	fresh := now.Add(-30 * time.Minute).Format(time.RFC3339)
	stale := now.Add(-48 * time.Hour).Format(time.RFC3339)

	write := func(generatedAt string, version int) {
		t.Helper()
		body := fmt.Sprintf(`{"format":"studio-reporter.historyFailDigest/v1","formatVersion":%d,"generatedAt":%q,"runCount":1}`, version, generatedAt)
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	write(fresh, 1)
	if err := checkFailDigestSidecar(path, 1, 24*time.Hour, now); err != nil {
		t.Fatalf("fresh: %v", err)
	}

	write(stale, 1)
	if err := checkFailDigestSidecar(path, 1, 24*time.Hour, now); err == nil {
		t.Fatal("stale should fail")
	}

	write(fresh, 2)
	if err := checkFailDigestSidecar(path, 1, 24*time.Hour, now); err == nil {
		t.Fatal("wrong version should fail")
	}

	if err := checkFailDigestSidecar(filepath.Join(dir, "missing.json"), 1, time.Hour, now); err == nil {
		t.Fatal("missing file should fail")
	}

	var stdout, stderr strings.Builder
	// CLI --check uses wall clock; keep generatedAt relative to time.Now().
	cliFresh := time.Now().UTC().Add(-30 * time.Minute).Format(time.RFC3339)
	write(cliFresh, 1)
	code := runDigestCmd([]string{"--dir", dir, "--check", "--max-age", "2h"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("cli check code=%d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "ok") {
		t.Fatalf("stdout=%s", stdout.String())
	}
	cliStale := time.Now().UTC().Add(-48 * time.Hour).Format(time.RFC3339)
	write(cliStale, 1)
	code = runDigestCmd([]string{"--file", path, "--check", "--max-age", "1h"}, &stdout, &stderr)
	if code != 1 {
		t.Fatalf("stale cli check code=%d want 1; stderr=%s", code, stderr.String())
	}
}

func TestOpenDeepLinkForRunEncodesSpecialHubPaths(t *testing.T) {
	hubs := []string{
		`/tmp/hub path/x`,
		`/tmp/hub#frag/x`,
		`/tmp/hub?a=1&b=2/x`,
		`/tmp/中文 hub/x`,
		`C:\Users\foo\bar hub`,
	}
	for _, hub := range hubs {
		link := openDeepLinkForRun("run/1", hub)
		if !strings.Contains(link, "studio-reporter://open?") {
			t.Fatalf("protocol missing: %s", link)
		}
		if !strings.Contains(link, "failSteps=1") {
			t.Fatalf("failSteps missing: %s", link)
		}
		// Raw hub must not appear unencoded when it contains reserved query chars.
		if strings.ContainsAny(hub, " ?#&=") && strings.Contains(link, "hub="+hub) {
			t.Fatalf("hub not query-encoded: link=%s hub=%q", link, hub)
		}
		u, err := url.Parse(link)
		if err != nil {
			t.Fatalf("parse %s: %v", link, err)
		}
		if got := u.Query().Get("hub"); got != hub {
			t.Fatalf("hub round-trip: want %q got %q (link=%s)", hub, got, link)
		}
		if got := u.Query().Get("run"); got != "run/1" {
			t.Fatalf("run=%q", got)
		}
		if got := u.Query().Get("failSteps"); got != "1" {
			t.Fatalf("failSteps=%q", got)
		}
	}
}

func TestOpenDeepLinkPathStyleFocusEncodesSlashInQuery(t *testing.T) {
	focus := "spec:specs/auth/login.spec-scn-0"
	link := openDeepLink("run-1", "/tmp/hub with space", focus, true)
	if !strings.Contains(link, "focus=spec%3Aspecs%2Fauth%2Flogin.spec-scn-0") {
		t.Fatalf("expected path slash percent-encoded in focus query, got %s", link)
	}
	if strings.Contains(link, "focus=spec:specs/") {
		t.Fatalf("raw slash must not appear in focus query: %s", link)
	}
	u, err := url.Parse(link)
	if err != nil {
		t.Fatal(err)
	}
	if got := u.Query().Get("focus"); got != focus {
		t.Fatalf("focus round-trip: want %q got %q", focus, got)
	}
	if got := u.Query().Get("hub"); got != "/tmp/hub with space" {
		t.Fatalf("hub=%q", got)
	}
	if got := u.Query().Get("failSteps"); got != "1" {
		t.Fatalf("failSteps=%q", got)
	}

	cjk := "spec:specs/中文 目录/登录.spec"
	cjkLink := openDeepLink("r", "", cjk, false)
	u2, err := url.Parse(cjkLink)
	if err != nil {
		t.Fatal(err)
	}
	if got := u2.Query().Get("focus"); got != cjk {
		t.Fatalf("cjk focus: want %q got %q (link=%s)", cjk, got, cjkLink)
	}
	if strings.Contains(cjkLink, "failSteps=") {
		t.Fatalf("failSteps should be omitted when false: %s", cjkLink)
	}
}

func TestHistoryFailDigestPathStyleFocusDeepLink(t *testing.T) {
	rpt := report.FromSuite(sampleSuite())
	entry := historyEntryFromReport(rpt)
	if entry.TopFailFocus == "" {
		t.Fatalf("expected TopFailFocus from sampleSuite fail scenario, entry=%+v", entry)
	}
	if !strings.Contains(entry.TopFailFocus, "/") {
		t.Fatalf("TopFailFocus should be path-style DOM id, got %q", entry.TopFailFocus)
	}
	entry.ID = "run-focus-1"
	entry.Verdict = "fail"
	entry.Failed = true
	entry.TimestampISO = "2026-09-11T12:00:00Z"
	d := buildHistoryFailDigest([]HistoryEntry{entry}, 10)
	d.HubDir = "/tmp/hub path"
	if len(d.Groups) < 1 {
		t.Fatalf("digest groups empty: %+v", d)
	}
	g := d.Groups[0]
	if g.LastRunFocus != entry.TopFailFocus {
		t.Fatalf("LastRunFocus=%q want %q", g.LastRunFocus, entry.TopFailFocus)
	}
	md := formatHistoryFailDigestMarkdown(d, "focus-e2e")
	if !strings.Contains(md, "focus=") || !strings.Contains(md, "%2F") {
		t.Fatalf("markdown missing path-style focus encoding:\n%s\n(focus=%q)", md, entry.TopFailFocus)
	}
	link := openDeepLink(g.LastRunID, d.HubDir, g.LastRunFocus, true)
	u, err := url.Parse(link)
	if err != nil {
		t.Fatal(err)
	}
	if got := u.Query().Get("focus"); got != entry.TopFailFocus {
		t.Fatalf("focus round-trip: want %q got %q link=%s", entry.TopFailFocus, got, link)
	}
}

func TestWriteHistoryFailDigestSidecarsPathStyleFocus(t *testing.T) {
	rpt := report.FromSuite(sampleSuite())
	entry := historyEntryFromReport(rpt)
	if entry.TopFailFocus == "" || !strings.Contains(entry.TopFailFocus, "/") {
		t.Fatalf("path-style TopFailFocus required, got %q", entry.TopFailFocus)
	}
	entry.ID = "run-sidecar-1"
	entry.Verdict = "fail"
	entry.Failed = true
	entry.TimestampISO = "2026-09-11T13:00:00Z"

	dir := t.TempDir()
	hist := &HistoryFile{FormatVersion: report.FormatVersion, Runs: []HistoryEntry{entry}}
	if err := writeHistoryFile(dir, hist); err != nil {
		t.Fatal(err)
	}
	d, err := loadHistoryFailDigestFromHub(dir, 10)
	if err != nil {
		t.Fatal(err)
	}
	if err := writeHistoryFailDigestSidecars(dir, d); err != nil {
		t.Fatal(err)
	}
	md, err := os.ReadFile(filepath.Join(dir, "fail-digest.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(md), "focus=") || !strings.Contains(string(md), "%2F") {
		t.Fatalf("fail-digest.md missing path-style focus:\n%s", md)
	}
	js, err := os.ReadFile(filepath.Join(dir, "fail-digest.json"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(js)
	if !strings.Contains(body, `"lastRunFocus"`) {
		t.Fatalf("json missing lastRunFocus: %s", body)
	}
	if !strings.Contains(body, "openLinksLatest") || !strings.Contains(body, "%2F") {
		t.Fatalf("json openLinksLatest missing path-style focus encoding: %s", body)
	}
	var payload map[string]any
	if err := json.Unmarshal(js, &payload); err != nil {
		t.Fatal(err)
	}
	links, _ := payload["openLinksLatest"].([]any)
	if len(links) < 1 {
		t.Fatalf("openLinksLatest empty: %+v", payload)
	}
	link, _ := links[0].(string)
	u, err := url.Parse(link)
	if err != nil {
		t.Fatal(err)
	}
	if got := u.Query().Get("focus"); got != entry.TopFailFocus {
		t.Fatalf("sidecar open link focus: want %q got %q (%s)", entry.TopFailFocus, got, link)
	}
}
