package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestWSListenUsesRandomPortAndBroadcasts(t *testing.T) {
	f := newWSForwarder()
	if err := f.listen(); err != nil {
		t.Fatal(err)
	}
	defer f.close()

	if f.port <= 0 {
		t.Fatalf("port = %d", f.port)
	}
	wantURL := "ws://127.0.0.1:" + strconv.Itoa(f.port)
	if f.wsURL != wantURL {
		t.Fatalf("wsURL = %s, want %s", f.wsURL, wantURL)
	}

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
		t.Fatal("server did not accept websocket client")
	}

	ev := newStudioEventPayload("ExecutionStarting", json.RawMessage(`{"hello":"studio"}`))
	if err := f.forward(ev); err != nil {
		t.Fatalf("forward: %v", err)
	}

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	payload, err := readWebSocketPayload(reader)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.Contains(string(payload), `"type":"ExecutionStarting"`) {
		t.Fatalf("payload = %s", payload)
	}
	if !strings.Contains(string(payload), `"hello":"studio"`) {
		t.Fatalf("payload = %s", payload)
	}
}
