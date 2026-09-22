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

将本仓库作为 Git Marketplace 添加到 Host。无论 Codex 还是 Claude Code，市场清单均提供 `craft-knowledge`、`craft-memory`、`craft-experience`、`craft-codebase` 四个插件。

### Claude Code

本仓库同时提供 Claude Code Marketplace，清单位于 `.claude-plugin/marketplace.json`。在 Claude Code 中添加市场后，可按需安装三个独立组件：

```text
/plugin marketplace add https://github.com/wdx9413/craft-marketplace.git
/plugin install craft-knowledge@craft-marketplace
/plugin install craft-memory@craft-marketplace
/plugin install craft-experience@craft-marketplace
/plugin install craft-codebase@craft-marketplace
```

三个组件各自包含对应 Skill 和 MCP Server，安装后会以插件名命名空间暴露；它们与 Codex 发布包共用同一版本和本地 Craft 数据协议。

- `craft-knowledge`：受证据约束的知识源、Wiki 与受控上下文解析。
- `craft-memory`：按范围、来源、有效期和证据解析长期记忆。
- `craft-experience`：从脱敏执行记录生成并验证 Workflow 草案。
- `craft-codebase`：显式激活、checkpoint 固定的只读符号、调用方与候选影响分析。

完整 Craft 及其他内部插件仍保留在源码仓库，但不由本发布仓分发。

每个插件都是自包含的：其 MCP 入口只引用本插件目录内的 `dist/plugin` bundle。

## 发布来源

- Craft 源码仓库：[wdx9413/craft](https://github.com/wdx9413/craft)
- Source revision：`c074e85`
- Craft version：`0.12.37`

发布前应从源码仓库运行打包与 MCP smoke 检查；不要在本仓库手工修改 bundle。
