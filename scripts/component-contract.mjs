// Source-owned paths copied from Craft and marketplace-owned files preserved on top.
export const COMPONENT_OWNED_PATHS = Object.freeze([
  "plugin.json", "mcp.json", "dist", "hooks", "assets", ".mcp.json", ".codex-plugin", ".claude-plugin", "README.md", "scripts",
]);
export const MARKETPLACE_OWNED_PATHS = Object.freeze({
  "craft-datasec": Object.freeze(["dist/opencode.mjs"]),
});
export const isGeneratedCacheEntry = (name) => name === "__pycache__" || name.endsWith(".pyc") || name.endsWith(".pyo");
