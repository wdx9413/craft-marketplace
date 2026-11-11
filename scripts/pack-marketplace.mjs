import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, resolve, sep } from "node:path";

/**
 * Produce a versioned, reviewable marketplace archive.
 *
 * The marketplace is a Git-based distribution surface, so this archive is a
 * convenience artifact, not a second source of truth. It contains only the
 * tracked/releasable files: manifests, plugin payloads, catalogs, tests, docs.
 * Local build caches and node_modules are excluded.
 */
const root = process.cwd();
const release = JSON.parse(readFileSync(join(root, "release.json"), "utf8"));
const version = release.version;
if (!/^\d+\.\d+\.\d+$/u.test(String(version))) throw new Error("release.json version is invalid");
const packages = resolve(root, "dist", "packages");
mkdirSync(packages, { recursive: true });
const archive = join(packages, `craft-marketplace-${version}.zip`);
rmSync(archive, { force: true });

const included = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0").filter(Boolean);
const extra = ["catalog/host-priority.json", "catalog/recommended-plugins.json",
  "scripts/resolve-plugin-host.mjs", "tests/resolve-plugin-host.test.mjs", "scripts/pack-marketplace.mjs"];
for (const path of extra) if (existsSync(join(root, path))) included.push(path);

const manifest = {
  schema: "craft.marketplace-package.v1",
  version,
  source_commit: release.source_commit,
  source_state: release.source_state,
  components: release.components,
  host_priority: JSON.parse(readFileSync(join(root, "catalog/host-priority.json"), "utf8")).hosts,
  files: [...new Set(included)].sort(),
};
const manifestPath = join(root, "dist", `craft-marketplace-${version}.manifest.json`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

if (process.platform === "win32") {
  const listPath = join(root, "dist", `craft-marketplace-${version}.files.txt`);
  writeFileSync(listPath, `${manifest.files.join("\r\n")}\r\n`, "utf8");
  execFileSync("tar", ["-a", "-c", "-f", archive, "-T", listPath], { cwd: root, stdio: "pipe" });
  rmSync(listPath, { force: true });
} else {
  execFileSync("zip", ["-q", "-9", archive, ...manifest.files], { cwd: root, stdio: "pipe" });
}
writeFileSync(join(root, "dist", "latest.txt"), `${version}\n`, "utf8");
process.stdout.write(`Packed craft-marketplace ${version}: ${manifest.files.length} file(s) -> ${archive}\n`);
