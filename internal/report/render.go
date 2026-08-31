package report

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// RenderReportHTML builds index.html for a completed report.
func RenderReportHTML(r *Report) ([]byte, error) {
	return RenderSnapshotHTML(&LiveSnapshot{Rev: time.Now().UnixMilli(), Running: false, Report: r})
}

// RenderSnapshotHTML embeds a live snapshot JSON payload into the viewer template.
func RenderSnapshotHTML(snap *LiveSnapshot) ([]byte, error) {
	if snap == nil {
		snap = &LiveSnapshot{}
	}
	if snap.Report == nil {
		snap.Report = &Report{ProjectName: "Gauge Suite", Duration: formatDuration(0), Verdict: VerdictNone}
	}
	if snap.FormatVersion == 0 {
		snap.FormatVersion = FormatVersion
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(true)
	if err := enc.Encode(snap); err != nil {
		return nil, fmt.Errorf("encode report json: %w", err)
	}
	jsonData := strings.TrimSpace(buf.String())
	html := strings.Replace(htmlTemplate, "{{REPORT_JSON}}", jsonData, 1)
	return []byte(html), nil
}
