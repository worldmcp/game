// Durable key/value store for the sandbox server. Implements the same
// storage interface the adapter uses (get/set). Writes are debounced and
// atomic (tmp file + rename) so a crash never leaves a half-written file.
// Production replaces this with Pludor's databases; nothing here is the
// system of record for real users.

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export class FileStore {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'state.json');
    this.map = new Map();
    if (existsSync(this.file)) {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const [k, v] of Object.entries(data)) this.map.set(k, v);
    }
    this.timer = null;
  }

  get(key) {
    return this.map.has(key) ? structuredClone(this.map.get(key)) : null;
  }

  set(key, value) {
    this.map.set(key, structuredClone(value));
    this._schedule();
  }

  delete(key) {
    this.map.delete(key);
    this._schedule();
  }

  keys(prefix = '') {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }

  onExternalChange() {}

  _schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.map)));
    renameSync(tmp, this.file);
  }
}

export class AuditLog {
  constructor(dir) {
    this.file = join(dir, 'audit.log');
    this.recent = existsSync(this.file)
      ? readFileSync(this.file, 'utf8').trim().split('\n').filter(Boolean).slice(-500).map((l) => JSON.parse(l))
      : [];
  }

  write(entry) {
    const line = { ts: new Date().toISOString(), ...entry };
    this.recent.push(line);
    if (this.recent.length > 500) this.recent.shift();
    appendFileSync(this.file, `${JSON.stringify(line)}\n`);
  }
}
