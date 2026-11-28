import assert from "node:assert/strict";
import test from "node:test";
import { Readable, Writable } from "node:stream";
import { runMcpServer } from "../plugins/craft-context/runtime/craft-self-evolution/mcp-server.mjs";

class MemoryStore {
  constructor() { this.rows = new Map(); }
  key(kind, id) { return `${kind}:${id}`; }
  find(kind, id) { return this.rows.get(this.key(kind, id)) ?? null; }
  create(kind, id, payload) { const row = { ...payload, id }; this.rows.set(this.key(kind, id), row); return row; }
  save(kind, id, payload) { return this.create(kind, id, payload); }
  list(kind, limit, predicate) {
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${kind}:`))
      .map(([, value]) => value)
      .filter((value) => !predicate || predicate(value))
      .slice(0, limit);
  }
}

async function exchange(messages, store = new MemoryStore()) {
  const input = Readable.from(messages.map((message) => `${JSON.stringify(message)}\n`));
  let outputText = "";
  const output = new Writable({ write(chunk, _encoding, callback) { outputText += chunk.toString(); callback(); } });
  await runMcpServer(store, input, output);
  return outputText.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("MCP server lists the four self-evolution tools", async () => {
  const [init, list] = await exchange([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]);
  assert.equal(init.result.serverInfo.name, "craft-self-evolution");
  assert.deepEqual(list.result.tools.map((tool) => tool.name), [
    "craft_self_evolution_accumulate",
    "craft_self_evolution_promote",
    "craft_self_evolution_search",
    "craft_self_evolution_feedback",
  ]);
});

test("MCP server runs the real accumulate to promote to search loop", async () => {
  const store = new MemoryStore();
  const responses = await exchange([
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "craft_self_evolution_accumulate", arguments: { statement: "MCP guidance", project_scope_id: "repo-1", scenario_key: "dev_standard" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "craft_self_evolution_promote", arguments: { id: "id-from-first-call", verdict: { verified: true, evidence_ref: "run-1", verifier: "craft-eval", gates: { scope_leak_count: 0, unsupported_claim_rate_max: 0 } } } } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "craft_self_evolution_search", arguments: { project_scope_id: "repo-1", scenario_key: "dev_standard" } } },
  ], store);

  const accumulate = JSON.parse(responses[0].result.content[0].text);
  const promote = JSON.parse(responses[1].result.content[0].text);
  assert.equal(promote.error, "candidate not found", "second call uses a placeholder id and is rejected");

  const direct = await exchange([
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "craft_self_evolution_promote", arguments: { id: accumulate.id, verdict: { verified: true, evidence_ref: "run-2", verifier: "craft-eval", gates: { scope_leak_count: 0, unsupported_claim_rate_max: 0 } } } } },
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "craft_self_evolution_search", arguments: { project_scope_id: "repo-1", scenario_key: "dev_standard" } } },
  ], store);
  assert.equal(JSON.parse(direct[0].result.content[0].text).status, "current");
  assert.equal(JSON.parse(direct[1].result.content[0].text).entries.length, 1);
});

test("MCP server rejects malformed and unknown requests without crashing", async () => {
  const responses = await exchange([
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "unknown.tool", arguments: {} } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "craft_self_evolution_feedback", arguments: { id: "missing", status: "confirmed" } } },
  ]);
  assert.match(responses[0].result.content[0].text, /unknown tool/u);
  assert.equal(responses[1].result.isError, true);
});
