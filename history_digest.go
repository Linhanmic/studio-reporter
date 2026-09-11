package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

// FailDigestGroup is one aggregated topFailReason across hub history runs.
type FailDigestGroup struct {
	Reason        string   `json:"reason"`
	Count         int      `json:"count"`
	RunIDs        []string `json:"runIds"`
	LastRunID     string   `json:"lastRunId"`
	LastRunFocus  string   `json:"lastRunFocus,omitempty"`
	LastTimestamp string   `json:"lastTimestamp"`
}

const historyFailDigestFormatVersion = 1

// HistoryFailDigest aggregates failed history entries by normalized reason.
type HistoryFailDigest struct {
	RunCount          int               `json:"runCount"`
	FailRunCount      int               `json:"failRunCount"`
	PassRunCount      int               `json:"passRunCount"`
	SkipRunCount      int               `json:"skipRunCount"`
	UnknownRunCount   int               `json:"unknownRunCount"`
	Groups            []FailDigestGroup `json:"groups"`
	RunsWithoutReason []string          `json:"runsWithoutReason,omitempty"`
	Format            string            `json:"format,omitempty"`
	FormatVersion     int               `json:"formatVersion"`
	GeneratedAt       string            `json:"generatedAt,omitempty"`
	HubDir            string            `json:"hubDir,omitempty"`
}

func normalizeHistoryFailReason(msg string) string {
	msg = strings.ReplaceAll(msg, "\r\n", "\n")
	msg = strings.ReplaceAll(msg, "\r", "\n")
	for _, line := range strings.Split(msg, "\n") {
		line = strings.Join(strings.Fields(line), " ")
		if line == "" {
			continue
		}
		if utf8.RuneCountInString(line) > 240 {
			runes := []rune(line)
			return string(runes[:240]) + "…"
		}
		return line
	}
	return ""
}

func buildHistoryFailDigest(runs []HistoryEntry, limit int) HistoryFailDigest {
	if limit <= 0 {
		limit = 15
	}
	if limit > 50 {
		limit = 50
	}
	type agg struct {
		reason    string
		count     int
		ids       []string
		lastID    string
		lastFocus string
		lastTS    string
	}
	byReason := map[string]*agg{}
	out := HistoryFailDigest{RunCount: len(runs), Format: "studio-reporter.historyFailDigest/v1", FormatVersion: historyFailDigestFormatVersion, GeneratedAt: time.Now().UTC().Format(time.RFC3339)}
	for _, run := range runs {
		verdict := strings.ToLower(strings.TrimSpace(run.Verdict))
		failed := run.Failed || verdict == "fail"
		switch {
		case failed:
			out.FailRunCount++
		case verdict == "pass":
			out.PassRunCount++
		case verdict == "skip":
			out.SkipRunCount++
		default:
			out.UnknownRunCount++
		}
		if !failed {
			continue
		}
		reason := normalizeHistoryFailReason(run.TopFailReason)
		if reason == "" {
			if run.ID != "" {
				out.RunsWithoutReason = append(out.RunsWithoutReason, run.ID)
			}
			continue
		}
		g := byReason[reason]
		if g == nil {
			g = &agg{reason: reason}
			byReason[reason] = g
		}
		g.count++
		if run.ID != "" {
			g.ids = append(g.ids, run.ID)
		}
		ts := run.TimestampISO
		if ts == "" {
			ts = run.Timestamp
		}
		if g.lastID == "" || ts >= g.lastTS {
			g.lastID = run.ID
			g.lastFocus = strings.TrimSpace(run.TopFailFocus)
			g.lastTS = ts
		}
	}
	groups := make([]FailDigestGroup, 0, len(byReason))
	for _, g := range byReason {
		groups = append(groups, FailDigestGroup{
			Reason:        g.reason,
			Count:         g.count,
			RunIDs:        g.ids,
			LastRunID:     g.lastID,
			LastRunFocus:  g.lastFocus,
			LastTimestamp: g.lastTS,
		})
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Count != groups[j].Count {
			return groups[i].Count > groups[j].Count
		}
		return groups[i].Reason < groups[j].Reason
	})
	if len(groups) > limit {
		groups = groups[:limit]
	}
	out.Groups = groups
	return out
}

func openDeepLinkForRun(runID, hub string) string {
	return openDeepLink(runID, hub, "", true)
}

// openDeepLink builds studio-reporter://open?run=&hub=&focus=&failSteps=.
// Query encoding percent-encodes '/' in focus (%2F); share-hash fragments keep '/'
// literal so path-style DOM ids (spec:specs/auth/login.spec-scn-0) round-trip.
func openDeepLink(runID, hub, focus string, failSteps bool) string {
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return ""
	}
	q := url.Values{}
	q.Set("run", runID)
	if hub = strings.TrimSpace(hub); hub != "" {
		q.Set("hub", hub)
	}
	if focus = strings.TrimSpace(focus); focus != "" {
		q.Set("focus", focus)
	}
	if failSteps {
		q.Set("failSteps", "1")
	}
	return "studio-reporter://open?" + q.Encode()
}

func formatHistoryFailDigestMarkdown(d HistoryFailDigest, title string) string {
	if title == "" {
		title = "历史失败摘要"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "## %s\n", title)
	if d.HubDir != "" {
		fmt.Fprintf(&b, "- Hub: `%s`\n", d.HubDir)
	}
	fmt.Fprintf(&b, "- 窗口：%d 次运行（失败 %d / 通过 %d / 跳过 %d）\n", d.RunCount, d.FailRunCount, d.PassRunCount, d.SkipRunCount)
	if d.FormatVersion > 0 {
		fmt.Fprintf(&b, "- formatVersion: %d\n", d.FormatVersion)
	}
	if d.GeneratedAt != "" {
		fmt.Fprintf(&b, "- generatedAt: `%s`\n", d.GeneratedAt)
	}
	b.WriteByte('\n')
	if len(d.Groups) == 0 {
		if d.FailRunCount > 0 {
			b.WriteString("_失败运行未写入 topFailReason。_\n")
		} else {
			b.WriteString("_窗口内无失败运行。_\n")
		}
		return b.String()
	}
	withLinks := strings.TrimSpace(d.HubDir) != ""
	if withLinks {
		b.WriteString("| # | 次数 | 最近运行 | 打开 | 失败原因 |\n")
		b.WriteString("|---|------|----------|------|----------|\n")
	} else {
		b.WriteString("| # | 次数 | 最近运行 | 失败原因 |\n")
		b.WriteString("|---|------|----------|----------|\n")
	}
	for i, g := range d.Groups {
		reason := strings.ReplaceAll(g.Reason, "|", "\\|")
		last := g.LastRunID
		if last == "" {
			last = "—"
		}
		if withLinks {
			linkCell := "—"
			if link := openDeepLink(g.LastRunID, d.HubDir, g.LastRunFocus, true); link != "" {
				linkCell = fmt.Sprintf("[open](%s)", link)
			}
			fmt.Fprintf(&b, "| %d | %d | `%s` | %s | %s |\n", i+1, g.Count, last, linkCell, reason)
		} else {
			fmt.Fprintf(&b, "| %d | %d | `%s` | %s |\n", i+1, g.Count, last, reason)
		}
	}
	if len(d.RunsWithoutReason) > 0 {
		fmt.Fprintf(&b, "\n_另有 %d 次失败无原因文本。_\n", len(d.RunsWithoutReason))
	}
	if withLinks {
		b.WriteString("\n### 最近失败打开深链\n```\n")
		for _, g := range d.Groups {
			if link := openDeepLink(g.LastRunID, d.HubDir, g.LastRunFocus, true); link != "" {
				b.WriteString(link)
				b.WriteByte('\n')
			}
		}
		b.WriteString("```\n")
	}
	return b.String()
}

func historyFailDigestOpenLinks(d HistoryFailDigest, mode string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, g := range d.Groups {
		ids := g.RunIDs
		if mode != "all" {
			if g.LastRunID == "" {
				continue
			}
			ids = []string{g.LastRunID}
		}
		for _, id := range ids {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			focus := ""
			if id == g.LastRunID {
				focus = g.LastRunFocus
			}
			if link := openDeepLink(id, d.HubDir, focus, true); link != "" {
				out = append(out, link)
			}
		}
	}
	return out
}

func loadHistoryFailDigestFromHub(hubDir string, limit int) (HistoryFailDigest, error) {
	abs, err := filepath.Abs(hubDir)
	if err != nil {
		return HistoryFailDigest{}, err
	}
	hist, err := loadHistoryFile(abs)
	if err != nil {
		return HistoryFailDigest{}, err
	}
	d := buildHistoryFailDigest(hist.Runs, limit)
	d.HubDir = abs
	return d, nil
}

func writeHistoryFailDigest(w io.Writer, d HistoryFailDigest, format string) error {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "json":
		payload := map[string]any{
			"format":            d.Format,
			"formatVersion":     d.FormatVersion,
			"generatedAt":       d.GeneratedAt,
			"hubDir":            d.HubDir,
			"runCount":          d.RunCount,
			"failRunCount":      d.FailRunCount,
			"passRunCount":      d.PassRunCount,
			"skipRunCount":      d.SkipRunCount,
			"unknownRunCount":   d.UnknownRunCount,
			"groups":            d.Groups,
			"runsWithoutReason": d.RunsWithoutReason,
		}
		if strings.TrimSpace(d.HubDir) != "" && len(d.Groups) > 0 {
			payload["openLinksLatest"] = historyFailDigestOpenLinks(d, "latest")
			payload["openLinksAll"] = historyFailDigestOpenLinks(d, "all")
		}
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(payload)
	default:
		_, err := io.WriteString(w, formatHistoryFailDigestMarkdown(d, "历史失败摘要"))
		return err
	}
}

func writeHistoryFailDigestFile(path string, d HistoryFailDigest, format string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return err
	}
	f, err := os.Create(abs)
	if err != nil {
		return err
	}
	defer f.Close()
	return writeHistoryFailDigest(f, d, format)
}

// writeHistoryFailDigestSidecars writes fail-digest.md + fail-digest.json beside the hub history.
func writeHistoryFailDigestSidecars(hubDir string, d HistoryFailDigest) error {
	abs, err := filepath.Abs(hubDir)
	if err != nil {
		return err
	}
	if err := writeHistoryFailDigestFile(filepath.Join(abs, "fail-digest.md"), d, "markdown"); err != nil {
		return err
	}
	return writeHistoryFailDigestFile(filepath.Join(abs, "fail-digest.json"), d, "json")
}

func newDigestFlagSet(errOut io.Writer) *flag.FlagSet {
	fs := flag.NewFlagSet("digest", flag.ContinueOnError)
	fs.SetOutput(errOut)
	fs.String("dir", "", "report hub directory containing history.json")
	fs.Int("limit", 15, "max distinct fail reasons to include")
	fs.String("format", "markdown", "output format: markdown|json")
	fs.Bool("write", false, "also write fail-digest.md and fail-digest.json into the hub")
	fs.String("out", "", "optional output file path (in addition to stdout)")
	fs.Bool("check", false, "validate hub fail-digest.json freshness (formatVersion + generatedAt); exit non-zero on failure")
	fs.String("max-age", "24h", "with --check: maximum age of generatedAt (Go duration, e.g. 1h, 24h, 168h)")
	fs.Int("require-version", historyFailDigestFormatVersion, "with --check: required formatVersion")
	fs.String("file", "", "with --check: path to fail-digest.json (default: <dir>/fail-digest.json)")
	return fs
}

// failDigestSidecarMeta is the CI-facing subset of fail-digest.json.
type failDigestSidecarMeta struct {
	Format        string `json:"format"`
	FormatVersion int    `json:"formatVersion"`
	GeneratedAt   string `json:"generatedAt"`
}

// checkFailDigestSidecar validates formatVersion and generatedAt freshness for CI gates.
func checkFailDigestSidecar(jsonPath string, requireVersion int, maxAge time.Duration, now time.Time) error {
	raw, err := os.ReadFile(jsonPath)
	if err != nil {
		return fmt.Errorf("read %s: %w", jsonPath, err)
	}
	var meta failDigestSidecarMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return fmt.Errorf("parse %s: %w", jsonPath, err)
	}
	if requireVersion > 0 && meta.FormatVersion != requireVersion {
		return fmt.Errorf("%s: formatVersion=%d want %d", jsonPath, meta.FormatVersion, requireVersion)
	}
	if meta.FormatVersion <= 0 {
		return fmt.Errorf("%s: missing or invalid formatVersion", jsonPath)
	}
	at := strings.TrimSpace(meta.GeneratedAt)
	if at == "" {
		return fmt.Errorf("%s: missing generatedAt", jsonPath)
	}
	ts, err := time.Parse(time.RFC3339, at)
	if err != nil {
		ts, err = time.Parse(time.RFC3339Nano, at)
	}
	if err != nil {
		return fmt.Errorf("%s: generatedAt %q: %w", jsonPath, at, err)
	}
	if maxAge > 0 {
		age := now.UTC().Sub(ts.UTC())
		if age < 0 {
			age = -age // clock skew: treat future stamps as age=delta
		}
		if age > maxAge {
			return fmt.Errorf("%s: generatedAt %s is older than max-age %s (age %s)", jsonPath, ts.UTC().Format(time.RFC3339), maxAge, age.Round(time.Second))
		}
	}
	return nil
}
