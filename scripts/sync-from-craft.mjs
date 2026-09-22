import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Syncs this marketplace's plugin payloads from the craft source repository.
 *
 * Why a script and not a copy command: the marketplace is a **published** surface, and it had
 * drifted from the source that produces it in two ways that nothing was checking.
 *
 *  1. **The payloads were stale.** Every `dist/plugin/craft-mcp.cjs` here differed from the one a
 *     fresh build produces. A Host installing from the marketplace therefore ran code that the
 *     source no longer contained, and no diff in either repository said so.
 *  2. **A component had been renamed in the source and not here.** `craft-workflow-evolution`
 *     became `craft-experience` in `craft/plugins/`, so the marketplace was publishing a name the
 *     source had stopped using — including in `release.json`, whose own note says a stale field
 *     "is exactly the kind of silent disagreement this file exists to prevent".
 *
 * ### The marketplace owns one thing the source does not
 *
 * Each component here carries a `.claude-plugin/plugin.json`, which `craft/plugins/` has no
 * counterpart for. So this is **not** a mirror: it copies the files the source owns and leaves the
 * Claude manifest in place, updating only its `name`. A blind mirror would delete it, and the
 * Claude marketplace entry would then point at a plugin with no Claude manifest.
 *
 * ### What it refuses to do
 *
 *  - It fails if a component is missing on either side, rather than skipping it — a plugin that
 *    silently stops being published is worse than a failing sync.
 *  - It fails if a copied file lands empty or gains U+FFFD, because both have happened here before
 *    through the wrong `Set-Content`/`-Encoding` and a 2 MB bundle of mojibake is not obvious.
 *  - It reports every changed file, so the commit that follows is reviewable.
 */
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const unsupported = args.filter((arg) => arg.startsWith("--") && arg !== "--apply" && arg !== "--check");
if (unsupported.length) throw new Error(`unsupported argument(s): ${unsupported.join(", ")}`);
const sourceArgument = args.find((arg) => !arg.startsWith("--"));
const sourceRoot = sourceArgument ?? join("..", "craft", "plugins");
const marketplaceRoot = process.cwd();
const sourceRepo = resolve(sourceRoot, "..");
const contractPath = join(sourceRepo, "distribution-contract.json");
if (!existsSync(contractPath)) throw new Error(`Craft distribution contract is missing: ${contractPath}`);
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
if (!/^\d+\.\d+\.\d+$/u.test(String(contract.version)) || !Array.isArray(contract.products)) throw new Error("Craft distribution contract is invalid");

/**
 * Craft source keeps its complete internal/plugin catalog.  This marketplace is deliberately
 * narrower: only the three standalone cognitive products are externally installable here.
 * Adding a source component therefore never expands the public marketplace by accident.
 */
const EXPORTED_COMPONENTS = contract.products.map((product) => String(product?.name)).sort();
if (EXPORTED_COMPONENTS.join(",") !== "craft-experience,craft-knowledge,craft-memory") throw new Error("External marketplace contract must contain exactly Knowledge, Memory, and Experience");
/**
 * Marketplace directories that no longer correspond to a component in the source, and where their
 * marketplace-owned files belong now.
 *
 * An earlier version of this script mapped *source* names to new ones, which assumed the source still
 * used the old name — it does not, so nothing fired and the stale directory survived. A later version
 * simply removed the obsolete directory, which **deleted that component's Claude manifest** and
 * dropped it out of `claude_components` — the exact failure this file's own comment warned about.
 * So the mapping's job is to carry `.claude-plugin/` across the rename before removing anything.
 */
const RENAMED = { "craft-workflow-evolution": "craft-experience" };

const availableSourceComponents = readdirSync(sourceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const missingExports = EXPORTED_COMPONENTS.filter((name) => !availableSourceComponents.includes(name));
if (missingExports.length) throw new Error(`Craft source is missing required exported component(s): ${missingExports.join(", ")}`);
const sourceComponents = [...EXPORTED_COMPONENTS].sort();

/**
 * Files the source owns, relative to a component directory. Everything else is left alone.
 *
 * `README.md` is here because it is a payload file the source generates, and leaving it out is how
 * this repository kept a README naming a component the source had already renamed: the file was
 * never refreshed, so no amount of syncing would have corrected it. Only the full `craft` component
 * has one, and the loop skips what is absent.
 */
const OWNED = ["dist", "skills", "hooks", "assets", ".mcp.json", ".codex-plugin", "README.md"];

const sourceRevision = () => {
  const git = (args) => execFileSync("git", ["-C", sourceRepo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const head = git(["rev-parse", "HEAD"]);
  const parents = git(["rev-list", "--parents", "-n", "1", "HEAD"]).split(/\s+/u).slice(1);
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]).length > 0;
  return {
    source_commit: head,
    source_state: dirty ? "dirty" : "committed",
    source_note: `v${contract.version} payloads were built from ${head}`
      + (parents.length > 1 ? `, a merge of ${parents.join(" and ")}` : "")
      + "; source_commit names that revision. The plugin payloads under plugins/ are copies of that revision's build output.",
  };
};

const sameFile = (left, right) => existsSync(right)
  && statSync(left).isFile() && statSync(right).isFile()
  && Buffer.compare(readFileSync(left), readFileSync(right)) === 0;

const sameTree = (left, right) => {
  if (!existsSync(right)) return false;
  const leftInfo = statSync(left); const rightInfo = statSync(right);
  if (leftInfo.isFile() || rightInfo.isFile()) return leftInfo.isFile() && rightInfo.isFile() && sameFile(left, right);
  const leftEntries = readdirSync(left).sort(); const rightEntries = readdirSync(right).sort();
  return leftEntries.length === rightEntries.length
    && leftEntries.every((entry, index) => entry === rightEntries[index] && sameTree(join(left, entry), join(right, entry)));
};

const verifyMarketplace = () => {
  for (const component of sourceComponents) {
    const from = join(sourceRoot, component); const to = join(marketplaceRoot, "plugins", component);
    for (const owned of OWNED) {
      const source = join(from, owned);
      if (existsSync(source) && !sameTree(source, join(to, owned))) throw new Error(`marketplace payload drift: plugins/${component}/${owned}`);
    }
    const claude = join(to, ".claude-plugin", "plugin.json");
    if (!existsSync(claude)) throw new Error(`missing Claude manifest for ${component}`);
    const manifest = JSON.parse(readFileSync(claude, "utf8"));
    if (manifest.name !== component || manifest.version !== contract.version) throw new Error(`Claude manifest drift for ${component}`);
  }
  const published = readdirSync(join(marketplaceRoot, "plugins"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (JSON.stringify(published) !== JSON.stringify(sourceComponents)) throw new Error("marketplace product set differs from distribution contract");
  const release = JSON.parse(readFileSync(join(marketplaceRoot, "release.json"), "utf8"));
  const revision = sourceRevision();
  if (release.version !== contract.version
    || JSON.stringify(release.components) !== JSON.stringify(sourceComponents)
    || JSON.stringify(release.claude_components) !== JSON.stringify(sourceComponents)
    || release.source_commit !== revision.source_commit
    || release.source_state !== revision.source_state
    || release.source_note !== revision.source_note) throw new Error("release.json differs from the source distribution contract");
};

if (!apply) {
  verifyMarketplace();
  console.log(`Verified ${sourceComponents.length} component(s) against ${sourceRoot}; no files changed. Re-run with --apply to synchronize.`);
  process.exit(0);
}

const report = [];
for (const [oldName, newName] of Object.entries(RENAMED)) {
  const stale = join(marketplaceRoot, "plugins", oldName);
  if (!existsSync(stale)) continue;
  const claude = join(stale, ".claude-plugin");
  if (existsSync(claude)) {
    const target = join(marketplaceRoot, "plugins", newName, ".claude-plugin");
    mkdirSync(target, { recursive: true });
    cpSync(claude, target, { recursive: true, force: true });
    report.push(`carried  plugins/${oldName}/.claude-plugin -> plugins/${newName}/.claude-plugin`);
  }
  rmSync(stale, { recursive: true, force: true });
  report.push(`removed  plugins/${oldName} (renamed to ${newName} in the source)`);
}

const sync = (component) => {
  const from = join(sourceRoot, component);
  const to = join(marketplaceRoot, "plugins", component);
  for (const owned of OWNED) {
    const source = join(from, owned);
    if (!existsSync(source)) continue;
    const target = join(to, owned);
    mkdirSync(to, { recursive: true });
    cpSync(source, target, { recursive: true, force: true });
    report.push(`synced   plugins/${component}/${owned}`);
  }
  // The Claude manifest is this repository's own; identity and release version are contract-bound.
  const claude = join(to, ".claude-plugin", "plugin.json");
  if (existsSync(claude)) {
    const manifest = JSON.parse(readFileSync(claude, "utf8"));
    if (manifest.name !== component || manifest.version !== contract.version) {
      manifest.name = component;
      manifest.version = contract.version;
      writeFileSync(claude, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      report.push(`renamed  plugins/${component}/.claude-plugin/plugin.json name -> ${component}`);
    }
  }
};

for (const component of sourceComponents) sync(component);

// This distribution must contain exactly the explicitly exported components.  The source can
// retain additional private/internal products without leaking them into either marketplace.
const published = readdirSync(join(marketplaceRoot, "plugins"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expected = [...sourceComponents].sort();
const extra = published.filter((name) => !expected.includes(name));
for (const name of extra) {
  rmSync(join(marketplaceRoot, "plugins", name), { recursive: true, force: true });
  report.push(`removed  plugins/${name} (not an external marketplace product)`);
}

// Every copied file must be non-empty and free of replacement characters.
let checked = 0;
for (const component of expected) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (statSync(full).size === 0) throw new Error(`${full} is empty`);
      checked += 1;
      if (!/\.(?:cjs|js|json|md|svg)$/u.test(entry.name)) continue;
      if (readFileSync(full, "utf8").includes("\uFFFD")) throw new Error(`${full} contains U+FFFD`);
    }
  };
  walk(join(marketplaceRoot, "plugins", component));
}

// `release.json` names the components, so a rename that stops here would leave the manifest
// describing a component set that no longer exists.
const releasePath = join(marketplaceRoot, "release.json");
const release = JSON.parse(readFileSync(releasePath, "utf8"));
release.components = expected;
release.claude_components = expected.filter((name) => existsSync(join(marketplaceRoot, "plugins", name, ".claude-plugin")));
release.version = contract.version;

/**
 * The revision these payloads were built from.
 *
 * This field was maintained by hand, and it went stale the moment the release became a merge:
 * `plugins/` here held a fresh build of the merge commit while `source_commit` still named the
 * branch tip the payloads had been built from before it. A note in this file calls a stale field
 * "exactly the kind of silent disagreement this file exists to prevent", so the revision is read
 * from git at sync time, and `source_state` says whether that tree was clean.
 */
try {
  const revision = sourceRevision();
  release.source_commit = revision.source_commit;
  release.source_state = revision.source_state;
  release.source_note = revision.source_note;
  report.push(`updated  release.json source_commit -> ${revision.source_commit.slice(0, 12)} (${release.source_state})`);
} catch (error) {
  const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
  report.push(`kept     release.json source_commit (git unavailable: ${message})`);
}

writeFileSync(releasePath, `${JSON.stringify(release, null, 2)}\n`, "utf8");
report.push(`updated  release.json components -> ${expected.join(", ")}`);
verifyMarketplace();

for (const line of report) console.log(`OK   ${line}`);
console.log(`Synced ${expected.length} component(s) from ${sourceRoot}; ${checked} file(s) checked for emptiness and U+FFFD.`);
