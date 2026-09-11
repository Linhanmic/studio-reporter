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

## 关键决策记录

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-08 | 终态改为静态 HTML，不再内嵌 JSON SPA | 归档/离线可读；Vue 仅用于实时 |
| 2026-08 | 运行中不落盘，仅 WS 推送；结束时一次写入 | 减少 IO；单一真源在内存 |
| 2026-08 | Live 树停在 Spec→Scenario | 实时体积与刷新成本 |
| 2026-08 | 过滤按规格书 / 场景分组，场景命中则展示完整步骤 | 失败上下文完整，避免只露失败步 |
| 2026-09-11 | 无内容通过步骤改为 `leaf-row` | 减少空 `<details>` 噪音，失败/有输出步骤仍可折叠 |

## 非目标（当前）

- 不替代 Gauge 官方 html-report 的全部 UI 能力（搜索、打印批注等逐步补齐）
- 不把报告数据做成独立 SaaS；本地文件 + 可选 HTTP 管理即可
- 不在运行中持续写 `index.html`

## 工程约定

- 版本：`plugin.json` 的 `version` 与 Git tag `vX.Y.Z` 一致
- 发布：打 tag → `.github/workflows/release.yml` 构建多平台 zip
- PR：`cursor/<name>-a6c3`；合并后按需发版
- 文档四件套：`README` / `DESIGN` / `TODO` / `QUICKSTART` 必须反映真实状态
- 测试：`GOTOOLCHAIN=go1.27.0 go test ./...`（CI 同）

## 演进方向

见 [TODO.md](TODO.md)。架构允许在迭代中重构包边界、替换实时查看实现、增强静态报告交互，只要保持：

1. `*.uhilreport` 可再生 HTML
2. `report.json` 信封兼容（`formatVersion`）
3. Gauge 插件启动契约（`--start` / gRPC / WS 端口打印）
