import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { PassThrough, Readable, Writable } from "node:stream";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const adapter = require("../plugins/craft-context/hooks/codex-user-prompt-submit.cjs");

test("UserPromptSubmit context uses Codex hookSpecificOutput and preserves other fields", () => {
  assert.deepEqual(adapter.formatCodexHookOutput("UserPromptSubmit", {
    decision: "allow",
    additionalContext: "scoped context",
    hookSpecificOutput: { custom: true },
  }), {
    decision: "allow",
    hookSpecificOutput: { custom: true, hookEventName: "UserPromptSubmit", additionalContext: "scoped context" },
  });
});

test("other events, missing context, and non-object results are unchanged", () => {
  const plain = { systemMessage: "done" };
  assert.equal(adapter.formatCodexHookOutput("Stop", plain), plain);
  assert.equal(adapter.formatCodexHookOutput("UserPromptSubmit", plain), plain);
  assert.equal(adapter.formatCodexHookOutput("UserPromptSubmit", null), null);
  const array = [];
  assert.equal(adapter.formatCodexHookOutput("UserPromptSubmit", array), array);
});

test("malformed prior event output is replaced with a valid Codex object", () => {
  assert.deepEqual(adapter.formatCodexHookOutput("UserPromptSubmit", {
    additionalContext: "context",
    hookSpecificOutput: ["invalid"],
  }), {
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "context" },
  });
});

test("event parsing accepts Hook input and safely handles invalid input", () => {
  assert.equal(adapter.hookEventName('{"hook_event_name":"UserPromptSubmit"}'), "UserPromptSubmit");
  assert.equal(adapter.hookEventName("invalid"), "");
  assert.equal(adapter.hookEventName("{}"), "");
  assert.equal(adapter.hookEventName("null"), "");
  assert.equal(adapter.hookEventName('{"hook_event_name":1}'), "");
});

test("output normalization wraps context and rejects malformed or non-object JSON", () => {
  assert.deepEqual(adapter.normalizeOutput("UserPromptSubmit", '{"additionalContext":"ctx"}'), {
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "ctx" },
  });
  assert.deepEqual(adapter.normalizeOutput("Stop", ""), {});
  assert.throws(() => adapter.normalizeOutput("UserPromptSubmit", "invalid"), SyntaxError);
  assert.throws(() => adapter.normalizeOutput("UserPromptSubmit", "null"), /JSON object/);
});

test("launcher entrypoint starts only when it is the main module", () => {
  let started = false;
  adapter.start(false, () => { started = true; });
  assert.equal(started, false);
});

test("Marketplace manifest routes real Codex prompt submissions through the adapter", async () => {
  const root = resolve(import.meta.dirname, "..");
  const manifest = JSON.parse(await readFile(join(root, "plugins/craft-context/hooks/codex-hooks.json"), "utf8"));
  assert.match(manifest.hooks.UserPromptSubmit[0].hooks[0].command, /codex-user-prompt-submit\.cjs/u);
  const temporary = await mkdtemp(join(tmpdir(), "craft-codex-hook-adapter-"));
  try {
    const result = spawnSync(process.execPath, [join(root, "plugins/craft-context/hooks/codex-user-prompt-submit.cjs"), "--member", "context"], {
      cwd: temporary,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, CRAFT_DATA_DIR: join(temporary, "data"), NODE_NO_WARNINGS: "1" },
      input: JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: temporary, session_id: "marketplace-adapter-smoke",
        prompt: "Synthetic Hook adapter verification input; do not retain this sentence." }),
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.additionalContext, undefined);
    if (output.hookSpecificOutput) {
      assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
      assert.equal(typeof output.hookSpecificOutput.additionalContext, "string");
    }
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

function testStreams(inputText) {
  let stdout = "";
  let stderr = "";
  const input = Readable.from([inputText]);
  const output = new Writable({ write(chunk, _encoding, callback) { stdout += chunk.toString(); callback(); } });
  const errorOutput = new Writable({ write(chunk, _encoding, callback) { stderr += chunk.toString(); callback(); } });
  return { input, output, errorOutput, get stdout() { return stdout; }, get stderr() { return stderr; } };
}

function fakeSpawn({ output = "{}", code = 0, signal = null, error } = {}) {
  return (command, args, options) => {
    assert.equal(command, process.execPath);
    assert.deepEqual(args, ["/tmp/craft-hook.cjs", "--member", "context"]);
    assert.deepEqual(options.stdio, ["pipe", "pipe", "inherit"]);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.stdin.on("finish", () => setImmediate(() => {
      if (error) child.emit("error", error);
      else child.stdout.end(output);
      child.emit("close", code, signal);
    }));
    return child;
  };
}

test("launcher formats successful UserPromptSubmit output", async () => {
  const streams = testStreams('{"hook_event_name":"UserPromptSubmit"}');
  const code = await adapter.run({ ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"],
    env: process.env,
    spawnProcess: fakeSpawn({ output: '{"additionalContext":"ctx"}' }) });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(streams.stdout), { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "ctx" } });
  assert.equal(streams.stderr, "");
});

test("launcher preserves non-prompt output", async () => {
  const streams = testStreams('{"hook_event_name":"Stop"}');
  const code = await adapter.run({ ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"],
    env: process.env,
    spawnProcess: fakeSpawn({ output: '{"systemMessage":"done"}' }) });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(streams.stdout), { systemMessage: "done" });
});

test("command-line entrypoint wires Host streams and records its exit code", async () => {
  const oldExitCode = process.exitCode;
  const defaults = adapter.commandOptions();
  assert.equal(defaults.input, process.stdin);
  assert.equal(defaults.output, process.stdout);
  assert.equal(defaults.errorOutput, process.stderr);
  defaults.setExitCode(42);
  assert.equal(process.exitCode, 42);
  process.exitCode = oldExitCode;

  const streams = testStreams('{"hook_event_name":"UserPromptSubmit"}');
  let exitCode;
  const options = { ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"], env: process.env,
    setExitCode(code) { exitCode = code; },
    spawnProcess: fakeSpawn({ output: '{"additionalContext":"ctx"}' }) };
  assert.equal(await adapter.start(true, () => options), 0);
  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(streams.stdout), { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "ctx" } });
});

test("launcher fails closed when child execution or JSON output fails", async t => {
  await t.test("child exit code", async () => {
    const streams = testStreams("{}");
    assert.equal(await adapter.run({ ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"],
      env: process.env,
      spawnProcess: fakeSpawn({ code: 7 }) }), 7);
    assert.equal(streams.stdout, "");
  });
  await t.test("child signal", async () => {
    const streams = testStreams("{}");
    assert.equal(await adapter.run({ ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"],
      env: process.env,
      spawnProcess: fakeSpawn({ signal: "SIGTERM" }) }), 1);
  });
  await t.test("missing child exit code", async () => {
    const streams = testStreams("{}");
    assert.equal(await adapter.run({ ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"],
      env: process.env,
      spawnProcess: fakeSpawn({ code: null }) }), 1);
  });
  await t.test("spawn error", async () => {
    const streams = testStreams("{}");
    assert.equal(await adapter.run({ ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"],
      env: process.env,
      spawnProcess: fakeSpawn({ error: new Error("private details") }) }), 1);
    assert.equal(streams.stderr, "Craft Hook launcher could not start its child process.\n");
  });
  await t.test("invalid child JSON", async () => {
    const streams = testStreams("{}");
    assert.equal(await adapter.run({ ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"],
      env: process.env,
      spawnProcess: fakeSpawn({ output: "not-json" }) }), 1);
    assert.equal(streams.stderr, "Craft Hook returned invalid JSON.\n");
  });
  await t.test("non-object child JSON", async () => {
    const streams = testStreams("{}");
    assert.equal(await adapter.run({ ...streams, bundlePath: "/tmp/craft-hook.cjs", args: ["--member", "context"],
      env: process.env,
      spawnProcess: fakeSpawn({ output: "[]" }) }), 1);
    assert.equal(streams.stderr, "Craft Hook returned invalid JSON.\n");
  });
});
