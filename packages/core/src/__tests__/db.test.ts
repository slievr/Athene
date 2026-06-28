import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openDb, closeDb } from "../db.js";

describe("openDb", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "athene-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("creates database file and applies schema", () => {
    const db = openDb(join(dir, "athene.db"));
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("sessions");
    expect(names).toContain("session_kv");
    closeDb(db);
  });

  it("is idempotent — opening twice does not fail", () => {
    const db1 = openDb(join(dir, "athene.db"));
    closeDb(db1);
    const db2 = openDb(join(dir, "athene.db"));
    closeDb(db2);
  });
});
