package report

import (
	"fmt"
	"strconv"
	"strings"
)

// ParseReportDuration parses studio-reporter duration strings (HH:MM:SS.mmm) to milliseconds.
// Empty or malformed input returns 0.
func ParseReportDuration(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	parts := strings.Split(s, ":")
	if len(parts) != 3 {
		return 0
	}
	h, errH := strconv.Atoi(parts[0])
	m, errM := strconv.Atoi(parts[1])
	sec, errS := strconv.ParseFloat(parts[2], 64)
	if errH != nil || errM != nil || errS != nil || h < 0 || m < 0 || sec < 0 {
		return 0
	}
	return int64(h)*3_600_000 + int64(m)*60_000 + int64(sec*1000+0.5)
}

// HistoryRunLite is the subset of a history entry needed for comparison.
type HistoryRunLite struct {
	ID        string
	Timestamp string
	Duration  string
	Verdict   string
	Summary   ReportSummary
}

// HistoryCompare is a side-by-side summary of two archived runs.
type HistoryCompare struct {
	Base        HistoryRunLite `json:"base"`
	Target      HistoryRunLite `json:"target"`
	VerdictSame bool           `json:"verdictSame"`
	DurationMS  struct {
		Base   int64 `json:"base"`
		Target int64 `json:"target"`
		Delta  int64 `json:"delta"` // target - base
	} `json:"durationMs"`
	Specs     CountsDelta `json:"specs"`
	Scenarios CountsDelta `json:"scenarios"`
	Steps     CountsDelta `json:"steps"`
}

// CountsDelta is target − base for each count field.
type CountsDelta struct {
	Total   int `json:"total"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	Skipped int `json:"skipped"`
}

// CompareHistoryRuns returns a structured verdict/duration/count diff (target − base).
func CompareHistoryRuns(base, target HistoryRunLite) HistoryCompare {
	out := HistoryCompare{Base: base, Target: target, VerdictSame: base.Verdict == target.Verdict}
	out.DurationMS.Base = ParseReportDuration(base.Duration)
	out.DurationMS.Target = ParseReportDuration(target.Duration)
	out.DurationMS.Delta = out.DurationMS.Target - out.DurationMS.Base
	out.Specs = diffCounts(base.Summary.Specs, target.Summary.Specs)
	out.Scenarios = diffCounts(base.Summary.Scenarios, target.Summary.Scenarios)
	out.Steps = diffCounts(base.Summary.Steps, target.Summary.Steps)
	return out
}

func diffCounts(base, target Counts) CountsDelta {
	return CountsDelta{
		Total:   target.Total - base.Total,
		Passed:  target.Passed - base.Passed,
		Failed:  target.Failed - base.Failed,
		Skipped: target.Skipped - base.Skipped,
	}
}

// FormatDurationDelta renders a signed millisecond delta as "+1.234s" / "-0.500s".
func FormatDurationDelta(ms int64) string {
	sign := "+"
	if ms < 0 {
		sign = "-"
		ms = -ms
	} else if ms == 0 {
		return "±0s"
	}
	return fmt.Sprintf("%s%.3fs", sign, float64(ms)/1000)
}
