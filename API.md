# Studio Reporter Plugin API Documentation

## Overview

The Studio Reporter Plugin is a gRPC plugin for Gauge test framework that forwards test execution events to Gauge Studio via WebSocket in real-time.

The on-disk report file format is specified separately in [REPORT_FORMAT.md](REPORT_FORMAT.md).

## Version

- Plugin Version: 0.3.0
- Protocol: WebSocket
- Format: JSON

## Connection

### Endpoint

The plugin **listens** on a random local WebSocket port after it starts. GaugeStudio (or any client) connects to the plugin.

- **Protocol**: `ws://` (WebSocket without TLS)
- **Bind address**: `127.0.0.1:0` (OS-assigned ephemeral port)
- **Stdout line** (parse this; do not inject `GAUGE_STUDIO_WS`):

```text
studio-reporter websocket: ws://127.0.0.1:<port>
```

- **Path**: `/`

### Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `GAUGE_STUDIO_WS` | No | - | Optional extra URL the plugin also pushes to as a client. Live forwarding does not require this. |
| `gauge_max_message_size` | No | `1024` | Maximum gRPC message size in MB |
| `gauge_reports_dir` | No | `reports` | Directory for generated HTML reports |
| `overwrite_reports` | No | `true` | Kept for Gauge compatibility. Live HTML always writes to `reports/studio-report/`; every completed run is archived under `archives/<id>/` |
| `over_write_reports` | No | - | Alias of `overwrite_reports` |
| `GAUGE_STUDIO_SKIP_REPORT` | No | - | Set to `true` to skip HTML report generation |
| `GAUGE_STUDIO_SKIP_BROWSER` | No | - | Compatibility flag; the reporter no longer opens a browser by default |
| `GAUGE_STUDIO_OPEN_BROWSER` | No | - | Set to `true` to open `index.html` in the default browser |

### Connection Behavior

- Plugin binds a random port and prints `studio-reporter websocket: ws://127.0.0.1:<port>`
- Studio connects to that URL and receives JSON envelopes
- If `GAUGE_STUDIO_WS` is set, the plugin also connects outbound with auto-reconnect (1s → 2s → 4s → 8s → 10s)

## Message Format

All messages are JSON-encoded with the following envelope structure:

```json
{
  "type": "EventType",
  "timestamp": "ISO8601_FORMATTED_TIMESTAMP",
  "payload": { }
}
```

### Envelope Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Event type identifier |
| `timestamp` | `string` | Yes | ISO 8601 timestamp in UTC with nanosecond precision |
| `payload` | `object` | Yes | Event-specific data structure |

### Timestamp Format

```
2026-07-29T14:30:00.123456789Z
```

- Timezone: UTC
- Format: RFC3339 with nanoseconds

## Events

### ExecutionStarting

Fired when the test suite execution begins.

- **Type**: `ExecutionStarting`
- **Payload Type**: `ExecutionStartingRequest`

```json
{
  "type": "ExecutionStarting",
  "timestamp": "2026-07-29T14:30:00.123456789Z",
  "payload": {
    "currentExecutionInfo": {
      "currentSpec": null,
      "currentScenario": null,
      "currentStep": null
    }
  }
}
```

### ExecutionEnding

Fired when the test suite execution completes.

- **Type**: `ExecutionEnding`
- **Payload Type**: `ExecutionEndingRequest`

```json
{
  "type": "ExecutionEnding",
  "timestamp": "2026-07-29T15:00:00.123456789Z",
  "payload": {
    "currentExecutionInfo": {
      "currentSpec": null,
      "currentScenario": null,
      "currentStep": null
    }
  }
}
```

### SpecExecutionStarting

Fired when a Spec file begins execution.

- **Type**: `SpecExecutionStarting`
- **Payload Type**: `SpecExecutionStartingRequest`

```json
{
  "type": "SpecExecutionStarting",
  "timestamp": "2026-07-29T14:30:01.123456789Z",
  "payload": {
    "currentExecutionInfo": {
      "currentSpec": {
        "name": "Login Test",
        "fileName": "specs/login.spec",
        "tags": ["login", "smoke"]
      }
    }
  }
}
```

#### Spec Object

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Spec name |
| `fileName` | `string` | Spec file path |
| `tags` | `string[]` | Associated tags |

### SpecExecutionEnding

Fired when a Spec file execution completes.

- **Type**: `SpecExecutionEnding`
- **Payload Type**: `SpecExecutionEndingRequest`

### ScenarioExecutionStarting

Fired when a scenario within a Spec begins execution.

- **Type**: `ScenarioExecutionStarting`
- **Payload Type**: `ScenarioExecutionStartingRequest`

```json
{
  "type": "ScenarioExecutionStarting",
  "timestamp": "2026-07-29T14:30:02.123456789Z",
  "payload": {
    "currentExecutionInfo": {
      "currentSpec": {
        "name": "Login Test",
        "fileName": "specs/login.spec"
      },
      "currentScenario": {
        "name": "Successful login",
        "tags": ["happy-path"]
      }
    }
  }
}
```

#### Scenario Object

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Scenario name |
| `tags` | `string[]` | Associated tags |

### ScenarioExecutionEnding

Fired when a scenario execution completes.

- **Type**: `ScenarioExecutionEnding`
- **Payload Type**: `ScenarioExecutionEndingRequest`

### StepExecutionStarting

Fired when a step within a scenario begins execution.

- **Type**: `StepExecutionStarting`
- **Payload Type**: `StepExecutionStartingRequest`

```json
{
  "type": "StepExecutionStarting",
  "timestamp": "2026-07-29T14:30:03.123456789Z",
  "payload": {
    "currentExecutionInfo": {
      "currentStep": {
        "stepText": "Enter username as {}",
        "params": ["admin"]
      }
    }
  }
}
```

#### Step Object

| Field | Type | Description |
|-------|------|-------------|
| `stepText` | `string` | Step text with placeholders |
| `params` | `string[]` | Step parameters |

### StepExecutionEnding

Fired when a step execution completes.

- **Type**: `StepExecutionEnding`
- **Payload Type**: `StepExecutionEndingRequest`

```json
{
  "type": "StepExecutionEnding",
  "timestamp": "2026-07-29T14:30:04.123456789Z",
  "payload": {
    "currentExecutionInfo": {
      "currentStep": {
        "stepText": "Enter username as {}",
        "params": ["admin"]
      }
    },
    "executionResult": {
      "failed": false,
      "recovered": false,
      "errorMessage": "",
      "stackTrace": "",
      "executionTime": 150
    }
  }
}
```

#### ExecutionResult Object

| Field | Type | Description |
|-------|------|-------------|
| `failed` | `boolean` | Whether the step failed |
| `recovered` | `boolean` | Whether execution recovered from failure |
| `errorMessage` | `string` | Error message (if failed) |
| `stackTrace` | `string` | Stack trace (if failed) |
| `executionTime` | `integer` | Execution time in milliseconds |

### ConceptExecutionStarting

Fired when a concept (nested step) begins execution.

- **Type**: `ConceptExecutionStarting`
- **Payload Type**: `ConceptExecutionStartingRequest`

### ConceptExecutionEnding

Fired when a concept execution completes.

- **Type**: `ConceptExecutionEnding`
- **Payload Type**: `ConceptExecutionEndingRequest`

### SuiteResult

Fired when all tests complete with final results.

- **Type**: `SuiteResult`
- **Payload Type**: `SuiteExecutionResult`

```json
{
  "type": "SuiteResult",
  "timestamp": "2026-07-29T15:00:00.123456789Z",
  "payload": {
    "specResults": [
      {
        "spec": {
          "name": "Login Test",
          "fileName": "specs/login.spec"
        },
        "scenarioResults": [
          {
            "scenario": {
              "name": "Successful login"
            },
            "failed": false,
            "executionTime": 2500
          }
        ]
      }
    ],
    "executionTime": 60000
  }
}
```

### ReportGenerated

Fired after the HTML report has been written (unless `GAUGE_STUDIO_SKIP_REPORT` is set).

- **Type**: `ReportGenerated`
- **Payload Type**: object

```json
{
  "type": "ReportGenerated",
  "timestamp": "2026-07-29T15:00:00.223456789Z",
  "payload": {
    "reportPath": "/path/to/reports/studio-report/index.html",
    "jsonPath": "/path/to/reports/studio-report/last_run_result.json",
    "reportDir": "/path/to/reports/studio-report"
  }
}
```

## HTML Report

On `SuiteResult`, the plugin generates a local HTML report with Vue 3, Element Plus, and Pinia:

- Nested expandable tables: spec → data row / scenario → concept → step
- Fold controls match Gauge html-report: plus/minus squares; expanded blocks use a 5px left color bar (pass / fail / skip)
- Accordion mode: only one node at the same level is expanded; click a row or its fold control to expand/collapse
- Step console / hook output is merged into a single output card
- Does not open a browser unless `GAUGE_STUDIO_OPEN_BROWSER` is set
- Passed rows green, failed rows red
- Runtime on every spec, scenario, concept, and step
- Live `report.json` updates while the suite runs; the page is seeded with `running` / `currentSpecId` / elapsed duration and polls through Pinia without reload
- The hub is always `reports/studio-report/` (`index.html`, `report.json`, Vue assets)
- Hook failures, screenshots, stack traces, and data tables

Regenerate without re-running tests:

```bash
./bin/studio-reporter --input reports/studio-report/last_run_result.json --out /tmp/studio-report
```

## Event Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      ExecutionStarting                          │
│                             │                                   │
│         ┌───────────────────┼───────────────────┐               │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  SpecExecution      SpecExecution       SpecExecution          │
│   Starting #1        Starting #2         Starting #3           │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────────────────────────────────────────────┐        │
│  │              ScenarioExecution Starting              │        │
│  │                       │                             │        │
│  │     ┌─────────────────┼─────────────────┐           │        │
│  │     │                 │                 │           │        │
│  │     ▼                 ▼                 ▼           │        │
│  │  StepExecution   StepExecution    StepExecution    │        │
│  │   Starting #1     Starting #2      Starting #3    │        │
│  │     │                 │                 │           │        │
│  │     ▼                 ▼                 ▼           │        │
│  │  ConceptExecution  ConceptExecution  ConceptExecution│       │
│  │   Starting → Ending Starting → Ending Starting → Ending│    │
│  │     │                 │                 │           │        │
│  │     ▼                 ▼                 ▼           │        │
│  │  StepExecution   StepExecution    StepExecution    │        │
│  │   Ending #1       Ending #2        Ending #3      │        │
│  │     │                 │                 │           │        │
│  └─────┴─────────────────┴─────────────────┘           │        │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  SpecExecution      SpecExecution       SpecExecution          │
│   Ending #1          Ending #2           Ending #3            │
│         │                   │                   │               │
└─────────┴───────────────────┴───────────────────┘               │
                             │                                   │
                             ▼                                   │
                      ExecutionEnding                           │
                             │                                   │
                             ▼                                   │
                        SuiteResult                              │
                             │                                   │
                             ▼                                   │
                      ReportGenerated                            │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling

### Connection Errors

| Error | Behavior |
|-------|----------|
| Plugin starts, prints websocket URL | Studio should connect to that URL; no env injection |
| `GAUGE_STUDIO_WS` set | Optional extra outbound client; auto-retry with exponential backoff |
| Connection dropped | Local listeners stay up; outbound client auto-reconnects |

### Message Errors

| Error | Behavior |
|-------|----------|
| JSON serialization failed | Error logged, message dropped |
| WebSocket send failed | Error logged, connection retried |

## Client Implementation Guide

### TypeScript/JavaScript Example

```typescript
interface StudioEvent {
  type: string;
  timestamp: string;
  payload: any;
}

class GaugeStudioReceiver {
  private eventHandlers: Map<string, (payload: any) => void> = new Map();

  connect(url: string) {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => console.log('connected to', url));
    ws.addEventListener('message', (ev) => {
      const event: StudioEvent = JSON.parse(String(ev.data));
      const handler = this.eventHandlers.get(event.type);
      if (handler) handler(event.payload);
    });
  }

  onExecutionStarting(handler: (payload: any) => void): void {
    this.eventHandlers.set('ExecutionStarting', handler);
  }

  onSuiteResult(handler: (payload: any) => void): void {
    this.eventHandlers.set('SuiteResult', handler);
  }

  onReportGenerated(handler: (payload: any) => void): void {
    this.eventHandlers.set('ReportGenerated', handler);
  }
}

// Parse plugin stdout: "studio-reporter websocket: ws://127.0.0.1:54321"
const receiver = new GaugeStudioReceiver();
receiver.connect('ws://127.0.0.1:54321');
```

## Environment Setup

### Starting the Plugin

```bash
gauge run specs/
# stdout includes: studio-reporter websocket: ws://127.0.0.1:<port>
```

### Starting with Custom Message Size

```bash
export gauge_max_message_size="2048"
```

## Appendix

### Supported Gauge Versions

- Gauge >= 1.4.0

### Dependencies

- gauge-proto (gRPC message definitions)
- gRPC (plugin communication)
- WebSocket (event forwarding)
