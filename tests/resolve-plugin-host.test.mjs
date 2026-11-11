import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadCatalog, resolvePluginHost, resolveRecommended } from "../scripts/resolve-plugin-host.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("host priority is codex > claude > dsh > pi", () => {
  const { priority } = loadCatalog(root);
  assert.deepEqual(priority.hosts, ["codex", "claude", "dsh", "pi"]);
});

test("a multi-host plugin resolves to the first available host only", () => {
  const { priority } = loadCatalog(root);
  const result = resolvePluginHost(
    { name: "dsh-plugin", source: "./plugins/craft-context", hosts: ["codex", "claude", "dsh"] },
    { root, priority },
  );
  assert.equal(result.selected_host, "codex");
  assert.equal(result.resolution, "single_manifest");
  assert.match(result.install_command, /codex plugin add dsh-plugin@craft-marketplace/);
  assert.equal(result.candidates.length, 4);
  assert.equal(result.candidates.filter(candidate => candidate.available).length, 2);
});

test("a plugin declaring no host reports no_available_host", () => {
  const { priority } = loadCatalog(root);
  const result = resolvePluginHost({ name: "missing", hosts: [] }, { root, priority });
  assert.equal(result.selected_host, null);
  assert.equal(result.resolution, "no_available_host");
});

test("recommended catalog resolves bundled defaults via codex first", () => {
  const report = resolveRecommended({ root });
  const context = report.plugins.find(plugin => plugin.name === "craft-context");
  const datasec = report.plugins.find(plugin => plugin.name === "craft-datasec");
  assert.equal(context.default_install, true);
  assert.equal(datasec.default_install, true);
  assert.equal(context.selected_host, "codex");
  assert.equal(datasec.selected_host, "codex");
  assert.equal(report.plugins.some(plugin => plugin.name === "github"), true);
  assert.equal(report.plugins.some(plugin => plugin.name === "craft-file-dir-desc"), true);
});

test("high-risk desktop/remote-control plugins are never default installs", () => {
  const { recommended } = loadCatalog(root);
  assert.equal(recommended.high_risk_not_default.length >= 3, true);
  assert.equal(recommended.high_risk_not_default.some(plugin => plugin.default_install === true), false);
  assert.equal(recommended.recommended.some(plugin => plugin.name === "context7" && plugin.default_install === true), true);
  assert.equal(recommended.recommended.some(plugin => plugin.name === "agent-browser" && plugin.default_install === true), true);
  assert.equal(recommended.credentialed_optional.some(plugin => plugin.default_install === true), false);
  assert.equal(recommended.remote_message.default_install, false);
  assert.equal(recommended.remote_message.credential_source, "environment variables only");
});
