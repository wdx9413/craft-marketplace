import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStoreLike } from "./helpers/self-evolution-store.mjs";
import { runHook } from "../plugins/craft-context/runtime/craft-self-evolution/hook.mjs";
import { selfEvolutionFeedback, selfEvolutionPromote } from "../plugins/craft-context/runtime/craft-self-evolution/context-self-evolution-loop.ts";

const verdict = {
  verified: true,
  evidence_ref: "hook-run",
  verifier: "craft-eval",
  gates: { scope_leak_count: 0, unsupported_claim_rate_max: 0 },
  session_id: "session-1",
  task_id: "task-1",
};

test("UserPromptSubmit hook injects a content-free reusable receipt", async () => {
  const store = new FileStoreLike(mkdtempSync(join(tmpdir(), "craft-evolution-hook-")));
  const candidate = store.create("self_evolution_content", "candidate", {
    statement_digest: "digest", scenario_key: "coding", domain: "experience", project_scope_id: "abc", status: "candidate",
  });
  selfEvolutionPromote(store, { id: candidate.id, verdict });

  const output = await runHook(store, {
    hook_event_name: "UserPromptSubmit",
    prompt: "fix the failing test",
    cwd: "/tmp/irrelevant",
    self_evolution_scope_id: "abc",
  });
  assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(output.hookSpecificOutput.additionalContext, /self-evolution/u);
});

test("Stop hook marks a referenced entry confirmed or degraded", async () => {
  const store = new FileStoreLike(mkdtempSync(join(tmpdir(), "craft-evolution-hook-")));
  const candidate = store.create("self_evolution_content", "self_evolution_abcdef0123456789abcdef01", {
    statement_digest: "digest", scenario_key: "general", domain: "knowledge", project_scope_id: "abc", status: "current",
  });

  await runHook(store, { hook_event_name: "Stop", last_assistant_message: `used ${candidate.id} successfully` });
  assert.equal((store.find("self_evolution_content", candidate.id).feedback ?? []).at(-1)?.status, "confirmed");

  await runHook(store, { hook_event_name: "Stop", last_assistant_message: `used ${candidate.id} but failed` });
  assert.equal(store.find("self_evolution_content", candidate.id).status, "candidate");
});
