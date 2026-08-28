# Studio Reporter — Report File Format

This document specifies the on-disk report format written by the studio-reporter Gauge plugin. It is the contract between the three parts of the tool chain:

1. **Report generation** — the Gauge plugin writes the files below while (and after) a suite runs.
2. **Report files** — a versioned, self-describing set of JSON files plus a static HTML viewer.
3. **Report management** — `manage.html` (and the optional `--serve` HTTP API) lists, opens, and deletes archived runs.

## Format version

Every top-level JSON artifact carries a `formatVersion` field (current: **1**). The version is bumped only for breaking changes (renamed/removed fields, changed semantics). Additive fields do not bump the version. Consumers should accept any file whose `formatVersion` is less than or equal to the version they support.

## Directory layout

The report hub is always `<gauge_reports_dir>/studio-report/` (default `reports/studio-report/`):

```
reports/studio-report/
├── index.html            # Report viewer (Vue 3 + Element Plus, seeded with the latest run)
├── manage.html           # Report management console (history list / open / delete)
├── assets/               # Viewer assets (vue, element-plus, pinia, report-app.js)
├── images/               # Screenshots of the latest run
├── report.json           # Live snapshot envelope of the latest run (polled by the viewer)
├── report-live.js        # Same payload as report.json, as JSONP for file:// viewing
├── last_run_result.json  # Raw Gauge SuiteExecutionResult (protojson), regeneration source
├── history.json          # Index of completed runs
├── history-live.js       # Same payload as history.json, as JSONP for file:// viewing
└── archives/<id>/        # One folder per completed run
    ├── report.json       # Frozen snapshot envelope of that run
    ├── report-live.js
    └── images/           # Screenshots of that run
```

## `report.json` — live snapshot envelope

Written atomically on every update while the suite runs, and once more when it finishes. The viewer polls it every 700 ms.

| Field | Type | Description |
|---|---|---|
| `formatVersion` | int | Format version, currently `1` |
| `rev` | int64 | Monotonic revision (Unix ms). Consumers apply a payload only if `rev` increases |
| `running` | bool | `true` while the suite is still executing |
| `report` | object | The report model (see below) |
| `currentSpecId` | string | ID of the spec currently executing (only while running) |
| `currentScenarioId` | string | ID of the scenario currently executing (only while running) |
| `startedAt` | int64 | Suite start time (Unix ms, only while running) |

`report-live.js` contains the identical payload assigned to `window.__GAUGE_LIVE__` so the viewer also works over `file://` where `fetch` is blocked.

## Report model (`report` object)

Top-level fields:

| Field | Type | Description |
|---|---|---|
| `projectName`, `environment`, `tags` | string | Suite metadata |
| `timestamp`, `timestampISO` | string | Local display time and RFC 3339 time |
| `executionTime` | int64 | Total duration in ms |
| `duration` | string | `HH:MM:SS.mmm` |
| `successRate` | float | Percentage of passed scenarios |
| `failed` | bool | Suite verdict flag |
| `verdict` | string | `pass` \| `fail` \| `skip` \| `none` |
| `summary` | object | `{specs, scenarios, steps}`, each `{total, passed, failed, skipped}` |
| `specs` | array | Spec reports |
| `preHookFailure`, `postHookFailure` | object | Suite hook failures (optional) |

Each spec contains `scenarios`; each scenario contains `contexts` / `items` / `teardowns`; items are steps, nested concepts (`concept.items`), or comments. Screenshot fields hold paths **relative to the folder containing that `report.json`** (e.g. `images/foo.png`). The authoritative field list is the Go structs in `report.go` (`Report`, `SpecReport`, `ScenarioReport`, `ItemReport`, `StepReport`, `HookFailure`).

## `last_run_result.json` — regeneration source

The unmodified Gauge `SuiteExecutionResult` in protojson encoding. It is the portable interchange format: the full HTML report can be rebuilt from this single file on any machine:

```bash
studio-reporter --input last_run_result.json --out /path/to/output
```

Its schema is owned by Gauge (`gauge_messages.SuiteExecutionResult`), so it carries no `formatVersion` of its own.

## `history.json` — run index

| Field | Type | Description |
|---|---|---|
| `formatVersion` | int | Format version, currently `1` |
| `runs` | array | Newest first |

Each entry:

| Field | Type | Description |
|---|---|---|
| `id` | string | Archive folder name (timestamp-based, unique) |
| `relDir` | string | Run folder relative to the hub, e.g. `archives/<id>` |
| `href` | string | Relative path to the run's `report.json` |
| `projectName`, `timestamp`, `timestampISO`, `duration`, `verdict`, `failed` | | Copied from the run |
| `summary` | object | Same shape as the report summary |

`history-live.js` assigns the identical payload to `window.__GAUGE_HISTORY__` for `file://` viewing.

## Opening archived runs

The viewer accepts a `run` query parameter holding a hub-relative folder:

```
index.html?run=archives/2026-08-28_10.00.00
```

It then loads `<run>/report.json` (fallback `<run>/report-live.js`), resolves screenshots against that folder, disables live polling, and shows an「归档」badge. The parameter is sanitized: absolute paths, drive letters, and `..` segments are rejected.

## Management console and HTTP API

`manage.html` is a standalone page written next to `index.html`. It lists `history.json`, opens runs via `index.html?run=...`, and deletes archives through the HTTP API. Deleting requires serving the hub:

```bash
studio-reporter --serve --dir reports/studio-report --addr 127.0.0.1:8765
```

| Endpoint | Method | Description |
|---|---|---|
| `/api/history` | GET | Returns `history.json` |
| `/api/history/{id}` | DELETE | Removes `archives/<id>` and its index entry. Loopback clients only |

Static files (viewer, manage console, archives) are served from the hub root with `Cache-Control: no-store`.
