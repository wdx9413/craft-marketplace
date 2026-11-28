import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export class FileStore {
  constructor(root) {
    this.file = resolve(root, "self-evolution-store.json");
    mkdirSync(dirname(this.file), { recursive: true });
    this.rows = {};
    try { this.rows = JSON.parse(readFileSync(this.file, "utf8")); } catch { this.rows = {}; }
  }
  key(kind, id) { return `${kind}:${id}`; }
  find(kind, id) { return this.rows[this.key(kind, id)] ?? null; }
  create(kind, id, payload) {
    if (this.find(kind, id)) throw new Error(`${kind} already exists: ${id}`);
    return this.save(kind, id, payload);
  }
  save(kind, id, payload) {
    const row = { ...payload, id };
    this.rows[this.key(kind, id)] = row;
    const temp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(this.rows, null, 2));
    renameSync(temp, this.file);
    return row;
  }
  list(kind, limit = 20, predicate) {
    return Object.entries(this.rows)
      .filter(([key]) => key.startsWith(`${kind}:`))
      .map(([, value]) => value)
      .filter((value) => !predicate || predicate(value))
      .slice(0, limit);
  }
}
