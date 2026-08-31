package main

import (
	"flag"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

const skipBrowserEnv = "GAUGE_STUDIO_SKIP_BROWSER"
const openBrowserEnv = "GAUGE_STUDIO_OPEN_BROWSER"

var openReportOnce sync.Once

func shouldSkipBrowser() bool {
	if flag.Lookup("test.v") != nil {
		return true
	}
	if skipBrowserEnvSet() {
		return true
	}
	return !openBrowserEnvSet()
}

func skipBrowserEnvSet() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(skipBrowserEnv)))
	return v == "true" || v == "1" || v == "yes"
}

func openBrowserEnvSet() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(openBrowserEnv)))
	return v == "true" || v == "1" || v == "yes"
}

func openReportPage(indexPath string) {
	if indexPath == "" || report.ShouldSkipReport() || shouldSkipBrowser() {
		return
	}
	abs, err := filepath.Abs(indexPath)
	if err != nil {
		log.Printf("studio-reporter: open report: %v", err)
		return
	}
	openReportOnce.Do(func() {
		if err := openInBrowser(abs); err != nil {
			log.Printf("studio-reporter: open report page: %v", err)
			return
		}
		log.Printf("studio-reporter: opened report page %s", abs)
	})
}

func openInBrowser(path string) error {
	cmd := browserCommand(path)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}

func browserCommand(path string) *exec.Cmd {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", path)
	case "darwin":
		return exec.Command("open", path)
	default:
		return exec.Command("xdg-open", path)
	}
}
