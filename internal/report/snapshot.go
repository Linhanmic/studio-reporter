package report

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// AtomicWriteFile writes data atomically via a temp file in the target directory.
func AtomicWriteFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		_ = os.Remove(path)
		if err2 := os.Rename(tmpName, path); err2 != nil {
			os.Remove(tmpName)
			return err
		}
	}
	return nil
}

// WriteLiveSnapshot writes report.json and report-live.js atomically.
func WriteLiveSnapshot(dir string, snap *LiveSnapshot) error {
	if snap == nil || snap.Report == nil {
		return fmt.Errorf("live snapshot is empty")
	}
	if snap.FormatVersion == 0 {
		snap.FormatVersion = FormatVersion
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(true)
	if err := enc.Encode(snap); err != nil {
		return fmt.Errorf("encode live snapshot: %w", err)
	}
	data := bytes.TrimSpace(buf.Bytes())
	jsonPath := filepath.Join(dir, LiveReportJSONFile)
	if err := AtomicWriteFile(jsonPath, data); err != nil {
		return fmt.Errorf("write %s: %w", LiveReportJSONFile, err)
	}
	js := append([]byte("window.__GAUGE_LIVE__="), data...)
	js = append(js, ';')
	if err := AtomicWriteFile(filepath.Join(dir, LiveReportJSFile), js); err != nil {
		return fmt.Errorf("write %s: %w", LiveReportJSFile, err)
	}
	return nil
}

// WriteFinalHTML renders a static index.html and atomically writes it.
func WriteFinalHTML(dir string, r *Report, onWritten IndexHTMLCallback) error {
	html, err := RenderReportHTML(r)
	if err != nil {
		return err
	}
	indexPath := filepath.Join(dir, IndexFile)
	if err := AtomicWriteFile(indexPath, html); err != nil {
		return fmt.Errorf("write %s: %w", IndexFile, err)
	}
	if onWritten != nil {
		onWritten(indexPath)
	}
	return nil
}
