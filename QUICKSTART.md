# Studio Reporter — Quick Start

面向首次接入与本地验证。对应插件版本 **0.5.2**。

## 0. 产品方向

主产品目标是 **Desktop App**（见 [DESKTOP.md](DESKTOP.md)）：桌面工作台通过 WebSocket 连接 reporter 插件看实时/终态报告。  
当前仓库已提供：**插件桥接 + 静态报告 + 工程 CLI + Desktop P0 壳**（`desktop/`）。

工程 CLI（无 UI / CI）：

```bash
studio-reporter generate --input path/to/run.uhilreport --out /tmp/out --single
studio-reporter serve --dir reports/studio-report
studio-reporter version
```

## 1. 安装 Gauge 插件（桥接）


从 [Releases](https://github.com/Linhanmic/studio-reporter/releases) 下载对应平台 zip，例如：

```bash
gauge install studio-reporter --file studio-reporter-0.5.2-linux.x86_64.zip
```

或解压到 Gauge 插件目录：

```bash
# Linux 示例
mkdir -p ~/.gauge/plugins/studio-reporter/0.5.2
unzip studio-reporter-0.5.2-linux.x86_64.zip -d ~/.gauge/plugins/studio-reporter/0.5.2
```

确认 `plugin.json` 中 `version` 与目录名一致。

## 2. 跑一次 Gauge

```bash
cd <your-gauge-project>
gauge run specs/
```

启动时 stdout 会出现：

```text
studio-reporter websocket: ws://127.0.0.1:<port>
```

结束时默认写入：

```text
reports/studio-report/index.html          # 静态终态报告（直接打开）
reports/studio-report/viewer.html         # 实时查看器（运行中用）
reports/studio-report/report.json         # 快照 / 调试
reports/studio-report/*.uhilreport        # 可再生成 HTML
reports/studio-report/archives/<id>/      # 历史归档（含各自 index.html）
reports/studio-report/manage.html         # 历史管理
```

## 3. 查看报告

```bash
# 终态（推荐）
xdg-open reports/studio-report/index.html

# 运行中实时（把端口换成插件打印的端口）
xdg-open "reports/studio-report/viewer.html?ws=ws://127.0.0.1:<port>"
# Suite 结束后 viewer 会提示打开静态 index.html（可取消自动跳转）

# 历史管理（删除归档需要 HTTP；勾选两次运行可对比）
studio-reporter --serve --dir reports/studio-report --addr 127.0.0.1:8765
# 浏览器打开 http://127.0.0.1:8765/manage.html
```

静态报告为 **CANoe 风格左右分栏**：左侧导航树跳转规格书/场景，右侧先看 **Overview**（环境 / 主机 / 插件 / 统计），再看结果树。工具栏可按 **规格书 / 场景** 过滤；支持展开/折叠与搜索。截图在步骤与 hook 层级以缩略图展示，点击放大。

## 4. 从 `.uhilreport` 再生 HTML / PDF / 单文件

`.uhilreport` 内截图路径为相对 `images/...`；请与同目录的 `images/` 一起拷贝后再再生：

```bash
studio-reporter generate \
  --input reports/studio-report/demo-project-2026-08-28_10.30.00.uhilreport \
  --out /tmp/studio-report \
  --pdf --single
xdg-open /tmp/studio-report/index.html
# PDF（可选）：/tmp/studio-report/report.pdf
# 单文件 HTML（可选）：/tmp/studio-report/report.single.html
```

`make smoke-input` 会断言删除原始绝对路径截图后仍可从 hub 的 `images/` 再生。
## 5. 本地开发

```bash
git clone https://github.com/Linhanmic/studio-reporter.git
cd studio-reporter

# 测试 / 编译（推荐显式 toolchain）
make ci
make cover   # 覆盖率摘要（CI 同脚本）
make smoke-input  # --input 再生 + 截图相对路径
make smoke-complex  # 复杂夹具结构断言（嵌套概念 / 截图 / CJK / skip）
make demo-complex   # 生成 .demo/complex-hub（gitignored）便于手工打开
make hooks   # 可选：启用 .githooks（前端提交前 check-assets）
GOTOOLCHAIN=go1.27.0 go build -o bin/studio-reporter .

# 打 Gauge 安装包
./build.sh linux amd64
```
可选环境变量见 [README.md](README.md)。常用：

| 变量 | 作用 |
|------|------|
| `gauge_reports_dir` | 报告根目录（默认 `reports`） |
| `GAUGE_STUDIO_SKIP_REPORT` | `true` 时不写 HTML |
| `GAUGE_STUDIO_OPEN_BROWSER` | `true` 时结束后打开 `index.html` |
| `GAUGE_STUDIO_WRITE_PDF` | `true` 时额外写 `report.pdf`（需 Chrome/Chromium） |
| `GAUGE_STUDIO_WRITE_SINGLE` | `true` 时额外写 `report.single.html`（截图内联） |
| `GAUGE_STUDIO_REPORT_META` | Overview 额外 KV：`k=v,k2=v2` |
| `CHROME_PATH` | 指定 headless Chrome 可执行文件 |
| `GAUGE_STUDIO_WS` | 额外再推一份事件的 WebSocket URL（可选） |

## 6. Desktop（可选）

```bash
cd desktop
npm install
npm start
```

Gauge 跑起来后，把 stdout 里的 `studio-reporter websocket: ws://127.0.0.1:<port>` 粘贴进 Desktop 连接栏；  
或在运行栏选择 Gauge 项目后点「运行 Gauge」，Desktop 会解析 discover 并自动连接。  
连接成功后 Desktop 根据插件 `ServerHello` 做版本门闸（需要插件 ≥ 0.5.0）。  
「设置」页可检测本机 `~/.gauge/plugins/studio-reporter` 安装版本；运行后约 20s 未见 discover 会提示检查插件。  
打包安装包可通过「帮助 → 检查更新」或设置页对照 GitHub Releases（开发态 `npm start` 会跳过）。  
运行页与报告页共享左侧原生大纲：live 随 `ReportSnapshot` 更新，打开终态目录时读取 `report.json`；支持搜索与 pass/fail/skip 过滤，并同步到 iframe。点击可定位 viewer / 静态报告节点。  
「历史」页支持搜索与 pass/fail/skip 过滤；勾选 1 次可打开所在文件夹 / 复制路径；勾选 1+ 次可导出或删除（确认，删除持有 hub 锁）；勾选恰好 2 次可对比，并可导出离线 HTML 分享卡片或复制 Markdown 摘要。  
「运行」页嵌入 `viewer.html`；收到 `ReportGenerated` 后跳「报告」页打开静态 `index.html`。窗口未聚焦时会发系统通知（设置可关），点击通知可回到 Desktop 并打开终态。
深链：`studio-reporter://open?dir=<报告目录>`、`studio-reporter://connect?url=ws://...`、`studio-reporter://hub?dir=<hub>`（安装包注册协议；开发态也会尝试注册）。
快捷键：`Ctrl/Cmd+1…4` 切换运行/报告/历史/设置；`Ctrl/Cmd+Enter` 连接；`Ctrl/Cmd+Shift+H` 或 `F5` 刷新历史；页签支持方向键。
设置中可选择界面主题：跟随系统 / 深色 / 浅色。

共享 discover 辅助包：`packages/studio-reporter-discover`（`@studio-reporter/discover`），供 Desktop / GaugeStudio 复用同一 stdout 契约。

打包（先 `make build` 产出 CLI）：

```bash
cd desktop
npm run pack:dir   # 未打包目录 smoke
npm run pack       # 平台安装包（Linux → AppImage 等）
# 或：make desktop-pack
```

详见 [desktop/README.md](desktop/README.md) / [DESKTOP.md](DESKTOP.md)。

## 7. 下一步阅读

- [DESIGN.md](DESIGN.md) — 架构与决策
- [TODO.md](TODO.md) — 迭代 backlog
- [DESKTOP.md](DESKTOP.md) — Desktop 产品设计
- [REPORT_FORMAT.md](REPORT_FORMAT.md) — 磁盘格式契约
- [API.md](API.md) — WebSocket / 事件协议
