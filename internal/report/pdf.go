package report

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// WritePDF renders the report's index.html to a structured PDF via a headless
// Chromium print pipeline (text + vector layout + linked images — not a
// screenshot collage). Prefer the interactive HTML for CANoe-like navigation;
// PDF is the printable/shareable twin of that document.
func WritePDF(indexHTML, pdfPath string) error {
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
	cmd := exec.Command(chrome,
		"--headless=new",
		"--disable-gpu",
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
