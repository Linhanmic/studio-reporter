# @studio-reporter/discover

Shared WebSocket discover helpers for Studio Reporter Desktop and GaugeStudio.

## Contract

Plugin stdout (Gauge `--start`) prints:

```text
studio-reporter websocket: ws://127.0.0.1:<port>
```

## API

- `REPORTER_WS_LINE_RE` — regex for the discover line
- `extractReporterWsUrl(text)` — first match or `null`
- `normalizeWsInput(input)` — bare port / URL / full discover line → `ws://127.0.0.1:<port>`

## Usage

```js
const { normalizeWsInput, extractReporterWsUrl } = require('@studio-reporter/discover');
```

In this monorepo Desktop depends via `file:../packages/studio-reporter-discover`.
