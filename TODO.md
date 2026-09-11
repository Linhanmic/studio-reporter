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
- [x] 截图灯箱 ←/→ 多图导航（键盘 + 前后按钮；`StepLightboxIndex`）

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
- [x] Desktop 自定义协议深链（`studio-reporter://open|connect|hub|compare`；单实例；electron-builder protocols）
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
- [x] Desktop 导出进度条 UI（百分比 + 当前 `.uhilreport` 文件名；`formatExportProgress`）
- [x] Desktop/报告 场景级对比（verdict + 失败原因 diff；`CompareScenarios` / `scenario-compare.js`）
- [x] 静态报告「仅失败步骤」模式（工具栏切换；隐藏 pass/skip step/concept；sessionStorage 记忆）
- [x] 对比分享卡片纳入场景级 diff（Markdown/HTML/JSON；`formatScenarioCompareMarkdown/Html`）
- [x] 静态报告打印/PDF 尊重仅失败步骤（`@media print` 重申隐藏；`beforeprint` 展开失败路径；`#fail-steps` / `GAUGE_STUDIO_PDF_FAIL_STEPS`）
- [x] 静态报告仅失败步骤模式下场景级折叠精简（隐藏非 fail 场景及无 fail 场景的 spec/datarow/datadriven；`:has()`）
- [x] 静态报告导航树与仅失败步骤模式同步（隐藏非 fail 场景与空壳 spec；与结果树一致）
- [x] Desktop 深链直达两侧历史对比（`studio-reporter://compare?base=&target=`；可选 `hub`；`navigate-compare` → `openCompareByIds`）
- [x] Desktop 对比面板一键复制 compare 深链（`buildCompareDeepLink` +「复制深链」；剪贴板含可选 hub）
- [x] Desktop 对比分享卡片附带 compare 深链（Markdown/HTML/JSON；`resolveCompareShareDeepLink`）
- [x] Desktop 深链冷启动队列加固（`createDeepLinkQueue` + `did-finish-load` 后再 flush；连续重复去重；单测覆盖）
- [x] 静态报告失败步骤模式下 Overview 失败摘要与可见树一致（`syncFailReasonOverview` / `FilterFailReasonGroups`；过滤或仅失败步骤时聚合与复制摘要仅统计可见失败场景）
- [x] 静态报告 Overview 汇总计数与过滤可见树对齐（顶栏 stat-card + Overview 计数表随过滤/仅失败步骤重算；`syncOverviewCounts`）
- [x] 静态报告工具栏过滤徽标与可见树实时对齐（规格书/场景过滤器数量徽标随搜索与仅失败步骤更新；`syncFilterBadges`）
- [x] 静态报告 Overview 规格书清单随过滤可见树同步（隐藏不可见规格书并刷新场景计数；`syncOverviewSpecList`）
- [x] 静态报告导航树场景计数与过滤可见树对齐（规格书旁 `nav-count` 随过滤/仅失败步骤更新；`syncNavCounts`）
- [x] 静态报告打印页眉标注可见过滤范围（`print-scope-banner` / `describePrintScope`；打印/PDF 标明当前过滤与仅失败步骤，避免误读为全量）
- [x] 静态报告导航场景项随过滤隐藏（`syncNavCounts` 同步 `nav-scn.filter-hidden`；规格书旁计数仅含可见场景）
- [x] Desktop 对比面板「在报告中查看」跳转并定位差异场景（基线/目标按钮；scnId + hash）
- [x] Desktop 对比按场景差异类型过滤导出（面板勾选变差/修复/新增/消失/原因变化；展示与 HTML/Markdown/JSON 分享同源；`filterScenarioCompare` / `kindsFilter`）
- [x] Desktop 对比场景类型过滤持久化（`compareScenarioKinds` 写入 settings；重启后恢复勾选）
- [x] Desktop 对比深链携带场景类型过滤（`studio-reporter://compare?...&kinds=`；解析/复制/分享卡片同源；打开时恢复勾选）
- [x] 静态报告过滤状态写入可分享 URL（`#focus?q=&spec=&scenario=&failSteps=1`；工具栏双向同步；Go `ParseShareHash`/`FormatShareHash`）
- [x] 静态报告「复制可见范围链接」工具栏按钮（`copy-share-link`；复制当前 share hash 完整 URL）
- [x] 静态报告分享链接复制后展示可读过滤摘要（状态栏附带 q/scenario/failSteps/定位）
- [x] Desktop 对比分享卡片场景 diff 一键打开报告定位
- [x] Desktop 对比面板复制场景打开深链
- [x] Desktop 历史列表右键打开定位（打开报告 / 复制 open 深链 / 显示文件夹 / 复制路径）
- [x] Desktop 历史多选批量复制打开深链（工具栏；多条换行；失败默认 failSteps）
- [x] Desktop 对比分享卡片模板预览（导出前按 default/light/compact 预览；改模板/标题即时刷新）
- [x] Desktop 历史失败运行快速筛选强化（topFailReason 写入 history；原因关键字过滤；一键复制全部失败 open 深链）
- [x] Desktop 分享卡片导出后一致性抽检（模板/标题/场景过滤 meta；导出后自动打开预览；`inspectCompareShareCardHtml`）
- [x] Desktop hub 历史文件监视自动刷新（`watchHubHistory`；`hub-watch.js`；变更时保留勾选）
- [x] Desktop 历史多运行趋势与不稳定场景面板（`history-trend.js`；过滤窗口 sparkline + flaky 列表）
- [x] Desktop 历史趋势窗口与过滤偏好持久化（`historyTrendLimit` / `historyTrendFlakyLimit` / `historyQuery` / `historyVerdict` / `historyFailReasonQuery`）
- [x] Release 管道加固（plugin+linux+win 分 job；SHA256SUMS；`CSC_IDENTITY_AUTO_DISCOVERY=false` 无签名 secrets 可发 unsigned）
- [x] Desktop 自动更新 feed 离线校验 + 代码签名 secrets 文档（`update-feed.js`；DESKTOP 签名表；updater 下载/就绪/安装路径单测）
- [x] 历史失败摘要 digest（跨运行聚合 topFailReason；Desktop 复制 Markdown；CLI `digest --dir`；JSON/Markdown）
- [x] Desktop/CLI 失败摘要附带打开深链（`studio-reporter://open?run=&hub=&failSteps=1`；工具栏「复制摘要深链」；Markdown/JSON 同源）
- [x] manage.html 历史失败摘要（`report-assets/history-digest.js` 与 Desktop/CLI 同源；面板 + 复制 Markdown/深链；表格展示 topFailReason）
- [x] 静态报告 Overview 失败原因一键定位（点击次数/原因跳到该类首个可见失败场景；尊重过滤与仅失败步骤）
- [x] Desktop 打开 manage 失败摘要深链联调（无 hub 时回退当前/最近 hub；failSteps 无 focus 时写 `#overview?failSteps=1`）
- [x] CLI `digest --write` 旁路文件（hub 下写入 `fail-digest.md` / `fail-digest.json` 供 CI 工件）
- [x] Desktop 导出刷新 fail-digest 旁路（导出 PDF/单文件后写入 hub `fail-digest.md`/`json`，失败不阻断导出）
- [x] 插件 finalize 同步刷新 fail-digest（`recordCompletedRun` / 删除历史后 best-effort 写旁路，不阻断套件结束）
- [x] manage.html 展示/打开 fail-digest 旁路（探测 hub 旁路 md/json；工具栏「旁路 MD/JSON」+ 摘要面板链接；刷新时重探测）
- [x] Desktop 历史页打开 fail-digest 旁路（工具栏「旁路 MD/JSON/位置」；`probeHistoryFailDigestSidecars`；导出后刷新按钮态）
- [x] Desktop 一键刷新 fail-digest 旁路
- [x] manage.html 一键刷新 fail-digest 旁路（`POST /api/fail-digest`；工具栏「刷新旁路」；仅 localhost serve）
- [x] fail-digest 旁路 `formatVersion` / `generatedAt`（JSON+Markdown 元数据；Go/Desktop/浏览器同源；便于 CI 校验工件新鲜度）
- [x] fail-digest CI 新鲜度闸门（`studio-reporter digest --check --max-age`；校验 formatVersion + generatedAt；`make check-fail-digest`）
- [x] Desktop `.uhilreport` 深链保留 failSteps；manage 失败行打开带 `#overview?failSteps=1`
- [x] 静态报告 PDF/打印样式回归抽检（修复 `#fail-steps` 启动被 `applyFilter`→`syncShareHash` 冲掉；`print-color-adjust`；Chrome `--virtual-time-budget`；复杂 hub PDF 指纹差分测试）
- [x] 静态报告 failSteps 解析大小写/别名与 Go/Desktop 对齐（`TRUE`/`failsteps`/`fail_steps`）
- [x] Desktop 打包冒烟扩展：CI Win 交叉 `pack:dir:win` + unsigned 闸门文档对齐（`CSC_IDENTITY_AUTO_DISCOVERY=false`）
- [x] 静态报告 failSteps 别名浏览器冒烟（Chrome dump-dom；`make smoke-failsteps-hash`；覆盖 TRUE/failsteps/fail_steps/FALSE）
- [x] manage/serve 失败摘要旁路与深链联调抽检（`TestManageServeFailDigestDeepLinkSmoke`；`make smoke-manage-digest`；POST 旁路 + sidecar 深链 + manage 契约 + Chrome `#overview?failSteps=1`）
- [x] 将 `smoke-manage-digest` / `smoke-failsteps-hash` 纳入 PR CI（`report-browser-smoke` job；安装 Chrome；`CI=true` 时缺 Chrome 失败而非跳过）
- [x] digest 深链对含特殊字符 hub 路径的编码/打开抽检（Go/report-assets/Desktop 往返；空格/`#`/`?&=`/中文/Windows 路径）
- [x] 静态报告分享 hash 对 Unicode/空格查询串的编码往返抽检（Go/static/Desktop；focus 百分号编码 + URL.hash 往返；锁定 `encodeShareFocus`）

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

| 2026-09-11 | Desktop 导出进度/取消 + 历史批量勾选 | `export-report` 异步 spawn；进度事件 + 取消；历史「全选过滤结果 / 清除勾选」；导出按钮显示数量 |

| 2026-09-11 | Desktop 历史列表虚拟化 | `#historyList` 复用 `computeVirtualWindow`；固定行高 56；过滤输入 120ms 防抖 |

| 2026-09-11 | 静态报告过滤性能 | `applyFilter` 仅切换 structural 节点；`data-name`；搜索 120ms 防抖；展开/折叠不强制 step/concept |

| 2026-09-11 | 静态报告失败原因聚合 | Overview「失败原因聚合」按首条错误归类；复制失败摘要含聚合段；`AggregateFailReasons` 单测 |

| 2026-09-11 | 截图灯箱 ←/→ 导航 | `StepLightboxIndex` + 键盘/按钮；`#shot-lightbox-pos`；与 JS 契约对齐单测 |

| 2026-09-11 | Desktop 导出进度条 UI | 历史页进度条 + 百分比/当前文件名；`formatExportProgress`；状态栏同步 |

| 2026-09-11 | 场景级运行对比 | `CompareScenarios` + Desktop `scenario-compare`；历史对比面板展示变差/修复/新增/消失与失败原因 |

| 2026-09-11 | 静态报告仅失败步骤 | 工具栏切换 `fail-steps-only`；CSS 隐藏非失败 step/concept；自动展开失败步骤与祖先 |

| 2026-09-11 | 对比分享卡片含场景 diff | Markdown/HTML/JSON 分享输出附带场景级变差/修复/新增/消失与失败原因 |

| 2026-09-11 | 打印/PDF 尊重仅失败步骤 | 打印 CSS 重申 `fail-steps-mode`；`beforeprint` 展开失败祖先；深链 `#fail-steps`；CLI PDF 经 `GAUGE_STUDIO_PDF_FAIL_STEPS` 附带 fragment |

| 2026-09-11 | Desktop 深链直达两侧对比 | `studio-reporter://compare?base=&target=`（`a`/`b`、`from`/`to`；可选 `hub`）；主进程 `navigate-compare`；渲染层 `openCompareByIds` 复用 `runCompare` |

| 2026-09-11 | Desktop 对比面板一键复制 compare 深链 | `buildCompareDeepLink` + 面板「复制深链」；IPC 写剪贴板；可选附带当前 `reportHubDir` |

| 2026-09-11 | 对比分享卡片附带 compare 深链 | Markdown/HTML footer/JSON `deepLink` 写入 `studio-reporter://compare`；导出/复制自动带当前 hub |

| 2026-09-11 | 深链冷启动队列加固 | `createDeepLinkQueue` 统一冷启动/早到 open-url；窗口 `did-finish-load` 后 flush，避免 compare 导航丢失；连续相同 URL 去重 |

| 2026-09-11 | 仅失败步骤场景级折叠 | fail-steps-mode 额外隐藏非 fail 场景，以及无 fail 子场景的 spec/datarow/datadriven（`:has()`）；屏显与打印一致 |

| 2026-09-11 | 导航树同步 fail-steps | 左侧导航隐藏非 fail 场景与无 fail 子项的 spec；避免点击空壳 |

| 2026-09-11 | Overview 失败摘要对齐可见树 | 过滤/fail-steps-mode 下 `syncFailReasonOverview` 隐藏不可见场景引用并重算次数；`FilterFailReasonGroups` 镜像契约；复制失败摘要同步 |

| 2026-09-11 | Overview 汇总计数对齐可见树 | 顶栏 stat-card 与 Overview 计数表在过滤/仅失败步骤时按可见节点重算；Go `FormatCountsRatio/Sub` + `data-stat-kind`/`data-count-kind` |

| 2026-09-11 | 工具栏过滤徽标对齐可见树 | `syncFilterBadges` 按搜索/另一维过滤/fail-steps-mode 重算规格书与场景过滤器徽标 |

| 2026-09-11 | Overview 规格书清单对齐可见树 | `syncOverviewSpecList` 隐藏不可见规格书行并刷新场景 passed/total |

| 2026-09-11 | 导航树场景计数对齐可见树 | `syncNavCounts` 更新规格书旁场景计数并隐藏无可见场景的导航节点 |

| 2026-09-11 | 导航场景项随过滤隐藏 | `syncNavCounts` 同步隐藏不可见 `nav-scn`，规格书计数只含可见场景 |
| 2026-09-11 | 打印页眉标注可见范围 | 打印前写入 `print-scope-banner`：过滤/搜索/仅失败步骤状态，避免 PDF 被当成全量报告 |
| 2026-09-11 | Desktop 对比场景类型过滤 | 对比面板勾选场景 diff 种类；`filterScenarioCompare` 作用于面板与分享卡片/MD/JSON；JSON 写入 `kindsFilter` |
| 2026-09-11 | Desktop 对比场景类型过滤持久化 | `compareScenarioKinds` 进 `desktop-settings.json`；全选/空 ⇒ null；面板勾选变更即保存 |
| 2026-09-11 | Desktop 对比深链携带场景类型过滤 | `kinds=` 查询参数；`parseDeepLink`/`buildCompareDeepLink`/`resolveCompareShareDeepLink`；打开时写入 state 并持久化 |
| 2026-09-11 | 静态报告过滤状态可分享 URL | fragment `#focus?q=&spec=&scenario=&failSteps=1`；兼容 `#fail-steps`；工具栏变更 `replaceState`；Go 镜像解析 |
| 2026-09-11 | 对比分享卡片场景打开深链 | HTML/Markdown/JSON 场景 diff 附带 `studio-reporter://open?run=&hub=&focus=&failSteps=`；主进程 open 支持 run+focus；与面板「在报告中查看」同源 |
| 2026-09-11 | 历史列表右键打开定位 | 原生 Menu：打开报告、复制 open 深链、显示文件夹、复制路径；失败运行默认 failSteps |
| 2026-09-11 | 历史多选批量复制打开深链 | 工具栏按钮；`buildHistoryOpenDeepLinks`；IPC `copy-open-deeplinks`；失败运行默认 failSteps |
| 2026-09-11 | 对比分享卡片模板预览 | 对比面板「预览卡片」模态 iframe srcdoc；模板/标题变更时若预览打开则即时刷新；可从预览直接导出 |
| 2026-09-11 | 历史失败运行快速筛选强化 | history 写入 topFailReason；Desktop 失败原因关键字过滤；工具栏「复制失败打开深链」 |
| 2026-09-11 | 分享卡片导出一致性抽检 | HTML meta 写入 template/title/kinds；导出后 `inspectCompareShareCardHtml`；默认自动打开预览；状态栏回报抽检结果 |
| 2026-09-11 | Desktop hub 历史文件监视自动刷新 | `hub-watch.js` 监视 history.json/archives；设置 `watchHubHistory`；变更时保留勾选刷新列表 |
| 2026-09-11 | Desktop 历史多运行趋势与不稳定场景 | `history-trend.js`：过滤窗口时长 sparkline + 失败率；扫描 report.json 找翻转场景；面板可点开运行 |

| 2026-09-11 | Desktop 趋势窗口/过滤偏好持久化 + Release 加固 | 设置页可配 trend/flaky 上限；历史搜索/结论/失败原因防抖写入 settings；Release 分 plugin/linux/win + SHA256SUMS + 显式关闭自动签名发现 |

| 2026-09-11 | 自动更新 feed 离线校验 + 签名 secrets 文档 | `update-feed.js` 解析/校验 latest*.yml + publish owner/repo；updater 补下载/就绪/安装单测；DESKTOP 记录 CSC_*/WIN_CSC_* |

| 2026-09-11 | 历史失败摘要 digest | 跨运行聚合 topFailReason；Desktop 复制 Markdown；CLI `digest` 输出 md/json |

| 2026-09-11 | 失败摘要附带打开深链 | digest Markdown/JSON 含 `studio-reporter://open`；Desktop「复制摘要深链」；CLI 与趋势面板同源；复用 deeplink 契约 |

| 2026-09-11 | 失败摘要附带打开深链 | digest Markdown/JSON 含 `studio-reporter://open`；Desktop「复制摘要深链」；CLI 与趋势面板同源；复用 deeplink 契约 |

| 2026-09-11 | manage.html 历史失败摘要 | 嵌入 `history-digest.js`；失败摘要面板 + 复制 Markdown/深链；列表展示 topFailReason；与 Desktop/CLI 契约对齐 |

| 2026-09-11 | Overview 失败原因一键定位 | 点击次数/原因跳到该类首个可见失败场景；尊重过滤与仅失败步骤；场景名链接行为不变 |

| 2026-09-11 | Desktop 打开 manage 失败摘要深链联调 | 无 hub 深链回退当前/最近 hub；failSteps 无 focus 时应用 overview 仅失败步骤 hash |

| 2026-09-11 | CLI digest --write 旁路文件 | `--write` 在 hub 写入 fail-digest.md/json；可选 `--out`；stdout 仍输出所选 format |

| 2026-09-11 | Desktop 导出刷新 fail-digest 旁路 | 导出完成后写 hub fail-digest.*；与 CLI `--write` 契约一致；写失败仅告警 |

| 2026-09-11 | 插件 finalize 同步刷新 fail-digest | 套件落盘/删除历史后刷新 fail-digest.*；失败不阻断 finalize |

| 2026-09-11 | manage.html 展示/打开 fail-digest 旁路 | 探测 fail-digest.md/json；工具栏旁路按钮 + 摘要面板链接；缺失时提示；与 CLI/插件旁路契约对齐 |

| 2026-09-11 | Desktop 历史页打开 fail-digest 旁路 | 工具栏「旁路 MD/JSON/位置」；probeHistoryFailDigestSidecars；导出后刷新按钮态 |

| 2026-09-11 | Desktop 一键刷新 fail-digest 旁路 | 工具栏「刷新旁路」；IPC 读 history.json 重写 md/json；不必先导出 |

| 2026-09-11 | manage.html 一键刷新 fail-digest 旁路 | POST /api/fail-digest；工具栏「刷新旁路」；仅 localhost serve |

| 2026-09-11 | fail-digest 旁路 formatVersion/generatedAt | JSON/Markdown 写入 formatVersion=1 与 RFC3339 generatedAt；Go/Desktop/report-assets 同源 |

| 2026-09-11 | fail-digest CI 新鲜度闸门 | `digest --check --max-age` 校验 formatVersion/generatedAt；`make check-fail-digest` |

| 2026-09-11 | PDF/打印样式回归抽检 | 根因：启动 `applyFilter`→`syncShareHash` 在解析 URL 前把 `#fail-steps` 写成 `#overview`；`applyingHash` 启动门闩 + `failSteps=null` 保留会话；打印色准；`--virtual-time-budget`；复杂 hub PDF 差分断言 |

| 2026-09-11 | uhilreport/manage 深链 failSteps | `open?path=*.uhilreport&failSteps=1` 再生后补挂 share hash；manage 失败行打开对齐 Desktop 摘要深链 |

| 2026-09-11 | failSteps 解析跨端对齐 | Go/Desktop/static 统一键名 failSteps|fail-steps|failsteps|fail_steps；真值 1/true/yes、假值 0/false/no 大小写不敏感 |

| 2026-09-11 | Desktop 打包 unsigned 闸门 | CI/Release/pack-smoke 显式 `CSC_IDENTITY_AUTO_DISCOVERY=false`；新增 Win 交叉 pack smoke；DESKTOP 标明 secrets 未接线；verify 打印 signing=unsigned |

| 2026-09-11 | manage/serve 旁路与深链联调抽检 | 端到端：真实失败 hub → serve → POST `/api/fail-digest` → md/json 含 `studio-reporter://open?…&failSteps=1` → manage/JS 契约 → Chrome dump-dom 断言 `#overview?failSteps=1` 进入 `fail-steps-mode`；`make smoke-manage-digest` |

| 2026-09-11 | report-browser-smoke CI | PR CI 新增 Chrome 安装 job，显式跑 `smoke-failsteps-hash` + `smoke-manage-digest`；`CI=true` 时缺浏览器硬失败 |

| 2026-09-11 | digest 深链特殊 hub 路径编码抽检 | Go `url.Values` / JS `URLSearchParams` / Desktop `parseDeepLink` 对空格、`#`、`?&=`、中文、Windows 路径往返一致；补齐三端单测 |

| 2026-09-11 | 分享 hash Unicode/空格往返抽检 | 锁定 focus/query 百分号编码与 URL.hash 往返（中文/空格/emoji/`+`）；Go + Desktop 单测；与 static_report.js `encodeShareFocus` 对齐 |

| 2026-09-11 | 修复 tip CI：lint + report-browser-smoke | ineffassign 检查 ReadAll err；Chrome dump-dom/PDF 加 `--no-sandbox` 等以适配 setup-chrome 无 setuid sandbox |

## 下一任务（选定）

**静态报告 focus 含 `/` 的 PathEscape 与 DOM id 对齐抽检**，或 **GaugeStudio 消费 `@studio-reporter/discover`**（缺仓外权限），或 **真实 GitHub Release feed 抽检**（需发测试 tag），或证书到位并接线后启用签名 job。