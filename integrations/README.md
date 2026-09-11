# GaugeStudio ↔ studio-reporter 同步

本目录保存与桌面端 [GaugeStudio](https://github.com/Linhanmic/GaugeStudio) 的联调产物。

## 契约（0.4.x / Studio 0.1.1+）

| 角色 | 行为 |
|------|------|
| studio-reporter | 插件启动后在 `127.0.0.1:0` **监听**，stdout 打印 `studio-reporter websocket: ws://127.0.0.1:<port>` |
| GaugeStudio | **解析**该行并以 WsClient **主动连接**；消费 `ReportSnapshot` / `ReportGenerated` |
| `GAUGE_STUDIO_WS` | 可选：插件 outbound，或 Studio「兼容模式」注入（旧插件） |

## 应用 GaugeStudio 补丁

Cloud Agent 当前对 `Linhanmic/GaugeStudio` **无推送权限**（403）。补丁已提交在本仓库：

```bash
git clone https://github.com/Linhanmic/GaugeStudio.git
cd GaugeStudio
git checkout -b cursor/studio-reporter-ws-sync-a6c3
git am ../studio-reporter/integrations/gaugestudio-0.1.1-ws-sync.patch
# 或：git apply ../studio-reporter/integrations/gaugestudio-0.1.1-ws-sync.patch && git add -A && git commit
npm test
git push -u origin cursor/studio-reporter-ws-sync-a6c3
```

本地已实现内容摘要：

- `electron/services/ws-client.js` + `run-manager` discover 模式
- `ReportSnapshot` / `ReportGenerated` +「打开报告」
- 设置：兼容模式 `legacyInjectStudioWs`
- `TODO.md` / DESIGN / README 同步；`npm test` 覆盖 URL 解析

## 授权建议

将 `Linhanmic/GaugeStudio` 加入同一 Cloud Agent 环境（或授予 cursor bot 写权限）后，可直接在该仓库开 PR 持续双仓迭代。
