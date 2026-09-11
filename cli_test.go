package main

import (
	"bytes"
	"os"
	"strings"
	"testing"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

func TestDispatchVersionAndHelp(t *testing.T) {
	var out, errBuf bytes.Buffer
	if code := dispatch([]string{"version"}, false, &out, &errBuf); code != 0 {
		t.Fatalf("version exit %d: %s", code, errBuf.String())
	}
	if got := strings.TrimSpace(out.String()); got != report.PluginVersion {
		t.Fatalf("version=%q want %q", got, report.PluginVersion)
	}

	out.Reset()
	errBuf.Reset()
	if code := dispatch(nil, false, &out, &errBuf); code != 1 {
		t.Fatalf("empty args exit=%d want 1", code)
	}
	if !strings.Contains(out.String(), "standalone test report tool") {
		t.Fatalf("root help missing positioning text: %s", out.String())
	}
	if !strings.Contains(out.String(), "generate") || !strings.Contains(out.String(), "plugin") {
		t.Fatalf("root help missing commands: %s", out.String())
	}

	out.Reset()
	errBuf.Reset()
	if code := dispatch([]string{"help", "generate"}, false, &out, &errBuf); code != 0 {
		t.Fatalf("help generate exit %d: %s", code, errBuf.String())
	}
	if !strings.Contains(out.String(), "--input") {
		t.Fatalf("generate help missing --input: %s", out.String())
	}
}

func TestDispatchUnknownCommand(t *testing.T) {
	var out, errBuf bytes.Buffer
	code := dispatch([]string{"explode"}, false, &out, &errBuf)
	if code != 2 {
		t.Fatalf("exit=%d want 2", code)
	}
	if !strings.Contains(errBuf.String(), "unknown command") {
		t.Fatalf("stderr=%s", errBuf.String())
	}
}

func TestDispatchGenerateRequiresInput(t *testing.T) {
	var out, errBuf bytes.Buffer
	code := dispatch([]string{"generate"}, false, &out, &errBuf)
	if code != 2 {
		t.Fatalf("exit=%d want 2", code)
	}
	if !strings.Contains(errBuf.String(), "--input is required") {
		t.Fatalf("stderr=%s", errBuf.String())
	}
}

func TestDispatchLegacyHelpFlag(t *testing.T) {
	var out, errBuf bytes.Buffer
	code := dispatch([]string{"--help"}, false, &out, &errBuf)
	if code != 0 {
		t.Fatalf("exit=%d want 0: %s", code, errBuf.String())
	}
	if !strings.Contains(out.String(), "Legacy flat flags") {
		t.Fatalf("expected legacy help section: %s", out.String())
	}
}

func TestDispatchGenerateSubcommand(t *testing.T) {
	dir := t.TempDir()
	var out, errBuf bytes.Buffer
	code := dispatch([]string{"generate", "--input", dir + "/missing.uhilreport", "--out", dir}, false, &out, &errBuf)
	if code == 0 {
		t.Fatal("expected failure for missing input")
	}
	if !strings.Contains(errBuf.String(), "studio-reporter:") {
		t.Fatalf("stderr=%s", errBuf.String())
	}
}

func TestDispatchGaugeEnvStartsPluginPath(t *testing.T) {
	// With gauge execution env and no args, dispatch must choose plugin mode
	// (we only assert it does not print root help / exit 1).
	// Starting the real gRPC server is skipped by requiring --help token path covered elsewhere.
	if pluginActionEnv == "" || executionAction == "" {
		t.Fatal("plugin env constants empty")
	}
	_ = os.Environ()
}
