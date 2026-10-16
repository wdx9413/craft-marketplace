import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, unlinkSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { sourceProvenance } from "../scripts/source-provenance.mjs";

test("source provenance binds tracked and untracked bytes rather than pretending dirty source is HEAD", () => {
  const root = mkdtempSync(join(tmpdir(), "craft-source-provenance-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "--quiet"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(root, ".gitignore"), "dist/\n");
    writeFileSync(join(root, "tracked.ts"), "export const value = 1;\n");
    git("add", "."); git("commit", "--quiet", "-m", "fixture baseline");
    const baseline = sourceProvenance(root, "0.12.37");
    assert.equal(baseline.source_state, "committed"); assert.equal(baseline.source_commit, git("rev-parse", "HEAD"));
    assert.match(baseline.source_tree_digest, /^sha256:[a-f0-9]{64}$/);
    assert.match(baseline.source_note, /clean checkout/); assert.match(baseline.source_note, /does not attest the build process/);
    mkdirSync(join(root, "dist")); writeFileSync(join(root, "dist", "generated.js"), "ignored output");
    assert.deepEqual(sourceProvenance(root, "0.12.37"), baseline);
    writeFileSync(join(root, "new code.ts"), "untracked production implementation");
    const untracked = sourceProvenance(root, "0.12.37");
    assert.equal(untracked.source_state, "dirty"); assert.equal(untracked.source_commit, baseline.source_commit);
    assert.notEqual(untracked.source_tree_digest, baseline.source_tree_digest); assert.match(untracked.source_note, /dirty working tree/);
    git("add", "new code.ts"); assert.equal(sourceProvenance(root, "0.12.37").source_tree_digest, untracked.source_tree_digest);
    writeFileSync(join(root, "tracked.ts"), "modified bytes");
    const modified = sourceProvenance(root, "0.12.37"); assert.notEqual(modified.source_tree_digest, untracked.source_tree_digest);
    unlinkSync(join(root, "tracked.ts")); const deleted = sourceProvenance(root, "0.12.37"); assert.notEqual(deleted.source_tree_digest, modified.source_tree_digest);
    symlinkSync("missing-target", join(root, "source-link"));
    const linked = sourceProvenance(root, "0.12.37"); assert.notEqual(linked.source_tree_digest, deleted.source_tree_digest);
    unlinkSync(join(root, "source-link")); symlinkSync("another-missing-target", join(root, "source-link"));
    assert.notEqual(sourceProvenance(root, "0.12.37").source_tree_digest, linked.source_tree_digest);
    assert.throws(() => sourceProvenance(join(root, "missing-repo"), "0.12.37"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("sync --check rejects an untracked source addition and a forged source-tree digest", () => {
  const root = mkdtempSync(join(tmpdir(), "craft-provenance-check-"));
  const source = join(root, "source"); const market = join(root, "market");
  const put = (path, value) => { mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, `${JSON.stringify(value)}\n`); };
  try {
    mkdirSync(source); mkdirSync(market);
    const git = (...args) => execFileSync("git", ["-C", source, ...args], { stdio: "pipe" });
    git("init", "--quiet"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    const product = { name: "craft-memory", category: "Productivity" };
    put(join(source, "distribution-contract.json"), { version: "0.12.37", products: [product] });
    const plugin = join(source, "plugins", product.name);
    put(join(plugin, ".claude-plugin", "plugin.json"), { name: product.name, version: "0.12.37", description: "fixture" });
    git("add", "."); git("commit", "--quiet", "-m", "fixture baseline");
    mkdirSync(join(market, "plugins")); cpSync(plugin, join(market, "plugins", product.name), { recursive: true });
    put(join(market, ".agents", "plugins", "marketplace.json"), { version: "0.12.37", plugins: [{ name: product.name, source: { source: "local", path: `./plugins/${product.name}` }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: product.category }] });
    put(join(market, ".claude-plugin", "marketplace.json"), { version: "0.12.37", plugins: [{ name: product.name, description: "fixture", source: `./plugins/${product.name}`, category: "productivity" }] });
    const writeRelease = (override = {}) => put(join(market, "release.json"), { version: "0.12.37", components: [product.name], claude_components: [product.name], ...sourceProvenance(source, "0.12.37"), ...override });
    const check = () => execFileSync(process.execPath, [resolve(import.meta.dirname, "../scripts/sync-from-craft.mjs"), join(source, "plugins"), "--check"], { cwd: market, stdio: "pipe", encoding: "utf8" });
    writeRelease(); assert.match(check(), /no files changed/);
    writeFileSync(join(source, "new-runtime.ts"), "untracked implementation");
    assert.throws(check, /release.json differs/);
    writeRelease(); assert.match(check(), /no files changed/);
    writeRelease({ source_tree_digest: "sha256:" + "0".repeat(64) }); assert.throws(check, /release.json differs/);
    const seed = join(plugin, "skills", product.name, "SKILL.md"); mkdirSync(resolve(seed, ".."), { recursive: true }); writeFileSync(seed, "Runtime template calling guide\n");
    const obsolete = join(market, "plugins", product.name, "skills", product.name, "old-template.json"); put(obsolete, { obsolete: true });
    const notes = join(market, "plugins", product.name, "notes.txt"); writeFileSync(notes, "market-owned notes\n");
    execFileSync(process.execPath, [resolve(import.meta.dirname, "../scripts/sync-from-craft.mjs"), join(source, "plugins"), "--apply"], { cwd: market, stdio: "pipe" });
    assert.equal(existsSync(obsolete), false); assert.equal(readFileSync(notes, "utf8"), "market-owned notes\n"); assert.match(check(), /no files changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
