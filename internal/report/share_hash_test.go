package report

import (
	"strings"
	"testing"
)

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

func TestShareHashUnicodeAndSpacesRoundTrip(t *testing.T) {
	cases := []ShareHash{
		{Focus: "overview", Query: "登录 用例", Scenario: "fail", FailSteps: true},
		{Focus: "overview", Query: "a+b = c", FailSteps: true},
		{Focus: "scn:登录 失败", FailSteps: true},
		{Focus: "overview", Query: "emoji 🧪 test"},
		{Focus: "scn:tab\there", Query: "x y", FailSteps: true},
	}
	for _, want := range cases {
		formatted := FormatShareHash(want)
		if want.Focus != "overview" && want.Focus != "" {
			// Focus with spaces / non-ASCII must be percent-encoded in the fragment.
			if formatted == want.Focus || formatted == want.Focus+"?failSteps=1" {
				t.Fatalf("focus not encoded: %q from %+v", formatted, want)
			}
			if !strings.Contains(formatted, "%") && strings.ContainsAny(want.Focus, " \t测试失败") {
				t.Fatalf("expected percent-encoding in %q for focus %q", formatted, want.Focus)
			}
		}
		if strings.ContainsAny(want.Query, " +=") && strings.Contains(formatted, "q=") {
			if strings.Contains(formatted, "q="+want.Query) {
				t.Fatalf("query not encoded: %q", formatted)
			}
		}
		got := ParseShareHash(formatted)
		if got.Focus != want.Focus {
			t.Fatalf("focus: got %q want %q (fmt=%q)", got.Focus, want.Focus, formatted)
		}
		if got.Query != want.Query {
			t.Fatalf("query: got %q want %q (fmt=%q)", got.Query, want.Query, formatted)
		}
		if got.FailSteps != want.FailSteps {
			t.Fatalf("failSteps: got %v want %v (fmt=%q)", got.FailSteps, want.FailSteps, formatted)
		}
		if got.Scenario != normalizeShareVerdict(want.Scenario) {
			t.Fatalf("scenario: got %q want %q", got.Scenario, want.Scenario)
		}
	}

	// Encoded focus left by URL.hash must still parse back to the DOM id.
	encodedFocus := encodeShareFocus("scn:登录 失败")
	got := ParseShareHash(encodedFocus + "?failSteps=1")
	if got.Focus != "scn:登录 失败" || !got.FailSteps {
		t.Fatalf("encoded focus parse %+v", got)
	}
}

func TestShareHashSlashFocusAlignsWithDOMPathIDs(t *testing.T) {
	// convert.specStableID uses "spec:" + filepath, so real DOM ids contain '/'.
	focus := "spec:specs/auth/login.spec"
	enc := encodeShareFocus(focus)
	if strings.Contains(enc, "%2F") || strings.Contains(enc, "%2f") {
		t.Fatalf("encodeShareFocus must keep '/' literal for DOM id parity, got %q", enc)
	}
	if enc != focus {
		t.Fatalf("slash-only focus should be unchanged, got %q want %q", enc, focus)
	}

	formatted := FormatShareHash(ShareHash{Focus: focus, FailSteps: true})
	if !strings.HasPrefix(formatted, focus+"?") {
		t.Fatalf("FormatShareHash should keep literal slash focus, got %q", formatted)
	}
	if strings.Contains(formatted, "%2F") {
		t.Fatalf("formatted hash must not percent-encode '/': %q", formatted)
	}
	got := ParseShareHash(formatted)
	if got.Focus != focus || !got.FailSteps {
		t.Fatalf("round-trip %+v via %q", got, formatted)
	}

	// Legacy links that still percent-encode '/' must decode to the DOM id.
	legacy := "spec:specs%2Fauth%2Flogin.spec?failSteps=1"
	got = ParseShareHash(legacy)
	if got.Focus != focus {
		t.Fatalf("legacy %%2F focus: got %q want %q", got.Focus, focus)
	}

	scn := focus + "-scn-0"
	if encodeShareFocus(scn) != scn {
		t.Fatalf("scenario path id altered: %q", encodeShareFocus(scn))
	}
}

func TestSpecStableIDAndHTMLKeepPathSlash(t *testing.T) {
	id := specStableID("specs/auth/login.spec", 0)
	if id != "spec:specs/auth/login.spec" {
		t.Fatalf("specStableID=%q", id)
	}
	r := &Report{
		ProjectName: "slash-id",
		Verdict:     VerdictFail,
		Duration:    "00:00:01.000",
		Timestamp:   "2026-01-01 00:00:00",
		Specs: []SpecReport{{
			ID:       id,
			Heading:  "Login",
			FileName: "specs/auth/login.spec",
			Verdict:  VerdictFail,
			Duration: "00:00:01.000",
			Scenarios: []ScenarioReport{{
				ID:       id + "-scn-0",
				Heading:  "bad password",
				Verdict:  VerdictFail,
				Duration: "00:00:01.000",
			}},
		}},
	}
	htmlBytes, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	htmlStr := string(htmlBytes)
	wantAttr := `id="` + id + `"`
	if !strings.Contains(htmlStr, wantAttr) {
		t.Fatalf("HTML missing %s", wantAttr)
	}
	h := FormatShareHash(ShareHash{Focus: id})
	if strings.Contains(h, "%2F") {
		t.Fatalf("share hash encoded slash away from DOM id: %q (dom=%q)", h, id)
	}
	if ParseShareHash(h).Focus != id {
		t.Fatalf("parse focus mismatch: %q vs %q", ParseShareHash(h).Focus, id)
	}
}
