// bin/craft-datasec-hook.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// capability/craft-datasec/hook.ts
import { extname } from "node:path";

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
      const value = text.slice(match.start, match.end);
      if (match.name === "email" && !/^[^@]+@[^@]+$/.test(value)) throw new Error("Invalid email rule match");
      const replacement = match.name === "email" ? `${value[0]}*@${value.slice(value.indexOf("@") + 1)}` : this.token(match.name, value);
      result += text.slice(end, match.start) + replacement;
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

// capability/craft-datasec/hook.ts
var FAILURE = "craft-datasec\uFF1A\u672C\u5730\u8131\u654F\u5931\u8D25\uFF0C\u5185\u5BB9\u5DF2\u9690\u85CF\u3002\u8BF7\u68C0\u67E5\u672C\u5730\u89C4\u5219\u548C\u79C1\u6709\u6620\u5C04\u76EE\u5F55\u3002";
var BINARY = /\.(?:xls[xmb]?|xlt[xm]|pdf|png|jpe?g|gif|webp|bmp|svg|ico|zip|gz|tar|7z|docx?|pptx?|mp[34]|wav)$/i;
var EDIT = /^(?:Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/;
function denied(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}
function hidden(host2, reason, replacement) {
  if (host2 === "claude") return { systemMessage: reason, hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: replacement } };
  return { decision: "block", reason: JSON.stringify(replacement), systemMessage: reason };
}
function blank(value, depth = 0) {
  if (depth > 64) return null;
  if (typeof value === "string") return ["text", "image", "base64", "file", "resource", "tool_result"].includes(value) ? value : "";
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) return value.map((item) => blank(item, depth + 1));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item], index) => [/^[A-Za-z_$][\w$-]*$/.test(key) ? key : `hidden_${index}`, blank(item, depth + 1)]));
  return value;
}
function restore(value, vault) {
  if (typeof value === "string") return vault.restore(value);
  if (Array.isArray(value)) return value.map((item) => restore(item, vault));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [vault.restore(key), restore(item, vault)]));
  return value;
}
function handleHook(host2, event2, input, root, rules = DEFAULT_RULES) {
  let vault;
  const getVault = () => vault ??= new TokenVault(root, input.session_id ?? "");
  const apply = () => {
    if (input.hook_event_name !== event2) throw new Error("Mismatched hook event");
    if (event2 === "UserPromptSubmit") return {};
    const sanitizer = new Sanitizer(rules, (name, text) => getVault().token(name, text));
    if (event2 === "PreToolUse") {
      const args = input.tool_input ?? {};
      const name = input.tool_name ?? "";
      if (name === "Read" && typeof args === "object" && args !== null && !Array.isArray(args) && typeof args.file_path === "string" && BINARY.test(extname(args.file_path))) {
        return denied("craft-datasec\uFF1A\u6B64\u6587\u4EF6\u4E0D\u662F\u53D7\u652F\u6301\u7684\u7EAF\u6587\u672C\uFF0C\u8BF7\u5148\u5728\u672C\u5730\u5BFC\u51FA\u7EAF\u6587\u672C\u5E76\u8131\u654F\u3002");
      }
      if (!JSON.stringify(args).includes("[CRAFT_DATASEC_")) return {};
      if (!EDIT.test(name)) return denied("craft-datasec\uFF1A\u5360\u4F4D\u7B26\u53EA\u5141\u8BB8\u5728\u672C\u5730\u6587\u4EF6\u7F16\u8F91\u5DE5\u5177\u4E2D\u8FD8\u539F\uFF0C\u4E0D\u80FD\u81EA\u52A8\u7528\u4E8E\u547D\u4EE4\u6216\u8FDC\u7A0B\u8C03\u7528\u3002");
      return { hookSpecificOutput: { hookEventName: event2, permissionDecision: "allow", updatedInput: restore(args, getVault()) } };
    }
    if (input.tool_response === void 0) throw new Error("Missing tool result");
    const safe = sanitizer.value(input.tool_response);
    if (!sanitizer.count) return {};
    vault?.flush();
    return hidden(host2, `craft-datasec\uFF1A\u5DF2\u5728\u672C\u5730\u8131\u654F ${sanitizer.count} \u5904\u5185\u5BB9\u3002`, safe);
  };
  let output;
  try {
    output = apply();
  } catch {
    if (event2 === "PostToolUse") {
      const replacement = input.tool_response ?? null;
      output = { ...hidden(host2, FAILURE, blankResult(replacement)), continue: false, stopReason: FAILURE };
    } else if (event2 === "UserPromptSubmit") {
      output = {};
    } else {
      output = denied(FAILURE);
    }
  }
  vault?.close();
  return output;
}
function blankResult(value) {
  return blank(value);
}

// bin/craft-datasec-hook.ts
var [host, event] = process.argv.slice(2);
if (!["claude", "codex"].includes(host) || !["PreToolUse", "PostToolUse", "UserPromptSubmit"].includes(event)) {
  process.stderr.write("craft-datasec: expected <claude|codex> <PreToolUse|PostToolUse|UserPromptSubmit>\n");
  process.exitCode = 2;
} else {
  let input = {};
  try {
    const raw = readFileSync2(0, "utf8");
    input = JSON.parse(raw);
    if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid event");
    const config = process.env.CRAFT_DATASEC_RULES;
    const rules = config ? JSON.parse(readFileSync2(config, "utf8")) : DEFAULT_RULES;
    const root = process.env.CRAFT_DATASEC_DIR ?? join2(homedir(), ".craft-datasec");
    process.stdout.write(JSON.stringify(handleHook(host, event, input, root, rules)) + "\n");
  } catch {
    const fallback = event === "PostToolUse" ? hidden(host, FAILURE, blankResult(input?.tool_response ?? null)) : handleHook(host, event, {}, "", []);
    process.stdout.write(JSON.stringify(fallback) + "\n");
  }
}
