package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	studioWSEnv  = "GAUGE_STUDIO_WS"
	wsURLPrefix  = "studio-reporter websocket: "
	wsListenAddr = "127.0.0.1:0"
)

type wsClient struct {
	conn   net.Conn
	reader *bufio.Reader
}

type wsForwarder struct {
	url      string
	wsURL    string
	port     int
	mu       sync.Mutex
	conn     net.Conn
	reader   *bufio.Reader
	clients  map[net.Conn]*wsClient
	listener net.Listener
	httpSrv  *http.Server
	closed   bool
}

func newWSForwarder() *wsForwarder {
	return &wsForwarder{
		url:     os.Getenv(studioWSEnv),
		clients: make(map[net.Conn]*wsClient),
	}
}

func (f *wsForwarder) listen() error {
	ln, err := net.Listen("tcp", wsListenAddr)
	if err != nil {
		return fmt.Errorf("listen websocket: %w", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	wsURL := fmt.Sprintf("ws://127.0.0.1:%d", port)

	f.mu.Lock()
	f.listener = ln
	f.port = port
	f.wsURL = wsURL
	f.httpSrv = &http.Server{Handler: http.HandlerFunc(f.serveWS)}
	srv := f.httpSrv
	f.mu.Unlock()

	fmt.Printf("%s%s\n", wsURLPrefix, wsURL)
	log.Printf("studio-reporter: websocket listening on %s", wsURL)

	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			f.mu.Lock()
			done := f.closed
			f.mu.Unlock()
			if !done {
				log.Printf("studio-reporter: websocket server: %v", err)
			}
		}
	}()
	return nil
}

func (f *wsForwarder) serveWS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet || !headerHasToken(r.Header.Get("Connection"), "Upgrade") || !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		http.Error(w, "expected websocket upgrade", http.StatusBadRequest)
		return
	}
	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	if key == "" || r.Header.Get("Sec-WebSocket-Version") != "13" {
		http.Error(w, "invalid websocket handshake", http.StatusBadRequest)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack not supported", http.StatusInternalServerError)
		return
	}
	conn, bufrw, err := hj.Hijack()
	if err != nil {
		return
	}

	accept := computeAccept(key)
	_, err = bufrw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n")
	if err != nil {
		_ = conn.Close()
		return
	}
	if err := bufrw.Flush(); err != nil {
		_ = conn.Close()
		return
	}

	client := &wsClient{conn: conn, reader: bufrw.Reader}
	f.mu.Lock()
	if f.closed {
		f.mu.Unlock()
		_ = conn.Close()
		return
	}
	f.clients[conn] = client
	f.mu.Unlock()
	log.Printf("studio-reporter: websocket client connected (%d)", f.clientCount())

	go f.readClient(client)
}

func (f *wsForwarder) clientCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.clients)
}

func (f *wsForwarder) readClient(c *wsClient) {
	defer f.dropClient(c.conn)
	for {
		if _, err := readWebSocketPayload(c.reader); err != nil {
			return
		}
	}
}

func (f *wsForwarder) dropClient(conn net.Conn) {
	f.mu.Lock()
	if _, ok := f.clients[conn]; ok {
		delete(f.clients, conn)
	}
	f.mu.Unlock()
	_ = conn.Close()
}

func (f *wsForwarder) connect() {
	if f.url == "" {
		return
	}
	if _, err := url.Parse(f.url); err != nil {
		log.Printf("studio-reporter: invalid %s URL %q: %v", studioWSEnv, f.url, err)
		return
	}
	go f.connectLoop()
}

func (f *wsForwarder) connectLoop() {
	backoff := time.Second
	for {
		f.mu.Lock()
		done := f.closed
		f.mu.Unlock()
		if done {
			return
		}

		conn, reader, err := dialWebSocket(f.url)
		if err != nil {
			f.mu.Lock()
			done = f.closed
			f.mu.Unlock()
			if done {
				return
			}
			log.Printf("studio-reporter: websocket connect failed (%s): %v; retrying in %s", f.url, err, backoff)
			time.Sleep(backoff)
			if backoff < 10*time.Second {
				backoff *= 2
			}
			continue
		}

		f.mu.Lock()
		if f.closed {
			f.mu.Unlock()
			_ = conn.Close()
			return
		}
		f.conn = conn
		f.reader = reader
		f.mu.Unlock()
		log.Printf("studio-reporter: connected to %s", f.url)
		backoff = time.Second

		for {
			if _, err := readWebSocketPayload(reader); err != nil {
				log.Printf("studio-reporter: websocket disconnected: %v", err)
				break
			}
		}

		f.mu.Lock()
		if f.conn == conn {
			f.conn = nil
			f.reader = nil
		}
		done = f.closed
		f.mu.Unlock()
		_ = conn.Close()
		if done {
			return
		}
		time.Sleep(backoff)
	}
}

func (f *wsForwarder) forward(event *StudioEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal studio event: %w", err)
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	var first error
	if f.conn != nil {
		if err := writeTextFrame(f.conn, data, true); err != nil && first == nil {
			first = err
		}
	}
	for conn, client := range f.clients {
		if err := writeTextFrame(client.conn, data, false); err != nil {
			delete(f.clients, conn)
			_ = conn.Close()
			if first == nil {
				first = err
			}
		}
	}
	return first
}

func (f *wsForwarder) close() {
	f.mu.Lock()
	f.closed = true
	srv := f.httpSrv
	ln := f.listener
	outbound := f.conn
	clients := make([]*wsClient, 0, len(f.clients))
	for _, c := range f.clients {
		clients = append(clients, c)
	}
	f.clients = make(map[net.Conn]*wsClient)
	f.conn = nil
	f.reader = nil
	f.httpSrv = nil
	f.listener = nil
	f.mu.Unlock()

	if outbound != nil {
		_ = writeCloseFrame(outbound, true)
		_ = outbound.Close()
	}
	for _, c := range clients {
		_ = writeCloseFrame(c.conn, false)
		_ = c.conn.Close()
	}
	if srv != nil {
		_ = srv.Close()
	}
	if ln != nil {
		_ = ln.Close()
	}
}

func headerHasToken(value, token string) bool {
	for _, part := range strings.Split(value, ",") {
		if strings.EqualFold(strings.TrimSpace(part), token) {
			return true
		}
	}
	return false
}

func dialWebSocket(wsURL string) (net.Conn, *bufio.Reader, error) {
	parsed, err := url.Parse(wsURL)
	if err != nil {
		return nil, nil, err
	}

	host := parsed.Host
	if !strings.Contains(host, ":") {
		if parsed.Scheme == "wss" {
			host += ":443"
		} else {
			host += ":80"
		}
	}

	var conn net.Conn
	switch parsed.Scheme {
	case "ws":
		conn, err = net.DialTimeout("tcp", host, 5*time.Second)
	case "wss":
		return nil, nil, fmt.Errorf("wss is not supported; use ws://127.0.0.1 for local Studio bridge")
	default:
		return nil, nil, fmt.Errorf("unsupported websocket scheme %q", parsed.Scheme)
	}
	if err != nil {
		return nil, nil, err
	}

	keyBytes := make([]byte, 16)
	if _, err := rand.Read(keyBytes); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}
	key := base64.StdEncoding.EncodeToString(keyBytes)

	path := parsed.Path
	if path == "" {
		path = "/"
	}
	if parsed.RawQuery != "" {
		path += "?" + parsed.RawQuery
	}

	request := fmt.Sprintf(
		"GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n",
		path, parsed.Hostname(), key,
	)
	if _, err := conn.Write([]byte(request)); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}

	reader := bufio.NewReader(conn)
	response, err := http.ReadResponse(reader, &http.Request{Method: http.MethodGet})
	if err != nil {
		_ = conn.Close()
		return nil, nil, err
	}
	if response.StatusCode != http.StatusSwitchingProtocols {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("websocket handshake failed: %s", response.Status)
	}

	accept := response.Header.Get("Sec-WebSocket-Accept")
	expected := computeAccept(key)
	if accept != expected {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("invalid websocket accept header")
	}

	return conn, reader, nil
}

func computeAccept(key string) string {
	const magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	hash := sha1.Sum([]byte(key + magic))
	return base64.StdEncoding.EncodeToString(hash[:])
}

func writeTextFrame(conn net.Conn, payload []byte, mask bool) error {
	return writeFrame(conn, 0x1, payload, mask)
}

func writeCloseFrame(conn net.Conn, mask bool) error {
	return writeFrame(conn, 0x8, nil, mask)
}

func writeFrame(conn net.Conn, opcode byte, payload []byte, mask bool) error {
	header := []byte{0x80 | opcode}
	n := len(payload)
	maskBit := byte(0)
	if mask {
		maskBit = 0x80
	}
	switch {
	case n <= 125:
		header = append(header, maskBit|byte(n))
	case n <= 65535:
		header = append(header, maskBit|126)
		size := make([]byte, 2)
		binary.BigEndian.PutUint16(size, uint16(n))
		header = append(header, size...)
	default:
		header = append(header, maskBit|127)
		size := make([]byte, 8)
		binary.BigEndian.PutUint64(size, uint64(n))
		header = append(header, size...)
	}

	body := payload
	if mask {
		maskKey := make([]byte, 4)
		if _, err := rand.Read(maskKey); err != nil {
			return err
		}
		header = append(header, maskKey...)
		body = make([]byte, n)
		for i := 0; i < n; i++ {
			body[i] = payload[i] ^ maskKey[i%4]
		}
	}

	if _, err := conn.Write(header); err != nil {
		return err
	}
	if len(body) == 0 {
		return nil
	}
	_, err := conn.Write(body)
	return err
}

func readWebSocketPayload(reader *bufio.Reader) ([]byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(reader, header); err != nil {
		return nil, err
	}

	payloadLen := int(header[1] & 0x7f)
	switch payloadLen {
	case 126:
		size := make([]byte, 2)
		if _, err := io.ReadFull(reader, size); err != nil {
			return nil, err
		}
		payloadLen = int(binary.BigEndian.Uint16(size))
	case 127:
		size := make([]byte, 8)
		if _, err := io.ReadFull(reader, size); err != nil {
			return nil, err
		}
		payloadLen = int(binary.BigEndian.Uint64(size))
	}

	masked := header[1]&0x80 != 0
	var maskKey []byte
	if masked {
		maskKey = make([]byte, 4)
		if _, err := io.ReadFull(reader, maskKey); err != nil {
			return nil, err
		}
	}

	payload := make([]byte, payloadLen)
	if payloadLen > 0 {
		if _, err := io.ReadFull(reader, payload); err != nil {
			return nil, err
		}
		if masked {
			for i := 0; i < payloadLen; i++ {
				payload[i] ^= maskKey[i%4]
			}
		}
	}

	opcode := header[0] & 0x0f
	if opcode == 0x8 {
		return payload, io.EOF
	}
	return payload, nil
}
