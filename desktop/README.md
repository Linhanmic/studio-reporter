# Studio Reporter Desktop

Electron 工作台：实时 viewer、终态报告、历史对比、设置与导出。

设计真源：[DESKTOP.md](../DESKTOP.md)。

## 要求

- Node.js ≥ 18
- 本机可运行的 `studio-reporter` 插件（Gauge 执行期打印 discover 行）
- 导出 PDF / 单文件：仓库 `bin/studio-reporter`（`make build`）

## 开发启动

```bash
cd desktop
npm install
npm start
```

## 打包

打包会把 `viewer.html`、`report-assets/`、`bin/studio-reporter` 作为 `extraResources` 打进安装包；运行时通过 `app.isPackaged` 解析到 resources 根，而不是开发态的仓库根。

```bash
make build                 # 先产出 CLI
cd desktop
npm install
npm run pack:dir           # 未打包目录（本地/CI smoke）
npm run pack               # 平台安装包（Linux → AppImage 等）
```

或：`make desktop-pack`（build + `pack:dir`）。

产物在 `desktop/dist/`。

## 用法

1. **运行 Gauge**：在运行栏选择 Gauge 项目（支持最近项目下拉）、specs、可选 env →「运行 Gauge」。可并行多个会话，会话条切换 live viewer；Desktop 解析 stdout discover 并自动连接。左侧共享大纲（规格书→场景）在 live / 终态均可点击定位。
2. **手动连接**：也可粘贴 `studio-reporter websocket: ws://127.0.0.1:<port>` → 连接 → 嵌入 live viewer。
3. **报告**：收到 `ReportGenerated` 后跳转静态 `index.html`（可在设置中关闭自动跳转）；打开报告目录时从 `report.json` 填充大纲。
4. **历史**：设置报告根目录（含 `history.json`）后列出归档；点击打开；勾选两次运行可对比（verdict / 时长 / 计数）。
5. **导出**：历史页「导出 PDF / 单文件 HTML」调用 CLI `generate --pdf|--single`。
6. **设置**：报告根目录、自动跳转、倒计时、Gauge 可执行文件路径（持久化到 Electron `userData`）；本机插件检测；可选启动时检查 Desktop 更新。
7. **更新**：帮助菜单 / 设置页「检查更新」（`electron-updater` → GitHub Releases）；开发态跳过。

## 测试（无需 Electron 二进制）

```bash
cd packages/studio-reporter-discover && npm test
cd desktop
npm test   # discover + compat + plugin-detect + updater + outline + settings/history + compare + paths + gauge-run + sessions
```

Discover 真源：`packages/studio-reporter-discover`（`@studio-reporter/discover`）。Desktop 经 `file:` 依赖引用。

连接后 Desktop 根据 `ServerHello` 做版本门闸（≥ 0.5.0 + 必需 capabilities）。启动 Gauge 后若约 20s 未见 discover，会结合本机插件安装检测给出安装/启用提示。Live `ReportSnapshot` 同时驱动原生大纲侧栏。

代码签名：当前 Release 以 `CSC_IDENTITY_AUTO_DISCOVERY=false` 产出未签名 Linux 包；macOS/Windows 签名需配置仓库 secrets 后再开矩阵构建。
