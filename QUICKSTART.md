# Studio Reporter — Quick Start

面向首次接入与本地验证。对应插件版本 **0.4.7**。

## 1. 安装插件

从 [Releases](https://github.com/Linhanmic/studio-reporter/releases) 下载对应平台 zip，例如：

```bash
gauge install studio-reporter --file studio-reporter-0.4.7-linux.x86_64.zip
```

或解压到 Gauge 插件目录：

```bash
# Linux 示例
mkdir -p ~/.gauge/plugins/studio-reporter/0.4.7
unzip studio-reporter-0.4.7-linux.x86_64.zip -d ~/.gauge/plugins/studio-reporter/0.4.7
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

# 历史管理（删除归档需要 HTTP）
studio-reporter --serve --dir reports/studio-report --addr 127.0.0.1:8765
# 浏览器打开 http://127.0.0.1:8765/manage.html
```

静态报告工具栏可按 **规格书 / 场景** 过滤通过、失败、跳过。

## 4. 从 `.uhilreport` 再生 HTML

```bash
studio-reporter \
  --input reports/studio-report/demo-project-2026-08-28_10.30.00.uhilreport \
  --out /tmp/studio-report
xdg-open /tmp/studio-report/index.html
```

## 5. 本地开发

```bash
git clone https://github.com/Linhanmic/studio-reporter.git
cd studio-reporter

# 测试 / 编译（推荐显式 toolchain）
GOTOOLCHAIN=go1.27.0 go test ./...
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
| `GAUGE_STUDIO_WS` | 额外再推一份事件的 WebSocket URL（可选） |

## 6. 下一步阅读

- [DESIGN.md](DESIGN.md) — 架构与决策
- [TODO.md](TODO.md) — 迭代 backlog
- [REPORT_FORMAT.md](REPORT_FORMAT.md) — 磁盘格式契约
- [API.md](API.md) — WebSocket / 事件协议
