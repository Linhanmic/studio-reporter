package main

import (
	"runtime"
	"testing"
)

func TestShouldSkipBrowserDuringGoTest(t *testing.T) {
	if !shouldSkipBrowser() {
		t.Fatal("go test must not launch a browser")
	}
}

func TestSkipBrowserEnvSet(t *testing.T) {
	t.Setenv(skipBrowserEnv, "")
	if skipBrowserEnvSet() {
		t.Fatal("empty env should not skip")
	}
	for _, v := range []string{"true", "TRUE", "1", "yes", " Yes "} {
		t.Setenv(skipBrowserEnv, v)
		if !skipBrowserEnvSet() {
			t.Fatalf("%q should skip browser", v)
		}
	}
	t.Setenv(skipBrowserEnv, "false")
	if skipBrowserEnvSet() {
		t.Fatal("false should not skip")
	}
}

func TestBrowserCommand(t *testing.T) {
	cmd := browserCommand("/tmp/studio-report/index.html")
	if cmd == nil || len(cmd.Args) == 0 {
		t.Fatal("missing browser command")
	}
	switch runtime.GOOS {
	case "windows":
		if cmd.Args[0] != "rundll32" {
			t.Fatalf("windows command = %v", cmd.Args)
		}
	case "darwin":
		if cmd.Args[0] != "open" {
			t.Fatalf("darwin command = %v", cmd.Args)
		}
	default:
		if cmd.Args[0] != "xdg-open" {
			t.Fatalf("linux command = %v", cmd.Args)
		}
	}
	last := cmd.Args[len(cmd.Args)-1]
	if last != "/tmp/studio-report/index.html" {
		t.Fatalf("path arg = %s", last)
	}
}

func TestOpenBrowserOptIn(t *testing.T) {
	t.Setenv(openBrowserEnv, "")
	if openBrowserEnvSet() {
		t.Fatal("browser opt-in defaults to off")
	}
	t.Setenv(openBrowserEnv, "true")
	if !openBrowserEnvSet() {
		t.Fatal("GAUGE_STUDIO_OPEN_BROWSER=true should opt in")
	}
	t.Setenv(openBrowserEnv, "false")
	if openBrowserEnvSet() {
		t.Fatal("false should not opt in")
	}
}

func TestOpenReportPageNoopsWhenSkipped(t *testing.T) {
	openReportPage("")
	openReportPage("/tmp/does-not-exist-index.html")
}
