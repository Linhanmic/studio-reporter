package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

func TestControlPingPongAndHello(t *testing.T) {
	f := newWSForwarder()
	if err := f.listen(); err != nil {
		t.Fatal(err)
	}
	defer f.close()

	conn, reader, err := dialWebSocket(f.wsURL)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && f.clientCount() < 1 {
		time.Sleep(10 * time.Millisecond)
	}
	if f.clientCount() < 1 {
		t.Fatal("no client")
	}

	ping := newStudioEventPayload(EventPing, json.RawMessage(`{}`))
	data, _ := json.Marshal(ping)
	if err := writeTextFrame(conn, data, true); err != nil {
		t.Fatalf("write ping: %v", err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	payload, err := readWebSocketPayload(reader)
	if err != nil {
		t.Fatalf("read pong: %v", err)
	}
	if !strings.Contains(string(payload), `"type":"Pong"`) {
		t.Fatalf("expected Pong, got %s", payload)
	}

	hello := newStudioEventPayload(EventClientHello, json.RawMessage(`{"app":"test","version":"0","capabilities":[]}`))
	data, _ = json.Marshal(hello)
	if err := writeTextFrame(conn, data, true); err != nil {
		t.Fatalf("write hello: %v", err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	payload, err = readWebSocketPayload(reader)
	if err != nil {
		t.Fatalf("read hello reply: %v", err)
	}
	if !strings.Contains(string(payload), `"type":"ServerHello"`) {
		t.Fatalf("expected ServerHello, got %s", payload)
	}
	if !strings.Contains(string(payload), report.PluginVersion) {
		t.Fatalf("expected version %s in %s", report.PluginVersion, payload)
	}
}

func TestControlRequestSnapshot(t *testing.T) {
	f := newWSForwarder()
	if err := f.listen(); err != nil {
		t.Fatal(err)
	}
	defer f.close()

	h := &reporterHandler{forwarder: f}
	f.setControlHandler(h.handleControlMessage)

	conn, reader, err := dialWebSocket(f.wsURL)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && f.clientCount() < 1 {
		time.Sleep(10 * time.Millisecond)
	}

	req := newStudioEventPayload(EventRequestSnapshot, json.RawMessage(`{}`))
	data, _ := json.Marshal(req)
	if err := writeTextFrame(conn, data, true); err != nil {
		t.Fatalf("write request: %v", err)
	}

	// No live tree yet — should not panic; may or may not reply.
	_ = conn.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	payload, err := readWebSocketPayload(reader)
	if err == nil && !strings.Contains(string(payload), EventReportSnapshot) {
		t.Fatalf("unexpected reply %s", payload)
	}
}
