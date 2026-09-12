package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestClearReportFiltersRestoresFailReasonRows applies a scenario=pass filter that
// hides all fail reasons, then calls StudioReportClearReportFilters and asserts
// bulk copy buttons re-enable and empty-state UI hides.
func TestClearReportFiltersRestoresFailReasonRows(t *testing.T) {
	const scnFail = "spec:specs/auth/login.spec-scn-0"
	r := &Report{
		ProjectName: "clear-filters",
		Verdict:     VerdictFail,
		Failed:      true,
		Specs: []SpecReport{{
			ID:       "spec:specs/auth/login.spec",
			Heading:  "Login",
			FileName: "specs/auth/login.spec",
			Verdict:  VerdictFail,
			Scenarios: []ScenarioReport{
				{
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
				},
				{
					ID:      "spec:specs/auth/login.spec-scn-1",
					Heading: "Happy path",
					Verdict: VerdictPass,
					Items: []ItemReport{{
						Kind: "step",
						Step: &StepReport{ActualText: "Open", Verdict: VerdictPass},
					}},
				},
			},
		}},
	}
	html, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	for _, want := range []string{
		`clear-report-filters`,
		`StudioReportClearReportFilters`,
		`fail-reason-empty-row`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for clear-report-filters smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-clear', v); }
  function go() {
    var clear = window.StudioReportClearReportFilters;
    var sync = window.StudioReportSyncFailReasonOverview;
    var snip = document.querySelector('[data-action="copy-all-fail-reason-snippets"]');
    var toolsClear = document.querySelector('.overview-fail-reason-tools [data-action="clear-report-filters"]');
    var hint = document.querySelector('.overview-fail-reason-empty-hint');
    var emptyRow = document.querySelector('.fail-reason-empty-row');
    if (typeof clear !== 'function' || typeof sync !== 'function') { mark('missing-bridge'); return; }
    if (!snip || !toolsClear) { mark('missing-btn'); return; }
    // Hide fail scenarios so fail-reason table goes empty.
    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"][data-verdict="fail"]').forEach(function (el) {
      el.classList.add('filter-hidden');
    });
    sync();
    var emptyOk = snip.disabled && !toolsClear.hasAttribute('hidden')
      && hint && !hint.hasAttribute('hidden')
      && emptyRow && !emptyRow.hasAttribute('hidden');
    if (!emptyOk) {
      mark('fail-empty:dis=' + snip.disabled + ':tools=' + !toolsClear.hasAttribute('hidden'));
      return;
    }
    clear();
    var restored = !snip.disabled && toolsClear.hasAttribute('hidden')
      && hint.hasAttribute('hidden') && emptyRow.hasAttribute('hidden');
    mark(restored ? 'ok' : ('fail-restore:dis=' + snip.disabled + ':toolsHidden=' + toolsClear.hasAttribute('hidden')));
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
	if !strings.Contains(dom, `data-clear="ok"`) {
		t.Fatalf("expected data-clear=ok; got marker missing (fail-empty=%v fail-restore=%v missing-bridge=%v)",
			strings.Contains(dom, `data-clear="fail-empty`),
			strings.Contains(dom, `data-clear="fail-restore`),
			strings.Contains(dom, `data-clear="missing-bridge"`))
	}
}
