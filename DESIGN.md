# Studio Reporter — Design

本文描述 **v0.4.7** 起的真实架构与关键决策。实现以仓库代码为准；文档随迭代更新。

## 产品目标

Gauge 执行期：

1. 把生命周期事件实时转发到 Gauge Studio（WebSocket）
2. 在本地生成可读、可归档、可再生成的测试报告

报告产品形态：

| 场景 | 入口 | 技术 |
|------|------|------|
| 终态阅读 / 分享 / 归档 | `index.html` | Go 端预渲染静态 HTML（无内嵌 JSON、无 Vue） |
| 运行中实时查看 | `viewer.html?ws=...` | Vue 3 + Element Plus + Pinia，WebSocket `ReportSnapshot` |
| 历史管理 | `manage.html` | 列表 / 打开归档 / 删除（删除需 `--serve`） |
| 调试 / 扩展 / 轮询回退 | `report.json` | 快照信封（`formatVersion` / `rev` / `running` / `report`） |
| 跨机再生 HTML | `*.uhilreport` | Gauge `SuiteExecutionResult` protojson |

## 架构

```
Gauge (gRPC)
  └─ reporter.go  ──► events → forwarder (WS to Studio)
                   └─► report.Engine / LivePublisher (内存树)
                         │ 运行中：SnapshotBroadcaster → EventReportSnapshot
                         └─ SuiteResult：FinalWriter
                              ├─ index.html   (static_render)
                              ├─ viewer.html + assets
                              ├─ report.json / report-live.js
                              ├─ <project>-<ts>.uhilreport
                              └─ history → archives/<id>/index.html
```

### 包边界（`internal/report`）

| 文件 | 职责 |
|------|------|
| `model.go` | 报告树类型与常量 |
| `convert.go` | proto → 报告树 |
| `live.go` | 运行中内存树（场景层细节） |
| `broadcast.go` | 快照广播接口 |
| `writer.go` / `snapshot.go` | 终态落盘 |
| `static_*.go` / `static_report.*` | 静态 HTML 渲染与过滤 |
| `orchestrate.go` | Suite 结束单路径 |
| `assets.go` | embed `viewer.html` / `manage.html` / assets |

主包负责：gRPC、WebSocket forwarder、history、`--serve`、浏览器打开回调。

## 决策原则

每次架构 / 设计变更须同时满足：

1. **可验证**：相对当前代码与用户可观察行为，说明解决什么问题、不解决什么问题  
2. **单一真源（SSoT）**：同一职责只保留一处可编辑来源；生成/嵌入副本由脚本同步，CI 校验漂移  
3. **可演进**：变更不破坏 `*.uhilreport` 再生、`report.json` 信封、`--start` 契约（除非明确升 `formatVersion`）  
4. **外部实践对照**：重大决策对照公开工程实践后再落盘（例如 Go `embed` 去重、golangci-lint v2 显式 opt-in）

参考实践（本轮采用）：

- Go `embed`：可编辑文件为真源，嵌入包只持有同步后的副本，避免双份 YAML/HTML 静默漂移（见 go-micro CRD embed 等案例）  
- golangci-lint v2：`linters.default: none` + 显式 enable；CI 钉死版本，避免本机/CI 漂移  

## 关键决策记录

| 日期 | 决策 | 理由 / 依据 |
|------|------|-------------|
| 2026-08 | 终态改为静态 HTML，不再内嵌 JSON SPA | 归档/离线可读；Vue 仅用于实时 |
| 2026-08 | 运行中不落盘，仅 WS 推送；结束时一次写入 | 减少 IO；单一真源在内存 |
| 2026-08 | Live 树停在 Spec→Scenario | 实时体积与刷新成本 |
| 2026-08 | 过滤按规格书 / 场景分组，场景命中则展示完整步骤 | 失败上下文完整 |
| 2026-09-11 | 无内容通过步骤改为 `leaf-row` | 减少空 `<details>` 噪音 |
| 2026-09-11 | 前端真源在仓库根，`make sync-assets` → `internal/report` embed | 发现 `report-app.js` 已漂移且 embed 副本丢失 WS 连接；对齐 embed SSoT 实践 |
| 2026-09-11 | 废弃根/`internal` 下无用的 `report.html` | 运行时只发布 `viewer.html`；死文件制造双名认知负担 |
| 2026-09-11 | 引入 golangci-lint v2 显式规则集 + CI 钉版本 | README 已承诺 lint；按 v2 推荐避免 `enable-all` 噪音 |
| 2026-09-11 | 实时 viewer 结束引导打开静态 `index.html`，不强切 SPA 终态 | Allure/Playwright 惯例是生成后再 open；`FinishWithReport` 早于落盘，故用 `ReportGenerated` + index 元数据变化探测；磁盘轮询见 `running=false` 时 index 已写完 |
| 2026-09-11 | CI 输出 cover profile 摘要，不强阈值、不写 PR 评论 | 对照 Go Actions 常见做法先可见再治理；阈值与 sticky comment 待覆盖率基线稳定后再加 |
| 2026-09-11 | 仓库内 `.githooks` + `make hooks`（`core.hooksPath`） | 前端变更时本地强制 `check-assets`；不引入 pre-commit.com 框架依赖；CI 仍校验漂移 |
| 2026-09-11 | GaugeStudio 改为主动连接本插件监听口 | 单一发现契约：stdout `studio-reporter websocket:`；`GAUGE_STUDIO_WS` 降级为可选 outbound / Studio 兼容模式 |
| 2026-09-11 | 静态报告打印尊重过滤器；`--input` 再生含截图 smoke | 打印「所见即所打」优于强制打出全部；uhilreport 再生仍依赖源截图路径可读（当前契约） |

## 前端资源布局（SSoT）

```
viewer.html          # 可编辑真源（实时壳）
manage.html          # 可编辑真源
report-assets/       # 可编辑真源（Vue/JS/CSS）
internal/report/     # go:embed 副本（由 make sync-assets 生成/同步）
scripts/sync-assets.sh
scripts/check-assets.sh   # CI：漂移则失败
```

不要手改 `internal/report/viewer.html`、`manage.html`、`report-assets/`；改根目录后执行 `make sync-assets`。

## 非目标（当前）

- 不替代 Gauge 官方 html-report 的全部 UI 能力（搜索、打印批注等逐步补齐）
- 不把报告数据做成独立 SaaS；本地文件 + 可选 HTTP 管理即可
- 不在运行中持续写 `index.html`

## 工程约定

- 版本：`plugin.json` 的 `version` 与 Git tag `vX.Y.Z` 一致
- 发布：打 tag → `.github/workflows/release.yml` 构建多平台 zip
- PR：`cursor/<name>-a6c3`；合并后按需发版
- 文档四件套：`README` / `DESIGN` / `TODO` / `QUICKSTART` 必须反映真实状态
- 本地/CI：`make ci`（含 assets 校验、vet、test、build）；`make cover` / CI `cover-summary.sh` 输出覆盖率摘要；`make lint` 跑 golangci-lint；`make hooks` 启用 `.githooks`
- 测试：`GOTOOLCHAIN=go1.27.0 go test ./...`

## 演进方向

见 [TODO.md](TODO.md)。架构允许在迭代中重构包边界、替换实时查看实现、增强静态报告交互，只要保持：

1. `*.uhilreport` 可再生 HTML  
2. `report.json` 信封兼容（`formatVersion`）  
3. Gauge 插件启动契约（`--start` / gRPC / WS 端口打印）
