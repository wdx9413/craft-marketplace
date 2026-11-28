# craft-context Codex 插件安装说明

## 前提条件

- 已安装 [Codex](https://codex.openai.com/) 且可正常启动。
- Node.js 24+（插件产物为预编译 CJS，运行插件本身不需额外构建；如需从源码重建，请在 `craft-capability/capability/craft-context` 与 `craft-eval` 下运行 `npm run build`）。

## 一键安装（PowerShell，推荐）

在插件包目录 `craft-marketplace/plugins/craft-context/` 下以 PowerShell 运行：

```powershell
.\install.ps1
```

脚本会：
1. 校验 `.codex-plugin/plugin.json` 存在；
2. 将插件包复制到 Codex 插件根目录（默认 `%APPDATA%\Codex\plugins\craft-context`）；
3. 在当前工作区写入 `.craft-codebase.json` 项目级配置模板（若不存在则写入，存在则不覆盖）；
4. 验证安装并提示重启 Codex。

脚本是幂等的，可重复运行。

## 手动安装

1. 将 `craft-marketplace/plugins/craft-context/` 下全部文件复制到 Codex 插件根目录（如 `%APPDATA%\Codex\plugins\craft-context/`）。
2. 确保 `dist/plugin/craft-codex-hook.cjs` 与 `dist/plugin/craft-mcp.cjs` 已随产物一并复制。
3. 在工作区根写入 `.craft-codebase.json`（见本目录下的模板）。
4. 重启 Codex，使 Hook 与 MCP 工具面生效。

## 验证

重启 Codex 后，任意对话中应触发 `UserPromptSubmit` Hook，返回一段受限的 Craft Context receipt；可通过 `craft-eval context-audit` 对 receipt 做确定性审计（见 `craft-eval/examples/context-audit/`）。

自进化闭环工具：`craft_self_evolution_accumulate`、`craft_self_evolution_promote`、`craft_self_evolution_search`、`craft_self_evolution_feedback` 可通过 `craft_context_tools_discover(intent="evolution")` 发现。晋升只接受完整外部 verdict，插件自身不执行 `craft-eval`。安装脚本同时复制 `runtime/craft-self-evolution/` 中的 CLI 源码，供没有重建 dist 的本地安装作为可验证入口。

发布到远端 git 市场时，将本仓库作为 marketplace 源提交并推送；用户通过 `codex plugin marketplace add <git-url>` 或团队既有更新流程获取。更新后需重启 Codex，并在 `/hooks` 重新信任变更过的 hook 定义。若当前 dist 未包含上述工具，CLI runtime 仍可用于本地验收，但 MCP 工具调用需等待主仓 `pnpm run build` 重建 `dist/plugin/craft-mcp.cjs` 后再打包。

## 卸载

删除 Codex 插件根目录下的 `craft-context/` 子目录，并移除工作区中的 `.craft-codebase.json`（如由本插件写入）。

## 权限与数据边界

- 插件为只读 Codebase 索引，写入限于当前工作区与 `.craft_data/` 本地数据根；
 - 不写入凭据、密钥或原始聊天记录；
 - 不向远端写入数据（`local_only`）。
详见 `craft-capability/capability/craft-context/permission-boundary.ts`。
