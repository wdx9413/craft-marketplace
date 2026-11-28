import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const proxy = fileURLToPath(new URL("../plugins/craft-context/runtime/craft-self-evolution/proxy.mjs", import.meta.url));

test("craft-context proxy exposes self-evolution tools on the primary MCP server", async () => {
  const child = spawn(process.execPath, ["--experimental-strip-types", proxy], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, CRAFT_SELF_EVOLUTION_DATA_DIR: mkdtempSync(join(tmpdir(), "craft-proxy-")) },
  });
  const responses = [];
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "craft_self_evolution_status", arguments: { project_scope_id: "proxy-scope" } } })}\n`);

  const deadline = Date.now() + 15_000;
  while (responses.length < 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  child.kill();

  const list = responses.find((message) => message.id === 2);
  assert.ok(list.result.tools.some((tool) => tool.name === "craft_self_evolution_status"));
  assert.ok(list.result.tools.some((tool) => tool.name === "craft_context_open"));

  const status = responses.find((message) => message.id === 3);
  assert.match(status.result.content[0].text, /self_evolution_content/u);
});
