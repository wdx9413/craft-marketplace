import { createHash } from "node:crypto";
import { FileStore } from "./file-store.mjs";
import { selfEvolutionFeedback, selfEvolutionPromptReceipt } from "./context-self-evolution-loop.ts";

const PENDING_KIND = "self_evolution_pending";

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function pendingId(input) {
  const sessionId = text(input.session_id);
  if (!sessionId) return "";
  return `${sessionId}:${text(input.turn_id) || "latest"}`;
}
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
    const { additionalContext, result } = selfEvolutionPromptReceipt(store, { project_scope_id: scopeId, scenario_key: scenarioKey, limit: 3 });
    if (additionalContext) {
      const ids = result.receipt.entries.map((entry) => entry.id);
      const key = pendingId(input);
      if (key && ids.length) store.save(PENDING_KIND, key, { entry_ids: ids, scope: scopeId, scenario_key: scenarioKey });
    }
    return additionalContext ? { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } } : {};
  }
  if (event === "Stop") {
    const message = text(input.last_assistant_message);
    const pending = store.find(PENDING_KIND, pendingId(input));
    const ids = Array.isArray(pending?.entry_ids) ? pending.entry_ids : (message.match(/self_evolution_[a-f0-9]{24}/u) ?? []).slice(0, 1);
    if (!ids.length) return {};
    const degraded = /(失败|错误|failed|error|不能|未通过)/iu.test(message);
    for (const id of ids) {
      try { selfEvolutionFeedback(store, { id, status: degraded ? "degraded" : "confirmed", reason: "hook stop signal" }); } catch { /* ignore */ }
    }
    return {};
  }
  if (event === "PostToolUse") {
    const response = input.tool_response;
    const failed = response && typeof response === "object" && (response.status === "failed" || response.exit_code === 1 || response.exitCode === 1);
    if (!failed) return {};
    const pending = store.find(PENDING_KIND, pendingId(input));
    const ids = Array.isArray(pending?.entry_ids) ? pending.entry_ids : (Array.isArray(input.self_evolution_receipt_ids) ? input.self_evolution_receipt_ids : []);
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
