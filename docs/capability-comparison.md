# Craft 与 Codex / Claude / DSH CLI 能力对比

本文回答四件事：外部 CLI 依赖边界、模型配置、plan/goal 现状、MCP/Skill/插件适配归属。
结论基于当前仓库代码，不把目录或清单当成已实现能力。

## 1. 依赖边界（本轮变更）

Craft 默认**不依赖** `codex` / `claude` / `dsh` CLI 作为执行宿主：

- `ServiceFoundation` 默认只装配 `internal`（Craft 内置）Host；`CodexHostKernel`、
  `ClaudeHostKernel`、`GenericCliHostKernel` 代码保留，但仅在
  `settings.runtimeDependencies.externalCliDrivers=true` 时装配。
- 模型列表默认只来自 `settings.models`（或构造时显式注入的 `modelProviders`）。
  `PROVIDER_CATALOG` 里 `codex-cli` 这种 `host_managed_auth` 项默认不注入；
  仅在 `hostManagedAuthProvider=true` 时恢复。
- 领航员模式仍由 `pilot-policy.ts` 硬约束为 Craft-only。

外部 CLI 的剩余角色只是**插件/清单来源**：`plugin-adapters.ts` 把它们归一化成
Craft 能注册的 MCP server / command / skill 草稿，不写宿主配置、不执行宿主命令。

## 2. 插件适配优先级

`PLUGIN_HOST_PRIORITY = codex > claude > dsh > pi > craft > generic`。
一个插件声明多个 Host 时只解析一次，取第一个可用格式；`pi` 按 `generic` 归一化。
`craft-marketplace/catalog/host-priority.json` 的发布侧顺序与之一致。

## 3. plan / goal 是否还支持

| 入口 | 现状 | 默认可用性 |
|---|---|---|
| `craft run --goal <text>` | Craft 内置独立运行：`taskOpen` → `workSessionPrepare(host:"internal")` → 上下文回执 → governed model loop | **支持**，无需外部 CLI |
| Codex `plan` work mode | 只存在于 `codex-workbench-sessions.ts` / `codex-workbench-adapter.ts`，要求 Codex 会话与 model | 默认**不可用**（外部驱动关闭）；仅显式开关后可用 |
| DSH `work_mode` | `dsh-workbench-runs.ts` 明确拒绝非 `default` | 不支持 plan |
| Workbench 领航员 | 只说目标，Craft 内部拆解/排队/复查 | **支持**，Craft-only |

结论：用户侧「goal 驱动」完整保留；依赖 Codex CLI 的 plan 模式随默认去依赖而关闭，
但不是删除。若需要 Craft 原生 plan 模式，应作为独立能力提案，不复用 Codex 会话协议。

## 4. MCP 工具 / Skill 加载归属

这些能力**不在 `craft-capability`**，而在 `craft` 内核（薄内核的控制面）：

| 能力 | 实现 | 说明 |
|---|---|---|
| MCP 注册表 | `core/mcp-registry.ts` | source/server/health/revoke/sync，只读登记与有界同步 |
| MCP 工具面 | `core/mcp/tool-catalog.ts`、`core/mcp-server.ts` | 工具描述与 stdio 服务 |
| Skill 资产 | `craft-service.ts` 的 `studio_skill` | 上传、版本、发布/回滚、只读列表 |
| 插件发现 | `core/plugin-discovery.ts` | 本地目录发现，写 `plugin` 草稿，不执行 |
| 插件格式适配 | `core/plugin-adapters.ts` | claude/codex/dsh/craft/generic → 统一 adapter/skill 草稿 |
| 插件页面 | `core/plugin-workbench.ts`、Workbench `plugins/skills/connectors` 页 | 声明式页面与按 workspace 开关 |

`craft-capability` 只放可独立发布的子能力（Knowledge/Memory/Experience/Codebase/
Datasec/FileDirDesc）；`craft-common` 放公共包；`craft-eval` 独立评测。
把 MCP/Skill 加载搬进 capability 会形成「内核控制面依赖子能力」的反向依赖。

## 5. 与 Codex / Claude / DSH CLI 的差距

| 维度 | Codex / Claude / DSH | Craft 现状 | 判断 |
|---|---|---|---|
| 模型登录态复用 | CLI 自带 OAuth/配置 | 默认不用，需用户配 API 模型给 Craft | 有意边界：统一配模型 |
| 原生 plan mode | Codex 有、Claude 类 plan、DSH 无 | 仅 Codex 适配层有，默认关 | 缺 Craft 原生 plan |
| 会话续接 | 各 CLI 自有 session | Craft 有 Task/Run/WorkSession/HostRun 回执 | 已覆盖，格式不同 |
| 工具/MCP 市场 | 各宿主插件市场 | Craft 有 plugin-adapters + marketplace 目录 | 覆盖归一化，缺真实一键安装 |
| Skill 发现 | 各宿主扫描 skills 目录 | Craft 有 studio_skill + 插件草稿 | 覆盖，缺跨 Host 实时同步 |
| 权限/审批 | CLI 沙箱/权限模式 | Craft 有 Approval/ExecutionPolicy/Receipt/Trace | 更细，但需真实 Host 效果证据 |
| 桌面控制 | computer-use / agent-desktop | 已有 WindowsDesktop* 内核，但高风险不默认装 | 有能力，未作为默认产品 |
| 远程消息 | 各 CLI 无统一 | Craft 有 webhook + drop/GitHub 拉取 + 0-Token inbox | 已覆盖 pull-only |
| 定时/自动化 | 各 CLI 依赖外部调度 | Craft 有 maintenance worker + intervalMs | 已覆盖本地定时 |
| 自进化 | 各 CLI 基本无 | Craft 有 Experience/Canary/Eval 治理链 | 控制面有，业务效果待证据 |

## 6. 非目标

- 不删除原生驱动代码，避免破坏既有回归；只改默认装配。
- 不自动把外部 CLI 登录态转成 Craft 模型凭据。
- 不默认安装桌面控制/远程执行/外发消息插件。
- 不声称 plan mode 在默认配置下可用，也不把合成测试当成真实 Host 效果证明。

## 7. 图标体系（Workbench 侧）

Workbench 的图标重设计遵循「不用字母、纯 SVG 线性、一个语义一个图标」：

- 左侧图标栏顶部的大写 C 形圆弧标记已删除，产品名只保留在原生窗口标题 / `<title>`；
- 设置图标从双滑块改为通用齿轮，`sliders` 仍供「执行配置」使用；
- `craft-logo.svg` 从内嵌 PNG 折纸菱形改为纯 SVG「有界回路」符号（不闭合圆角菱形 +
  Knowledge/Memory/Experience 三节点），可跟随主题色；
- 完整规范与语义映射见 `craft-workbench/docs/icon-system.md`（该仓库的目录迁移
  由用户单独提交，本仓库只归档设计决策）。
