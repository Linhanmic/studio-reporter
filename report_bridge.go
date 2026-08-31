package main

import (
	"encoding/json"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

type historyRecorder struct{}

func (historyRecorder) RecordCompletedRun(runDir string, r *report.Report) error {
	return recordCompletedRun(runDir, r)
}

func newReportEngine(forwarder *wsForwarder) *report.Engine {
	writer := &report.FinalWriter{
		OnIndexHTMLWritten: openReportPage,
		History:            historyRecorder{},
	}
	var broadcast report.SnapshotBroadcaster
	if forwarder != nil {
		broadcast = func(snap *report.LiveSnapshot) {
			broadcastReportSnapshot(forwarder, snap)
		}
	}
	return report.NewEngine(writer, broadcast)
}

func broadcastReportSnapshot(f *wsForwarder, snap *report.LiveSnapshot) {
	if f == nil || snap == nil {
		return
	}
	payload, err := json.Marshal(snap)
	if err != nil {
		return
	}
	_ = f.forward(newStudioEventPayload(EventReportSnapshot, payload))
}
