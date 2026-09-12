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
| 2026-09-11 | Desktop 自定义协议深链 | `studio-reporter://open|connect|hub|compare`；单实例转发；builder `protocols.schemes` |
| 2026-09-11 | Desktop 深链直达历史对比 | `compare?base=&target=` 打开历史页并运行对比；可选 `hub` 先切报告根；与 UI「对比」共用 `openCompareByIds`/`runCompare` |
| 2026-09-11 | Desktop 对比面板复制深链 | 分享入口与打开入口对称：`buildCompareDeepLink` 生成 URL，「复制深链」写入剪贴板；含 hub 以便跨机/重开可定位 |
| 2026-09-11 | 对比分享卡片附带 compare 深链 | 离线卡片/Markdown/JSON 携带同一深链，聊天粘贴后可一键回到 Desktop 对比面板 |
| 2026-09-11 | 深链冷启动队列加固 | 协议 URL 可能在 BrowserWindow 就绪前到达；用队列 + did-finish-load flush，保证 compare 导航送达渲染进程 |
| 2026-09-11 | Desktop 键盘快捷键 | Cmd/Ctrl+1–4 切页；Enter 连接；Shift+H/F5 刷新历史；tablist 方向键 |
| 2026-09-11 | Desktop 明暗主题 | 设置 `theme=system|light|dark`；CSS `[data-theme]` token；跟随系统可监听 |
| 2026-09-11 | Desktop 打开 .uhilreport | 离线入口：菜单/IPC/深链 → CLI generate → 报告页；不改 uhileport schema |
| 2026-09-11 | 静态报告极轻量交互 | 在静态 `index.html` 增加 hash 深链 / 复制失败摘要 / sticky 工具栏 / 键盘导航；明确不引入 SPA，避免与 Desktop 双真源 |
| 2026-09-11 | Desktop 对比分享卡片 | 对比结果可导出自包含 HTML 卡片或复制 Markdown；非完整报告真源，便于 IM/邮件粘贴 |
| 2026-09-11 | Desktop 打包 | electron-builder + extraResources；dev/packaged 双路径 bundle root；CLI 随包分发供导出 |
| 2026-09-11 | Desktop 启动 Gauge | Desktop 可 spawn `gauge run` 并解析 stdout discover；仍允许外部附着；单一 discover 契约 |
| 2026-09-11 | Desktop 多会话 | 主进程会话管理器允许多 Gauge 并行（上限 3）；UI 会话条切换 active live；最近项目持久化 |
| 2026-09-11 | Desktop 会话恢复 / 最近 hub | `recentHubs` 与 `recentProjects` 同模式；`lastTab`/`restoreSession` 持久化；选 hub、保存设置、深链 `hub` 均写入最近列表 |
| 2026-09-11 | Desktop 窗口布局记忆 | `window-state.js` 持久化 bounds/最大化；离屏校正；独立 `window-state.json` 与设置解耦 |
| 2026-09-11 | Desktop 大纲分栏宽度记忆 | 拖拽分隔条调整大纲宽度；`outlinePaneWidth` 持久化；键盘左右键微调 |
| 2026-09-11 | Desktop 大纲虚拟列表 | 侧栏 flatten + 窗口裁剪；仅 DOM 挂载可视行；失败跳转用 scrollTop 对齐 |
| 2026-09-11 | Desktop 安装包冒烟 Win/mac | 校验器理解 `mac/*.app` 与 `win-unpacked`；跨平台 fixture；CI 仍在 Linux 上用夹具覆盖 |
| 2026-09-11 | Desktop 安装包冒烟 | `verify-pack-dir` 校验 unpacked app + extraResources；CI 独立 job，失败上传 dist |
| 2026-09-11 | Desktop 历史对比 UX 深化 | `invertCompareResult` + `buildCompareShareJson`；导出后 openPath/revealPath；面板交换方向 |
| 2026-09-11 | Desktop 统一大纲搜索 | host `studio-reporter:filter` 在切页/iframe load 重放；`outlineQuery`/`outlineVerdict` 持久化；`/` 聚焦 |
| 2026-09-11 | Desktop 失败路径一键跳转 | 主机层大纲 fail 导航（按钮 + `j`/`k`）；与静态报告内键盘分工：宿主管大纲选中，iframe 内仍可自导航 |
| 2026-09-11 | Desktop 失败跳转可见性 | `prepareFailJumpFilter` 在跳转前清除遮挡 query / 切 fail；重放 `studio-reporter:filter` 后再 select |
| 2026-09-11 | Desktop 历史对比导出模板 | `compareCardTemplate`（default/light/compact）+ `compareCardTitle`；分享 HTML 带 data-template |
| 2026-09-11 | Desktop Discover 超时可配置 | `discoverTimeoutMs`（默认 20s，钳制 5–120s）；设置页秒级输入；启动 Gauge 使用该值 |
| 2026-09-11 | 对比分享含场景 diff | 分享 Markdown/HTML/JSON 复用 `scenarioCompare`；卡片增加场景级差异区；无 report.json 时保留警告 |
| 2026-09-11 | 静态报告仅失败步骤 | 工具栏 `fail-steps-only` 切换；隐藏非失败 step/concept；展开失败步骤与祖先；sessionStorage 记忆 |
| 2026-09-11 | 打印/PDF 尊重仅失败步骤 | 「所见即所打」延伸到 fail-steps：print CSS + beforeprint 展开；headless PDF 用 `#fail-steps` / `GAUGE_STUDIO_PDF_FAIL_STEPS` |
| 2026-09-11 | 仅失败步骤场景级折叠 | 在步骤隐藏之上用 `:has()` 折叠无失败场景的结构父节点；屏显/打印同一套选择器，避免空壳场景噪声 |
| 2026-09-11 | 导航树同步 fail-steps | 左侧导航与结果树同模式隐藏；避免模式开启后仍可点到被隐藏场景 |
| 2026-09-11 | Overview 失败摘要对齐可见树 | 客户端按可见失败场景 id 同步聚合表（隐藏引用/重算次数/空行隐藏）；Go `FilterFailReasonGroups` 为同契约纯函数；复制摘要读同步后 DOM |
| 2026-09-11 | Overview 汇总计数对齐可见树 | 过滤与 fail-steps-mode 下顶栏/Overview 计数按可见节点重算；与失败摘要同步同一可见性规则 |
| 2026-09-11 | 工具栏过滤徽标对齐可见树 | 过滤器徽标按搜索/交叉过滤/fail-steps 重算；表示「点选后可见量」而非静态全量 |
| 2026-09-11 | Overview 规格书清单对齐可见树 | 过滤后隐藏不可见规格书行并刷新场景计数；与汇总/摘要同一可见性规则 |
| 2026-09-11 | 导航树场景计数对齐可见树 | 左侧导航规格书旁显示可见场景计数；无可见子场景时隐藏该导航节点 |
| 2026-09-11 | 导航场景项随过滤隐藏 | 搜索/结论过滤时同步隐藏左侧 `nav-scn`；与结果树可见性一致 |
| 2026-09-11 | 打印页眉标注可见范围 | beforeprint 填充打印专用横幅，声明当前过滤/搜索/仅失败步骤，防止 PDF 误读为全量 |
| 2026-09-11 | Desktop 对比场景类型过滤 | 面板勾选 kinds 同时约束展示与导出；空/全选 = 不过滤；分享 JSON 记 `kindsFilter`；与静态报告「可见树一致性」同原则 |
| 2026-09-11 | Desktop 对比场景类型过滤持久化 | settings `compareScenarioKinds`；与模板/标题一样跨会话恢复；全选折叠为 null |
| 2026-09-11 | Desktop 对比深链携带场景类型过滤 | compare 深链 `kinds=` 与面板过滤同源；复制深链/分享卡片附带；打开深链恢复勾选并持久化 |
| 2026-09-11 | 静态报告过滤状态可分享 URL | `#focus?q=&spec=&scenario=&failSteps=1` 与工具栏双向同步；兼容 `#fail-steps`；Go `ParseShareHash` 契约测试 |
| 2026-09-11 | Desktop 对比差异定位到报告 | 场景 diff 携带 scnId；对比面板一键打开基线/目标报告并 hash 定位 |
| 2026-09-11 | Desktop 打开报告附带过滤 hash | 打开终态/历史报告时把大纲 query/verdict 写成静态 share hash；与报告内过滤契约对齐 |
| 2026-09-11 | 历史失败运行快速筛选强化 | history 写入 topFailReason；Desktop 按失败原因关键字过滤；一键复制当前列表失败 open 深链 |
| 2026-09-11 | 对比分享卡片模板预览 | 导出前 iframe 预览 default/light/compact；模板/标题变更即时刷新；与导出同源 HTML |
| 2026-09-11 | Desktop hub 历史文件监视 | `fs.watch` history.json/archives；设置 `watchHubHistory`；IPC `history-changed`；刷新保留勾选 |
| 2026-09-11 | Desktop 历史过滤与趋势窗口持久化 | `historyQuery`/`historyVerdict`/`historyFailReasonQuery`/`historyTrendLimit`/`historyTrendFlakyLimit` 写入 desktop-settings.json；趋势分析读设置而非硬编码 |
| 2026-09-11 | 历史失败摘要 digest | 跨运行聚合 topFailReason；Desktop 复制 Markdown；CLI `digest` 输出 md/json 供 CI |
| 2026-09-11 | 失败摘要附带打开深链 | digest Markdown/JSON 与 Desktop「复制摘要深链」输出 `open?run=&hub=&failSteps=1`；复用 deeplink 契约 |
| 2026-09-11 | manage.html 历史失败摘要 | 浏览器 hub 管理页嵌入同源 digest 模块；无 Desktop 时亦可复制摘要与打开深链 |
| 2026-09-11 | Overview 失败原因一键定位 | 静态报告 Overview 点击失败原因次数/文本跳到首个可见失败场景；过滤/仅失败步骤感知 |
| 2026-09-11 | Desktop 打开 manage 失败摘要深链联调 | 无 hub 的 open?run 回退当前/最近 hub；failSteps 单独打开写 overview hash |
| 2026-09-11 | CLI digest --write 旁路文件 | digest 可把 md/json 写入 hub 旁路文件，便于 CI 收集失败摘要工件 |
| 2026-09-11 | Desktop 导出刷新 fail-digest 旁路 | 导出 PDF/单文件后写 hub fail-digest.*；与 CLI 契约一致 |
| 2026-09-11 | 插件 finalize 同步刷新 fail-digest | 套件落盘与删除历史后 best-effort 写 fail-digest.*，CI 无需再手动 digest --write |
| 2026-09-11 | manage.html 打开 fail-digest 旁路 | 管理页探测并链到 hub fail-digest.md/json；与 CLI/插件旁路同源 |
| 2026-09-11 | Desktop 历史页打开 fail-digest 旁路 | 历史工具栏旁路 MD/JSON/位置；与 manage/CLI 旁路契约对齐 |
| 2026-09-11 | Desktop 一键刷新 fail-digest 旁路 | 历史工具栏「刷新旁路」；等同 CLI digest --write |
| 2026-09-11 | manage.html 一键刷新 fail-digest 旁路 | POST /api/fail-digest（localhost）；与 Desktop/CLI 契约对齐 |
| 2026-09-11 | fail-digest 旁路 formatVersion/generatedAt | 旁路 JSON/Markdown 增加 formatVersion=1 与 generatedAt；CI 可校验新鲜度 |
| 2026-09-11 | fail-digest CI 新鲜度闸门 | `digest --check --max-age` + `make check-fail-digest`；校验 formatVersion/generatedAt |
| 2026-09-11 | PDF `#fail-steps` 启动门闩 | 首轮 `applyFilter` 不得在解析 fragment 前 `syncShareHash`；`applyingHash=true` 至首次 `applyHashFromLocation`；未声明的 `failSteps` 为 `null` 以免冲掉会话；Chrome PDF 加 `--virtual-time-budget`；打印 `print-color-adjust: exact` |
| 2026-09-11 | uhilreport/manage 深链 failSteps | `.uhilreport` 深链仅 failSteps 时也要 `openReportDir` 挂 hash；manage 失败「打开」带 `#overview?failSteps=1` |
| 2026-09-11 | failSteps 解析跨端对齐 | 契约：键 failSteps/fail-steps/failsteps/fail_steps；真值 1/true/yes、假值 0/false/no（大小写不敏感）；空 hash 静态端仍用 null 保会话 |
| 2026-09-11 | Desktop 打包 unsigned 闸门 | CI 增加 Win 交叉 pack smoke；pack-smoke/Release 强制 unsigned；文档写明 secrets 清单未注入 workflow |
| 2026-09-11 | failSteps 别名浏览器冒烟 | headless dump-dom 门禁别名契约；与 Go/Desktop 解析表同源；CI 可通过 `make smoke-failsteps-hash` |
| 2026-09-11 | 分享 hash Unicode/空格往返抽检 | focus 必须 percent-encode（保留 `:`）；否则 URL.hash 往返后 DOM id 失配；query 走 URLSearchParams/url.Values |
| 2026-09-11 | focus PathEscape 保留 `/` | DOM id 为 `spec:`+filepath，含 `/`；`encodeShareFocus` 在 PathEscape 后恢复 `%2F`→`/`，使 `#` fragment 与 `getElementById` 对齐；legacy `%2F` 仍由 decode 兼容 |
| 2026-09-11 | 深链 focus 双轨编码 | `open?focus=` 走 query：`/`→`%2F`（防截断）；报告内 `#focus` 走 fragment：保持字面 `/`；Desktop buildOpenDeepLink / Go openDeepLink / compare 分享卡同源 |
| 2026-09-11 | Desktop 深链打开定位冒烟 | 不依赖完整 Electron：用与 `openReportDir` 相同的 hash 管道 + Chrome dump-dom 断言 path-style `<details open>`；browser CI 强制 Chrome |
| 2026-09-11 | manage/serve path-style focus 联调 | 静态报告经 manage HTTP 打开时，path-style `#spec:specs/…`（字面 `/` 与 legacy `%2F`）须选中 DOM；与 file:// / Desktop 管道同源 |
| 2026-09-11 | 历史摘要 TopFailFocus | 失败运行写入首个失败场景/规格 DOM id；digest 深链带 focus（query `%2F`）；与对比分享卡 path-style focus 同源 |
| 2026-09-11 | Desktop digest/compare→open 定位 | 历史摘要与对比分享卡产出的 path-style focus 深链，经 Desktop open 管道（parse→hash）后 dump-dom 打开对应 details |
| 2026-09-11 | 旁路 fail-digest path-style focus | hub `fail-digest.md`/`json` 的 open 深链写入 LastRunFocus（query `%2F`）；与 CLI/Desktop/插件旁路同源 |
| 2026-09-11 | manage POST 旁路 focus 联调 | serve POST `/api/fail-digest` 后 sidecar 深链 focus 往返；Chrome 打开 archive `#focus?failSteps=1` |
| 2026-09-11 | Overview 失败原因跳转 path-style | 聚合表点击次数打开含 `/` 的场景 DOM；Chrome dump-dom；纳入 smoke-failsteps-hash |
| 2026-09-11 | Overview 跳转 + fail-steps path-style | 仅失败步骤模式下聚合跳转仍打开含 `/` 的失败场景 DOM |
| 2026-09-11 | 复制失败摘要 path-style 深链 | 失败摘要 Markdown 含 `#focus` 定位（encodeShareFocus 保留 `/`）；Chrome dump-dom 抽检 |
| 2026-09-11 | 失败摘要→Desktop open 定位 | `extractFailSummaryFocusHashes` 解析摘要定位 → resolveReportOpenHash → dump-dom 打开 path-style details |
| 2026-09-11 | 剪贴板粘贴摘要一键定位 | Desktop 菜单/历史「粘贴摘要定位」读取剪贴板失败摘要并打开首个 path-style focus |
| 2026-09-11 | 历史右键粘贴摘要定位 | 右键「粘贴摘要定位到此运行」把剪贴板 focus 绑到该 history 条目报告目录 |
| 2026-09-11 | 粘贴摘要失败可操作引导 | 空剪贴板/无定位行返回 hint+示例；Desktop 对话框可一键复制示例定位行 |
| 2026-09-12 | 静态报告复制定位示例 | 工具栏「复制定位示例」与 Desktop `FAIL_SUMMARY_LOCATOR_EXAMPLE` 同源；互检单测防漂移 |
| 2026-09-12 | 趋势 flaky 复制 open 深链 | 不稳定场景行「复制深链」；`lastFailRunId` + `resolveFlakyOpenTarget`；打开/复制同源 |
| 2026-09-11 | digest 深链特殊 hub 路径编码抽检 | 深链 hub 必须经 query 编码；Go/JS/Desktop 往返覆盖空格与保留字符，避免 `?&#` 截断 |
| 2026-09-11 | report-browser-smoke CI | PR CI 安装 Chrome 并显式跑 failSteps/manage-digest 浏览器冒烟；避免 go test 在无浏览器环境静默 Skip |
| 2026-09-11 | manage/serve 旁路与深链联调抽检 | 对照「API 单测 ≠ 页面契约」：用真实 hub + HTTP serve 串起 POST 旁路、sidecar 深链、manage.html/JS 字符串契约与 Chrome 打开 hash；`make smoke-manage-digest` 作为可重复抽检入口 |
| 2026-09-11 | 自动更新 feed 离线校验 | `update-feed.js` 校验 latest*.yml 与 publish owner/repo；签名 secrets 文档化，证书到位前保持 unsigned |
| 2026-09-11 | Release 无签名可发 | tag Release 分 plugin/linux/win；SHA256SUMS；`CSC_IDENTITY_AUTO_DISCOVERY=false`；签名 secrets 仍为可选 |
| 2026-09-11 | Desktop 历史趋势 / 不稳定场景 | 过滤窗口 suite 趋势（history.json）+ report.json 场景翻转检测；与 pairwise compare 共用 scenarioKey |
| 2026-09-11 | 分享卡片导出一致性抽检 | 卡片 meta 写入 template/title/kinds；导出后 `inspectCompareShareCardHtml` 对照 UI 选项；默认 `openPath` 打开预览 |
| 2026-09-11 | 历史多选批量复制打开深链 | 工具栏复制多条 `open` 深链（换行）；与单条右键复制同源；失败默认 failSteps |
| 2026-09-11 | 历史列表右键打开定位 | 历史行原生右键菜单：打开报告 / 复制 open 深链 / 显示文件夹 / 复制路径；与分享卡片 open 契约一致 |
| 2026-09-11 | 对比面板复制场景打开深链 | 面板场景 diff 可复制 open 深链（run+hub+focus）；与分享卡片及「在报告中查看」同契约 |
| 2026-09-11 | 对比分享卡片场景打开深链 | 离线卡片/MD/JSON 每条场景 diff 附带 open 深链（run+hub+focus）；Desktop 处理 `open?run=` 定位历史报告，与面板内跳转同契约 |
| 2026-09-11 | 分享链接复制摘要提示 | 复制成功后状态栏附带可读过滤摘要（`describeShareScope`） |
| 2026-09-11 | 静态报告复制可见范围链接 | 工具栏一键复制当前 `#focus?…` 完整 URL；与过滤/定位同源 |
| 2026-09-11 | 场景级运行对比 | 从两侧 `report.json` 提取 ScenarioLite；按 file+heading+row 对齐；分类 regressed/fixed/added/removed/reason_changed；Desktop 历史对比面板展示 |
| 2026-09-11 | Desktop 导出进度条 UI | 历史页可视进度条；`formatExportProgress` 统一状态文案（百分比 + basename）；取消仍走 cancel-export |
| 2026-09-11 | 截图灯箱 ←/→ | 打开后收集 `[data-shot-src]`；←/→ 与前后按钮环绕切换；`#shot-lightbox-pos`；Go/JS 步进契约对齐 |
| 2026-09-11 | 静态报告失败原因聚合 | Overview 按规范化首条 ErrorMessage 归类失败场景；复制摘要同步聚合段 |
| 2026-09-11 | 静态报告过滤性能 | 过滤只动 spec/scenario/datarow/datadriven；渲染写 `data-name`；搜索防抖；展开全部不再打开 step/concept |
| 2026-09-11 | Desktop 历史列表虚拟化 | 历史侧栏复用 `computeVirtualWindow`；固定行高；过滤防抖 |
| 2026-09-11 | Desktop 导出进度/取消 | 批量导出改为异步 spawn；`desktop:export-progress` + `cancel-export`；历史侧全选过滤/清除勾选 |
| 2026-09-11 | Desktop Win CLI 打包 | `build-windows` 交叉编译；平台级 extraResources（linux/mac ↔ unix bin，win ↔ `.exe`）；`pack:check:win` 强制校验 |
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

| 2026-09-11 | CI Chrome sandbox | headless dump-dom/PDF 显式 `--no-sandbox`/`--disable-setuid-sandbox`，兼容 Actions setup-chrome |

## 演进方向

见 [TODO.md](TODO.md)。架构允许在迭代中重构包边界、替换实时查看实现、增强静态报告交互，只要保持：

1. `*.uhilreport` 可再生 HTML  
2. `report.json` 信封兼容（`formatVersion`）  
3. Gauge 插件启动契约（`--start` / gRPC / WS 端口打印）
| 2026-09-12 | 趋势失败原因摘要一键打开定位 | digest 组最近失败接到 open+focus；复制深链与 flaky 行对称；`resolveDigestGroupOpenTarget` |
| 2026-09-12 | manage 失败原因摘要一键打开定位 | 页内打开带 path-style focus；复制深链；`resolveDigestGroupOpenTarget` 与 Desktop 同源 |
| 2026-09-12 | 静态报告失败原因聚合复制深链 | Overview 行按钮复制 path-style focus 可分享 URL；保留当前过滤/仅失败步骤 |
| 2026-09-12 | 静态报告失败原因聚合复制摘要片段 | Overview 行「复制摘要」输出含 path-style 定位的 Markdown，便于粘贴工单 |
| 2026-09-12 | 静态报告失败原因聚合复制全部摘要 | Overview「复制全部摘要」输出可见原因 Markdown 列表；与行级片段同源 |
| 2026-09-12 | 静态报告失败原因聚合复制全部深链 | Overview「复制全部深链」输出可见原因定位 URL（换行）；与行级深链同源 |
| 2026-09-12 | 失败原因批量复制按钮过滤态 | 无可见原因时禁用批量按钮并同步 aria-disabled / title |
| 2026-09-12 | Overview 失败原因空态提示 | 过滤后无可见原因时工具行旁轻量说明（aria-live） |
| 2026-09-12 | 失败原因表空态占位行 | 过滤后表格占位「无匹配的失败原因」，与工具行 hint 同步 |
| 2026-09-12 | 失败原因空态一键清除过滤 | 「清除过滤」重置搜索/结论过滤并恢复失败原因可见性 |
| 2026-09-12 | 失败原因空态键盘操作 | Esc 清除过滤（输入框内除外）；清除按钮可聚焦与 focus-visible |
| 2026-09-12 | 失败原因空态「仅看失败」 | 空态按钮清除搜索并切到 scenario=fail，避免回到全量噪音 |
| 2026-09-12 | 失败原因空态清除撤销 | 清除前快照过滤；「撤销清除」恢复上次 query/scenario/failSteps |
| 2026-09-12 | 失败原因空态撤销快捷键 | Ctrl/Cmd+Z 撤销清除；搜索框内保留原生文本撤销 |
| 2026-09-12 | 失败原因空态撤销状态摘要 | 撤销后状态栏附带已恢复过滤摘要（describeFilterSnapshot） |
| 2026-09-12 | 失败原因空态操作可观测 | EmptyStateMetrics 计数/事件环；StudioReportDebugEmptyState 可选 console |
| 2026-09-12 | 失败原因空态 metrics 面板 | Overview 可选计数条（query/localStorage/window 开关） |
| 2026-09-12 | 失败原因空态 metrics 导出 | 面板「复制 JSON」输出 EmptyStateMetrics（kind/exportedAt/counts/events） |
