package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

var historyMu sync.Mutex

const (
	historyFileName    = "history.json"
	historyJSFile      = "history-live.js"
	archivesFolderName = "archives"
)

type HistoryFile struct {
	FormatVersion int            `json:"formatVersion"`
	Runs          []HistoryEntry `json:"runs"`
}

type HistoryEntry struct {
	ID           string              `json:"id"`
	Href         string              `json:"href"`
	RelDir       string              `json:"relDir"`
	ProjectName  string              `json:"projectName"`
	Timestamp    string              `json:"timestamp"`
	TimestampISO string              `json:"timestampISO,omitempty"`
	Duration     string              `json:"duration"`
	Verdict      string              `json:"verdict"`
	Failed       bool                `json:"failed"`
	Summary      report.ReportSummary `json:"summary"`
	Current      bool                `json:"current,omitempty"`
}

func recordCompletedRun(runDir string, r *report.Report) error {
	historyMu.Lock()
	defer historyMu.Unlock()
	if runDir == "" || r == nil {
		return nil
	}
	root, ok := historyRootFor(runDir)
	if !ok {
		return nil
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("create history root: %w", err)
	}
	absRun, err := filepath.Abs(runDir)
	if err != nil {
		return fmt.Errorf("resolve run dir: %w", err)
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve history root: %w", err)
	}

	entry := historyEntryFromReport(r)
	rel, err := filepath.Rel(absRoot, absRun)
	if err != nil {
		rel = ""
	}
	rel = filepath.ToSlash(rel)
	if strings.Contains(rel, "..") {
		return nil
	}

	if rel == "." || rel == "" {
		stamp := strings.TrimSuffix(report.UhilReportFileName(r), report.UhilReportExt)
		id := uniqueDirName(filepath.Join(absRoot, archivesFolderName), stamp)
		dest := filepath.Join(absRoot, archivesFolderName, id)
		if err := copyRunSnapshot(absRun, dest); err != nil {
			return err
		}
		entry.ID = id
		entry.RelDir = archivesFolderName + "/" + id
		entry.Href = entry.RelDir + "/" + report.IndexFile
	} else {
		base := filepath.Base(absRun)
		entry.ID = base
		entry.RelDir = rel
		entry.Href = rel + "/" + report.IndexFile
	}

	hist, err := loadHistoryFile(absRoot)
	if err != nil {
		return err
	}
	hist.Runs = upsertHistory(hist.Runs, entry)
	if err := writeHistoryFile(absRoot, hist); err != nil {
		return err
	}
	if absRun != absRoot {
		if err := report.WriteAssets(absRoot); err != nil {
			return err
		}
		snap := &report.LiveSnapshot{Rev: time.Now().UnixMilli(), Running: false, Report: r}
		html, err := report.RenderSnapshotHTML(snap)
		if err != nil {
			return err
		}
		if err := report.AtomicWriteFile(filepath.Join(absRoot, report.IndexFile), html); err != nil {
			return fmt.Errorf("write hub index.html: %w", err)
		}
	}
	return nil
}

func historyRootFor(runDir string) (string, bool) {
	abs, err := filepath.Abs(runDir)
	if err != nil {
		return "", false
	}
	cur := abs
	for i := 0; i < 5; i++ {
		if filepath.Base(cur) == report.FolderName {
			return cur, true
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			break
		}
		cur = parent
	}
	return "", false
}

func uniqueDirName(parent, stamp string) string {
	candidate := stamp
	dest := filepath.Join(parent, candidate)
	for i := 1; report.DirExists(dest); i++ {
		candidate = fmt.Sprintf("%s-%d", stamp, i)
		dest = filepath.Join(parent, candidate)
	}
	return candidate
}

func historyEntryFromReport(r *report.Report) HistoryEntry {
	return HistoryEntry{
		ProjectName:  r.ProjectName,
		Timestamp:    r.Timestamp,
		TimestampISO: r.TimestampISO,
		Duration:     r.Duration,
		Verdict:      r.Verdict,
		Failed:       r.Failed,
		Summary:      r.Summary,
	}
}

func upsertHistory(runs []HistoryEntry, entry HistoryEntry) []HistoryEntry {
	out := make([]HistoryEntry, 0, len(runs)+1)
	out = append(out, entry)
	for _, r := range runs {
		if r.ID == entry.ID || (r.RelDir != "" && r.RelDir == entry.RelDir) {
			continue
		}
		out = append(out, r)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return historyTime(out[i]) > historyTime(out[j])
	})
	return out
}

func historyTime(e HistoryEntry) int64 {
	if e.TimestampISO != "" {
		if t, err := time.Parse(time.RFC3339Nano, e.TimestampISO); err == nil {
			return t.UnixMilli()
		}
		if t, err := time.Parse(time.RFC3339, e.TimestampISO); err == nil {
			return t.UnixMilli()
		}
	}
	if t, err := time.Parse("2006-01-02 15:04:05", e.Timestamp); err == nil {
		return t.UnixMilli()
	}
	return 0
}

func loadHistoryFile(root string) (*HistoryFile, error) {
	path := filepath.Join(root, historyFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &HistoryFile{}, nil
		}
		return nil, fmt.Errorf("read %s: %w", historyFileName, err)
	}
	var hist HistoryFile
	if err := json.Unmarshal(data, &hist); err != nil {
		return nil, fmt.Errorf("parse %s: %w", historyFileName, err)
	}
	return &hist, nil
}

func writeHistoryFile(root string, hist *HistoryFile) error {
	if hist == nil {
		hist = &HistoryFile{}
	}
	if hist.FormatVersion == 0 {
		hist.FormatVersion = report.FormatVersion
	}
	var buf strings.Builder
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(true)
	enc.SetIndent("", "  ")
	if err := enc.Encode(hist); err != nil {
		return fmt.Errorf("encode history: %w", err)
	}
	data := []byte(strings.TrimSpace(buf.String()) + "\n")
	if err := report.AtomicWriteFile(filepath.Join(root, historyFileName), data); err != nil {
		return err
	}
	js := append([]byte("window.__GAUGE_HISTORY__="), bytesTrim(data)...)
	js = append(js, ';')
	return report.AtomicWriteFile(filepath.Join(root, historyJSFile), js)
}

func bytesTrim(data []byte) []byte {
	return []byte(strings.TrimSpace(string(data)))
}

func copyRunSnapshot(src, dest string) error {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return fmt.Errorf("create archive dir: %w", err)
	}
	names := []string{report.IndexFile, report.LiveReportJSONFile, report.LiveReportJSFile}
	for _, name := range names {
		from := filepath.Join(src, name)
		to := filepath.Join(dest, name)
		if err := copyFileIfExists(from, to); err != nil {
			return err
		}
	}
	if matches, err := filepath.Glob(filepath.Join(src, "*"+report.UhilReportExt)); err == nil {
		for _, from := range matches {
			if err := copyFileIfExists(from, filepath.Join(dest, filepath.Base(from))); err != nil {
				return err
			}
		}
	}
	imgSrc := filepath.Join(src, "images")
	if report.DirExists(imgSrc) {
		if err := copyDir(imgSrc, filepath.Join(dest, "images")); err != nil {
			return err
		}
	}
	return nil
}

func copyFileIfExists(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(dest)
		return err
	}
	return out.Close()
}

func copyDir(src, dest string) error {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		from := filepath.Join(src, e.Name())
		to := filepath.Join(dest, e.Name())
		if e.IsDir() {
			if err := copyDir(from, to); err != nil {
				return err
			}
			continue
		}
		if err := copyFileIfExists(from, to); err != nil {
			return err
		}
	}
	return nil
}

func reservedHistoryName(id string) bool {
	switch id {
	case "", ".", "..", archivesFolderName, "assets", "images",
		report.IndexFile, report.ViewerFile, report.ManageIndexFile, historyFileName, historyJSFile, report.LiveReportJSONFile, report.LiveReportJSFile:
		return true
	default:
		return strings.ContainsAny(id, `/\`) || strings.HasSuffix(id, report.UhilReportExt)
	}
}

func isHistoryRunDir(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return false
	}
	return fileExists(filepath.Join(path, report.IndexFile)) || fileExists(filepath.Join(path, report.LiveReportJSONFile))
}

func deleteHistoryRun(root, id string) error {
	historyMu.Lock()
	defer historyMu.Unlock()
	id = filepath.Base(strings.TrimSpace(id))
	if reservedHistoryName(id) {
		return fmt.Errorf("invalid history id")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	candidates := []string{
		filepath.Join(absRoot, archivesFolderName, id),
		filepath.Join(absRoot, id),
	}
	var removed string
	for _, path := range candidates {
		abs, err := filepath.Abs(path)
		if err != nil {
			continue
		}
		if abs == absRoot || !strings.HasPrefix(abs+string(os.PathSeparator), absRoot+string(os.PathSeparator)) {
			continue
		}
		if !isHistoryRunDir(abs) {
			continue
		}
		if err := os.RemoveAll(abs); err != nil {
			return fmt.Errorf("delete %s: %w", id, err)
		}
		removed = abs
		break
	}
	if removed == "" {
		return fmt.Errorf("history run %s not found", id)
	}
	hist, err := loadHistoryFile(absRoot)
	if err != nil {
		return err
	}
	kept := hist.Runs[:0]
	for _, r := range hist.Runs {
		if r.ID == id {
			continue
		}
		kept = append(kept, r)
	}
	hist.Runs = kept
	return writeHistoryFile(absRoot, hist)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
