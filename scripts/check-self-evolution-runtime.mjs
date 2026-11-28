import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(root, "plugins", "craft-context");
const required = [
  "runtime/craft-self-evolution/craft-self-evolution.ts",
  "runtime/craft-self-evolution/context-self-evolution-loop.ts",
  "runtime/craft-self-evolution/mcp-server.mjs",
  "skills/craft-context/SKILL.md",
  "install.ps1",
  "INSTALL.md",
  "mcp.json",
  ".mcp.json",
];

for (const relative of required) {
  const path = join(pluginRoot, relative);
  if (!existsSync(path)) throw new Error(`missing self-evolution runtime file: ${relative}`);
}

const skill = readFileSync(join(pluginRoot, "skills/craft-context/SKILL.md"), "utf8");
for (const tool of [
  "craft_self_evolution_accumulate",
  "craft_self_evolution_promote",
  "craft_self_evolution_search",
  "craft_self_evolution_feedback",
]) {
  if (!skill.includes(tool)) throw new Error(`skill does not document ${tool}`);
}

for (const manifest of ["mcp.json", ".mcp.json"]) {
  const config = JSON.parse(readFileSync(join(pluginRoot, manifest), "utf8"));
  if (!config.mcpServers?.["craft-self-evolution"]) throw new Error(`${manifest} does not register craft-self-evolution`);
}

process.stdout.write("craft-context self-evolution runtime is packaged for marketplace git distribution\n");
