package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCopyAllFailReasonSnippetsPathStyle renders a multi-reason fail report and
// asserts StudioReportFormatAllFailReasonSnippets returns a Markdown list with
// path-style focus deep links (literal '/') for each visible reason.
func TestCopyAllFailReasonSnippetsPathStyle(t *testing.T) {
	const (
		scnA = "spec:specs/auth/login.spec-scn-0"
		scnB = "spec:specs/pay/checkout.spec-scn-1"
	)
	r := &Report{
		ProjectName: "copy-all-snippets",
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
		`copy-all-fail-reason-snippets`,
		`复制全部摘要`,
		`StudioReportFormatAllFailReasonSnippets`,
		`StudioReportCopyAllFailReasonSnippets`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for copy-all-fail-reason-snippets smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function go() {
    var fn = window.StudioReportFormatAllFailReasonSnippets;
    if (typeof fn !== 'function') {
      document.documentElement.setAttribute('data-all-snip', 'missing-bridge');
      return;
    }
    var text = '';
    try { text = String(fn() || ''); } catch (e) {
      document.documentElement.setAttribute('data-all-snip', 'throw:' + (e && e.message ? e.message : e));
      return;
    }
    document.documentElement.setAttribute('data-all-snip', text ? 'ok' : 'empty');
    var pre = document.createElement('pre');
    pre.id = 'all-fail-reason-snippets-probe';
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
	if !strings.Contains(dom, `data-all-snip="ok"`) {
		t.Fatalf("expected data-all-snip=ok; empty=%v missing-bridge=%v",
			strings.Contains(dom, `data-all-snip="empty"`),
			strings.Contains(dom, `data-all-snip="missing-bridge"`))
	}
	start := strings.Index(dom, `id="all-fail-reason-snippets-probe"`)
	if start < 0 {
		t.Fatal("missing all-fail-reason-snippets-probe pre")
	}
	chunk := dom[start:]
	if end := strings.Index(chunk, "</pre>"); end > 0 {
		chunk = chunk[:end]
	}
	for _, reason := range []string{"assertion failed: password", "timeout waiting for payment"} {
		if !strings.Contains(chunk, reason) {
			t.Fatalf("bulk snippets missing reason %q", reason)
		}
	}
	for _, id := range []string{scnA, scnB} {
		wantHash := "#" + id
		if !strings.Contains(chunk, wantHash) {
			t.Fatalf("bulk snippets missing path-style focus %q", wantHash)
		}
	}
	if strings.Contains(chunk, "%2Fauth%2F") || strings.Contains(chunk, "%2Fpay%2F") {
		t.Fatal("bulk snippets incorrectly encoded '/' as %2F in focus")
	}
	if !strings.Contains(chunk, "定位:") {
		t.Fatal("bulk snippets missing 定位 deep-link lines")
	}
	// Two top-level bullets (one per reason). Prefer counting after the probe opener.
	probeBody := chunk
	if gt := strings.Index(chunk, ">"); gt >= 0 {
		probeBody = chunk[gt+1:]
	}
	bullets := 0
	for _, line := range strings.Split(probeBody, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "- (") {
			bullets++
		}
	}
	if bullets < 2 {
		t.Fatalf("expected >=2 reason bullets, got %d\n%s", bullets, probeBody)
	}
}
