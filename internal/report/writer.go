package report

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

var protoMarshalOptions = protojson.MarshalOptions{
	EmitUnpopulated: false,
	UseProtoNames:   true,
}

// FinalWriter persists a completed suite report to disk.
type FinalWriter struct {
	OnIndexHTMLWritten IndexHTMLCallback
	History            HistoryRecorder
	Logf               func(format string, args ...any)
}

func (w *FinalWriter) logf(format string, args ...any) {
	if w.Logf != nil {
		w.Logf(format, args...)
	} else {
		log.Printf("studio-reporter: "+format, args...)
	}
}

// Write persists screenshots, HTML, portable .uhilreport, and the final live snapshot.
// History recording is explicit via HistoryRecorder when set.
func (w *FinalWriter) Write(dir string, r *Report, src proto.Message) (*GeneratedReport, error) {
	imagesDir := filepath.Join(dir, "images")
	if err := os.MkdirAll(imagesDir, 0o755); err != nil {
		return nil, fmt.Errorf("create report directory: %w", err)
	}
	if err := WriteAssets(dir); err != nil {
		return nil, err
	}
	rewriteScreenshotPaths(r, copyScreenshots(collectScreenshotFiles(r), imagesDir))

	snap := &LiveSnapshot{Rev: time.Now().UnixMilli(), Running: false, Report: r}
	if err := WriteFinalHTML(dir, r, w.OnIndexHTMLWritten); err != nil {
		return nil, err
	}
	indexPath := filepath.Join(dir, IndexFile)

	if stale, err := filepath.Glob(filepath.Join(dir, "*"+UhilReportExt)); err == nil {
		for _, f := range stale {
			_ = os.Remove(f)
		}
	}
	jsonPath := filepath.Join(dir, UhilReportFileName(r))
	payload, err := protoMarshalOptions.Marshal(src)
	if err != nil {
		return nil, fmt.Errorf("marshal suite result: %w", err)
	}
	if err := os.WriteFile(jsonPath, payload, 0o644); err != nil {
		return nil, fmt.Errorf("write %s: %w", filepath.Base(jsonPath), err)
	}
	if err := WriteLiveSnapshot(dir, snap); err != nil {
		return nil, err
	}

	w.logf("HTML report written to %s", indexPath)
	if w.History != nil {
		if err := w.History.RecordCompletedRun(dir, r); err != nil {
			w.logf("history: %v", err)
		}
	}
	return &GeneratedReport{Dir: dir, IndexPath: indexPath, JSONPath: jsonPath}, nil
}
