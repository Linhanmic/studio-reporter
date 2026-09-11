package report

import (
	"strings"
	"testing"
)

func TestNormalizeFailReason(t *testing.T) {
	got := normalizeFailReason("  boom   \n stack")
	if got != "boom" {
		t.Fatalf("got %q", got)
	}
	long := strings.Repeat("x", 300)
	got = normalizeFailReason(long)
	if !strings.HasSuffix(got, "…") || len([]rune(got)) > 241 {
		t.Fatalf("expected truncated reason, got len=%d %q", len(got), got[:20])
	}
}

func TestAggregateFailReasonsGroupsDuplicates(t *testing.T) {
	r := &Report{
		Verdict: VerdictFail,
		Specs: []SpecReport{{
			ID:      "spec:a",
			Heading: "Auth",
			Verdict: VerdictFail,
			Scenarios: []ScenarioReport{
				{
					ID: "scn:1", Heading: "Login A", Verdict: VerdictFail,
					Items: []ItemReport{{Kind: "step", Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "invalid credentials\ntrace"}}},
				},
				{
					ID: "scn:2", Heading: "Login B", Verdict: VerdictFail,
					Items: []ItemReport{{Kind: "step", Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "invalid credentials"}}},
				},
				{
					ID: "scn:3", Heading: "Pay", Verdict: VerdictFail,
					Items: []ItemReport{{Kind: "step", Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "card declined"}}},
				},
				{
					ID: "scn:ok", Heading: "OK", Verdict: VerdictPass,
					Items: []ItemReport{{Kind: "step", Step: &StepReport{Verdict: VerdictPass}}},
				},
			},
		}},
	}
	groups := AggregateFailReasons(r)
	if len(groups) != 2 {
		t.Fatalf("want 2 groups, got %+v", groups)
	}
	if groups[0].Reason != "invalid credentials" || groups[0].Count != 2 {
		t.Fatalf("first group: %+v", groups[0])
	}
	if groups[1].Reason != "card declined" || groups[1].Count != 1 {
		t.Fatalf("second group: %+v", groups[1])
	}
}

func TestAggregateFailReasonsEmptyPassReport(t *testing.T) {
	r := &Report{Verdict: VerdictPass, Specs: []SpecReport{{
		ID: "s", Heading: "S", Verdict: VerdictPass,
		Scenarios: []ScenarioReport{{ID: "c", Heading: "C", Verdict: VerdictPass}},
	}}}
	if got := AggregateFailReasons(r); len(got) != 0 {
		t.Fatalf("expected empty, got %+v", got)
	}
}

func TestAggregateFailReasonsHookAndConcept(t *testing.T) {
	r := &Report{
		Verdict:        VerdictFail,
		PreHookFailure: &HookFailure{HookName: "before suite", ErrorMessage: "env missing"},
		Specs: []SpecReport{{
			ID: "spec:x", Heading: "X", Verdict: VerdictFail,
			Scenarios: []ScenarioReport{{
				ID: "scn:c", Heading: "Concept fail", Verdict: VerdictFail,
				Items: []ItemReport{{
					Kind: "concept",
					Concept: &ConceptReport{
						Step: &StepReport{ActualText: "outer", Verdict: VerdictPass},
						Items: []ItemReport{{
							Kind: "step",
							Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "nested boom"},
						}},
					},
				}},
			}},
		}},
	}
	groups := AggregateFailReasons(r)
	if len(groups) < 2 {
		t.Fatalf("want suite hook + scenario, got %+v", groups)
	}
	foundHook, foundNested := false, false
	for _, g := range groups {
		if strings.Contains(g.Reason, "env missing") {
			foundHook = true
		}
		if g.Reason == "nested boom" {
			foundNested = true
			if g.Refs[0].ScnID != "scn:c" {
				t.Fatalf("ref %+v", g.Refs[0])
			}
		}
	}
	if !foundHook || !foundNested {
		t.Fatalf("missing groups: %+v", groups)
	}
}
