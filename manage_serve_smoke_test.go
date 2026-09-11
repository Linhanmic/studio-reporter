package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

// TestManageServeFailDigestDeepLinkSmoke is the manage/serve 失败摘要旁路与深链联调抽检:
// real hub (assets + failing archive) → serve → POST /api/fail-digest → sidecar deep links
// → manage.html / history-digest.js contracts → Chrome dump-dom on manage openRun hash.
func TestManageServeFailDigestDeepLinkSmoke(t *testing.T) {
	root := t.TempDir()
	t.Setenv(report.ReportsDirEnv, root)
	t.Setenv(report.OverwriteReportsEnv, "true")
	hub := filepath.Join(root, report.FolderName)
	if err := os.MkdirAll(hub, 0o755); err != nil {
		t.Fatal(err)
	}

	r := report.FromSuite(sampleSuite())
	if !r.Failed && !strings.EqualFold(r.Verdict, "fail") {
		t.Fatalf("sample suite must fail: verdict=%q failed=%v", r.Verdict, r.Failed)
	}
	if err := report.WriteAssets(hub); err != nil {
		t.Fatal(err)
	}
	if err := report.WriteFinalHTML(hub, r, nil); err != nil {
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
		t.Fatalf("want 1 history run, got %+v", hist.Runs)
	}
	entry := hist.Runs[0]
	if entry.TopFailReason == "" {
		t.Fatalf("expected topFailReason on failed run: %+v", entry)
	}
	if entry.RelDir == "" {
		t.Fatalf("expected archived relDir: %+v", entry)
	}
	archiveIndex := filepath.Join(hub, filepath.FromSlash(entry.RelDir), report.IndexFile)
	if _, err := os.Stat(archiveIndex); err != nil {
		t.Fatalf("archive index missing: %v", err)
	}

	srv := httptest.NewServer(historyServeMux(hub))
	defer srv.Close()
	client := srv.Client()

	manageRes, err := client.Get(srv.URL + "/" + report.ManageIndexFile)
	if err != nil {
		t.Fatal(err)
	}
	manageBody, err := io.ReadAll(manageRes.Body)
	manageRes.Body.Close()
	if manageRes.StatusCode != http.StatusOK {
		t.Fatalf("manage status=%d", manageRes.StatusCode)
	}
	manageHTML := string(manageBody)
	for _, want := range []string{
		"api/fail-digest",
		"fail-digest.md",
		"fail-digest.json",
		"#overview?failSteps=1",
		"StudioReporterHistoryDigest",
		"assets/history-digest.js",
		"buildOpenDeepLinkForRun",
	} {
		if !strings.Contains(manageHTML, want) {
			t.Fatalf("manage.html missing %q", want)
		}
	}

	jsRes, err := client.Get(srv.URL + "/assets/history-digest.js")
	if err != nil {
		t.Fatal(err)
	}
	jsBody, err := io.ReadAll(jsRes.Body)
	jsRes.Body.Close()
	if jsRes.StatusCode != http.StatusOK {
		t.Fatalf("history-digest.js status=%d", jsRes.StatusCode)
	}
	js := string(jsBody)
	for _, want := range []string{
		"studio-reporter://open",
		"failSteps",
		"buildOpenDeepLinkForRun",
		"StudioReporterHistoryDigest",
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("history-digest.js missing %q", want)
		}
	}

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/fail-digest", nil)
	if err != nil {
		t.Fatal(err)
	}
	postRes, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer postRes.Body.Close()
	if postRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(postRes.Body)
		t.Fatalf("POST /api/fail-digest status=%d body=%s", postRes.StatusCode, body)
	}
	var postBody map[string]any
	if err := json.NewDecoder(postRes.Body).Decode(&postBody); err != nil {
		t.Fatal(err)
	}
	if postBody["ok"] != true {
		t.Fatalf("post body=%#v", postBody)
	}
	if int(postBody["failRunCount"].(float64)) < 1 || int(postBody["groupCount"].(float64)) < 1 {
		t.Fatalf("unexpected counts: %#v", postBody)
	}

	mdBytes, err := os.ReadFile(filepath.Join(hub, "fail-digest.md"))
	if err != nil {
		t.Fatalf("fail-digest.md: %v", err)
	}
	md := string(mdBytes)
	if !strings.Contains(md, "studio-reporter://open?") || !strings.Contains(md, "failSteps=1") {
		t.Fatalf("markdown missing open deep link with failSteps:\n%s", md)
	}
	if !strings.Contains(md, "run="+entry.ID) {
		t.Fatalf("markdown missing run id %s:\n%s", entry.ID, md)
	}
	if !strings.Contains(md, entry.TopFailReason) {
		t.Fatalf("markdown missing reason %q:\n%s", entry.TopFailReason, md)
	}

	jsonBytes, err := os.ReadFile(filepath.Join(hub, "fail-digest.json"))
	if err != nil {
		t.Fatalf("fail-digest.json: %v", err)
	}
	var sidecar map[string]any
	if err := json.Unmarshal(jsonBytes, &sidecar); err != nil {
		t.Fatal(err)
	}
	if int(sidecar["formatVersion"].(float64)) != 1 {
		t.Fatalf("formatVersion=%v", sidecar["formatVersion"])
	}
	if strings.TrimSpace(sidecar["generatedAt"].(string)) == "" {
		t.Fatal("generatedAt empty")
	}
	jsText := string(jsonBytes)
	if !strings.Contains(jsText, "studio-reporter://open?") || !strings.Contains(jsText, "failSteps=1") {
		t.Fatalf("json missing open deep link with failSteps: %s", jsText)
	}

	for _, name := range []string{"fail-digest.md", "fail-digest.json"} {
		res, err := client.Get(srv.URL + "/" + name + "?ts=1")
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Fatalf("%s status=%d", name, res.StatusCode)
		}
		ct := res.Header.Get("Content-Type")
		if strings.Contains(ct, "text/html") {
			t.Fatalf("%s served as HTML (%s)", name, ct)
		}
		if name == "fail-digest.json" {
			var tmp any
			if err := json.Unmarshal(body, &tmp); err != nil {
				t.Fatalf("json probe parse: %v", err)
			}
		}
	}

	if err := checkFailDigestSidecar(filepath.Join(hub, "fail-digest.json"), 1, time.Hour, time.Now()); err != nil {
		t.Fatalf("freshness check: %v", err)
	}

	chrome, err := lookPathChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for manage/serve deep-link smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}
	archiveURL := srv.URL + "/" + pathJoinURL(entry.RelDir, report.IndexFile) + "#overview?failSteps=1"
	dom := chromeDumpDOMHTTP(t, chrome, archiveURL)
	assertHTMLFailStepsMode(t, dom, true)

	domOff := chromeDumpDOMHTTP(t, chrome, srv.URL+"/"+pathJoinURL(entry.RelDir, report.IndexFile)+"#overview")
	assertHTMLFailStepsMode(t, domOff, false)
}

func pathJoinURL(parts ...string) string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.Trim(strings.ReplaceAll(p, "\\", "/"), "/")
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, "/")
}

func lookPathChrome() (string, error) {
	candidates := []string{
		os.Getenv("CHROME_PATH"),
		os.Getenv("GOOGLE_CHROME_SHIM"),
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser",
		"chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if p, err := exec.LookPath(c); err == nil {
			return p, nil
		}
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", os.ErrNotExist
}

func chromeDumpDOMHTTP(t *testing.T, chrome, url string) string {
	t.Helper()
	prof := t.TempDir()
	cmd := exec.Command(chrome,
		"--headless=new",
		"--disable-gpu",
		"--no-first-run",
		"--user-data-dir="+prof,
		"--virtual-time-budget=5000",
		"--dump-dom",
		url,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("chrome dump-dom: %v\n%s", err, out)
	}
	return string(out)
}

var manageSmokeHTMLTagRE = regexp.MustCompile(`(?i)<html\b[^>]*>`)

func assertHTMLFailStepsMode(t *testing.T, dom string, want bool) {
	t.Helper()
	m := manageSmokeHTMLTagRE.FindString(dom)
	if m == "" {
		t.Fatalf("no <html> tag in dump-dom (%d bytes)", len(dom))
	}
	has := strings.Contains(m, "fail-steps-mode")
	if has != want {
		t.Fatalf("html tag %q: fail-steps-mode=%v want %v", m, has, want)
	}
}
