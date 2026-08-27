# Studio Reporter Plugin

A Gauge plugin that forwards test execution lifecycle events to Gauge Studio via WebSocket in real-time, and generates an HTML report in the CANoe Test Report Viewer style.

## Overview

The Studio Reporter Plugin is a gRPC plugin for the [Gauge test framework](https://gauge.org/) that monitors test execution, forwards events to [Gauge Studio](https://github.com/gaugestudio/gauge-studio) via WebSocket, and writes a local HTML report when the suite finishes.

## Features

- Real-time event forwarding via WebSocket
- Auto-reconnect with exponential backoff
- Supports all Gauge execution lifecycle events
- HTML report generation (CANoe Test Report Viewer layout)
- Cross-platform (Windows, Linux, macOS)
- Configurable message size limits

## Installation

### Download Pre-built Binaries

Download the latest release from the [Releases](https://github.com/gaugestudio/studio-reporter/releases) page.

### Build from Source

```bash
# Clone the repository
git clone https://github.com/gaugestudio/studio-reporter.git
cd studio-reporter

# Build for current platform
go build -o bin/studio-reporter ./...

# Or use the build script
./build.sh  # Linux/macOS
.\build.ps1 # Windows
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GAUGE_STUDIO_WS` | Yes (for live forwarding) | - | WebSocket server URL (e.g., `ws://127.0.0.1:8080`) |
| `gauge_max_message_size` | No | `1024` | Maximum gRPC message size in MB |
| `gauge_reports_dir` | No | `reports` | Directory for generated HTML reports |
| `overwrite_reports` | No | `true` | Overwrite `reports/studio-report` on each run. Set `false` to keep timestamped copies |
| `GAUGE_STUDIO_SKIP_REPORT` | No | - | Set to `true` to disable HTML report generation |

### Gauge Plugin Installation

```bash
# Install the plugin
gauge install studio-reporter --file studio-reporter-0.1.0-linux.x86_64.zip

# Or copy to Gauge plugin directory
cp -r studio-reporter ~/.gauge/plugins/studio-reporter/0.1.0/
```

## Usage

### Starting the Plugin

The plugin starts automatically when you run Gauge tests:

```bash
# Set environment variable
export GAUGE_STUDIO_WS="ws://127.0.0.1:8080"

# Run tests
gauge run specs/
```

### Manual Start

```bash
# Start the plugin directly
./bin/studio-reporter --start

# Or with environment variable
GAUGE_STUDIO_WS="ws://127.0.0.1:8080" ./bin/studio-reporter --start
```

## HTML Report

When a suite finishes, the plugin writes a CANoe-style Test Report Viewer to `reports/studio-report/index.html` (unless `GAUGE_STUDIO_SKIP_REPORT` is set).

The report includes:

- Overall verdict, duration, environment, and success rate
- An Execution Tree of specs (test groups) and scenarios (test cases)
- Test step tables with pass / fail / skip verdicts
- Nested concepts, hook failures, screenshots, stack traces, and data tables
- Filter by verdict and search across specs, scenarios, and steps

Open the file in a browser:

```bash
# Linux
xdg-open reports/studio-report/index.html
```

### Regenerate a report

The plugin also writes `last_run_result.json` next to `index.html`. You can rebuild the HTML without re-running tests:

```bash
./bin/studio-reporter --input reports/studio-report/last_run_result.json --out /tmp/studio-report
```

## Development

### Prerequisites

- Go 1.26 or later
- [Gauge](https://gauge.org/) 1.0.7 or later

### Building

```bash
# Build for all platforms
./build-all.sh

# Build for specific platform
GOOS=linux GOARCH=amd64 go build -o bin/studio-reporter-linux-amd64 ./...
GOOS=windows GOARCH=amd64 go build -o bin/studio-reporter-windows-amd64.exe ./...
GOOS=darwin GOARCH=amd64 go build -o bin/studio-reporter-darwin-amd64 ./...
```

### Testing

```bash
# Run tests
go test ./...

# Run with coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Project Structure

```
studio-reporter/
├── main.go              # Entry point
├── reporter.go          # gRPC handler implementation
├── events.go            # Event types and structures
├── forwarder.go         # WebSocket forwarder
├── report.go            # HTML report model and generation
├── report.html          # CANoe-style Test Report Viewer
├── report_html.go       # Embedded report template
├── go.mod               # Go module definition
├── go.sum               # Go module checksums
├── plugin.json          # Gauge plugin configuration
├── README.md            # This file
├── API.md               # API documentation
├── LICENSE              # MIT License
├── bin/                 # Compiled binaries
├── build.sh             # Linux/macOS build script
├── build.ps1            # Windows build script
├── build-all.sh         # Cross-platform build script
└── .gitignore           # Git ignore rules
```

## API Documentation

See [API.md](API.md) for detailed API documentation including:

- WebSocket connection details
- Message format specification
- Event types and lifecycle
- Payload structures
- Error handling

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- Run `go fmt` before committing
- Run `go vet` and `golangci-lint` for static analysis

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Gauge](https://gauge.org/) - Test automation framework
- [gRPC](https://grpc.io/) - Remote procedure call framework
- [Gauge Studio](https://github.com/gaugestudio/gauge-studio) - Test reporting and visualization
