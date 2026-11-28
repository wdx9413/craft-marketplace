import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(root, "plugins", "craft-context");
const read = (path) => readFileSync(join(pluginRoot, path), "utf8");

test("craft-context self-evolution tools are discoverable in the canonical tool surface", async () => {
  const { ACTIVE_TOOLS } = await import("../../craft/core/mcp/tool-catalog.ts");
  const names = ACTIVE_TOOLS.map((tool) => tool.name);
  for (const tool of [
    "craft_self_evolution_accumulate",
    "craft_self_evolution_promote",
    "craft_self_evolution_search",
    "craft_self_evolution_feedback",
  ]) assert.ok(names.includes(tool), tool);
});

test("plugin carries the self-evolution runtime fallback", () => {
  const cli = read("runtime/craft-self-evolution/craft-self-evolution.ts");
  const core = read("runtime/craft-self-evolution/context-self-evolution-loop.ts");
  const mcp = read("runtime/craft-self-evolution/mcp-server.mjs");
  assert.match(cli, /runSelfEvolutionCli/u);
  assert.match(core, /selfEvolutionAccumulate/u);
  assert.match(core, /selfEvolutionPromote/u);
  assert.match(core, /selfEvolutionSearch/u);
  assert.match(core, /selfEvolutionFeedback/u);
  assert.match(mcp, /craft_self_evolution_accumulate/u);
});

test("plugin manifests register the self-evolution MCP server", () => {
  const portable = JSON.parse(read("mcp.json"));
  const codex = JSON.parse(read(".mcp.json"));
  assert.ok(portable.mcpServers["craft-self-evolution"]);
  assert.ok(codex.mcpServers["craft-self-evolution"]);
});

test("install script copies the self-evolution runtime", () => {
  assert.match(read("install.ps1"), /runtime\\craft-self-evolution/u);
});

test("skills document the self-evolution loop", () => {
  assert.match(read("skills/craft-context/SKILL.md"), /craft_self_evolution_accumulate/u);
  assert.match(read("INSTALL.md"), /craft_self_evolution_promote/u);
});
