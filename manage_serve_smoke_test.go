package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
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
	if entry.TopFailFocus == "" || !strings.Contains(entry.TopFailFocus, "/") {
		t.Fatalf("expected path-style topFailFocus on failed run: %+v", entry)
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
	if err != nil {
		t.Fatal(err)
	}
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
	if err != nil {
		t.Fatal(err)
	}
	if jsRes.StatusCode != http.StatusOK {
		t.Fatalf("history-digest.js status=%d", jsRes.StatusCode)
	}
	js := string(jsBody)
	for _, want := range []string{
		"studio-reporter://open",
		"failSteps",
		"buildOpenDeepLinkForRun",
		"lastRunFocus",
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
	if !strings.Contains(md, "focus=") || !strings.Contains(md, "%2F") {
		t.Fatalf("markdown missing path-style focus encoding:\n%s", md)
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
	if !strings.Contains(jsText, `"lastRunFocus"`) || !strings.Contains(jsText, "%2F") {
		t.Fatalf("json missing path-style lastRunFocus/openLinks encoding: %s", jsText)
	}
	openLinks, _ := sidecar["openLinksLatest"].([]any)
	if len(openLinks) < 1 {
		t.Fatalf("openLinksLatest empty: %#v", sidecar)
	}
	openLink, _ := openLinks[0].(string)
	openURL, err := url.Parse(openLink)
	if err != nil {
		t.Fatal(err)
	}
	if got := openURL.Query().Get("focus"); got != entry.TopFailFocus {
		t.Fatalf("sidecar open link focus: want %q got %q (%s)", entry.TopFailFocus, got, openLink)
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

	// Sidecar openLinksLatest focus → same fragment contract as Desktop open pipeline.
	focusHash := srv.URL + "/" + pathJoinURL(entry.RelDir, report.IndexFile) + "#" + entry.TopFailFocus + "?failSteps=1"
	focusDOM := chromeDumpDOMHTTP(t, chrome, focusHash)
	assertHTMLFailStepsMode(t, focusDOM, true)
	openRE := regexp.MustCompile(`(?is)<details\b[^>]*\bid="` + regexp.QuoteMeta(entry.TopFailFocus) + `"[^>]*>`)
	m := openRE.FindString(focusDOM)
	if m == "" {
		t.Fatalf("sidecar focus dump-dom: details for %q not found (url=%s)", entry.TopFailFocus, focusHash)
	}
	if !strings.Contains(m, " open") && !strings.Contains(m, "open>") && !strings.Contains(m, `open="`) {
		t.Fatalf("sidecar focus dump-dom: expected details open; tag=%q", m)
	}
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
		// CI runners (setup-chrome) ship chrome-sandbox without setuid root.
		"--no-sandbox",
		"--disable-setuid-sandbox",
		"--disable-dev-shm-usage",
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

// TestManageServePathStyleFocusDeepLinkSmoke serves a real archive index over
// manage/serve HTTP and asserts path-style focus hashes (#spec:specs/… with
// literal '/' and legacy %2F) open the matching <details>.
func TestManageServePathStyleFocusDeepLinkSmoke(t *testing.T) {
	root := t.TempDir()
	t.Setenv(report.ReportsDirEnv, root)
	t.Setenv(report.OverwriteReportsEnv, "true")
	hub := filepath.Join(root, report.FolderName)
	if err := os.MkdirAll(hub, 0o755); err != nil {
		t.Fatal(err)
	}

	r := report.FromSuite(sampleSuite())
	if err := report.WriteAssets(hub); err != nil {
		t.Fatal(err)
	}
	if err := report.WriteFinalHTML(hub, r, nil); err != nil {
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
	if len(hist.Runs) < 1 {
		t.Fatalf("want history run, got %+v", hist.Runs)
	}
	entry := hist.Runs[0]
	archiveIndex := filepath.Join(hub, filepath.FromSlash(entry.RelDir), report.IndexFile)
	htmlBytes, err := os.ReadFile(archiveIndex)
	if err != nil {
		t.Fatal(err)
	}
	html := string(htmlBytes)
	const focusID = "spec:specs/auth/login.spec"
	if !strings.Contains(html, `id="`+focusID+`"`) {
		t.Fatalf("archive index missing path-style DOM id %q (sampleSuite FileName drift?)", focusID)
	}

	srv := httptest.NewServer(historyServeMux(hub))
	defer srv.Close()

	chrome, err := lookPathChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for manage/serve path-focus smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	base := srv.URL + "/" + pathJoinURL(entry.RelDir, report.IndexFile)
	openRE := regexp.MustCompile(`(?is)<details\b[^>]*\bid="` + regexp.QuoteMeta(focusID) + `"[^>]*>`)

	assertOpen := func(t *testing.T, label, url string) {
		t.Helper()
		dom := chromeDumpDOMHTTP(t, chrome, url)
		m := openRE.FindString(dom)
		if m == "" {
			t.Fatalf("%s: details for %q not found", label, focusID)
		}
		if !strings.Contains(m, " open") && !strings.Contains(m, "open>") && !strings.Contains(m, `open="`) {
			t.Fatalf("%s: expected details open; tag=%q url=%s", label, m, url)
		}
	}

	// Literal slash in fragment (Desktop/share-hash encodeShareFocus contract).
	assertOpen(t, "literal-slash", base+"#"+focusID)
	// With failSteps query on the fragment.
	assertOpen(t, "slash+failSteps", base+"#"+focusID+"?failSteps=1")
	assertHTMLFailStepsMode(t, chromeDumpDOMHTTP(t, chrome, base+"#"+focusID+"?failSteps=1"), true)
	// Legacy percent-encoded slash must still resolve over HTTP serve.
	assertOpen(t, "legacy-%2F", base+"#spec:specs%2Fauth%2Flogin.spec")

	// Digest-style open deep link encodes focus for query; after Desktop opens,
	// the hash uses literal slash — lock Go openDeepLink encoding here too.
	link := openDeepLink(entry.ID, hub, focusID, true)
	if !strings.Contains(link, "focus=spec%3Aspecs%2Fauth%2Flogin.spec") {
		t.Fatalf("openDeepLink should query-encode path slash: %s", link)
	}
	u, err := url.Parse(link)
	if err != nil {
		t.Fatal(err)
	}
	if got := u.Query().Get("focus"); got != focusID {
		t.Fatalf("openDeepLink focus round-trip: want %q got %q", focusID, got)
	}
}
