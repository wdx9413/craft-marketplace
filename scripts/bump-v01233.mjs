import { readFileSync, writeFileSync } from "node:fs";

/**
 * Unifies the craft-marketplace release surface on v0.12.33.
 *
 * Before this ran, the marketplace was internally inconsistent: plugin
 * manifests and release.json said 0.12.32 while README.md said 0.12.31, and the
 * craft source repository said 0.12.30. All three now agree.
 *
 * Also refreshes release.json's source_commit so the marketplace records the
 * craft revision it was cut from. The commit is read from the caller rather
 * than guessed, because a stale source_commit is exactly the kind of silent
 * disagreement this file exists to prevent.
 */
const version = "0.12.33";
const sourceCommit = process.argv[2];
if (!sourceCommit || !/^[0-9a-f]{40}$/u.test(sourceCommit)) {
  throw new Error("pass the craft source commit as a full 40-character SHA-1");
}

const jsonTargets = [
  ".claude-plugin/marketplace.json",
  "release.json",
  "plugins/craft/.codex-plugin/plugin.json",
  "plugins/craft-capability/.codex-plugin/plugin.json",
  "plugins/craft-context/.codex-plugin/plugin.json",
  "plugins/craft-knowledge/.claude-plugin/plugin.json",
  "plugins/craft-knowledge/.codex-plugin/plugin.json",
  "plugins/craft-memory/.claude-plugin/plugin.json",
  "plugins/craft-memory/.codex-plugin/plugin.json",
  "plugins/craft-quality/.codex-plugin/plugin.json",
  "plugins/craft-skill-quality/.codex-plugin/plugin.json",
  "plugins/craft-experience/.claude-plugin/plugin.json",
  "plugins/craft-experience/.codex-plugin/plugin.json",
];

for (const file of jsonTargets) {
  const original = readFileSync(file, "utf8");
  const updated = original.replace(/("version":\s*")0\.12\.\d+(")/u, `$1${version}$2`);
  if (updated === original) throw new Error(`${file} had no 0.12.x version to replace`);
  if (updated.includes("\uFFFD")) throw new Error(`${file} would gain U+FFFD; refusing to write`);
  writeFileSync(file, updated, "utf8");
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (parsed.version !== version) throw new Error(`${file} did not land on ${version}`);
  console.log(`OK   ${file} -> ${parsed.version}`);
}

// release.json additionally records the exact craft revision it was cut from.
const release = JSON.parse(readFileSync("release.json", "utf8"));
release.source_commit = sourceCommit;
writeFileSync("release.json", `${JSON.stringify(release, null, 2)}\n`, "utf8");
console.log(`OK   release.json source_commit -> ${sourceCommit}`);

const readme = readFileSync("README.md", "utf8");
const updatedReadme = readme.replace(/(Craft version：`)(0\.12\.\d+)(`)/u, `$1${version}$3`);
if (updatedReadme === readme) throw new Error("README.md did not expose a Craft version line to update");
if (updatedReadme.includes("\uFFFD")) throw new Error("README.md would gain U+FFFD; refusing to write");
writeFileSync("README.md", updatedReadme, "utf8");
console.log(`OK   README.md -> ${version}`);
