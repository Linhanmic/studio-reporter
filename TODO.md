# Studio Reporter — TODO

状态：**活跃迭代**（目标：完善的工程化报告工具）。  
更新规则：完成一项立即勾选并记录决策；根据使用反馈重排优先级。

## 当前版本

- 插件：**0.4.7**（本 PR）
- 主干能力：静态终态报告 + WS 实时 viewer + 归档/管理 + `.uhilreport` 再生

## P0 — 工程基建（本轮）

- [x] 对齐文档四件套：`README` / `DESIGN` / `TODO` / `QUICKSTART`
- [x] 修正 README/API 中过时描述（Vue 终态报告、安装版本号 0.3.x）
- [x] 增加 PR CI（`go test` / `go vet`），不仅有 release workflow
- [x] 为 `internal/report` 增加包内单测（静态渲染 / 叶子步骤）
- [x] 无额外内容的通过步骤改为不可折叠叶子行（demo 噪音）

## P1 — 静态报告体验

- [x] 工具栏增加「全部展开 / 全部折叠」（失败过滤后便于扫读）
- [x] 静态报告增加简单搜索（规格书 / 场景名），对齐 viewer 能力的子集
- [x] 失败默认展开路径：失败规格书 / 数据行 / 场景 / 步骤默认 open
- [ ] 打印样式：过滤隐藏块打印时的表现再验收

## P2 — 实时 viewer

- [ ] 运行结束自动提示跳转静态 `index.html`（或内嵌终态视图）
- [ ] `viewer.html` 与根目录 `report.html` 去重，避免双源漂移
- [ ] 根目录 `manage.html` / `report-assets` 与 `internal/report` embed 副本同步策略文档化或脚本化

## P3 — 工程化与质量

- [ ] 增加 `golangci-lint` 配置（README 已提及但仓库无配置）
- [x] Makefile / `make test` / `make build` 统一本地入口
- [ ] 覆盖率门槛或至少在 CI 输出 cover profile 摘要
- [ ] `--input` 再生路径的端到端 smoke（含截图相对路径）

## P4 — 产品演进（可改架构）

- [ ] 评估静态报告是否引入极轻量客户端交互（不过度 SPA 化）
- [ ] 历史对比（两次归档的 verdict / 时长 diff）
- [ ] 导出 PDF / 单文件 HTML（内联截图）选项
- [ ] 多 suite / 并行执行下的 hub 写入竞态审计

## 迭代日志

| 日期 | 项 | 结果 / 决策 |
|------|----|-------------|
| 2026-09-11 | 启动持续完善目标；盘点 v0.4.6 | 缺 DESIGN/TODO/QUICKSTART；README Features 仍写 Vue 终态；无 PR CI；`internal/report` 无包内测试；demo 空步骤折叠偏吵 |
| 2026-09-11 | 文档 + CI + leaf-row + 展开折叠 + 搜索 + Makefile | PR #12 持续迭代；下一优先：golangci 或 viewer 去重 |

## 下一任务（选定）

合并发布后：**golangci-lint 配置**，或 **viewer/report.html 双源去重**。
