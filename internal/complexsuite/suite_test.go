package complexsuite

import (
	"bytes"
	"os"
	"path/filepath"
	"regexp"
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

func TestComplexPDFFailStepsDiffersFromFull(t *testing.T) {
	// Structural regression: complex hub full PDF vs #fail-steps PDF must diverge.
	// Catches the boot bug where applyFilter rewrote #fail-steps → #overview before print.
	dir := t.TempDir()
	shots := filepath.Join(dir, "shots")
	suite := Suite(shots)
	psr := suite.GetSuiteResult()
	off := false
	generated, err := (&report.FinalWriter{WritePDF: &off}).Write(filepath.Join(dir, "hub"), report.FromSuite(psr), suite)
	if err != nil {
		t.Fatal(err)
	}
	fullPDF := filepath.Join(dir, "full.pdf")
	failPDF := filepath.Join(dir, "fail-steps.pdf")

	t.Setenv("GAUGE_STUDIO_PDF_FAIL_STEPS", "")
	if err := report.WritePDF(generated.IndexPath, fullPDF); err != nil {
		if strings.Contains(err.Error(), "Chrome") || strings.Contains(err.Error(), "Chromium") {
			t.Skip(err.Error())
		}
		t.Fatal(err)
	}
	t.Setenv("GAUGE_STUDIO_PDF_FAIL_STEPS", "true")
	if err := report.WritePDF(generated.IndexPath, failPDF); err != nil {
		t.Fatal(err)
	}

	fullRaw, err := os.ReadFile(fullPDF)
	if err != nil {
		t.Fatal(err)
	}
	failRaw, err := os.ReadFile(failPDF)
	if err != nil {
		t.Fatal(err)
	}
	if len(fullRaw) < 1000 || len(failRaw) < 1000 {
		t.Fatalf("pdf too small full=%d fail=%d", len(fullRaw), len(failRaw))
	}
	strip := func(b []byte) []byte {
		for _, re := range []*regexp.Regexp{
			regexp.MustCompile(`/CreationDate\s*\([^\)]*\)`),
			regexp.MustCompile(`/ModDate\s*\([^\)]*\)`),
			regexp.MustCompile(`/ID\s*\[[^\]]*\]`),
		} {
			b = re.ReplaceAll(b, nil)
		}
		return b
	}
	if bytes.Equal(strip(fullRaw), strip(failRaw)) {
		t.Fatalf("complex fail-steps PDF identical to full (%d bytes); print boot/hash gate regresssed", len(fullRaw))
	}
	if len(failRaw) >= len(fullRaw) {
		t.Fatalf("complex fail-steps PDF should shrink (fail=%d full=%d)", len(failRaw), len(fullRaw))
	}
	html, err := os.ReadFile(generated.IndexPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`applyingHash = true`, `failSteps = null`, `print-color-adjust: exact`} {
		if !strings.Contains(string(html), want) {
			t.Fatalf("generated index missing %q", want)
		}
	}
}
