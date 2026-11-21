import { createHash } from "node:crypto";
import { closeSync, constants, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { sourceProvenance } from "./source-provenance.mjs";
import { COMPONENT_OWNED_PATHS, isGeneratedCacheEntry, MARKETPLACE_OWNED_PATHS } from "./component-contract.mjs";

function fileDigest(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }

function treeDigest(root, selectedPaths) {
  const files = [];
  const walk = (directory, prefix = "") => {
    for (const name of readdirSync(directory).filter(name => !isGeneratedCacheEntry(name)).sort()) {
      const path = join(directory, name), relative = prefix ? `${prefix}/${name}` : name, stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Component publication refuses symbolic links");
      if (stat.isDirectory()) walk(path, relative);
      else if (stat.isFile()) files.push([relative, stat.mode & 0o111 ? "executable" : "regular", fileDigest(path)]);
      else throw new Error("Component publication requires regular files");
    }
  };
  if (selectedPaths) {
    for (const item of selectedPaths) {
      const path = join(root, item);
      if (!existsSync(path)) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Component publication refuses symbolic links");
      if (stat.isDirectory()) walk(path, item.split(sep).join("/"));
      else if (stat.isFile()) files.push([item.split(sep).join("/"), stat.mode & 0o111 ? "executable" : "regular", fileDigest(path)]);
      else throw new Error("Component publication requires regular files");
    }
  } else walk(root);
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

function componentCommits(sourceRepo, contract) {
  return Object.fromEntries(contract.products.map(product => {
    const component = String(product.name);
    const commit = execFileSync("git", ["-C", sourceRepo, "log", "-1", "--format=%H", "--", `plugins/${component}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error(`Source commit is unavailable for plugins/${component}`);
    return [component, commit];
  }));
}

/** Publish one component while preserving marketplace-owned files and release metadata. */
export function syncComponent(sourceRepo, marketplaceRoot, component, apply = false) {
  sourceRepo = resolve(sourceRepo); marketplaceRoot = resolve(marketplaceRoot);
  if (sourceRepo === marketplaceRoot) throw new Error("Marketplace root must not be the Craft source repository");
  const releasePath = join(marketplaceRoot, "release.json");
  if (!existsSync(releasePath)) throw new Error("Marketplace root must contain release.json");
  const contract = JSON.parse(readFileSync(join(sourceRepo, "distribution-contract.json"), "utf8"));
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(String(contract.version)) || !Array.isArray(contract.products)) throw new Error("Craft distribution contract is invalid");
  const product = contract.products.find(item => item.name === component);
  if (!product || !/^craft-[a-z][a-z-]*$/u.test(component)) throw new Error("Component is not an exported release product");
  const source = join(sourceRepo, "plugins", component), target = join(marketplaceRoot, "plugins", component);
  const codex = JSON.parse(readFileSync(join(source, ".codex-plugin", "plugin.json"), "utf8"));
  const claude = JSON.parse(readFileSync(join(source, ".claude-plugin", "plugin.json"), "utf8"));
  if (codex.name !== component || claude.name !== component || codex.version !== claude.version
    || codex.version !== (product.version ?? contract.version)) throw new Error("Component Host manifests or version contract disagree");
  parts(codex.version);
  const payloadDigest = treeDigest(source, COMPONENT_OWNED_PATHS);
  const buildFile = existsSync(join(source, "dist", "plugin", "build-inputs.json"))
    ? join(source, "dist", "plugin", "build-inputs.json") : join(source, "dist", "build-inputs.json");
  if (!existsSync(buildFile)) throw new Error("Component build input metadata is required");
  const buildInputs = JSON.parse(readFileSync(buildFile, "utf8"));
  if (buildInputs.schema !== "craft.component-build-inputs.v1" || buildInputs.component !== component || buildInputs.version !== codex.version
    || !Array.isArray(buildInputs.artifacts) || buildInputs.artifacts.length === 0) throw new Error("Component build input metadata disagrees with release");
  for (const artifact of buildInputs.artifacts) {
    if (typeof artifact.file !== "string" || artifact.file === "." || artifact.file === ".." || !/^[A-Za-z0-9._-]+$/u.test(artifact.file)) throw new Error("Component executable path is invalid");
    const artifactPath = join(dirname(buildFile), artifact.file), stat = lstatSync(artifactPath, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || artifact.digest !== `sha256:${fileDigest(artifactPath)}`) throw new Error("Component executable digest mismatch");
  }

  const marketplaceOwned = MARKETPLACE_OWNED_PATHS[component] ?? [];
  const temporary = mkdtempSync(join(marketplaceRoot, ".component-release-"));
  const staged = join(temporary, component), previous = join(temporary, "previous"), preparedRelease = join(temporary, "release.json");
  const lockPath = join(marketplaceRoot, ".component-release.lock");
  let lockFd, moved = false, installed = false, preserveTemporary = false;
  try {
    if (apply) {
      try { lockFd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); }
      catch (error) {
        if ((error instanceof Error) && "code" in error && error.code === "EEXIST") throw new Error("Another component publication is active; inspect .component-release.lock before retrying");
        throw error;
      }
      writeFileSync(lockFd, `${process.pid}\n`, "utf8");
    }
    const oldDigest = existsSync(target) ? treeDigest(target) : null;
    const preserved = new Map(marketplaceOwned.filter(path => !existsSync(join(source, path)) && existsSync(join(target, path))).map(path => [path, readFileSync(join(target, path))]));
    if (existsSync(target)) cpSync(target, staged, { recursive: true });
    else mkdirSync(staged);
    for (const owned of COMPONENT_OWNED_PATHS) {
      const from = join(source, owned), to = join(staged, owned);
      rmSync(to, { recursive: true, force: true });
      if (existsSync(from)) cpSync(from, to, { recursive: true, filter: path => !path.split(sep).some(isGeneratedCacheEntry) });
    }
    for (const [path, bytes] of preserved) {
      const targetPath = join(staged, path);
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, bytes);
    }
    const nextDigest = treeDigest(staged);
    if (oldDigest !== null && oldDigest !== nextDigest) {
      const oldManifest = JSON.parse(readFileSync(join(target, ".codex-plugin", "plugin.json"), "utf8"));
      if (!newer(codex.version, oldManifest.version)) throw new Error("Changed component bytes require a new independent version");
    }
    const release = { version: codex.version, payload_digest: payloadDigest,
      ...sourceProvenance(sourceRepo, codex.version), build_inputs: buildInputs };
    if (apply) {
      const manifest = JSON.parse(readFileSync(releasePath, "utf8"));
      const componentReleases = { ...manifest.component_releases, [component]: release };
      const componentSourceCommits = { ...manifest.component_source_commits, [component]: componentCommits(sourceRepo, contract)[component] };
      const nextManifest = { ...manifest, ...sourceProvenance(sourceRepo, contract.version), component_releases: componentReleases,
        component_source_commits: componentSourceCommits };
      writeFileSync(preparedRelease, JSON.stringify(nextManifest, null, 2) + "\n");
      if (existsSync(target)) { renameSync(target, previous); moved = true; }
      renameSync(staged, target); installed = true;
      renameSync(preparedRelease, releasePath);
    }
    return { component, ...release, changed: oldDigest !== nextDigest, applied: apply };
  } catch (error) {
    let rollbackError;
    try { if (installed) rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (failure) { rollbackError = failure; }
    try { if (moved && !existsSync(target)) renameSync(previous, target); }
    catch (failure) { rollbackError ??= failure; }
    if (rollbackError) {
      preserveTemporary = true;
      throw new Error(`Component publication failed and rollback was incomplete; recovery files were kept at ${temporary}: ${String(rollbackError)}`, { cause: error });
    }
    throw error;
  } finally {
    if (lockFd !== undefined) { closeSync(lockFd); rmSync(lockPath, { force: true }); }
    if (!preserveTemporary) rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3 || args.slice(2).some(arg => arg !== "--apply")) throw new Error("Usage: node scripts/sync-component.mjs <craft-source-repo> <component> [--apply]; marketplace root is the current directory");
  console.log(JSON.stringify(syncComponent(args[0], process.cwd(), args[1], args.includes("--apply"))));
}
