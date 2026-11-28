import { createInterface } from "node:readline";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { selfEvolutionAccumulate, selfEvolutionFeedback, selfEvolutionPromote, selfEvolutionSearch } from "./context-self-evolution-loop.ts";

class FileStore {
  constructor(root) {
    this.file = resolve(root, "self-evolution-store.json");
    mkdirSync(dirname(this.file), { recursive: true });
    this.rows = {};
    try { this.rows = JSON.parse(readFileSync(this.file, "utf8")); } catch { this.rows = {}; }
  }
  key(kind, id) { return `${kind}:${id}`; }
  find(kind, id) { return this.rows[this.key(kind, id)] ?? null; }
  create(kind, id, payload) {
    const key = this.key(kind, id);
    if (this.rows[key]) throw new Error(`${kind} already exists: ${id}`);
    return this.save(kind, id, payload);
  }
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

const TOOLS = [
  {
    name: "craft_self_evolution_accumulate",
    description: "Record one task-derived candidate without storing the statement body. Requires a project scope.",
    inputSchema: {
      type: "object",
      properties: {
        statement: { type: "string" },
        project_scope_id: { type: "string" },
        project_root: { type: "string" },
        scenario_key: { type: "string" },
        domain: { type: "string" },
        source_refs: { type: "array", items: { type: "object" } },
      },
      required: ["statement"],
    },
  },
  {
    name: "craft_self_evolution_promote",
    description: "Promote one accumulated candidate using a complete external verdict; hard gates fail closed.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, verdict: { type: "object" } },
      required: ["id", "verdict"],
    },
  },
  {
    name: "craft_self_evolution_search",
    description: "Find current reusable self-evolution entries by project scope and scenario; returns a content-free receipt.",
    inputSchema: {
      type: "object",
      properties: {
        project_scope_id: { type: "string" },
        project_root: { type: "string" },
        scenario_key: { type: "string" },
        domain: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["project_scope_id", "scenario_key"],
    },
  },
  {
    name: "craft_self_evolution_feedback",
    description: "Apply confirmed, degraded or revoked feedback to one accumulated entry.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, status: { type: "string", enum: ["confirmed", "degraded", "revoked"] }, reason: { type: "string" } },
      required: ["id", "status"],
    },
  },
];

const HANDLERS = {
  craft_self_evolution_accumulate: selfEvolutionAccumulate,
  craft_self_evolution_promote: selfEvolutionPromote,
  craft_self_evolution_search: selfEvolutionSearch,
  craft_self_evolution_feedback: selfEvolutionFeedback,
};

function jsonResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function errorResult(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

async function handle(message, store) {
  if (message.method === "initialize") {
    return { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "craft-self-evolution", version: "0.21.12" } };
  }
  if (message.method === "tools/list") return { tools: TOOLS };
  if (message.method === "tools/call") {
    const handler = HANDLERS[message.params?.name];
    if (!handler) return errorResult(`unknown tool: ${message.params?.name}`);
    try {
      return jsonResult(handler(store, message.params?.arguments ?? {}));
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  }
  return errorResult(`unsupported method: ${message.method}`);
}

export async function runMcpServer(store, input, output) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch { output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })}\n`); continue; }
    const result = await handle(message, store);
    output.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id ?? null, result })}\n`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/u).pop() ?? "")) {
  const store = new FileStore(process.env.CRAFT_SELF_EVOLUTION_DATA_DIR ?? process.env.PLUGIN_DATA ?? ".");
  await runMcpServer(store, process.stdin, process.stdout);
}
