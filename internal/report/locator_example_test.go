package report

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestFailSummaryLocatorExampleParity keeps the static-report toolbar help
// string identical to Desktop fail-summary-open.js (empty-clipboard guidance).
func TestFailSummaryLocatorExampleParity(t *testing.T) {
	const want = "  - 定位: `#spec:specs/auth/login.spec-scn-0`"
	if !strings.Contains(staticReportJS, "var FAIL_SUMMARY_LOCATOR_EXAMPLE = '"+want+"'") {
		t.Fatalf("static_report.js FAIL_SUMMARY_LOCATOR_EXAMPLE drift; want %q", want)
	}
	if !strings.Contains(staticReportJS, "copy-fail-summary-locator-example") {
		t.Fatal("static JS missing copy-fail-summary-locator-example handler")
	}
	if !strings.Contains(staticReportJS, "StudioReportFailSummaryLocatorExample") {
		t.Fatal("static JS missing StudioReportFailSummaryLocatorExample bridge")
	}

	desktopPath := filepath.Join("..", "..", "desktop", "electron", "fail-summary-open.js")
	raw, err := os.ReadFile(desktopPath)
	if err != nil {
		t.Fatalf("read desktop fail-summary-open.js: %v", err)
	}
	re := regexp.MustCompile(`FAIL_SUMMARY_LOCATOR_EXAMPLE\s*=\s*'([^']*)'`)
	m := re.FindSubmatch(raw)
	if m == nil {
		t.Fatal("desktop fail-summary-open.js missing FAIL_SUMMARY_LOCATOR_EXAMPLE")
	}
	if got := string(m[1]); got != want {
		t.Fatalf("Desktop locator example %q != static %q", got, want)
	}
}
