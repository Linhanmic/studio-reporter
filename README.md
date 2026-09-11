# Studio Reporter Plugin

A **desktop-bound test report system**: Gauge reporter plugin (headless bridge) + CANoe-style HTML/PDF artifacts + engineering CLI. The product UX target is a **Desktop App** that connects to the plugin over WebSocket (see [DESKTOP.md](DESKTOP.md)).

## Overview

Studio Reporter ships today as a [Gauge](https://gauge.org/) reporter plugin (WS bridge + on-disk reports) plus a small CLI for regenerate/serve. The **intended product surface is a Desktop App** that discovers `studio-reporter websocket:` and shows live + final reports ([DESKTOP.md](DESKTOP.md)). GaugeStudio already consumes the same bridge; Reporter Desktop will own the report workbench UX.

## Features

- Real-time event forwarding via WebSocket (plugin listens on a random port and prints the URL)
- Auto-reconnect with exponential backoff
- Supports all Gauge execution lifecycle events
- **Static HTML report** at suite end (`index.html`, Go-rendered — no embedded JSON / no Vue required to read)
- **Live viewer** (`viewer.html`) via WebSocket `ReportSnapshot` while the suite runs (disk writes only on finalize)
- **Desktop P0 shell** (`desktop/`) — Electron workbench: paste/discover WS URL, embed live viewer + final `index.html`, control Hello/RequestSnapshot
- Spec / scenario filter toolbar on the static report (pass / fail / skip)
- **CANoe-style layout**: left navigation tree + right content, with an **Overview** page (env / host / plugin / stats)
- Screenshot galleries at suite / spec / scenario / step (hook + failure shots; click-to-enlarge lightbox)
- Optional **structured PDF** export via headless Chrome (`--pdf` / `GAUGE_STUDIO_WRITE_PDF`) — text + links + images, not a screenshot collage
- Optional **single-file HTML** (`--single` / `GAUGE_STUDIO_WRITE_SINGLE` → `report.single.html`) with screenshots inlined as data URIs; directory `index.html` remains the default source of truth
- Versioned report file format (see [REPORT_FORMAT.md](REPORT_FORMAT.md))
- Standalone report management console (`manage.html`): list, open, and delete archived runs
- Cross-platform (Windows, Linux, macOS)
- Configurable message size limits

## Docs

| Doc | Purpose |
|-----|---------|
| [QUICKSTART.md](QUICKSTART.md) | Install, first run, regenerate |
| [DESIGN.md](DESIGN.md) | Architecture and decisions |
| [DESKTOP.md](DESKTOP.md) | Desktop App architecture & roadmap |
| [TODO.md](TODO.md) | Backlog and iteration log |
| [REPORT_FORMAT.md](REPORT_FORMAT.md) | On-disk format contract |
| [API.md](API.md) | WebSocket / event protocol |

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
| `GAUGE_STUDIO_WRITE_PDF` | No | - | Set to `true` to also write `report.pdf` (requires Chrome/Chromium; or set `CHROME_PATH`) |
| `GAUGE_STUDIO_WRITE_SINGLE` | No | - | Set to `true` to also write `report.single.html` (screenshots inlined as data URIs) |
| `GAUGE_STUDIO_REPORT_META` | No | - | Extra Overview KV pairs: `k=v,k2=v2` |
| `CHROME_PATH` | No | - | Absolute path to Chrome/Chromium for PDF export |

### Gauge Plugin Installation

```bash
# Install the plugin (match the release version)
gauge install studio-reporter --file studio-reporter-0.5.2-linux.x86_64.zip

# Or unzip into the Gauge plugin directory
mkdir -p ~/.gauge/plugins/studio-reporter/0.5.2
unzip studio-reporter-0.5.2-linux.x86_64.zip -d ~/.gauge/plugins/studio-reporter/0.5.2
```

### Desktop App

```bash
cd desktop
npm install
npm start
# Paste: studio-reporter websocket: ws://127.0.0.1:<port>

make build && cd desktop && npm run pack:dir   # unpacked smoke build
make build-windows && cd desktop && npm run pack:dir:win  # Windows cross-pack
```

See [desktop/README.md](desktop/README.md) and [DESKTOP.md](DESKTOP.md).

## Usage

### Engineering CLI (optional)

```bash
# Rebuild HTML (+ optional PDF / single-file) from a portable .uhilreport
studio-reporter generate --input run.uhilreport --out /tmp/out --pdf --single

# Serve the report hub (history / manage console)
studio-reporter serve --dir reports/studio-report --addr 127.0.0.1:8765

studio-reporter version
studio-reporter help
```

Legacy flat flags (`--input`, `--serve`, `--start`) remain supported.

### Gauge plugin bridge (current runtime)


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
./bin/studio-reporter plugin   # or: --start
```

## HTML Report

When a suite finishes, the plugin writes a **static HTML report** to `reports/studio-report/index.html` (unless `GAUGE_STUDIO_SKIP_REPORT` is set). The page is fully rendered on the server side — no embedded JSON, no Vue runtime required to read the report.

The report includes:

- **Overview** home page: project / host / OS / plugin / format / custom meta + counts + spec list + **fail-reason clusters** (group by primary error)
- Left **navigation tree** (spec → scenario) with jump links; right content pane (CANoe-like)
- Nested expandable result blocks (spec → scenario → concept → step)
- Overall verdict, duration, environment, and success rate
- Passed rows in green and failed rows in red
- Runtime for every spec, scenario, concept, and step
- Nested concepts, hook failures, screenshots, stack traces, and data tables
- Screenshot logic: all step `screenshots` + failure shot highlighted; Suite/Spec/Scenario/Step before/after hook shots; lightbox enlarge; paths stay portable as `images/…`

**Live viewing** while the suite runs uses `viewer.html` (Vue 3 + Element Plus): the plugin keeps the report tree **in memory** and pushes `ReportSnapshot` over WebSocket; **no disk writes until the suite finishes**. Connect via `viewer.html?ws=ws://127.0.0.1:<port>` (or poll `report.json` after finalize). When the suite ends, the live viewer shows a banner with a CTA (and a cancellable countdown) to open the static `index.html` — the canonical final report with full step detail.

The reporter does **not** open a browser by default. Open the file yourself:

```bash
# Linux — completed report
xdg-open reports/studio-report/index.html

# Live run (optional)
xdg-open 'reports/studio-report/viewer.html?ws=ws://127.0.0.1:8765'
```

Set `GAUGE_STUDIO_OPEN_BROWSER=true` if you want the old auto-open behavior.

### Report files and management

The on-disk format (`report.json`, `<project>-<timestamp>.uhilreport`, `history.json`, `archives/`) is versioned and documented in [REPORT_FORMAT.md](REPORT_FORMAT.md).

Every completed run is archived under `reports/studio-report/archives/<id>/` (including a static `index.html`). The management console `reports/studio-report/manage.html` lists archived runs and opens them directly. Deleting archives from the console requires serving the hub:

```bash
./bin/studio-reporter --serve --dir reports/studio-report --addr 127.0.0.1:8765
# then open http://127.0.0.1:8765/manage.html
```

### Regenerate a report

The plugin also writes the portable report file `<project>-<timestamp>.uhilreport` next to `index.html` (and into every `archives/<project>-<timestamp>/`). Screenshot paths inside that file are rewritten to hub-relative `images/...` (keep the sibling `images/` folder with the `.uhilreport`). You can rebuild the HTML without re-running tests:

```bash
./bin/studio-reporter --input reports/studio-report/demo-project-2026-08-28_10.30.00.uhilreport --out /tmp/studio-report

# Optional: structured PDF twin (Chrome headless print — not a raster collage)
./bin/studio-reporter --input …/run.uhilreport --out /tmp/studio-report --pdf
# or: --pdf-out /tmp/studio-report/custom.pdf

# Optional: self-contained HTML (screenshots inlined as data URIs)
./bin/studio-reporter --input …/run.uhilreport --out /tmp/studio-report --single
# or: --single-out /tmp/studio-report/custom.single.html
```

In the HTML report, **导出 PDF** uses the browser print dialog (Overview included; nav hidden). Interactive navigation remains HTML-first; PDF is the shareable/printable twin. `report.single.html` is the email-/chat-friendly twin that does not need the `images/` folder.

`make smoke-input` verifies regeneration still copies screenshots after the original absolute Gauge paths are deleted.

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

### Testing / lint

```bash
make ci      # check-assets + vet + test + build
make cover   # go test -coverprofile + function/package summary
make smoke-input  # --input regeneration + screenshot relative paths
make smoke-complex  # dense fixture (nested concepts / shots / CJK / skip)
make demo-complex   # write .demo/complex-hub for manual browsing
make lint    # golangci-lint v2 (install matching CI pin locally)
make sync-assets
make hooks   # once per clone: core.hooksPath=.githooks (pre-commit check-assets)
```

See also [`testdata/complex-gauge/`](testdata/complex-gauge/) for the readable Gauge specs mirrored by `internal/complexsuite`.

CI runs `./scripts/cover-summary.sh` and uploads `cover.out` as an artifact (no hard threshold yet).

Static `index.html` print CSS respects the current filter/search (`filter-hidden` stays hidden — print what you see).
### Project Structure

```
studio-reporter/
├── main.go / reporter.go / report_bridge.go / forwarder.go
├── history.go / serve.go
├── viewer.html / manage.html / report-assets/   # live UI sources (SSoT)
├── internal/report/     # embed copies + static HTML renderer (make sync-assets)
├── scripts/sync-assets.sh / scripts/check-assets.sh
├── plugin.json
├── README.md / QUICKSTART.md / DESIGN.md / TODO.md
├── REPORT_FORMAT.md / API.md
├── .golangci.yml
├── .github/workflows/   # ci.yml + release.yml
├── Makefile
├── build.sh / build-all.sh / build.ps1
└── LICENSE
```

Edit live UI under the repo root, then run `make sync-assets` before committing. CI runs `make check-assets` so embed copies cannot silently drift.

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
- [Gauge Studio](https://github.com/Linhanmic/GaugeStudio) - Desktop client (discover WS URL from plugin stdout; v0.1.1+)
- [Gauge Studio](https://github.com/gaugestudio/gauge-studio) - Legacy link (may redirect / rename)
