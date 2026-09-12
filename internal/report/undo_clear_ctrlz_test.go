package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestUndoClearReportFiltersCtrlZShortcut verifies Ctrl/Cmd+Z restores the
// filter snapshot after clear, and does not steal undo while typing in search.
func TestUndoClearReportFiltersCtrlZShortcut(t *testing.T) {
	r := &Report{
		ProjectName: "undo-ctrlz",
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
		`Ctrl/Cmd+Z`,
		`undoClearReportFilters`,
		`lastFilterSnapshot`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for Ctrl+Z undo smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-ctrlz', v); }
  function go() {
    var clear = window.StudioReportClearReportFilters;
    var snap = window.StudioReportLastFilterSnapshot;
    var state = window.StudioReportFilterState;
    var snip = document.querySelector('[data-action="copy-all-fail-reason-snippets"]');
    if (typeof clear !== 'function' || typeof snap !== 'function' || !snip) {
      mark('missing');
      return;
    }
    // Create a distinctive pre-clear state via restore-fail-only then clear.
    if (window.StudioReportRestoreFailOnlyView) window.StudioReportRestoreFailOnlyView();
    // Force another clear so snapshot is scenario=fail.
    clear();
    if (!snap()) { mark('no-snap'); return; }
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z', ctrlKey: true, bubbles: true, cancelable: true
    }));
    if (snap()) { mark('fail-ctrlz-still-snap'); return; }
    var st = state ? state() : {};
    // Re-clear, then Ctrl+Z while focused in search must NOT undo.
    clear();
    if (!snap()) { mark('no-snap2'); return; }
    var input = document.querySelector('input[type="search"], .search-input, #report-search');
    if (!input) {
      mark('ok-no-input:' + JSON.stringify(st));
      return;
    }
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z', ctrlKey: true, bubbles: true, cancelable: true
    }));
    mark(snap() ? ('ok:' + JSON.stringify(state())) : 'fail-typing-stole-undo');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else setTimeout(go, 100);
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
	if !strings.Contains(dom, `data-ctrlz="ok`) {
		marker := ""
		if i := strings.Index(dom, `data-ctrlz="`); i >= 0 {
			rest := dom[i+len(`data-ctrlz="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-ctrlz=ok…; got %q", marker)
	}
}
