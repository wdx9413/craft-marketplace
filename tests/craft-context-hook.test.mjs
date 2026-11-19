import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("Marketplace routes Codex hooks to the self-contained Craft Context bundle", async () => {
  const root = resolve(import.meta.dirname, "..");
  const manifest = JSON.parse(await readFile(join(root, "plugins/craft-context/hooks/codex-hooks.json"), "utf8"));
  const command = manifest.hooks.UserPromptSubmit[0].hooks[0].command;
  assert.match(command, /\$\{PLUGIN_ROOT\}\/dist\/plugin\/craft-codex-hook\.cjs/u);
  const hook = join(root, "plugins/craft-context/dist/plugin/craft-codex-hook.cjs");
  assert.equal(existsSync(hook), true);

  const temporary = await mkdtemp(join(tmpdir(), "craft-marketplace-hook-"));
  try {
    const result = spawnSync(process.execPath, [hook, "--member", "context"], {
      cwd: temporary,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, CRAFT_DATA_DIR: join(temporary, "data"), NODE_NO_WARNINGS: "1" },
      input: JSON.stringify({ hook_event_name: "SessionStart", cwd: temporary, session_id: "marketplace-hook-smoke" }),
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
