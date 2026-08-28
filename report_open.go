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
)

const skipBrowserEnv = "GAUGE_STUDIO_SKIP_BROWSER"

var openReportOnce sync.Once

func shouldSkipBrowser() bool {
	if flag.Lookup("test.v") != nil {
		return true
	}
	return skipBrowserEnvSet()
}

func skipBrowserEnvSet() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(skipBrowserEnv)))
	return v == "true" || v == "1" || v == "yes"
}

func openReportPage(indexPath string) {
	if indexPath == "" || shouldSkipReport() || shouldSkipBrowser() {
		return
	}
	abs, err := filepath.Abs(indexPath)
	if err != nil {
		log.Printf("studio-reporter: open report: %v", err)
		return
	}
	go openReportOnce.Do(func() {
		if err := openInBrowser(abs); err != nil {
			log.Printf("studio-reporter: open report page: %v", err)
			return
		}
		log.Printf("studio-reporter: opened report page %s", abs)
	})
}

func openInBrowser(path string) error {
	return browserCommand(path).Start()
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
