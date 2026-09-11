package report

import "testing"

func TestParseReportDuration(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"00:00:01.234", 1234},
		{"00:01:00.000", 60000},
		{"01:00:00.000", 3600000},
		{"", 0},
		{"bad", 0},
	}
	for _, tc := range cases {
		if got := ParseReportDuration(tc.in); got != tc.want {
			t.Fatalf("ParseReportDuration(%q)=%d want %d", tc.in, got, tc.want)
		}
	}
}

func TestCompareHistoryRuns(t *testing.T) {
	base := HistoryRunLite{
		ID: "a", Duration: "00:00:02.000", Verdict: "fail",
		Summary: ReportSummary{
			Specs:     Counts{Total: 5, Passed: 3, Failed: 1, Skipped: 1},
			Scenarios: Counts{Total: 7, Passed: 5, Failed: 1, Skipped: 1},
			Steps:     Counts{Total: 11, Passed: 9, Failed: 1, Skipped: 1},
		},
	}
	target := HistoryRunLite{
		ID: "b", Duration: "00:00:01.500", Verdict: "pass",
		Summary: ReportSummary{
			Specs:     Counts{Total: 5, Passed: 5, Failed: 0, Skipped: 0},
			Scenarios: Counts{Total: 7, Passed: 7, Failed: 0, Skipped: 0},
			Steps:     Counts{Total: 11, Passed: 11, Failed: 0, Skipped: 0},
		},
	}
	cmp := CompareHistoryRuns(base, target)
	if cmp.VerdictSame {
		t.Fatal("expected verdict change")
	}
	if cmp.DurationMS.Delta != -500 {
		t.Fatalf("duration delta=%d want -500", cmp.DurationMS.Delta)
	}
	if cmp.Specs.Passed != 2 || cmp.Specs.Failed != -1 {
		t.Fatalf("specs delta=%+v", cmp.Specs)
	}
	if FormatDurationDelta(cmp.DurationMS.Delta) != "-0.500s" {
		t.Fatalf("format=%q", FormatDurationDelta(cmp.DurationMS.Delta))
	}
}
