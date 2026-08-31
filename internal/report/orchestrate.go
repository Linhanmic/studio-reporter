package report

import (
	"fmt"
	"os"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"google.golang.org/protobuf/encoding/protojson"
)

// Engine coordinates live publishing and final report writes.
type Engine struct {
	Live   *LivePublisher
	Writer *FinalWriter
}

// NewEngine returns a report engine with a fresh live publisher.
func NewEngine(writer *FinalWriter) *Engine {
	return &Engine{
		Live:   NewLivePublisher(writer.OnIndexHTMLWritten),
		Writer: writer,
	}
}

// FinalizeSuite converts the suite once, finishes the live stream, and writes the final artifacts.
func (e *Engine) FinalizeSuite(req *gauge_messages.SuiteExecutionResult) (*GeneratedReport, error) {
	if req == nil || req.GetSuiteResult() == nil {
		return nil, fmt.Errorf("suite result is empty")
	}
	r := FromSuite(req.GetSuiteResult())
	dir := e.Live.Dir()
	if dir == "" {
		var err error
		dir, err = ResolveDir()
		if err != nil {
			return nil, err
		}
	} else if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create report directory: %w", err)
	}
	e.Live.FinishWithReport(r)
	if e.Writer == nil {
		return nil, fmt.Errorf("final writer is not configured")
	}
	return e.Writer.Write(dir, r, req)
}

// GenerateFromJSON rebuilds a report from a .uhilreport file.
func GenerateFromJSON(inputPath, outputDir string, writer *FinalWriter) (*GeneratedReport, error) {
	data, err := os.ReadFile(inputPath)
	if err != nil {
		return nil, fmt.Errorf("read input: %w", err)
	}
	var suite gauge_messages.SuiteExecutionResult
	if err := protojson.Unmarshal(data, &suite); err != nil {
		return nil, fmt.Errorf("parse suite result JSON: %w", err)
	}
	if suite.GetSuiteResult() == nil {
		return nil, fmt.Errorf("input JSON does not contain a suiteResult")
	}
	if outputDir == "" {
		outputDir, err = ResolveDir()
		if err != nil {
			return nil, err
		}
	} else if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, fmt.Errorf("create output directory: %w", err)
	}
	if writer == nil {
		return nil, fmt.Errorf("final writer is not configured")
	}
	return writer.Write(outputDir, FromSuite(suite.GetSuiteResult()), &suite)
}
