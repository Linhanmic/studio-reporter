package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCopyFailSummaryPathStyleFocusDeepLink renders a real report, collects the
// fail-summary Markdown via StudioReportCollectFailSummary, and asserts it
// embeds a path-style share hash (literal '/') for the failing scenario.
func TestCopyFailSummaryPathStyleFocusDeepLink(t *testing.T) {
	const scnID = "spec:specs/auth/login.spec-scn-0"
	r := &Report{
		ProjectName: "copy-summary-path",
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
	if !strings.Contains(body, "StudioReportCollectFailSummary") {
		t.Fatal("static JS missing StudioReportCollectFailSummary bridge")
	}
	if !strings.Contains(body, "failSummaryDeepLink") {
		t.Fatal("static JS missing failSummaryDeepLink helper")
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for copy-fail-summary path-style smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function go() {
    var fn = window.StudioReportCollectFailSummary;
    if (typeof fn !== 'function') {
      document.documentElement.setAttribute('data-summary', 'missing-bridge');
      return;
    }
    var text = '';
    try { text = String(fn() || ''); } catch (e) {
      document.documentElement.setAttribute('data-summary', 'throw:' + (e && e.message ? e.message : e));
      return;
    }
    // Stash in attribute (Chrome dump-dom friendly) and a pre for grepping long text.
    document.documentElement.setAttribute('data-summary', text ? 'ok' : 'empty');
    var pre = document.createElement('pre');
    pre.id = 'fail-summary-probe';
    pre.textContent = text;
    document.body.appendChild(pre);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
</script>`
	injected := body
	if strings.Contains(injected, "</body>") {
		injected = strings.Replace(injected, "</body>", probe+"</body>", 1)
	} else {
		injected += probe
	}
	if err := os.WriteFile(index, []byte(injected), 0o644); err != nil {
		t.Fatal(err)
	}

	dom := chromeDumpDOM(t, chrome, pathToFileURL(index))
	if !strings.Contains(dom, `data-summary="ok"`) {
		t.Fatalf("expected data-summary=ok from StudioReportCollectFailSummary; marker missing (empty=%v missing-bridge=%v)",
			strings.Contains(dom, `data-summary="empty"`),
			strings.Contains(dom, `data-summary="missing-bridge"`))
	}
	// Path-style focus must keep literal '/' in the share hash (encodeShareFocus contract).
	wantHash := "#" + scnID
	if !strings.Contains(dom, wantHash) {
		t.Fatalf("fail summary missing path-style focus hash %q", wantHash)
	}
	if !strings.Contains(dom, "定位:") {
		t.Fatal("fail summary missing 定位 deep-link lines")
	}
	// Must not percent-encode the path slash in the focus segment.
	if strings.Contains(dom, "#spec:specs%2Fauth%2Flogin.spec-scn-0") {
		t.Fatal("fail summary focus hash incorrectly encoded '/' as %2F")
	}
	if !strings.Contains(dom, "assertion failed: password") && !strings.Contains(dom, "Bad password") {
		t.Fatal("fail summary missing failure content")
	}
}
