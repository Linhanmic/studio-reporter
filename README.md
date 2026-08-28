# Studio Reporter Plugin

A Gauge plugin that forwards test execution lifecycle events to Gauge Studio via WebSocket in real-time, and generates an HTML report in the CANoe Test Report Viewer style.

## Overview

The Studio Reporter Plugin is a gRPC plugin for the [Gauge test framework](https://gauge.org/) that monitors test execution, forwards events to [Gauge Studio](https://github.com/gaugestudio/gauge-studio) via WebSocket, and writes a local HTML report when the suite finishes.

## Features

- Real-time event forwarding via WebSocket (plugin listens on a random port and prints the URL)
- Auto-reconnect with exponential backoff
- Supports all Gauge execution lifecycle events
- HTML report generation (Vue 3 + Element Plus, CANoe-style layout)
- Overview dashboard, live result polling, and historical run management
- Cross-platform (Windows, Linux, macOS)
- Configurable message size limits

## Installation

### Download Pre-built Binaries

Download the latest release from the [Releases](https://github.com/Linhanmic/studio-reporter/releases) page.

### Build from Source

```bash
# Clone the repository
git clone https://github.com/Linhanmic/studio-reporter.git
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
| `GAUGE_STUDIO_WS` | No | - | Optional extra WebSocket URL to push events to. Live forwarding no longer requires this: the plugin listens on a random local port and prints `studio-reporter websocket: ws://127.0.0.1:<port>` |
| `gauge_max_message_size` | No | `1024` | Maximum gRPC message size in MB |
| `gauge_reports_dir` | No | `reports` | Gauge 报告根目录。相对路径会相对 `GAUGE_PROJECT_ROOT`（或当前工作目录） |
| `overwrite_reports` | No | `true` | Gauge 官方开关（保留兼容）。live 报告始终写入 `reports/studio-report/`；每次完成都会归档到 `archives/<id>/` |
| `over_write_reports` | No | - | `overwrite_reports` 的别名。二者都设置时以 `overwrite_reports` 为准 |
| `GAUGE_STUDIO_SKIP_REPORT` | No | - | Set to `true` to disable HTML report generation |
| `GAUGE_STUDIO_SKIP_BROWSER` | No | - | Kept for compatibility; the reporter no longer opens a browser by default |
| `GAUGE_STUDIO_OPEN_BROWSER` | No | - | Set to `true` to restore opening `index.html` in the default browser |

### Gauge Plugin Installation

```bash
# Install the plugin
gauge install studio-reporter --file studio-reporter-0.2.7-linux.x86_64.zip

# Or copy to Gauge plugin directory
cp -r studio-reporter ~/.gauge/plugins/studio-reporter/0.2.7/
```

## Usage

### Starting the Plugin

The plugin starts automatically when you run Gauge tests. It binds a random local WebSocket port and prints:

```text
studio-reporter websocket: ws://127.0.0.1:<port>
```

GaugeStudio (or any client) should connect to that URL. `GAUGE_STUDIO_WS` is no longer injected or required.

```bash
gauge run specs/
```

### Manual Start

```bash
./bin/studio-reporter --start
```

## HTML Report

When a suite finishes, the plugin writes a Vue 3 + Element Plus Test Report Viewer to `reports/studio-report/index.html` (unless `GAUGE_STUDIO_SKIP_REPORT` is set).

The report includes:

- **总览** page (`#/overview`): verdict banner, pass/fail donuts, and a spec summary table
- **详情** page (`#/detail`): slim expandable result tables in accordion mode
- **历史** page (`#/history`): completed runs under `archives/`, with open / delete
- Vue Router hash navigation between the three pages
- Overall verdict, duration, environment, and success rate
- Vue 3 + Vue Router + Element Plus + Pinia UI
- Passed rows in green and failed rows in red
- Runtime for every spec, scenario, concept, and step
- Live updates while the suite runs (`report.json`): seeded `running` flag, elapsed duration, current spec/scenario, success rate recount, no full-page reload
- Nested concepts, hook failures, screenshots, stack traces, and data tables
- Filter by verdict and search across specs, scenarios, and steps

The reporter does **not** open a browser. Open the file yourself, or serve the folder (needed to delete history from the UI):

```bash
# Linux
xdg-open reports/studio-report/index.html

# Optional local server (history delete API)
./bin/studio-reporter --serve --dir reports/studio-report --addr 127.0.0.1:8765
```

Set `GAUGE_STUDIO_OPEN_BROWSER=true` if you want the old auto-open behavior.

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
# Build for all platforms (writes Gauge zip packages to dist/)
./build-all.sh

# Build a single platform zip
./build.sh linux amd64
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
├── report.html          # Report viewer shell (CSS + Vue Router pages)
├── report-assets/       # Vue / Router / Element Plus / report-app.js
├── history.go           # Historical run index and archives
├── serve.go             # Optional HTTP server for history management
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
