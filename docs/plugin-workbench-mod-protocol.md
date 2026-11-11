# 插件协议：Workbench 贡献与 Mod 声明

## 结论

- **支持**。插件可以在 manifest 里声明 Workbench 页面、上下文动作、高级工具、主题；
  Craft 安装时校验、按 workspace 启用后渲染。
- **适配层补齐**：Claude（`ui` / `panels`）、Codex（`interface` / `extensions.openai.ui`）、
  DSH 的 UI 扩展位会被归一化成同一个 `workbench` 块，和 Craft 原生写法走同一套校验。
- **Mod 也支持**：插件用 `mods` 声明认知约束，但**只能落成 `draft`**，必须经
  审批/影子测试才可能 `active`。
- 自进化产生的 Mod 与插件声明的 Mod 共用 approve / overlay 链路，但来源分开记录：
  自进化 `self_evolved=true`（强制影子测试），插件 `plugin_id=<id>`（默认不进化）。

## Workbench 贡献

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "hosts": ["craft"],
  "workbench": {
    "schemaVersion": 1,
    "pages": [{ "id": "home", "title": "Home", "kind": "declarative", "schema": "./home.json" }],
    "contextActions": [{ "id": "recall", "title": "召回", "target": "memory", "contexts": ["project"] }],
    "advancedTools": [{ "id": "search", "title": "搜索", "tool": "craft_memory_search" }],
    "themes": [{ "id": "warm", "title": "Warm", "tokens": { "--accent": "#c8a15a" } }]
  }
}
```

约束（由 `plugin-workbench.ts` 强制）：

- 页面只能声明 `declarative` / `sandboxed`；`schema` 必须是插件目录内的相对路径。
- 页面组件白名单固定，不允许任意 HTML/CSS/JS；动作只能调用只读产品 API 前缀。
- 主题只能改 `--accent` / `--line`，不能改文字/权限色。

### 宿主扩展位适配

| 宿主 | 扩展位 | 归一化结果 |
|---|---|---|
| Craft / DSH | `workbench` | 直接使用 |
| Claude | `ui` / `panels` | 提取为标准 `workbench` 块 |
| Codex | `interface` / `extensions.openai.ui` | 提取为标准 `workbench` 块 |

只有声明 `schemaVersion: 1` 的块会被当作 Workbench 协议；宿主其它 UI 配置不会被误吃。
插件记录里会写 `workbench_protocol` 与 `workbench_source_format`，便于排查来源。

## Mod 声明

```json
{
  "mods": [{
    "id": "style",
    "name": "简洁优先",
    "body": "优先给出最小可验证的结论。",
    "applies_to": "worker",
    "scope_kind": "global"
  }]
}
```

- 限制：最多 16 条、正文 8 000 字符以内、`id` 唯一；
  `applies_to` 只能是 `worker|reviewer|all`，`scope_kind` 只能是 `global|project|task`。
- 安装后状态固定为 `draft`、`enabled=false`，并记录 `plugin_id`。
- 激活必须走 `craft_mod_approve`（带操作者），且仍受
  `FORBIDDEN_MOD_PHRASES`（忽略安全/绕过审批/外泄密钥）拦截。
- 插件 Mod **不会**被标记成 `self_evolved`，因此不进入自进化影子测试门槛；
  这是有意区分：插件提供的是作者声明的约束，不是系统学出来的规则。

## 自进化与 Mod 的关系

```text
观察 → 失败归因 → proposeFromAttribution (self_evolved=true, draft)
     → shadow regression (固定不变量 + 注入可观测性, 0 token)
     → mod_approve (operator)
     → active → modSystemOverlay 注入 Worker/Reviewer
```

插件 Mod 只走「draft → approve → active」，不进入 shadow 回归，也不会被自动改写。
自进化不会去「进化插件本身」：插件是不可变包，可改进的是 Mod 文本与 Workflow。

## 未做

- 不执行插件代码：manifest-only 插件只登记 adapter / skill / page / mod 声明。
- 不做跨 Host 的实时推送；宿主清单变化通过显式 `resync` 增量收敛（幂等，manifest
  变更需 `allow_manifest_change`）。

## 已实现（本轮补齐）

- **sandboxed 页面运行时**：插件目录内的静态 `.html`，服务端读取时做路径穿越与
  512 KiB 大小校验，并注入 CSP（`default-src 'none'`、`connect-src 'none'`）；
  前端在 `sandbox="allow-scripts"`（无 `allow-same-origin`）的 iframe 中渲染。
- **hooks 不再连坐**：声明了 `hooks` 的插件只是本导入路径不注册 Hook，页面 / Mod /
  技能仍正常导入；`runtime_status` 只在完全没有可映射贡献时才是 `unsupported`。
- **resync**：`POST /api/workbench/plugins/:id/resync` 重新归一化宿主清单，重复执行
  不重复建 Mod；磁盘 `plugin.json` 与安装快照不同需显式确认。
- **卸载清理**：卸载插件会删除它创建的 `draft` Mod；已 `active` 的 Mod 保留并标记
  `plugin_id`，由操作者显式 revoke，避免静默改变已注入的 Worker 上下文。
- **UI**：插件列表提供「重新同步」；沙箱页面可打开；Mod 列表显示「来自插件 · <id>」。
