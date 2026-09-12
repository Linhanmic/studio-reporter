package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestRestoreFailOnlyViewFromEmptyState verifies StudioReportRestoreFailOnlyView
// clears search noise and switches scenario filter to fail so fail-reason rows
// become visible again without returning to an all-verdict view.
func TestRestoreFailOnlyViewFromEmptyState(t *testing.T) {
	r := &Report{
		ProjectName: "restore-fail-only",
		Verdict:     VerdictFail,
		Failed:      true,
		Specs: []SpecReport{{
			ID:       "spec:specs/auth/login.spec",
			Heading:  "Login",
			FileName: "specs/auth/login.spec",
			Verdict:  VerdictFail,
			Scenarios: []ScenarioReport{
				{
					ID:      "spec:specs/auth/login.spec-scn-0",
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
		`restore-fail-only-view`,
		`仅看失败`,
		`StudioReportRestoreFailOnlyView`,
		`restoreFailOnlyView`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for restore-fail-only smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-restore', v); }
  function go() {
    var sync = window.StudioReportSyncFailReasonOverview;
    var restore = window.StudioReportRestoreFailOnlyView;
    var snip = document.querySelector('[data-action="copy-all-fail-reason-snippets"]');
    var toolsRestore = document.querySelector('.overview-fail-reason-tools [data-action="restore-fail-only-view"]');
    if (typeof sync !== 'function' || typeof restore !== 'function' || !snip || !toolsRestore) {
      mark('missing');
      return;
    }
    // Force empty via query that matches nothing.
    var search = document.querySelector('input[type="search"], .search-input');
    if (search) {
      search.value = '__no_match_zz__';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Also hide fails as a fallback if input debounce hasn't applied yet.
    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"][data-verdict="fail"]').forEach(function (el) {
      el.classList.add('filter-hidden');
    });
    sync();
    if (!snip.disabled || toolsRestore.hasAttribute('hidden')) {
      mark('not-empty');
      return;
    }
    restore();
    var ok = !snip.disabled && toolsRestore.hasAttribute('hidden');
    // scenario filter button for fail should be active
    var failBtn = document.querySelector('.filter-group[data-scope="scenario"] .filter-btn[data-filter="fail"], .filter-group[data-scope="scenario"] button[data-filter="fail"]');
    var failActive = failBtn && (failBtn.classList.contains('active') || failBtn.getAttribute('aria-pressed') === 'true');
    mark(ok && failActive ? 'ok' : ('fail:ok=' + ok + ':failActive=' + !!failActive + ':scenarioState=' + (window.StudioReportFilterState ? JSON.stringify(window.StudioReportFilterState()) : 'n/a')));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else setTimeout(go, 150);
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
	if !strings.Contains(dom, `data-restore="ok"`) {
		marker := ""
		if i := strings.Index(dom, `data-restore="`); i >= 0 {
			rest := dom[i+len(`data-restore="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-restore=ok; got %q", marker)
	}
}
