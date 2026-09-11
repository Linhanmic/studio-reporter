package report

import "testing"

func sampleReports() (base, target *Report) {
	base = &Report{
		Specs: []SpecReport{{
			ID: "spec:login.spec", Heading: "Login", FileName: "login.spec",
			Scenarios: []ScenarioReport{
				{ID: "s1", Heading: "valid user", Verdict: VerdictPass},
				{ID: "s2", Heading: "bad password", Verdict: VerdictFail, Items: []ItemReport{
					{Kind: "step", Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "invalid credentials"}},
				}},
				{ID: "s3", Heading: "locked account", Verdict: VerdictFail, Items: []ItemReport{
					{Kind: "step", Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "account locked"}},
				}},
			},
		}},
	}
	target = &Report{
		Specs: []SpecReport{{
			ID: "spec:login.spec", Heading: "Login", FileName: "login.spec",
			Scenarios: []ScenarioReport{
				{ID: "s1", Heading: "valid user", Verdict: VerdictFail, Items: []ItemReport{
					{Kind: "step", Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "timeout"}},
				}},
				{ID: "s2", Heading: "bad password", Verdict: VerdictFail, Items: []ItemReport{
					{Kind: "step", Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "wrong password"}},
				}},
				{ID: "s4", Heading: "otp required", Verdict: VerdictFail, Items: []ItemReport{
					{Kind: "step", Step: &StepReport{Verdict: VerdictFail, ErrorMessage: "otp missing"}},
				}},
			},
		}},
	}
	return base, target
}

func TestScenarioLitesFromReportAndCompare(t *testing.T) {
	base, target := sampleReports()
	bLites := ScenarioLitesFromReport(base)
	tLites := ScenarioLitesFromReport(target)
	if len(bLites) != 3 || len(tLites) != 3 {
		t.Fatalf("lite counts base=%d target=%d", len(bLites), len(tLites))
	}
	cmp := CompareScenarios(bLites, tLites)
	if cmp.BaseCount != 3 || cmp.TargetCount != 3 {
		t.Fatalf("counts %+v", cmp)
	}
	kinds := map[ScenarioDiffKind]int{}
	for _, d := range cmp.Changed {
		kinds[d.Kind]++
	}
	// valid user: pass→fail => regressed
	// bad password: fail→fail reason change => reason_changed
	// locked account: removed
	// otp required: added
	if kinds[ScenarioDiffRegressed] != 1 {
		t.Fatalf("regressed=%d want 1; changed=%+v", kinds[ScenarioDiffRegressed], cmp.Changed)
	}
	if kinds[ScenarioDiffReasonChanged] != 1 {
		t.Fatalf("reason_changed=%d want 1; changed=%+v", kinds[ScenarioDiffReasonChanged], cmp.Changed)
	}
	if kinds[ScenarioDiffRemoved] != 1 || kinds[ScenarioDiffAdded] != 1 {
		t.Fatalf("removed=%d added=%d; changed=%+v", kinds[ScenarioDiffRemoved], kinds[ScenarioDiffAdded], cmp.Changed)
	}
	if cmp.UnchangedCount != 0 {
		t.Fatalf("unchanged=%d", cmp.UnchangedCount)
	}
}

func TestInvertScenarioCompare(t *testing.T) {
	base, target := sampleReports()
	cmp := CompareScenarios(ScenarioLitesFromReport(base), ScenarioLitesFromReport(target))
	inv := InvertScenarioCompare(cmp)
	if inv.BaseCount != cmp.TargetCount || inv.TargetCount != cmp.BaseCount {
		t.Fatalf("inverted counts %+v vs %+v", inv, cmp)
	}
	kinds := map[ScenarioDiffKind]int{}
	for _, d := range inv.Changed {
		kinds[d.Kind]++
	}
	if kinds[ScenarioDiffFixed] != 1 {
		t.Fatalf("fixed=%d want 1 after invert; %+v", kinds[ScenarioDiffFixed], inv.Changed)
	}
	if kinds[ScenarioDiffAdded] != 1 || kinds[ScenarioDiffRemoved] != 1 {
		t.Fatalf("added=%d removed=%d after invert", kinds[ScenarioDiffAdded], kinds[ScenarioDiffRemoved])
	}
}

func TestScenarioKeyTableRows(t *testing.T) {
	sp := SpecReport{FileName: "t.spec"}
	a := ScenarioReport{Heading: "row", TableRowIndex: 0}
	b := ScenarioReport{Heading: "row", TableRowIndex: 1}
	if ScenarioKey(sp, a) == ScenarioKey(sp, b) {
		t.Fatal("table rows must differ in key")
	}
}
