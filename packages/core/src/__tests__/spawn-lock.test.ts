import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isSpawnLockReapable, releaseSpawnLockIfOwned } from "../session-manager.js";

const dirs: string[] = [];
function lockWith(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ao-spawnlock-"));
  dirs.push(dir);
  const lockPath = join(dir, "spawn.lock");
  writeFileSync(lockPath, content);
  return lockPath;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("isSpawnLockReapable", () => {
  it("does NOT reap a FRESH lock held by a live PID", () => {
    const lockPath = lockWith(String(process.pid));
    expect(isSpawnLockReapable(lockPath, Date.now())).toBe(false);
  });

  it("reaps a PID-bearing lock past the absolute age ceiling even if the PID is alive (PID reuse)", () => {
    // process.pid is alive, but the lock is older than the ceiling — a recycled
    // dead-holder PID must not block spawns forever.
    const lockPath = lockWith(String(process.pid));
    expect(isSpawnLockReapable(lockPath, Date.now() + 6 * 60_000)).toBe(true);
  });

  it("reaps a lock whose recorded PID is dead", () => {
    const lockPath = lockWith("2147483646"); // far beyond any live PID → dead
    expect(isSpawnLockReapable(lockPath)).toBe(true);
  });

  it("does NOT reap a corrupt/no-PID lock while it is fresh", () => {
    const lockPath = lockWith(""); // mid-write / legacy — no parseable PID
    expect(isSpawnLockReapable(lockPath, Date.now())).toBe(false);
  });

  it("reaps a corrupt/no-PID lock only after the absolute age ceiling", () => {
    const lockPath = lockWith("not-a-pid");
    // Fresh: not reapable; past the 5-minute ceiling: reapable.
    expect(isSpawnLockReapable(lockPath, Date.now())).toBe(false);
    expect(isSpawnLockReapable(lockPath, Date.now() + 6 * 60_000)).toBe(true);
  });

  it("treats a missing lock as reapable (vanished between checks)", () => {
    expect(isSpawnLockReapable(join(tmpdir(), "ao-no-such-lock-xyz", "spawn.lock"))).toBe(true);
  });

  it("reaps a pid:nonce-token lock whose pid is dead", () => {
    const lockPath = lockWith("2147483646:abc-0"); // token form, dead pid
    expect(isSpawnLockReapable(lockPath)).toBe(true);
  });
});

describe("releaseSpawnLockIfOwned", () => {
  it("deletes the lock when it still holds our token (normal release)", () => {
    const lockPath = lockWith("12345:mine-0");
    releaseSpawnLockIfOwned(lockPath, "12345:mine-0");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does NOT delete a lock re-acquired by another owner after a reap", () => {
    // We held "A"; we were reaped and B re-acquired (lock now holds B's token).
    const lockPath = lockWith("99999:ownerB-7");
    releaseSpawnLockIfOwned(lockPath, "12345:ownerA-3");
    // B's lock survives — mutual exclusion preserved.
    expect(existsSync(lockPath)).toBe(true);
  });

  it("is a no-op when the lock is already gone", () => {
    const lockPath = join(tmpdir(), "ao-no-such", "spawn.lock");
    expect(() => releaseSpawnLockIfOwned(lockPath, "12345:x-0")).not.toThrow();
  });
});
