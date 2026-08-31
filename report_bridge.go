package main

import (
	"github.com/gaugestudio/studio-reporter/internal/report"
)

type historyRecorder struct{}

func (historyRecorder) RecordCompletedRun(runDir string, r *report.Report) error {
	return recordCompletedRun(runDir, r)
}

func newReportEngine() *report.Engine {
	return report.NewEngine(&report.FinalWriter{
		OnIndexHTMLWritten: openReportPage,
		History:            historyRecorder{},
	})
}
