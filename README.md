# Craft Marketplace

Craft 的轻量发布仓库，供 Codex、Claude 和兼容 MCP Host 安装插件。

它只保存可运行发布物：市场清单、插件 manifest、Skill、图标和已打包的 MCP bundle；不包含 Craft 源码、测试、依赖目录或主仓库 Git 历史。

## 安装

将本仓库作为 Git Marketplace 添加到 Host。市场清单位于 `.agents/plugins/marketplace.json`，其中提供：

- `craft`：默认精简 MCP 面，以及 full/HTTP bundle。
- `craft-knowledge`、`craft-memory`：知识和记忆组件。
- `craft-capability`：Skill/MCP 等能力资产发现组件。
- `craft-skill-quality`：评测与质量组件。
- `craft-workflow-evolution`：受控 Workflow 演进组件。

每个插件都是自包含的：其 MCP 入口只引用本插件目录内的 `dist/plugin` bundle。

## 发布来源

- Craft 源码仓库：[wdx9413/craft](https://github.com/wdx9413/craft)
- Source revision：`34ebe69`
- Craft version：`0.12.26`

发布前应从源码仓库运行打包与 MCP smoke 检查；不要在本仓库手工修改 bundle。
