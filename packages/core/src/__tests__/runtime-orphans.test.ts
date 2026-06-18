import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ORPHAN_GRACE_MS,
  findRuntimeOrphans,
  isAoRuntimeSessionName,
  parsePsResourceOutput,
  reconcileRuntimeOrphans,
} from "../runtime-orphans.js";
import type { Runtime, RuntimeSessionSummary } from "../types.js";

describe("isAoRuntimeSessionName — CRITICAL SAFETY filter", () => {
  it("matches AO worker session names (<prefix>-<number>)", () => {
    expect(isAoRuntimeSessionName("ath-15", ["ath"])).toBe(true);
    expect(isAoRuntimeSessionName("ath-1", ["ath"])).toBe(true);
    expect(isAoRuntimeSessionName("my-app-1000", ["my-app"])).toBe(true);
    expect(isAoRuntimeSessionName("ao-84", ["foo", "ao"])).toBe(true);
  });

  it("NEVER matches human / non-AO-named sessions", () => {
    const prefixes = ["ath", "my-app"];
    for (const human of [
      "work",
      "main",
      "dev-server",
      "scratch",
      "vim",
      "ath", // bare prefix, no number
      "ath-", // dash but no number
      "ath-abc", // non-numeric suffix
      "ath-15-foo", // extra segment
      "xath-15", // different prefix
      "ath-orchestrator", // orchestrator is intentionally NOT reaped
      "ath-orchestrator-2",
      "15", // no prefix
      "my-app", // bare prefix
    ]) {
      expect(isAoRuntimeSessionName(human, prefixes)).toBe(false);
    }
  });

  it("anchors the match so prefixes are not treated as regex", () => {
    // A prefix containing regex metacharacters must be escaped.
    expect(isAoRuntimeSessionName("a.b-1", ["a.b"])).toBe(true);
    expect(isAoRuntimeSessionName("axb-1", ["a.b"])).toBe(false);
  });

  it("ignores empty prefixes", () => {
    expect(isAoRuntimeSessionName("-5", [""])).toBe(false);
  });
});

function summary(id: string, createdAt?: number): RuntimeSessionSummary {
  return { id, createdAt };
}

describe("findRuntimeOrphans", () => {
  const base = {
    sessionPrefixes: ["ath"],
    graceMs: 1000,
    nowMs: 100_000,
  };

  it("flags an AO-named runtime session with no tracked session as orphan", () => {
    const orphans = findRuntimeOrphans({
      ...base,
      liveSessions: [summary("ath-9", 0)],
      activeTrackedIds: new Set(),
    });
    expect(orphans.map((o) => o.id)).toEqual(["ath-9"]);
  });

  it("flags an AO-named runtime session whose tracked session is terminal as orphan", () => {
    // Terminal sessions are excluded from activeTrackedIds by the caller.
    const orphans = findRuntimeOrphans({
      ...base,
      liveSessions: [summary("ath-9", 0)],
      activeTrackedIds: new Set(["ath-1"]), // ath-9 not active → terminal/gone
    });
    expect(orphans.map((o) => o.id)).toEqual(["ath-9"]);
  });

  it("does NOT flag a runtime session with a live (non-terminal) tracked session", () => {
    const orphans = findRuntimeOrphans({
      ...base,
      liveSessions: [summary("ath-9", 0)],
      activeTrackedIds: new Set(["ath-9"]),
    });
    expect(orphans).toEqual([]);
  });

  it("NEVER flags a non-AO-named session even when untracked", () => {
    const orphans = findRuntimeOrphans({
      ...base,
      liveSessions: [summary("my-personal-shell", 0), summary("ath-orchestrator", 0)],
      activeTrackedIds: new Set(),
    });
    expect(orphans).toEqual([]);
  });

  it("spares sessions younger than the grace period (create/race window)", () => {
    const orphans = findRuntimeOrphans({
      ...base,
      liveSessions: [summary("ath-9", 99_500)], // 500ms old < 1000ms grace
      activeTrackedIds: new Set(),
    });
    expect(orphans).toEqual([]);
  });

  it("reaps sessions with unknown createdAt (cannot apply grace)", () => {
    const orphans = findRuntimeOrphans({
      ...base,
      liveSessions: [summary("ath-9", undefined)],
      activeTrackedIds: new Set(),
    });
    expect(orphans.map((o) => o.id)).toEqual(["ath-9"]);
  });
});

function fakeRuntime(name: string, live: RuntimeSessionSummary[]): {
  runtime: Runtime;
  destroyed: string[];
} {
  const destroyed: string[] = [];
  const runtime = {
    name,
    create: vi.fn(),
    destroy: vi.fn(async (handle) => {
      destroyed.push(handle.id);
    }),
    sendMessage: vi.fn(),
    getOutput: vi.fn(),
    isAlive: vi.fn(),
    listSessions: vi.fn(async () => live),
  } as unknown as Runtime;
  return { runtime, destroyed };
}

describe("reconcileRuntimeOrphans", () => {
  it("reaps orphans via runtime.destroy and reports outcomes", async () => {
    const { runtime, destroyed } = fakeRuntime("tmux", [
      { id: "ath-9", createdAt: 0, handleData: { foo: "bar" } },
      { id: "ath-2", createdAt: 0 },
      { id: "human", createdAt: 0 },
    ]);

    const report = await reconcileRuntimeOrphans({
      runtimes: [{ runtime, sessionPrefixes: ["ath"] }],
      activeTrackedIds: new Set(["ath-2"]),
      graceMs: 1000,
      nowMs: 100_000,
      reap: true,
    });

    expect(destroyed).toEqual(["ath-9"]);
    expect(report.orphans.map((o) => o.id)).toEqual(["ath-9"]);
    expect(report.outcomes).toEqual([
      { id: "ath-9", runtimeName: "tmux", reaped: true },
    ]);
  });

  it("passes handleData through to destroy so Windows pty-hosts can be reaped", async () => {
    const destroyArg: Array<Record<string, unknown>> = [];
    const runtime = {
      name: "process",
      destroy: vi.fn(async (handle) => {
        destroyArg.push(handle.data);
      }),
      listSessions: vi.fn(async () => [
        { id: "ath-9", createdAt: 0, handleData: { pipePath: "\\\\.\\pipe\\x", ptyHostPid: 42 } },
      ]),
    } as unknown as Runtime;

    await reconcileRuntimeOrphans({
      runtimes: [{ runtime, sessionPrefixes: ["ath"] }],
      activeTrackedIds: new Set(),
      graceMs: 1000,
      nowMs: 100_000,
      reap: true,
    });

    expect(destroyArg).toEqual([{ pipePath: "\\\\.\\pipe\\x", ptyHostPid: 42 }]);
  });

  it("does not reap when reap is false (report-only)", async () => {
    const { runtime, destroyed } = fakeRuntime("tmux", [{ id: "ath-9", createdAt: 0 }]);
    const report = await reconcileRuntimeOrphans({
      runtimes: [{ runtime, sessionPrefixes: ["ath"] }],
      activeTrackedIds: new Set(),
      graceMs: 1000,
      nowMs: 100_000,
      reap: false,
    });
    expect(destroyed).toEqual([]);
    expect(report.orphans.map((o) => o.id)).toEqual(["ath-9"]);
    expect(report.outcomes).toEqual([]);
  });

  it("records a failed outcome when destroy throws", async () => {
    const runtime = {
      name: "tmux",
      destroy: vi.fn(async () => {
        throw new Error("boom");
      }),
      listSessions: vi.fn(async () => [{ id: "ath-9", createdAt: 0 }]),
    } as unknown as Runtime;

    const report = await reconcileRuntimeOrphans({
      runtimes: [{ runtime, sessionPrefixes: ["ath"] }],
      activeTrackedIds: new Set(),
      graceMs: 1000,
      nowMs: 100_000,
      reap: true,
    });
    expect(report.outcomes).toEqual([
      { id: "ath-9", runtimeName: "tmux", reaped: false, error: "boom" },
    ]);
  });

  it("skips runtimes that do not implement listSessions", async () => {
    const runtime = { name: "noop", destroy: vi.fn() } as unknown as Runtime;
    const report = await reconcileRuntimeOrphans({
      runtimes: [{ runtime, sessionPrefixes: ["ath"] }],
      activeTrackedIds: new Set(),
      nowMs: 100_000,
      reap: true,
    });
    expect(report.orphans).toEqual([]);
    expect(report.liveAoSessions).toEqual([]);
  });

  it("tolerates listSessions throwing (best-effort)", async () => {
    const runtime = {
      name: "tmux",
      destroy: vi.fn(),
      listSessions: vi.fn(async () => {
        throw new Error("tmux down");
      }),
    } as unknown as Runtime;
    const report = await reconcileRuntimeOrphans({
      runtimes: [{ runtime, sessionPrefixes: ["ath"] }],
      activeTrackedIds: new Set(),
      nowMs: 100_000,
      reap: true,
    });
    expect(report.orphans).toEqual([]);
  });

  it("defaults graceMs to DEFAULT_ORPHAN_GRACE_MS", async () => {
    const { runtime, destroyed } = fakeRuntime("tmux", [
      { id: "ath-9", createdAt: 100_000 - (DEFAULT_ORPHAN_GRACE_MS - 1) }, // just inside grace
    ]);
    await reconcileRuntimeOrphans({
      runtimes: [{ runtime, sessionPrefixes: ["ath"] }],
      activeTrackedIds: new Set(),
      nowMs: 100_000,
      reap: true,
    });
    expect(destroyed).toEqual([]);
  });
});

describe("parsePsResourceOutput", () => {
  it("parses pid/rss(KB)/cpu rows into MB-keyed usage", () => {
    const out = "  1234 102400  3.5\n  5678  51200 12.0\n";
    const usage = parsePsResourceOutput(out);
    expect(usage.get(1234)).toEqual({ pid: 1234, rssMb: 100, cpuPercent: 3.5 });
    expect(usage.get(5678)).toEqual({ pid: 5678, rssMb: 50, cpuPercent: 12 });
  });

  it("ignores malformed lines", () => {
    const usage = parsePsResourceOutput("garbage\n\n  9 not-a-number x\n");
    expect(usage.size).toBe(0);
  });
});
