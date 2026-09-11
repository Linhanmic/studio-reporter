package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"strconv"

	"github.com/gaugestudio/studio-reporter/internal/report"
	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"google.golang.org/grpc"
)

const (
	portPrefix      = "Listening on port:"
	pluginActionEnv = "studio-reporter_action"
	executionAction = "execution"
	gaugeMaxMsgSize = "gauge_max_message_size"
	defaultMaxMsgMB = 1024
)

func main() {
	log.SetFlags(log.LstdFlags)
	args := os.Args[1:]
	gaugeExec := os.Getenv(pluginActionEnv) == executionAction
	os.Exit(dispatch(args, gaugeExec, os.Stdout, os.Stderr))
}

func startGRPCServer(forwarder *wsForwarder) error {
	address, err := net.ResolveTCPAddr("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("resolve listen address: %w", err)
	}
	listener, err := net.ListenTCP("tcp", address)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	maxMsgSize := maxMessageSizeMB() * 1024 * 1024
	server := grpc.NewServer(grpc.MaxRecvMsgSize(maxMsgSize), grpc.MaxSendMsgSize(maxMsgSize))
	handler := &reporterHandler{
		server:    server,
		forwarder: forwarder,
	}
	gauge_messages.RegisterReporterServer(server, handler)
	fmt.Printf("%s%d\n", portPrefix, listener.Addr().(*net.TCPAddr).Port)
	return server.Serve(listener)
}

func maxMessageSizeMB() int {
	value := os.Getenv(gaugeMaxMsgSize)
	if value == "" {
		return defaultMaxMsgMB
	}
	size, err := strconv.Atoi(value)
	if err != nil || size <= 0 {
		return defaultMaxMsgMB
	}
	return size
}

var _ = report.PluginVersion
