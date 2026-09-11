package report

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestOverviewFailReasonJumpPathStyleFocus renders a real static report whose
// fail-reason refs use path-style scenario DOM ids (contain '/'), auto-clicks
// the Overview count cell, and asserts Chrome dump-dom opened that <details>.
func TestOverviewFailReasonJumpPathStyleFocus(t *testing.T) {
	const scnID = "spec:specs/auth/login.spec-scn-0"
	r := &Report{
		ProjectName: "path-jump",
		Verdict:     VerdictFail,
		Failed:      true,
		Specs: []SpecReport{{
			ID:       "spec:specs/auth/login.spec",
			Heading:  "Login",
			FileName: "specs/auth/login.spec",
			Verdict:  VerdictFail,
			Scenarios: []ScenarioReport{{
				ID:      scnID,
				Heading: "Bad password",
				Verdict: VerdictFail,
				Items: []ItemReport{{
					Kind: "step",
					Step: &StepReport{
						ActualText:   "Assert password",
						Verdict:      VerdictFail,
						ErrorMessage: "assertion failed: password",
					},
				}},
			}},
		}},
	}
	html, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	if !strings.Contains(scnID, "/") {
		t.Fatal("fixture scn id must be path-style")
	}
	if !strings.Contains(body, `id="`+scnID+`"`) {
		t.Fatalf("report missing path-style scenario DOM id %q", scnID)
	}
	if !strings.Contains(body, `data-scn-id="`+scnID+`"`) {
		t.Fatalf("fail-reason ref missing path-style data-scn-id %q\n--- snippet ---\n%s", scnID, body[0:min(2000, len(body))])
	}
	if !strings.Contains(body, "fail-reason-count") {
		t.Fatal("missing fail-reason-count affordance")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for Overview fail-reason jump smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	click := `<script>
(function () {
  function go() {
    var row = document.querySelector('.fail-reason-row');
    var btn = row && (row.querySelector('.fail-reason-count') || row.querySelector('.fail-reason-text'));
    if (!btn) { document.documentElement.setAttribute('data-jump', 'missing-row'); return; }
    btn.click();
    var el = document.getElementById(` + "`" + scnID + "`" + `);
    document.documentElement.setAttribute('data-jump', el && el.open ? 'opened' : 'closed');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
</script>`
	injected := body
	if strings.Contains(injected, "</body>") {
		injected = strings.Replace(injected, "</body>", click+"</body>", 1)
	} else {
		injected += click
	}
	if err := os.WriteFile(index, []byte(injected), 0o644); err != nil {
		t.Fatal(err)
	}

	dom := chromeDumpDOM(t, chrome, pathToFileURL(index))
	if !strings.Contains(dom, `data-jump="opened"`) {
		t.Fatalf("expected data-jump=opened after path-style fail-reason click; got marker missing. has closed=%v missing=%v",
			strings.Contains(dom, `data-jump="closed"`),
			strings.Contains(dom, `data-jump="missing-row"`))
	}
	openRE := regexp.MustCompile(`(?is)<details\b[^>]*\bid="` + regexp.QuoteMeta(scnID) + `"[^>]*>`)
	m := openRE.FindString(dom)
	if m == "" {
		t.Fatalf("details for %q not found after fail-reason jump", scnID)
	}
	if !strings.Contains(m, " open") && !strings.Contains(m, "open>") && !strings.Contains(m, `open="`) {
		t.Fatalf("expected path-style details open after Overview jump; tag=%q", m)
	}
}
