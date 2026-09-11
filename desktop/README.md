# Studio Reporter Desktop (P0)

Electron 工作台骨架：发现插件 WebSocket、嵌入 live `viewer.html`、终态嵌入静态 `index.html`。

设计真源：[DESKTOP.md](../DESKTOP.md)。

## 要求

- Node.js ≥ 18
- 本机已安装并可运行的 `studio-reporter` 插件（Gauge 执行期打印 discover 行）

## 启动

```bash
cd desktop
npm install
npm start
```

## P0 用法

1. 在 Gauge 项目执行 `gauge run specs/`。
2. 复制 stdout 中的 `studio-reporter websocket: ws://127.0.0.1:<port>`（或仅 URL / 端口）。
3. 粘贴到 Desktop「WebSocket」输入框 → **连接**。
4. 「运行」页嵌入实时 viewer；收到 `ReportGenerated` 后横幅倒计时跳「报告」页（CANoe 静态 `index.html`）。
5. 菜单 **文件 → 打开报告目录…** 可离线打开任意 hub / archive。

## 测试（无需 Electron 二进制）

```bash
cd desktop
npm test   # discover 解析单测
```

## 边界（P0）

- 不启动 Gauge；只附着 WS / 打开磁盘报告。
- 本地 loopback HTTP 托管 viewer / 报告，避免 `file://` 限制。
- 主进程发送 `ClientHello` / `RequestSnapshot`（插件 ≥ 0.5.1）。
