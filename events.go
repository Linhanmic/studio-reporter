package main

import (
	"encoding/json"
	"time"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

const (
	EventExecutionStarting         = "ExecutionStarting"
	EventExecutionEnding           = "ExecutionEnding"
	EventSpecExecutionStarting     = "SpecExecutionStarting"
	EventSpecExecutionEnding       = "SpecExecutionEnding"
	EventScenarioExecutionStarting = "ScenarioExecutionStarting"
	EventScenarioExecutionEnding   = "ScenarioExecutionEnding"
	EventStepExecutionStarting     = "StepExecutionStarting"
	EventStepExecutionEnding       = "StepExecutionEnding"
	EventConceptExecutionStarting  = "ConceptExecutionStarting"
	EventConceptExecutionEnding    = "ConceptExecutionEnding"
	EventSuiteResult               = "SuiteResult"
	EventReportGenerated           = "ReportGenerated"
)

var protoMarshalOptions = protojson.MarshalOptions{
	EmitUnpopulated: false,
	UseProtoNames:   true,
}

// StudioEvent is the JSON envelope forwarded to Gauge Studio over WebSocket.
type StudioEvent struct {
	Type      string          `json:"type"`
	Timestamp string          `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
}

func newStudioEvent(eventType string, message proto.Message) (*StudioEvent, error) {
	payload, err := protoMarshalOptions.Marshal(message)
	if err != nil {
		return nil, err
	}
	return newStudioEventPayload(eventType, payload), nil
}

func newStudioEventPayload(eventType string, payload json.RawMessage) *StudioEvent {
	return &StudioEvent{
		Type:      eventType,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Payload:   payload,
	}
}
