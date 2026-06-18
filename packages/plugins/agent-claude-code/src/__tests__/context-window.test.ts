import { describe, it, expect } from "vitest";
import {
  contextLimitForModel,
  extractContextWindow,
  DEFAULT_CONTEXT_LIMIT_TOKENS,
  MILLION_CONTEXT_LIMIT_TOKENS,
} from "../index.js";

// Mirror the private JsonlLine shape closely enough for the extractor.
type Line = Record<string, unknown>;

function assistant(model: string, usage: Record<string, number>): Line {
  return { type: "assistant", message: { role: "assistant", model, usage } };
}

describe("contextLimitForModel", () => {
  it("maps standard Opus/Sonnet 4.x models to the 200k window", () => {
    expect(contextLimitForModel("claude-opus-4-8")).toBe(DEFAULT_CONTEXT_LIMIT_TOKENS);
    expect(contextLimitForModel("claude-sonnet-4-6")).toBe(DEFAULT_CONTEXT_LIMIT_TOKENS);
  });

  it("maps the [1m] / 1M variants to the 1,000,000 window", () => {
    expect(contextLimitForModel("claude-opus-4-8[1m]")).toBe(MILLION_CONTEXT_LIMIT_TOKENS);
    expect(contextLimitForModel("claude-sonnet-4-6-1m")).toBe(MILLION_CONTEXT_LIMIT_TOKENS);
  });

  it("falls back to the standard window when the model is unknown/undefined", () => {
    expect(contextLimitForModel(undefined)).toBe(DEFAULT_CONTEXT_LIMIT_TOKENS);
    expect(contextLimitForModel("")).toBe(DEFAULT_CONTEXT_LIMIT_TOKENS);
  });
});

describe("extractContextWindow", () => {
  it("uses the LAST usage entry, not a cumulative sum", () => {
    const lines: any[] = [
      assistant("claude-opus-4-8", {
        input_tokens: 10,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 0,
        output_tokens: 100,
      }),
      assistant("claude-opus-4-8", {
        input_tokens: 100,
        cache_read_input_tokens: 40_000,
        cache_creation_input_tokens: 2_000,
        output_tokens: 500,
      }),
    ];

    const ctx = extractContextWindow(lines);
    // 100 + 40000 + 2000 = 42100 (last entry only — earlier 15 is ignored)
    expect(ctx).toEqual({
      usedTokens: 42_100,
      limitTokens: DEFAULT_CONTEXT_LIMIT_TOKENS,
      pct: 42_100 / DEFAULT_CONTEXT_LIMIT_TOKENS,
    });
  });

  it("computes pct against the 1M limit for [1m] models", () => {
    const lines: any[] = [
      assistant("claude-opus-4-8[1m]", {
        input_tokens: 200_000,
        cache_read_input_tokens: 100_000,
        cache_creation_input_tokens: 0,
        output_tokens: 1_000,
      }),
    ];

    const ctx = extractContextWindow(lines);
    expect(ctx?.usedTokens).toBe(300_000);
    expect(ctx?.limitTokens).toBe(MILLION_CONTEXT_LIMIT_TOKENS);
    expect(ctx?.pct).toBeCloseTo(0.3);
  });

  it("skips trailing entries without usage and uses the last one that has it", () => {
    const lines: any[] = [
      assistant("claude-sonnet-4-6", { input_tokens: 1_000, cache_read_input_tokens: 0 }),
      { type: "summary", summary: "done" },
    ];
    const ctx = extractContextWindow(lines);
    expect(ctx?.usedTokens).toBe(1_000);
  });

  it("returns undefined when there is no usage data at all", () => {
    const lines: any[] = [{ type: "user", message: { role: "user", content: "hi" } }];
    expect(extractContextWindow(lines)).toBeUndefined();
    expect(extractContextWindow([])).toBeUndefined();
  });
});
