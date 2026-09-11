package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

// Product positioning (v0.5+):
//
//	studio-reporter is a standalone report tool.
//	Gauge plugin mode (`plugin` / `--start`) is one ingestion path, not the product identity.
func dispatch(args []string, gaugeExecution bool, stdout, stderr io.Writer) int {
	// Gauge may launch with only the action env set (no argv flags).
	if gaugeExecution && len(args) == 0 {
		return runPluginCmd(nil, stdout, stderr)
	}

	if len(args) == 0 {
		printRootHelp(stdout)
		return 1
	}

	if strings.HasPrefix(args[0], "-") {
		return runLegacyFlags(args, stdout, stderr)
	}

	cmd, rest := args[0], args[1:]
	switch strings.ToLower(cmd) {
	case "help", "h":
		if len(rest) > 0 {
			return printCommandHelp(rest[0], stdout, stderr)
		}
		printRootHelp(stdout)
		return 0
	case "version", "v":
		fmt.Fprintln(stdout, report.PluginVersion)
		return 0
	case "generate", "gen", "render":
		return runGenerateCmd(rest, stdout, stderr)
	case "serve":
		return runServeCmd(rest, stdout, stderr)
	case "digest":
		return runDigestCmd(rest, stdout, stderr)
	case "plugin", "start":
		return runPluginCmd(rest, stdout, stderr)
	default:
		fmt.Fprintf(stderr, "studio-reporter: unknown command %q\n\n", cmd)
		printRootHelp(stderr)
		return 2
	}
}

func printRootHelp(w io.Writer) {
	fmt.Fprintf(w, `studio-reporter %s — standalone test report tool

USAGE
  studio-reporter <command> [flags]
  studio-reporter --input <file.uhilreport> [--out DIR]   # legacy flags (still supported)

COMMANDS
  generate   Rebuild HTML/PDF/single-file report from a .uhilreport
  serve      Serve a report hub over HTTP (history / manage console)
  digest     Aggregate topFailReason across hub history (Markdown/JSON)
  plugin     Run as a Gauge reporter plugin (gRPC + live WebSocket)
  version    Print version
  help       Show this help or command help

EXAMPLES
  studio-reporter generate --input run.uhilreport --out /tmp/out --pdf --single
  studio-reporter serve --dir reports/studio-report --addr 127.0.0.1:8765
  studio-reporter digest --dir reports/studio-report
  studio-reporter digest --dir reports/studio-report --format json
  studio-reporter plugin          # same as: studio-reporter --start
  studio-reporter version

Gauge still launches "studio-reporter --start" via plugin.json; that path is unchanged.
`, report.PluginVersion)
}

func printCommandHelp(name string, stdout, stderr io.Writer) int {
	switch strings.ToLower(name) {
	case "generate", "gen", "render":
		fmt.Fprintln(stdout, "studio-reporter generate — rebuild a report from .uhilreport")
		fmt.Fprintln(stdout, "  required: --input <file.uhilreport>")
		fs := newGenerateFlagSet(stderr)
		fs.PrintDefaults()
		return 0
	case "serve":
		fmt.Fprintln(stdout, "studio-reporter serve — HTTP hub for history / manage.html")
		fs := newServeFlagSet(stderr)
		fs.SetOutput(stdout)
		fs.PrintDefaults()
		return 0
	case "digest":
		fmt.Fprintln(stdout, "studio-reporter digest — aggregate topFailReason across hub history")
		fs := newDigestFlagSet(stderr)
		fs.SetOutput(stdout)
		fs.PrintDefaults()
		return 0
	case "plugin", "start":
		fmt.Fprintln(stdout, `studio-reporter plugin — Gauge reporter mode

Starts the gRPC reporter server and a local WebSocket for live viewing.
Equivalent legacy flag: studio-reporter --start

Gauge plugin.json continues to invoke: bin/studio-reporter --start`)
		return 0
	case "version", "v":
		fmt.Fprintln(stdout, "studio-reporter version — print PluginVersion")
		return 0
	default:
		fmt.Fprintf(stderr, "studio-reporter: no help for %q\n", name)
		return 2
	}
}

func newGenerateFlagSet(errOut io.Writer) *flag.FlagSet {
	fs := flag.NewFlagSet("generate", flag.ContinueOnError)
	fs.SetOutput(errOut)
	_ = fs.String("input", "", "Path to a .uhilreport file (required)")
	_ = fs.String("out", "", "Output directory (default: gauge reports/studio-report)")
	_ = fs.Bool("pdf", false, "Also write report.pdf via headless Chrome")
	_ = fs.String("pdf-out", "", "PDF output path (default: <out>/report.pdf)")
	_ = fs.Bool("single", false, "Also write report.single.html with inlined screenshots")
	_ = fs.String("single-out", "", "Single-file HTML path (default: <out>/report.single.html)")
	return fs
}

func newServeFlagSet(errOut io.Writer) *flag.FlagSet {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(errOut)
	_ = fs.String("dir", "", "Report hub directory (default: reports/studio-report)")
	_ = fs.String("addr", "127.0.0.1:8765", "Listen address")
	return fs
}

func runGenerateCmd(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("generate", flag.ContinueOnError)
	fs.SetOutput(stderr)
	input := fs.String("input", "", "Path to a .uhilreport file (required)")
	out := fs.String("out", "", "Output directory")
	pdf := fs.Bool("pdf", false, "Also write report.pdf via headless Chrome")
	pdfOut := fs.String("pdf-out", "", "PDF output path")
	single := fs.Bool("single", false, "Also write report.single.html")
	singleOut := fs.String("single-out", "", "Single-file HTML path")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if strings.TrimSpace(*input) == "" {
		fmt.Fprintln(stderr, "studio-reporter generate: --input is required")
		fs.PrintDefaults()
		return 2
	}
	return doGenerate(*input, *out, *pdf, *pdfOut, *single, *singleOut, stdout, stderr)
}

func runServeCmd(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	dir := fs.String("dir", "", "Report hub directory")
	addr := fs.String("addr", "127.0.0.1:8765", "Listen address")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if err := serveReportDir(*dir, *addr); err != nil {
		fmt.Fprintf(stderr, "studio-reporter: %v\n", err)
		return 1
	}
	return 0
}

func runDigestCmd(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("digest", flag.ContinueOnError)
	fs.SetOutput(stderr)
	dir := fs.String("dir", "", "Report hub directory containing history.json (required)")
	limit := fs.Int("limit", 15, "Max distinct fail reasons to include")
	format := fs.String("format", "markdown", "Output format: markdown|json")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	hub := strings.TrimSpace(*dir)
	if hub == "" {
		fmt.Fprintln(stderr, "studio-reporter digest: --dir is required")
		fs.PrintDefaults()
		return 2
	}
	d, err := loadHistoryFailDigestFromHub(hub, *limit)
	if err != nil {
		fmt.Fprintf(stderr, "studio-reporter digest: %v\n", err)
		return 1
	}
	if err := writeHistoryFailDigest(stdout, d, *format); err != nil {
		fmt.Fprintf(stderr, "studio-reporter digest: %v\n", err)
		return 1
	}
	return 0
}

func runPluginCmd(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("plugin", flag.ContinueOnError)
	fs.SetOutput(stderr)
	_ = fs.Bool("start", true, "compat: ignored (plugin mode is already selected)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if err := startPluginMode(); err != nil {
		fmt.Fprintf(stderr, "studio-reporter: %v\n", err)
		return 1
	}
	return 0
}

func doGenerate(input, out string, pdf bool, pdfOut string, single bool, singleOut string, stdout, stderr io.Writer) int {
	generated, err := report.GenerateFromJSON(input, out, &report.FinalWriter{
		OnIndexHTMLWritten: openReportPage,
		History:            historyRecorder{},
		WritePDF:           &pdf,
		PDFPath:            pdfOut,
		WriteSingleHTML:    &single,
		SingleHTMLPath:     singleOut,
	})
	if err != nil {
		fmt.Fprintf(stderr, "studio-reporter: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "HTML report written to %s\n", generated.IndexPath)
	if generated.SingleHTMLPath != "" {
		fmt.Fprintf(stdout, "Single-file HTML written to %s\n", generated.SingleHTMLPath)
	}
	if generated.PDFPath != "" {
		fmt.Fprintf(stdout, "PDF report written to %s\n", generated.PDFPath)
	}
	return 0
}

func runLegacyFlags(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("studio-reporter", flag.ContinueOnError)
	fs.SetOutput(stderr)
	start := fs.Bool("start", false, "Start the reporter gRPC server for Gauge execution")
	input := fs.String("input", "", "Regenerate an HTML report from a .uhilreport file")
	out := fs.String("out", "", "Output directory for regenerated HTML report")
	pdf := fs.Bool("pdf", false, "Also export report.pdf via headless Chrome")
	pdfOut := fs.String("pdf-out", "", "PDF output path (default: <out>/report.pdf)")
	single := fs.Bool("single", false, "Also export report.single.html with inlined screenshots")
	singleOut := fs.String("single-out", "", "Single-file HTML output path")
	serve := fs.Bool("serve", false, "Serve the studio-report directory over HTTP")
	serveDir := fs.String("dir", "", "Directory for --serve (default: reports/studio-report)")
	serveAddr := fs.String("addr", "127.0.0.1:8765", "Listen address for --serve")
	legacyHelp := fs.Bool("help", false, "Show help")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *legacyHelp {
		printRootHelp(stdout)
		fmt.Fprintln(stdout, "\nLegacy flat flags (still supported):")
		fs.SetOutput(stdout)
		fs.PrintDefaults()
		return 0
	}
	if *serve {
		if err := serveReportDir(*serveDir, *serveAddr); err != nil {
			fmt.Fprintf(stderr, "studio-reporter: %v\n", err)
			return 1
		}
		return 0
	}
	if *input != "" {
		return doGenerate(*input, *out, *pdf, *pdfOut, *single, *singleOut, stdout, stderr)
	}
	if *start || os.Getenv(pluginActionEnv) == executionAction {
		if err := startPluginMode(); err != nil {
			fmt.Fprintf(stderr, "studio-reporter: %v\n", err)
			return 1
		}
		return 0
	}
	printRootHelp(stderr)
	return 1
}

func startPluginMode() error {
	forwarder := newWSForwarder()
	if err := forwarder.listen(); err != nil {
		return err
	}
	forwarder.connect()
	return startGRPCServer(forwarder)
}
