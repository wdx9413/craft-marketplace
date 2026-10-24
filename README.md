# Craft Marketplace

Craft 是一个拥有知识、记忆和能力资产，并能通过验证持续进化的通用Agent 。

它让 AI 不只完成眼前一次对话，还能把项目知识、用户偏好、重要决定、执行证据和已验证的做事方法沉淀下来；下次遇到相似任务时，AI 能在受控边界内复用更可靠的方法。

## 你能用 Craft 得到什么

- **知识库与长期记忆**：接入 README、项目文档、Obsidian、Serena、Wiki 等来源；记录项目背景、偏好、决定、未完成事项和已验证经验。新会话按需读取，不必反复解释上下文。
- **可验证的工作流**：把“任务目标 → 执行 → 真实结果验收”留下证据。模型说完成不算完成，测试、文件状态、外部回执或人工确认才算。
- **受控自进化**：从多次脱敏执行记录中提炼候选 Workflow；候选先经过评测、灰度和回滚保护，证明有效后才会进入可复用能力库，不会直接改坏已有方法。

```text
知识 / 记忆 / 执行记录
        ↓
Craft 发现合适能力并组织执行
        ↓
验收结果、保存证据、沉淀经验
        ↓
评测通过后，成为下一次可复用的 Workflow
```

Craft 可以作为 Codex、Claude 或 IDE 的外挂控制台使用；它不替代模型本身，而是让模型的知识、记忆、工具选择和自我改进变得可管理、可验证、可回滚。桌面端 Craft Studio 由源码仓库单独打包发布：它复用同一套本地运行时和数据目录，提供紧凑的任务、上下文和模型配置工作台；桌面壳不进入 MCP 插件包。

## 本仓库

这是 Craft 的轻量发布仓库，供 Codex、Claude 和兼容 MCP Host 安装插件。它只保存可运行发布物：市场清单、插件 manifest、Skill、图标和已打包的 MCP bundle；不包含 Craft 源码、测试、依赖目录或主仓库 Git 历史。

## 安装

将本仓库作为 Git Marketplace 添加到 Host。Codex 和 Claude Code 提供 `craft-context`，以及独立的本地文本脱敏插件 `craft-datasec`。

### Claude Code

本仓库同时提供 Claude Code Marketplace，清单位于 `.claude-plugin/marketplace.json`。在 Claude Code 中添加市场后，通常只需安装默认聚合入口：

```text
/plugin marketplace add https://github.com/wdx9413/craft-marketplace.git
/plugin install craft-context@craft-marketplace
/plugin install craft-datasec@craft-marketplace
```

`craft-datasec` 只注册同步脱敏 hook，不依赖 `craft-context`、MCP 或本地模型；说明见 [craft-datasec](plugins/craft-datasec/README.md)。Codex 可用 `codex plugin add craft-datasec@craft-marketplace` 安装。安装后需新建会话确认 hook 已加载。

`craft-context` 是统一完整入口，包含 Codebase、Knowledge、Memory、Experience 四层的完整 MCP 工具面和参考 Skill；Codex/Claude 插件提供一个共享 Hook，在提示阶段形成统一的上下文回执。各能力仍按层实现，插件只打包和发布 `craft-context`。

- `craft-context`：统一上下文预算、来源回执和仓库索引，并提供 Codebase、Knowledge、Memory、Experience 各层的完整工具能力。

分层源码和内部组件继续保留在 Craft 源码仓库中；本发布仓不再分别分发 `craft-codebase`、`craft-knowledge`、`craft-memory` 或 `craft-experience` 插件。

插件自包含：MCP 入口和 Hook 只引用 `craft-context` 目录内的 bundle 与分析器资源。

## 发布来源

- Craft 源码仓库：[wdx9413/craft](https://github.com/wdx9413/craft)
- Source revision/state and working-tree digest：见 `release.json`
- Craft version：`0.12.105`

发布前应从源码仓库运行打包与 MCP smoke 检查；不要在本仓库手工修改 bundle。

安装 `craft-context` 即可通过统一入口使用四层组件；Host 不需要再安装独立子组件插件。
