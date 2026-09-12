package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestFailReasonEmptyStateEscClearsFilters verifies Escape clears report filters
// when the Overview fail-reason empty state is active.
func TestFailReasonEmptyStateEscClearsFilters(t *testing.T) {
	r := &Report{
		ProjectName: "esc-clear",
		Verdict:     VerdictFail,
		Failed:      true,
		Specs: []SpecReport{{
			ID:       "spec:specs/auth/login.spec",
			Heading:  "Login",
			FileName: "specs/auth/login.spec",
			Verdict:  VerdictFail,
			Scenarios: []ScenarioReport{{
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
			}},
		}},
	}
	html, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	for _, want := range []string{
		`failReasonEmptyStateActive`,
		`StudioReportFailReasonEmptyStateActive`,
		`StudioReportClearReportFilters`,
		`Esc 可清除过滤`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for Esc-clear smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-esc', v); }
  function go() {
    var sync = window.StudioReportSyncFailReasonOverview;
    var empty = window.StudioReportFailReasonEmptyStateActive;
    var snip = document.querySelector('[data-action="copy-all-fail-reason-snippets"]');
    if (typeof sync !== 'function' || typeof empty !== 'function' || !snip) {
      mark('missing');
      return;
    }
    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"][data-verdict="fail"]').forEach(function (el) {
      el.classList.add('filter-hidden');
    });
    sync();
    if (!snip.disabled || !empty()) {
      mark('not-empty:dis=' + snip.disabled + ':empty=' + empty());
      return;
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (snip.disabled || empty()) {
      mark('fail-clear:dis=' + snip.disabled + ':empty=' + empty());
      return;
    }
    // Re-enter empty; Esc while focused in search must NOT clear.
    document.querySelectorAll('.result-pane .report-block[data-kind="scenario"][data-verdict="fail"]').forEach(function (el) {
      el.classList.add('filter-hidden');
    });
    sync();
    var input = document.querySelector('input[type="search"], input.search-input, #report-search, .toolbar input');
    if (!input) {
      mark('ok-no-input');
      return;
    }
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    mark(snip.disabled && empty() ? 'ok' : ('fail-typing:dis=' + snip.disabled + ':empty=' + empty()));
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
	if !strings.Contains(dom, `data-esc="ok"`) && !strings.Contains(dom, `data-esc="ok-no-input"`) {
		// Extract marker for diagnostics.
		marker := ""
		if i := strings.Index(dom, `data-esc="`); i >= 0 {
			rest := dom[i+len(`data-esc="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-esc=ok; got %q", marker)
	}
}
