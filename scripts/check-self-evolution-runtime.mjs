import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(root, "plugins", "craft-context");
const required = [
  "runtime/craft-self-evolution/craft-self-evolution.ts",
  "runtime/craft-self-evolution/context-self-evolution-loop.ts",
  "runtime/craft-self-evolution/mcp-server.mjs",
  "runtime/craft-self-evolution/hook.mjs",
  "runtime/craft-self-evolution/proxy.mjs",
  "runtime/craft-self-evolution/file-store.mjs",
  "skills/craft-context/SKILL.md",
  "install.ps1",
  "INSTALL.md",
  "mcp.json",
  ".mcp.json",
  "hooks/codex-hooks.json",
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
  const args = JSON.stringify(config.mcpServers?.["craft-context"]?.args ?? []);
  if (!args.includes("runtime/craft-self-evolution/proxy.mjs")) throw new Error(`${manifest} does not proxy self-evolution through craft-context`);
}

const hooks = JSON.parse(readFileSync(join(pluginRoot, "hooks/codex-hooks.json"), "utf8"));
for (const event of ["UserPromptSubmit", "PostToolUse", "Stop"]) {
  const commands = JSON.stringify(hooks.hooks[event]);
  if (!commands.includes("runtime/craft-self-evolution/hook.mjs")) throw new Error(`${event} hook does not call self-evolution hook`);
}

process.stdout.write("craft-context self-evolution runtime is packaged for marketplace git distribution\n");
