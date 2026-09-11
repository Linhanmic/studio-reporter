package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gaugestudio/studio-reporter/internal/report"
	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

func TestInputRegenSmokeCopiesScreenshots(t *testing.T) {
	dir := t.TempDir()
	shot := filepath.Join(dir, "fail-shot.png")
	// Minimal valid PNG (1x1).
	png := []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
		0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
		0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
		0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	}
	if err := os.WriteFile(shot, png, 0o644); err != nil {
		t.Fatal(err)
	}

	suite := &gauge_messages.SuiteExecutionResult{
		SuiteResult: &gauge_messages.ProtoSuiteResult{
			ProjectName:   "smoke-input",
			Environment:   "ci",
			ExecutionTime: 100,
			Failed:        true,
			TimestampISO:  "2026-09-11T12:00:00Z",
			SpecResults: []*gauge_messages.ProtoSpecResult{{
				Failed:        true,
				ExecutionTime: 100,
				ScenarioCount: 1,
				ProtoSpec: &gauge_messages.ProtoSpec{
					SpecHeading: "Shot Spec",
					FileName:    "specs/shot.spec",
					Items: []*gauge_messages.ProtoItem{{
						ItemType: gauge_messages.ProtoItem_Scenario,
						Scenario: &gauge_messages.ProtoScenario{
							ScenarioHeading: "Fails with screenshot",
							ExecutionStatus: gauge_messages.ExecutionStatus_FAILED,
							ExecutionTime:   80,
							ScenarioItems: []*gauge_messages.ProtoItem{{
								ItemType: gauge_messages.ProtoItem_Step,
								Step: &gauge_messages.ProtoStep{
									ActualText: "Assert page",
									ParsedText: "Assert page",
									StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
										ExecutionResult: &gauge_messages.ProtoExecutionResult{
											Failed:                true,
											ErrorMessage:          "not found",
											ExecutionTime:         40,
											FailureScreenshotFile: shot,
											ScreenshotFiles:       []string{shot},
										},
									},
								},
							}},
						},
					}},
				},
			}},
		},
	}

	hub := filepath.Join(dir, "hub")
	if err := os.MkdirAll(hub, 0o755); err != nil {
		t.Fatal(err)
	}
	generated, err := (&report.FinalWriter{}).Write(hub, report.FromSuite(suite.SuiteResult), suite)
	if err != nil {
		t.Fatal(err)
	}
	index, err := os.ReadFile(generated.IndexPath)
	if err != nil {
		t.Fatal(err)
	}
	html := string(index)
	if !strings.Contains(html, `src="images/`) {
		t.Fatalf("first write should use relative images/ paths; html snippet missing images/")
	}
	if strings.Contains(html, shot) || strings.Contains(html, filepath.ToSlash(dir)) {
		t.Fatalf("first write leaked absolute screenshot path")
	}
	if _, err := os.Stat(filepath.Join(hub, "images", "fail-shot.png")); err != nil {
		t.Fatalf("screenshot not copied into hub images/: %v", err)
	}

	uhilRaw, err := os.ReadFile(generated.JSONPath)
	if err != nil {
		t.Fatal(err)
	}
	uhil := string(uhilRaw)
	if strings.Contains(uhil, filepath.ToSlash(shot)) || strings.Contains(uhil, filepath.ToSlash(dir)) {
		t.Fatal(".uhilreport still embeds absolute screenshot path; expected portable images/ paths")
	}
	if !strings.Contains(uhil, `images/fail-shot.png`) {
		t.Fatal(".uhilreport missing portable images/fail-shot.png path")
	}

	// Portability: original Gauge absolute screenshot is gone; regen must use hub images/.
	if err := os.Remove(shot); err != nil {
		t.Fatal(err)
	}

	out := filepath.Join(dir, "regen")
	again, err := report.GenerateFromJSON(generated.JSONPath, out, &report.FinalWriter{})
	if err != nil {
		t.Fatal(err)
	}
	regen, err := os.ReadFile(again.IndexPath)
	if err != nil {
		t.Fatal(err)
	}
	body := string(regen)
	if !strings.Contains(body, "Fails with screenshot") {
		t.Fatal("regenerated HTML missing scenario")
	}
	if !strings.Contains(body, `src="images/`) {
		t.Fatal("regenerated HTML missing relative images/ screenshot")
	}
	if strings.Contains(body, shot) {
		t.Fatal("regenerated HTML leaked absolute screenshot path")
	}
	if _, err := os.Stat(filepath.Join(out, "images", "fail-shot.png")); err != nil {
		t.Fatalf("regenerated images/fail-shot.png missing: %v", err)
	}

	// CLI --input / --out smoke against the built binary contract.
	bin := filepath.Join(dir, "studio-reporter-bin")
	build := exec.Command("go", "build", "-o", bin, ".")
	build.Env = append(os.Environ(), "GOTOOLCHAIN=go1.27.0")
	if outBuild, err := build.CombinedOutput(); err != nil {
		t.Fatalf("go build: %v\n%s", err, outBuild)
	}
	cliOut := filepath.Join(dir, "cli-regen")
	cmd := exec.Command(bin, "--input", generated.JSONPath, "--out", cliOut)
	cmd.Env = append(os.Environ(), "GAUGE_STUDIO_SKIP_BROWSER=true")
	if outCLI, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("--input CLI failed: %v\n%s", err, outCLI)
	}
	cliHTML, err := os.ReadFile(filepath.Join(cliOut, "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(cliHTML), `src="images/`) {
		t.Fatal("CLI --input regen missing images/ paths")
	}
	if _, err := os.Stat(filepath.Join(cliOut, "images", "fail-shot.png")); err != nil {
		t.Fatalf("CLI --input did not copy screenshot: %v", err)
	}
}

func TestStaticPrintCSSRespectsFilterHidden(t *testing.T) {
	css, err := os.ReadFile(filepath.Join("internal", "report", "static_report.css"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(css)
	idx := strings.Index(text, "@media print")
	if idx < 0 {
		t.Fatal("missing @media print")
	}
	printBlock := text[idx:]
	if !strings.Contains(printBlock, ".report-block.filter-hidden { display: none !important; }") {
		t.Fatal("print CSS must keep filter-hidden hidden (print what you see)")
	}
	if strings.Contains(printBlock, "filter-hidden { display: block") {
		t.Fatal("print CSS must not force-show filtered blocks")
	}
}
