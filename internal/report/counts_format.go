package report

import "fmt"

// FormatCountsRatio renders "passed/total" for header stat cards.
func FormatCountsRatio(c Counts) string {
	return fmt.Sprintf("%d/%d", c.Passed, c.Total)
}

// FormatCountsSub renders the pass/fail/skip subtitle used by stat cards.
func FormatCountsSub(c Counts) string {
	return fmt.Sprintf("通过 %d · 失败 %d · 跳过 %d", c.Passed, c.Failed, c.Skipped)
}

// AddVerdict increments counters for a single node verdict.
func (c *Counts) AddVerdict(verdict string) {
	if c == nil {
		return
	}
	c.Total++
	switch verdict {
	case VerdictPass:
		c.Passed++
	case VerdictFail:
		c.Failed++
	case VerdictSkip:
		c.Skipped++
	}
}
