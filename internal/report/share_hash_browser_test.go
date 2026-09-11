package report

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestFailStepsHashAliasesActivateMode is a headless Chrome dump-dom smoke that
// the static report enables fail-steps-mode for every accepted failSteps alias
// (parity with ParseShareHash / Desktop share-hash.js).
func TestFailStepsHashAliasesActivateMode(t *testing.T) {
	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for failSteps hash smoke: %v", err)
		}
		t.Skip(err.Error())
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	// Minimal shell that loads the real embedded static JS/CSS contract.
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>failsteps-hash-smoke</title>
<style>` + staticReportCSS + `</style>
</head>
<body>
<div class="toolbar"><button type="button" data-action="fail-steps-only" aria-pressed="false">仅失败步骤</button></div>
<div class="result-pane">
  <details class="report-block tone-pass" data-kind="scenario" data-verdict="pass" id="scn:pass"><summary>pass</summary></details>
  <details class="report-block tone-fail" data-kind="scenario" data-verdict="fail" id="scn:fail"><summary>fail</summary>
    <details class="report-block" data-kind="step" data-verdict="fail"><summary>bad step</summary></details>
    <details class="report-block" data-kind="step" data-verdict="pass"><summary>ok step</summary></details>
  </details>
</div>
<script>` + staticReportJS + `</script>
</body></html>`
	if err := os.WriteFile(index, []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}
	fileURL := pathToFileURL(index)

	mustOn := []string{
		"fail-steps",
		"overview?failSteps=1",
		"overview?failSteps=TRUE",
		"overview?failsteps=1",
		"overview?fail_steps=Yes",
		"overview?fail-steps=true",
	}
	for _, frag := range mustOn {
		frag := frag
		t.Run("on/"+frag, func(t *testing.T) {
			dom := chromeDumpDOM(t, chrome, fileURL+"#"+frag)
			assertFailStepsMode(t, dom, true)
		})
	}

	t.Run("off/overview", func(t *testing.T) {
		dom := chromeDumpDOM(t, chrome, fileURL+"#overview")
		assertFailStepsMode(t, dom, false)
	})
	t.Run("off/failSteps=FALSE", func(t *testing.T) {
		dom := chromeDumpDOM(t, chrome, fileURL+"#overview?failSteps=FALSE")
		assertFailStepsMode(t, dom, false)
	})
}

// TestShareHashSlashFocusSelectsDOMPathID ensures path-style focus ids
// (spec:specs/auth/login.spec) survive hash apply and selectNode(getElementById).
func TestShareHashSlashFocusSelectsDOMPathID(t *testing.T) {
	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for slash-focus smoke: %v", err)
		}
		t.Skip(err.Error())
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	const focusID = "spec:specs/auth/login.spec"
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>slash-focus-smoke</title>
<style>` + staticReportCSS + `</style>
</head>
<body>
<nav class="nav-pane">
  <button type="button" class="nav-item" data-nav-target="overview">Overview</button>
  <button type="button" class="nav-item" data-nav-target="` + focusID + `">Login</button>
</nav>
<div class="result-pane">
  <section id="overview" class="overview-pane">overview</section>
  <details class="report-block tone-fail" data-kind="spec" data-verdict="fail" id="` + focusID + `">
    <summary>Login</summary>
  </details>
</div>
<script>` + staticReportJS + `</script>
</body></html>`
	if err := os.WriteFile(index, []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}
	fileURL := pathToFileURL(index)

	dom := chromeDumpDOM(t, chrome, fileURL+"#"+focusID)
	// selectNode opens the matching <details>; fallback to overview would leave it closed.
	if !strings.Contains(dom, `id="`+focusID+`"`) {
		t.Fatalf("dom missing focus id %q", focusID)
	}
	openRE := regexp.MustCompile(`(?is)<details\b[^>]*\bid="` + regexp.QuoteMeta(focusID) + `"[^>]*>`)
	m := openRE.FindString(dom)
	if m == "" {
		t.Fatalf("details for %q not found in dump-dom", focusID)
	}
	if !strings.Contains(m, " open") && !strings.Contains(m, "open>") && !strings.Contains(m, `open="`) {
		t.Fatalf("expected details open after slash-focus hash; got tag %q", m)
	}
	if !strings.Contains(dom, `data-nav-target="`+focusID+`" class="nav-item is-active"`) &&
		!strings.Contains(dom, `class="nav-item is-active" data-nav-target="`+focusID+`"`) &&
		!strings.Contains(dom, `is-active`) {
		// Soft check: at least some nav active state; open details is the hard gate.
		t.Logf("nav is-active not detected (ok if markup order differs); details open=%q", m)
	}

	// Legacy %2F form must still resolve to the same DOM node.
	domLegacy := chromeDumpDOM(t, chrome, fileURL+"#spec:specs%2Fauth%2Flogin.spec")
	mLegacy := openRE.FindString(domLegacy)
	if mLegacy == "" || (!strings.Contains(mLegacy, " open") && !strings.Contains(mLegacy, "open>") && !strings.Contains(mLegacy, `open="`)) {
		t.Fatalf("legacy %%2F focus did not open details; tag=%q", mLegacy)
	}
}

func chromeDumpDOM(t *testing.T, chrome, url string) string {
	t.Helper()
	prof := t.TempDir() // fresh profile ⇒ no sticky sessionStorage
	cmd := exec.Command(chrome,
		"--headless=new",
		"--disable-gpu",
		"--no-first-run",
		// CI runners (setup-chrome) ship chrome-sandbox without setuid root.
		"--no-sandbox",
		"--disable-setuid-sandbox",
		"--disable-dev-shm-usage",
		"--user-data-dir="+prof,
		"--virtual-time-budget=3000",
		"--dump-dom",
		url,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("chrome dump-dom: %v\n%s", err, out)
	}
	return string(out)
}

var htmlTagRE = regexp.MustCompile(`(?i)<html\b[^>]*>`)

func assertFailStepsMode(t *testing.T, dom string, want bool) {
	t.Helper()
	m := htmlTagRE.FindString(dom)
	if m == "" {
		t.Fatalf("no <html> tag in dump-dom (%d bytes)", len(dom))
	}
	has := strings.Contains(m, "fail-steps-mode")
	if has != want {
		t.Fatalf("html tag %q: fail-steps-mode=%v want %v", m, has, want)
	}
}
