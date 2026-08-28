package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func serveReportDir(dir, addr string) error {
	if dir == "" {
		root, err := studioReportRoot()
		if err != nil {
			return err
		}
		dir = root
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return fmt.Errorf("resolve serve dir: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return fmt.Errorf("create serve dir: %w", err)
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", addr, err)
	}
	log.Printf("studio-reporter: serving %s at http://%s/", abs, listener.Addr())
	fmt.Printf("studio-reporter serve: http://%s/\n", listener.Addr())
	return http.Serve(listener, historyServeMux(abs))
}

func historyServeMux(root string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/history", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		http.ServeFile(w, r, filepath.Join(root, historyFileName))
	})
	mux.HandleFunc("/api/history/", func(w http.ResponseWriter, r *http.Request) {
		id := path.Base(strings.TrimPrefix(r.URL.Path, "/api/history/"))
		if r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !requestIsLoopback(r) {
			http.Error(w, "delete is only allowed from localhost", http.StatusForbidden)
			return
		}
		if err := deleteHistoryRun(root, id); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true", "id": id})
	})
	mux.Handle("/", noCache(http.FileServer(http.Dir(root))))
	return mux
}

func requestIsLoopback(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func noCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
