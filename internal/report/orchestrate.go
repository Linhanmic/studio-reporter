package report

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"google.golang.org/protobuf/encoding/protojson"
)

// Engine coordinates live publishing and final report writes.
type Engine struct {
	Live       *LivePublisher
	Writer     *FinalWriter
	finalizeMu sync.Mutex
}

// NewEngine returns a report engine with a fresh live publisher.
func NewEngine(writer *FinalWriter, broadcast SnapshotBroadcaster) *Engine {
	return &Engine{
		Live:   NewLivePublisher(broadcast),
		Writer: writer,
	}
}

// FinalizeSuite converts the suite once, finishes the live stream, and writes the final artifacts.
func (e *Engine) FinalizeSuite(req *gauge_messages.SuiteExecutionResult) (*GeneratedReport, error) {
	e.finalizeMu.Lock()
	defer e.finalizeMu.Unlock()
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
	generated, err := e.Writer.Write(dir, r, req)
	if err != nil {
		return nil, err
	}
	e.Live.SetDir(dir)
	return generated, nil
}

// GenerateFromJSON rebuilds a report from a .uhilreport file.
// Relative screenshot paths (images/...) resolve against the directory of inputPath
// (and any ScreenshotBaseDirs already set on writer).
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
	absInput, err := filepath.Abs(inputPath)
	if err != nil {
		absInput = inputPath
	}
	base := filepath.Dir(absInput)
	writer.ScreenshotBaseDirs = appendUniqueDirs(writer.ScreenshotBaseDirs, base)
	return writer.Write(outputDir, FromSuite(suite.GetSuiteResult()), &suite)
}
