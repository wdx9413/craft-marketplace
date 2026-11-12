var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));

// bin/craft-datasec-hook.ts
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve as resolve2, join as join2 } from "node:path";

// core/infrastructure/paths.ts
var paths_exports = {};
__reExport(paths_exports, paths_star);
import * as paths_star from "craft-common-store-local/paths";

// core/interfaces/codex-hook-runtime-diagnostics.ts
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
var DATABASE_ROLES = /* @__PURE__ */ new Set(["primary", "capability_partition"]);
var DATABASE_PHASES = /* @__PURE__ */ new Set(["transaction_begin", "transaction_operation", "savepoint_begin", "savepoint_operation"]);
function safeDirectory(path) {
  try {
    mkdirSync(path, { recursive: true, mode: 448 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Hook diagnostics path must use regular directories");
}
function appendLine(path, value) {
  const fd = openSync(path, "a", 384);
  try {
    writeSync(fd, `${JSON.stringify(value)}
`);
  } finally {
    closeSync(fd);
  }
}
function beginHookRuntimeDiagnostic(args) {
  const root = resolve(args.data_root);
  const traceRoot = join(root, "trace");
  const hookRoot = join(traceRoot, "hook-runtime");
  const directory = join(hookRoot, "v1");
  safeDirectory(root);
  safeDirectory(traceRoot);
  safeDirectory(hookRoot);
  safeDirectory(directory);
  const shard = createHash("sha256").update(args.request_id).digest()[0].toString(16).padStart(2, "0");
  const path = join(directory, `${shard}.jsonl`);
  const existingFile = lstatSync(path, { throwIfNoEntry: false });
  if (existingFile) {
    const stat = existingFile;
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Hook diagnostics file must be a regular file");
  }
  const now = args.now ?? (() => performance.now());
  const wallClock = args.wall_clock ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const started = now();
  const sessionHash = args.session_id ? createHash("sha256").update(args.session_id).digest("hex") : void 0;
  const base = {
    request_id: args.request_id,
    member: args.member,
    event: args.event,
    ...args.host ? { host: args.host } : {},
    started_at: wallClock(),
    ...sessionHash ? { session_hash: sessionHash } : {}
  };
  appendLine(path, { ...base, phase: "started" });
  let finished = false;
  return { finish(timing = {}) {
    if (finished) return;
    finished = true;
    const duration = now() - started;
    appendLine(path, {
      ...base,
      phase: "finished",
      finished_at: wallClock(),
      duration_ms: Math.max(0, Math.round(duration)),
      ...timing.process_elapsed_ms === void 0 ? {} : { process_elapsed_ms: Math.max(0, Math.round(timing.process_elapsed_ms)) },
      ...timing.input_read_ms === void 0 ? {} : { input_read_ms: Math.max(0, Math.round(timing.input_read_ms)) },
      ...timing.input_parse_ms === void 0 ? {} : { input_parse_ms: Math.max(0, Math.round(timing.input_parse_ms)) },
      ...timing.input_bytes === void 0 ? {} : { input_bytes: Math.max(0, Math.round(timing.input_bytes)) },
      ...timing.rules_load_ms === void 0 ? {} : { rules_load_ms: Math.max(0, Math.round(timing.rules_load_ms)) },
      ...timing.store_open_ms === void 0 ? {} : { store_open_ms: Math.max(0, Math.round(timing.store_open_ms)) },
      ...timing.runtime_import_ms === void 0 ? {} : { runtime_import_ms: Math.max(0, Math.round(timing.runtime_import_ms)) },
      ...timing.service_open_ms === void 0 ? {} : { service_open_ms: Math.max(0, Math.round(timing.service_open_ms)) },
      ...timing.handler_ms === void 0 ? {} : { handler_ms: Math.max(0, Math.round(timing.handler_ms)) },
      ...timing.output_write_ms === void 0 ? {} : { output_write_ms: Math.max(0, Math.round(timing.output_write_ms)) },
      ...timing.store_close_ms === void 0 ? {} : { store_close_ms: Math.max(0, Math.round(timing.store_close_ms)) },
      ...timing.outcome ? { outcome: timing.outcome } : {},
      ...timing.error_code ? { error_code: timing.error_code.slice(0, 80) } : {},
      ...timing.error_type ? { error_type: timing.error_type.slice(0, 80) } : {},
      ...timing.database_role && DATABASE_ROLES.has(timing.database_role) ? { database_role: timing.database_role } : {},
      ...timing.database_phase && DATABASE_PHASES.has(timing.database_phase) ? { database_phase: timing.database_phase } : {},
      ...Number.isSafeInteger(timing.busy_timeout_ms) && Number(timing.busy_timeout_ms) >= 0 && Number(timing.busy_timeout_ms) <= 6e4 ? { busy_timeout_ms: timing.busy_timeout_ms } : {},
      ...Number.isSafeInteger(timing.waited_ms) && Number(timing.waited_ms) >= 0 && Number(timing.waited_ms) <= 36e5 ? { waited_ms: timing.waited_ms } : {},
      ...typeof timing.retryable === "boolean" ? { retryable: timing.retryable } : {}
    });
  } };
}

// bin/craft-datasec-hook.ts
import { blankResult, FAILURE, handleHook, hidden } from "@craft/capability-datasec/hook";
import { enabledBuiltinRules } from "@craft/capability-datasec/rules";
function runDataSecHookCli(args, raw, env = process.env, onTiming) {
  const [host, event] = args;
  if (!["claude", "codex"].includes(host) || !["PreToolUse", "PostToolUse", "UserPromptSubmit"].includes(event)) {
    return { exitCode: 2, stderr: "craft-datasec: expected <claude|codex> <PreToolUse|PostToolUse|UserPromptSubmit>\n" };
  }
  let input = {};
  try {
    const parseStarted = performance.now();
    input = JSON.parse(raw);
    if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid event");
    onTiming?.("input_parse_ms", performance.now() - parseStarted);
    const rulesStarted = performance.now();
    const config = env.CRAFT_DATASEC_RULES;
    const rules = event === "UserPromptSubmit" ? [] : config ? JSON.parse(readFileSync(config, "utf8")) : enabledBuiltinRules(env.CRAFT_DATASEC_ENABLE_RULES);
    onTiming?.("rules_load_ms", performance.now() - rulesStarted);
    const root = env.CRAFT_DATASEC_DIR ?? join2(homedir(), ".craft-datasec");
    const handlerStarted = performance.now();
    let output;
    try {
      output = handleHook(host, event, input, root, rules);
    } finally {
      onTiming?.("handler_ms", performance.now() - handlerStarted);
    }
    return { exitCode: 0, stdout: `${JSON.stringify(output)}
` };
  } catch {
    const fallback = event === "PostToolUse" ? { ...hidden(host, FAILURE, blankResult(input?.tool_response ?? null)), ...host === "claude" ? { continue: false, stopReason: FAILURE } : {} } : handleHook(host, event, {}, "", []);
    return { exitCode: 0, stdout: `${JSON.stringify(fallback)}
` };
  }
}
function runIfInvoked(argv1, modulePath, run) {
  return argv1 && resolve2(argv1) === resolve2(modulePath) ? run() : null;
}
function writeCliResult(result2, stdout, stderr) {
  if (!result2) return;
  if (result2.stderr) stderr.write(result2.stderr);
  if (result2.stdout) stdout.write(result2.stdout);
  process.exitCode = result2.exitCode;
}
var diagnostic;
var inputReadMs = 0;
var inputBytes = 0;
var timings = {};
var result = runIfInvoked(process.argv[1], fileURLToPath(import.meta.url), () => {
  const args = process.argv.slice(2), [host, event] = args;
  if (!(host === "claude" || host === "codex") || !(event === "PreToolUse" || event === "PostToolUse" || event === "UserPromptSubmit")) {
    return runDataSecHookCli(args, readFileSync(0, "utf8"));
  }
  try {
    diagnostic = beginHookRuntimeDiagnostic({ data_root: (0, paths_exports.craftPaths)().root, request_id: randomUUID(), member: "datasec", event, host });
  } catch {
  }
  const readStarted = performance.now();
  const raw = readFileSync(0, "utf8");
  inputReadMs = performance.now() - readStarted;
  inputBytes = Buffer.byteLength(raw);
  return runDataSecHookCli(args, raw, process.env, (stage, durationMs) => {
    timings[stage] = durationMs;
  });
});
var outputStarted = performance.now();
writeCliResult(result, process.stdout, process.stderr);
diagnostic?.finish({
  process_elapsed_ms: process.uptime() * 1e3,
  input_read_ms: inputReadMs,
  input_bytes: inputBytes,
  input_parse_ms: timings.input_parse_ms,
  rules_load_ms: timings.rules_load_ms,
  handler_ms: timings.handler_ms,
  output_write_ms: performance.now() - outputStarted,
  outcome: "completed"
});
export {
  runDataSecHookCli,
  runIfInvoked,
  writeCliResult
};
