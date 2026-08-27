# Studio Reporter Plugin API Documentation

## Overview

The Studio Reporter Plugin is a gRPC plugin for Gauge test framework that forwards test execution events to Gauge Studio via WebSocket in real-time.

## Version

- Plugin Version: 1.0.0
- Protocol: WebSocket
- Format: JSON

## Connection

### Endpoint

The plugin connects to the WebSocket server provided by Gauge Studio.

- **Protocol**: `ws://` (WebSocket without TLS)
- **Default Port**: 8080
- **Path**: Root `/` or custom path

### Configuration

Configure the WebSocket endpoint via environment variable:

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `GAUGE_STUDIO_WS` | Yes (for live forwarding) | - | WebSocket server URL (e.g., `ws://127.0.0.1:8080`) |
| `gauge_max_message_size` | No | `1024` | Maximum gRPC message size in MB |
| `gauge_reports_dir` | No | `reports` | Directory for generated HTML reports |
| `overwrite_reports` | No | `true` | Overwrite the previous HTML report on each run |
| `GAUGE_STUDIO_SKIP_REPORT` | No | - | Set to `true` to skip HTML report generation |

### Connection Behavior

- Auto-reconnect on disconnection
- Exponential backoff: 1s → 2s → 4s → 8s → 10s (max)
- Silent operation if `GAUGE_STUDIO_WS` not set (events not forwarded)

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

On `SuiteResult`, the plugin generates a local HTML report modeled after CANoe Test Report Viewer:

- Top title bar and verdict filter toolbar
- Left **Execution Tree**: suite → specs (test groups) → scenarios (test cases)
- Right content pane: overview statistics or test-step table
- Color-coded verdicts: pass (green), fail (red), skip (grey)
- Nested concepts, hook failures, screenshots, stack traces, and data tables

Default output:

```
reports/studio-report/index.html
reports/studio-report/last_run_result.json
reports/studio-report/images/
```

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
| `GAUGE_STUDIO_WS` not set | Plugin starts normally, events not forwarded, warning logged |
| Connection refused | Auto-retry with exponential backoff |
| Connection dropped | Auto-reconnect, continue forwarding |
| Invalid URL format | Warning logged, events not forwarded |

### Message Errors

| Error | Behavior |
|-------|----------|
| JSON serialization failed | Error logged, message dropped |
| WebSocket send failed | Error logged, connection retried |

## Client Implementation Guide

### TypeScript/JavaScript Example

```typescript
import { WebSocketServer } from 'ws';

interface StudioEvent {
  type: string;
  timestamp: string;
  payload: any;
}

class GaugeStudioReceiver {
  private wss: WebSocketServer;
  private eventHandlers: Map<string, (payload: any) => void> = new Map();

  constructor(port: number = 8080) {
    this.wss = new WebSocketServer({ port });
    this.setupConnection();
  }

  private setupConnection(): void {
    this.wss.on('connection', (ws) => {
      console.log('Studio Reporter connected');

      ws.on('message', (data) => {
        const event: StudioEvent = JSON.parse(data.toString());
        this.handleEvent(event);
      });

      ws.on('close', () => {
        console.log('Studio Reporter disconnected');
      });
    });
  }

  private handleEvent(event: StudioEvent): void {
    const handler = this.eventHandlers.get(event.type);
    if (handler) {
      handler(event.payload);
    }
  }

  onExecutionStarting(handler: (payload: any) => void): void {
    this.eventHandlers.set('ExecutionStarting', handler);
  }

  onExecutionEnding(handler: (payload: any) => void): void {
    this.eventHandlers.set('ExecutionEnding', handler);
  }

  onSpecExecutionStarting(handler: (payload: any) => void): void {
    this.eventHandlers.set('SpecExecutionStarting', handler);
  }

  onScenarioExecutionStarting(handler: (payload: any) => void): void {
    this.eventHandlers.set('ScenarioExecutionStarting', handler);
  }

  onStepExecutionEnding(handler: (payload: any) => void): void {
    this.eventHandlers.set('StepExecutionEnding', handler);
  }

  onSuiteResult(handler: (payload: any) => void): void {
    this.eventHandlers.set('SuiteResult', handler);
  }

  onReportGenerated(handler: (payload: any) => void): void {
    this.eventHandlers.set('ReportGenerated', handler);
  }
}

// Usage
const receiver = new GaugeStudioReceiver(8080);

receiver.onExecutionStarting((payload) => {
  console.log('Test suite started');
});

receiver.onSuiteResult((payload) => {
  console.log('Test suite completed');
  console.log('Results:', payload.specResults);
});
```

## Environment Setup

### Starting the Plugin

```bash
# Set environment variable
export GAUGE_STUDIO_WS="ws://127.0.0.1:8080"

# Run tests (plugin starts automatically)
gauge run specs/
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
