import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sourceProvenance } from "./source-provenance.mjs";

const OWNED = ["plugin.json", "mcp.json", "dist", "hooks", "assets", ".mcp.json", ".codex-plugin", ".claude-plugin", "README.md", "scripts"];
function treeDigest(root) {
  const files = [];
  const walk = (directory, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), relative = prefix ? `${prefix}/${name}` : name, stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Component publication refuses symbolic links");
      if (stat.isDirectory()) walk(path, relative);
      else if (stat.isFile()) files.push([relative, stat.mode & 0o777, createHash("sha256").update(readFileSync(path)).digest("hex")]);
      else throw new Error("Component publication requires regular files");
    }
  };
  walk(root);
  return `sha256:${createHash("sha256").update(JSON.stringify(files)).digest("hex")}`;
}
const parts = version => {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("Component version must be a semantic release version");
  return version.split(".").map(Number);
};
function newer(next, previous) {
  const n = parts(next), p = parts(previous);
  for (let i = 0; i < 3; i++) if (n[i] !== p[i]) return n[i] > p[i];
  return false;
}

/** Publish one component without changing any other component or its version. */
export function syncComponent(sourceRepo, marketplaceRoot, component, apply = false) {
  sourceRepo = resolve(sourceRepo); marketplaceRoot = resolve(marketplaceRoot);
  const contract = JSON.parse(readFileSync(join(sourceRepo, "distribution-contract.json"), "utf8"));
  const product = contract.products.find(product => product.name === component);
  if (!product || !/^craft-[a-z][a-z-]*$/u.test(component)) throw new Error("Component is not an exported release product");
  const source = join(sourceRepo, "plugins", component), target = join(marketplaceRoot, "plugins", component);
  const codex = JSON.parse(readFileSync(join(source, ".codex-plugin", "plugin.json"), "utf8"));
  const claude = JSON.parse(readFileSync(join(source, ".claude-plugin", "plugin.json"), "utf8"));
  if (codex.name !== component || claude.name !== component || codex.version !== claude.version
    || codex.version !== (product.version ?? contract.version)) throw new Error("Component Host manifests or version contract disagree");
  parts(codex.version); treeDigest(source);
  mkdirSync(join(marketplaceRoot, "plugins"), { recursive: true });
  const temporary = mkdtempSync(join(marketplaceRoot, "plugins", ".component-release-"));
  const staged = join(temporary, component), previous = join(temporary, "previous");
  let moved = false, installed = false;
  try {
    if (existsSync(target)) { treeDigest(target); cpSync(target, staged, { recursive: true }); }
    else mkdirSync(staged);
    for (const owned of OWNED) {
      const from = join(source, owned), to = join(staged, owned);
      // Datasec's optional OpenCode adapter is maintained by this marketplace.
      const extra = component === "craft-datasec" && owned === "dist" && existsSync(join(to, "opencode.mjs")) ? readFileSync(join(to, "opencode.mjs")) : undefined;
      rmSync(to, { recursive: true, force: true });
      if (existsSync(from)) cpSync(from, to, { recursive: true });
      if (extra && !existsSync(join(to, "opencode.mjs"))) { mkdirSync(to, { recursive: true }); writeFileSync(join(to, "opencode.mjs"), extra); }
    }
    const digest = treeDigest(staged), oldDigest = existsSync(target) ? treeDigest(target) : null;
    if (oldDigest !== null && oldDigest !== digest) {
      const oldManifest = JSON.parse(readFileSync(join(target, ".codex-plugin", "plugin.json"), "utf8"));
      if (!newer(codex.version, oldManifest.version)) throw new Error("Changed component bytes require a new independent version");
    }
    const buildFile = existsSync(join(source, "dist", "plugin", "build-inputs.json"))
      ? join(source, "dist", "plugin", "build-inputs.json") : join(source, "dist", "build-inputs.json");
    if (!existsSync(buildFile)) throw new Error("Component build input metadata is required");
    const buildInputs = JSON.parse(readFileSync(buildFile, "utf8"));
    if (buildInputs.schema !== "craft.component-build-inputs.v1" || buildInputs.component !== component || buildInputs.version !== codex.version
      || !Array.isArray(buildInputs.artifacts) || buildInputs.artifacts.length === 0) throw new Error("Component build input metadata disagrees with release");
    for (const artifact of buildInputs.artifacts) {
      if (!/^[A-Za-z0-9._-]+$/u.test(artifact.file) || artifact.digest !== `sha256:${createHash("sha256").update(readFileSync(join(dirname(buildFile), artifact.file))).digest("hex")}`) throw new Error("Component executable digest mismatch");
    }
    const release = { version: codex.version, payload_digest: digest,
      ...sourceProvenance(sourceRepo, codex.version), build_inputs: buildInputs };
    if (apply) {
      const releasePath = join(marketplaceRoot, "release.json");
      const manifest = JSON.parse(readFileSync(releasePath, "utf8"));
      const prepared = join(temporary, "release.json");
      writeFileSync(prepared, JSON.stringify({ ...manifest, component_releases: { ...manifest.component_releases, [component]: release } }, null, 2) + "\n");
      if (existsSync(target)) { renameSync(target, previous); moved = true; }
      renameSync(staged, target); installed = true;
      renameSync(prepared, releasePath);
    }
    return { component, ...release, changed: oldDigest !== digest, applied: apply };
  } catch (error) {
    if (installed) rmSync(target, { recursive: true, force: true });
    if (moved) renameSync(previous, target);
    throw error;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3 || args.slice(2).some(arg => arg !== "--apply")) throw new Error("Usage: sync-component.mjs <craft-source-repo> <component> [--apply]");
  console.log(JSON.stringify(syncComponent(args[0], process.cwd(), args[1], args.includes("--apply"))));
}
