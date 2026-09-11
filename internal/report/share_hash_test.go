package report

import "testing"

func TestParseFormatShareHash(t *testing.T) {
	cases := []struct {
		in   string
		want ShareHash
	}{
		{"", ShareHash{Focus: "overview", Spec: "all", Scenario: "all"}},
		{"overview", ShareHash{Focus: "overview", Spec: "all", Scenario: "all"}},
		{"fail-steps", ShareHash{Focus: "overview", Spec: "all", Scenario: "all", FailSteps: true}},
		{"#overview?q=login&scenario=fail&failSteps=1", ShareHash{Focus: "overview", Query: "login", Spec: "all", Scenario: "fail", FailSteps: true}},
		{"scn:abc?spec=fail&scenario=pass", ShareHash{Focus: "scn:abc", Spec: "fail", Scenario: "pass"}},
		{"overview?q=a+b&fail-steps=true", ShareHash{Focus: "overview", Query: "a b", Spec: "all", Scenario: "all", FailSteps: true}},
		// Case / alias parity with Desktop share-hash.js + static_report.js
		{"overview?failSteps=TRUE", ShareHash{Focus: "overview", Spec: "all", Scenario: "all", FailSteps: true}},
		{"overview?failsteps=1", ShareHash{Focus: "overview", Spec: "all", Scenario: "all", FailSteps: true}},
		{"overview?fail_steps=Yes", ShareHash{Focus: "overview", Spec: "all", Scenario: "all", FailSteps: true}},
		{"overview?failSteps=FALSE", ShareHash{Focus: "overview", Spec: "all", Scenario: "all", FailSteps: false}},
		{"fail-steps&failSteps=0", ShareHash{Focus: "overview", Spec: "all", Scenario: "all", FailSteps: false}},
	}
	for _, tc := range cases {
		got := ParseShareHash(tc.in)
		if got != tc.want {
			t.Fatalf("ParseShareHash(%q)=%+v want %+v", tc.in, got, tc.want)
		}
	}

	formatted := FormatShareHash(ShareHash{Focus: "overview", Query: "login", Scenario: "fail", FailSteps: true})
	if formatted != "overview?failSteps=1&q=login&scenario=fail" && formatted != "overview?q=login&scenario=fail&failSteps=1" {
		// url.Values.Encode sorts by key: failSteps, q, scenario
		if formatted != "overview?failSteps=1&q=login&scenario=fail" {
			t.Fatalf("FormatShareHash got %q", formatted)
		}
	}
	round := ParseShareHash(formatted)
	if round.Query != "login" || round.Scenario != "fail" || !round.FailSteps || round.Focus != "overview" {
		t.Fatalf("round-trip %+v", round)
	}

	legacy := FormatShareHash(ParseShareHash("fail-steps"))
	if legacy != "overview?failSteps=1" {
		t.Fatalf("legacy format %q", legacy)
	}
}
