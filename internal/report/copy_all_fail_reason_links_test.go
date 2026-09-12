package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCopyAllFailReasonLinksPathStyle asserts StudioReportFormatAllFailReasonLinks
// returns newline-separated share URLs with path-style focus (literal '/') for
// each visible fail-reason row.
func TestCopyAllFailReasonLinksPathStyle(t *testing.T) {
	const (
		scnA = "spec:specs/auth/login.spec-scn-0"
		scnB = "spec:specs/pay/checkout.spec-scn-1"
	)
	r := &Report{
		ProjectName: "copy-all-links",
		Verdict:     VerdictFail,
		Failed:      true,
		Specs: []SpecReport{
			{
				ID:       "spec:specs/auth/login.spec",
				Heading:  "Login",
				FileName: "specs/auth/login.spec",
				Verdict:  VerdictFail,
				Scenarios: []ScenarioReport{{
					ID:      scnA,
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
			},
			{
				ID:       "spec:specs/pay/checkout.spec",
				Heading:  "Checkout",
				FileName: "specs/pay/checkout.spec",
				Verdict:  VerdictFail,
				Scenarios: []ScenarioReport{{
					ID:      scnB,
					Heading: "Timeout",
					Verdict: VerdictFail,
					Items: []ItemReport{{
						Kind: "step",
						Step: &StepReport{
							ActualText:   "Wait payment",
							Verdict:      VerdictFail,
							ErrorMessage: "timeout waiting for payment",
						},
					}},
				}},
			},
		},
	}
	html, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	for _, want := range []string{
		`copy-all-fail-reason-links`,
		`复制全部深链`,
		`StudioReportFormatAllFailReasonLinks`,
		`StudioReportCopyAllFailReasonLinks`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for copy-all-fail-reason-links smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function go() {
    var fn = window.StudioReportFormatAllFailReasonLinks;
    if (typeof fn !== 'function') {
      document.documentElement.setAttribute('data-all-links', 'missing-bridge');
      return;
    }
    var text = '';
    try { text = String(fn() || ''); } catch (e) {
      document.documentElement.setAttribute('data-all-links', 'throw:' + (e && e.message ? e.message : e));
      return;
    }
    document.documentElement.setAttribute('data-all-links', text ? 'ok' : 'empty');
    var pre = document.createElement('pre');
    pre.id = 'all-fail-reason-links-probe';
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
	if !strings.Contains(dom, `data-all-links="ok"`) {
		t.Fatalf("expected data-all-links=ok; empty=%v missing-bridge=%v",
			strings.Contains(dom, `data-all-links="empty"`),
			strings.Contains(dom, `data-all-links="missing-bridge"`))
	}
	start := strings.Index(dom, `id="all-fail-reason-links-probe"`)
	if start < 0 {
		t.Fatal("missing all-fail-reason-links-probe pre")
	}
	chunk := dom[start:]
	if end := strings.Index(chunk, "</pre>"); end > 0 {
		chunk = chunk[:end]
	}
	for _, id := range []string{scnA, scnB} {
		wantHash := "#" + id
		if !strings.Contains(chunk, wantHash) {
			t.Fatalf("bulk links missing path-style focus %q", wantHash)
		}
	}
	if strings.Contains(chunk, "%2Fauth%2F") || strings.Contains(chunk, "%2Fpay%2F") {
		t.Fatal("bulk links incorrectly encoded '/' as %2F in focus")
	}
	probeBody := chunk
	if gt := strings.Index(chunk, ">"); gt >= 0 {
		probeBody = chunk[gt+1:]
	}
	lines := 0
	for _, line := range strings.Split(probeBody, "\n") {
		if strings.TrimSpace(line) != "" {
			lines++
		}
	}
	if lines < 2 {
		t.Fatalf("expected >=2 deep-link lines, got %d\n%s", lines, probeBody)
	}
}
