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
- Craft version：`0.20.4`

发布前应从源码仓库运行打包与 MCP smoke 检查；不要在本仓库手工修改 bundle。

安装 `craft-context` 即可通过统一入口使用四层组件；Host 不需要再安装独立子组件插件。

## 插件聚合与 Host 优先级

本仓库同时是插件聚合市场：把 Craft 自有插件与业界常见插件列到目录里，由用户自行安装；Craft 内核不实现这些外部插件，也不默认执行安装命令。

- `catalog/host-priority.json` 定义固定解析顺序：`codex` → `claude` → `dsh` → `pi`。一个插件若同时支持多种 Host，按第一个可用清单解析一次，避免重复注册 Hook/MCP。
- `catalog/recommended-plugins.json` 列出推荐插件：`craft-context`、`craft-datasec` 为默认安装；`craft-file-dir-desc` 等为可选源码能力；业界插件包括 computer-use、agent-desktop、github、context7、playwright、linear、notion、slack、sentry 等。
- `scripts/resolve-plugin-host.mjs` 提供只读解析与推荐目录投影；`node --test tests/resolve-plugin-host.test.mjs` 验证优先级与单清单解析。
- 支持用户自定义导入 codex/claude/dsh/pi 清单，仍按上述顺序解析；导入的插件不会自动获得执行权。

## 默认自动安装与禁用

Craft 内核启动时读取 `~/.craft_data/settings.json` 的 `capabilities`：

```json
{
  "capabilities": {
    "autoInstall": true,
    "defaults": ["craft-context", "craft-datasec"],
    "installed": ["craft-context", "craft-datasec"],
    "disabled": []
  }
}
```

配置文件里既未安装、也未禁用的默认能力会在启动时自动登记为已安装（只写生命周期记录，不授予执行权），并把结果写回 `installed`。用户禁用/卸载后，能力名写入 `disabled`，自动安装不会再次启用它。

```text
craft capability list
craft capability install <id>
craft capability disable <id>
craft capability enable <id>
craft capability uninstall <id>
```

默认能力清单由内核源码管理，后续可增减；本发布仓只发布 `craft-context`、`craft-datasec` 两个插件包。

## 领航员模式边界

领航员（Workbench `pilot` 模式）**只允许使用 Craft 内置执行器**，不调用 Codex CLI、
Claude CLI、DSH 或其它外部 Agent CLI。`/api/pilot/*` 与领航员派发路由会在进入内核前
把执行器收敛为 `craft`；显式传入外部 CLI 名称返回稳定错误 `PILOT_CRAFT_ONLY`。
其它模式（控制台/工作台/执行配置）仍可管理这些 Host，但领航员不会把任务交给它们。

Craft 默认也不把 Codex / Claude / DSH CLI 当作执行宿主：统一由用户配置模型给
Craft 内置 runtime 使用。原生驱动仅在 `settings.runtimeDependencies.externalCliDrivers`
显式开启时装配；外部 CLI 默认只作为插件清单来源被归一化，不执行、不写宿主配置。
插件来源优先级 `codex > claude > dsh > pi > craft > generic`，多宿主插件只解析一次。

能力对比、plan/goal 现状、MCP/Skill 归属见
[capability-comparison.md](docs/capability-comparison.md)：`craft run --goal` 与领航员
仍支持；依赖 Codex CLI 的 plan 模式随默认去依赖而关闭；MCP 工具、Skill 资产与
插件适配都在 `craft` 内核控制面，不在 `craft-capability`。

## 推荐插件分层

`catalog/recommended-plugins.json` 按风险分层，目录项只是推荐引用，不是随包内置：

- `recommended`：通用只读/本地插件，建议安装（context7、github、playwright/agent-browser、
  playwright-cli、chrome-devtools、serena、lsp、code-review、security-review、
  frontend-design、hookify、skill-creator、sentry），以及 `cli_tools`（gh/rg/fd/jq/git）。
- `credentialed_optional`：需要 token 或可写外部服务（notion、slack、linear、vercel、
  cloudflare、supabase、stripe），默认不装。
- `high_risk_not_default`：computer-use、agent-desktop、browser-use、remote-control，
  涉及桌面控制/远程执行/外发消息，永不默认安装，需用户显式授权。

判断依据：只读或本地、不开生产写、不自动发消息、清单里不含凭据的才可以进入默认推荐。

## 远程消息与定时拉取

Craft 已内置「拉取式」远程消息控制：webhook 入口、本地/挂载云目录轮询、
GitHub 仓库 issue/PR 只读轮询、0-Token 收件箱与脱敏门禁。配置在
`~/.craft_data/settings.json` 的 `messageSources`：

```json
{
  "messageSources": {
    "enabled": false,
    "intervalMs": 60000,
    "dropDirs": [],
    "githubRepos": [],
    "githubApiBaseUrl": "https://api.github.com",
    "githubTokenEnv": "GITHUB_TOKEN",
    "githubState": "issues"
  }
}
```

- `enabled=true` 后，`craft worker run` 在每个维护 tick 按 `intervalMs` 拉取一次。
- GitHub 源只发 GET、只读 open issue/PR，token 仅从环境变量读取，不写入 settings 或消息库。
- 跨重启用 `message_seen` 去重；单源失败按源上报，不影响其它源。
- 不做外发消息、不写远端对象；需要双向控制时须显式安装并授权外部插件。
