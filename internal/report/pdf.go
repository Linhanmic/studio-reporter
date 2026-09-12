package report

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// WritePDF renders the report's index.html to a structured PDF via a headless
// Chromium print pipeline (text + vector layout + linked images — not a
// screenshot collage). Prefer the interactive HTML for CANoe-like navigation;
// PDF is the printable/shareable twin of that document.
//
// When wantPDFFailSteps() is true (env GAUGE_STUDIO_PDF_FAIL_STEPS), the file
// URL includes #fail-steps so the static report JS enables fail-steps-only
// before Chromium prints — matching interactive「所见即所打」.
func WritePDF(indexHTML, pdfPath string) error {
	return writePDF(indexHTML, pdfPath, wantPDFFailSteps())
}

func writePDF(indexHTML, pdfPath string, failStepsOnly bool) error {
	if indexHTML == "" {
		return fmt.Errorf("pdf: empty index path")
	}
	absHTML, err := filepath.Abs(indexHTML)
	if err != nil {
		return err
	}
	if _, err := os.Stat(absHTML); err != nil {
		return fmt.Errorf("pdf: read index: %w", err)
	}
	if pdfPath == "" {
		pdfPath = filepath.Join(filepath.Dir(absHTML), "report.pdf")
	}
	absPDF, err := filepath.Abs(pdfPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absPDF), 0o755); err != nil {
		return err
	}
	chrome, err := findChrome()
	if err != nil {
		return err
	}
	fileURL := pathToFileURL(absHTML)
	if failStepsOnly {
		fileURL = withURLFragment(fileURL, "fail-steps")
	}
	// virtual-time-budget lets inline report JS apply #fail-steps / print banner
	// before Chromium snapshots the print layout.
	cmd := exec.Command(chrome,
		"--headless=new",
		"--disable-gpu",
		"--no-sandbox",
		"--disable-setuid-sandbox",
		"--disable-dev-shm-usage",
		"--virtual-time-budget=5000",
		"--no-pdf-header-footer",
		"--print-to-pdf="+absPDF,
		fileURL,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pdf: chrome print failed: %w\n%s", err, out)
	}
	if st, err := os.Stat(absPDF); err != nil || st.Size() == 0 {
		return fmt.Errorf("pdf: output missing or empty at %s", absPDF)
	}
	return nil
}

func wantPDFFailSteps() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(WritePDFFailStepsEnv)))
	return v == "1" || v == "true" || v == "yes"
}

func withURLFragment(u, frag string) string {
	frag = strings.TrimPrefix(strings.TrimSpace(frag), "#")
	if frag == "" {
		return u
	}
	if i := strings.IndexByte(u, '#'); i >= 0 {
		u = u[:i]
	}
	return u + "#" + frag
}

func findChrome() (string, error) {
	candidates := []string{
		os.Getenv("CHROME_PATH"),
		os.Getenv("GOOGLE_CHROME_SHIM"),
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser",
		"chrome",
	}
	if runtime.GOOS == "darwin" {
		candidates = append(candidates,
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
		)
	}
	if runtime.GOOS == "windows" {
		candidates = append(candidates,
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		)
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if path, err := exec.LookPath(c); err == nil {
			return path, nil
		}
		if _, err := os.Stat(c); err == nil {
			return c, nil
		}
	}
	return "", fmt.Errorf("pdf: no Chrome/Chromium found (set CHROME_PATH); interactive HTML remains the primary report")
}

func pathToFileURL(abs string) string {
	abs = filepath.ToSlash(abs)
	if runtime.GOOS == "windows" {
		return "file:///" + abs
	}
	return "file://" + abs
}
