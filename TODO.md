# Studio Reporter — TODO

状态：**活跃迭代**（目标：完善的工程化报告工具）。  
更新规则：完成一项立即勾选并记录决策；重大决策对照外部实践（见 DESIGN「决策原则」）。

## 当前版本

- 插件：**0.4.7**（本 PR）
- 主干能力：静态终态报告 + WS 实时 viewer + 归档/管理 + `.uhilreport` 再生

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

- [ ] 评估静态报告是否引入极轻量客户端交互（不过度 SPA 化）
- [ ] 导出 PDF / 单文件 HTML（内联截图）选项
- [x] 历史对比（两次归档的 verdict / 时长 / 计数 diff；`manage.html` 勾选 + `CompareHistoryRuns`）
- [ ] 多 suite / 并行执行下的 hub 写入竞态审计

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

## 下一任务（选定）

**PDF / 单文件 HTML 导出评估**（P4），或多 suite hub 写入竞态审计。
