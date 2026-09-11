# Studio Reporter — Quick Start

面向首次接入与本地验证。对应插件版本 **0.5.0**。

## 0. 作为独立报告工具（推荐入口）

```bash
studio-reporter generate --input path/to/run.uhilreport --out /tmp/out --single
studio-reporter serve --dir reports/studio-report
studio-reporter version
```

Gauge 插件模式仍可用（`plugin` / `--start`），但产品身份是报告工具，不是“只能当插件”。

## 1. 安装插件（可选）


从 [Releases](https://github.com/Linhanmic/studio-reporter/releases) 下载对应平台 zip，例如：

```bash
gauge install studio-reporter --file studio-reporter-0.5.0-linux.x86_64.zip
```

或解压到 Gauge 插件目录：

```bash
# Linux 示例
mkdir -p ~/.gauge/plugins/studio-reporter/0.5.0
unzip studio-reporter-0.5.0-linux.x86_64.zip -d ~/.gauge/plugins/studio-reporter/0.5.0
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

## 6. 下一步阅读

- [DESIGN.md](DESIGN.md) — 架构与决策
- [TODO.md](TODO.md) — 迭代 backlog
- [REPORT_FORMAT.md](REPORT_FORMAT.md) — 磁盘格式契约
- [API.md](API.md) — WebSocket / 事件协议
