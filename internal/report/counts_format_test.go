package report

import "testing"

func TestFormatCountsRatioAndSub(t *testing.T) {
	c := Counts{Total: 10, Passed: 7, Failed: 2, Skipped: 1}
	if got := FormatCountsRatio(c); got != "7/10" {
		t.Fatalf("ratio %q", got)
	}
	if got := FormatCountsSub(c); got != "通过 7 · 失败 2 · 跳过 1" {
		t.Fatalf("sub %q", got)
	}
}

func TestCountsAddVerdict(t *testing.T) {
	var c Counts
	c.AddVerdict(VerdictPass)
	c.AddVerdict(VerdictFail)
	c.AddVerdict(VerdictSkip)
	c.AddVerdict("other")
	if c.Total != 4 || c.Passed != 1 || c.Failed != 1 || c.Skipped != 1 {
		t.Fatalf("%+v", c)
	}
}
