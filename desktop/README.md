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

1. **运行**：粘贴 `studio-reporter websocket: ws://127.0.0.1:<port>` → 连接 → 嵌入 live viewer。
2. **报告**：收到 `ReportGenerated` 后跳转静态 `index.html`（可在设置中关闭自动跳转）。
3. **历史**：设置报告根目录（含 `history.json`）后列出归档；点击打开；勾选两次运行可对比（verdict / 时长 / 计数）。
4. **导出**：历史页「导出 PDF / 单文件 HTML」调用 CLI `generate --pdf|--single`。
5. **设置**：报告根目录、自动跳转与倒计时秒数（持久化到 Electron `userData`）。

## 测试（无需 Electron 二进制）

```bash
cd desktop
npm test   # discover + settings/history + compare + paths
```
