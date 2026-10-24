import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

/** Snapshot Git-visible source, including new files; generated/ignored data is not source. */
export function sourceProvenance(sourceRepo, version, archivedCommit) {
  const git = (args) => execFileSync("git", ["-C", sourceRepo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (archivedCommit !== undefined && !/^[a-f0-9]{40}$/u.test(archivedCommit)) throw new Error("archived source commit must be a full Git SHA");
  const head = archivedCommit ?? git(["rev-parse", "HEAD"]).trim();
  const dirty = archivedCommit === undefined && git(["status", "--porcelain", "--untracked-files=all"]).trim().length > 0;
  const paths = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))].sort();
  const snapshot = paths.map((path) => {
    const absolute = join(sourceRepo, path);
    const stat = lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) return { path, state: "missing" };
    // Hash links themselves, never read a linked path outside the repository.
    const bytes = stat.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
    return { path, mode: stat.mode & 0o777, type: stat.isSymbolicLink() ? "symlink" : "file", digest: createHash("sha256").update(bytes).digest("hex") };
  });
  const digest = `sha256:${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")}`;
  return {
    source_commit: head,
    source_state: dirty ? "dirty" : "committed",
    source_tree_digest: digest,
    source_note: archivedCommit
      ? `v${version} payloads were synchronized from a remote source archive pinned to ${head}; Git-visible source snapshot ${digest}. The commit was verified against the remote branch before download; this snapshot does not attest the build process.`
      : `v${version} payloads were synchronized from ${dirty ? "a dirty working tree based on" : "a clean checkout of"} ${head}; Git-visible source snapshot ${digest}. source_commit identifies HEAD, not dirty source contents; this snapshot does not attest the build process.`,
  };
}
