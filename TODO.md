# Studio Reporter — TODO

状态：**活跃迭代**（目标：完善的工程化报告工具）。  
更新规则：完成一项立即勾选并记录决策；重大决策对照外部实践（见 DESIGN「决策原则」）。

## 当前版本

- 版本：**0.5.2**（本 PR）
- 产品目标：**Desktop App 报告工作台**（设计见 [DESKTOP.md](DESKTOP.md)）；插件 = 桥接；CLI = 工程入口
- 已有能力：静态 CANoe 报告 + PDF/单文件 + WS live + 归档/管理 + `.uhilreport` + CLI 子命令 + Desktop P0 壳 + hub 写入锁

## P0 — 工程基建

- [x] 对齐文档四件套：`README` / `DESIGN` / `TODO` / `QUICKSTART`
- [x] 修正 README/API 中过时描述（Vue 终态报告、安装版本号 0.3.x）
- [x] 增加 PR CI（`go test` / `go vet`），不仅有 release workflow
- [x] 为 `internal/report` 增加包内单测（静态渲染 / 叶子步骤）
- [x] 无额外内容的通过步骤改为不可折叠叶子行（demo 噪音）
- [x] 前端 SSoT：根目录真源 + `make sync-assets` / `check-assets`（修复 embed 丢失 WS）
- [x] 废弃无用的 `report.html`（仅保留 `viewer.html`）
- [x] golangci-lint v2 显式规则集 + CI 钉版本（`v2.13.2`）；清理首批 findings

## P1 — 静态报告体验

- [x] 工具栏「全部展开 / 全部折叠」
- [x] 静态报告搜索（规格书 / 场景名）
- [x] 失败默认展开路径
- [x] 打印样式：过滤隐藏块打印时「所见即所打」（不再强制展开被过滤块）

## P2 — 实时 viewer

- [x] 运行结束自动提示跳转静态 `index.html`（横幅 + 可取消倒计时；不内嵌终态 SPA）
- [x] 根目录 `manage.html` / `report-assets` 与 embed 同步的开发体验（`make sync-assets` / `check-assets` / `.githooks`）
- [x] viewer 结束态与静态报告视觉一致性抽样对比（frag 着色、verdict 色、行底色、步骤统计卡、中文类型标签）

## P3 — 工程化与质量

- [x] Makefile / `make test|vet|build|ci|lint|sync-assets|cover|hooks`
- [x] CI 输出 cover profile 摘要（`scripts/cover-summary.sh` + artifact）
- [x] `--input` 再生路径端到端 smoke（含截图相对路径；`make smoke-input`）
- [x] `.uhilreport` 写入可移植截图路径（`images/...`）；删除源绝对路径后仍可再生
- [x] pre-commit / make 钩子：提交前强制 `check-assets`（`.githooks` + `make hooks`）

## P4 — 产品演进（可改架构）

- [x] 评估静态报告是否引入极轻量客户端交互（不过度 SPA 化）— 已落地：URL hash 深链、复制失败摘要、粘性工具栏、`/`/`j`/`k`/`Esc` 键盘
- [x] 历史对比（两次归档的 verdict / 时长 / 计数 diff；`manage.html` 勾选 + `CompareHistoryRuns`）
- [x] 复杂 Gauge 测试夹具（`testdata/complex-gauge` + `internal/complexsuite`；`make demo-complex` / `smoke-complex`）
- [x] 多 suite / 并行执行下的 hub 写入竞态审计（`WithHubLock` + 原子 uhilreport + 排他 archive mkdir）
- [x] CANoe 风 Overview + 左右分栏 + 截图画廊/lightbox
- [x] 结构化 PDF 导出（`--pdf` / `GAUGE_STUDIO_WRITE_PDF`；Chrome print，非拼图）
- [x] 单文件 HTML（内联截图；`--single` / `GAUGE_STUDIO_WRITE_SINGLE` → `report.single.html`；目录版 `index.html` 仍为默认真源）
- [x] 工程 CLI 子命令（`generate` / `serve` / `plugin` / `version`；兼容扁平 flag）— **非产品终点**
- [x] Desktop App P0 壳（`desktop/` Electron + WS discover + 嵌入 live/终态）；详见 DESKTOP.md
- [x] 插件控制通道（`ClientHello` / `ServerHello` / `Ping`/`Pong` / `RequestSnapshot`）
- [x] Desktop P1 工作台骨架（历史 / 设置 / 导出入口）
- [x] Desktop 历史对比（移植 `CompareHistoryRuns` → `desktop/electron/compare.js`）
- [x] Desktop 安装器 / 打包骨架（electron-builder；`extraResources` 打入 viewer + report-assets + CLI；`paths.js` 解析 bundle root）
- [x] Desktop P2「运行」封装 gauge（选项目/specs/env；stdout discover 自动连接 live viewer）
- [x] Desktop 多项目 / 多会话（recentProjects + GaugeSessionManager；会话条切换；CI 跑 desktop npm test）
- [x] 共享 discover 包（`packages/studio-reporter-discover` / `@studio-reporter/discover`）
- [x] Desktop 插件版本门闸（ServerHello ≥ 0.5.0 + 必需 capabilities）
- [x] Desktop 本机插件安装检测（扫描 `~/.gauge/plugins/studio-reporter`；设置页 + discover 超时提示）
- [x] Desktop 自动更新骨架（electron-updater → GitHub Releases；设置/菜单；Release workflow 上传 AppImage）
- [x] Desktop 原生大纲侧栏（live + 终态）：`outline.js` 从 ReportSnapshot / `report.json` 抽 spec→scenario；共享侧栏；点击 postMessage 选中 viewer 或静态报告节点
- [x] Desktop 大纲搜索 / 结果过滤（query + pass/fail/skip；同步 postMessage 到 live viewer 与静态报告）
- [x] Desktop 历史列表搜索 / 结果过滤 + 勾选导出（`filterHistoryRuns`；勾选 1 次导出该次 `.uhilreport`，否则最新）
- [x] Desktop 历史删除 / 批量导出
- [x] Desktop 历史删除 / 批量导出（原生 FS：`deleteHistoryRuns` + 确认框；多选导出 PDF/单文件）
- [x] Desktop 打开 `.uhilreport`（菜单/IPC/深链；CLI generate 再生后打开报告页）
- [x] Desktop 历史打开所在文件夹 / 复制路径 + 删除时 hub 锁（`showItemInFolder` / clipboard；`withHubLock` 对齐 Go `.hub.lock`）
- [x] Desktop 套件结束系统通知（窗口未聚焦时；设置可关；点击聚焦并打开终态）
- [x] Desktop 自定义协议深链（`studio-reporter://open|connect|hub`；单实例；electron-builder protocols）
- [x] Desktop 会话恢复 / 最近 hub（`recentHubs` + `lastTab` + `restoreSession`；设置/历史页快捷切换）
- [x] Desktop 窗口布局记忆（位置/尺寸/最大化；离屏校正；`window-state.json`）
- [x] Desktop 大纲分栏宽度记忆（可拖拽分隔条；`outlinePaneWidth` 持久化）
- [x] Desktop 安装包冒烟（`pack:dir` + 解包布局校验；CI `desktop-pack-smoke`）
- [x] Desktop 安装包冒烟扩展 Win/mac 布局（`mac/*.app` 嵌套解析、`win-unpacked` + `.exe` bin；跨平台 fixture 单测）
- [x] Desktop 大纲虚拟列表（`outline-virtual`：flatten + 窗口裁剪；仅渲染可视行；失败跳转仍可定位）
- [x] Desktop 历史对比 UX 深化（交换方向 / 复制 JSON / 导出后打开与显示文件夹）
- [x] Desktop 统一大纲搜索（live/终态同步过滤、`/` 聚焦、查询/结论过滤持久化）
- [x] Desktop 失败路径一键跳转（大纲「上一/下一失败」+ `j`/`k`；`listFailScenarioIds`/`nextFailScenarioId`；选中同步 iframe）
- [x] Desktop 失败跳转可见性（`prepareFailJumpFilter`：清除遮挡 query / 切到 fail 过滤并重放 iframe filter）
- [x] Desktop Discover 超时可配置（设置页秒级输入；`discoverTimeoutMs` 持久化；默认 20s）
- [x] Desktop 历史对比导出模板可配置（`default`/`light`/`compact` + 标题；`compareCardTemplate`/`compareCardTitle` 持久化）
- [x] Desktop Windows 打包 CLI（`make build-windows`；`pack:check:win`/`pack:dir:win`/`pack:win`；平台级 `extraResources` 打入 `studio-reporter.exe`）

## 迭代日志

| 日期 | 项 | 结果 / 决策 |
|------|----|-------------|
| 2026-09-11 | 启动持续完善目标；盘点 v0.4.6 | 缺文档四件套；无 PR CI；assets 双源；demo UX 噪音 |
| 2026-09-11 | 文档 + CI + leaf-row + 展开/搜索 + Makefile | PR #12 |
| 2026-09-11 | 决策原则写入 DESIGN；assets SSoT；golangci v2 | 对照 Go embed / golangci v2 实践；修复 embed 丢失 WS 的漂移；lint 清零 |
| 2026-09-11 | viewer 结束引导打开 `index.html` | 对照 Allure「生成后再 open」：横幅 CTA + 可取消倒计时；`ReportGenerated`/元数据探测避免旧 index 误判 |
| 2026-09-11 | CI cover profile 摘要 | 对照常见 Go Actions：coverprofile + `go tool cover -func` 日志摘要 + artifact；暂不强阈值 / 不打扰 PR 评论权限 |
| 2026-09-11 | `.githooks/pre-commit` + `make hooks` | 对照 Makefile-first / core.hooksPath 实践；仅在前端 SSoT 路径变更时跑 `check-assets`；CI 仍是最终闸门 |
| 2026-09-11 | 与 GaugeStudio 同步：插件监听 + Studio discover 客户端 | Studio 0.1.1 默认解析 stdout 连接本插件；`GAUGE_STUDIO_WS` 仅作可选 outbound / Studio 兼容注入 |
| 2026-09-11 | 打印 CSS + `--input` smoke | 打印尊重 `filter-hidden`（所见即所打）；再生路径断言 `images/` 相对路径与 CLI `--input` |
| 2026-09-11 | uhileport 截图可移植 | 写入时重写 proto 为 `images/`；`GenerateFromJSON` 以输入文件目录为基路径；smoke 删除绝对源后再 regen |
| 2026-09-11 | viewer / 静态视觉对齐 | 共享 frag/行底色/统计卡/字号间距；live el-tag 映射到 `--pass/--fail/--skip`；类型标签统一中文 |
| 2026-09-11 | 历史对比 | manage 勾选两次运行；对比 verdict / 时长 delta / 规格书·场景·步骤计数；纯函数 `CompareHistoryRuns` 可单测 |
| 2026-09-11 | 复杂 Gauge 夹具 | 真实 `.spec`/`.cpt` 树 + Go 合成 SuiteResult（无需 Gauge 运行时）；覆盖嵌套概念、表驱动、截图、CJK、skip、multiline |
| 2026-09-11 | CANoe Overview / 分栏 / PDF | 交互在 HTML；PDF 为 Chrome 结构化打印；截图：步骤全量 + 失败标注 + hook + lightbox；`meta` 附加字段不升 formatVersion |
| 2026-09-11 | 单文件 HTML | 默认仍写目录版；可选 `report.single.html` 把 `images/` 内联为 data URI；分享单文件、不替代可移植 uhileport 单元 |
| 2026-09-11 | 工程 CLI 子命令 | `generate`/`serve`/`plugin`；legacy flag 保留；定位为工程入口而非产品面 |
| 2026-09-11 | Desktop 详细设计 | 产品终点改为 Desktop App；插件 WS 桥接；终态嵌入 index.html；短中期 Electron；见 DESKTOP.md |
| 2026-09-11 | Desktop P0 + 控制通道 | `desktop/` Electron 壳：discover、loopback 托管 viewer/index、ReportGenerated 跳转；插件侧 Hello/Ping/RequestSnapshot |
| 2026-09-11 | Hub 写入竞态 hardening | 跨进程 `WithHubLock`（flock）；uhilreport 先原子写再清旧文件；archives 排他 `Mkdir`；Engine finalize 互斥 |
| 2026-09-11 | Desktop P1 工作台骨架 | 历史页读 `history.json`、设置持久化、导出 PDF/单文件入口（调 CLI） |
| 2026-09-11 | Desktop 历史对比 | 历史页勾选两次运行；`compare.js` 对齐 Go `CompareHistoryRuns`（verdict / 时长 / 计数 delta） |
| 2026-09-11 | Desktop 打包骨架 | electron-builder；`pack:dir`/`pack`；extraResources 含 viewer/report-assets/CLI；packaged 态 `BUNDLE_ROOT=resourcesPath` |
| 2026-09-11 | Desktop P2 运行 Gauge | `gauge-run.js` 封装 `gauge run`；扫描 stdout discover；自动 `connect-ws`；运行栏 + 日志 |
| 2026-09-11 | Desktop 多项目/多会话 | `sessions.js`：最近项目列表 + 最多 3 路并行 Gauge；会话条切换 live；CI 增加 desktop unit tests |
| 2026-09-11 | 共享 discover + 版本门闸 | `@studio-reporter/discover`；Desktop `compat.js` 校验 ServerHello；CI 跑共享包测试 |
| 2026-09-11 | 本机插件安装检测 | `plugin-detect.js` 扫描 `GAUGE_HOME`/`~/.gauge`/`%APPDATA%/Gauge`；设置页 + discover 20s 超时引导 |
| 2026-09-11 | Desktop 自动更新骨架 | `electron-updater` + GitHub publish；设置/菜单检查更新；Release 增加 Desktop AppImage 上传；签名 secrets 仍缺 |
| 2026-09-11 | Desktop 原生大纲侧栏 | live `ReportSnapshot` → 精简大纲；侧栏高亮 current；点击 postMessage 选中 viewer；终态仍用内嵌导航 |
| 2026-09-11 | Desktop 终态大纲 | 打开报告目录时读 `report.json`；大纲侧栏跨 run/report 共享；静态 `index.html` 监听 select-node |
| 2026-09-11 | Desktop 大纲过滤 | 侧栏搜索 + pass/fail/skip；`filterOutline` 单测；filter postMessage 同步 viewer/静态报告 |
| 2026-09-11 | Desktop 历史过滤/导出 | `filterHistoryRuns` + 搜索/verdict chips；`resolveRunUhilreport`；勾选 1 次导出该次 |
| 2026-09-11 | Desktop 历史删除/批量导出 | `deleteHistoryRuns` 对齐 Go 删除语义；确认框；多选批量导出；单测覆盖 |
| 2026-09-11 | Desktop 历史定位/ hub 锁 | 打开所在文件夹 + 复制路径；删除经 `withHubLock`（python fcntl 对齐 Go flock） |
| 2026-09-11 | Desktop 套件结束系统通知 | `notify.js`；未聚焦时 Notification；点击聚焦并 navigate-report |
| 2026-09-11 | Desktop 自定义协议深链 | `deeplink.js`：`open`/`connect`/`hub`；单实例 + protocol client；builder schemes |
| 2026-09-11 | Desktop 键盘快捷键 | 菜单加速键 + 渲染进程监听；tablist 方向键；输入框内忽略 |
| 2026-09-11 | Desktop 明暗主题 | `theme.js` resolve system/light/dark；CSS tokens；设置下拉即时预览 |
| 2026-09-11 | Desktop 打开 .uhilreport | 文件菜单 / IPC / 深链 `open?path=*.uhilreport` → CLI generate 再生 HTML → 报告页；`uhil-open.js` 纯函数可单测 |
| 2026-09-11 | 静态报告极轻量交互 | hash 深链 `#scn:`/`#spec:`/`#overview`；工具栏「复制失败摘要」；sticky toolbar；`/`/`j`/`k`/`Esc`；决策：轻交互不 SPA |
| 2026-09-11 | Desktop 对比分享卡片 | `compare.js` 生成离线 HTML 卡片 + Markdown；历史对比面板「导出对比卡片 / 复制 Markdown」；Save Dialog 落盘 |
| 2026-09-11 | Desktop 会话恢复 / 最近 hub | `recentHubs`（选 hub / 保存 / 深链 `hub` 写入）；`lastTab` 切页持久化；`restoreSession` 启动恢复；设置与历史页下拉切换 |
| 2026-09-11 | Desktop 窗口布局记忆 | `window-state.js`：bounds + 最大化写入 `window-state.json`；多显示器离屏校正；resize/move/close 防抖持久化 |
| 2026-09-11 | Desktop 大纲分栏宽度记忆 | 可拖拽/键盘调整大纲宽度；`outlinePaneWidth` 写入 settings（180–480px）；与窗口 bounds 解耦 |
| 2026-09-11 | Desktop 大纲虚拟列表 | `flattenOutlineRows` + `computeVirtualWindow`；侧栏只挂载可视行；固定 28px 行高；失败 j/k 通过 scrollTop 定位 |
| 2026-09-11 | Desktop 安装包冒烟扩展 Win/mac | `findUnpackedAppDir` 解析 `mac`/`mac-arm64`→`*.app`；win 校验应用 exe；`.exe` CLI 不强制 Unix +x；fixture 覆盖三平台 |
| 2026-09-11 | Desktop 安装包冒烟 | `verify-pack-dir.js` 校验 electron-builder `--dir` 产物（app + extraResources）；`make desktop-pack-smoke`；CI job `desktop-pack-smoke` |
| 2026-09-11 | Desktop 历史对比 UX 深化 | 对比面板：交换基线/目标、复制 JSON（`studio-reporter.compare/v1`）、导出后打开卡片/显示文件夹 |
| 2026-09-11 | Desktop 统一大纲搜索 | 大纲 query/verdict 持久化；切页与 iframe load 重放 `studio-reporter:filter`；`/` 聚焦搜索框 |
| 2026-09-11 | Desktop 失败路径一键跳转 | 大纲「上一失败 / 下一失败」；主机层 `j`/`k`；`outlineFocusId` 高亮；必要时自动切到 fail 过滤并 `select-node` |
| 2026-09-11 | Desktop 失败跳转可见性 | `prepareFailJumpFilter`：跳转前清除遮挡 query、必要时切 fail 过滤，并重放 iframe `filter` 后再 `select-node` |
| 2026-09-11 | Desktop 历史对比导出模板 | 对比面板可选 default/light/compact + 自定义标题；`compareCardTemplate`/`compareCardTitle` 持久化；HTML `data-template` |
| 2026-09-11 | Desktop Discover 超时可配置 | 设置页「Discover 超时（秒）」；`discoverTimeoutMs`（5–120s）持久化；启动 Gauge 使用该超时 |
| 2026-09-11 | Desktop Win CLI 打包资源 | `make build-windows`；`pack:check:win` / `pack:dir:win` / `pack:win`；electron-builder 按平台 `extraResources` 打入 `.exe` |

## 下一任务（选定）

**大纲/报告性能 profiling 与批量选中优化**，或代码签名 secrets / GaugeStudio 消费 `@studio-reporter/discover`（后两项依赖仓外权限），或 Desktop 导出进度/取消。
