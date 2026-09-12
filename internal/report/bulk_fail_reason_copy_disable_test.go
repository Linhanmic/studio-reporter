package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestBulkFailReasonCopyButtonsDisableWhenFilteredOut verifies Overview bulk
// copy buttons become disabled (disabled + aria-disabled) when no fail-reason
// rows remain visible after syncFailReasonOverview.
func TestBulkFailReasonCopyButtonsDisableWhenFilteredOut(t *testing.T) {
	const scnFail = "spec:specs/auth/login.spec-scn-0"
	r := &Report{
		ProjectName: "bulk-disable",
		Verdict:     VerdictFail,
		Failed:      true,
		Specs: []SpecReport{{
			ID:       "spec:specs/auth/login.spec",
			Heading:  "Login",
			FileName: "specs/auth/login.spec",
			Verdict:  VerdictFail,
			Scenarios: []ScenarioReport{{
				ID:      scnFail,
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
	for _, want := range []string{
		`StudioReportSyncFailReasonOverview`,
		`StudioReportSyncBulkFailReasonCopyButtons`,
		`copy-all-fail-reason-snippets`,
		`copy-all-fail-reason-links`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for bulk-disable smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-bulk', v); }
  function go() {
    var snip = document.querySelector('[data-action="copy-all-fail-reason-snippets"]');
    var link = document.querySelector('[data-action="copy-all-fail-reason-links"]');
    var sync = window.StudioReportSyncFailReasonOverview;
    if (!snip || !link) { mark('missing-btn'); return; }
    if (typeof sync !== 'function') { mark('missing-bridge'); return; }
    sync();
    var enabledOk = !snip.disabled && snip.getAttribute('aria-disabled') !== 'true'
      && !link.disabled && link.getAttribute('aria-disabled') !== 'true';
    var hint = document.querySelector('.overview-fail-reason-empty-hint');
    var hintHiddenWhenEnabled = !hint || hint.hasAttribute('hidden');
    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"][data-verdict="fail"]').forEach(function (el) {
      el.classList.add('filter-hidden');
    });
    sync();
    var disabledOk = snip.disabled && snip.getAttribute('aria-disabled') === 'true'
      && link.disabled && link.getAttribute('aria-disabled') === 'true';
    var hintShownWhenDisabled = hint && !hint.hasAttribute('hidden');
    mark(enabledOk && disabledOk && hintHiddenWhenEnabled && hintShownWhenDisabled
      ? 'ok'
      : ('fail:en=' + enabledOk + ':dis=' + disabledOk + ':hintHide=' + hintHiddenWhenEnabled + ':hintShow=' + hintShownWhenDisabled));
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
	if !strings.Contains(dom, `data-bulk="ok"`) {
		t.Fatalf("expected data-bulk=ok; marker missing (fail=%v missing-btn=%v missing-bridge=%v)",
			strings.Contains(dom, `data-bulk="fail`),
			strings.Contains(dom, `data-bulk="missing-btn"`),
			strings.Contains(dom, `data-bulk="missing-bridge"`))
	}
}
