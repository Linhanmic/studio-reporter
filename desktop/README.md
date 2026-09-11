# Studio Reporter Desktop

Electron 工作台：实时 viewer、终态报告、历史对比、设置与导出。

设计真源：[DESKTOP.md](../DESKTOP.md)。

## 要求

- Node.js ≥ 18
- 本机可运行的 `studio-reporter` 插件（Gauge 执行期打印 discover 行）
- 导出 PDF / 单文件：仓库 `bin/studio-reporter`（`make build`）；Windows 包需 `bin/studio-reporter.exe`（`make build-windows`）

## 开发启动

```bash
cd desktop
npm install
npm start
```

## 打包

打包会把 `viewer.html`、`report-assets/` 作为公共 `extraResources` 打进安装包；CLI 按平台写入：`linux`/`mac` → `bin/studio-reporter`，`win` → `bin/studio-reporter.exe`。运行时通过 `app.isPackaged` 解析到 resources 根，而不是开发态的仓库根。

```bash
make build                 # 先产出本机 CLI
cd desktop
npm install
npm run pack:dir           # 未打包目录（本地/CI smoke）
npm run pack               # 平台安装包（Linux → AppImage 等）

# Windows（可在 Linux/mac 交叉）：
make build-windows         # 产出 bin/studio-reporter.exe
cd desktop && npm run pack:dir:win   # 或 npm run pack:win / make desktop-pack-win
```

或：`make desktop-pack`（build + `pack:dir`）。`pack:check:win` / `SR_PACK_PLATFORM=win` 会强制要求 `.exe`。

产物在 `desktop/dist/`。

## 用法

1. **运行 Gauge**：在运行栏选择 Gauge 项目（支持最近项目下拉）、specs、可选 env →「运行 Gauge」。可并行多个会话，会话条切换 live viewer；Desktop 解析 stdout discover 并自动连接。左侧共享大纲（规格书→场景；大报告虚拟列表）支持搜索与 pass/fail/skip 过滤（`/` 聚焦；过滤同步到 live/终态并持久化），以及「上一/下一失败」与 `j`/`k` 跳转，在 live / 终态均可点击定位。
2. **手动连接**：也可粘贴 `studio-reporter websocket: ws://127.0.0.1:<port>` → 连接 → 嵌入 live viewer。
3. **报告**：收到 `ReportGenerated` 后跳转静态 `index.html`（可在设置中关闭自动跳转）；窗口未聚焦时发系统通知（可关）；打开报告目录时从 `report.json` 填充大纲。也可 **文件 → 打开 .uhilreport…**（`Cmd/Ctrl+Shift+O`）或深链 `studio-reporter://open?path=*.uhilreport` 离线再生并打开。支持深链 `studio-reporter://open|connect|hub|compare`；历史对比面板可「复制深链」；导出的对比分享卡片 Markdown/HTML/JSON 也带上该深链。冷启动深链在窗口 `did-finish-load` 后处理，避免对比导航丢失。快捷键：`Ctrl/Cmd+1…4` 切页，`Ctrl/Cmd+Enter` 连接，`Ctrl/Cmd+Shift+H`/`F5` 刷新历史。设置支持 system/light/dark 主题。窗口位置/尺寸/最大化写入 `window-state.json`（离屏自动回正）。左侧大纲宽度可拖拽/键盘调整，并持久化为 `outlinePaneWidth`。
4. **历史**：设置报告根目录（含 `history.json`）后列出归档；可用「最近 hub」下拉切换；搜索 / pass/fail/skip 过滤；「全选过滤结果 / 清除勾选」；长列表虚拟滚动；点击打开；勾选 1 次可打开所在文件夹 / 复制路径；勾选两次可对比（可交换方向），并可导出离线 HTML 分享卡片（深色/浅色/紧凑模板 + 自定义标题，偏好会记住）、复制 Markdown/JSON；导出后可打开卡片或显示文件夹；勾选后可删除（确认框；删除持有与 Go 对齐的 `.hub.lock`）。
5. **导出**：历史页「导出 PDF / 单文件 HTML」调用 CLI `generate --pdf|--single`；勾选 1+ 次则批量导出所选 `.uhilreport`，否则导出根目录最新。批量导出显示进度条（百分比 + 当前文件名），可「取消导出」。可用「全选过滤结果 / 清除勾选」管理勾选（上限 50）。
6. **设置**：报告根目录与最近 hub、启动恢复上次标签、自动跳转、倒计时、Discover 超时、Gauge 可执行文件路径（持久化到 Electron `userData`）；本机插件检测；可选启动时检查 Desktop 更新；大纲宽度随拖拽写入同一设置文件。
7. **更新**：帮助菜单 / 设置页「检查更新」（`electron-updater` → GitHub Releases）；开发态跳过。

## 打包冒烟

```bash
make build
cd desktop && npm ci
npm run pack:dir          # electron-builder 解包目录
npm run pack:verify       # 校验 app + viewer/report-assets/bin（linux / mac.app / win-unpacked）
# 或一键：
make desktop-pack-smoke
```

CI 在 PR 上跑独立 job `desktop-pack-smoke`。

## 测试（无需 Electron 二进制）

```bash
cd packages/studio-reporter-discover && npm test
cd desktop
npm test   # discover + compat + plugin-detect + updater + outline + settings/history + compare + paths + gauge-run + sessions + window-state + verify-pack-dir
```

Discover 真源：`packages/studio-reporter-discover`（`@studio-reporter/discover`）。Desktop 经 `file:` 依赖引用。

连接后 Desktop 根据 `ServerHello` 做版本门闸（≥ 0.5.0 + 必需 capabilities）。启动 Gauge 后若超过设置的 Discover 超时（默认约 20s）未见 discover，会结合本机插件安装检测给出安装/启用提示。Live `ReportSnapshot` 同时驱动原生大纲侧栏。

代码签名：当前 Release 以 `CSC_IDENTITY_AUTO_DISCOVERY=false` 产出未签名 Linux 包；macOS/Windows 签名需配置仓库 secrets 后再开矩阵构建。
