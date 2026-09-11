# Studio Reporter Desktop — 详细设计

状态：P0 已落地（v0.5.1）；P1+ 仍为路线图  
关联：本仓库插件/报告引擎 + `desktop/` Electron 壳；通信契约见 [API.md](API.md)、落盘契约见 [REPORT_FORMAT.md](REPORT_FORMAT.md)。

## 1. 产品定位（纠偏）

**Studio Reporter 的产品形态是 Desktop App，不是 CLI。**

| 层 | 角色 | 是否用户产品面 |
|----|------|----------------|
| **Desktop App** | 报告工作台：实时运行、终态阅读、历史、对比、导出 | **是（主产品）** |
| **Reporter Plugin** | Gauge 执行期桥接：收 gRPC → 推 WS → 落盘报告 | 否（无头代理） |
| **CLI** | 工程/自动化：`generate` / `serve` / 再生 / 冒烟 | 否（运维入口） |
| **静态 HTML** | 可归档、可分享的真源产物（CANoe 风） | 是（产物，非壳） |

CLI（v0.5 引入）保留为工程能力，**不得**再被描述为「从插件升级成独立工具」的终点。独立化的终点是 **Desktop App**。

与 [GaugeStudio](https://github.com/Linhanmic/GaugeStudio) 的关系：

- GaugeStudio 已具备 Electron 壳 + 解析 `studio-reporter websocket:` 的 discover 客户端。
- **方案决策（本设计）**：优先 **扩展 / 分叉为「Studio Reporter Desktop」报告工作台**（可与 GaugeStudio 同仓模块化，或独立仓共享协议），而不是再发明第二套通信。
- GaugeStudio 若继续做「IDE / 工程管理」，报告相关 UX 应收敛到 Reporter Desktop（或 GaugeStudio 内的 Report 工作区模块），避免双壳抢同一 WS。

## 2. 目标用户与场景

1. **执行中**：看实时进度、失败路径、当前场景；不必打开浏览器。
2. **执行后**：CANoe 风格阅读终态报告（Overview / 左树 / 截图 lightbox）。
3. **历史**：浏览 `archives/`、对比两次运行、打开/删除归档。
4. **分享**：导出 PDF / 单文件 HTML / 打开目录中的 `index.html`。
5. **无 Gauge UI**：仅装 Desktop + 插件即可完成「跑测 → 看报」。

非目标（当前）：

- 不替代 Gauge 本身的规格编辑 / 调试器。
- 不做云端 SaaS；默认本机 `127.0.0.1`。
- 不把静态 `index.html` 做成重 SPA；Desktop 可嵌入 WebView，但磁盘产物保持可离线打开。

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                 Studio Reporter Desktop                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Live Run     │  │ Final Report │  │ History / Compare │  │
│  │ (WS client)  │  │ (WebView or  │  │ (hub FS + API)    │  │
│  │              │  │  native tree)│  │                  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                     │            │
│  ┌──────▼─────────────────▼─────────────────────▼─────────┐  │
│  │              Desktop Host (Electron / Tauri)            │  │
│  │  · discover Gauge stdout WS URL                         │  │
│  │  · optional local file watcher on reports/studio-report │  │
│  │  · spawn/attach gauge run (optional)                    │  │
│  └──────────────────────────┬──────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────┘
                              │ ws://127.0.0.1:<port>
                              │ (JSON envelope, API.md)
┌─────────────────────────────▼────────────────────────────────┐
│              studio-reporter Plugin (headless)                │
│  Gauge gRPC ◄──► Engine/LivePublisher ◄──► WS forwarder       │
│                         │                                     │
│                         ▼                                     │
│              reports/studio-report/                           │
│              index.html / archives / *.uhilreport / images    │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ gRPC Reporter API
                         Gauge runtime
```

### 3.1 职责边界

| 组件 | 负责 | 不负责 |
|------|------|--------|
| Plugin | 执行期事件、内存 live 树、终态落盘、WS 广播 | UI、窗口、用户设置持久化 |
| Desktop | 发现/连接、渲染 live+终态、历史 UX、导出触发、用户偏好 | 解析 Gauge proto、替代 gRPC reporter |
| 磁盘报告 | 归档真源、跨机再生、无 Desktop 也可 `file://` 打开 | 实时推送 |

## 4. 通信设计（插件桥接）

### 4.1 发现（Discovery）— 已有契约，Desktop 必须遵守

1. Desktop（或它启动的 Gauge 包装器）运行 `gauge run …`，插件随执行启动。
2. 插件 stdout 打印：

```text
studio-reporter websocket: ws://127.0.0.1:<port>
```

3. Desktop **解析该行**并以 WebSocket **客户端**连接（与 GaugeStudio 0.1.1+ 一致）。
4. **禁止**默认依赖 `GAUGE_STUDIO_WS` 注入；该变量仅作兼容 outbound。

可选增强（桌面侧，不破坏插件）：

| 增强 | 说明 |
|------|------|
| 多会话表 | 同时跟踪多个 `gauge run` 的 WS URL / 项目路径 |
| 超时提示 | N 秒内未见 `studio-reporter websocket:` → 引导检查插件安装 |
| 手动粘贴 URL | 高级：用户粘贴 `ws://127.0.0.1:…` |

### 4.2 实时通道（已有）

信封：

```json
{ "type": "<EventType>", "timestamp": "<RFC3339Nano UTC>", "payload": { } }
```

Desktop **最低必消费**：

| type | 用途 |
|------|------|
| `ReportSnapshot` | 刷新 live 树（`running`、summary、当前 spec/scenario） |
| `ReportGenerated` | 套件结束：拿到 `indexPath` / hub 路径，切到终态或弹「打开报告」 |
| `ExecutionStarting` / `ExecutionEnding` | 运行态指示灯 |
| Spec/Scenario/Step 生命周期 | 可选：更细进度条 / 面包屑（有则用，无则靠 Snapshot） |

约束（与现实现一致，Desktop 必须容忍）：

- Live 树停在 Spec→Scenario；步骤细节在终态 `index.html` / 最终 snapshot。
- 运行中**不落盘** `index.html`；不要轮询旧 index 当 live。
- `ReportGenerated` 早于/晚于磁盘就绪都可能；Desktop 应以路径存在 + `report.json.running===false` 或文件 mtime 变化确认终态可读（已有 viewer 逻辑可复用）。

### 4.3 控制通道（建议新增，插件侧增量）

当前 WS **几乎是单向推送**（插件 → 客户端）。Desktop 要成为完整工具，建议增加 **可选双向控制**（additive，不升 `formatVersion`）：

| Desktop → Plugin 消息 | 语义 | 优先级 |
|----------------------|------|--------|
| `ClientHello` `{app, version, capabilities[]}` | 握手、能力协商 | P0 |
| `Ping` / `Pong` | 保活 | P0 |
| `RequestSnapshot` | 断线重连后拉最新 live 树 | P0 |
| `OpenReport` 应答无关 | Desktop 本地打开即可 | — |
| `SetMeta` `{k:v}` | 运行中注入 Overview meta（可选） | P2 |
| `CancelSuite` | **不做**（应由 Gauge/进程管理，不经 reporter） | 不做 |

插件对未知控制消息：**忽略并打日志**，保持旧客户端兼容。

### 4.4 离线 / 无运行通道

Desktop 在无 Gauge 进程时仍应可用：

1. **打开文件夹**：选择 `reports/studio-report` 或任意含 `index.html` + `images/` 的 hub/archive。
2. **打开 `.uhilreport`**：调用内置引擎/`generate` 等价逻辑再生 HTML（可 shell 出 CLI 或链 `internal/report`）。
3. **本地 HTTP**：复用 `serve`（`127.0.0.1`）给管理页删除归档；Desktop WebView 连 `http://127.0.0.1:8765/manage.html` 或原生实现同等 API。

## 5. Desktop 信息架构（IA）

### 5.1 主导航

```
┌─ Studio Reporter ─────────────────────────────────────────┐
│ [运行]  [报告]  [历史]  [导出]            ⚙ 设置   项目 ▾ │
└───────────────────────────────────────────────────────────┘
```

| 区 | 内容 |
|----|------|
| **运行** | 连接状态、live 树、当前失败、日志条、结束 CTA |
| **报告** | 嵌入终态报告（优先加载磁盘 `index.html`；CANoe 左右栏已在静态页） |
| **历史** | `history.json` 列表、对比、打开归档、删除（需 serve 或原生 FS） |
| **导出** | PDF / 单文件 HTML / 在访达/资源管理器中显示 / 复制路径 |
| **设置** | 报告根目录、是否自动打开终态、主题、发现超时、兼容模式 |

### 5.2 「报告」页策略（关键）

**默认**：Desktop WebView 加载 `file://…/index.html` 或 `http://127.0.0.1:<serve>/index.html`。

理由：

- 静态报告已是 CANoe 风完整实现（Overview / 导航 / 截图）。
- 避免在 Desktop 用第二套 DOM 重写同一报告（双真源）。

可选后续：原生树控件 + 仅详情 WebView（若 file:// 限制截图/脚本）。

### 5.3 「运行」页策略

复用现有 `viewer.html` 逻辑（Vue live），或移植 `report-app.js` 的 WS 订阅到 Desktop 渲染层：

- 运行中：显示 live snapshot。
- 收到 `ReportGenerated`：横幅 + 倒计时跳「报告」页（可取消）——与现 viewer 行为对齐。

## 6. 技术选型

### 6.1 壳

| 选项 | 利 | 弊 | 建议 |
|------|----|----|------|
| **Electron** | 与 GaugeStudio 同栈；可直接复用 discover/WS 客户端补丁 | 体积大 | **短中期首选**（复用路径最短） |
| Tauri 2 | 体积小、安全默认好 | 需重写壳；与 GaugeStudio 不共享 | 中长期若独立仓可评估 |
| Wails | Go 同语言 | 生态/现有前端复用一般 | 不优先 |

**决策草案**：v1 Desktop = **Electron**；UI 以现有 `viewer.html` / `manage.html` / 静态 `index.html` 为 WebView 内容；主进程负责 discover、窗口、文件系统、调用导出。

### 6.2 仓库布局（建议）

两选一（实现前拍板）：

**A. 同仓 `desktop/`（推荐起步）**

```
studio-reporter/
  desktop/                 # Electron 主进程 + preload
  viewer.html …            # 已有前端真源
  internal/report/         # 引擎
  plugin.json
```

**B. 独立仓 `studio-reporter-desktop`**

- 本仓保持插件+引擎+产物；desktop 仓 npm 依赖协议文档 + 可选 submodule。

起步用 **A**，避免双仓权限/同步问题（已有 GaugeStudio 推送 403 教训）。

### 6.3 与 CLI 的关系

| CLI | Desktop |
|-----|---------|
| `generate` | 「打开 uhileport / 再生」菜单背后调用同一引擎 |
| `serve` | Desktop 可内嵌启动或自管静态文件服务 |
| `plugin` | 仅 Gauge 拉起；用户不通过 Desktop「启动插件」除非 Desktop 包了 gauge run |

## 7. 安全与本机边界

- WS / HTTP **默认绑定 127.0.0.1**。
- Desktop 不向公网暴露报告目录。
- `file://` WebView：注意截图路径与 CSP；必要时改用 `serve` 同源。
- 删除归档：需明确确认；API 仅 loopback（现有 `--serve` 已约束）。

## 8. 分阶段落地

### P0 — 可演示的 Desktop 壳（最小） — **已完成（0.5.1）**

1. Electron 窗口 + 加载本地 `viewer.html`（`desktop/`）。
2. 主进程：粘贴/解析 WS URL（discover 行 / 端口）；loopback HTTP 托管资产。
3. 消费 `ReportSnapshot` + `ReportGenerated`；结束跳转 `index.html`。
4. 菜单：打开报告目录；插件侧 `ClientHello` / `RequestSnapshot` / `Ping`。

验收：一次 `gauge run` → Desktop 实时树 → 结束后 CANoe 终态报告。

### P1 — 工作台

1. 历史页（读 `history.json`）+ 对比（已有 `CompareHistoryRuns` 逻辑可移植）。
2. 导出：触发 PDF / single HTML（调引擎或 CLI）。
3. 设置：报告根目录、自动跳转。
4. （已提前）控制消息 — 见 P0。

### P2 — 体验

1. Desktop「运行」按钮封装 gauge（选规格、环境）。
2. 多项目 / 多会话。
3. 与 GaugeStudio 模块边界清晰化（共享 discover 包）。

### P3 — 体验

1. 原生报告树（若 WebView 不足）。
2. 插件侧能力协商、版本门闸。
3. 安装体验：Desktop 安装器检测/提示 Gauge 插件版本。

## 9. 插件侧改动清单（相对现状）

| 项 | 类型 | 说明 |
|----|------|------|
| 保持 stdout discover | 不变 | Desktop 依赖 |
| `ClientHello` / `RequestSnapshot` | 新增可选 | 双向控制 |
| `ReportGenerated` 已含 `reportPath`/`reportDir`/`jsonPath` | 已有 | Desktop 直接用；仅需确认绝对路径 |
| 版本字段写入 Hello | 新增 | 门闸 |
| CLI | 保留 | 给 CI / 无 UI 环境 |

## 10. 风险与开放问题

1. **与 GaugeStudio 产品边界**：是「Reporter Desktop 独立应用」还是「GaugeStudio 的 Report 工作区」？  
   - 建议：协议与 discover **共享**；品牌上允许 Desktop 独立发布「Studio Reporter」。
2. **file:// vs 内置 serve**：截图与 ES module 限制 → P0 起倾向内置 loopback serve。
3. **谁启动 Gauge**：Desktop 包 gauge vs 用户外部跑、Desktop 只附着日志。P0 可只附着。
4. **大 snapshot 性能**：已有场景层裁剪；Desktop 需虚拟列表。

## 11. 决策记录（本设计）

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-09-11 | 独立化终点 = Desktop App，不是 CLI | 用户明确纠偏；报告工具需要持续会话、实时与历史，CLI 无法承载主 UX |
| 2026-09-11 | 插件继续作为无头桥接 | 已有 gRPC+WS+落盘；Desktop 不应重做执行期采集 |
| 2026-09-11 | 复用现有 WS discover 契约 | 与 GaugeStudio 对齐；避免第二套发现 |
| 2026-09-11 | 终态 UI 优先嵌入静态 `index.html` | 单一视觉真源；避免 Desktop/静态双实现 |
| 2026-09-11 | 壳技术短中期选 Electron | 复用 GaugeStudio 客户端与 Web 前端资产 |

## 12. 下一步实现入口

1. ~~`desktop/` 骨架~~（已有；`cd desktop && npm install && npm start`）。
2. ~~`ClientHello` / `RequestSnapshot`~~（插件 0.5.1）。
3. P1：历史 / 导出 / 设置；可选 Desktop 启动 `gauge run`。
