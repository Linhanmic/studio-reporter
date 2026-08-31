package report

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func sanitizeFileName(name string) string {
	name = strings.TrimSpace(name)
	repl := strings.NewReplacer(
		"/", "-", "\\", "-", ":", ".", "*", "-", "?", "-",
		"\"", "'", "<", "(", ">", ")", "|", "-", " ", "_",
	)
	name = strings.Trim(repl.Replace(name), ". ")
	if name == "" {
		return "report"
	}
	if len(name) > 100 {
		name = name[:100]
	}
	return name
}

// UhilReportFileName is "<project>-<timestamp>.uhilreport".
func UhilReportFileName(r *Report) string {
	project := "report"
	if r != nil {
		project = sanitizeFileName(r.ProjectName)
	}
	return project + "-" + ArchiveStamp(r) + UhilReportExt
}

// ArchiveStamp formats the run timestamp for archive directory names.
func ArchiveStamp(r *Report) string {
	if r == nil {
		return time.Now().Format(TimeLayout)
	}
	stamp := strings.TrimSpace(r.Timestamp)
	if r.TimestampISO != "" {
		if t, err := time.Parse(time.RFC3339Nano, r.TimestampISO); err == nil {
			stamp = t.Local().Format(TimeLayout)
		} else if t, err := time.Parse(time.RFC3339, r.TimestampISO); err == nil {
			stamp = t.Local().Format(TimeLayout)
		}
	}
	if stamp == "" {
		stamp = time.Now().Format(TimeLayout)
	}
	return strings.NewReplacer(":", ".", " ", "_", "/", "-").Replace(stamp)
}

// ResolveDir returns the studio-report hub directory, creating it when needed.
func ResolveDir() (string, error) {
	abs, err := ReportsBaseDir()
	if err != nil {
		return "", err
	}
	current := filepath.Join(abs, FolderName)
	if err := os.MkdirAll(current, 0o755); err != nil {
		return "", fmt.Errorf("create reports dir: %w", err)
	}
	log.Printf("studio-reporter: report directory %s", current)
	return current, nil
}

// ReportsBaseDir resolves gauge_reports_dir (or default reports/).
func ReportsBaseDir() (string, error) {
	base := firstNonEmptyEnv(ReportsDirEnv)
	if base == "" {
		base = DefaultReportsDir
	}
	if !filepath.IsAbs(base) {
		if root := strings.TrimSpace(os.Getenv(GaugeProjectRootEnv)); root != "" {
			base = filepath.Join(root, base)
		}
	}
	abs, err := filepath.Abs(base)
	if err != nil {
		return "", fmt.Errorf("resolve reports dir: %w", err)
	}
	return abs, nil
}

func DirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func firstNonEmptyEnv(names ...string) string {
	for _, name := range names {
		if v, ok := os.LookupEnv(name); ok {
			if s := strings.TrimSpace(v); s != "" {
				return s
			}
		}
	}
	return ""
}

func specStableID(fileName string, fallbackIndex int) string {
	f := filepath.ToSlash(strings.TrimSpace(fileName))
	if f == "" || f == "." {
		return fmt.Sprintf("spec-%d", fallbackIndex)
	}
	return "spec:" + f
}

// StudioReportRoot is reports/<studio-report>/.
func StudioReportRoot() (string, error) {
	base, err := ReportsBaseDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, FolderName), nil
}
