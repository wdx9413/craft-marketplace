import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { FileStore } from "./file-store.mjs";
import { HANDLERS, TOOLS } from "./mcp-server.mjs";

const child = spawn(process.execPath, ["../../dist/plugin/craft-mcp.cjs", "--product", "context"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});

const store = new FileStore(process.env.CRAFT_SELF_EVOLUTION_DATA_DIR ?? process.env.PLUGIN_DATA ?? ".");
const listRequestIds = new Set();

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function toolError(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

const childLines = createInterface({ input: child.stdout, crlfDelay: Infinity });
childLines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { process.stdout.write(`${line}\n`); return; }
  if (listRequestIds.has(message.id)) {
    listRequestIds.delete(message.id);
    const existing = Array.isArray(message.result?.tools) ? message.result.tools : [];
    write({ ...message, result: { ...message.result, tools: [...existing, ...TOOLS] } });
    return;
  }
  write(message);
});

const inputLines = createInterface({ input: process.stdin, crlfDelay: Infinity });
inputLines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }
  if (message.method === "tools/list") {
    listRequestIds.add(message.id);
    child.stdin.write(`${line}\n`);
    return;
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (Object.hasOwn(HANDLERS, name)) {
      try { write({ jsonrpc: "2.0", id: message.id, result: toolResult(HANDLERS[name](store, message.params?.arguments ?? {})) }); }
      catch (error) { write({ jsonrpc: "2.0", id: message.id, result: toolError(error instanceof Error ? error.message : String(error)) }); }
      return;
    }
  }
  child.stdin.write(`${line}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { child.kill(signal); process.exit(0); });
}
child.on("exit", (code) => process.exit(code ?? 0));
