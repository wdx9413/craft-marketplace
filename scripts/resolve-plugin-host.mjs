import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Resolve one plugin against the configured Host priority.
 *
 * A plugin may ship several Host manifests. Installing it more than once would
 * double-register hooks and MCP servers, so the first manifest available in the
 * declared order wins. The result is a resolution record, not an install: the
 * Host CLI still performs the actual installation.
 */
export function loadCatalog(root = process.cwd()) {
  const priority = JSON.parse(readFileSync(join(root, "catalog", "host-priority.json"), "utf8"));
  const recommended = JSON.parse(readFileSync(join(root, "catalog", "recommended-plugins.json"), "utf8"));
  if (priority.schema !== "craft.plugin-host-priority.v1") throw new Error("Invalid host priority schema");
  if (recommended.schema !== "craft.recommended-plugins.v1") throw new Error("Invalid recommended plugin schema");
  if (!Array.isArray(priority.hosts) || priority.hosts.length === 0) throw new Error("Host priority must not be empty");
  if (new Set(priority.hosts).size !== priority.hosts.length) throw new Error("Host priority contains duplicate hosts");
  return { priority, recommended };
}

export function resolvePluginHost(plugin, { root = process.cwd(), priority = loadCatalog(root).priority } = {}) {
  const name = typeof plugin?.name === "string" ? plugin.name : "";
  if (!name) throw new Error("Plugin name is required");
  const declared = Array.isArray(plugin.hosts) ? plugin.hosts : [];
  const source = typeof plugin.source === "string" ? plugin.source : "";
  const localSource = source.startsWith("./") ? resolve(root, source) : null;
  const candidates = [];
  for (const host of priority.hosts) {
    const manifestPath = priority.manifest_paths?.[host];
    if (!manifestPath) continue;
    const available = localSource ? existsSync(join(localSource, manifestPath)) && declared.includes(host) : declared.includes(host);
    candidates.push({ host, manifest_path: manifestPath, available, install_command: priority.install_commands?.[host] ?? null });
  }
  const selected = candidates.find(candidate => candidate.available) ?? null;
  return {
    name,
    selected_host: selected?.host ?? null,
    install_command: selected ? selected.install_command.replace("<name>", name) : null,
    resolution: selected ? "single_manifest" : "no_available_host",
    candidates,
  };
}

export function resolveRecommended({ root = process.cwd(), catalog = loadCatalog(root) } = {}) {
  const plugins = [
    ...catalog.recommended.bundled,
    ...catalog.recommended.craft_optional_source_plugins,
    ...catalog.recommended.industry,
  ];
  return {
    host_priority: catalog.priority.hosts,
    plugins: plugins.map(plugin => ({ ...plugin, ...resolvePluginHost(plugin, { root, priority: catalog.priority }) })),
  };
}
