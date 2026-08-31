// 与 main.go 同属一个包（package main）
package main

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"github.com/gaugestudio/studio-reporter/internal/report"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
)

type reporterHandler struct {
	gauge_messages.UnimplementedReporterServer
	server    *grpc.Server
	forwarder *wsForwarder
	engine    *report.Engine
}

func (h *reporterHandler) forwardEvent(eventType string, message proto.Message) {
	event, err := newStudioEvent(eventType, message)
	if err != nil {
		log.Printf("studio-reporter: failed to build %s event: %v", eventType, err)
		return
	}
	if err := h.forwarder.forward(event); err != nil {
		log.Printf("studio-reporter: failed to forward %s event: %v", eventType, err)
	}
}

func (h *reporterHandler) NotifyExecutionStarting(_ context.Context, req *gauge_messages.ExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventExecutionStarting, req)
	h.reportEngine().Live.OnExecutionStarting(req.GetCurrentExecutionInfo(), req.GetSuiteResult())
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifyExecutionEnding(_ context.Context, req *gauge_messages.ExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventExecutionEnding, req)
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifySpecExecutionStarting(_ context.Context, req *gauge_messages.SpecExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventSpecExecutionStarting, req)
	h.reportEngine().Live.OnSpecStarting(req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifySpecExecutionEnding(_ context.Context, req *gauge_messages.SpecExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventSpecExecutionEnding, req)
	h.reportEngine().Live.OnSpecEnding(req)
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifyScenarioExecutionStarting(_ context.Context, req *gauge_messages.ScenarioExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventScenarioExecutionStarting, req)
	h.reportEngine().Live.OnScenarioStarting(req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifyScenarioExecutionEnding(_ context.Context, req *gauge_messages.ScenarioExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventScenarioExecutionEnding, req)
	h.reportEngine().Live.OnScenarioEnding(req)
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifyStepExecutionStarting(_ context.Context, req *gauge_messages.StepExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventStepExecutionStarting, req)
	h.reportEngine().Live.OnStepStarting(req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifyStepExecutionEnding(_ context.Context, req *gauge_messages.StepExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventStepExecutionEnding, req)
	h.reportEngine().Live.OnStepOrConceptEnding(req.GetStepResult(), req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifyConceptExecutionStarting(_ context.Context, req *gauge_messages.ConceptExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventConceptExecutionStarting, req)
	h.reportEngine().Live.OnConceptStarting(req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifyConceptExecutionEnding(_ context.Context, req *gauge_messages.ConceptExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventConceptExecutionEnding, req)
	h.reportEngine().Live.OnStepOrConceptEnding(req.GetStepResult(), req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) NotifySuiteResult(_ context.Context, req *gauge_messages.SuiteExecutionResult) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventSuiteResult, req)
	if req != nil && !report.ShouldSkipReport() {
		h.generateAndForwardReport(req)
	}
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) reportEngine() *report.Engine {
	if h.engine == nil {
		h.engine = newReportEngine()
	}
	return h.engine
}

func (h *reporterHandler) generateAndForwardReport(req *gauge_messages.SuiteExecutionResult) {
	generated, err := h.reportEngine().FinalizeSuite(req)
	if err != nil {
		log.Printf("studio-reporter: failed to generate HTML report: %v", err)
		return
	}
	payload, err := json.Marshal(map[string]string{
		"reportPath": generated.IndexPath,
		"jsonPath":   generated.JSONPath,
		"reportDir":  generated.Dir,
	})
	if err != nil {
		log.Printf("studio-reporter: failed to marshal ReportGenerated event: %v", err)
		return
	}
	if err := h.forwarder.forward(newStudioEventPayload(EventReportGenerated, payload)); err != nil {
		log.Printf("studio-reporter: failed to forward %s event: %v", EventReportGenerated, err)
	}
}

func (h *reporterHandler) Kill(_ context.Context, _ *gauge_messages.KillProcessRequest) (*gauge_messages.Empty, error) {
	go h.stop()
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) stop() {
	h.forwarder.close()
	h.server.Stop()
	os.Exit(0)
}
