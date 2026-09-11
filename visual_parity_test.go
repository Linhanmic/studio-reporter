package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gaugestudio/studio-reporter/internal/report"
	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

func TestStaticVisualParityCSS(t *testing.T) {
	css, err := os.ReadFile(filepath.Join("internal", "report", "static_report.css"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(css)
	for _, want := range []string{
		"--pass-row:",
		"--fail-row:",
		".frag.static",
		".frag.dynamic",
		".frag.special",
		"grid-template-columns: repeat(4",
		".report-block.tone-pass > summary",
		".report-block.tone-fail > summary",
		"letter-spacing: .04em",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("static_report.css missing visual-parity marker %q", want)
		}
	}

	viewer, err := os.ReadFile("viewer.html")
	if err != nil {
		t.Fatal(err)
	}
	v := string(viewer)
	for _, want := range []string{
		"--pass-row:",
		".frag.static",
		"el-tag.el-tag--success",
		"var(--pass)",
		"var(--fail)",
		"system-ui",
	} {
		if !strings.Contains(v, want) {
			t.Fatalf("viewer.html missing visual-parity marker %q", want)
		}
	}
}

func TestStaticHeaderIncludesStepsCard(t *testing.T) {
	dir := t.TempDir()
	suite := &gauge_messages.SuiteExecutionResult{
		SuiteResult: &gauge_messages.ProtoSuiteResult{
			ProjectName:   "parity",
			Environment:   "ci",
			ExecutionTime: 1000,
			Failed:        true,
			SuccessRate:   50,
			TimestampISO:  "2026-09-11T12:00:00Z",
			SpecResults: []*gauge_messages.ProtoSpecResult{{
				Failed:        true,
				ExecutionTime: 1000,
				ScenarioCount: 1,
				ProtoSpec: &gauge_messages.ProtoSpec{
					SpecHeading: "Parity Spec",
					FileName:    "specs/parity.spec",
					Items: []*gauge_messages.ProtoItem{{
						ItemType: gauge_messages.ProtoItem_Scenario,
						Scenario: &gauge_messages.ProtoScenario{
							ScenarioHeading: "Has steps",
							ExecutionStatus: gauge_messages.ExecutionStatus_FAILED,
							ExecutionTime:   800,
							ScenarioItems: []*gauge_messages.ProtoItem{{
								ItemType: gauge_messages.ProtoItem_Step,
								Step: &gauge_messages.ProtoStep{
									ActualText: "Say hello",
									ParsedText: "Say hello",
									Fragments: []*gauge_messages.Fragment{
										{FragmentType: gauge_messages.Fragment_Text, Text: "Say "},
										{FragmentType: gauge_messages.Fragment_Parameter, Parameter: &gauge_messages.Parameter{
											ParameterType: gauge_messages.Parameter_Static,
											Value:         "hello",
										}},
									},
									StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
										ExecutionResult: &gauge_messages.ProtoExecutionResult{
											Failed:        true,
											ErrorMessage:  "boom",
											ExecutionTime: 400,
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
	generated, err := (&report.FinalWriter{}).Write(dir, report.FromSuite(suite.SuiteResult), suite)
	if err != nil {
		t.Fatal(err)
	}
	html, err := os.ReadFile(generated.IndexPath)
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	if !strings.Contains(body, `<div class="label">步骤</div>`) {
		t.Fatal("static header missing Steps stat card")
	}
	if !strings.Contains(body, `class="frag static"`) {
		t.Fatal("static HTML missing fragment span for step parameters")
	}
	if !strings.Contains(body, ".frag.static") {
		t.Fatal("embedded CSS missing .frag.static")
	}
	if !strings.Contains(body, "--pass-row:") {
		t.Fatal("embedded CSS missing row tint tokens")
	}
}
