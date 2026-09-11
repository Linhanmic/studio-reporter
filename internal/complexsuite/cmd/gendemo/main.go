// Command gendemo writes a complex-gauge HTML hub for manual QA.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gaugestudio/studio-reporter/internal/complexsuite"
	"github.com/gaugestudio/studio-reporter/internal/report"
)

func main() {
	out := flag.String("out", ".demo/complex-hub", "output hub directory")
	flag.Parse()
	if err := os.MkdirAll(*out, 0o755); err != nil {
		fatal(err)
	}
	shots := filepath.Join(*out, ".source-shots")
	suite := complexsuite.Suite(shots)
	generated, err := (&report.FinalWriter{History: noopHistory{}}).Write(*out, report.FromSuite(suite.GetSuiteResult()), suite)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("complex demo hub: %s\n", generated.IndexPath)
	fmt.Printf("uhilreport:       %s\n", generated.JSONPath)
	fmt.Printf("viewer:           %s\n", filepath.Join(generated.Dir, report.ViewerFile))
	fmt.Printf("manage:           %s\n", filepath.Join(generated.Dir, report.ManageIndexFile))
}

type noopHistory struct{}

func (noopHistory) RecordCompletedRun(string, *report.Report) error { return nil }

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "gendemo: %v\n", err)
	os.Exit(1)
}
