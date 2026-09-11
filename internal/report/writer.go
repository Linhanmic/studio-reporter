package report

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
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
	// ScreenshotBaseDirs are searched when resolving relative (or missing absolute)
	// screenshot paths — typically the directory that contains the .uhilreport.
	ScreenshotBaseDirs []string
	// WritePDF, when true, also prints index.html to report.pdf via headless Chrome.
	// Defaults to env GAUGE_STUDIO_WRITE_PDF=true when unset on the struct (see wantPDF).
	WritePDF *bool
	// PDFPath overrides the default <dir>/report.pdf when writing PDF.
	PDFPath string
	// WriteSingleHTML, when true, also writes report.single.html with inlined screenshots.
	// Defaults to env GAUGE_STUDIO_WRITE_SINGLE=true when unset (see wantSingleHTML).
	WriteSingleHTML *bool
	// SingleHTMLPath overrides the default <dir>/report.single.html.
	SingleHTMLPath string
}

func (w *FinalWriter) wantPDF() bool {
	if w != nil && w.WritePDF != nil {
		return *w.WritePDF
	}
	v := strings.TrimSpace(strings.ToLower(os.Getenv(WritePDFEnv)))
	return v == "1" || v == "true" || v == "yes"
}

func (w *FinalWriter) wantSingleHTML() bool {
	if w != nil && w.WriteSingleHTML != nil {
		return *w.WriteSingleHTML
	}
	v := strings.TrimSpace(strings.ToLower(os.Getenv(WriteSingleHTMLEnv)))
	return v == "1" || v == "true" || v == "yes"
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
	var out *GeneratedReport
	err := WithHubLock(dir, func() error {
		var writeErr error
		out, writeErr = w.writeLocked(dir, r, src)
		return writeErr
	})
	return out, err
}

func (w *FinalWriter) writeLocked(dir string, r *Report, src proto.Message) (*GeneratedReport, error) {
	imagesDir := filepath.Join(dir, "images")
	if err := os.MkdirAll(imagesDir, 0o755); err != nil {
		return nil, fmt.Errorf("create report directory: %w", err)
	}
	if err := WriteAssets(dir); err != nil {
		return nil, err
	}
	mapping := copyScreenshots(collectScreenshotFiles(r), imagesDir, w.ScreenshotBaseDirs...)
	rewriteScreenshotPaths(r, mapping)
	// Persist portable relative paths (images/...) into the .uhilreport proto so
	// --input can rebuild without the original Gauge absolute screenshot files.
	rewriteProtoScreenshotPaths(src, mapping)

	snap := &LiveSnapshot{Rev: time.Now().UnixMilli(), Running: false, Report: r}
	if err := WriteFinalHTML(dir, r, w.OnIndexHTMLWritten); err != nil {
		return nil, err
	}
	indexPath := filepath.Join(dir, IndexFile)

	jsonPath := filepath.Join(dir, UhilReportFileName(r))
	payload, err := protoMarshalOptions.Marshal(src)
	if err != nil {
		return nil, fmt.Errorf("marshal suite result: %w", err)
	}
	// Write the new portable report first, then remove other hub *.uhilreport files.
	if err := AtomicWriteFile(jsonPath, payload); err != nil {
		return nil, fmt.Errorf("write %s: %w", filepath.Base(jsonPath), err)
	}
	if stale, err := filepath.Glob(filepath.Join(dir, "*"+UhilReportExt)); err == nil {
		want, _ := filepath.Abs(jsonPath)
		for _, f := range stale {
			abs, err := filepath.Abs(f)
			if err != nil || abs == want {
				continue
			}
			_ = os.Remove(f)
		}
	}
	if err := WriteLiveSnapshot(dir, snap); err != nil {
		return nil, err
	}

	w.logf("HTML report written to %s", indexPath)
	out := &GeneratedReport{Dir: dir, IndexPath: indexPath, JSONPath: jsonPath}
	if w.wantSingleHTML() {
		singlePath := w.SingleHTMLPath
		if singlePath == "" {
			singlePath = filepath.Join(dir, SingleHTMLFile)
		}
		if err := WriteSingleHTML(indexPath, singlePath); err != nil {
			w.logf("single-html: %v", err)
		} else {
			out.SingleHTMLPath = singlePath
			w.logf("single-file HTML written to %s", singlePath)
		}
	}
	if w.wantPDF() {
		pdfPath := w.PDFPath
		if pdfPath == "" {
			pdfPath = filepath.Join(dir, "report.pdf")
		}
		if err := WritePDF(indexPath, pdfPath); err != nil {
			w.logf("pdf: %v", err)
		} else {
			out.PDFPath = pdfPath
			w.logf("PDF report written to %s", pdfPath)
		}
	}
	if w.History != nil {
		if err := w.History.RecordCompletedRun(dir, r); err != nil {
			w.logf("history: %v", err)
		}
	}
	return out, nil
}
