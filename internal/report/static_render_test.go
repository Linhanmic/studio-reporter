package report

import (
	"strings"
	"testing"
)

func TestRenderReportHTMLStaticShape(t *testing.T) {
	r := &Report{
		ProjectName: "demo",
		Duration:    "00:00:01.000",
		Verdict:     VerdictFail,
		Environment: "ci",
		Timestamp:   "2026-01-01 00:00:00",
		Specs: []SpecReport{{
			ID:       "spec:a",
			Heading:  "Login",
			Verdict:  VerdictFail,
			Duration: "00:00:01.000",
			Scenarios: []ScenarioReport{{
				ID:       "scn:1",
				Heading:  "Fail path",
				Verdict:  VerdictFail,
				Duration: "00:00:01.000",
				Items: []ItemReport{
					{Kind: "step", Duration: "00:00:00.100", Step: &StepReport{ActualText: "Open", Verdict: VerdictPass, Duration: "00:00:00.100"}},
					{Kind: "step", Duration: "00:00:00.200", Step: &StepReport{ActualText: "Boom", Verdict: VerdictFail, Duration: "00:00:00.200", ErrorMessage: "nope"}},
				},
			}},
		}},
	}
	html, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	body := string(html)
	for _, want := range []string{
		`data-scope="spec"`,
		`data-scope="scenario"`,
		`data-kind="spec"`,
		`data-kind="scenario"`,
		`data-name="Login"`,
		`data-name="Fail path"`,
		`leaf-row`,
		`expand-all`,
		`fail-steps-only`,
		`copy-fail-summary`,
		`search-input`,
		`class="err">nope`,
		"summary-meta",
		"<details",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q", want)
		}
	}
	// Step/concept leaves should not carry data-name (filter only touches structural nodes).
	if strings.Contains(body, `data-kind="step" data-name=`) || strings.Contains(body, `data-kind="concept" data-name=`) {
		t.Fatal("step/concept blocks must not emit data-name")
	}
	if strings.Contains(body, `id="report-data"`) {
		t.Fatal("must not embed JSON")
	}
	// Passing step without extras should be a leaf row, not an empty details.
	if strings.Count(body, `<details class="report-block tone-pass" data-verdict="pass" data-kind="step"`) != 0 {
		t.Fatal("plain pass steps should not use empty details")
	}
}

func TestRenderReportHTMLEscapes(t *testing.T) {
	html, err := RenderReportHTML(&Report{ProjectName: "</script>xss"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(html), "</script>xss") {
		t.Fatal("unescaped")
	}
}

func TestStepHasExtras(t *testing.T) {
	if stepHasExtras(&StepReport{ActualText: "x", Verdict: VerdictPass}) {
		t.Fatal("plain step")
	}
	if !stepHasExtras(&StepReport{ErrorMessage: "e"}) {
		t.Fatal("error")
	}
	if !stepHasExtras(&StepReport{Messages: []string{"log"}}) {
		t.Fatal("messages")
	}
}
