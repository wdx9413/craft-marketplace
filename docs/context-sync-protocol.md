# 外部知识库 / 云盘同步协议

## 用户的问题

「支持 Obsidian 这种，是不是相当于在他的知识下面的 `craft_data/` 里放 knowledge /
memory / experience？本地肯定要有，只是备份到远端、经常更新。腾讯/阿里/百度/云盘
这么多都要支持很难，是不是得有协议？」

结论：**是**。本地永远是权威，远端只是 Markdown 镜像；不写各厂商 SDK，用一个最小
协议覆盖「目录型 / WebDAV / 通用 HTTP 对象」三类传输。

## 边界

- `~/.craft_data` 本地库是**唯一权威**：Knowledge / Memory / Experience 的裁决、
  版本、Evidence 都只在本地。远端不参与晋级、不反向覆盖本地状态。
- 远端目录固定为 `<remoteRoot>/knowledge|memory|experience/*.md`，正是用户描述的
  「在他的知识下面的 craft_data/ 下」；文件是带 front matter 的普通 Markdown，
  Obsidian / Dataview 可直接读。
- 同步是**单向备份**（local → remote）+ 按 `intervalMs` 定时；不做双向合并，
  冲突策略只有 `local_wins` / `remote_wins` / `manual`。
- 凭据只从 `tokenEnv` 指定的环境变量读取，不写 `settings.json`、不回显。

## 为什么用协议而不是逐家适配

腾讯文档 / 阿里云盘 / 百度网盘 / 各类对象存储的差异主要在「认证 + 目录 API」，
不在 Craft 的知识模型。把它们压成三类传输即可：

| protocol | 覆盖 | endpoint | 认证 |
|---|---|---|---|
| `local_dir` | Obsidian vault、云盘同步文件夹、SMB/挂载目录 | 绝对路径 | 不需要（OS 权限） |
| `webdav` | 自建/企业 WebDAV、部分网盘的 WebDAV 网关 | HTTPS URL | `tokenEnv` Bearer |
| `http_object` | 对象存储 / 自建兼容网关 / 厂商代理 | HTTPS URL | `tokenEnv` Bearer |
| `custom` | 需要厂商 SDK 时由外部 adapter 实现 | 自定义 | 自定义 |

厂商专有部分放在**部署侧的兼容网关**（把腾讯/阿里/百度的上传/列举翻译成
`GET index.json` + `PUT <key>`），Craft 内核不依赖任何厂商 SDK。这也避免了每加一家
就改一次内核、每改一次就要重新发版。

## 配置示例

```json
{
  "contextSync": {
    "enabled": true,
    "protocol": "local_dir",
    "endpoint": "D:/Obsidian/MyVault",
    "remoteRoot": "craft_data",
    "tokenEnv": "CRAFT_CONTEXT_SYNC_TOKEN",
    "intervalMs": 300000,
    "conflict": "local_wins",
    "kinds": []
  }
}
```

`kinds: []` 表示三类全同步。`enabled=true` 后，`craft worker run` 每个 tick 按
`intervalMs` 调用一次 `contextSyncRun()`；也可显式调用做手动备份。

## 与现有 `contextStorage` 的关系

`workbench.contextStorage`（`context-mirror.ts`）是**即时写穿**：每次本地写入同步
导出一条 Markdown 到指定 vault，已有实现。`contextSync` 是**周期性全量镜像 +
远端协议层**：两者可同时开，也可以只开一个。前者保证「刚写就有」，后者保证
「远端经常更新且可跨机器恢复」。

## 未做的事（诚实边界）

- 没有真实腾讯/阿里/百度/云盘账号集成，也没有真实联网测试；`webdav` /
  `http_object` 的 `PUT`/`GET` 契约有注入 `fetch` 的夹具测试，真实可用性取决于
  部署侧兼容网关。
- 不做远端 → 本地的自动导入；恢复是显式动作，避免把外部编辑悄悄变成权威事实。
- 不加密、不去重压缩、不做增量 diff 传输：第一版是内容摘要比对后的整文件覆盖，
  已经能避免无变化重传。
