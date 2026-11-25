import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const marketplaceRoot = process.cwd();
const packerPath = join(marketplaceRoot, "scripts", "pack-marketplace.mjs");
const extraPaths = ["catalog/recommended-plugins.json", "scripts/resolve-plugin-host.mjs", "tests/resolve-plugin-host.test.mjs", "scripts/pack-marketplace.mjs"];

function zipEntries(archivePath) {
  const archive = readFileSync(archivePath);
  const endRecord = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(endRecord, -1, "ZIP end-of-central-directory record must exist");
  const entryCount = archive.readUInt16LE(endRecord + 10);
  let offset = archive.readUInt32LE(endRecord + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50, "ZIP central-directory entry must be valid");
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    entries.push(archive.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function createFixture(includeExtras) {
  const temporary = mkdtempSync(join(tmpdir(), "craft-marketplace-pack-test-"));
  mkdirSync(join(temporary, "catalog"), { recursive: true });
  mkdirSync(join(temporary, "dist", "packages"), { recursive: true });
  writeFileSync(join(temporary, "release.json"), JSON.stringify({ version: "9.8.7", source_commit: "fixture", source_state: "committed", components: [] }));
  writeFileSync(join(temporary, "catalog", "host-priority.json"), JSON.stringify({ hosts: [] }));
  writeFileSync(join(temporary, "README.md"), "package fixture\n");
  writeFileSync(join(temporary, "dist", "packages", "craft-marketplace-9.8.6.zip"), "old package bytes".repeat(100));
  if (includeExtras) {
    for (const path of extraPaths) {
      const fullPath = join(temporary, path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, "fixture\n");
    }
  }
  execFileSync("git", ["init", "-q"], { cwd: temporary });
  execFileSync("git", ["add", "-f", "."], { cwd: temporary });
  return temporary;
}

test("marketplace package excludes previous version archives and supports both host packers", () => {
  const temporary = createFixture(true);
  try {
    const packed = spawnSync(process.execPath, [packerPath], { cwd: temporary, encoding: "utf8" });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(temporary, "dist", "packages", "craft-marketplace-9.8.7.zip");
    const entries = zipEntries(archive);
    assert(entries.includes("README.md"));
    assert(entries.every((entry) => !entry.startsWith("dist/packages/")));
    const manifest = JSON.parse(readFileSync(join(temporary, "dist", "craft-marketplace-9.8.7.manifest.json"), "utf8"));
    assert(manifest.files.includes("README.md"));
    assert(manifest.files.every((path) => !path.startsWith("dist/packages/")));
    assert(extraPaths.every((path) => manifest.files.includes(path)));

    if (process.platform !== "win32") {
      const bin = join(temporary, "bin"), archiveSnapshot = join(temporary, "archive-snapshot.zip"), tar = join(bin, "tar");
      mkdirSync(bin, { recursive: true });
      copyFileSync(archive, archiveSnapshot);
      writeFileSync(tar, `#!/usr/bin/env node\nconst { copyFileSync } = require("node:fs");\nconst args = process.argv.slice(2);\ncopyFileSync(process.env.CRAFT_TEST_ARCHIVE, args[args.indexOf("-f") + 1]);\n`);
      chmodSync(tar, 0o700);
      const entrypoint = pathToFileURL(packerPath).href;
      const windowsPacked = spawnSync(process.execPath, ["--input-type=module", "-e",
        `Object.defineProperty(process, "platform", { value: "win32" }); await import(${JSON.stringify(entrypoint)});`],
      { cwd: temporary, encoding: "utf8", env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, CRAFT_TEST_ARCHIVE: archiveSnapshot } });
      assert.equal(windowsPacked.status, 0, windowsPacked.stderr);
      assert.equal(existsSync(join(temporary, "dist", "craft-marketplace-9.8.7.files.txt")), false);
      assert(zipEntries(archive).includes("README.md"));
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("marketplace pack omits optional files when they are absent", () => {
  const temporary = createFixture(false);
  try {
    const packed = spawnSync(process.execPath, [packerPath], { cwd: temporary, encoding: "utf8" });
    assert.equal(packed.status, 0, packed.stderr);
    const manifest = JSON.parse(readFileSync(join(temporary, "dist", "craft-marketplace-9.8.7.manifest.json"), "utf8"));
    assert(extraPaths.every((path) => !manifest.files.includes(path)));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("marketplace pack rejects an invalid release version in an isolated directory", () => {
  const temporary = mkdtempSync(join(tmpdir(), "craft-marketplace-invalid-version-test-"));
  try {
    writeFileSync(join(temporary, "release.json"), JSON.stringify({ version: "invalid" }));
    const invalid = spawnSync(process.execPath, [packerPath], { cwd: temporary, encoding: "utf8" });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /release\.json version is invalid/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
