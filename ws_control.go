package main

import (
	"encoding/json"
	"log"

	"github.com/gaugestudio/studio-reporter/internal/report"
)

const (
	EventClientHello      = "ClientHello"
	EventServerHello      = "ServerHello"
	EventPing             = "Ping"
	EventPong             = "Pong"
	EventRequestSnapshot  = "RequestSnapshot"
)

// controlHandler receives optional Desktop → Plugin control messages.
// Unknown types should be ignored by the caller after logging.
type controlHandler func(c *wsClient, ev *StudioEvent)

func (f *wsForwarder) setControlHandler(h controlHandler) {
	f.mu.Lock()
	f.onControl = h
	f.mu.Unlock()
}

func (f *wsForwarder) reply(c *wsClient, ev *StudioEvent) error {
	if c == nil || ev == nil {
		return nil
	}
	data, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.clients[c.conn]; !ok {
		return nil
	}
	return writeTextFrame(c.conn, data, false)
}

func (f *wsForwarder) handleInbound(c *wsClient, ev *StudioEvent) {
	if ev == nil || ev.Type == "" {
		return
	}
	switch ev.Type {
	case EventPing:
		_ = f.reply(c, newStudioEventPayload(EventPong, json.RawMessage(`{}`)))
		return
	case EventClientHello, EventRequestSnapshot:
		f.mu.Lock()
		h := f.onControl
		f.mu.Unlock()
		if h != nil {
			h(c, ev)
			return
		}
		if ev.Type == EventClientHello {
			_ = f.reply(c, defaultServerHello())
		}
		return
	default:
		log.Printf("studio-reporter: ignore unknown control message %q", ev.Type)
	}
}

func defaultServerHello() *StudioEvent {
	payload, _ := json.Marshal(map[string]any{
		"app":     "studio-reporter",
		"version": report.PluginVersion,
		"capabilities": []string{
			EventReportSnapshot,
			EventReportGenerated,
			EventRequestSnapshot,
			EventPing,
			EventClientHello,
		},
	})
	return newStudioEventPayload(EventServerHello, payload)
}

func (h *reporterHandler) handleControlMessage(c *wsClient, ev *StudioEvent) {
	if h == nil || ev == nil {
		return
	}
	switch ev.Type {
	case EventClientHello:
		_ = h.forwarder.reply(c, defaultServerHello())
	case EventRequestSnapshot:
		snap := h.reportEngine().Live.Snapshot()
		if snap == nil {
			return
		}
		payload, err := json.Marshal(snap)
		if err != nil {
			return
		}
		_ = h.forwarder.reply(c, newStudioEventPayload(EventReportSnapshot, payload))
	}
}
