# Craft Marketplace

Craft 是面向人和 AI 的通用工作运行时。它不替代 Codex、Claude 或 IDE 的模型与终端能力，而是为它们提供任务状态、能力选择、执行边界、验证证据和受控演进。

```text
用户目标 → Craft 选择最小能力与约束 → Host 执行 → 真实状态验收 → 证据与评测 → 可复用 Workflow
```

## Craft 能做什么

- **可靠完成工作**：把目标、输入、权限、执行回执和验收结果串起来；模型声称完成不等于交付完成。
- **按需使用能力**：从 Skill、MCP、Workflow、项目知识中选择最小必要集合，避免把大量工具和上下文全部塞给模型。
- **保留可检查的积累**：管理知识、记忆、证据与 Checkpoint；新会话可按需恢复有效背景，而不是依赖聊天记录。
- **让方法可验证地演进**：真实执行记录只能生成 Workflow 草案；必须经过评测、Signoff 与 Canary，才会成为后续任务可选的已验证 Workflow。

Craft 可以作为 Codex、Claude、IDE 或其他 MCP Host 的运行控制台；未来也可以在同一套 Policy、State、Receipt 和 Eval 之上独立运行。它的核心价值是让模型负责理解和提议，让运行时负责事实、边界、恢复与验证。

## 本仓库

这是 Craft 的轻量发布仓库，供 Codex、Claude 和兼容 MCP Host 安装插件。它只保存可运行发布物：市场清单、插件 manifest、Skill、图标和已打包的 MCP bundle；不包含 Craft 源码、测试、依赖目录或主仓库 Git 历史。

## 安装

将本仓库作为 Git Marketplace 添加到 Host。市场清单位于 `.agents/plugins/marketplace.json`，其中提供：

- `craft`：默认精简 MCP 面，以及 full/HTTP bundle。
- `craft-knowledge`、`craft-memory`：知识、记忆与受控上下文组件。
- `craft-capability`：Skill、MCP、Workflow 等能力资产发现组件。
- `craft-skill-quality`：评测、质量门与验证组件。
- `craft-workflow-evolution`：从脱敏执行记录生成并验证 Workflow 草案的组件。

每个插件都是自包含的：其 MCP 入口只引用本插件目录内的 `dist/plugin` bundle。

## 发布来源

- Craft 源码仓库：[wdx9413/craft](https://github.com/wdx9413/craft)
- Source revision：`34ebe69`
- Craft version：`0.12.26`

发布前应从源码仓库运行打包与 MCP smoke 检查；不要在本仓库手工修改 bundle。
