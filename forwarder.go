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

const studioWSEnv = "GAUGE_STUDIO_WS"

type wsForwarder struct {
	url    string
	mu     sync.Mutex
	conn   net.Conn
	reader *bufio.Reader
	closed bool
}

func newWSForwarder() *wsForwarder {
	return &wsForwarder{url: os.Getenv(studioWSEnv)}
}

func (f *wsForwarder) connect() {
	if f.url == "" {
		log.Printf("studio-reporter: %s is not set; execution events will not be forwarded", studioWSEnv)
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
			if err := readWebSocketFrame(reader); err != nil {
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
	if f.url == "" {
		return nil
	}

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal studio event: %w", err)
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.conn == nil {
		return nil
	}
	return writeTextFrame(f.conn, data)
}

func (f *wsForwarder) close() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	if f.conn != nil {
		_ = writeCloseFrame(f.conn)
		_ = f.conn.Close()
		f.conn = nil
		f.reader = nil
	}
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

func writeTextFrame(conn net.Conn, payload []byte) error {
	maskKey := make([]byte, 4)
	if _, err := rand.Read(maskKey); err != nil {
		return err
	}

	header := []byte{0x81}
	n := len(payload)
	switch {
	case n <= 125:
		header = append(header, byte(0x80|n))
	case n <= 65535:
		header = append(header, 0x80|126)
		size := make([]byte, 2)
		binary.BigEndian.PutUint16(size, uint16(n))
		header = append(header, size...)
	default:
		header = append(header, 0x80|127)
		size := make([]byte, 8)
		binary.BigEndian.PutUint64(size, uint64(n))
		header = append(header, size...)
	}
	header = append(header, maskKey...)

	masked := make([]byte, n)
	for i := 0; i < n; i++ {
		masked[i] = payload[i] ^ maskKey[i%4]
	}

	if _, err := conn.Write(header); err != nil {
		return err
	}
	_, err := conn.Write(masked)
	return err
}

func writeCloseFrame(conn net.Conn) error {
	maskKey := make([]byte, 4)
	if _, err := rand.Read(maskKey); err != nil {
		return err
	}
	// FIN + close opcode, masked, empty payload
	header := []byte{0x88, 0x80}
	header = append(header, maskKey...)
	_, err := conn.Write(header)
	return err
}

func readWebSocketFrame(reader *bufio.Reader) error {
	header := make([]byte, 2)
	if _, err := io.ReadFull(reader, header); err != nil {
		return err
	}

	payloadLen := int(header[1] & 0x7f)
	switch payloadLen {
	case 126:
		size := make([]byte, 2)
		if _, err := io.ReadFull(reader, size); err != nil {
			return err
		}
		payloadLen = int(binary.BigEndian.Uint16(size))
	case 127:
		size := make([]byte, 8)
		if _, err := io.ReadFull(reader, size); err != nil {
			return err
		}
		payloadLen = int(binary.BigEndian.Uint64(size))
	}

	if header[1]&0x80 != 0 {
		mask := make([]byte, 4)
		if _, err := io.ReadFull(reader, mask); err != nil {
			return err
		}
	}

	if payloadLen > 0 {
		payload := make([]byte, payloadLen)
		if _, err := io.ReadFull(reader, payload); err != nil {
			return err
		}
	}

	opcode := header[0] & 0x0f
	if opcode == 0x8 {
		return io.EOF
	}
	return nil
}
