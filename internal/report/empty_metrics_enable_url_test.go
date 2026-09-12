package report

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmptyMetricsEnableURLCopy verifies format/copy bridges produce a shareable
// URL with emptyMetrics=1 while preserving an existing hash filter.
func TestEmptyMetricsEnableURLCopy(t *testing.T) {
	r := &Report{
		ProjectName: "metrics-enable-url",
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
		`copy-empty-metrics-enable-url`,
		`StudioReportFormatEmptyMetricsEnableURL`,
		`StudioReportCopyEmptyMetricsEnableURL`,
		`复制链接`,
		`复制开启链接`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("report missing %q", want)
		}
	}

	chrome, err := findChrome()
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("chrome required in CI for empty-metrics enable-url smoke: %v", err)
		}
		t.Skip("chrome not available:", err)
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	probe := `<script>
(function () {
  function mark(v) { document.documentElement.setAttribute('data-enable-url', v); }
  function go() {
    var format = window.StudioReportFormatEmptyMetricsEnableURL;
    var copy = window.StudioReportCopyEmptyMetricsEnableURL;
    var toolsBtn = document.querySelector('.overview-empty-metrics-enable-hint [data-action="copy-empty-metrics-enable-url"]');
    var panelBtn = document.querySelector('.overview-empty-state-metrics [data-action="copy-empty-metrics-enable-url"]');
    if (typeof format !== 'function' || typeof copy !== 'function' || !toolsBtn || !panelBtn) {
      mark('missing');
      return;
    }
    // Simulate a filtered share hash + an existing emptyMetrics=0 to overwrite.
    try {
      history.replaceState(null, '', location.pathname + '?foo=1&emptyMetrics=0&bar=2#overview?scenario=fail');
    } catch (e) {
      mark('fail-history:' + String(e));
      return;
    }
    var url = format();
    var ok = typeof url === 'string'
      && /[?&]emptyMetrics=1(?:&|#|$)/.test(url)
      && !/[?&]emptyMetrics=0(?:&|#|$)/.test(url)
      && /[?&]foo=1(?:&|#|$)/.test(url)
      && /[?&]bar=2(?:&|#|$)/.test(url)
      && url.indexOf('#overview?scenario=fail') >= 0;
    var shorten = window.StudioReportShortenEmptyMetricsEnableURL;
    var shortOk = typeof shorten === 'function';
    if (shortOk) {
      var longUrl = 'https://example.test/reports/very/long/path/to/index.html?foo=1&emptyMetrics=1&bar=2#overview?scenario=fail&q=' + encodeURIComponent('assertion failed password');
      var short = shorten(longUrl);
      shortOk = typeof short === 'string' && short.length < longUrl.length && short.indexOf('…') >= 0
        && short.indexOf('emptyMetrics=1') >= 0;
    }
    mark((ok && shortOk) ? ('ok:' + url) : ('fail:' + url + ';short=' + shortOk));
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
	if !strings.Contains(dom, `data-enable-url="ok:`) {
		marker := ""
		if i := strings.Index(dom, `data-enable-url="`); i >= 0 {
			rest := dom[i+len(`data-enable-url="`):]
			if j := strings.Index(rest, `"`); j >= 0 {
				marker = rest[:j]
			}
		}
		t.Fatalf("expected data-enable-url=ok:…; got %q", marker)
	}
}
