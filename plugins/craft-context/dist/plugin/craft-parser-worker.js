// node_modules/.pnpm/craft-common-store-local@0.21.1/node_modules/craft-common-store-local/dist/store.js
import { backup, DatabaseSync as DatabaseSync4 } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";

// node_modules/.pnpm/craft-common-store-local@0.21.1/node_modules/craft-common-store-local/dist/content-store.js
import { DatabaseSync } from "node:sqlite";

// node_modules/.pnpm/craft-common-store-local@0.21.1/node_modules/craft-common-store-local/dist/record-files.js
var KIND_FIELDS = new Map(Object.entries({
  experience_procedure: ["lifecycle"],
  knowledge_claim: ["document_id", "claim_id"],
  knowledge_document: ["document_id"],
  memory_confirmation: ["memory_id", "memory_version"],
  memory_observation: ["observed_at_ms", "source_session_id"],
  codex_hook_signal: ["turn_id", "observed_at_ms"],
  context_ephemeral_index: ["turn_id"],
  context_resume_snapshot: ["turn_id"],
  trace: ["last_event_at", "started_at"],
  trace_event: ["trace_id", "sequence"],
  trace_feedback: ["trace_id"],
  telemetry_event: ["trace_id"],
  workbench_message_queue: ["link_id", "state", "sequence"],
  workbench_agent_session_link: ["workspace"],
  scope_alias: ["alias_kind", "alias", "alias_digest", "identity_digest", "root_path", "canonical_root_path"],
  project_identity: ["identity_digest", "project_kind", "remote_digest", "local_path_alias", "root_path", "canonical_root_path"],
  event: ["transition_id"]
}));
var PROSE_FIELDS = new Map(Object.entries({
  craft_note: ["text"],
  craft_notes_location: ["description"],
  device: ["device_note", "note", "description"],
  program_memory_candidate: ["statement"],
  task: ["prompt", "description", "goal"],
  evidence: ["claim"],
  knowledge_claim: ["content"],
  knowledge_document: ["content", "body"],
  wiki_page: ["body"],
  memory_candidate: ["content"],
  memory_ledger: ["content"],
  episodic_memory: ["content"],
  semantic_memory: ["content"]
}));

// node_modules/.pnpm/craft-common-store-local@0.21.1/node_modules/craft-common-store-local/dist/trace-shards.js
import { DatabaseSync as DatabaseSync2 } from "node:sqlite";
var TRACE_KINDS = /* @__PURE__ */ new Set(["trace", "trace_event", "trace_feedback", "telemetry_event", "trace_archive"]);
var TRACE_SHARDED_KINDS = /* @__PURE__ */ new Set([...TRACE_KINDS, "codex_hook_turn", "codex_hook_signal", "context_hook_session"]);

// node_modules/.pnpm/craft-common-store-local@0.21.1/node_modules/craft-common-store-local/dist/codebase-shards.js
import { DatabaseSync as DatabaseSync3 } from "node:sqlite";

// node_modules/.pnpm/craft-common-store-local@0.21.1/node_modules/craft-common-store-local/dist/store.js
var contextLockBudget = new AsyncLocalStorage();

// node_modules/.pnpm/craft-common-base@0.20.5/node_modules/craft-common-base/dist/scope-policy.js
var COGNITIVE_SCOPE_KINDS = ["user", "project", "workspace", "task", "session", "team", "organization", "global"];

// node_modules/.pnpm/craft-common-base@0.20.5/node_modules/craft-common-base/dist/validation.js
var SCOPE_KINDS = new Set(COGNITIVE_SCOPE_KINDS);

// core/untrusted-parser.ts
var MAX_CONTENT_BYTES = 1024 * 1024;
function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must not be empty`);
  return value;
}
function requiredObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value;
}
function jsonPointer(root, pointer) {
  if (!pointer.startsWith("/")) throw new Error("JSON selectors must be RFC 6901 pointers beginning with /");
  let value = root;
  for (const encoded of pointer.slice(1).split("/")) {
    const segment = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (["__proto__", "prototype", "constructor"].includes(segment)) throw new Error("Unsafe JSON selector segment");
    if (!value || typeof value !== "object" || !Object.hasOwn(value, segment)) throw new Error(`JSON selector not found: ${pointer}`);
    value = value[segment];
  }
  return value;
}
function textLine(raw, selector) {
  const match = /^line:([1-9][0-9]*)$/u.exec(selector);
  if (!match) throw new Error("Text selectors must use line:N with a one-based line number");
  const line = raw.split(/\r?\n/u)[Number(match[1]) - 1];
  if (line === void 0) throw new Error(`Text selector not found: ${selector}`);
  return line.trim();
}
var SIGNAL_RULES = [
  ["instruction_override", /(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions?|prompts?)/iu],
  ["prompt_boundary_impersonation", /(?:system|developer)\s+(?:prompt|message|instruction)/iu],
  ["secret_exfiltration_request", /(?:reveal|send|print|exfiltrate)\s+(?:the\s+)?(?:secret|token|password|api[_ -]?key)/iu],
  ["tool_execution_request", /(?:call|execute|run)\s+(?:the\s+)?(?:tool|command|shell)/iu],
  ["instruction_override_zh", /忽略.{0,12}(?:之前|以上|原有).{0,8}指令/u],
  ["secret_exfiltration_request_zh", /(?:泄露|发送|输出).{0,12}(?:密钥|密码|令牌)/u]
];
function instructionSignals(raw) {
  return SIGNAL_RULES.filter(([, rule]) => rule.test(raw)).map(([name]) => name);
}
function extractFields(raw, format2, selectors2) {
  let parsed = raw;
  if (format2 === "json") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("raw_content is not valid JSON");
    }
  }
  const structuredData = {};
  for (const [field, selectorValue] of Object.entries(selectors2)) {
    if (!/^[a-zA-Z0-9_-]+$/u.test(field)) throw new Error("selector field names may contain only letters, numbers, _ or -");
    const selector = requiredText(selectorValue, `selectors.${field}`).trim();
    structuredData[field] = format2 === "json" ? jsonPointer(parsed, selector) : textLine(raw, selector);
  }
  return structuredData;
}
function analyzeUntrustedContent(raw, requestedFormat, requestedSelectors) {
  const parserFormat = format(requestedFormat);
  const parserSelectors = selectors(requestedSelectors);
  return {
    format: parserFormat,
    selectors: parserSelectors,
    structured_data: extractFields(raw, parserFormat, parserSelectors),
    detected_instructions: instructionSignals(raw)
  };
}
function format(value) {
  const result = requiredText(value, "format").trim();
  if (!(/* @__PURE__ */ new Set(["json", "text"])).has(result)) throw new Error("format must be json or text");
  return result;
}
function selectors(value) {
  const result = requiredObject(value, "selectors");
  if (!Object.keys(result).length) throw new Error("selectors must not be empty");
  return result;
}

// bin/craft-parser-worker.ts
var input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  try {
    const request = JSON.parse(input);
    if (typeof request.raw_content !== "string") throw new Error("raw_content must be a string");
    process.stdout.write(JSON.stringify({
      ok: true,
      analysis: analyzeUntrustedContent(request.raw_content, request.format, request.selectors)
    }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Parser worker failed" }));
    process.exitCode = 1;
  }
});
