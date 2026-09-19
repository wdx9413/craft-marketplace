# Craft Marketplace

Craft 是一个拥有知识、记忆和能力资产，并能通过验证持续进化的通用Agent 。

它让 AI 不只完成眼前一次对话，还能把项目知识、用户偏好、重要决定、执行证据和已验证的做事方法沉淀下来；下次遇到相似任务时，AI 能找到合适的 Skill、MCP 或 Workflow，并在验证后复用更可靠的方法。

## 你能用 Craft 得到什么

- **知识库与长期记忆**：接入 README、项目文档、Obsidian、Serena、Wiki 等来源；记录项目背景、偏好、决定、未完成事项和已验证经验。新会话按需读取，不必反复解释上下文。
- **Skill / MCP 自动发现**：提供独立的 `craft-capability` 插件，扫描本地或外接的 Skill、MCP、Workflow、Adapter；识别重复、失效和高风险能力，并根据当前任务推荐最合适、最少的一组能力，而不是让模型面对一百多个工具盲选。
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

将本仓库作为 Git Marketplace 添加到 Host。市场清单位于 `.agents/plugins/marketplace.json`。

### Claude Code

本仓库同时提供 Claude Code Marketplace，清单位于 `.claude-plugin/marketplace.json`。在 Claude Code 中添加市场后，可按需安装三个独立组件：

```text
/plugin marketplace add https://github.com/wdx9413/craft-marketplace.git
/plugin install craft-knowledge@craft-marketplace
/plugin install craft-memory@craft-marketplace
/plugin install craft-experience@craft-marketplace
```

三个组件各自包含对应 Skill 和 MCP Server，安装后会以插件名命名空间暴露；它们与 Codex 发布包共用同一版本和本地 Craft 数据协议。只需要完整 Craft 时，仍应使用源码仓库中的主插件；不要同时安装主插件与同域子插件，避免重复工具面。

`craft` 是默认的**完整产品**，不是只有编排核心：它已包含知识库、记忆、能力发现、Skill 质量评测和 Workflow 演进，且这些能力共用一份 Craft 数据。为了避免把数百个工具定义同时塞给模型，它以固定的通用 MCP 动词按需访问底层能力；安装 `craft` 即可使用全套能力，**不需要再安装子插件**。首次需要知识或记忆时，可调用 `craft_knowledge_bootstrap_install` 幂等登记 Craft 内置 Evidence Wiki 与 Serena 描述符；它不会自动扫描外部文件或保存聊天。

同时，市场也提供下列可单独安装的子插件。它们是同一运行时的单域投影，适合只想给现有 Agent 增强某一项能力的用户；通常应与 `craft` 二选一，避免重复工具面：

- `craft`：完整 Craft 运行时；默认精简的 syscall MCP 面，以及 full/HTTP bundle。
- `craft-knowledge`、`craft-memory`：仅知识或记忆与受控上下文；两者都可安全登记共享的内置知识来源。
- `craft-capability`：可独立安装的 Skill、MCP、Workflow 自动发现、推荐与健康管理组件。
- `craft-experience`：从脱敏执行记录生成并验证 Workflow 草案的组件。

每个插件都是自包含的：其 MCP 入口只引用本插件目录内的 `dist/plugin` bundle。

## 发布来源

- Craft 源码仓库：[wdx9413/craft](https://github.com/wdx9413/craft)
- Source revision：`d939165`
- Craft version：`0.12.33`

发布前应从源码仓库运行打包与 MCP smoke 检查；不要在本仓库手工修改 bundle。
