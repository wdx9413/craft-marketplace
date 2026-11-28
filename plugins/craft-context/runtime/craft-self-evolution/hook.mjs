import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { selfEvolutionFeedback, selfEvolutionPromptReceipt, selfEvolutionSearch } from "./context-self-evolution-loop.ts";

class FileStore {
  constructor(root) {
    this.file = resolve(root, "self-evolution-store.json");
    mkdirSync(dirname(this.file), { recursive: true });
    this.rows = {};
    try { this.rows = JSON.parse(readFileSync(this.file, "utf8")); } catch { this.rows = {}; }
  }
  key(kind, id) { return `${kind}:${id}`; }
  find(kind, id) { return this.rows[this.key(kind, id)] ?? null; }
  create(kind, id, payload) { return this.save(kind, id, payload); }
  save(kind, id, payload) {
    const row = { ...payload, id };
    this.rows[this.key(kind, id)] = row;
    writeFileSync(this.file, JSON.stringify(this.rows, null, 2));
    return row;
  }
  list(kind, limit = 20, predicate) {
    return Object.entries(this.rows)
      .filter(([key]) => key.startsWith(`${kind}:`))
      .map(([, value]) => value)
      .filter((value) => !predicate || predicate(value))
      .slice(0, limit);
  }
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function scopeFromInput(input) {
  const explicit = text(input.self_evolution_scope_id ?? input.project_scope_id);
  if (explicit) return explicit.replace(/^project:/u, "");
  const cwd = text(input.cwd);
  return cwd ? createHash("sha256").update(cwd).digest("hex").slice(0, 16) : "";
}
function scenarioFromPrompt(prompt) {
  const lower = prompt.toLocaleLowerCase();
  if (/(报错|错误|debug|fix|test|构建|编译|code|bug)/u.test(lower)) return "coding";
  if (/(会议|决议|文档|表格|ppt|流程)/u.test(lower)) return "office";
  if (/(行程|航班|酒店|签证)/u.test(lower)) return "travel";
  if (/(prompt|风格|生成|图片|视频|文章)/u.test(lower)) return "creation";
  if (/(论文|实验|复现|文献)/u.test(lower)) return "research";
  return "general";
}

export async function runHook(store, input) {
  const event = text(input.hook_event_name);
  if (event === "UserPromptSubmit") {
    const prompt = text(input.prompt ?? input.user_prompt);
    const scopeId = scopeFromInput(input);
    const scenarioKey = scenarioFromPrompt(prompt);
    if (!scopeId || !scenarioKey) return {};
    const { additionalContext } = selfEvolutionPromptReceipt(store, { project_scope_id: scopeId, scenario_key: scenarioKey, limit: 3 });
    return additionalContext ? { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } } : {};
  }
  if (event === "Stop") {
    const message = text(input.last_assistant_message);
    const match = message.match(/self_evolution_[a-f0-9]{24}/u);
    if (!match) return {};
    const degraded = /(失败|错误|failed|error|不能|未通过)/iu.test(message);
    try {
      selfEvolutionFeedback(store, { id: match[0], status: degraded ? "degraded" : "confirmed", reason: "hook stop signal" });
    } catch { return {}; }
    return {};
  }
  if (event === "PostToolUse") {
    const response = input.tool_response;
    const failed = response && typeof response === "object" && (response.status === "failed" || response.exit_code === 1 || response.exitCode === 1);
    if (!failed) return {};
    const ids = Array.isArray(input.self_evolution_receipt_ids) ? input.self_evolution_receipt_ids : [];
    for (const id of ids.slice(0, 5)) {
      try { selfEvolutionFeedback(store, { id, status: "degraded", reason: "post tool failure" }); } catch { /* ignore */ }
    }
    return {};
  }
  return {};
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/u).pop() ?? "")) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  let input = {};
  try { input = raw ? JSON.parse(raw) : {}; } catch { input = {}; }
  const store = new FileStore(process.env.CRAFT_SELF_EVOLUTION_DATA_DIR ?? process.env.PLUGIN_DATA ?? ".");
  process.stdout.write(`${JSON.stringify(await runHook(store, input))}\n`);
}
