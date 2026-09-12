package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestUndoClearReportFiltersStatusDescribesScope asserts undo status text
// includes a human-readable restored filter summary via describeFilterSnapshot.
func TestUndoClearReportFiltersStatusDescribesScope(t *testing.T) {
	r := &Report{
		ProjectName: "undo-status",
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
		`describeFilterSnapshot`,
		`StudioReportDescribeFilterSnapshot`,
		`已撤销清除，已恢复：`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for undo-status smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-undo-status', v); }
  function go() {
    var desc = window.StudioReportDescribeFilterSnapshot;
    var clear = window.StudioReportClearReportFilters;
    var undo = window.StudioReportUndoClearReportFilters;
    if (typeof desc !== 'function' || typeof clear !== 'function' || typeof undo !== 'function') {
      mark('missing');
      return;
    }
    var sample = desc({ query: 'Bad password', spec: 'all', scenario: 'fail', failStepsOnly: true });
    if (sample.indexOf('搜索=') < 0 || sample.indexOf('场景=fail') < 0 || sample.indexOf('仅失败步骤') < 0) {
      mark('bad-desc:' + sample);
      return;
    }
    if (window.StudioReportRestoreFailOnlyView) window.StudioReportRestoreFailOnlyView();
    clear();
    undo();
    var status = document.querySelector('.status-msg, [role="status"]');
    var text = status ? String(status.textContent || '') : '';
    mark(text.indexOf('已撤销清除，已恢复：') >= 0 && text.indexOf('场景=') >= 0
      ? 'ok:' + text
      : 'fail-status:' + text);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else setTimeout(go, 120);
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
	if !strings.Contains(dom, `data-undo-status="ok`) {
		marker := ""
		if i := strings.Index(dom, `data-undo-status="`); i >= 0 {
			rest := dom[i+len(`data-undo-status="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-undo-status=ok…; got %q", marker)
	}
}
