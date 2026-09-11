# Studio Reporter — Report File Format

This document specifies the on-disk report format written by studio-reporter (standalone tool / Gauge plugin mode). It is the contract between the three parts of the tool chain:

1. **Report generation** — the Gauge plugin writes the files below while (and after) a suite runs.
2. **Report files** — a versioned, self-describing set of JSON files plus a static HTML viewer.
3. **Report management** — `manage.html` (and the optional `--serve` HTTP API) lists, opens, and deletes archived runs.

## Format version

Every top-level JSON artifact carries a `formatVersion` field (current: **1**). The version is bumped only for breaking changes (renamed/removed fields, changed semantics). Additive fields do not bump the version. Consumers should accept any file whose `formatVersion` is less than or equal to the version they support.

## Directory layout

The report hub is always `<gauge_reports_dir>/studio-report/` (default `reports/studio-report/`):

```
reports/studio-report/
├── index.html            # Static HTML report (CANoe-like: Overview + left nav + results; no embedded JSON)
├── report.pdf            # Optional structured PDF twin (Chrome print; enable via --pdf / GAUGE_STUDIO_WRITE_PDF)
├── report.single.html    # Optional self-contained HTML (images inlined; --single / GAUGE_STUDIO_WRITE_SINGLE)
├── viewer.html           # Live Vue viewer (WebSocket / poll report.json)
├── manage.html           # Report management console (history list / open / delete)
├── assets/               # Live viewer assets (vue, element-plus, pinia, report-app.js)
├── images/               # Screenshots of the latest run
├── report.json                        # Snapshot envelope of the latest run (debug / live viewer)
├── report-live.js                     # Same payload as report.json, as JSONP for file:// viewing
├── <project>-<timestamp>.uhilreport   # Portable report file (raw Gauge SuiteExecutionResult, protojson)
├── history.json                       # Index of completed runs
├── history-live.js                    # Same payload as history.json, as JSONP for file:// viewing
└── archives/<project>-<timestamp>/    # One folder per completed run
    ├── index.html                     # Static HTML report for that run
    ├── report.json                    # Frozen snapshot envelope of that run
    ├── report-live.js
    ├── <project>-<timestamp>.uhilreport
    └── images/                        # Screenshots of that run
```

## `report.json` — live snapshot envelope

Written atomically **when the suite finishes** (and on `--input` regeneration). While the suite is still running, the plugin keeps the tree in memory and streams `ReportSnapshot` events over WebSocket instead of updating this file. `viewer.html` polls it every 700 ms when WebSocket is unavailable. **While `running` is true, each scenario omits `contexts` / `items` / `teardowns`** (live detail stops at the scenario layer). The final snapshot after `SuiteResult` restores the full step tree.

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
| `meta` | object | Additive Overview metadata (`pluginVersion`, `hostName`, `goos`/`goarch`, `numCPU`, `projectRoot`, `generatedAt`/`generatedAtISO`, `extra`); does **not** bump `formatVersion` |

Each spec contains `scenarios`; each scenario contains `contexts` / `items` / `teardowns`; items are steps, nested concepts (`concept.items`), or comments. Screenshot fields hold paths **relative to the folder containing that `report.json`** (e.g. `images/foo.png`). The authoritative field list is the Go structs in `internal/report/model.go` (`Report`, `SpecReport`, `ScenarioReport`, `ItemReport`, `StepReport`, `HookFailure`).

## `*.uhilreport` — portable report file

The report file uses the **`.uhilreport`** extension and is named after the run:

```
<project>-<YYYY-MM-DD_HH.MM.SS>.uhilreport     e.g. demo-project-2026-08-28_10.30.00.uhilreport
```

The project name is sanitized for filesystem safety (path separators, `:*?"<>|` and spaces are replaced) and the timestamp is the suite execution time in local time. The report hub keeps only the latest run's file (stale `*.uhilreport` files are removed on each write); every archived run keeps its own copy under `archives/<project>-<timestamp>/`.

Its content is the Gauge `SuiteExecutionResult` in protojson encoding (UTF-8 JSON text). On write, studio-reporter **rewrites screenshot file fields** from Gauge’s absolute paths to hub-relative `images/<name>` paths (matching the copied files next to the `.uhilreport`). The portable unit is therefore **`<run>.uhilreport` + sibling `images/`** (hub root or an `archives/<id>/` folder):

```bash
studio-reporter generate --input demo-project-2026-08-28_10.30.00.uhilreport --out /path/to/output
```

`--input` resolves relative `images/...` paths against the directory that contains the `.uhilreport`. Older files that still store absolute paths also fall back to `<uhilreport-dir>/images/<basename>` when the absolute source is gone.

Its schema is owned by Gauge (`gauge_messages.SuiteExecutionResult`), so it carries no `formatVersion` of its own. `--input` is content-based and also accepts files written by older plugin versions (`report.uhilreport` from 0.3.1, `last_run_result.json` before that — same content, older names).

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
| `href` | string | Relative path to the run's static `index.html` |
| `projectName`, `timestamp`, `timestampISO`, `duration`, `verdict`, `failed` | | Copied from the run |
| `summary` | object | Same shape as the report summary |

`history-live.js` assigns the identical payload to `window.__GAUGE_HISTORY__` for `file://` viewing.

## Opening reports

- **Latest completed run:** open `index.html` — a self-contained static HTML page with all data pre-rendered (no Vue, no embedded JSON).
- **Live run:** open `viewer.html?ws=ws://127.0.0.1:<port>` (or poll `report.json` after finalize).
- **Archived run:** open `archives/<id>/index.html` directly (each archive folder contains its own static report).

`viewer.html` still accepts a `run` query parameter for hub-relative folders (loads `<run>/report.json`). The parameter is sanitized: absolute paths, drive letters, and `..` segments are rejected.

## Management console and HTTP API

`manage.html` is a standalone page written next to `index.html`. It lists `history.json`, opens runs via their static `index.html`, **compares two selected runs** (verdict change, duration delta, specs/scenarios/steps count deltas — computed client-side from history entries), and deletes archives through the HTTP API. Deleting requires serving the hub:

```bash
studio-reporter --serve --dir reports/studio-report --addr 127.0.0.1:8765
```

| Endpoint | Method | Description |
|---|---|---|
| `/api/history` | GET | Returns `history.json` |
| `/api/history/{id}` | DELETE | Removes `archives/<id>` and its index entry. Loopback clients only |
| `/api/fail-digest` | POST | Rewrite hub `fail-digest.md`/`fail-digest.json` from `history.json`. Loopback clients only |

### `fail-digest.md` / `fail-digest.json`

Hub sidecars written by `studio-reporter digest --write`, Desktop export/refresh, plugin finalize, or `POST /api/fail-digest`.

`fail-digest.json` (additive fields; current `formatVersion` **1**):

| Field | Type | Notes |
|-------|------|-------|
| `format` | string | `studio-reporter.historyFailDigest/v1` |
| `formatVersion` | int | Schema version, currently `1` |
| `generatedAt` | string | RFC3339 UTC timestamp when the digest was built |
| `hubDir` | string | Absolute hub path when known |
| `runCount` / `failRunCount` / … | int | Window counters |
| `groups` | array | Aggregated `topFailReason` groups |
| `openLinksLatest` / `openLinksAll` | string[] | Optional deep links when hub is known |

Markdown includes the same `formatVersion` / `generatedAt` meta lines for human/CI grepping.


Static files (viewer, manage console, archives) are served from the hub root with `Cache-Control: no-store`.
