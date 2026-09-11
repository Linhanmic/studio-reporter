# Studio Reporter — Design

本文描述 **v0.5.2** 起的真实架构与关键决策。实现以仓库代码为准；文档随迭代更新。

## 产品目标

**Studio Reporter 的产品形态是 Desktop App（报告工作台）**；Gauge reporter **插件是无头桥接**；CLI / 静态 HTML 是工程与归档能力，不是主 UX。

详细设计见 **[DESKTOP.md](DESKTOP.md)**。

分层：

1. **Desktop**：实时运行、终态阅读、历史对比、导出（主产品面）
2. **Plugin**：Gauge gRPC → WS 广播 → 落盘（桥接）
3. **产物**：`index.html` / PDF / 单文件 HTML / `.uhilreport`（可离线分享）
4. **CLI**：`generate` / `serve` / `plugin`（CI 与无 UI 环境）

Gauge 执行期插件仍负责：实时事件转发 + 套件结束写报告。Desktop 通过解析 `studio-reporter websocket:` 发现并连接。

报告产品形态：

| 场景 | 入口 | 技术 |
|------|------|------|
| **Desktop 工作台** | Electron 壳（`desktop/`，P0 已落地） | 见 [DESKTOP.md](DESKTOP.md)；WS discover + 嵌入 `viewer`/`index`；控制通道 Hello/Ping/RequestSnapshot |
| 终态阅读 / 分享 / 归档 | `index.html` | Go 端预渲染静态 HTML（CANoe 风：左导航 + Overview + 结果树；无内嵌 JSON、无 Vue） |
| 单文件分享 | `report.single.html`（可选） | 将相对 `images/` 内联为 data URI；目录版仍为默认真源 |
| 可打印/分享 PDF | `report.pdf`（可选） | Chrome headless `--print-to-pdf`；与 HTML 同源结构化文档，非截图拼贴 |
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
                              ├─ report.single.html  (可选，inline 截图)
                              ├─ report.pdf          (可选，Chrome print)
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
| `overview.go` / `meta.go` | Overview 页、导航树、截图画廊、环境元数据 |
| `pdf.go` | 可选 headless Chrome PDF |
| `inline.go` | 可选单文件 HTML（截图 data URI 内联） |
| `orchestrate.go` | Suite 结束单路径 |
| `assets.go` | embed `viewer.html` / `manage.html` / assets |

主包负责：gRPC 插件桥接、WebSocket forwarder、history、落盘引擎；CLI 为工程入口。Desktop 壳见 `DESKTOP.md` / 规划中的 `desktop/`。

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
| 2026-09-11 | 静态报告打印尊重过滤器；`--input` 再生含截图 smoke | 打印「所见即所打」优于强制打出全部；uhilreport 再生仍依赖源截图路径可读（当时契约） |
| 2026-09-11 | `.uhilreport` 截图改为相对 `images/` 路径 | 可移植单元 = uhileport + 同级 `images/`；`--input` 相对输入文件目录解析；旧绝对路径回退 `images/<basename>` |
| 2026-09-11 | viewer 与静态报告视觉对齐 | 终态跳转后色板/密度一致优先于完全同构 DOM；静态补 frag/行底色/步骤卡；live tag 用品牌 token |
| 2026-09-11 | manage 历史对比 | 对比信息已在 history.json；客户端勾选两次即可，无需新 API；时长变慢标红、变快标绿 |
| 2026-09-11 | Desktop 历史对比 | 同语义移植到 `desktop/electron/compare.js`；历史页勾选 UI |
| 2026-09-11 | Desktop 历史过滤/导出 | `filterHistoryRuns` + `resolveRunUhilreport`；搜索/verdict chips；勾选 1 次导出该次 |
| 2026-09-11 | Desktop 历史删除/批量导出 | 原生 FS 删除对齐 Go `deleteHistoryRun`；多选批量 `generate` |
| 2026-09-11 | Desktop 历史定位 + hub 锁 | `showItemInFolder` / clipboard；删除走 `withHubLock`（与 Go `.hub.lock` flock 对齐） |
| 2026-09-11 | Desktop 套件结束系统通知 | 窗口未聚焦时发 OS Notification；设置 `notifyOnSuiteEnd`；点击回前台打开报告 |
| 2026-09-11 | Desktop 自定义协议深链 | `studio-reporter://open|connect|hub`；单实例转发；builder `protocols.schemes` |
| 2026-09-11 | Desktop 打包 | electron-builder + extraResources；dev/packaged 双路径 bundle root；CLI 随包分发供导出 |
| 2026-09-11 | Desktop 启动 Gauge | Desktop 可 spawn `gauge run` 并解析 stdout discover；仍允许外部附着；单一 discover 契约 |
| 2026-09-11 | Desktop 多会话 | 主进程会话管理器允许多 Gauge 并行（上限 3）；UI 会话条切换 active live；最近项目持久化 |
| 2026-09-11 | 共享 discover | 抽出 `@studio-reporter/discover`（`packages/studio-reporter-discover`）；Desktop 经 file: 依赖消费 |
| 2026-09-11 | 插件版本门闸 | Desktop 对 ServerHello 校验 semver ≥ 0.5.0 与必需 capabilities；状态栏提示 ok/warn/error |
| 2026-09-11 | 本机插件检测 | 扫描 Gauge plugins 目录；设置页展示安装版本；discover 超时结合安装态提示 |
| 2026-09-11 | Desktop 自动更新 | electron-updater + GitHub Releases；开发态跳过；打包后可检查/下载；Release workflow 产出 AppImage + latest-linux.yml；代码签名依赖仓库 secrets |
| 2026-09-11 | Desktop 原生大纲 | 主进程转发精简 ReportSnapshot 大纲；运行页侧栏；viewer 监听 `studio-reporter:select-node` postMessage |
| 2026-09-11 | Desktop 终态大纲 | 打开终态目录时加载 `report.json`；大纲跨 live/终态共享；静态报告 JS 响应同一 postMessage |
| 2026-09-11 | Desktop 大纲过滤 | 侧栏 query + verdict chips；同步 `studio-reporter:filter` 到 live/静态 iframe |
| 2026-09-11 | 复杂夹具双轨：Gauge 工程文件 + Go 合成器 | CI 不能依赖本机 Gauge/语言插件；`.spec` 作可读真源，`complexsuite.Suite` 作可重复输入 |
| 2026-09-11 | 交互主体验 = HTML；PDF = 同源打印 | 「可交互 PDF」在业界多为 HTML Viewer + 打印；真正交互保留左导航/Overview/lightbox；PDF 用 Chrome print 保留文字链接图片，避免栅格拼贴 |
| 2026-09-11 | Overview + 左右分栏 + 截图策略 | 对齐 CANoe Test Report Viewer：首页环境配置、左树跳转；步骤全量截图 + 失败标注 + hook 截图 + dialog 放大 |
| 2026-09-11 | 单文件 HTML 为可选导出，不替换目录版 | 分享场景需要自包含文件；`index.html`+`images/` 仍是默认真源与 uhileport 可移植单元；内联用 data URI，缺图 best-effort |
| 2026-09-11 | CLI 子命令落地（工程入口） | 便于 CI/再生/serve；**不是**产品终点 |
| 2026-09-11 | 独立化终点 = Desktop App | 用户纠偏：主 UX 为桌面工作台；插件桥接 WS；详见 DESKTOP.md |

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
