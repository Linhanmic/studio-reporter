package complexsuite

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

func TestComplexSuiteCoverage(t *testing.T) {
	dir := t.TempDir()
	shots := filepath.Join(dir, "shots")
	suite := Suite(shots)
	psr := suite.GetSuiteResult()
	if psr == nil {
		t.Fatal("empty suite")
	}
	if len(psr.GetSpecResults()) < 8 {
		t.Fatalf("want ≥8 specs, got %d", len(psr.GetSpecResults()))
	}

	generated, err := (&report.FinalWriter{}).Write(filepath.Join(dir, "hub"), report.FromSuite(psr), suite)
	if err != nil {
		t.Fatal(err)
	}
	htmlBytes, err := os.ReadFile(generated.IndexPath)
	if err != nil {
		t.Fatal(err)
	}
	html := string(htmlBytes)

	checks := []string{
		"complex-gauge",
		"管理员", // CJK static param
		"手机",  // CJK dynamic search
		"tone-fail",
		"tone-pass",
		"tone-skip",
		"images/",
		"frag static",
		"frag dynamic",
		"frag multiline",
		`<div class="label">步骤</div>`,
		"Pay with nested concept",
		"Declined payment",
		"Missing step is skipped",
		"Create user with profile",
		"Deep nested concepts",
		"Allocate tenant",
		"Seed defaults",
		"Shopping cart",
		"Catalog search",
	}
	for _, want := range checks {
		if !strings.Contains(html, want) {
			t.Fatalf("complex report HTML missing %q", want)
		}
	}

	// Portable uhileport: delete absolute shots, regen from uhileport next to images/.
	for _, name := range []string{"fail-payment.png", "debug-before.png", "debug-after.png"} {
		_ = os.Remove(filepath.Join(shots, name))
	}
	out := filepath.Join(dir, "regen")
	again, err := report.GenerateFromJSON(generated.JSONPath, out, &report.FinalWriter{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(again.Dir, "images", "fail-payment.png")); err != nil {
		t.Fatalf("regen missing portable screenshot: %v", err)
	}

	r := report.FromSuite(psr)
	if r.Summary.Specs.Total < 8 {
		t.Fatalf("spec total=%d", r.Summary.Specs.Total)
	}
	if r.Summary.Scenarios.Total < 12 {
		t.Fatalf("scenario total=%d (want denser fixture)", r.Summary.Scenarios.Total)
	}
	if r.Summary.Steps.Total < 30 {
		t.Fatalf("step total=%d (want denser fixture)", r.Summary.Steps.Total)
	}
}
