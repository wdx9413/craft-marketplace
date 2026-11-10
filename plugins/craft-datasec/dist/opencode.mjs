// capability/craft-datasec/opencode.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// capability/craft-datasec/rules.ts
var DEFAULT_RULES = [
  { name: "phone", pattern: String.raw`(?<!\d)(?:\+?86[ -]?)?1[3-9](?:[ -]?\d){9}(?!\d)` },
  { name: "identity", pattern: String.raw`(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)` },
  { name: "email", pattern: String.raw`[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}`, flags: "i" },
  { name: "ipv4", pattern: String.raw`(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?![\d.])` },
  { name: "bank", pattern: String.raw`(?<!\d)(?:62|4|5[1-5])\d{14,17}(?!\d)` },
  { name: "api_key", pattern: String.raw`\b(?:api[_-]?(?:key|secret)|access[_-]?token|secret[_-]?key|authorization)\b["']?\s*[:=]\s*["']?(?:Bearer\s+)?([A-Z0-9_./+=~-]{8,})`, flags: "i", group: 1 },
  { name: "password", pattern: String.raw`\b(?:password|passwd|pwd)\b["']?\s*[:=]\s*["']?([^\s"'\x60,;}{]{4,})`, flags: "i", group: 1 },
  { name: "jwt", pattern: String.raw`\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` },
  { name: "private_key", pattern: String.raw`-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----` },
  { name: "chinese_name", pattern: String.raw`姓名["'\s:：]+([\p{Script=Han}]{2,4})`, flags: "u", group: 1, enabled: false }
];
var Sanitizer = class {
  rules;
  token;
  count = 0;
  constructor(rules, token) {
    this.token = token;
    this.rules = rules.filter((rule) => rule.enabled !== false).map((rule) => {
      const group = rule.group ?? 0;
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(rule.name) || !rule.pattern || !Number.isInteger(group) || group < 0) throw new Error("Invalid rule");
      return { name: rule.name, regex: new RegExp(rule.pattern, [...new Set(`gd${rule.flags ?? ""}`)].join("")), group };
    });
    if (!this.rules.length) throw new Error("No rules enabled");
  }
  text(text) {
    const protectedRanges = [...text.matchAll(/\[CRAFT_DATASEC_[a-z0-9_]+_[a-f0-9]{32}\]/g)].map((match) => [match.index, match.index + match[0].length]);
    const matches = [];
    for (const rule of this.rules) {
      for (const match of text.matchAll(rule.regex)) {
        const range = match.indices[rule.group];
        if (range && range[0] < range[1]) matches.push({ start: range[0], end: range[1], name: rule.name });
      }
    }
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    let end = 0, result = "";
    for (const match of matches) {
      if (match.start < end || protectedRanges.some(([start, stop]) => match.start < stop && match.end > start)) continue;
      result += text.slice(end, match.start) + this.token(match.name, text.slice(match.start, match.end));
      end = match.end;
      this.count++;
    }
    return result + text.slice(end);
  }
  value(value, depth = 0) {
    if (depth > 64) throw new Error("Result nesting exceeds text redaction limit");
    if (typeof value === "string") return this.text(value);
    if (typeof value === "number") {
      const safe = this.text(String(value));
      return safe === String(value) ? value : safe;
    }
    if (Array.isArray(value)) return value.map((item) => this.value(item, depth + 1));
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [this.text(key), this.value(item, depth + 1)]));
    return value;
  }
};

// capability/craft-datasec/vault.ts
import { createHash, createHmac, randomBytes } from "node:crypto";
import { constants, closeSync, fstatSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
var TOKEN = /\[CRAFT_DATASEC_[a-z0-9_]+_[a-f0-9]{32}\]/g;
function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 448 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 63) !== 0 || stat.uid !== process.getuid()) throw new Error("Unsafe vault directory");
}
function openPrivate(path, flags = constants.O_RDONLY) {
  const fd = openSync(path, flags | constants.O_NOFOLLOW, 384);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 63) !== 0 || stat.uid !== process.getuid()) throw new Error("Unsafe vault file");
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}
function readPrivate(path) {
  const fd = openPrivate(path);
  try {
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
function publish(directory, name, value) {
  const temp = mkdtempSync(join(directory, ".write-"));
  try {
    const source = join(temp, "record");
    writeFileSync(source, value, { mode: 384 });
    try {
      linkSync(source, join(directory, name));
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
var TokenVault = class {
  directory;
  key;
  database;
  cache = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  closed = false;
  constructor(root, session) {
    if (!session) throw new Error("Missing session identity");
    privateDirectory(root);
    this.directory = join(root, createHash("sha256").update(session).digest("hex"));
    privateDirectory(this.directory);
    publish(this.directory, "key", randomBytes(32));
    this.key = readPrivate(join(this.directory, "key"));
    if (this.key.length !== 32) throw new Error("Invalid vault key");
    const file = join(this.directory, "mappings.sqlite");
    closeSync(openPrivate(file, constants.O_CREAT | constants.O_RDWR));
    this.database = new DatabaseSync(file);
    try {
      this.database.exec("PRAGMA busy_timeout=1500; CREATE TABLE IF NOT EXISTS mappings (token TEXT PRIMARY KEY, name TEXT NOT NULL, value TEXT NOT NULL) STRICT;");
    } catch (error) {
      this.database.close();
      throw error;
    }
  }
  token(name, value) {
    const cacheKey = `${name}\0${value}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const digest = createHmac("sha256", this.key).update(`${name}\0${value}`).digest("hex").slice(0, 32);
    const token = `[CRAFT_DATASEC_${name}_${digest}]`;
    this.pending.set(token, { name, value });
    this.cache.set(cacheKey, token);
    return token;
  }
  /** One transaction per hook output, rather than a filesystem write per occurrence. */
  flush() {
    if (!this.pending.size) return;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const insert = this.database.prepare("INSERT OR IGNORE INTO mappings VALUES (?, ?, ?)");
      for (const [token, record] of this.pending) insert.run(token, record.name, record.value);
      this.database.exec("COMMIT");
      this.pending.clear();
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }
  restore(text) {
    const restored = text.replace(TOKEN, (token) => {
      const record = this.pending.get(token) ?? this.database.prepare("SELECT name, value FROM mappings WHERE token = ?").get(token);
      if (!record) throw new Error("Unknown mapping");
      const expected = `[CRAFT_DATASEC_${record.name}_${createHmac("sha256", this.key).update(`${record.name}\0${record.value}`).digest("hex").slice(0, 32)}]`;
      if (expected !== token) throw new Error("Invalid mapping");
      return record.value;
    });
    if (restored.includes("[CRAFT_DATASEC_")) throw new Error("Unknown placeholder");
    return restored;
  }
};

// capability/craft-datasec/opencode.ts
function redactOpenCodePrompt(sessionID, parts, root, rules = DEFAULT_RULES) {
  if (!sessionID) return 0;
  let vault;
  const sanitizer = new Sanitizer(rules, (name, value) => (vault ??= new TokenVault(root, sessionID)).token(name, value));
  try {
    const sanitized = parts.map((part) => part.type === "text" && typeof part.text === "string" ? sanitizer.text(part.text) : part.text);
    if (sanitizer.count) {
      vault.flush();
      for (let index = 0; index < parts.length; index++) {
        if (parts[index].type === "text" && typeof parts[index].text === "string") parts[index].text = sanitized[index];
      }
    }
    return sanitizer.count;
  } finally {
    vault?.close();
  }
}
var CraftDatasec = async () => ({
  "chat.message": async (input, output) => {
    try {
      const rulesPath = process.env.CRAFT_DATASEC_RULES;
      const rules = rulesPath ? JSON.parse(readFileSync2(rulesPath, "utf8")) : DEFAULT_RULES;
      const root = process.env.CRAFT_DATASEC_DIR ?? join2(homedir(), ".craft-datasec");
      redactOpenCodePrompt(input.sessionID ?? "", output.parts, root, rules);
    } catch {
    }
  }
});
export {
  CraftDatasec,
  redactOpenCodePrompt
};
