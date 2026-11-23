# craft-context 与 Codex 原生能力的双向集成

本文说明 craft-context 作为 Codex 插件如何与 Codex 原生能力双向集成，而非作为独立侧边工具存在。

## 集成入口（Codex 侧）

| Codex 能力 | craft-context 集成方式 | 对应产物 |
 |---|---|---|
 | 文件树 | 文件编辑/写入事件通过 `PostToolUse` Hook 触发 Craft Context 解析，把变更的文件作为 codebase 索引快照 | `hooks/codex-hooks.json` (`PostToolUse` matcher) |
 | 聊天界面 | 每个用户 prompt 通过 `UserPromptSubmit` Hook 自动 resolve Knowledge/Memory/Experience，把 context receipt 注入上下文 | `hooks/codex-hooks.json` (`UserPromptSubmit`) |
 | 命令面板 | Codex 原生命令可调用 craft-context MCP 工具面（`craft-mcp.cjs`），执行知识检索、记忆写入、经验 Procedure 调用 | `.codex-plugin/plugin.json` (`mcpServers`) |
 | 模型选择 | 插件不绑定特定模型，由 Codex 模型路由决定；craft-context 只消费上下文 receipt，不替换模型 | `craft-codex-hook.cjs` (`--member context`) |

## 双向数据流

1. **Codex → craft-context**：用户 prompt、工具调用信号、验证结果、终态 observation 经 Hook 送入 Craft Context，生成 context receipt。
2. **craft-context → Codex**：context receipt、capture 摘要、Mod context additions 返回给模型，作为下一轮推理的受限上下文；Experience 路由的 Procedure 可通过 MCP 工具面在 Codex 会话中实际调用。

## 什么不是双向集成

- craft-context **不**在 Codex 中启动第二个 Codex CLI；
- craft-context **不**自动修改 Codex 配置、权限策略、UI 或 Host 配置；
- craft-context **不**把模型生成的 adapter/procedure/mod 直接发布为可信资产（需经 Shadow/Held-out/Signoff/Canary 门禁）。

## 权限边界

所有集成动作受 `craft-capability/capability/craft-context/permission-boundary.ts` 约束：读写限于工作区与 `.craft_data/`，不写远端、不持久化凭据、Codebase 为只读、默认不授予执行权。
